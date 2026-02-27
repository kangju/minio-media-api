"""メディアルーターモジュール。

メディアファイルのアップロード・取得・削除・CLIP 解析エンドポイントを提供する。
"""

import hashlib
import os
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

import crud
from config import settings
from database import get_db
from schemas import MediaListResponse, MediaResponse, TagInfo
from services.clip_service import ClipService, get_clip_service
from services.minio_service import MinioService, get_minio_service
from validators import (
    get_media_type,
    validate_file_size,
    validate_file_type,
)

router = APIRouter(prefix="/media", tags=["media"])


def _build_media_response(media) -> MediaResponse:
    """Media ORM オブジェクトから MediaResponse を構築する。

    Args:
        media: Media ORM オブジェクト。

    Returns:
        MediaResponse: レスポンススキーマ。
    """
    tags = [
        TagInfo(
            id=mt.tag.id,
            name=mt.tag.name,
            score=mt.score,
            source=mt.source,
        )
        for mt in media.media_tags
    ]
    return MediaResponse(
        id=media.id,
        original_filename=media.original_filename,
        minio_key=media.minio_key,
        media_type=media.media_type,
        created_at=media.created_at,
        deleted_at=media.deleted_at,
        tags=tags,
    )


@router.post("", response_model=MediaResponse, status_code=201)
async def upload_media(
    file: UploadFile,
    tags: Optional[List[str]] = Form(default=None),
    db: Session = Depends(get_db),
    minio: MinioService = Depends(get_minio_service),
    clip: ClipService = Depends(get_clip_service),
) -> MediaResponse:
    """メディアファイルをアップロードする。

    ファイルを MinIO に保存し、DB にレコードを作成する。
    同一ファイル（同一ハッシュ）が既に存在する場合は MinIO への再アップロードを省略する。
    画像の場合は CLIP による自動タグ付けを行う。

    Args:
        file: アップロードするファイル。
        tags: ユーザー指定のタグ名リスト。
        db: データベースセッション。
        minio: MinIO サービス。
        clip: CLIP サービス。

    Returns:
        MediaResponse: 作成されたメディアの情報。

    Raises:
        HTTPException: ファイルタイプが不正（422）、サイズ超過（422）、
            タグ名が空（422）の場合。
    """
    if file is None or not file.filename:
        raise HTTPException(status_code=422, detail="ファイルが指定されていません。")

    content_type = file.content_type or ""
    validate_file_type(content_type, file.filename)

    data = await file.read()
    validate_file_size(len(data), settings.max_file_size_mb)

    # タグ名の空文字チェック
    if tags:
        for t in tags:
            if not t or not t.strip():
                raise HTTPException(status_code=422, detail="タグ名を空にすることはできません。")

    file_hash = hashlib.sha256(data).hexdigest()
    ext = os.path.splitext(file.filename)[1].lower()
    media_type = get_media_type(content_type)

    # 重複チェック（同一ハッシュ）
    existing = crud.get_media_by_hash(db, file_hash)
    if existing:
        minio_key = existing.minio_key
    else:
        minio_key = minio.upload_file(data, media_type, ext)

    media = crud.create_media(
        db,
        original_filename=file.filename,
        minio_key=minio_key,
        file_hash=file_hash,
        media_type=media_type,
    )

    # ユーザータグを保存
    if tags:
        tag_dicts = [{"name": t.strip(), "score": None} for t in tags if t.strip()]
        crud.add_tags_to_media(db, media.id, tag_dicts, source="user")

    # 画像の場合は CLIP 解析
    if media_type == "image":
        all_tags = crud.get_all_tags(db)
        candidate_names = list({t["name"] for t in all_tags})
        clip_results = clip.analyze_image(data, candidate_names)
        if clip_results:
            crud.update_clip_tags(db, media.id, clip_results)

    media = crud.get_media_by_id(db, media.id, include_deleted=True)
    return _build_media_response(media)


@router.get("", response_model=MediaListResponse)
def list_media(
    tag: Optional[List[str]] = Query(default=None),
    media_type: Optional[str] = Query(default=None),
    include_deleted: bool = Query(default=False),
    created_from: Optional[datetime] = Query(default=None),
    created_to: Optional[datetime] = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
) -> MediaListResponse:
    """メディア一覧を取得する。

    タグ・メディアタイプ・日時などでフィルタリングできる。

    Args:
        tag: タグ名フィルタ（AND 条件）。
        media_type: メディアタイプフィルタ。
        include_deleted: 論理削除済みを含めるかどうか。
        created_from: 作成日時の下限。
        created_to: 作成日時の上限。
        offset: 取得開始位置。
        limit: 取得件数（最大 PAGINATION_MAX_LIMIT）。
        db: データベースセッション。

    Returns:
        MediaListResponse: メディア一覧とページネーション情報。
    """
    if limit is None:
        limit = settings.pagination_default_limit
    limit = min(limit, settings.pagination_max_limit)

    items, total = crud.get_media_list(
        db,
        tag=tag or [],
        media_type=media_type,
        include_deleted=include_deleted,
        created_from=created_from,
        created_to=created_to,
        offset=offset,
        limit=limit,
    )
    return MediaListResponse(
        items=[_build_media_response(m) for m in items],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.get("/{media_id}", response_model=MediaResponse)
def get_media(
    media_id: int,
    db: Session = Depends(get_db),
) -> MediaResponse:
    """メディアを ID で取得する。

    Args:
        media_id: 取得するメディアの ID。
        db: データベースセッション。

    Returns:
        MediaResponse: メディアの情報。

    Raises:
        HTTPException: メディアが見つからない場合（404）。
    """
    media = crud.get_media_by_id(db, media_id)
    if media is None:
        raise HTTPException(status_code=404, detail="メディアが見つかりません。")
    return _build_media_response(media)


@router.get("/{media_id}/file")
def get_media_file(
    media_id: int,
    db: Session = Depends(get_db),
    minio: MinioService = Depends(get_minio_service),
) -> StreamingResponse:
    """メディアファイルをストリームで返す。

    Args:
        media_id: 取得するメディアの ID。
        db: データベースセッション。
        minio: MinIO サービス。

    Returns:
        StreamingResponse: ファイルのストリームレスポンス。

    Raises:
        HTTPException: メディアが見つからない場合（404）。
    """
    media = crud.get_media_by_id(db, media_id)
    if media is None:
        raise HTTPException(status_code=404, detail="メディアが見つかりません。")

    data, content_type = minio.get_file(media.minio_key)

    import io
    return StreamingResponse(io.BytesIO(data), media_type=content_type)


@router.delete("/{media_id}", status_code=204)
def delete_media(
    media_id: int,
    db: Session = Depends(get_db),
) -> None:
    """メディアを論理削除する。

    Args:
        media_id: 削除するメディアの ID。
        db: データベースセッション。

    Raises:
        HTTPException: メディアが見つからない場合（404）、
            既に削除済みの場合（409）。
    """
    media = crud.get_media_by_id(db, media_id, include_deleted=True)
    if media is None:
        raise HTTPException(status_code=404, detail="メディアが見つかりません。")
    if media.deleted_at is not None:
        raise HTTPException(status_code=409, detail="このメディアは既に削除されています。")
    crud.soft_delete_media(db, media_id)


@router.post("/{media_id}/analyze", response_model=MediaResponse)
def analyze_media(
    media_id: int,
    db: Session = Depends(get_db),
    minio: MinioService = Depends(get_minio_service),
    clip: ClipService = Depends(get_clip_service),
) -> MediaResponse:
    """既存メディアに対して CLIP 解析を実行する。

    画像のみ対応。解析結果で CLIP タグを更新する。

    Args:
        media_id: 解析するメディアの ID。
        db: データベースセッション。
        minio: MinIO サービス。
        clip: CLIP サービス。

    Returns:
        MediaResponse: 更新後のメディア情報。

    Raises:
        HTTPException: メディアが見つからないまたは削除済みの場合（404）、
            動画の場合（403）。
    """
    media = crud.get_media_by_id(db, media_id)
    if media is None:
        raise HTTPException(status_code=404, detail="メディアが見つかりません。")
    if media.media_type == "video":
        raise HTTPException(
            status_code=403, detail="動画ファイルは CLIP 解析に対応していません。"
        )

    data, _ = minio.get_file(media.minio_key)
    all_tags = crud.get_all_tags(db)
    candidate_names = list({t["name"] for t in all_tags})
    clip_results = clip.analyze_image(data, candidate_names)
    crud.update_clip_tags(db, media_id, clip_results)

    media = crud.get_media_by_id(db, media_id, include_deleted=True)
    return _build_media_response(media)
