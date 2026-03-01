/**
 * Home ページのポーリング動作テスト (Issue #5)
 *
 * 解析中(pending/running)のアイテムがある場合でも、ポーリングによって
 * スクロール済みのアイテムが消えないことを確認する。
 */
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import Home from '@/app/page';
import { MediaResponse, TagResponse } from '@/lib/types';

// ---------------------------------------------------------------------------
// モック定義
// ---------------------------------------------------------------------------

const mockGetMediaList = jest.fn();
const mockGetMedia = jest.fn();
const mockGetTags = jest.fn();
const mockGetMediaFileUrl = jest.fn((id: number) => `/api/media/${id}/file`);

jest.mock('@/lib/api', () => ({
  getMediaList: (...args: unknown[]) => mockGetMediaList(...args),
  getMedia: (...args: unknown[]) => mockGetMedia(...args),
  getTags: (...args: unknown[]) => mockGetTags(...args),
  deleteMedia: jest.fn(),
  getMediaFileUrl: (id: number) => mockGetMediaFileUrl(id),
}));

// IntersectionObserver をスタブ化（jsdom に存在しない）
// コールバックを外部からトリガーできるよう最後のインスタンスを記録する
let lastIntersectionCallback: ((entries: { isIntersecting: boolean }[]) => void) | null = null;

beforeAll(() => {
  global.IntersectionObserver = class {
    constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
      lastIntersectionCallback = cb;
    }
    observe = jest.fn();
    disconnect = jest.fn();
    unobserve = jest.fn();
  } as unknown as typeof IntersectionObserver;
});

// ---------------------------------------------------------------------------
// テストデータ ヘルパー
// ---------------------------------------------------------------------------

function makeMedia(
  id: number,
  clip_status: 'pending' | 'running' | 'done' | 'error' = 'done'
): MediaResponse {
  return {
    id,
    original_filename: `file${id}.jpg`,
    minio_key: `key/${id}`,
    media_type: 'image',
    created_at: '2024-01-01T00:00:00Z',
    deleted_at: null,
    tags: [],
    clip_status,
  };
}

function makeTag(id: number, name: string): TagResponse {
  return { id, name, media_count: 0, created_at: '2024-01-01T00:00:00Z' };
}

// ---------------------------------------------------------------------------
// 共通セットアップ
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.useFakeTimers();
  mockGetTags.mockResolvedValue([]);
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('Home ページ ポーリング動作 (Issue #5)', () => {
  it('pending がなければタイマーが設定されない', async () => {
    // 全件 done のレスポンス
    mockGetMediaList.mockResolvedValue({
      items: [makeMedia(1, 'done'), makeMedia(2, 'done')],
      total: 2,
    });

    render(<Home />);
    // 初期ロードが完了するまで待機
    await waitFor(() => expect(mockGetMediaList).toHaveBeenCalled());

    // タイマーを進めても getMedia は呼ばれないこと
    await act(async () => { jest.advanceTimersByTime(6000); });
    expect(mockGetMedia).not.toHaveBeenCalled();
  });

  it('ポーリング時に getMediaList ではなく getMedia が個別に呼ばれる', async () => {
    // pending を含むレスポンス
    mockGetMediaList.mockResolvedValue({
      items: [makeMedia(1, 'pending'), makeMedia(2, 'done')],
      total: 2,
    });
    mockGetMedia.mockResolvedValue(makeMedia(1, 'done'));

    render(<Home />);
    // アイテムがUIに描画されるまで待つ（エフェクト設定完了を保証）
    await waitFor(() => {
      expect(screen.getByText('file1.jpg')).toBeInTheDocument();
      expect(screen.getByText('file2.jpg')).toBeInTheDocument();
    });

    const listCallsBefore = mockGetMediaList.mock.calls.length;

    // 5秒進めてポーリングを発火
    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    // getMedia が pending item (id=1) に対して呼ばれること
    expect(mockGetMedia).toHaveBeenCalledWith(1);
    // getMediaList の追加呼び出し（全リセット）は発生しないこと
    expect(mockGetMediaList.mock.calls.length).toBe(listCallsBefore);
  });

  it('ポーリング後もスクロール済みの非pending アイテムがUIに保持される', async () => {
    // 最初のロード: 3件（id=1がpending, id=2,3がdone）
    mockGetMediaList.mockResolvedValue({
      items: [makeMedia(1, 'pending'), makeMedia(2, 'done'), makeMedia(3, 'done')],
      total: 3,
    });
    // ポーリング結果: id=1 が done に更新
    mockGetMedia.mockResolvedValue(makeMedia(1, 'done'));

    render(<Home />);
    // 初期ロード完了 & id=2,3 が画面に表示されることを確認
    await waitFor(() => {
      expect(screen.getByText('file2.jpg')).toBeInTheDocument();
      expect(screen.getByText('file3.jpg')).toBeInTheDocument();
    });

    // ポーリング発火
    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    // ポーリング後もスクロール済みアイテム(id=2,3)が画面に残ること
    expect(screen.getByText('file2.jpg')).toBeInTheDocument();
    expect(screen.getByText('file3.jpg')).toBeInTheDocument();
    // getMedia は pending item (id=1) のみ呼ばれること
    expect(mockGetMedia).toHaveBeenCalledTimes(1);
    expect(mockGetMedia).toHaveBeenCalledWith(1);
  });

  it('done になったアイテムがある場合に getTags が呼ばれる', async () => {
    mockGetMediaList.mockResolvedValue({
      items: [makeMedia(1, 'running')],
      total: 1,
    });
    // ポーリング後に done に変わる
    mockGetMedia.mockResolvedValue(makeMedia(1, 'done'));
    mockGetTags.mockResolvedValue([makeTag(10, 'cat')]);

    render(<Home />);
    // アイテムがUIに描画されるまで待つ
    await waitFor(() => expect(screen.getByText('file1.jpg')).toBeInTheDocument());

    const tagsCallsBefore = mockGetTags.mock.calls.length;

    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    // done への遷移で fetchTags が追加呼び出しされること
    expect(mockGetTags.mock.calls.length).toBeGreaterThan(tagsCallsBefore);
  });

  it('1件が rejected でも他のアイテムが正常に更新される (Promise.allSettled)', async () => {
    mockGetMediaList.mockResolvedValue({
      items: [makeMedia(1, 'pending'), makeMedia(2, 'pending')],
      total: 2,
    });
    // id=1 は失敗、id=2 は成功
    mockGetMedia.mockImplementation((id: number) => {
      if (id === 1) return Promise.reject(new Error('network error'));
      return Promise.resolve(makeMedia(2, 'done'));
    });

    render(<Home />);
    // アイテムがUIに描画されるまで待つ
    await waitFor(() => {
      expect(screen.getByText('file1.jpg')).toBeInTheDocument();
      expect(screen.getByText('file2.jpg')).toBeInTheDocument();
    });

    // エラーがあってもクラッシュせず id=2 が更新されること
    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(mockGetMedia).toHaveBeenCalledWith(1);
    expect(mockGetMedia).toHaveBeenCalledWith(2);
    // file2.jpg はまだ表示されていること（クラッシュしていない）
    expect(screen.getByText('file2.jpg')).toBeInTheDocument();
  });

  it('pending/running アイテムを含む一覧をレンダーしても React エラーが発生しない', async () => {
    // pendingIdsRef をレンダー中に書き換えないことの回帰テスト
    mockGetMediaList.mockResolvedValue({
      items: [
        makeMedia(1, 'pending'),
        makeMedia(2, 'running'),
        makeMedia(3, 'done'),
      ],
      total: 3,
    });
    mockGetMedia.mockResolvedValue(makeMedia(1, 'done'));

    // エラーなくレンダーできること
    await act(async () => {
      render(<Home />);
    });

    // pending/running の両バッジが表示されること
    const pendingBadges = screen.getAllByTestId('pending-badge');
    expect(pendingBadges.length).toBeGreaterThanOrEqual(2);
  });

  it('hasMore が fetchMedia(reset=true) 内で true にリセットされる', async () => {
    // setHasMore(true) を effect 本体から fetchMedia に移動したことの回帰テスト
    // total > items.length のとき hasMore=true → 「すべて表示済み」は出ない
    mockGetMediaList.mockResolvedValue({
      items: [makeMedia(1, 'done'), makeMedia(2, 'done')],
      total: 100,
    });

    await act(async () => {
      render(<Home />);
    });

    // hasMore=true なので「すべて表示済み」は表示されない
    expect(screen.queryByText(/すべて表示済み/)).not.toBeInTheDocument();
  });

  it('マウント時に getTags が呼ばれてタグが取得される', async () => {
    // fetchTags useCallback 削除後、getTags().then(setTags) パターンの回帰テスト
    mockGetMediaList.mockResolvedValue({ items: [], total: 0 });
    mockGetTags.mockResolvedValue([makeTag(1, 'cat'), makeTag(2, 'dog')]);

    await act(async () => {
      render(<Home />);
    });

    // マウント時に getTags が呼ばれること
    expect(mockGetTags).toHaveBeenCalledTimes(1);
  });

  it('getMediaList がエラーを返しても finally で loadingRef が解除される', async () => {
    // fetchMedia の try/catch 外から finally に cleanup を移動したことの回帰テスト
    // エラー後もローディング状態が残らず、ページがクラッシュしないことを確認
    mockGetMediaList.mockRejectedValue(new Error('network error'));

    await act(async () => {
      render(<Home />);
    });

    // エラー後もローディング表示が残らないこと（finally で setLoading(false) が呼ばれる）
    expect(screen.queryByText('LOADING...')).not.toBeInTheDocument();
  });

  it('フィルタfetch中にスクロールfetchがブロックされる (inflightRef)', async () => {
    // inflightRef カウンタ方式の回帰テスト:
    // reset=true（フィルタfetch）実行中にreset=false（スクロールfetch）が呼ばれても
    // inflightRef.current > 0 でガードされること
    let resolveFirst!: (v: unknown) => void;
    const firstFetch = new Promise((r) => { resolveFirst = r; });
    mockGetMediaList
      .mockReturnValueOnce(firstFetch)                             // 1st fetch (reset=true, 保留)
      .mockResolvedValue({ items: [makeMedia(5, 'done')], total: 1 }); // 2nd fetch

    await act(async () => {
      render(<Home />);
    });

    // 1st fetch（reset=true）は進行中、callsは1回
    expect(mockGetMediaList).toHaveBeenCalledTimes(1);

    // IntersectionObserver コールバックを直接トリガーしてスクロールfetchを試みる
    // inflightRef.current > 0 なのでブロックされるはず
    if (lastIntersectionCallback) {
      act(() => { lastIntersectionCallback!([{ isIntersecting: true }]); });
    }

    // スクロールfetch は inflightRef ガードで弾かれるので呼び出し回数は変わらない
    expect(mockGetMediaList).toHaveBeenCalledTimes(1);

    // 1st fetch を解決してカウンタを 0 に戻す
    await act(async () => {
      resolveFirst({ items: [makeMedia(1, 'done')], total: 1 });
      await Promise.resolve();
    });
  });
})
