"""データベースモデル定義モジュール。

SQLAlchemy ORM モデルを定義する。
"""

import enum
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class MediaTypeEnum(str, enum.Enum):
    """メディアタイプの列挙型。"""

    image = "image"
    video = "video"


class TagSourceEnum(str, enum.Enum):
    """タグソースの列挙型。"""

    user = "user"
    clip = "clip"


class Media(Base):
    """メディアファイルを表すモデル。

    画像・動画ファイルのメタデータを管理する。
    """

    __tablename__ = "media"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    """メディアの主キー。"""

    original_filename: Mapped[str] = mapped_column(String, nullable=False)
    """元のファイル名。"""

    minio_key: Mapped[str] = mapped_column(String, nullable=False)
    """MinIO 上のオブジェクトキー。"""

    file_hash: Mapped[str] = mapped_column(String, nullable=False)
    """ファイルの SHA256 ハッシュ値。"""

    media_type: Mapped[str] = mapped_column(
        Enum(MediaTypeEnum, name="mediatypeenum"), nullable=False
    )
    """メディアタイプ（image または video）。"""

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, server_default=func.now(), nullable=False
    )
    """作成日時。"""

    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    """論理削除日時。None の場合は未削除。"""

    media_tags: Mapped[list["MediaTag"]] = relationship(
        "MediaTag", back_populates="media", cascade="all, delete-orphan"
    )
    """このメディアに紐づくタグの関連。"""

    __table_args__ = (Index("ix_media_file_hash", "file_hash"),)


class Tag(Base):
    """タグを表すモデル。

    メディアに付与できるタグ情報を管理する。
    """

    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    """タグの主キー。"""

    name: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    """タグ名（一意）。"""

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, server_default=func.now(), nullable=False
    )
    """作成日時。"""

    media_tags: Mapped[list["MediaTag"]] = relationship(
        "MediaTag", back_populates="tag", cascade="all, delete-orphan"
    )
    """このタグに紐づくメディアの関連。"""


class MediaTag(Base):
    """メディアとタグの中間テーブルモデル。

    メディアとタグの多対多関係を管理し、タグのソースとスコアを保持する。
    """

    __tablename__ = "media_tags"

    media_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("media.id", ondelete="CASCADE"), primary_key=True
    )
    """メディアの外部キー。"""

    tag_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True
    )
    """タグの外部キー。"""

    source: Mapped[str] = mapped_column(
        Enum(TagSourceEnum, name="tagsourceenum"), nullable=False, default="user"
    )
    """タグのソース（user: ユーザー付与、clip: CLIP 自動付与）。"""

    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    """CLIP スコア（user タグの場合は None）。"""

    media: Mapped["Media"] = relationship("Media", back_populates="media_tags")
    """対応するメディア。"""

    tag: Mapped["Tag"] = relationship("Tag", back_populates="media_tags")
    """対応するタグ。"""
