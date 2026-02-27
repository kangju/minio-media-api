"""CRUD 操作モジュール。

データベースの作成・読み取り・更新・削除操作を提供する。
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from models import Media, MediaTag, Tag


def get_media_by_id(
    db: Session, media_id: int, include_deleted: bool = False
) -> Optional[Media]:
    """ID でメディアを取得する。

    Args:
        db: データベースセッション。
        media_id: 取得するメディアの ID。
        include_deleted: 論理削除済みメディアを含めるかどうか。

    Returns:
        Optional[Media]: メディアオブジェクト。見つからない場合は None。
    """
    stmt = (
        select(Media)
        .options(selectinload(Media.media_tags).selectinload(MediaTag.tag))
        .where(Media.id == media_id)
    )
    if not include_deleted:
        stmt = stmt.where(Media.deleted_at.is_(None))
    return db.execute(stmt).scalar_one_or_none()


def get_media_list(
    db: Session,
    tag: list[str],
    media_type: Optional[str],
    include_deleted: bool,
    created_from: Optional[datetime],
    created_to: Optional[datetime],
    offset: int,
    limit: int,
) -> tuple[list[Media], int]:
    """メディア一覧を取得する。

    Args:
        db: データベースセッション。
        tag: タグ名でフィルタリングするリスト（AND 条件）。
        media_type: メディアタイプでフィルタリングする文字列。
        include_deleted: 論理削除済みメディアを含めるかどうか。
        created_from: 作成日時の下限。
        created_to: 作成日時の上限。
        offset: 取得開始位置。
        limit: 取得件数。

    Returns:
        tuple[list[Media], int]: メディアリストと総件数のタプル。
    """
    stmt = select(Media).options(
        selectinload(Media.media_tags).selectinload(MediaTag.tag)
    )

    if not include_deleted:
        stmt = stmt.where(Media.deleted_at.is_(None))

    if media_type:
        stmt = stmt.where(Media.media_type == media_type)

    if created_from:
        stmt = stmt.where(Media.created_at >= created_from)

    if created_to:
        stmt = stmt.where(Media.created_at <= created_to)

    if tag:
        for tag_name in tag:
            stmt = stmt.where(
                Media.id.in_(
                    select(MediaTag.media_id)
                    .join(Tag, MediaTag.tag_id == Tag.id)
                    .where(Tag.name == tag_name)
                )
            )

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.execute(count_stmt).scalar_one()

    stmt = stmt.order_by(Media.created_at.desc()).offset(offset).limit(limit)
    items = list(db.execute(stmt).scalars().all())

    return items, total


def create_media(
    db: Session,
    original_filename: str,
    minio_key: str,
    file_hash: str,
    media_type: str,
) -> Media:
    """メディアレコードを作成する。

    Args:
        db: データベースセッション。
        original_filename: 元のファイル名。
        minio_key: MinIO 上のオブジェクトキー。
        file_hash: ファイルの SHA256 ハッシュ値。
        media_type: メディアタイプ（'image' または 'video'）。

    Returns:
        Media: 作成されたメディアオブジェクト。
    """
    media = Media(
        original_filename=original_filename,
        minio_key=minio_key,
        file_hash=file_hash,
        media_type=media_type,
    )
    db.add(media)
    db.commit()
    db.refresh(media)
    return media


def get_media_by_hash(db: Session, file_hash: str) -> Optional[Media]:
    """ファイルハッシュでメディアを取得する。

    Args:
        db: データベースセッション。
        file_hash: 検索するファイルハッシュ。

    Returns:
        Optional[Media]: メディアオブジェクト。見つからない場合は None。
    """
    stmt = select(Media).where(Media.file_hash == file_hash).limit(1)
    return db.execute(stmt).scalar_one_or_none()


def soft_delete_media(db: Session, media_id: int) -> Media:
    """メディアを論理削除する。

    Args:
        db: データベースセッション。
        media_id: 削除するメディアの ID。

    Returns:
        Media: 論理削除されたメディアオブジェクト。
    """
    stmt = select(Media).where(Media.id == media_id)
    media = db.execute(stmt).scalar_one()
    media.deleted_at = datetime.utcnow()
    db.commit()
    db.refresh(media)
    return media


def get_or_create_tag(db: Session, name: str) -> Tag:
    """タグを取得または作成する。

    タグが存在しない場合は新規作成する。

    Args:
        db: データベースセッション。
        name: タグ名。

    Returns:
        Tag: 取得または作成されたタグオブジェクト。
    """
    stmt = select(Tag).where(Tag.name == name)
    tag = db.execute(stmt).scalar_one_or_none()
    if tag is None:
        tag = Tag(name=name)
        db.add(tag)
        db.commit()
        db.refresh(tag)
    return tag


def add_tags_to_media(
    db: Session, media_id: int, tags: list[dict], source: str
) -> None:
    """メディアにタグを追加する。

    既存のタグは重複して追加しない。

    Args:
        db: データベースセッション。
        media_id: タグを追加するメディアの ID。
        tags: タグ情報のリスト（{"name": str, "score": float|None}）。
        source: タグのソース（'user' または 'clip'）。
    """
    for tag_info in tags:
        tag = get_or_create_tag(db, tag_info["name"])
        existing = db.execute(
            select(MediaTag).where(
                MediaTag.media_id == media_id, MediaTag.tag_id == tag.id
            )
        ).scalar_one_or_none()
        if existing is None:
            media_tag = MediaTag(
                media_id=media_id,
                tag_id=tag.id,
                source=source,
                score=tag_info.get("score"),
            )
            db.add(media_tag)
    db.commit()


def get_all_tags(db: Session) -> list[dict]:
    """すべてのタグを件数付きで取得する。

    Args:
        db: データベースセッション。

    Returns:
        list[dict]: タグ情報（id, name, media_count, created_at）のリスト。
    """
    stmt = (
        select(Tag, func.count(MediaTag.media_id).label("media_count"))
        .outerjoin(MediaTag, Tag.id == MediaTag.tag_id)
        .group_by(Tag.id)
        .order_by(Tag.name)
    )
    rows = db.execute(stmt).all()
    return [
        {
            "id": row.Tag.id,
            "name": row.Tag.name,
            "media_count": row.media_count,
            "created_at": row.Tag.created_at,
        }
        for row in rows
    ]


def create_tag(db: Session, name: str) -> Tag:
    """タグを新規作成する。

    Args:
        db: データベースセッション。
        name: タグ名。

    Returns:
        Tag: 作成されたタグオブジェクト。
    """
    tag = Tag(name=name)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


def update_tag(db: Session, tag_id: int, name: str) -> Tag:
    """タグ名を更新する。

    Args:
        db: データベースセッション。
        tag_id: 更新するタグの ID。
        name: 新しいタグ名。

    Returns:
        Tag: 更新されたタグオブジェクト。
    """
    stmt = select(Tag).where(Tag.id == tag_id)
    tag = db.execute(stmt).scalar_one()
    tag.name = name
    db.commit()
    db.refresh(tag)
    return tag


def delete_tag(db: Session, tag_id: int) -> None:
    """タグを削除する。

    関連する MediaTag レコードもカスケード削除される。

    Args:
        db: データベースセッション。
        tag_id: 削除するタグの ID。
    """
    stmt = select(Tag).where(Tag.id == tag_id)
    tag = db.execute(stmt).scalar_one()
    db.delete(tag)
    db.commit()


def add_tag_to_media(
    db: Session, media_id: int, tag_name: str, source: str = "user"
) -> MediaTag:
    """メディアにタグを追加する（単一）。

    Args:
        db: データベースセッション。
        media_id: タグを追加するメディアの ID。
        tag_name: タグ名。
        source: タグのソース（デフォルト: 'user'）。

    Returns:
        MediaTag: 作成された MediaTag オブジェクト。
    """
    tag = get_or_create_tag(db, tag_name)
    media_tag = MediaTag(
        media_id=media_id,
        tag_id=tag.id,
        source=source,
        score=None,
    )
    db.add(media_tag)
    db.commit()
    db.refresh(media_tag)
    return media_tag


def remove_tag_from_media(db: Session, media_id: int, tag_id: int) -> None:
    """メディアからタグを削除する。

    Args:
        db: データベースセッション。
        media_id: 対象メディアの ID。
        tag_id: 削除するタグの ID。
    """
    stmt = select(MediaTag).where(
        MediaTag.media_id == media_id, MediaTag.tag_id == tag_id
    )
    media_tag = db.execute(stmt).scalar_one()
    db.delete(media_tag)
    db.commit()


def update_clip_tags(
    db: Session, media_id: int, clip_tags: list[dict]
) -> None:
    """メディアの CLIP タグを更新する。

    既存の CLIP ソースタグを削除し、新しい CLIP タグを追加する。

    Args:
        db: データベースセッション。
        media_id: 対象メディアの ID。
        clip_tags: 新しい CLIP タグのリスト（{"name": str, "score": float}）。
    """
    # 既存の clip タグを削除
    stmt = select(MediaTag).where(
        MediaTag.media_id == media_id, MediaTag.source == "clip"
    )
    existing_clip_tags = db.execute(stmt).scalars().all()
    for mt in existing_clip_tags:
        db.delete(mt)
    db.commit()

    # 新しい CLIP タグを追加
    add_tags_to_media(db, media_id, clip_tags, source="clip")
