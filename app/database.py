"""データベース接続モジュール。

SQLAlchemy のセッションと Base クラスを提供する。
"""

from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from config import settings


engine = create_engine(settings.database_url)
"""SQLAlchemy エンジンインスタンス。"""

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
"""データベースセッションファクトリ。"""


class Base(DeclarativeBase):
    """SQLAlchemy 宣言的ベースクラス。"""

    pass


def get_db() -> Generator[Session, None, None]:
    """FastAPI 依存関係としてデータベースセッションを提供する。

    Yields:
        Session: データベースセッションオブジェクト。
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
