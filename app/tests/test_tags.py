"""タグエンドポイントのテストモジュール。

/tags および /media/{id}/tags エンドポイントのすべてのケースをテストする。
"""

import pytest

from tests.conftest import MINIMAL_JPEG, make_upload_file


class TestGetTags:
    """GET /tags エンドポイントのテスト。"""

    def test_get_tags_empty(self, client):
        """タグが存在しない場合は空リストが返る。"""
        r = client.get("/tags")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_get_tags_with_data(self, client):
        """タグが存在する場合はリストが返る。"""
        client.post("/tags", json={"name": "sample_tag_abc"})
        r = client.get("/tags")
        assert r.status_code == 200
        names = [t["name"] for t in r.json()]
        assert "sample_tag_abc" in names

    def test_get_tags_has_media_count(self, client):
        """各タグに media_count フィールドが含まれる。"""
        client.post("/tags", json={"name": "count_tag_xyz"})
        r = client.get("/tags")
        assert r.status_code == 200
        for tag in r.json():
            assert "media_count" in tag


class TestCreateTag:
    """POST /tags エンドポイントのテスト。"""

    def test_create_tag_success(self, client):
        """タグを正常に作成できる。"""
        r = client.post("/tags", json={"name": "new_tag_001"})
        assert r.status_code == 201
        assert r.json()["name"] == "new_tag_001"
        assert r.json()["media_count"] == 0

    def test_create_duplicate_tag_409(self, client):
        """重複タグ名は 409 エラーになる。"""
        client.post("/tags", json={"name": "dup_tag_test"})
        r = client.post("/tags", json={"name": "dup_tag_test"})
        assert r.status_code == 409

    def test_create_tag_strips_whitespace(self, client):
        """タグ名の前後の空白は除去される。"""
        r = client.post("/tags", json={"name": "  trimmed_tag  "})
        assert r.status_code == 201
        assert r.json()["name"] == "trimmed_tag"

    def test_create_tag_empty_name_422(self, client):
        """空のタグ名は 422 エラーになる。"""
        r = client.post("/tags", json={"name": ""})
        assert r.status_code == 422

    def test_create_tag_response_has_fields(self, client):
        """レスポンスに必要なフィールドが含まれる。"""
        r = client.post("/tags", json={"name": "fields_tag_check"})
        assert r.status_code == 201
        data = r.json()
        assert "id" in data
        assert "name" in data
        assert "media_count" in data
        assert "created_at" in data


class TestUpdateTag:
    """PATCH /tags/{id} エンドポイントのテスト。"""

    @pytest.fixture(autouse=True)
    def setup(self, client):
        """テスト用タグを作成する。"""
        r = client.post("/tags", json={"name": "original_tag_name"})
        self.tag_id = r.json()["id"]
        r2 = client.post("/tags", json={"name": "another_tag_name"})
        self.tag2_id = r2.json()["id"]

    def test_update_tag_success(self, client):
        """タグ名を正常に更新できる。"""
        r = client.patch(f"/tags/{self.tag_id}", json={"name": "updated_tag_name"})
        assert r.status_code == 200
        assert r.json()["name"] == "updated_tag_name"

    def test_update_nonexistent_tag_404(self, client):
        """存在しないタグの更新は 404 になる。"""
        r = client.patch("/tags/999999", json={"name": "something"})
        assert r.status_code == 404

    def test_update_to_duplicate_name_409(self, client):
        """別タグと同名に更新しようとすると 409 になる。"""
        r = client.patch(f"/tags/{self.tag_id}", json={"name": "another_tag_name"})
        assert r.status_code == 409

    def test_update_tag_same_name(self, client):
        """同名に更新しても成功する。"""
        r = client.patch(f"/tags/{self.tag_id}", json={"name": "original_tag_name"})
        assert r.status_code == 200

    def test_update_tag_empty_422(self, client):
        """空のタグ名への更新は 422 になる。"""
        r = client.patch(f"/tags/{self.tag_id}", json={"name": ""})
        assert r.status_code == 422


class TestDeleteTag:
    """DELETE /tags/{id} エンドポイントのテスト。"""

    @pytest.fixture(autouse=True)
    def setup(self, client):
        """テスト用タグを作成する。"""
        r = client.post("/tags", json={"name": "delete_me_tag"})
        self.tag_id = r.json()["id"]

    def test_delete_tag_success(self, client):
        """タグを正常に削除できる。"""
        r = client.delete(f"/tags/{self.tag_id}")
        assert r.status_code == 204

    def test_delete_nonexistent_tag_404(self, client):
        """存在しないタグの削除は 404 になる。"""
        r = client.delete("/tags/999999")
        assert r.status_code == 404

    def test_delete_tag_removes_from_list(self, client):
        """削除後はタグ一覧に表示されない。"""
        client.delete(f"/tags/{self.tag_id}")
        r = client.get("/tags")
        ids = [t["id"] for t in r.json()]
        assert self.tag_id not in ids


class TestAddTagToMedia:
    """POST /media/{id}/tags エンドポイントのテスト。"""

    @pytest.fixture(autouse=True)
    def setup(self, client):
        """テスト用メディアを作成する。"""
        r = client.post(
            "/media",
            files=[make_upload_file(MINIMAL_JPEG, "img.jpg", "image/jpeg")],
        )
        self.media_id = r.json()["id"]

    def test_add_tag_success(self, client):
        """メディアにタグを追加できる。"""
        r = client.post(
            f"/media/{self.media_id}/tags",
            json={"tag_name": "new_media_tag"},
        )
        assert r.status_code == 201
        assert r.json()["name"] == "new_media_tag"

    def test_add_tag_to_nonexistent_media_404(self, client):
        """存在しないメディアへのタグ追加は 404 になる。"""
        r = client.post("/media/999999/tags", json={"tag_name": "some_tag"})
        assert r.status_code == 404

    def test_add_empty_tag_name_422(self, client):
        """空のタグ名は 422 になる。"""
        r = client.post(
            f"/media/{self.media_id}/tags",
            json={"tag_name": ""},
        )
        assert r.status_code == 422

    def test_add_existing_tag_name_creates_or_reuses(self, client):
        """既存タグ名でも正常にタグが追加される。"""
        client.post("/tags", json={"name": "existing_global_tag"})
        r = client.post(
            f"/media/{self.media_id}/tags",
            json={"tag_name": "existing_global_tag"},
        )
        assert r.status_code in (200, 201)

    def test_add_tag_response_structure(self, client):
        """レスポンス構造が正しい。"""
        r = client.post(
            f"/media/{self.media_id}/tags",
            json={"tag_name": "struct_check_tag"},
        )
        assert r.status_code == 201
        data = r.json()
        assert "id" in data
        assert "name" in data


class TestRemoveTagFromMedia:
    """DELETE /media/{id}/tags/{tag_id} エンドポイントのテスト。"""

    @pytest.fixture(autouse=True)
    def setup(self, client):
        """テスト用メディアとタグを作成する。"""
        r = client.post(
            "/media",
            files=[make_upload_file(MINIMAL_JPEG, "img.jpg", "image/jpeg")],
        )
        self.media_id = r.json()["id"]
        r_tag = client.post(
            f"/media/{self.media_id}/tags",
            json={"tag_name": "removable_tag"},
        )
        self.tag_id = r_tag.json()["id"]

    def test_remove_tag_success(self, client):
        """メディアからタグを正常に削除できる。"""
        r = client.delete(f"/media/{self.media_id}/tags/{self.tag_id}")
        assert r.status_code == 204

    def test_remove_nonexistent_tag_404(self, client):
        """存在しない関連の削除は 404 になる。"""
        r = client.delete(f"/media/{self.media_id}/tags/999999")
        assert r.status_code == 404

    def test_remove_tag_not_visible_after(self, client):
        """削除後はメディアのタグ一覧に表示されない。"""
        client.delete(f"/media/{self.media_id}/tags/{self.tag_id}")
        r = client.get(f"/media/{self.media_id}")
        tag_ids = [t["id"] for t in r.json()["tags"]]
        assert self.tag_id not in tag_ids
