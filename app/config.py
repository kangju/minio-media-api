"""アプリケーション設定モジュール。

このモジュールは settings_schema.py の Settings クラスを import し、
モジュールロード時に即時インスタンス化する（fail-fast）。
必須環境変数（MINIO_ACCESS_KEY, MINIO_SECRET_KEY, DATABASE_URL）が
未設定の場合、アプリ・CLI・Worker の起動をここで中断する。
"""

from settings_schema import Settings, load_default_vocabulary  # noqa: F401

__all__ = ["Settings", "load_default_vocabulary", "settings"]

# fail-fast: 必須 env 未設定時にここで即時 ValidationError を送出する
settings = Settings()
