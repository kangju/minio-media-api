"""バリデーション関数モジュール。

ファイルタイプ・サイズのバリデーションを提供する。
"""

import os

from fastapi import HTTPException

# 許可する画像の MIME タイプとその拡張子のマッピング
ALLOWED_IMAGE_TYPES: dict[str, list[str]] = {
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/gif": [".gif"],
    "image/webp": [".webp"],
}

# 許可する動画の MIME タイプとその拡張子のマッピング
ALLOWED_VIDEO_TYPES: dict[str, list[str]] = {
    "video/mp4": [".mp4"],
    "video/quicktime": [".mov"],
    "video/x-msvideo": [".avi"],
    "video/x-matroska": [".mkv"],
    "video/webm": [".webm"],
}

# すべての許可 MIME タイプ
ALL_ALLOWED_TYPES: dict[str, list[str]] = {
    **ALLOWED_IMAGE_TYPES,
    **ALLOWED_VIDEO_TYPES,
}


def validate_file_type(content_type: str, filename: str) -> None:
    """ファイルの MIME タイプと拡張子を検証する。

    画像・動画ともに許可する。MIME タイプが不正な場合、
    または拡張子が MIME タイプと一致しない場合は 422 エラーを発生させる。

    Args:
        content_type: ファイルの MIME タイプ。
        filename: アップロードされたファイル名。

    Raises:
        HTTPException: MIME タイプが許可されていない場合、
            または拡張子が MIME タイプと一致しない場合（422）。
    """
    if content_type not in ALL_ALLOWED_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"許可されていないファイルタイプです: {content_type}",
        )
    ext = os.path.splitext(filename)[1].lower()
    allowed_exts = ALL_ALLOWED_TYPES[content_type]
    if ext not in allowed_exts:
        raise HTTPException(
            status_code=422,
            detail=(
                f"ファイル拡張子 '{ext}' は MIME タイプ '{content_type}' と一致しません。"
                f" 許可される拡張子: {allowed_exts}"
            ),
        )


def validate_image_only(content_type: str, filename: str) -> None:
    """ファイルが画像であることを検証する。

    画像のみを許可し、動画や他の形式は 422 エラーを発生させる。

    Args:
        content_type: ファイルの MIME タイプ。
        filename: アップロードされたファイル名。

    Raises:
        HTTPException: MIME タイプが画像でない場合、
            または拡張子が MIME タイプと一致しない場合（422）。
    """
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"画像ファイルのみ許可されています。受け取った MIME タイプ: {content_type}",
        )
    ext = os.path.splitext(filename)[1].lower()
    allowed_exts = ALLOWED_IMAGE_TYPES[content_type]
    if ext not in allowed_exts:
        raise HTTPException(
            status_code=422,
            detail=(
                f"ファイル拡張子 '{ext}' は MIME タイプ '{content_type}' と一致しません。"
                f" 許可される拡張子: {allowed_exts}"
            ),
        )


def validate_file_size(size_bytes: int, max_mb: int) -> None:
    """ファイルサイズを検証する。

    ファイルが空（0バイト）または指定した最大サイズを超える場合は
    422 エラーを発生させる。

    Args:
        size_bytes: ファイルサイズ（バイト）。
        max_mb: 最大ファイルサイズ（MB）。

    Raises:
        HTTPException: ファイルが空の場合、またはサイズが上限を超えた場合（422）。
    """
    if size_bytes == 0:
        raise HTTPException(
            status_code=422,
            detail="空のファイルはアップロードできません。",
        )
    max_bytes = max_mb * 1024 * 1024
    if size_bytes > max_bytes:
        raise HTTPException(
            status_code=422,
            detail=f"ファイルサイズが上限 {max_mb}MB を超えています（{size_bytes} バイト）。",
        )


def get_media_type(content_type: str) -> str:
    """MIME タイプからメディアタイプ文字列を返す。

    Args:
        content_type: ファイルの MIME タイプ。

    Returns:
        str: 'image' または 'video'。
    """
    if content_type in ALLOWED_IMAGE_TYPES:
        return "image"
    return "video"
