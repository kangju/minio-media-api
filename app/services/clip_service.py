"""CLIP サービスモジュール。

CLIP モデルを使用した画像の自動タグ付けを提供する。

精度向上の実装方針（速度を落とさずに精度を上げる）:
  1. プロンプトテンプレート: "a photo of a {tag}" 形式を使用。
     生のタグ名より CLIP の学習分布に合致し精度が向上する。計算コストは同じ。
  2. コサイン類似度スコアリング: softmax ではなく内積（正規化済み）を使用。
     多ラベル分類では候補数に依存しない絶対スコアが適切。計算コストは同じ。
  3. モデルは ViT-B-32 のまま: CPU 環境での実行速度を維持する。
"""

import io
import logging
from typing import Optional

import numpy as np

from config import settings

logger = logging.getLogger(__name__)

try:
    import open_clip
    import torch
    from PIL import Image
    _CLIP_AVAILABLE = True
except ImportError:
    _CLIP_AVAILABLE = False


class ClipService:
    """CLIP モデルを使用した画像解析サービスクラス。

    設定可能な CLIP モデル（デフォルト: ViT-B-32/openai）を使用して
    画像とタグのコサイン類似度を計算する。

    速度と精度のバランス:
      - ViT-B-32: Intel CPU での実行に最適。推論 1〜3 秒/枚（候補数依存）。
      - プロンプトテンプレートで追加コストなしに精度向上。
      - cosine similarity で候補タグ数に依存しない安定したスコアを提供。
    """

    def __init__(self) -> None:
        """ClipService を初期化する（モデルは遅延ロード）。"""
        self._model: Optional[object] = None
        self._preprocess: Optional[object] = None
        self._tokenizer: Optional[object] = None

    def _load_model(self) -> None:
        """CLIP モデルを設定に基づいて遅延ロードする。

        初回呼び出し時にのみモデルをロードする（シングルトン）。
        モデル名・事前学習重みは settings で設定する。

        Raises:
            RuntimeError: open_clip がインストールされていない場合。
        """
        if not _CLIP_AVAILABLE:
            raise RuntimeError(
                "open_clip および torch がインストールされていません。"
            )
        if self._model is None:
            model_name = settings.clip_model_name
            pretrained = settings.clip_pretrained
            logger.info(
                "CLIP モデルをロード中: %s (pretrained=%s)", model_name, pretrained
            )
            model, _, preprocess = open_clip.create_model_and_transforms(
                model_name, pretrained=pretrained
            )
            model.eval()
            self._model = model
            self._preprocess = preprocess
            self._tokenizer = open_clip.get_tokenizer(model_name)
            logger.info("CLIP モデルのロード完了: %s", model_name)

    def analyze_image(
        self,
        image_bytes: bytes,
        candidate_tags: list[str],
        threshold: Optional[float] = None,
        top_k: Optional[int] = None,
    ) -> list[dict]:
        """画像を CLIP で解析し、候補タグのコサイン類似度スコアを返す。

        プロンプトテンプレートを適用してタグをエンコードし、
        画像特徴量とのコサイン類似度（内積）でスコアを算出する。
        softmax と異なり候補タグ数に依存しない絶対スコアを返すため
        多ラベル分類（複数タグ付け）に適している。

        Args:
            image_bytes: 解析する画像のバイトデータ。
            candidate_tags: 候補タグ名のリスト。
            threshold: コサイン類似度の閾値（省略時は settings.clip_score_threshold）。
            top_k: 返却件数上限（省略時は settings.clip_top_k）。

        Returns:
            list[dict]: スコア付きタグのリスト（{"name": str, "score": float}）。
                閾値以上のタグのみ、スコア降順で上位 K 件を返す。
                candidate_tags が空の場合は空リストを返す。
        """
        if not candidate_tags:
            return []

        _threshold = (
            threshold if threshold is not None else settings.clip_score_threshold
        )
        _top_k = top_k if top_k is not None else settings.clip_top_k

        self._load_model()

        # 画像のエンコード
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        image_tensor = self._preprocess(image).unsqueeze(0)

        # テキストのエンコード（プロンプトテンプレートを適用）
        # "a photo of a {tag}" 形式は CLIP の学習分布に合致し、
        # 生のタグ名より精度が高い（追加コストなし）
        template = settings.clip_prompt_template
        prompts = [template.format(tag=tag) for tag in candidate_tags]
        texts = self._tokenizer(prompts)

        with torch.no_grad():
            image_features = self._model.encode_image(image_tensor)
            text_features = self._model.encode_text(texts)

            # L2 正規化（内積がそのままコサイン類似度になる）
            image_features = image_features / image_features.norm(
                dim=-1, keepdim=True
            )
            text_features = text_features / text_features.norm(
                dim=-1, keepdim=True
            )

            # コサイン類似度スコア（-1〜1 の範囲）
            # softmax と異なり候補タグ数に依存しない絶対スコア
            cosine_scores = (image_features @ text_features.T).squeeze(0)
            scores: np.ndarray = cosine_scores.cpu().numpy()

        results = []
        for tag, score in zip(candidate_tags, scores):
            if float(score) >= _threshold:
                results.append({"name": tag, "score": float(score)})

        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:_top_k]


_clip_service_instance: Optional[ClipService] = None
"""CLIP サービスのシングルトンインスタンス。"""


def get_clip_service() -> ClipService:
    """ClipService のシングルトンインスタンスを返す。

    Returns:
        ClipService: ClipService インスタンス。
    """
    global _clip_service_instance
    if _clip_service_instance is None:
        _clip_service_instance = ClipService()
    return _clip_service_instance
