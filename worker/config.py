"""CLIP ワーカーの設定モジュール。

環境変数から設定を読み込む。API (app/) とは完全に独立。
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class WorkerSettings(BaseSettings):
    """ワーカー起動に必要な設定。"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # PostgreSQL
    database_url: str

    # MinIO
    minio_endpoint: str
    minio_port: int = 9000
    minio_access_key: str
    minio_secret_key: str
    minio_bucket: str = "media"
    minio_use_ssl: bool = False

    # CLIP モデル
    clip_model_name: str = "ViT-B-32"
    clip_pretrained: str = "openai"
    clip_score_threshold: float = 0.2
    clip_top_k: int = 10
    clip_prompt_template: str = "a photo of a {tag}"

    # ワーカー動作
    clip_poll_interval: int = 5
    """DB をポーリングする間隔（秒）。"""
    clip_max_retry: int = 3
    """CLIP 失敗時の最大リトライ回数。超過で clip_status='error'。"""
    clip_max_concurrent: int = 4
    """同時 CLIP 推論数（semaphore サイズ）。"""


settings = WorkerSettings()
