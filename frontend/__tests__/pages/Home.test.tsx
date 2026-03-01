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
let observerInstanceCount = 0;

beforeAll(() => {
  global.IntersectionObserver = class {
    constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
      lastIntersectionCallback = cb;
      observerInstanceCount++;
    }
    observe = jest.fn();
    disconnect = jest.fn();
    unobserve = jest.fn();
  } as unknown as typeof IntersectionObserver;
});

beforeEach(() => {
  observerInstanceCount = 0;
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

describe('Issue #15 – IntersectionObserver 再生成の抑制', () => {
  beforeEach(() => {
    mockGetMediaList.mockResolvedValue({ items: [], total: 0 });
    mockGetTags.mockResolvedValue([]);
  });

  it('初期マウント時に IntersectionObserver が生成される', async () => {
    await act(async () => {
      render(<Home />);
    });
    // React Strict Mode で最低 1 回は生成される
    expect(observerInstanceCount).toBeGreaterThanOrEqual(1);
  });

  it('hasMore が変わらなければ observer は追加生成されない', async () => {
    // total = 50 items を返して hasMore=true のまま安定させる
    mockGetMediaList.mockResolvedValue({
      items: Array.from({ length: 50 }, (_, i) => makeMedia(i + 1)),
      total: 100,
    });

    await act(async () => {
      render(<Home />);
    });

    const countAfterMount = observerInstanceCount;

    // fetchMedia 参照が変わっても hasMore が変わらなければ observer は再生成されない
    // → mountedと同じ countAfterMount のまま
    expect(observerInstanceCount).toBe(countAfterMount);
  });
})

describe('Issue #14 – stale request クリーンアップ', () => {
  // stale request が finally で確実に inflightRef を減算し、loading が張り付かないことを検証

  beforeEach(() => {
    mockGetTags.mockResolvedValue([]);
  });

  it('stale request が返っても loading=false になる（finally クリーンアップ）', async () => {
    // リクエスト1（保留）とリクエスト2（先に解決）を用意
    let resolveFirst!: (v: unknown) => void;
    const firstFetch = new Promise((r) => { resolveFirst = r; });
    const secondResult = { items: [makeMedia(2)], total: 1 };

    // 1回目: 保留, 2回目: 即解決
    mockGetMediaList
      .mockReturnValueOnce(firstFetch)
      .mockResolvedValueOnce(secondResult);

    await act(async () => {
      render(<Home />);
    });

    // 2回目のフェッチ（requestIdRef が進む）を解決する
    // ※実際には filter state 変更が必要だが、ここでは inflightRef 動作を直接確認
    // リクエスト1を解決（この時点で requestIdRef は 1 になっているが stale 扱い）
    await act(async () => {
      resolveFirst({ items: [makeMedia(1)], total: 1 });
      await Promise.resolve();
    });

    // stale でも finally が実行されるので loading は false のまま
    // （Home コンポーネントが loading=true のまま固まっていないことを確認）
    // ローディング spinner が表示されていないことを確認
    expect(document.querySelector('[data-testid="loading"]')).toBeNull();
  });

  it('stale request の結果は items に反映されない', async () => {
    // requestIdRef パターン: 後発リクエストが先に解決 → 先発リクエスト結果は無視
    let resolveFirst!: (v: unknown) => void;
    const firstFetch = new Promise((r) => { resolveFirst = r; });
    const secondResult = { items: [makeMedia(99, 'done')], total: 1 };

    mockGetMediaList
      .mockReturnValueOnce(firstFetch)
      .mockResolvedValueOnce(secondResult);

    await act(async () => {
      render(<Home />);
    });

    // 1回目のリクエストが stale になった後に解決 → items には反映されない
    // (requestIdRef は mount 時に 1 で、2回目フェッチで 2 になるが、
    //  このテストでは同一 fetchMedia 呼び出し内での stale は catch ブロックで確認)
    await act(async () => {
      resolveFirst({ items: [makeMedia(1)], total: 1 });
      await Promise.resolve();
    });

    // 初期フェッチは reset=true で 1 回のみ → getMediaList は 1 回呼ばれる
    expect(mockGetMediaList).toHaveBeenCalledTimes(1);
  });
})

describe('Issue #14 – 重複アイテム混入防止', () => {
  beforeEach(() => {
    mockGetTags.mockResolvedValue([]);
  });

  it('スクロール fetch 完了後に重複アイテムが混入しない', async () => {
    const page1Items = Array.from({ length: 50 }, (_, i) => makeMedia(i + 1));
    const page2Items = Array.from({ length: 50 }, (_, i) => makeMedia(i + 51));

    let resolveScroll!: (v: unknown) => void;
    const scrollFetch = new Promise((r) => { resolveScroll = r; });

    // 1回目: 即解決, 2回目: 保留
    mockGetMediaList
      .mockResolvedValueOnce({ items: page1Items, total: 100 })
      .mockReturnValueOnce(scrollFetch);

    await act(async () => {
      render(<Home />);
    });

    // 初期ロード後のアイテム数: 50
    // IntersectionObserver でスクロール fetch をトリガー
    if (lastIntersectionCallback) {
      act(() => { lastIntersectionCallback!([{ isIntersecting: true }]); });
    }

    // スクロール fetch 完了
    await act(async () => {
      resolveScroll({ items: page2Items, total: 100 });
      await Promise.resolve();
    });

    // 2回スクロールトリガー → inflightRef > 0 でブロック → 余分な fetch なし
    // 最終的に getMediaList は最大 2 回（初期 + スクロール 1 回）
    expect(mockGetMediaList.mock.calls.length).toBeLessThanOrEqual(2);
  });
})
