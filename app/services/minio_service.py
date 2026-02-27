"""MinIO サービスモジュール。

MinIO へのファイルアップロード・ダウンロードを提供する。
"""

import io
import uuid

from minio import Minio

from config import settings


class MinioService:
    """MinIO 操作を提供するサービスクラス。

    ファイルのアップロードとダウンロードを管理する。
    """

    def __init__(self) -> None:
        """MinIO クライアントを初期化し、バケットの存在を確認する。"""
        self.client = Minio(
            f"{settings.minio_endpoint}:{settings.minio_port}",
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_use_ssl,
        )
        self.bucket = settings.minio_bucket
        self._ensure_bucket()

    def _ensure_bucket(self) -> None:
        """バケットが存在しない場合は作成する。"""
        if not self.client.bucket_exists(self.bucket):
            self.client.make_bucket(self.bucket)

    def upload_file(self, data: bytes, media_type: str, ext: str) -> str:
        """ファイルを MinIO にアップロードする。

        UUID ベースのオブジェクトキーを生成し、ファイルをアップロードする。

        Args:
            data: アップロードするファイルのバイトデータ。
            media_type: メディアタイプ（'image' または 'video'）。
            ext: ファイル拡張子（例: '.jpg'）。

        Returns:
            str: MinIO 上のオブジェクトキー。
        """
        file_uuid = uuid.uuid4().hex
        key = f"{media_type}s/{file_uuid}{ext}"
        self.client.put_object(
            self.bucket,
            key,
            io.BytesIO(data),
            length=len(data),
        )
        return key

    def get_file(self, minio_key: str) -> tuple[bytes, str]:
        """MinIO からファイルをダウンロードする。

        Args:
            minio_key: MinIO 上のオブジェクトキー。

        Returns:
            tuple[bytes, str]: ファイルのバイトデータとコンテンツタイプのタプル。
        """
        response = self.client.get_object(self.bucket, minio_key)
        data = response.read()
        content_type = response.headers.get("Content-Type", "application/octet-stream")
        response.close()
        response.release_conn()
        return data, content_type


minio_service = MinioService.__new__(MinioService)
"""シングルトン MinioService インスタンス（遅延初期化）。"""


def get_minio_service() -> MinioService:
    """MinioService のシングルトンインスタンスを返す。

    Returns:
        MinioService: MinioService インスタンス。
    """
    if not hasattr(minio_service, "client"):
        minio_service.__init__()
    return minio_service
