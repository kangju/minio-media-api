"""ワーカーの processor.py に対するテスト。

実際の PostgreSQL・MinIO・CLIP モデルを使用する。
"""

import io
import uuid
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import text

from processor import (
    _get_all_tag_names,
    _get_media_info,
    claim_pending,
    reset_running,
    run_clip_task,
)
from conftest import insert_media, make_test_jpeg


# ---------------------------------------------------------------------------
# TestResetRunning
# ---------------------------------------------------------------------------

class TestResetRunning:
    """reset_running(): running → pending リセットのテスト。"""

    def test_running_to_pending(self, db_engine):
        """clip_status='running' のレコードが 'pending' になること。"""
        insert_media(db_engine, minio_key="key1.jpg", clip_status="running")
        insert_media(db_engine, minio_key="key2.jpg", clip_status="running")
        insert_media(db_engine, minio_key="key3.jpg", clip_status="done")  # 変わらない

        count = reset_running()

        assert count == 2
        with db_engine.connect() as conn:
            rows = conn.execute(
                text("SELECT clip_status FROM media ORDER BY id")
            ).fetchall()
        statuses = [r[0] for r in rows]
        assert statuses.count("pending") == 2
        assert statuses.count("done") == 1
        assert "running" not in statuses

    def test_no_running_returns_zero(self, db_engine):
        """running がない場合は 0 を返すこと。"""
        insert_media(db_engine, minio_key="key1.jpg", clip_status="done")
        count = reset_running()
        assert count == 0


# ---------------------------------------------------------------------------
# TestClaimPending
# ---------------------------------------------------------------------------

class TestClaimPending:
    """claim_pending(): pending → running 遷移のテスト。"""

    def test_claim_returns_ids(self, db_engine):
        """pending なメディアの ID リストが返ること。"""
        mid1 = insert_media(db_engine, minio_key="key1.jpg", clip_status="pending")
        mid2 = insert_media(db_engine, minio_key="key2.jpg", clip_status="pending")

        ids = claim_pending(limit=10)

        assert set(ids) == {mid1, mid2}

    def test_claim_updates_status_to_running(self, db_engine):
        """claim 後に clip_status が 'running' になること。"""
        mid = insert_media(db_engine, minio_key="key1.jpg", clip_status="pending")
        claim_pending(limit=10)

        with db_engine.connect() as conn:
            row = conn.execute(
                text("SELECT clip_status FROM media WHERE id = :id"), {"id": mid}
            ).fetchone()
        assert row[0] == "running"

    def test_claim_respects_limit(self, db_engine):
        """limit を超えたレコードは取得しないこと。"""
        for i in range(5):
            insert_media(db_engine, minio_key=f"key{i}.jpg", clip_status="pending")

        ids = claim_pending(limit=3)
        assert len(ids) == 3

    def test_done_records_not_claimed(self, db_engine):
        """clip_status='done' のレコードは取得しないこと。"""
        insert_media(db_engine, minio_key="key1.jpg", clip_status="done")
        ids = claim_pending(limit=10)
        assert len(ids) == 0

    def test_max_retry_exceeded_not_claimed(self, db_engine):
        """retry_count >= max_retry のレコードは取得しないこと。"""
        from config import settings
        insert_media(db_engine, minio_key="key1.jpg", clip_status="pending",
                     retry_count=settings.clip_max_retry)
        ids = claim_pending(limit=10)
        assert len(ids) == 0

    def test_no_minio_key_not_claimed(self, db_engine):
        """minio_key が NULL のレコードは取得しないこと。"""
        insert_media(db_engine, minio_key=None, clip_status="pending")
        ids = claim_pending(limit=10)
        assert len(ids) == 0


# ---------------------------------------------------------------------------
# TestRunClipTask
# ---------------------------------------------------------------------------

class TestRunClipTask:
    """run_clip_task(): CLIP タスク実行フローのテスト。"""

    @pytest.fixture(autouse=True)
    def _setup_model(self):
        """テスト用のモック CLIP モデルをセットアップ。"""
        import processor
        # モデルがロード済みのふりをする
        processor._model = MagicMock()
        processor._tokenizer = MagicMock(return_value=MagicMock())
        processor._preprocess = MagicMock(
            return_value=MagicMock(unsqueeze=lambda x: MagicMock())
        )
        yield
        processor._model = None
        processor._tokenizer = None
        processor._preprocess = None

    def _upload_test_image(self, minio_client, key: str) -> str:
        """MinIO にテスト画像をアップロードして key を返す。"""
        jpeg = make_test_jpeg()
        minio_client.put_object(
            "media", key, io.BytesIO(jpeg), length=len(jpeg),
            content_type="image/jpeg"
        )
        return key

    def test_success(self, db_engine, minio_client):
        """正常系: CLIP 解析成功で clip_status='done' になること。"""
        key = f"test/{uuid.uuid4()}.jpg"
        self._upload_test_image(minio_client, key)
        mid = insert_media(db_engine, minio_key=key, clip_status="running")

        # タグを1件 DB に入れておく
        with db_engine.connect() as conn:
            conn.execute(text("INSERT INTO tags (name, created_at) VALUES ('cat', now())"))
            conn.commit()

        with patch("processor._analyze", return_value=[{"name": "cat", "score": 0.9}]):
            run_clip_task(mid)

        with db_engine.connect() as conn:
            row = conn.execute(
                text("SELECT clip_status FROM media WHERE id = :id"), {"id": mid}
            ).fetchone()
        assert row[0] == "done"

    def test_minio_error_increments_retry(self, db_engine):
        """MinIO 取得失敗で retry_count が増加し pending に戻ること。"""
        mid = insert_media(db_engine, minio_key="nonexistent/key.jpg",
                           clip_status="running", retry_count=0)

        run_clip_task(mid)

        with db_engine.connect() as conn:
            row = conn.execute(
                text("SELECT clip_status, retry_count FROM media WHERE id = :id"),
                {"id": mid}
            ).fetchone()
        assert row[0] == "pending"
        assert row[1] == 1

    def test_minio_error_at_max_retry_sets_error(self, db_engine):
        """MinIO 失敗がリトライ上限に達すると clip_status='error' になること。"""
        from config import settings
        mid = insert_media(db_engine, minio_key="nonexistent/key.jpg",
                           clip_status="running",
                           retry_count=settings.clip_max_retry - 1)

        run_clip_task(mid)

        with db_engine.connect() as conn:
            row = conn.execute(
                text("SELECT clip_status, retry_count, error_detail FROM media WHERE id = :id"),
                {"id": mid}
            ).fetchone()
        assert row[0] == "error"
        assert row[1] == settings.clip_max_retry
        assert row[2] is not None  # error_detail が保存されていること

    def test_clip_error_increments_retry(self, db_engine, minio_client):
        """CLIP 推論エラーで retry_count が増加し pending に戻ること。"""
        key = f"test/{uuid.uuid4()}.jpg"
        self._upload_test_image(minio_client, key)
        mid = insert_media(db_engine, minio_key=key, clip_status="running", retry_count=0)

        with patch("processor._analyze", side_effect=RuntimeError("CLIP error")):
            run_clip_task(mid)

        with db_engine.connect() as conn:
            row = conn.execute(
                text("SELECT clip_status, retry_count FROM media WHERE id = :id"),
                {"id": mid}
            ).fetchone()
        assert row[0] == "pending"
        assert row[1] == 1

    def test_unknown_media_id_is_skipped(self, db_engine):
        """存在しない media_id は何もしないこと。"""
        run_clip_task(999999)  # 例外が発生しないこと

    def test_tags_saved_on_success(self, db_engine, minio_client):
        """成功時に CLIP タグが保存されること。"""
        key = f"test/{uuid.uuid4()}.jpg"
        self._upload_test_image(minio_client, key)
        mid = insert_media(db_engine, minio_key=key, clip_status="running")

        with db_engine.connect() as conn:
            conn.execute(text("INSERT INTO tags (name, created_at) VALUES ('dog', now())"))
            conn.commit()

        with patch("processor._analyze", return_value=[{"name": "dog", "score": 0.85}]):
            run_clip_task(mid)

        with db_engine.connect() as conn:
            count = conn.execute(
                text("""
                    SELECT COUNT(*) FROM media_tags mt
                    JOIN tags t ON t.id = mt.tag_id
                    WHERE mt.media_id = :mid AND mt.source = 'clip' AND t.name = 'dog'
                """),
                {"mid": mid}
            ).scalar()
        assert count == 1


# ---------------------------------------------------------------------------
# TestGetAllTagNames
# ---------------------------------------------------------------------------

class TestGetAllTagNames:
    """_get_all_tag_names(): DB + デフォルト語彙マージのテスト。"""

    def test_returns_vocab_when_db_empty(self, db_engine):
        """DB にタグがない場合でもデフォルト語彙が返ること（Issue #4 主要修正）。"""
        names = _get_all_tag_names()
        assert len(names) > 0, "DB が空でもデフォルト語彙が返ること"

    def test_includes_db_tags(self, db_engine):
        """DB に登録したカスタムタグが候補に含まれること。"""
        with db_engine.connect() as conn:
            conn.execute(
                text("INSERT INTO tags (name, created_at) VALUES ('my_custom_tag_xyz', now())")
            )
            conn.commit()
        names = _get_all_tag_names()
        assert "my_custom_tag_xyz" in names

    def test_no_duplicates(self, db_engine):
        """DB タグと語彙に重複があっても候補は重複なしであること。"""
        # 語彙ファイルに存在するタグ "cat" を DB にも入れる
        with db_engine.connect() as conn:
            conn.execute(
                text("INSERT INTO tags (name, created_at) VALUES ('cat', now()) ON CONFLICT (name) DO NOTHING")
            )
            conn.commit()
        names = _get_all_tag_names()
        assert names.count("cat") == 1


# ---------------------------------------------------------------------------
# TestRunClipTask (追加: Issue #4 修正確認)
# ---------------------------------------------------------------------------

class TestRunClipTaskVocabFix:
    """Issue #4 修正: DB タグ空でも語彙経由でタグが保存されること。"""

    @pytest.fixture(autouse=True)
    def _setup_model(self):
        import processor
        processor._model = MagicMock()
        processor._tokenizer = MagicMock(return_value=MagicMock())
        processor._preprocess = MagicMock(
            return_value=MagicMock(unsqueeze=lambda x: MagicMock())
        )
        yield
        processor._model = None
        processor._tokenizer = None
        processor._preprocess = None

    def _upload_test_image(self, minio_client, key: str) -> str:
        jpeg = make_test_jpeg()
        minio_client.put_object(
            "media", key, io.BytesIO(jpeg), length=len(jpeg),
            content_type="image/jpeg"
        )
        return key

    def test_tags_saved_with_empty_db_tags_using_vocab(self, db_engine, minio_client):
        """DB にタグがなくてもデフォルト語彙から CLIP タグが保存されること。"""
        key = f"test/{uuid.uuid4()}.jpg"
        self._upload_test_image(minio_client, key)
        mid = insert_media(db_engine, minio_key=key, clip_status="running")

        # DB のタグは空のまま実行（語彙ファイルの "cat" がヒット）
        with patch("processor._analyze", return_value=[{"name": "cat", "score": 0.88}]):
            run_clip_task(mid)

        with db_engine.connect() as conn:
            status = conn.execute(
                text("SELECT clip_status FROM media WHERE id = :id"), {"id": mid}
            ).scalar()
            tag_count = conn.execute(
                text("""
                    SELECT COUNT(*) FROM media_tags mt
                    JOIN tags t ON t.id = mt.tag_id
                    WHERE mt.media_id = :mid AND mt.source = 'clip'
                """),
                {"mid": mid},
            ).scalar()
        assert status == "done"
        assert tag_count == 1, "語彙から CLIP タグが1件以上保存されること"
