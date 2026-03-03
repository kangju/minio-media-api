"""config モジュールの fail-fast 統合テスト（subprocess 分離）。

モジュールレベルの `settings = Settings()` が、必須環境変数の有無で
起動成否を正しく判定することを別プロセスで検証する。

設計方針:
- subprocess で `import config` を実行し、プロセス終了コードを検証する
- env は最小セット（PYTHONPATH + PATH のみ / 必要な場合は必須3変数を追加）
- 親プロセスの環境変数は継承しない（汚染防止）
- cwd は .env が存在しないディレクトリ（tests_config/）に固定する
"""

import os
import subprocess
import sys

# app/ への絶対パス（PYTHONPATH として渡す）
_APP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# subprocess の cwd（.env ファイルが存在しない場所）
_TESTS_CONFIG_DIR = os.path.dirname(os.path.abspath(__file__))

# 最小ベース env（PATH のみ親から継承・その他は持ち込まない）
_BASE_ENV = {
    "PYTHONPATH": _APP_DIR,
    "PATH": os.environ.get("PATH", ""),
}

# pydantic-settings が ValidationError に含めるフィールド名（小文字）
_REQUIRED_FIELDS = ["minio_access_key", "minio_secret_key", "database_url"]


class TestConfigIntegration:
    """config モジュール import の fail-fast 統合テスト。"""

    def test_import_fails_without_required_vars(self):
        """必須3変数すべて未設定のとき import config が失敗する。"""
        result = subprocess.run(
            [sys.executable, "-c", "import config"],
            env=_BASE_ENV,
            capture_output=True,
            text=True,
            cwd=_TESTS_CONFIG_DIR,
        )
        assert result.returncode != 0, (
            f"必須変数なしでも import が成功してしまった\n"
            f"stdout: {result.stdout}\nstderr: {result.stderr}"
        )
        stderr_lower = result.stderr.lower()
        for field in _REQUIRED_FIELDS:
            assert field in stderr_lower, (
                f"stderr に '{field}' が含まれていない\nstderr: {result.stderr}"
            )

    def test_import_succeeds_with_required_vars(self):
        """必須3変数すべて設定済みのとき import config が成功する。"""
        env = {
            **_BASE_ENV,
            "MINIO_ACCESS_KEY": "test-access-key",
            "MINIO_SECRET_KEY": "test-secret-key",
            "DATABASE_URL": "postgresql://user:pass@localhost:5432/db",
        }
        result = subprocess.run(
            [sys.executable, "-c", "import config; print('OK')"],
            env=env,
            capture_output=True,
            text=True,
            cwd=_TESTS_CONFIG_DIR,
        )
        assert result.returncode == 0, (
            f"必須変数ありで import が失敗した\n"
            f"stdout: {result.stdout}\nstderr: {result.stderr}"
        )
        assert "OK" in result.stdout, (
            f"stdout に 'OK' が含まれていない\nstdout: {result.stdout}"
        )
