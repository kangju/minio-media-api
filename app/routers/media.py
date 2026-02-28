"""メディアルーターモジュール。

メディアファイルのアップロード・取得・削除・CLIP 解析エンドポイントを提供する。
"""

import asyncio
import hashlib
import io
import logging
import os
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

import crud
from config import settings
from database import get_db
from schemas import AnalyzeRequest, MediaListResponse, MediaResponse, TagInfo
from services.clip_service import ClipService, get_clip_service
from services.minio_service import MinioService, get_minio_service
from validators import get_media_type, validate_file_size, validate_file_type

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/media", tags=["media"])


# ---------------------------------------------------------------------------
# ヘルパー関数
# ---------------------------------------------------------------------------


def _build_clip_candidates(db_tags: list[dict], extra: list[str] | None = None) -> list[str]:
    """CLIP 解析用の候補タグリストを構築する。

    DB 既存タグ（デフォルトタグ含む）+ 追加候補 をマージして返す。
    デフォルトタグは DB に起動時シード済みのため JSON 読み込みは不要。

    Args:
        db_tags: DB から取得したタグ辞書リスト（{"name": str, ...}）。
        extra: ユーザー指定の追加候補タグリスト。

    Returns:
        list[str]: 重複なしの候補タグリスト。
    """
    seen: set[str] = set()
    candidates: list[str] = []
    for source in (
        [t["name"] for t in db_tags],
        extra or [],
    ):
        for name in source:
            norm = name.strip().lower()
            if norm and norm not in seen:
                seen.add(norm)
                candidates.append(name.strip())
    return candidates


def _normalize_clip_results(clip_results: list[dict], db_tags: list[dict]) -> list[dict]:
    """CLIP 結果を DB 既存タグ名に正規化する。

    大文字小文字無視で一致する場合は DB のタグ名に揃える。

    Args:
        clip_results: CLIP が返した {"name": str, "score": float} リスト。
        db_tags: DB から取得したタグ辞書リスト。

    Returns:
        list[dict]: 正規化後の {"name": str, "score": float} リスト。
    """
    db_name_map = {t["name"].lower(): t["name"] for t in db_tags}
    return [
        {"name": db_name_map.get(r["name"].lower(), r["name"]), "score": r["score"]}
        for r in clip_results
    ]


def _build_media_response(media) -> MediaResponse:
    """Media ORM オブジェクトから MediaResponse を構築する。"""
    tags = [
        TagInfo(id=mt.tag.id, name=mt.tag.name, score=mt.score, source=mt.source)
        for mt in media.media_tags
    ]
    return MediaResponse(
        id=media.id,
        original_filename=media.original_filename,
        minio_key=media.minio_key,
        media_type=media.media_type,
        created_at=media.created_at,
        deleted_at=media.deleted_at,
        clip_status=getattr(media, "clip_status", "pending"),
        retry_count=getattr(media, "retry_count", 0),
        error_detail=getattr(media, "error_detail", None),
        tags=tags,
    )




# ---------------------------------------------------------------------------
# エンドポイント
# ---------------------------------------------------------------------------


@router.post("", response_model=MediaResponse, status_code=201)
async def upload_media(
    file: UploadFile,
    tags: Optional[List[str]] = Form(default=None),
    db: Session = Depends(get_db),
    minio: MinioService = Depends(get_minio_service),
) -> MediaResponse:
    """メディアファイルをアップロードする。

    ファイルを MinIO に保存し、DB にレコードを作成する。
    画像の場合は clip_status='pending' で返し、clip-worker が CLIP 解析を実行する。

    Args:
        file: アップロードするファイル。
        tags: ユーザー指定のタグ名リスト。
        db: データベースセッション。
        minio: MinIO サービス。

    Returns:
        MediaResponse: 作成されたメディアの情報（clip_status='pending'）。

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

    if tags:
        for t in tags:
            if not t or not t.strip():
                raise HTTPException(status_code=422, detail="タグ名を空にすることはできません。")

    file_hash = hashlib.sha256(data).hexdigest()
    ext = os.path.splitext(file.filename)[1].lower()
    media_type = get_media_type(content_type)

    # 重複チェック（同一ハッシュ）
    existing = crud.get_media_by_hash(db, file_hash)

    # MinIO へのアップロード（イベントループブロック回避のため thread で実行）
    minio_key: str | None = existing.minio_key if existing else None
    upload_error: str | None = None
    if not existing:
        try:
            minio_key = await asyncio.to_thread(minio.upload_file, data, media_type, ext)
        except Exception as exc:
            logger.error("MinIO アップロードエラー: filename=%s %s", file.filename, exc)
            upload_error = f"{type(exc).__name__}: {exc}"

    media = crud.create_media(
        db,
        original_filename=file.filename,
        minio_key=minio_key,
        file_hash=file_hash,
        media_type=media_type,
        clip_status="error" if upload_error else "pending",
        error_detail=upload_error,
    )

    if tags:
        tag_dicts = [{"name": t.strip(), "score": None} for t in tags if t.strip()]
        crud.add_tags_to_media(db, media.id, tag_dicts, source="user")

    media = crud.get_media_by_id(db, media.id, include_deleted=True)
    response = _build_media_response(media)
    if upload_error:
        raise HTTPException(status_code=500, detail={"message": "MinIO アップロードに失敗しました。", "media_id": media.id, "error": upload_error})
    return response


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
    clip_status='pending' の画像も含めて返す。

    Args:
        tag: タグ名フィルタ（AND 条件）。
        media_type: メディアタイプフィルタ。
        include_deleted: 論理削除済みを含めるかどうか。
        created_from: 作成日時の下限。
        created_to: 作成日時の上限。
        offset: 取得開始位置。
        limit: 取得件数。
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
    """メディアを ID で取得する。"""
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
    """メディアファイルをストリームで返す。"""
    media = crud.get_media_by_id(db, media_id)
    if media is None:
        raise HTTPException(status_code=404, detail="メディアが見つかりません。")
    data, content_type = minio.get_file(media.minio_key)
    return StreamingResponse(io.BytesIO(data), media_type=content_type)


@router.delete("/{media_id}", status_code=204)
def delete_media(
    media_id: int,
    db: Session = Depends(get_db),
) -> None:
    """メディアを論理削除する。"""
    media = crud.get_media_by_id(db, media_id, include_deleted=True)
    if media is None:
        raise HTTPException(status_code=404, detail="メディアが見つかりません。")
    if media.deleted_at is not None:
        raise HTTPException(status_code=409, detail="このメディアは既に削除されています。")
    crud.soft_delete_media(db, media_id)


@router.post("/{media_id}/analyze", response_model=MediaResponse)
def analyze_media(
    media_id: int,
    body: AnalyzeRequest = AnalyzeRequest(),
    db: Session = Depends(get_db),
    minio: MinioService = Depends(get_minio_service),
    clip: ClipService = Depends(get_clip_service),
) -> MediaResponse:
    """既存メディアに対して CLIP 解析を同期実行する。

    画像のみ対応。解析結果で CLIP タグを更新し、clip_status を 'done' にする。
    アップロード時の非同期 CLIP が完了していない場合の手動再実行にも使用できる。

    Args:
        media_id: 解析するメディアの ID。
        body: リクエストボディ（candidates: 追加候補タグリスト）。
        db: データベースセッション。
        minio: MinIO サービス。
        clip: CLIP サービス。

    Returns:
        MediaResponse: 更新後のメディア情報（clip_status='done'）。
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
    candidate_names = _build_clip_candidates(all_tags, extra=body.candidates or [])
    clip_results = clip.analyze_image(data, candidate_names)
    if clip_results:
        clip_results = _normalize_clip_results(clip_results, all_tags)
    crud.update_clip_tags(db, media_id, clip_results)
    crud.update_clip_status(db, media_id, "done")

    media = crud.get_media_by_id(db, media_id, include_deleted=True)
    return _build_media_response(media)
