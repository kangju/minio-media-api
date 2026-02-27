"""FastAPI アプリケーションのエントリーポイント。

アプリケーションの初期化、ミドルウェア設定、ルーター登録を行う。
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import Base, engine
from routers import clip, media, tags

app = FastAPI(
    title="MinIO Image API",
    description="画像・動画を MinIO にアップロードし CLIP による自動タグ付けを行う API。",
    version="1.0.0",
)
"""FastAPI アプリケーションインスタンス。"""


@app.on_event("startup")
def on_startup() -> None:
    """アプリケーション起動時の初期化処理。

    データベーステーブルの作成と MinIO バケットの確認を行う。
    """
    Base.metadata.create_all(bind=engine)

    try:
        from services.minio_service import get_minio_service
        get_minio_service()
    except Exception as e:
        import logging
        logging.warning(f"MinIO 初期化をスキップしました: {e}")


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
