"""設定テスト用 conftest。

app/ を sys.path に追加するのみ。
app/tests/conftest.py の autouse DB/MinIO フィクスチャは一切適用されない。
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
