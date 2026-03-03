"""CLIP ワーカーのエントリーポイント。

DB をポーリングして pending な CLIP タスクを順次実行する。
SIGTERM / SIGINT でグレースフルシャットダウンする。
"""

import asyncio
import logging
import signal
from concurrent.futures import ThreadPoolExecutor

import anyio
import torch

from config import settings
from processor import claim_pending, load_model, reset_running, run_clip_task

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


async def _poll_loop(executor: ThreadPoolExecutor, stop_event: asyncio.Event) -> None:
    """ポーリングループ本体。stop_event がセットされるまで繰り返す。"""
    loop = asyncio.get_event_loop()
    while not stop_event.is_set():
        await asyncio.sleep(settings.clip_poll_interval)
        if stop_event.is_set():
            break
        try:
            media_ids = claim_pending(limit=settings.clip_max_concurrent)
            for media_id in media_ids:
                loop.run_in_executor(executor, run_clip_task, media_id)
                logger.info("CLIP タスク投入: media_id=%s", media_id)
        except Exception as exc:
            logger.warning("CLIP ポーリングエラー: %s", exc)


async def main() -> None:
    """ワーカーのメイン処理。"""
    # PyTorch スレッドを1に固定（env 変数の補完。env が効かない場合の二重対策）
    torch.set_num_threads(1)
    logger.info(
        "スレッド設定: torch_num_threads=1, max_concurrent=%d, poll_interval=%ds",
        settings.clip_max_concurrent,
        settings.clip_poll_interval,
    )
    # CLIP モデルを起動時にロード（スレッドで実行してイベントループをブロックしない）
    logger.info("CLIP モデルをロード中...")
    await anyio.to_thread.run_sync(load_model)
    logger.info("CLIP モデルのロード完了")

    # 中断されたタスクをリセット
    reset_running()

    # グレースフルシャットダウン用イベント
    stop_event = asyncio.Event()

    def _shutdown(sig: signal.Signals) -> None:
        logger.info("シャットダウンシグナル受信: %s", sig.name)
        stop_event.set()

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, _shutdown, sig)

    executor = ThreadPoolExecutor(max_workers=settings.clip_max_concurrent)
    logger.info(
        "CLIP ワーカー起動 (poll_interval=%ds, max_retry=%d, max_concurrent=%d)",
        settings.clip_poll_interval,
        settings.clip_max_retry,
        settings.clip_max_concurrent,
    )

    try:
        await _poll_loop(executor, stop_event)
    finally:
        logger.info("ワーカーを停止しています...")
        executor.shutdown(wait=True)
        logger.info("ワーカーが停止しました")


if __name__ == "__main__":
    asyncio.run(main())
