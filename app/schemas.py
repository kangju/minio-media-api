"""Pydantic スキーマ定義モジュール。

API のリクエスト・レスポンスのスキーマを定義する。
"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


class TagInfo(BaseModel):
    """タグ情報スキーマ。

    メディアに紐づくタグの詳細情報を表す。
    """

    id: int
    """タグの ID。"""

    name: str
    """タグ名。"""

    score: Optional[float] = None
    """CLIP スコア（user タグの場合は None）。"""

    source: Optional[str] = None
    """タグのソース（user または clip）。"""

    model_config = {"from_attributes": True}


class MediaResponse(BaseModel):
    """メディアレスポンススキーマ。

    メディアの詳細情報を表す。
    """

    id: int
    """メディアの ID。"""

    original_filename: str
    """元のファイル名。"""

    minio_key: str
    """MinIO 上のオブジェクトキー。"""

    media_type: str
    """メディアタイプ（image または video）。"""

    created_at: datetime
    """作成日時。"""

    deleted_at: Optional[datetime] = None
    """論理削除日時。"""

    tags: List[TagInfo] = []
    """紐づくタグのリスト。"""

    model_config = {"from_attributes": True}


class MediaListResponse(BaseModel):
    """メディア一覧レスポンススキーマ。

    メディアの一覧情報とページネーション情報を表す。
    """

    items: List[MediaResponse]
    """メディアのリスト。"""

    total: int
    """総件数。"""

    offset: int
    """オフセット。"""

    limit: int
    """取得件数。"""


class TagResponse(BaseModel):
    """タグレスポンススキーマ。

    タグの詳細情報とメディア件数を表す。
    """

    id: int
    """タグの ID。"""

    name: str
    """タグ名。"""

    media_count: int
    """このタグが付与されているメディアの件数。"""

    created_at: datetime
    """作成日時。"""

    model_config = {"from_attributes": True}


class TagCreate(BaseModel):
    """タグ作成リクエストスキーマ。"""

    name: str = Field(..., min_length=1)
    """タグ名（1文字以上）。"""

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, v: str) -> str:
        """タグ名の前後の空白を除去する。"""
        return v.strip() if isinstance(v, str) else v


class TagUpdate(BaseModel):
    """タグ更新リクエストスキーマ。"""

    name: str = Field(..., min_length=1)
    """新しいタグ名（1文字以上）。"""

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, v: str) -> str:
        """タグ名の前後の空白を除去する。"""
        return v.strip() if isinstance(v, str) else v


class AddTagRequest(BaseModel):
    """メディアへのタグ追加リクエストスキーマ。"""

    tag_name: str = Field(..., min_length=1)
    """追加するタグ名（1文字以上）。"""

    @field_validator("tag_name", mode="before")
    @classmethod
    def strip_tag_name(cls, v: str) -> str:
        """タグ名の前後の空白を除去する。"""
        return v.strip() if isinstance(v, str) else v


class ClipTagScore(BaseModel):
    """CLIP タグスコアスキーマ。

    CLIP 解析結果の個々のタグとスコアを表す。
    """

    name: str
    """タグ名。"""

    score: float
    """CLIP スコア。"""


class ClipAnalyzeResponse(BaseModel):
    """CLIP 解析レスポンススキーマ。

    CLIP 解析結果のタグリストを表す。
    """

    tags: List[ClipTagScore]
    """スコア付きタグのリスト。"""
