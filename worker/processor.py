"""CLIP タスク実行ロジック。

API コード (app/) を一切インポートしない独立モジュール。
DB アクセスは SQLAlchemy text() による生 SQL で行う。
"""

import functools
import io
import json
import logging
import pathlib
import threading
from typing import Optional

import open_clip
import torch
from minio import Minio
from PIL import Image
from sqlalchemy import text

from config import settings
from database import engine

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------
# CLIP モデル（プロセス内シングルトン）
# --------------------------------------------------------------------------

_model = None
_tokenizer = None
_preprocess = None
_model_lock = threading.Lock()

# CLIP 推論の同時実行数を制限するセマフォ
_clip_semaphore = threading.Semaphore(settings.clip_max_concurrent)


def load_model() -> None:
    """CLIP モデルを一度だけロードする。スレッドセーフ。"""
    global _model, _tokenizer, _preprocess
    with _model_lock:
        if _model is not None:
            return
        logger.info("CLIP モデルをロード中: %s (pretrained=%s)",
                    settings.clip_model_name, settings.clip_pretrained)
        model, _, preprocess = open_clip.create_model_and_transforms(
            settings.clip_model_name, pretrained=settings.clip_pretrained
        )
        model.eval()
        _model = model
        _tokenizer = open_clip.get_tokenizer(settings.clip_model_name)
        _preprocess = preprocess
        logger.info("CLIP モデルのロード完了")


# --------------------------------------------------------------------------
# MinIO クライアント
# --------------------------------------------------------------------------

def _get_minio() -> Minio:
    return Minio(
        f"{settings.minio_endpoint}:{settings.minio_port}",
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_use_ssl,
    )


# --------------------------------------------------------------------------
# DB ヘルパー（生 SQL）
# --------------------------------------------------------------------------

def reset_running() -> int:
    """起動時に clip_status='running' を 'pending' に戻す。

    Returns:
        int: リセットされたレコード数。
    """
    with engine.begin() as conn:
        result = conn.execute(
            text("UPDATE media SET clip_status = 'pending' WHERE clip_status = 'running'")
        )
        count = result.rowcount
    if count:
        logger.info("running タスクを %d 件 pending にリセットしました", count)
    return count


def claim_pending(limit: int) -> list[int]:
    """pending メディアを running に更新して ID リストを返す。

    SELECT ... FOR UPDATE SKIP LOCKED でロック競合を回避する。

    Args:
        limit: 取得する最大件数。

    Returns:
        list[int]: running に更新した media.id のリスト。
    """
    with engine.begin() as conn:
        rows = conn.execute(
            text("""
                SELECT id FROM media
                WHERE clip_status = 'pending'
                  AND retry_count < :max_retry
                  AND minio_key IS NOT NULL
                LIMIT :limit
                FOR UPDATE SKIP LOCKED
            """),
            {"max_retry": settings.clip_max_retry, "limit": limit},
        ).fetchall()
        ids = [r[0] for r in rows]
        if ids:
            conn.execute(
                text("UPDATE media SET clip_status = 'running' WHERE id = ANY(:ids)"),
                {"ids": ids},
            )
    return ids


def _get_media_info(media_id: int) -> Optional[dict]:
    """メディアの minio_key と retry_count を取得する。"""
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT minio_key, retry_count FROM media WHERE id = :id"),
            {"id": media_id},
        ).fetchone()
    if not row:
        return None
    return {"minio_key": row[0], "retry_count": row[1]}


@functools.lru_cache(maxsize=None)
def _load_default_vocabulary() -> list[str]:
    """デフォルトタグ語彙を JSON ファイルから読み込む。プロセス起動時に1回だけ実行される。"""
    vocab_path = pathlib.Path(__file__).parent / "data" / "default_tags.json"
    try:
        return json.loads(vocab_path.read_text(encoding="utf-8"))["vocabulary"]
    except Exception as exc:
        logger.warning("デフォルト語彙の読み込みに失敗しました: %s", exc)
        return []


def _get_all_tag_names() -> list[str]:
    """DB タグ + デフォルト語彙を重複なしで返す。

    DB にタグが存在しない場合でもデフォルト語彙（209 件）を候補として使用する。
    これにより、新規 DB でも CLIP 解析が正常に実行される。
    """
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT name FROM tags")).fetchall()
    db_tags = [r[0] for r in rows]

    vocab = _load_default_vocabulary()

    seen: set[str] = set()
    candidates: list[str] = []
    for name in db_tags + vocab:
        if name not in seen:
            seen.add(name)
            candidates.append(name)
    return candidates


def _set_status(media_id: int, status: str,
                error_detail: Optional[str] = None,
                retry_count: Optional[int] = None) -> None:
    """clip_status と関連フィールドを更新する。"""
    params: dict = {"id": media_id, "status": status}
    sets = ["clip_status = :status"]
    if error_detail is not None:
        sets.append("error_detail = :error_detail")
        params["error_detail"] = error_detail
    if retry_count is not None:
        sets.append("retry_count = :retry_count")
        params["retry_count"] = retry_count
    sql = f"UPDATE media SET {', '.join(sets)} WHERE id = :id"
    with engine.begin() as conn:
        conn.execute(text(sql), params)


def _save_clip_tags(media_id: int, clip_results: list[dict]) -> None:
    """CLIP 解析結果をタグとして保存する。

    既存の CLIP タグをすべて削除してから新規挿入する。
    タグが DB に存在しない場合は新規作成する。
    """
    with engine.begin() as conn:
        # 既存 CLIP タグ削除
        conn.execute(
            text("""
                DELETE FROM media_tags
                WHERE media_id = :mid
                  AND source = 'clip'
            """),
            {"mid": media_id},
        )
        for item in clip_results:
            tag_name = item["name"]
            score = item.get("score")
            # タグが存在しなければ作成
            conn.execute(
                text("""
                    INSERT INTO tags (name, created_at)
                    VALUES (:name, now())
                    ON CONFLICT (name) DO NOTHING
                """),
                {"name": tag_name},
            )
            tag_id = conn.execute(
                text("SELECT id FROM tags WHERE name = :name"),
                {"name": tag_name},
            ).scalar()
            conn.execute(
                text("""
                    INSERT INTO media_tags (media_id, tag_id, source, score)
                    VALUES (:mid, :tid, 'clip', :score)
                    ON CONFLICT (media_id, tag_id) DO UPDATE
                    SET
                        source = CASE
                            WHEN media_tags.source = 'user'::tagsourceenum THEN 'user'::tagsourceenum
                            ELSE 'clip'::tagsourceenum
                        END,
                        score = EXCLUDED.score
                """),
                {"mid": media_id, "tid": tag_id, "score": score},
            )


# --------------------------------------------------------------------------
# CLIP 推論ヘルパー
# --------------------------------------------------------------------------

def _analyze(image_data: bytes, candidates: list[str]) -> list[dict]:
    """画像バイト列と候補タグから CLIP スコアを計算して返す。

    Args:
        image_data: JPEG 等の画像バイト列。
        candidates: スコアを計算するタグ名リスト。

    Returns:
        list[dict]: {"name": str, "score": float} のリスト（スコア降順）。
    """
    if not candidates:
        return []

    image = _preprocess(Image.open(io.BytesIO(image_data)).convert("RGB")).unsqueeze(0)
    texts = _tokenizer([
        settings.clip_prompt_template.format(tag=c) for c in candidates
    ])
    with torch.no_grad():
        image_features = _model.encode_image(image)
        text_features = _model.encode_text(texts)
        image_features /= image_features.norm(dim=-1, keepdim=True)
        text_features /= text_features.norm(dim=-1, keepdim=True)
        scores = (image_features @ text_features.T).squeeze(0).tolist()

    results = [
        {"name": c, "score": float(s)}
        for c, s in zip(candidates, scores)
        if float(s) >= settings.clip_score_threshold
    ]
    results.sort(key=lambda x: x["score"], reverse=True)
    return results[: settings.clip_top_k]


# --------------------------------------------------------------------------
# メインタスク関数
# --------------------------------------------------------------------------

def run_clip_task(media_id: int) -> None:
    """DB キューから取得したメディアに対して CLIP 解析を実行する。

    1. DB からメディア情報取得（minio_key, retry_count）
    2. MinIO から画像取得
    3. CLIP 推論（_clip_semaphore で同時実行制限）
    4. 成功: タグ保存 + clip_status='done'
       失敗: retry_count += 1, リトライ上限以内なら 'pending', 超過なら 'error'

    Args:
        media_id: 対象メディアの ID。
    """
    # ① メディア情報取得
    info = _get_media_info(media_id)
    if not info or not info["minio_key"]:
        logger.warning("CLIP タスクスキップ: media_id=%s（minio_key なし）", media_id)
        return
    minio_key = info["minio_key"]
    retry_count = info["retry_count"]

    # ② MinIO から画像取得
    minio = _get_minio()
    try:
        response = minio.get_object(settings.minio_bucket, minio_key)
        image_data = response.read()
        response.close()
        response.release_conn()
    except Exception as exc:
        logger.error("MinIO 取得エラー: media_id=%s %s", media_id, exc)
        new_retry = retry_count + 1
        if new_retry >= settings.clip_max_retry:
            _set_status(media_id, "error",
                        error_detail=f"{type(exc).__name__}: {exc}",
                        retry_count=new_retry)
        else:
            _set_status(media_id, "pending", retry_count=new_retry)
        return

    # ③ 候補タグ取得 + CLIP 推論
    candidates = _get_all_tag_names()
    clip_error: Optional[Exception] = None
    clip_results: list[dict] = []
    with _clip_semaphore:
        try:
            clip_results = _analyze(image_data, candidates)
        except Exception as exc:
            logger.error("CLIP 解析エラー: media_id=%s %s", media_id, exc)
            clip_error = exc

    # ④ 結果保存
    if clip_error is None:
        try:
            _save_clip_tags(media_id, clip_results)
            _set_status(media_id, "done")
            logger.info("CLIP 解析完了: media_id=%s key=%s", media_id, minio_key)
        except Exception as exc:
            logger.error("CLIP 結果保存エラー: media_id=%s %s", media_id, exc)
            _set_status(media_id, "error",
                        error_detail=f"{type(exc).__name__}: {exc}")
    else:
        new_retry = retry_count + 1
        if new_retry >= settings.clip_max_retry:
            _set_status(media_id, "error",
                        error_detail=f"{type(clip_error).__name__}: {clip_error}",
                        retry_count=new_retry)
            logger.warning("CLIP 解析失敗（リトライ上限）: media_id=%s retry=%s",
                           media_id, new_retry)
        else:
            _set_status(media_id, "pending", retry_count=new_retry)
            logger.info("CLIP 解析失敗（リトライ予定）: media_id=%s retry=%s",
                        media_id, new_retry)
