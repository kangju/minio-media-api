"""ワーカー用 DB 接続モジュール。

ORM モデルは使わず SQLAlchemy engine のみ提供する。
"""

from sqlalchemy import create_engine

from config import settings

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)
