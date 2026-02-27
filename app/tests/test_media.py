"""メディアエンドポイントのテストモジュール。

/media エンドポイントのすべてのケースをテストする。
実際の Docker サービス（PostgreSQL・MinIO・CLIP）を使用する。
"""

import io

import pytest

from tests.conftest import MINIMAL_JPEG, MINIMAL_JPEG_2, MINIMAL_MP4, make_upload_file


class TestPostMedia:
    """POST /media エンドポイントのテスト。"""

    def test_upload_image_success(self, client):
        """ケース1: 画像アップロードが成功し MinIO 保存・DB レコードが作成される。"""
        response = client.post(
            "/media",
            files=[make_upload_file(MINIMAL_JPEG, "photo.jpg", "image/jpeg")],
            data={"tags": ["cat"]},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["original_filename"] == "photo.jpg"
        assert data["media_type"] == "image"
        assert data["minio_key"].startswith("images/")
        # ファイルが MinIO に実際に保存されていることを GET /file で確認
        media_id = data["id"]
        r_file = client.get(f"/media/{media_id}/file")
        assert r_file.status_code == 200
        assert len(r_file.content) > 0

    def test_upload_video_success(self, client):
        """ケース2: 動画アップロードが成功し CLIP タグは付与されない。"""
        response = client.post(
            "/media",
            files=[make_upload_file(MINIMAL_MP4, "video.mp4", "video/mp4")],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["media_type"] == "video"
        assert data["minio_key"].startswith("videos/")
        clip_tags = [t for t in data["tags"] if t["source"] == "clip"]
        assert len(clip_tags) == 0

    def test_tags_saved_correctly(self, client):
        """ケース3: ユーザー指定タグが正しく保存される。"""
        response = client.post(
            "/media",
            files=[make_upload_file(MINIMAL_JPEG, "img.jpg", "image/jpeg")],
            data={"tags": ["dog", "outdoor"]},
        )
        assert response.status_code == 201
        data = response.json()
        user_tags = [t["name"] for t in data["tags"] if t["source"] == "user"]
        assert "dog" in user_tags
        assert "outdoor" in user_tags

    def test_upload_no_tags(self, client):
        """ケース4: タグなしでアップロードが成功する。"""
        response = client.post(
            "/media",
            files=[make_upload_file(MINIMAL_JPEG, "img.jpg", "image/jpeg")],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["id"] is not None

    def test_duplicate_file_reuses_minio_key(self, client):
        """ケース5: 同一ファイルを2回アップロードすると MinIO キーが再利用される。"""
        files = [make_upload_file(MINIMAL_JPEG, "dup.jpg", "image/jpeg")]
        r1 = client.post("/media", files=files)
        assert r1.status_code == 201

        files = [make_upload_file(MINIMAL_JPEG, "dup.jpg", "image/jpeg")]
        r2 = client.post("/media", files=files)
        assert r2.status_code == 201

        assert r1.json()["minio_key"] == r2.json()["minio_key"]
        assert r1.json()["id"] != r2.json()["id"]

    def test_same_tag_name_creates_one_tag(self, client):
        """ケース6: 同一タグ名を2回指定しても1つのタグのみ作成される。"""
        r1 = client.post(
            "/media",
            files=[make_upload_file(MINIMAL_JPEG, "a.jpg", "image/jpeg")],
            data={"tags": ["unique_tag_xyz"]},
        )
        r2 = client.post(
            "/media",
            files=[make_upload_file(MINIMAL_JPEG_2, "b.jpg", "image/jpeg")],
            data={"tags": ["unique_tag_xyz"]},
        )
        assert r1.status_code == 201
        assert r2.status_code == 201
        tags1 = [t for t in r1.json()["tags"] if t["name"] == "unique_tag_xyz"]
        tags2 = [t for t in r2.json()["tags"] if t["name"] == "unique_tag_xyz"]
        assert len(tags1) == 1
        assert len(tags2) == 1
        assert tags1[0]["id"] == tags2[0]["id"]

    def test_multiple_user_tags_saved(self, client):
        """ケース7: 複数ユーザータグが保存される。"""
        response = client.post(
            "/media",
            files=[make_upload_file(MINIMAL_JPEG, "multi.jpg", "image/jpeg")],
            data={"tags": ["tag1", "tag2", "tag3"]},
        )
        assert response.status_code == 201
        user_tags = [t["name"] for t in response.json()["tags"] if t["source"] == "user"]
        assert set(["tag1", "tag2", "tag3"]).issubset(set(user_tags))

    def test_invalid_mime_type_422(self, client):
        """ケース8: 不正な MIME タイプ（PDF）は 422 エラーになる。"""
        response = client.post(
            "/media",
            files=[make_upload_file(b"%PDF-1.4", "doc.pdf", "application/pdf")],
        )
        assert response.status_code == 422

    def test_mime_extension_mismatch_422(self, client):
        """ケース9: MIME タイプと拡張子が一致しない場合は 422 エラーになる。"""
        response = client.post(
            "/media",
            files=[make_upload_file(MINIMAL_JPEG, "image.png", "image/jpeg")],
        )
        assert response.status_code == 422

    def test_file_too_large_422(self, client):
        """ケース10: ファイルサイズ超過は 422 エラーになる。"""
        from unittest.mock import patch
        large_data = b"x" * (1 * 1024 * 1024 + 1)
        with patch("routers.media.settings") as mock_settings:
            mock_settings.max_file_size_mb = 1
            mock_settings.clip_top_k = 10
            mock_settings.clip_score_threshold = 0.2
            mock_settings.pagination_default_limit = 30
            mock_settings.pagination_max_limit = 100
            response = client.post(
                "/media",
                files=[("file", ("big.jpg", io.BytesIO(large_data), "image/jpeg"))],
            )
        assert response.status_code == 422

    def test_no_file_422(self, client):
        """ケース11: ファイルなしは 422 エラーになる。"""
        response = client.post("/media")
        assert response.status_code == 422

    def test_empty_tag_name_422(self, client):
        """ケース12: 空のタグ名は 422 エラーになる。"""
        response = client.post(
            "/media",
            files=[make_upload_file(MINIMAL_JPEG, "img.jpg", "image/jpeg")],
            data={"tags": [""]},
        )
        assert response.status_code == 422


class TestFileIntegrity:
    """アップロードとダウンロードのファイル一致テスト。

    送信したバイト列とダウンロードしたバイト列が完全に一致することを検証する。
    """

    def test_image_upload_download_identical(self, client):
        """画像: アップロードしたバイト列とダウンロードしたバイト列が完全に一致する。"""
        r_upload = client.post(
            "/media",
            files=[make_upload_file(MINIMAL_JPEG, "integrity_test.jpg", "image/jpeg")],
        )
        assert r_upload.status_code == 201
        media_id = r_upload.json()["id"]

        r_download = client.get(f"/media/{media_id}/file")
        assert r_download.status_code == 200
        assert r_download.content == MINIMAL_JPEG, (
            "ダウンロードした画像バイト列がアップロード時と一致しません"
        )

    def test_video_upload_download_identical(self, client):
        """動画: アップロードしたバイト列とダウンロードしたバイト列が完全に一致する。"""
        r_upload = client.post(
            "/media",
            files=[make_upload_file(MINIMAL_MP4, "integrity_test.mp4", "video/mp4")],
        )
        assert r_upload.status_code == 201
        media_id = r_upload.json()["id"]

        r_download = client.get(f"/media/{media_id}/file")
        assert r_download.status_code == 200
        assert r_download.content == MINIMAL_MP4, (
            "ダウンロードした動画バイト列がアップロード時と一致しません"
        )

    def test_image_duplicate_upload_both_downloadable(self, client):
        """同一ファイルを2回アップロードした場合、両方とも正しくダウンロードできる。"""
        r1 = client.post(
            "/media",
            files=[make_upload_file(MINIMAL_JPEG, "dup1.jpg", "image/jpeg")],
        )
        r2 = client.post(
            "/media",
            files=[make_upload_file(MINIMAL_JPEG, "dup2.jpg", "image/jpeg")],
        )
        assert r1.status_code == 201
        assert r2.status_code == 201
        # 両レコードで同じ minio_key を参照しているが、どちらからもダウンロードできる
        r_dl1 = client.get(f"/media/{r1.json()['id']}/file")
        r_dl2 = client.get(f"/media/{r2.json()['id']}/file")
        assert r_dl1.status_code == 200
        assert r_dl2.status_code == 200
        assert r_dl1.content == MINIMAL_JPEG
        assert r_dl2.content == MINIMAL_JPEG

    def test_large_image_upload_download_identical(self, client):
        """サイズの大きな画像もバイト列が一致する（ランダムバイト列 + JPEG ヘッダー）。"""
        # 50KB のダミー画像データ（先頭に JPEG マジックバイトを付加）
        large_image = MINIMAL_JPEG + b"\x00" * (50 * 1024)
        r_upload = client.post(
            "/media",
            files=[("file", ("large.jpg", io.BytesIO(large_image), "image/jpeg"))],
        )
        assert r_upload.status_code == 201
        media_id = r_upload.json()["id"]

        r_download = client.get(f"/media/{media_id}/file")
        assert r_download.status_code == 200
        assert r_download.content == large_image, (
            "大きな画像ファイルのバイト列が一致しません"
        )


class TestGetMediaList:
    """GET /media エンドポイントのテスト。"""

    @pytest.fixture(autouse=True)
    def setup_media(self, client):
        """テスト用メディアを事前に作成する。"""
        self.image1 = client.post(
            "/media",
            files=[make_upload_file(MINIMAL_JPEG, "img1.jpg", "image/jpeg")],
            data={"tags": ["cat", "indoor"]},
        ).json()
        self.image2 = client.post(
            "/media",
            files=[make_upload_file(MINIMAL_JPEG_2, "img2.jpg", "image/jpeg")],
            data={"tags": ["dog", "outdoor"]},
        ).json()
        self.video1 = client.post(
            "/media",
            files=[make_upload_file(MINIMAL_MP4, "vid1.mp4", "video/mp4")],
            data={"tags": ["cat"]},
        ).json()

    def test_list_all(self, client):
        """ケース1: フィルタなしで全件取得できる。"""
        r = client.get("/media")
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 3
        assert "items" in data
        assert "offset" in data
        assert "limit" in data

    def test_filter_by_tag(self, client):
        """ケース2: タグでフィルタリングできる。"""
        r = client.get("/media?tag=cat")
        assert r.status_code == 200
        data = r.json()
        for item in data["items"]:
            tag_names = [t["name"] for t in item["tags"]]
            assert "cat" in tag_names

    def test_filter_by_multiple_tags_and(self, client):
        """ケース3: 複数タグは AND 条件でフィルタリングできる。"""
        r = client.get("/media?tag=dog&tag=outdoor")
        assert r.status_code == 200
        data = r.json()
        for item in data["items"]:
            tag_names = [t["name"] for t in item["tags"]]
            assert "dog" in tag_names
            assert "outdoor" in tag_names

    def test_filter_by_media_type_image(self, client):
        """ケース4: media_type=image でフィルタリングできる。"""
        r = client.get("/media?media_type=image")
        assert r.status_code == 200
        for item in r.json()["items"]:
            assert item["media_type"] == "image"

    def test_filter_by_media_type_video(self, client):
        """ケース5: media_type=video でフィルタリングできる。"""
        r = client.get("/media?media_type=video")
        assert r.status_code == 200
        for item in r.json()["items"]:
            assert item["media_type"] == "video"

    def test_include_deleted_false(self, client):
        """ケース6: include_deleted=false で削除済みを除外できる。"""
        client.delete(f"/media/{self.image1['id']}")
        r = client.get("/media?include_deleted=false")
        assert r.status_code == 200
        ids = [item["id"] for item in r.json()["items"]]
        assert self.image1["id"] not in ids

    def test_include_deleted_true(self, client):
        """ケース7: include_deleted=true で削除済みを含められる。"""
        client.delete(f"/media/{self.image1['id']}")
        r = client.get("/media?include_deleted=true")
        assert r.status_code == 200
        ids = [item["id"] for item in r.json()["items"]]
        assert self.image1["id"] in ids

    def test_pagination_offset(self, client):
        """ケース8: offset によるページネーションが機能する。"""
        r_all = client.get("/media?offset=0&limit=100")
        total = r_all.json()["total"]
        if total > 1:
            r_offset = client.get("/media?offset=1&limit=100")
            assert len(r_offset.json()["items"]) == total - 1

    def test_pagination_limit(self, client):
        """ケース9: limit によるページネーションが機能する。"""
        r = client.get("/media?limit=1")
        assert r.status_code == 200
        assert len(r.json()["items"]) <= 1

    def test_limit_capped_at_max(self, client):
        """ケース10: limit が最大値を超えた場合に上限に制限される。"""
        r = client.get("/media?limit=99999")
        assert r.status_code == 200
        assert r.json()["limit"] <= 100

    def test_default_limit(self, client):
        """ケース11: limit 未指定時はデフォルト値が使用される。"""
        r = client.get("/media")
        assert r.status_code == 200
        assert r.json()["limit"] == 30

    def test_filter_by_nonexistent_tag(self, client):
        """ケース12: 存在しないタグでフィルタリングすると空リストが返る。"""
        r = client.get("/media?tag=nonexistent_tag_zzz")
        assert r.status_code == 200
        assert r.json()["total"] == 0

    def test_created_from_filter(self, client):
        """ケース13: created_from でフィルタリングできる。"""
        r = client.get("/media?created_from=2000-01-01T00:00:00")
        assert r.status_code == 200
        assert r.json()["total"] >= 3

    def test_created_to_filter(self, client):
        """ケース14: created_to でフィルタリングできる。"""
        r = client.get("/media?created_to=2000-01-01T00:00:00")
        assert r.status_code == 200
        assert r.json()["total"] == 0

    def test_offset_and_limit_combined(self, client):
        """ケース15: offset と limit の組み合わせが機能する。"""
        r = client.get("/media?offset=0&limit=2")
        assert r.status_code == 200
        assert len(r.json()["items"]) <= 2

    def test_response_structure(self, client):
        """ケース16: レスポンス構造が正しい。"""
        r = client.get("/media")
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert "total" in data
        assert "offset" in data
        assert "limit" in data

    def test_empty_result(self, client):
        """ケース17: 条件に一致しない場合は空リストが返る。"""
        r = client.get("/media?media_type=image&tag=nonexistent_xyz_tag")
        assert r.status_code == 200
        assert r.json()["items"] == []


class TestGetMediaById:
    """GET /media/{id} エンドポイントのテスト。"""

    @pytest.fixture(autouse=True)
    def setup(self, client):
        """テスト用メディアを作成する。"""
        r = client.post(
            "/media",
            files=[make_upload_file(MINIMAL_JPEG, "img.jpg", "image/jpeg")],
        )
        self.media_id = r.json()["id"]

    def test_get_existing_media(self, client):
        """ケース1: 存在するメディアを取得できる。"""
        r = client.get(f"/media/{self.media_id}")
        assert r.status_code == 200
        assert r.json()["id"] == self.media_id

    def test_get_nonexistent_media_404(self, client):
        """ケース2: 存在しないメディアは 404 になる。"""
        r = client.get("/media/999999")
        assert r.status_code == 404

    def test_get_deleted_media_404(self, client):
        """ケース3: 削除済みメディアは 404 になる。"""
        client.delete(f"/media/{self.media_id}")
        r = client.get(f"/media/{self.media_id}")
        assert r.status_code == 404

    def test_response_has_tags(self, client):
        """ケース4: レスポンスに tags フィールドが含まれる。"""
        r = client.get(f"/media/{self.media_id}")
        assert r.status_code == 200
        assert "tags" in r.json()

    def test_response_fields(self, client):
        """ケース5: レスポンスに必要なフィールドがすべて含まれる。"""
        r = client.get(f"/media/{self.media_id}")
        data = r.json()
        assert "id" in data
        assert "original_filename" in data
        assert "minio_key" in data
        assert "media_type" in data
        assert "created_at" in data


class TestGetMediaFile:
    """GET /media/{id}/file エンドポイントのテスト。"""

    @pytest.fixture(autouse=True)
    def setup(self, client):
        """テスト用メディアを作成する。"""
        r = client.post(
            "/media",
            files=[make_upload_file(MINIMAL_JPEG, "img.jpg", "image/jpeg")],
        )
        self.media_id = r.json()["id"]

    def test_get_file_success(self, client):
        """ケース1: 存在するメディアのファイルを取得できる。"""
        r = client.get(f"/media/{self.media_id}/file")
        assert r.status_code == 200

    def test_get_file_nonexistent_404(self, client):
        """ケース2: 存在しないメディアのファイル取得は 404 になる。"""
        r = client.get("/media/999999/file")
        assert r.status_code == 404

    def test_get_file_returns_bytes(self, client):
        """ケース3: ファイルのバイトデータが返される。"""
        r = client.get(f"/media/{self.media_id}/file")
        assert r.status_code == 200
        assert len(r.content) > 0

    def test_get_deleted_file_404(self, client):
        """ケース4: 削除済みメディアのファイル取得は 404 になる。"""
        client.delete(f"/media/{self.media_id}")
        r = client.get(f"/media/{self.media_id}/file")
        assert r.status_code == 404


class TestDeleteMedia:
    """DELETE /media/{id} エンドポイントのテスト。"""

    @pytest.fixture(autouse=True)
    def setup(self, client):
        """テスト用メディアを作成する。"""
        r = client.post(
            "/media",
            files=[make_upload_file(MINIMAL_JPEG, "img.jpg", "image/jpeg")],
        )
        self.media_id = r.json()["id"]

    def test_delete_success_204(self, client):
        """ケース1: 正常削除は 204 を返す。"""
        r = client.delete(f"/media/{self.media_id}")
        assert r.status_code == 204

    def test_delete_nonexistent_404(self, client):
        """ケース2: 存在しないメディアの削除は 404 になる。"""
        r = client.delete("/media/999999")
        assert r.status_code == 404

    def test_delete_already_deleted_409(self, client):
        """ケース3: 既に削除済みのメディアを削除すると 409 になる。"""
        client.delete(f"/media/{self.media_id}")
        r = client.delete(f"/media/{self.media_id}")
        assert r.status_code == 409

    def test_soft_delete_not_visible(self, client):
        """ケース4: 論理削除後は GET /media で非表示になる。"""
        client.delete(f"/media/{self.media_id}")
        r = client.get("/media?include_deleted=false")
        ids = [item["id"] for item in r.json()["items"]]
        assert self.media_id not in ids

    def test_soft_delete_visible_with_include_deleted(self, client):
        """ケース5: include_deleted=true で削除済みも取得できる。"""
        client.delete(f"/media/{self.media_id}")
        r = client.get("/media?include_deleted=true")
        ids = [item["id"] for item in r.json()["items"]]
        assert self.media_id in ids

    def test_deleted_at_set(self, client):
        """ケース6: 削除後は deleted_at が設定される。"""
        client.delete(f"/media/{self.media_id}")
        r_list = client.get("/media?include_deleted=true")
        deleted_item = next(
            (item for item in r_list.json()["items"] if item["id"] == self.media_id),
            None,
        )
        assert deleted_item is not None
        assert deleted_item["deleted_at"] is not None


class TestAnalyzeMedia:
    """POST /media/{id}/analyze エンドポイントのテスト。"""

    @pytest.fixture(autouse=True)
    def setup(self, client):
        """テスト用メディアを作成する。"""
        r_image = client.post(
            "/media",
            files=[make_upload_file(MINIMAL_JPEG, "img.jpg", "image/jpeg")],
            data={"tags": ["cat"]},
        )
        self.image_id = r_image.json()["id"]

        r_video = client.post(
            "/media",
            files=[make_upload_file(MINIMAL_MP4, "vid.mp4", "video/mp4")],
        )
        self.video_id = r_video.json()["id"]

    def test_analyze_image_success(self, client):
        """ケース1: 画像の CLIP 解析が成功する。"""
        r = client.post(f"/media/{self.image_id}/analyze")
        assert r.status_code == 200
        assert "tags" in r.json()

    def test_analyze_video_403(self, client):
        """ケース2: 動画の CLIP 解析は 403 になる。"""
        r = client.post(f"/media/{self.video_id}/analyze")
        assert r.status_code == 403

    def test_analyze_nonexistent_404(self, client):
        """ケース3: 存在しないメディアの解析は 404 になる。"""
        r = client.post("/media/999999/analyze")
        assert r.status_code == 404

    def test_analyze_deleted_404(self, client):
        """ケース4: 削除済みメディアの解析は 404 になる。"""
        client.delete(f"/media/{self.image_id}")
        r = client.post(f"/media/{self.image_id}/analyze")
        assert r.status_code == 404

    def test_analyze_updates_clip_tags(self, client):
        """ケース5: 解析後に CLIP タグが更新される。"""
        r = client.post(f"/media/{self.image_id}/analyze")
        assert r.status_code == 200
        clip_tags = [t for t in r.json()["tags"] if t["source"] == "clip"]
        assert isinstance(clip_tags, list)

    def test_analyze_returns_media_response(self, client):
        """ケース6: 解析結果は MediaResponse 形式で返る。"""
        r = client.post(f"/media/{self.image_id}/analyze")
        assert r.status_code == 200
        data = r.json()
        assert "id" in data
        assert "tags" in data
        assert "media_type" in data
