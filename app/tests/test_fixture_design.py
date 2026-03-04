"""
ISSUE #31: pytest fixture 設計の回帰テスト

TestGetMediaFileHeaders が:
1. self への fixture 値代入（self.XXX = ...）を使っていないこと
2. fixture の戻り値を引数注入で受け取っていること
を AST 静的解析で検証する。
インフラ（Docker/DB/MinIO）不要でコンテナ内で完結する。
"""
import ast
import textwrap
from pathlib import Path

import pytest

TEST_FILE = Path(__file__).parent / "test_media.py"


def get_class_source(class_name: str) -> str:
    """test_media.py から指定クラスのソースを抽出する。"""
    source = TEST_FILE.read_text()
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == class_name:
            return ast.get_source_segment(source, node) or ""
    return ""


class TestFixtureDesign:
    """TestGetMediaFileHeaders の fixture 設計を検証する。"""

    TARGET_CLASS = "TestGetMediaFileHeaders"

    def test_class_exists(self):
        """対象クラスがファイルに存在すること。"""
        source = get_class_source(self.TARGET_CLASS)
        assert source, f"{self.TARGET_CLASS} がファイルに見つかりません"

    @staticmethod
    def _is_fixture_decorator(deco: ast.expr) -> bool:
        return (
            isinstance(deco, ast.Name) and deco.id == "fixture"
        ) or (
            isinstance(deco, ast.Attribute) and deco.attr == "fixture"
        ) or (
            isinstance(deco, ast.Call)
            and (
                (isinstance(deco.func, ast.Name) and deco.func.id == "fixture")
                or (isinstance(deco.func, ast.Attribute) and deco.func.attr == "fixture")
            )
        )

    @staticmethod
    def _is_autouse_fixture(node: ast.FunctionDef) -> bool:
        for deco in node.decorator_list:
            if not TestFixtureDesign._is_fixture_decorator(deco):
                continue
            if not isinstance(deco, ast.Call):
                return False
            for kw in deco.keywords:
                if kw.arg == "autouse" and isinstance(kw.value, ast.Constant):
                    return bool(kw.value.value)
        return False

    @staticmethod
    def _is_non_autouse_fixture(node: ast.FunctionDef) -> bool:
        for deco in node.decorator_list:
            if not TestFixtureDesign._is_fixture_decorator(deco):
                continue
            if not isinstance(deco, ast.Call):
                return True
            autouse_kw = next((kw for kw in deco.keywords if kw.arg == "autouse"), None)
            if autouse_kw is None:
                return True
            if isinstance(autouse_kw.value, ast.Constant):
                return not bool(autouse_kw.value.value)
        return False

    def test_no_self_assignment_in_fixture(self):
        """autouse fixture 内で self.XXX への代入が存在しないこと。"""
        source = get_class_source(self.TARGET_CLASS)
        assert source
        tree = ast.parse(textwrap.dedent(source))

        fixture_bodies = []
        for node in ast.walk(tree):
            if not isinstance(node, ast.FunctionDef):
                continue
            if self._is_autouse_fixture(node):
                fixture_bodies.append(node)

        for fixture_func in fixture_bodies:
            for stmt in ast.walk(fixture_func):
                if isinstance(stmt, ast.Assign):
                    for target in stmt.targets:
                        if (
                            isinstance(target, ast.Attribute)
                            and isinstance(target.value, ast.Name)
                            and target.value.id == "self"
                        ):
                            pytest.fail(
                                f"fixture '{fixture_func.name}' 内で "
                                f"self.{target.attr} への代入が検出されました。\n"
                                "fixture の戻り値（return/yield）を使用してください。"
                            )

    def test_non_autouse_fixture_exists(self):
        """引数注入用の non-autouse fixture が存在すること。"""
        source = get_class_source(self.TARGET_CLASS)
        assert source
        tree = ast.parse(textwrap.dedent(source))

        fixture_names = [
            node.name
            for node in ast.walk(tree)
            if isinstance(node, ast.FunctionDef) and self._is_non_autouse_fixture(node)
        ]
        assert fixture_names, (
            "non-autouse fixture が見つかりません。\n"
            "autouse + self代入 を廃止し、引数注入 fixture を追加してください。"
        )

    def test_test_methods_do_not_use_self_media_id(self):
        """テストメソッドが self.media_id ではなく fixture 引数を使うこと。"""
        source = get_class_source(self.TARGET_CLASS)
        assert source
        tree = ast.parse(textwrap.dedent(source))

        for node in ast.walk(tree):
            if not isinstance(node, ast.FunctionDef):
                continue
            if not node.name.startswith("test_"):
                continue
            for child in ast.walk(node):
                if (
                    isinstance(child, ast.Attribute)
                    and isinstance(child.value, ast.Name)
                    and child.value.id == "self"
                    and child.attr == "media_id"
                ):
                    pytest.fail(
                        f"テスト '{node.name}' が self.media_id を参照しています。\n"
                        "fixture 引数注入パターンを使用してください。"
                    )

    def test_no_autouse_fixture_in_class(self):
        """TestGetMediaFileHeaders に autouse=True の fixture が存在しないこと。"""
        source = get_class_source(self.TARGET_CLASS)
        assert source
        tree = ast.parse(textwrap.dedent(source))

        for node in ast.walk(tree):
            if not isinstance(node, ast.FunctionDef):
                continue
            if self._is_autouse_fixture(node):
                pytest.fail(
                    f"'{node.name}' に autouse=True の fixture が残っています。"
                )
