"""FastAPI アプリケーションのエントリーポイント。

アプリケーションの初期化、ミドルウェア設定、ルーター登録を行う。
"""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import Base, engine
from routers import clip, media, tags


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """アプリケーションのライフサイクル管理。

    起動時にDBテーブルの作成とMinIOバケットの初期化を行う。
    on_event("startup") の代替として lifespan を使用する。
    """
    # 起動処理
    Base.metadata.create_all(bind=engine)
    try:
        from services.minio_service import get_minio_service
        get_minio_service()
    except Exception as e:
        logging.warning("MinIO 初期化をスキップしました: %s", e)

    yield  # アプリケーション稼働中


app = FastAPI(
    title="MinIO Image API",
    description="画像・動画を MinIO にアップロードし CLIP による自動タグ付けを行う API。",
    version="1.0.0",
    lifespan=lifespan,
)
"""FastAPI アプリケーションインスタンス。"""

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),
    allow_credentials=settings.cors_allow_credentials,
    allow_methods=settings.get_cors_methods(),
    allow_headers=settings.get_cors_headers(),
)

app.include_router(media.router)
app.include_router(tags.router)
app.include_router(clip.router)


@app.get("/health")
def health_check() -> dict:
    """ヘルスチェックエンドポイント。

    Returns:
        dict: ステータス情報。
    """
    return {"status": "ok"}
