"""テスト共通フィクスチャモジュール。

実際の Docker サービス（PostgreSQL・MinIO・CLIP）を使用してテストを行う。
モックは一切使用しない。
"""

import io
import os
import sys

# app ディレクトリをパスに追加
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient
from minio import Minio
from sqlalchemy import create_engine, text

import models  # noqa: F401 - モデルを Base に登録するために必要
from config import load_default_vocabulary, settings
from database import Base


# ---------------------------------------------------------------------------
# デフォルトタグ再シード（TRUNCATE 後の復元用）
# ---------------------------------------------------------------------------

def _reseed_default_tags(conn) -> None:
    """デフォルトタグを DB に再挿入する。

    TRUNCATE で削除されたデフォルトタグを ON CONFLICT DO NOTHING で復元する。
    テスト間の隔離を維持しつつデフォルトタグを常に利用可能にする。
    """
    vocab = load_default_vocabulary()
    if not vocab:
        return
    for name in vocab:
        conn.execute(
            text("INSERT INTO tags (name) VALUES (:name) ON CONFLICT (name) DO NOTHING"),
            {"name": name},
        )
    conn.commit()


# ---------------------------------------------------------------------------
# セッションスコープフィクスチャ（一度だけ初期化）
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def db_engine():
    """セッションスコープの DB エンジン。

    テーブルを作成する（既存テーブルがある場合はスキップ）。
    テスト終了後はテーブルを削除しない（データはTRUNCATEのみ）。

    Yields:
        Engine: SQLAlchemy エンジンインスタンス。
    """
    engine = create_engine(settings.database_url)
    Base.metadata.create_all(bind=engine)
    yield engine
    engine.dispose()


@pytest.fixture(scope="session")
def minio_raw_client():
    """セッションスコープの MinIO クライアント（クリーンアップ用）。

    バケットが存在しない場合は作成する。

    Returns:
        Minio: MinIO クライアントインスタンス。
    """
    client = Minio(
        f"{settings.minio_endpoint}:{settings.minio_port}",
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_use_ssl,
    )
    if not client.bucket_exists(settings.minio_bucket):
        client.make_bucket(settings.minio_bucket)
    return client


# ---------------------------------------------------------------------------
# テストごとのクリーンアップ（autouse）
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session", autouse=True)
def initial_clean(db_engine, minio_raw_client):
    """セッション開始時に全テーブルとMinIOをクリーンアップする。

    前回のテスト実行で残ったデータを削除する。テーブル自体は削除しない。
    """
    with db_engine.connect() as conn:
        conn.execute(
            text("TRUNCATE TABLE media_tags, media, tags RESTART IDENTITY CASCADE")
        )
        conn.commit()
        _reseed_default_tags(conn)
    objects = list(
        minio_raw_client.list_objects(settings.minio_bucket, recursive=True)
    )
    for obj in objects:
        minio_raw_client.remove_object(settings.minio_bucket, obj.object_name)


@pytest.fixture(autouse=True)
def clean_db(db_engine):
    """各テスト後に全テーブルをクリーンアップする。

    TRUNCATE ... CASCADE で外部キー制約に関わらず全データを削除し、
    シーケンス（ID）もリセットする。
    """
    yield
    with db_engine.connect() as conn:
        conn.execute(
            text(
                "TRUNCATE TABLE media_tags, media, tags RESTART IDENTITY CASCADE"
            )
        )
        conn.commit()
        _reseed_default_tags(conn)


@pytest.fixture(autouse=True)
def clean_minio(minio_raw_client):
    """各テスト後に MinIO バケット内のオブジェクトをすべて削除する。"""
    yield
    objects = list(
        minio_raw_client.list_objects(settings.minio_bucket, recursive=True)
    )
    for obj in objects:
        minio_raw_client.remove_object(settings.minio_bucket, obj.object_name)


# ---------------------------------------------------------------------------
# テストクライアント
# ---------------------------------------------------------------------------

@pytest.fixture
def client(db_engine, minio_raw_client):
    """実際の Docker サービスを使用するテスト用 FastAPI クライアント。

    DB・MinIO・CLIP はすべて実際のサービスを使用する（モックなし）。
    db_engine / minio_raw_client を引数に取ることで、
    サービスの初期化（テーブル作成・バケット作成）を先に完了させる。

    Yields:
        TestClient: FastAPI テストクライアント。
    """
    from main import app
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# ヘルパー関数・定数
# ---------------------------------------------------------------------------

def make_upload_file(
    content: bytes = b"fake",
    filename: str = "test.jpg",
    content_type: str = "image/jpeg",
):
    """テスト用アップロードファイルのタプルを返す。

    FastAPI の multipart/form-data 送信に使用する形式で返す。

    Args:
        content: ファイルのバイトデータ。
        filename: ファイル名。
        content_type: MIME タイプ。

    Returns:
        tuple: ("file", (ファイル名, BytesIO, MIME タイプ)) のタプル。
    """
    return ("file", (filename, io.BytesIO(content), content_type))


def _make_minimal_jpeg() -> bytes:
    """PIL を使用して有効な最小 JPEG バイト列を生成する。

    Returns:
        bytes: 有効な JPEG 画像のバイト列（4x4 px 赤系色）。
    """
    try:
        from PIL import Image
        img = Image.new("RGB", (4, 4), color=(200, 100, 50))
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        return buf.getvalue()
    except ImportError:
        # PIL が利用不可の場合は既知の有効な JPEG バイト列を返す（フォールバック）
        return b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9"


# テスト用サンプル画像（PIL で動的生成した有効な JPEG）
MINIMAL_JPEG = _make_minimal_jpeg()

# テスト用サンプル動画（最小 MP4 ヘッダー）
MINIMAL_MP4 = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42mp41\x00\x00\x00\x00"


def _make_minimal_jpeg_blue() -> bytes:
    """PIL を使用して青系の有効な最小 JPEG バイト列を生成する。

    Returns:
        bytes: 有効な JPEG 画像のバイト列（4x4 px 青系色）。
    """
    try:
        from PIL import Image
        img = Image.new("RGB", (4, 4), color=(50, 100, 200))
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        return buf.getvalue()
    except ImportError:
        return MINIMAL_JPEG


# テスト用サンプル画像2（MINIMAL_JPEG とは異なるバイト列の有効な JPEG）
MINIMAL_JPEG_2 = _make_minimal_jpeg_blue()
