"""アプリケーション設定モジュール。

環境変数から設定を読み込む。
"""

from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """アプリケーション全体の設定クラス。

    環境変数または .env ファイルから設定値を読み込む。
    """

    # MinIO 設定
    minio_endpoint: str = "minio"
    """MinIO サーバーのエンドポイントホスト名。"""

    minio_port: int = 9000
    """MinIO サーバーのポート番号。"""

    minio_use_ssl: bool = False
    """MinIO 接続に SSL を使用するかどうか。"""

    minio_access_key: str = "minioadmin"
    """MinIO アクセスキー。"""

    minio_secret_key: str = "minioadmin"
    """MinIO シークレットキー。"""

    minio_bucket: str = "media"
    """MinIO バケット名。"""

    # データベース設定
    database_url: str = "postgresql://mediauser:mediapassword@postgres:5432/mediadb"
    """PostgreSQL 接続 URL。"""

    # CLIP モデル設定
    clip_model_name: str = "ViT-B-32"
    """使用する CLIP モデル名。

    CPU 環境では ViT-B-32 が速度と精度のバランスが最も良い。
    GPU 環境では ViT-L-14 が最高精度だが CPU では約 6 倍遅い。
    """

    clip_pretrained: str = "openai"
    """CLIP 学習済み重みのソース。'openai' が最高精度。"""

    clip_prompt_template: str = "a photo of a {tag}"
    """CLIP テキストエンコードに使用するプロンプトテンプレート。

    生のタグ名を渡すより "a photo of a {tag}" 形式の方が CLIP の
    学習分布に合致し、ゼロショット精度が向上する。計算コストは変わらない。
    {tag} がタグ名に置換される。
    """

    clip_score_threshold: float = 0.2
    """CLIP コサイン類似度スコアの閾値。この値以上のタグのみを返す。

    cosine similarity は -1〜1 の範囲。CLIP では 0.2 以上が
    意味のある一致を示す実用的な閾値。
    """

    clip_top_k: int = 10
    """CLIP 解析で返すタグの最大数。"""

    # ファイル制限設定
    max_file_size_mb: int = 500
    """アップロード可能な最大ファイルサイズ（MB）。"""

    # ページネーション設定
    pagination_default_limit: int = 30
    """ページネーションのデフォルト件数。"""

    pagination_max_limit: int = 100
    """ページネーションの最大件数。"""

    # CORS 設定
    cors_origins: str = "http://localhost:3000,http://localhost:8080"
    """許可するオリジンのカンマ区切り文字列。"""

    cors_allow_credentials: bool = True
    """認証情報の送信を許可するかどうか。"""

    cors_allow_methods: str = "*"
    """許可する HTTP メソッド。"""

    cors_allow_headers: str = "*"
    """許可する HTTP ヘッダー。"""

    def get_cors_origins(self) -> List[str]:
        """CORS オリジンのリストを返す。

        Returns:
            List[str]: オリジンのリスト。
        """
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def get_cors_methods(self) -> List[str]:
        """CORS メソッドのリストを返す。

        Returns:
            List[str]: メソッドのリスト。
        """
        if self.cors_allow_methods == "*":
            return ["*"]
        return [m.strip() for m in self.cors_allow_methods.split(",") if m.strip()]

    def get_cors_headers(self) -> List[str]:
        """CORS ヘッダーのリストを返す。

        Returns:
            List[str]: ヘッダーのリスト。
        """
        if self.cors_allow_headers == "*":
            return ["*"]
        return [h.strip() for h in self.cors_allow_headers.split(",") if h.strip()]

    model_config = {"env_file": ".env", "case_sensitive": False}


settings = Settings()
