"""バリデーター関数のユニットテストモジュール。

validators.py の全関数に対するテストを含む。
"""

import pytest
from fastapi import HTTPException

from validators import (
    get_media_type,
    validate_file_size,
    validate_file_type,
    validate_image_only,
)


class TestValidateFileType:
    """validate_file_type 関数のテスト。"""

    def test_valid_jpeg(self):
        """JPEG ファイルは正常に通過する。"""
        validate_file_type("image/jpeg", "photo.jpg")

    def test_valid_png(self):
        """PNG ファイルは正常に通過する。"""
        validate_file_type("image/png", "image.png")

    def test_valid_gif(self):
        """GIF ファイルは正常に通過する。"""
        validate_file_type("image/gif", "anim.gif")

    def test_valid_webp(self):
        """WebP ファイルは正常に通過する。"""
        validate_file_type("image/webp", "img.webp")

    def test_valid_mp4(self):
        """MP4 ファイルは正常に通過する。"""
        validate_file_type("video/mp4", "clip.mp4")

    def test_valid_mov(self):
        """MOV ファイルは正常に通過する。"""
        validate_file_type("video/quicktime", "movie.mov")

    def test_valid_avi(self):
        """AVI ファイルは正常に通過する。"""
        validate_file_type("video/x-msvideo", "film.avi")

    def test_valid_mkv(self):
        """MKV ファイルは正常に通過する。"""
        validate_file_type("video/x-matroska", "video.mkv")

    def test_valid_webm(self):
        """WebM ファイルは正常に通過する。"""
        validate_file_type("video/webm", "clip.webm")

    def test_invalid_mime_pdf_422(self):
        """PDF は 422 エラーになる。"""
        with pytest.raises(HTTPException) as exc_info:
            validate_file_type("application/pdf", "doc.pdf")
        assert exc_info.value.status_code == 422

    def test_invalid_mime_text_422(self):
        """テキストファイルは 422 エラーになる。"""
        with pytest.raises(HTTPException) as exc_info:
            validate_file_type("text/plain", "note.txt")
        assert exc_info.value.status_code == 422

    def test_extension_mismatch_jpeg_as_png_422(self):
        """JPEG ファイルを .png 拡張子で指定すると 422 エラーになる。"""
        with pytest.raises(HTTPException) as exc_info:
            validate_file_type("image/jpeg", "image.png")
        assert exc_info.value.status_code == 422

    def test_extension_mismatch_mp4_as_jpg_422(self):
        """MP4 ファイルを .jpg 拡張子で指定すると 422 エラーになる。"""
        with pytest.raises(HTTPException) as exc_info:
            validate_file_type("video/mp4", "video.jpg")
        assert exc_info.value.status_code == 422

    def test_jpeg_with_jpeg_extension(self):
        """.jpeg 拡張子の JPEG ファイルは正常に通過する。"""
        validate_file_type("image/jpeg", "photo.jpeg")


class TestValidateImageOnly:
    """validate_image_only 関数のテスト。"""

    def test_valid_jpeg_image(self):
        """JPEG 画像は正常に通過する。"""
        validate_image_only("image/jpeg", "photo.jpg")

    def test_valid_png_image(self):
        """PNG 画像は正常に通過する。"""
        validate_image_only("image/png", "image.png")

    def test_valid_gif_image(self):
        """GIF 画像は正常に通過する。"""
        validate_image_only("image/gif", "anim.gif")

    def test_valid_webp_image(self):
        """WebP 画像は正常に通過する。"""
        validate_image_only("image/webp", "img.webp")

    def test_video_mp4_422(self):
        """MP4 動画は 422 エラーになる。"""
        with pytest.raises(HTTPException) as exc_info:
            validate_image_only("video/mp4", "clip.mp4")
        assert exc_info.value.status_code == 422

    def test_video_mov_422(self):
        """MOV 動画は 422 エラーになる。"""
        with pytest.raises(HTTPException) as exc_info:
            validate_image_only("video/quicktime", "movie.mov")
        assert exc_info.value.status_code == 422

    def test_pdf_422(self):
        """PDF は 422 エラーになる。"""
        with pytest.raises(HTTPException) as exc_info:
            validate_image_only("application/pdf", "doc.pdf")
        assert exc_info.value.status_code == 422

    def test_extension_mismatch_422(self):
        """MIME タイプと拡張子が一致しない場合は 422 エラーになる。"""
        with pytest.raises(HTTPException) as exc_info:
            validate_image_only("image/jpeg", "image.png")
        assert exc_info.value.status_code == 422


class TestValidateFileSize:
    """validate_file_size 関数のテスト。"""

    def test_valid_size(self):
        """有効なサイズのファイルは正常に通過する。"""
        validate_file_size(1024, 10)

    def test_empty_file_422(self):
        """空ファイル（0 バイト）は 422 エラーになる。"""
        with pytest.raises(HTTPException) as exc_info:
            validate_file_size(0, 10)
        assert exc_info.value.status_code == 422

    def test_file_too_large_422(self):
        """サイズ超過のファイルは 422 エラーになる。"""
        with pytest.raises(HTTPException) as exc_info:
            validate_file_size(11 * 1024 * 1024, 10)
        assert exc_info.value.status_code == 422

    def test_exactly_max_size(self):
        """上限ちょうどのファイルは正常に通過する。"""
        validate_file_size(10 * 1024 * 1024, 10)

    def test_one_byte_over_max_422(self):
        """上限を 1 バイト超えるファイルは 422 エラーになる。"""
        with pytest.raises(HTTPException) as exc_info:
            validate_file_size(10 * 1024 * 1024 + 1, 10)
        assert exc_info.value.status_code == 422


class TestGetMediaType:
    """get_media_type 関数のテスト。"""

    def test_jpeg_returns_image(self):
        """JPEG は 'image' を返す。"""
        assert get_media_type("image/jpeg") == "image"

    def test_png_returns_image(self):
        """PNG は 'image' を返す。"""
        assert get_media_type("image/png") == "image"

    def test_gif_returns_image(self):
        """GIF は 'image' を返す。"""
        assert get_media_type("image/gif") == "image"

    def test_webp_returns_image(self):
        """WebP は 'image' を返す。"""
        assert get_media_type("image/webp") == "image"

    def test_mp4_returns_video(self):
        """MP4 は 'video' を返す。"""
        assert get_media_type("video/mp4") == "video"

    def test_mov_returns_video(self):
        """MOV は 'video' を返す。"""
        assert get_media_type("video/quicktime") == "video"

    def test_avi_returns_video(self):
        """AVI は 'video' を返す。"""
        assert get_media_type("video/x-msvideo") == "video"

    def test_mkv_returns_video(self):
        """MKV は 'video' を返す。"""
        assert get_media_type("video/x-matroska") == "video"
