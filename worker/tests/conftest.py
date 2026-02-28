"""ワーカーテスト共通フィクスチャ。

実際の PostgreSQL・MinIO に接続してテストする。
"""

import io
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from minio import Minio
from sqlalchemy import create_engine, text

from config import settings


@pytest.fixture(scope="session")
def db_engine():
    engine = create_engine(settings.database_url)
    yield engine
    engine.dispose()


@pytest.fixture(scope="session")
def minio_client():
    client = Minio(
        f"{settings.minio_endpoint}:{settings.minio_port}",
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_use_ssl,
    )
    if not client.bucket_exists(settings.minio_bucket):
        client.make_bucket(settings.minio_bucket)
    return client


@pytest.fixture(scope="session", autouse=True)
def initial_clean(db_engine, minio_client):
    """セッション開始時に全テーブルとMinIOをクリーンアップする。"""
    with db_engine.connect() as conn:
        conn.execute(
            text("TRUNCATE TABLE media_tags, media, tags RESTART IDENTITY CASCADE")
        )
        conn.commit()
    objects = list(minio_client.list_objects(settings.minio_bucket, recursive=True))
    for obj in objects:
        minio_client.remove_object(settings.minio_bucket, obj.object_name)


@pytest.fixture(autouse=True)
def clean_db(db_engine):
    yield
    with db_engine.connect() as conn:
        conn.execute(
            text("TRUNCATE TABLE media_tags, media, tags RESTART IDENTITY CASCADE")
        )
        conn.commit()


@pytest.fixture(autouse=True)
def clean_minio(minio_client):
    yield
    objects = list(minio_client.list_objects(settings.minio_bucket, recursive=True))
    for obj in objects:
        minio_client.remove_object(settings.minio_bucket, obj.object_name)


def make_test_jpeg(r: int = 200, g: int = 100, b: int = 50) -> bytes:
    """PIL で有効な最小 JPEG バイト列を生成する。"""
    from PIL import Image
    img = Image.new("RGB", (4, 4), color=(r, g, b))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def insert_media(db_engine, minio_key: str = None, clip_status: str = "pending",
                 retry_count: int = 0) -> int:
    """テスト用メディアレコードを挿入して ID を返す。"""
    with db_engine.connect() as conn:
        row = conn.execute(
            text("""
                INSERT INTO media
                  (original_filename, minio_key, file_hash, media_type,
                   clip_status, retry_count, created_at)
                VALUES
                  (:fname, :key, :hash, 'image',
                   :status, :retry, now())
                RETURNING id
            """),
            {
                "fname": "test.jpg",
                "key": minio_key,
                "hash": f"hash_{minio_key}_{retry_count}",
                "status": clip_status,
                "retry": retry_count,
            },
        ).fetchone()
        conn.commit()
    return row[0]
