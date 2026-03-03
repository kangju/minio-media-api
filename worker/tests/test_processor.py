"""ワーカーの processor.py に対するテスト。

実際の PostgreSQL・MinIO・CLIP モデルを使用する。
"""

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
from conftest import insert_media, make_test_jpeg, upload_test_image


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
    def _setup_model(self, mock_clip_model):
        """共通 mock_clip_model fixture を autouse で適用する。"""

    def test_success(self, db_engine, minio_client):
        """正常系: CLIP 解析成功で clip_status='done' になること。"""
        key = f"test/{uuid.uuid4()}.jpg"
        upload_test_image(minio_client, key)
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
        upload_test_image(minio_client, key)
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
        upload_test_image(minio_client, key)
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
    def _setup_model(self, mock_clip_model):
        """共通 mock_clip_model fixture を autouse で適用する。"""

    def test_tags_saved_with_empty_db_tags_using_vocab(self, db_engine, minio_client):
        """DB にタグがなくてもデフォルト語彙から CLIP タグが保存されること。"""
        key = f"test/{uuid.uuid4()}.jpg"
        upload_test_image(minio_client, key)
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
        assert tag_count == 1, "語彙から CLIP タグが1件保存されること"


# ---------------------------------------------------------------------------
# TestSaveClipTags
# ---------------------------------------------------------------------------

class TestSaveClipTags:
    """_save_clip_tags(): ON CONFLICT 動作とユーザータグ保護のテスト。"""

    @pytest.fixture(autouse=True)
    def _setup_model(self, mock_clip_model):
        """共通 mock_clip_model fixture を autouse で適用する。"""

    def test_user_source_preserved_on_conflict(self, db_engine, minio_client):
        """ユーザーが手動タグ付け済みのタグを CLIP が解析したとき、
        source='user' が維持され score だけ CLIP 値で更新されること。"""
        key = f"test/{uuid.uuid4()}.jpg"
        upload_test_image(minio_client, key)
        mid = insert_media(db_engine, minio_key=key, clip_status="running")

        # 事前にユーザーが 'cat' をタグ付け
        with db_engine.connect() as conn:
            conn.execute(text("INSERT INTO tags (name, created_at) VALUES ('cat', now()) ON CONFLICT (name) DO NOTHING"))
            tag_id = conn.execute(text("SELECT id FROM tags WHERE name = 'cat'")).scalar()
            conn.execute(
                text("INSERT INTO media_tags (media_id, tag_id, source, score) VALUES (:mid, :tid, 'user', NULL)"),
                {"mid": mid, "tid": tag_id},
            )
            conn.commit()

        # CLIP が同じ 'cat' タグをスコア 0.9 でヒット
        with patch("processor._analyze", return_value=[{"name": "cat", "score": 0.9}]):
            run_clip_task(mid)

        with db_engine.connect() as conn:
            row = conn.execute(
                text("SELECT source, score FROM media_tags WHERE media_id = :mid AND tag_id = :tid"),
                {"mid": mid, "tid": tag_id},
            ).fetchone()

        assert row[0] == "user", "ユーザータグの source は 'user' のままであること"
        assert row[1] == pytest.approx(0.9), "CLIP スコアが score カラムに更新されること"

    def test_new_clip_tag_inserted_when_no_conflict(self, db_engine, minio_client):
        """既存タグがない場合は source='clip' で新規挿入されること。"""
        key = f"test/{uuid.uuid4()}.jpg"
        upload_test_image(minio_client, key)
        mid = insert_media(db_engine, minio_key=key, clip_status="running")

        with patch("processor._analyze", return_value=[{"name": "dog", "score": 0.85}]):
            run_clip_task(mid)

        with db_engine.connect() as conn:
            row = conn.execute(
                text("""
                    SELECT mt.source, mt.score
                    FROM media_tags mt
                    JOIN tags t ON t.id = mt.tag_id
                    WHERE mt.media_id = :mid AND t.name = 'dog'
                """),
                {"mid": mid},
            ).fetchone()

        assert row is not None, "CLIP タグが保存されていること"
        assert row[0] == "clip"
        assert row[1] == pytest.approx(0.85)


# ---------------------------------------------------------------------------
# TestCacheHitSkipAnalyze
# ---------------------------------------------------------------------------

class TestCacheHitSkipAnalyze:
    """同一 file_hash キャッシュヒット時の再解析スキップテスト。"""

    @pytest.fixture(autouse=True)
    def _setup_model(self, mock_clip_model):
        pass

    def test_cache_hit_skips_analyze_and_marks_done(self, db_engine, minio_client):
        """同一 file_hash の done メディアがあれば _analyze を呼ばずに done になること。"""
        shared_hash = "shared_hash_001"
        key_done = f"test/{uuid.uuid4()}.jpg"
        upload_test_image(minio_client, key_done)
        mid_done = insert_media(db_engine, minio_key=key_done,
                                clip_status="done", file_hash=shared_hash)
        with db_engine.connect() as conn:
            conn.execute(text("INSERT INTO tags (name, created_at) VALUES ('cat', now()) ON CONFLICT (name) DO NOTHING"))
            tag_id = conn.execute(text("SELECT id FROM tags WHERE name='cat'")).scalar()
            conn.execute(
                text("INSERT INTO media_tags (media_id, tag_id, source, score) VALUES (:mid, :tid, 'clip', 0.9)"),
                {"mid": mid_done, "tid": tag_id}
            )
            conn.commit()

        key_new = f"test/{uuid.uuid4()}.jpg"
        upload_test_image(minio_client, key_new)
        mid_new = insert_media(db_engine, minio_key=key_new,
                               clip_status="running", file_hash=shared_hash)

        with patch("processor._analyze") as mock_analyze:
            run_clip_task(mid_new)
            mock_analyze.assert_not_called()

        with db_engine.connect() as conn:
            status = conn.execute(
                text("SELECT clip_status FROM media WHERE id=:id"), {"id": mid_new}
            ).scalar()
            tag_count = conn.execute(
                text("SELECT COUNT(*) FROM media_tags WHERE media_id=:mid AND source='clip'"),
                {"mid": mid_new}
            ).scalar()
        assert status == "done"
        assert tag_count == 1

    def test_cache_miss_runs_analyze(self, db_engine, minio_client):
        """同一 file_hash の done メディアがなければ _analyze が呼ばれること。"""
        key = f"test/{uuid.uuid4()}.jpg"
        upload_test_image(minio_client, key)
        mid = insert_media(db_engine, minio_key=key, clip_status="running",
                           file_hash="unique_hash_no_cache")

        with patch("processor._analyze", return_value=[]) as mock_analyze:
            run_clip_task(mid)
            mock_analyze.assert_called_once()

    def test_cache_hit_no_clip_tags_runs_analyze(self, db_engine, minio_client):
        """同一 file_hash の done メディアがあっても clip タグが0件なら _analyze が呼ばれること。
        （done メディアに user タグしかない場合など）"""
        shared_hash = "shared_hash_no_clip"
        key_done = f"test/{uuid.uuid4()}.jpg"
        upload_test_image(minio_client, key_done)
        mid_done = insert_media(db_engine, minio_key=key_done,
                                clip_status="done", file_hash=shared_hash)
        with db_engine.connect() as conn:
            conn.execute(text("INSERT INTO tags (name, created_at) VALUES ('cat', now()) ON CONFLICT (name) DO NOTHING"))
            tag_id = conn.execute(text("SELECT id FROM tags WHERE name='cat'")).scalar()
            conn.execute(
                text("INSERT INTO media_tags (media_id, tag_id, source, score) VALUES (:mid, :tid, 'user', NULL)"),
                {"mid": mid_done, "tid": tag_id}
            )
            conn.commit()

        key_new = f"test/{uuid.uuid4()}.jpg"
        upload_test_image(minio_client, key_new)
        mid_new = insert_media(db_engine, minio_key=key_new,
                               clip_status="running", file_hash=shared_hash)

        with patch("processor._analyze", return_value=[]) as mock_analyze:
            run_clip_task(mid_new)
            mock_analyze.assert_called_once()  # clip タグなし → キャッシュミス → _analyze 呼ばれる

    def test_cache_source_only_uses_clip_tags(self, db_engine, minio_client):
        """キャッシュコピー対象が source='clip' のみで source='user' は含まれないこと。"""
        shared_hash = "shared_hash_002"
        key_done = f"test/{uuid.uuid4()}.jpg"
        upload_test_image(minio_client, key_done)
        mid_done = insert_media(db_engine, minio_key=key_done,
                                clip_status="done", file_hash=shared_hash)
        with db_engine.connect() as conn:
            for name in ("cat", "dog"):
                conn.execute(text("INSERT INTO tags (name, created_at) VALUES (:n, now()) ON CONFLICT (name) DO NOTHING"), {"n": name})
            cat_id = conn.execute(text("SELECT id FROM tags WHERE name='cat'")).scalar()
            dog_id = conn.execute(text("SELECT id FROM tags WHERE name='dog'")).scalar()
            conn.execute(
                text("INSERT INTO media_tags (media_id, tag_id, source, score) VALUES (:mid, :tid, 'clip', 0.9)"),
                {"mid": mid_done, "tid": cat_id}
            )
            conn.execute(
                text("INSERT INTO media_tags (media_id, tag_id, source, score) VALUES (:mid, :tid, 'user', NULL)"),
                {"mid": mid_done, "tid": dog_id}
            )
            conn.commit()

        key_new = f"test/{uuid.uuid4()}.jpg"
        upload_test_image(minio_client, key_new)
        mid_new = insert_media(db_engine, minio_key=key_new,
                               clip_status="running", file_hash=shared_hash)

        with patch("processor._analyze") as mock_analyze:
            run_clip_task(mid_new)
            mock_analyze.assert_not_called()

        with db_engine.connect() as conn:
            rows = conn.execute(
                text("""
                    SELECT t.name FROM media_tags mt
                    JOIN tags t ON t.id = mt.tag_id
                    WHERE mt.media_id = :mid
                """),
                {"mid": mid_new}
            ).fetchall()
        names = {r[0] for r in rows}
        assert "cat" in names      # clip タグはコピーされる
        assert "dog" not in names  # user タグはコピーされない

    def test_cache_does_not_use_own_hash(self, db_engine, minio_client):
        """自分自身の file_hash はキャッシュ候補に含まれないこと（exclude_media_id 確認）。"""
        key = f"test/{uuid.uuid4()}.jpg"
        upload_test_image(minio_client, key)
        mid = insert_media(db_engine, minio_key=key,
                           clip_status="running", file_hash="self_ref_hash_003")

        with patch("processor._analyze", return_value=[]) as mock_analyze:
            run_clip_task(mid)
            mock_analyze.assert_called_once()  # キャッシュミス → _analyze 呼ばれる

    def test_cache_save_error_sets_status_error(self, db_engine, minio_client):
        """キャッシュヒット時に _save_clip_tags が例外を投げたら clip_status='error' になること。"""
        shared_hash = "shared_hash_004"
        key_done = f"test/{uuid.uuid4()}.jpg"
        upload_test_image(minio_client, key_done)
        mid_done = insert_media(db_engine, minio_key=key_done,
                                clip_status="done", file_hash=shared_hash)
        with db_engine.connect() as conn:
            conn.execute(text("INSERT INTO tags (name, created_at) VALUES ('cat', now()) ON CONFLICT (name) DO NOTHING"))
            tag_id = conn.execute(text("SELECT id FROM tags WHERE name='cat'")).scalar()
            conn.execute(
                text("INSERT INTO media_tags (media_id, tag_id, source, score) VALUES (:mid, :tid, 'clip', 0.9)"),
                {"mid": mid_done, "tid": tag_id}
            )
            conn.commit()

        key_new = f"test/{uuid.uuid4()}.jpg"
        upload_test_image(minio_client, key_new)
        mid_new = insert_media(db_engine, minio_key=key_new,
                               clip_status="running", file_hash=shared_hash)

        with patch("processor._save_clip_tags", side_effect=RuntimeError("DB error")):
            run_clip_task(mid_new)

        with db_engine.connect() as conn:
            row = conn.execute(
                text("SELECT clip_status, error_detail FROM media WHERE id=:id"),
                {"id": mid_new}
            ).fetchone()
        assert row[0] == "error"
        assert row[1] is not None


# ---------------------------------------------------------------------------
# TestErrorDetailClear
# ---------------------------------------------------------------------------

class TestErrorDetailClear:
    """再試行成功・pending 遷移時に error_detail がクリアされることを確認するテスト。"""

    @pytest.fixture(autouse=True)
    def _setup_model(self, mock_clip_model):
        pass

    def _set_error_detail(self, db_engine, media_id: int, detail: str) -> None:
        """テスト用に error_detail を直接セットするヘルパー。"""
        with db_engine.connect() as conn:
            conn.execute(
                text("UPDATE media SET error_detail = :d WHERE id = :id"),
                {"d": detail, "id": media_id},
            )
            conn.commit()

    def test_error_detail_cleared_on_retry_success(self, db_engine, minio_client):
        """失敗後に CLIP 解析が成功したとき error_detail が NULL になること。"""
        key = f"test/{uuid.uuid4()}.jpg"
        upload_test_image(minio_client, key)
        mid = insert_media(db_engine, minio_key=key, clip_status="running")
        self._set_error_detail(db_engine, mid, "RuntimeError: previous failure")

        with db_engine.connect() as conn:
            conn.execute(text("INSERT INTO tags (name, created_at) VALUES ('cat', now()) ON CONFLICT (name) DO NOTHING"))
            conn.commit()

        with patch("processor._analyze", return_value=[{"name": "cat", "score": 0.9}]):
            run_clip_task(mid)

        with db_engine.connect() as conn:
            row = conn.execute(
                text("SELECT clip_status, error_detail FROM media WHERE id = :id"),
                {"id": mid},
            ).fetchone()
        assert row[0] == "done"
        assert row[1] is None, "成功後は error_detail が NULL であること"

    def test_error_detail_cleared_on_pending_retry(self, db_engine, minio_client):
        """CLIP エラー（リトライ上限未満）で pending になるとき error_detail が NULL になること。"""
        key = f"test/{uuid.uuid4()}.jpg"
        upload_test_image(minio_client, key)
        mid = insert_media(db_engine, minio_key=key, clip_status="running", retry_count=0)
        self._set_error_detail(db_engine, mid, "RuntimeError: previous failure")

        with patch("processor._analyze", side_effect=RuntimeError("CLIP error")):
            run_clip_task(mid)

        with db_engine.connect() as conn:
            row = conn.execute(
                text("SELECT clip_status, retry_count, error_detail FROM media WHERE id = :id"),
                {"id": mid},
            ).fetchone()
        assert row[0] == "pending"
        assert row[1] == 1
        assert row[2] is None, "pending 遷移後は error_detail が NULL であること"

    def test_error_detail_cleared_on_minio_error_pending(self, db_engine):
        """MinIO エラーで pending になるとき error_detail が NULL になること。"""
        mid = insert_media(db_engine, minio_key="nonexistent/key.jpg",
                           clip_status="running", retry_count=0)
        self._set_error_detail(db_engine, mid, "RuntimeError: previous failure")

        run_clip_task(mid)

        with db_engine.connect() as conn:
            row = conn.execute(
                text("SELECT clip_status, retry_count, error_detail FROM media WHERE id = :id"),
                {"id": mid},
            ).fetchone()
        assert row[0] == "pending"
        assert row[1] == 1
        assert row[2] is None, "MinIO エラー後の pending 遷移でも error_detail が NULL であること"

    def test_error_detail_preserved_on_error(self, db_engine, minio_client):
        """リトライ上限到達でエラー確定のとき error_detail が設定されること（既存挙動確認）。"""
        from config import settings
        key = f"test/{uuid.uuid4()}.jpg"
        upload_test_image(minio_client, key)
        mid = insert_media(db_engine, minio_key=key, clip_status="running",
                           retry_count=settings.clip_max_retry - 1)

        with patch("processor._analyze", side_effect=RuntimeError("CLIP fatal")):
            run_clip_task(mid)

        with db_engine.connect() as conn:
            row = conn.execute(
                text("SELECT clip_status, error_detail FROM media WHERE id = :id"),
                {"id": mid},
            ).fetchone()
        assert row[0] == "error"
        assert row[1] is not None, "error 確定時は error_detail が残ること"

    def test_error_detail_cleared_on_cache_hit_success(self, db_engine, minio_client):
        """キャッシュヒットで done になるとき error_detail が NULL になること。"""
        shared_hash = "shared_hash_clear_error"
        key_done = f"test/{uuid.uuid4()}.jpg"
        upload_test_image(minio_client, key_done)
        mid_done = insert_media(db_engine, minio_key=key_done,
                                clip_status="done", file_hash=shared_hash)
        with db_engine.connect() as conn:
            conn.execute(text("INSERT INTO tags (name, created_at) VALUES ('cat', now()) ON CONFLICT (name) DO NOTHING"))
            tag_id = conn.execute(text("SELECT id FROM tags WHERE name='cat'")).scalar()
            conn.execute(
                text("INSERT INTO media_tags (media_id, tag_id, source, score) VALUES (:mid, :tid, 'clip', 0.9)"),
                {"mid": mid_done, "tid": tag_id},
            )
            conn.commit()

        key_new = f"test/{uuid.uuid4()}.jpg"
        upload_test_image(minio_client, key_new)
        mid_new = insert_media(db_engine, minio_key=key_new,
                               clip_status="running", file_hash=shared_hash)
        self._set_error_detail(db_engine, mid_new, "RuntimeError: previous failure")

        with patch("processor._analyze") as mock_analyze:
            run_clip_task(mid_new)
            mock_analyze.assert_not_called()

        with db_engine.connect() as conn:
            row = conn.execute(
                text("SELECT clip_status, error_detail FROM media WHERE id = :id"),
                {"id": mid_new},
            ).fetchone()
        assert row[0] == "done"
        assert row[1] is None, "キャッシュヒット成功後も error_detail が NULL であること"
