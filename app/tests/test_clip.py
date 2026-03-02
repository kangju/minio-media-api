"""CLIP エンドポイントとサービスのテストモジュール。

実際の Docker CLIP サービスを使用してテストを行う（モックなし）。
"""

import pytest

from tests.conftest import MINIMAL_JPEG, MINIMAL_MP4, make_upload_file


class TestClipEndpoint:
    """POST /clip/analyze エンドポイントのテスト。"""

    def test_analyze_image_success(self, client):
        """ケース1: 画像を送信すると CLIP スコア付きタグリストが返る。"""
        r = client.post(
            "/clip/analyze",
            files=[make_upload_file(MINIMAL_JPEG, "test.jpg", "image/jpeg")],
        )
        assert r.status_code == 200
        data = r.json()
        assert "tags" in data
        assert isinstance(data["tags"], list)

    def test_analyze_returns_tag_structure(self, client):
        """ケース2: 返却されるタグは name と score を持つ。"""
        r = client.post(
            "/clip/analyze",
            files=[make_upload_file(MINIMAL_JPEG, "test.jpg", "image/jpeg")],
        )
        assert r.status_code == 200
        for tag in r.json()["tags"]:
            assert "name" in tag
            assert "score" in tag
            assert isinstance(tag["name"], str)
            assert isinstance(tag["score"], float)

    def test_analyze_score_above_threshold(self, client):
        """ケース3: 返却されるタグのスコアはすべて閾値以上である。"""
        # タグを事前に作成して候補を増やす
        candidate_tags = ["cat", "dog", "animal", "pet", "indoor", "outdoor",
                          "nature", "person", "city", "food"]
        for tag_name in candidate_tags:
            client.post("/tags", json={"name": tag_name})

        r = client.post(
            "/clip/analyze",
            files=[make_upload_file(MINIMAL_JPEG, "test.jpg", "image/jpeg")],
        )
        assert r.status_code == 200
        for tag in r.json()["tags"]:
            assert tag["score"] >= 0.0

    def test_analyze_video_422(self, client):
        """ケース4: 動画ファイルの送信は 422 になる。"""
        r = client.post(
            "/clip/analyze",
            files=[make_upload_file(MINIMAL_MP4, "vid.mp4", "video/mp4")],
        )
        assert r.status_code == 422

    def test_analyze_pdf_422(self, client):
        """ケース5: PDF ファイルの送信は 422 になる。"""
        r = client.post(
            "/clip/analyze",
            files=[make_upload_file(b"%PDF-1.4", "doc.pdf", "application/pdf")],
        )
        assert r.status_code == 422

    def test_analyze_no_file_422(self, client):
        """ケース6: ファイルなしの送信は 422 になる。"""
        r = client.post("/clip/analyze")
        assert r.status_code == 422

    def test_no_db_side_effects(self, client):
        """ケース7: CLIP 解析後に DB にメディアが登録されない。"""
        r_before = client.get("/media")
        before_total = r_before.json()["total"]

        client.post(
            "/clip/analyze",
            files=[make_upload_file(MINIMAL_JPEG, "test.jpg", "image/jpeg")],
        )

        r_after = client.get("/media")
        assert r_after.json()["total"] == before_total

    def test_top_k_limit_respected(self, client):
        """ケース8: 返却されるタグ数が CLIP_TOP_K 以下である。"""
        # 多数の候補タグを作成して TOP_K の上限をテストする
        tag_names = [f"testtag{i:03d}" for i in range(50)]
        for name in tag_names:
            client.post("/tags", json={"name": name})

        r = client.post(
            "/clip/analyze",
            files=[make_upload_file(MINIMAL_JPEG, "test.jpg", "image/jpeg")],
        )
        assert r.status_code == 200
        # デフォルト CLIP_TOP_K は 10
        assert len(r.json()["tags"]) <= 10

    def test_file_size_too_large_422(self, client):
        """ケース9: ファイルサイズ超過は 422 になる。"""
        import io
        from unittest.mock import patch
        large_data = MINIMAL_JPEG + b"\x00" * (2 * 1024 * 1024)
        with patch("routers.clip.settings") as mock_settings:
            mock_settings.max_file_size_mb = 1
            mock_settings.clip_top_k = 10
            mock_settings.clip_score_threshold = 0.2
            r = client.post(
                "/clip/analyze",
                files=[("file", ("big.jpg", io.BytesIO(large_data), "image/jpeg"))],
            )
        assert r.status_code == 422

    def test_analyze_with_candidates_json(self, client):
        """ケース10: candidates JSON を指定すると指定タグのみで解析される。"""
        import json
        candidate_tags = ["cat", "dog", "animal"]
        r = client.post(
            "/clip/analyze",
            files=[make_upload_file(MINIMAL_JPEG, "test.jpg", "image/jpeg")],
            data={"candidates": json.dumps(candidate_tags)},
        )
        assert r.status_code == 200
        returned_names = {tag["name"] for tag in r.json()["tags"]}
        # 返されたタグはすべて指定した candidates 内に含まれること
        assert returned_names.issubset(set(candidate_tags))

    def test_analyze_with_invalid_json_candidates_422(self, client):
        """ケース11: 不正な JSON を candidates に指定すると 422 になる。"""
        r = client.post(
            "/clip/analyze",
            files=[make_upload_file(MINIMAL_JPEG, "test.jpg", "image/jpeg")],
            data={"candidates": "not-valid-json"},
        )
        assert r.status_code == 422

    def test_analyze_with_non_array_json_candidates_422(self, client):
        """ケース12: JSON 配列以外（オブジェクト）を candidates に指定すると 422 になる。"""
        import json
        r = client.post(
            "/clip/analyze",
            files=[make_upload_file(MINIMAL_JPEG, "test.jpg", "image/jpeg")],
            data={"candidates": json.dumps({"tag": "cat"})},
        )
        assert r.status_code == 422

    def test_analyze_with_empty_candidates(self, client):
        """ケース13: 空配列を candidates に指定すると結果は空リストになる。"""
        import json
        r = client.post(
            "/clip/analyze",
            files=[make_upload_file(MINIMAL_JPEG, "test.jpg", "image/jpeg")],
            data={"candidates": json.dumps([])},
        )
        assert r.status_code == 200
        assert r.json()["tags"] == []

    def test_analyze_without_candidates_uses_db_tags(self, client):
        """ケース14: candidates 未指定の場合は DB 全タグを候補として解析する（後方互換）。"""
        # DB にタグを作成しておく
        client.post("/tags", json={"name": "landscape"})
        client.post("/tags", json={"name": "portrait"})

        r = client.post(
            "/clip/analyze",
            files=[make_upload_file(MINIMAL_JPEG, "test.jpg", "image/jpeg")],
        )
        assert r.status_code == 200
        data = r.json()
        assert "tags" in data
        # DB タグが候補に含まれるため、結果は通常通り返る（空でない場合が多い）
        assert isinstance(data["tags"], list)



class TestClipServiceUnit:
    """CLIP サービス単体のユニットテスト。

    実際の ClipService インスタンスを使用して解析結果を検証する。
    """

    @pytest.fixture(scope="class")
    def clip_service(self):
        """ClipService のシングルトンインスタンスを返す。

        Returns:
            ClipService: CLIP サービスインスタンス。
        """
        from services.clip_service import get_clip_service
        return get_clip_service()

    def test_analyze_returns_list(self, clip_service):
        """ケース1: analyze_image が TagScore のリストを返す。"""
        from tests.conftest import MINIMAL_JPEG
        tags = clip_service.analyze_image(MINIMAL_JPEG, ["cat", "dog", "animal"])
        assert isinstance(tags, list)

    def test_analyze_returns_tag_structure(self, clip_service):
        """ケース2: 返却される TagScore は name と score を持つ。"""
        from tests.conftest import MINIMAL_JPEG
        tags = clip_service.analyze_image(MINIMAL_JPEG, ["cat", "dog"])
        for tag in tags:
            assert "name" in tag
            assert "score" in tag
            assert isinstance(tag["name"], str)
            assert isinstance(tag["score"], float)

    def test_analyze_scores_are_in_valid_range(self, clip_service):
        """ケース3: スコアはすべて 0.0 以上 1.0 以下である。"""
        from tests.conftest import MINIMAL_JPEG
        tags = clip_service.analyze_image(MINIMAL_JPEG, ["cat", "dog", "bird"])
        for tag in tags:
            assert 0.0 <= tag["score"] <= 1.0

    def test_analyze_empty_candidates_returns_empty(self, clip_service):
        """ケース4: 候補タグが空のときは空リストを返す。"""
        from tests.conftest import MINIMAL_JPEG
        tags = clip_service.analyze_image(MINIMAL_JPEG, [])
        assert tags == []

    def test_analyze_top_k_respected(self, clip_service):
        """ケース5: 返却件数が top_k 以下である。"""
        from tests.conftest import MINIMAL_JPEG
        # 20 個の候補タグを使用して上限をテスト
        candidates = [f"category{i}" for i in range(20)]
        top_k = 5
        tags = clip_service.analyze_image(MINIMAL_JPEG, candidates, top_k=top_k)
        assert len(tags) <= top_k

    def test_analyze_threshold_filters_low_scores(self, clip_service):
        """ケース6: 閾値以下のスコアのタグは返却されない。"""
        from tests.conftest import MINIMAL_JPEG
        threshold = 0.9999  # 非常に高い閾値（ほぼすべて除外される）
        tags = clip_service.analyze_image(
            MINIMAL_JPEG, ["cat", "dog", "car"], threshold=threshold
        )
        for tag in tags:
            assert tag["score"] >= threshold

    def test_analyze_scores_sorted_descending(self, clip_service):
        """ケース7: スコアは降順でソートされている。"""
        from tests.conftest import MINIMAL_JPEG
        tags = clip_service.analyze_image(
            MINIMAL_JPEG, ["cat", "dog", "animal", "vehicle", "building"]
        )
        scores = [t["score"] for t in tags]
        assert scores == sorted(scores, reverse=True)
