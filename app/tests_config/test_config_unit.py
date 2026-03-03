"""Settings クラスのユニットテスト。

app/tests/conftest.py の影響（DB/MinIO 接続）を一切受けない。

方針:
- Settings(_env_file=None) で .env ファイルを無効化
- monkeypatch.delenv で OS 環境変数の漏れ込みを防止
"""

import pytest
from pydantic import ValidationError

from settings_schema import Settings

# 必須3フィールドの変数名（OS 環境変数名）
_REQUIRED_ENV = {
    "MINIO_ACCESS_KEY": "test-access-key",
    "MINIO_SECRET_KEY": "test-secret-key",
    "DATABASE_URL": "postgresql://user:pass@localhost:5432/db",
}

# Settings() に渡すキーワード引数（pydantic フィールド名）
_REQUIRED_KWARGS = {
    "minio_access_key": "test-access-key",
    "minio_secret_key": "test-secret-key",
    "database_url": "postgresql://user:pass@localhost:5432/db",
}


@pytest.fixture(autouse=True)
def clear_required_env(monkeypatch):
    """各テスト前に必須環境変数を削除して偽陰性を防ぐ。"""
    for key in _REQUIRED_ENV:
        monkeypatch.delenv(key, raising=False)


class TestSettingsUnit:
    """Settings クラス単体のバリデーションテスト。"""

    def test_all_required_present(self):
        """必須3変数が揃っていれば Settings が正常生成される。"""
        s = Settings(_env_file=None, **_REQUIRED_KWARGS)
        assert s.minio_access_key == "test-access-key"
        assert s.minio_secret_key == "test-secret-key"
        assert s.database_url == "postgresql://user:pass@localhost:5432/db"

    def test_missing_minio_access_key(self):
        """minio_access_key 欠落 → ValidationError。"""
        kwargs = {k: v for k, v in _REQUIRED_KWARGS.items() if k != "minio_access_key"}
        with pytest.raises(ValidationError) as exc_info:
            Settings(_env_file=None, **kwargs)
        fields = [e["loc"][0] for e in exc_info.value.errors()]
        assert "minio_access_key" in fields

    def test_missing_minio_secret_key(self):
        """minio_secret_key 欠落 → ValidationError。"""
        kwargs = {k: v for k, v in _REQUIRED_KWARGS.items() if k != "minio_secret_key"}
        with pytest.raises(ValidationError) as exc_info:
            Settings(_env_file=None, **kwargs)
        fields = [e["loc"][0] for e in exc_info.value.errors()]
        assert "minio_secret_key" in fields

    def test_missing_database_url(self):
        """database_url 欠落 → ValidationError。"""
        kwargs = {k: v for k, v in _REQUIRED_KWARGS.items() if k != "database_url"}
        with pytest.raises(ValidationError) as exc_info:
            Settings(_env_file=None, **kwargs)
        fields = [e["loc"][0] for e in exc_info.value.errors()]
        assert "database_url" in fields

    def test_missing_all_required(self):
        """必須3変数すべて欠落 → ValidationError（3フィールドすべて報告）。"""
        with pytest.raises(ValidationError) as exc_info:
            Settings(_env_file=None)
        fields = [e["loc"][0] for e in exc_info.value.errors()]
        assert "minio_access_key" in fields
        assert "minio_secret_key" in fields
        assert "database_url" in fields
