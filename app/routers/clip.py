"""CLIP 解析ルーターモジュール。

画像ファイルを MinIO や DB に保存せず CLIP 解析のみを行うエンドポイントを提供する。
"""

from fastapi import APIRouter, Depends, UploadFile
from sqlalchemy.orm import Session

import crud
from config import settings
from database import get_db
from schemas import ClipAnalyzeResponse, ClipTagScore
from services.clip_service import ClipService, get_clip_service
from validators import validate_file_size, validate_image_only

router = APIRouter(prefix="/clip", tags=["clip"])


@router.post("/analyze", response_model=ClipAnalyzeResponse)
async def analyze_clip(
    file: UploadFile,
    db: Session = Depends(get_db),
    clip: ClipService = Depends(get_clip_service),
) -> ClipAnalyzeResponse:
    """画像を CLIP で解析してタグを返す。

    DB への保存や MinIO へのアップロードは行わない。
    DB に登録済みの全タグを候補として CLIP スコアを計算する。

    Args:
        file: 解析する画像ファイル。
        db: データベースセッション。
        clip: CLIP サービス。

    Returns:
        ClipAnalyzeResponse: タグとスコアのリスト。

    Raises:
        HTTPException: 画像以外のファイルが指定された場合（422）、
            ファイルサイズが上限を超えた場合（422）。
    """
    content_type = file.content_type or ""
    validate_image_only(content_type, file.filename or "")

    data = await file.read()
    validate_file_size(len(data), settings.max_file_size_mb)

    all_tags = crud.get_all_tags(db)
    candidate_names = list({t["name"] for t in all_tags})
    clip_results = clip.analyze_image(data, candidate_names)

    return ClipAnalyzeResponse(
        tags=[ClipTagScore(name=r["name"], score=r["score"]) for r in clip_results]
    )
