"""タグルーターモジュール。

タグの CRUD およびメディアへのタグ追加・削除エンドポイントを提供する。
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import crud
from database import get_db
from models import Media, MediaTag, Tag
from schemas import AddTagRequest, TagCreate, TagInfo, TagResponse, TagUpdate

router = APIRouter(tags=["tags"])


@router.get("/tags", response_model=List[TagResponse])
def list_tags(db: Session = Depends(get_db)) -> List[TagResponse]:
    """すべてのタグを件数付きで取得する。

    Args:
        db: データベースセッション。

    Returns:
        List[TagResponse]: タグのリスト。
    """
    rows = crud.get_all_tags(db)
    return [TagResponse(**row) for row in rows]


@router.post("/tags", response_model=TagResponse, status_code=201)
def create_tag(
    body: TagCreate, db: Session = Depends(get_db)
) -> TagResponse:
    """タグを新規作成する。

    Args:
        body: タグ作成リクエスト。
        db: データベースセッション。

    Returns:
        TagResponse: 作成されたタグの情報。

    Raises:
        HTTPException: 同名タグが既に存在する場合（409）。
    """
    existing = db.execute(select(Tag).where(Tag.name == body.name)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="同名のタグが既に存在します。")
    try:
        tag = crud.create_tag(db, body.name)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="同名のタグが既に存在します。")
    return TagResponse(id=tag.id, name=tag.name, media_count=0, created_at=tag.created_at)


@router.patch("/tags/{tag_id}", response_model=TagResponse)
def update_tag(
    tag_id: int, body: TagUpdate, db: Session = Depends(get_db)
) -> TagResponse:
    """タグ名を更新する。

    Args:
        tag_id: 更新するタグの ID。
        body: タグ更新リクエスト。
        db: データベースセッション。

    Returns:
        TagResponse: 更新後のタグの情報。

    Raises:
        HTTPException: タグが見つからない場合（404）、
            同名タグが既に存在する場合（409）。
    """
    tag = db.execute(select(Tag).where(Tag.id == tag_id)).scalar_one_or_none()
    if tag is None:
        raise HTTPException(status_code=404, detail="タグが見つかりません。")

    conflict = db.execute(
        select(Tag).where(Tag.name == body.name, Tag.id != tag_id)
    ).scalar_one_or_none()
    if conflict is not None:
        raise HTTPException(status_code=409, detail="同名のタグが既に存在します。")

    try:
        tag = crud.update_tag(db, tag_id, body.name)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="同名のタグが既に存在します。")

    media_count = db.execute(
        select(func.count(MediaTag.media_id)).where(MediaTag.tag_id == tag.id)
    ).scalar_one()
    return TagResponse(
        id=tag.id, name=tag.name, media_count=media_count, created_at=tag.created_at
    )


@router.delete("/tags/{tag_id}", status_code=204)
def delete_tag(tag_id: int, db: Session = Depends(get_db)) -> None:
    """タグを削除する。

    関連する media_tags もカスケード削除される。

    Args:
        tag_id: 削除するタグの ID。
        db: データベースセッション。

    Raises:
        HTTPException: タグが見つからない場合（404）。
    """
    tag = db.execute(select(Tag).where(Tag.id == tag_id)).scalar_one_or_none()
    if tag is None:
        raise HTTPException(status_code=404, detail="タグが見つかりません。")
    crud.delete_tag(db, tag_id)


@router.post("/media/{media_id}/tags", response_model=TagInfo, status_code=201)
def add_tag_to_media(
    media_id: int, body: AddTagRequest, db: Session = Depends(get_db)
) -> TagInfo:
    """メディアにタグを追加する。

    Args:
        media_id: タグを追加するメディアの ID。
        body: タグ追加リクエスト。
        db: データベースセッション。

    Returns:
        TagInfo: 追加されたタグの情報。

    Raises:
        HTTPException: メディアが見つからない場合（404）。
    """
    media = db.execute(select(Media).where(Media.id == media_id)).scalar_one_or_none()
    if media is None:
        raise HTTPException(status_code=404, detail="メディアが見つかりません。")

    existing_mt = db.execute(
        select(MediaTag)
        .join(Tag, MediaTag.tag_id == Tag.id)
        .where(MediaTag.media_id == media_id, Tag.name == body.tag_name)
    ).scalar_one_or_none()
    if existing_mt is not None:
        return TagInfo(
            id=existing_mt.tag.id,
            name=existing_mt.tag.name,
            score=existing_mt.score,
            source=existing_mt.source,
        )

    media_tag = crud.add_tag_to_media(db, media_id, body.tag_name)
    tag = db.execute(
        select(Tag).where(Tag.id == media_tag.tag_id)
    ).scalar_one()
    return TagInfo(id=tag.id, name=tag.name, score=None, source="user")


@router.delete("/media/{media_id}/tags/{tag_id}", status_code=204)
def remove_tag_from_media(
    media_id: int, tag_id: int, db: Session = Depends(get_db)
) -> None:
    """メディアからタグを削除する。

    Args:
        media_id: 対象メディアの ID。
        tag_id: 削除するタグの ID。
        db: データベースセッション。

    Raises:
        HTTPException: メディアタグが見つからない場合（404）。
    """
    media_tag = db.execute(
        select(MediaTag).where(
            MediaTag.media_id == media_id, MediaTag.tag_id == tag_id
        )
    ).scalar_one_or_none()
    if media_tag is None:
        raise HTTPException(
            status_code=404, detail="指定されたメディアとタグの関連が見つかりません。"
        )
    crud.remove_tag_from_media(db, media_id, tag_id)
