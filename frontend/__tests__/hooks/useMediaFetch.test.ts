/**
 * useMediaFetch フックのユニットテスト
 *
 * fetchMedia / ポーリング / stale fetch / inflightRef ガード
 * の動作を検証する。
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { useMediaFetch } from '@/hooks/useMediaFetch';
import { MediaResponse } from '@/lib/types';

// ---------------------------------------------------------------------------
// モック
// ---------------------------------------------------------------------------

const mockGetMediaList = jest.fn();
const mockGetMedia = jest.fn();
const mockGetTags = jest.fn();

jest.mock('@/lib/api', () => ({
  getMediaList: (...args: unknown[]) => mockGetMediaList(...args),
  getMedia: (...args: unknown[]) => mockGetMedia(...args),
  getTags: (...args: unknown[]) => mockGetTags(...args),
}));

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
// ヘルパー
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

const defaultFilter = {
  activeTags: [] as string[],
  mediaType: '',
  includeDeleted: false,
  createdFrom: '',
  createdTo: '',
  sortBy: 'created_at' as const,
  sortOrder: 'desc' as const,
};

function renderUseMediaFetch(filter = defaultFilter) {
  const sentinelRef = { current: document.createElement('div') };
  return renderHook(() => useMediaFetch(filter, sentinelRef as React.RefObject<HTMLDivElement>));
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.useFakeTimers();
  mockGetTags.mockResolvedValue([]);
  lastIntersectionCallback = null;
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('useMediaFetch - 基本fetch動作', () => {
  it('マウント時に getMediaList と getTags が呼ばれる', async () => {
    mockGetMediaList.mockResolvedValue({ items: [makeMedia(1)], total: 1 });
    renderUseMediaFetch();
    await waitFor(() => {
      expect(mockGetMediaList).toHaveBeenCalledTimes(1);
      expect(mockGetTags).toHaveBeenCalledTimes(1);
    });
  });

  it('fetchMedia(reset=true) で items がリセットされる', async () => {
    mockGetMediaList.mockResolvedValue({ items: [makeMedia(1), makeMedia(2)], total: 2 });
    const { result } = renderUseMediaFetch();
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    mockGetMediaList.mockResolvedValue({ items: [makeMedia(10)], total: 1 });
    await act(async () => {
      await result.current.fetchMedia(true);
    });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].id).toBe(10);
  });

  it('エラー時も finally で loading が false になる', async () => {
    mockGetMediaList.mockRejectedValue(new Error('network error'));
    const { result } = renderUseMediaFetch();
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('hasMore が正しく計算される (total > items.length)', async () => {
    mockGetMediaList.mockResolvedValue({ items: [makeMedia(1)], total: 100 });
    const { result } = renderUseMediaFetch();
    await waitFor(() => expect(result.current.hasMore).toBe(true));
  });

  it('全件取得済みなら hasMore が false になる', async () => {
    mockGetMediaList.mockResolvedValue({ items: [makeMedia(1)], total: 1 });
    const { result } = renderUseMediaFetch();
    await waitFor(() => expect(result.current.hasMore).toBe(false));
  });
});

describe('useMediaFetch - inflightRef ガード', () => {
  it('fetch 進行中に scroll fetch (reset=false) がブロックされる', async () => {
    let resolve!: (v: unknown) => void;
    const firstFetch = new Promise((r) => { resolve = r; });
    mockGetMediaList.mockReturnValueOnce(firstFetch);

    const { result } = renderUseMediaFetch();
    // 1st fetch が発火するまで待つ（useEffect は Promise.resolve 経由で非同期）
    await waitFor(() => expect(mockGetMediaList).toHaveBeenCalledTimes(1));

    // IntersectionObserver で scroll fetch を試みる
    act(() => {
      lastIntersectionCallback?.([{ isIntersecting: true }]);
    });
    // inflightRef ガードで弾かれる
    expect(mockGetMediaList).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve({ items: [], total: 0 });
      await Promise.resolve();
    });
  });
});

describe('useMediaFetch - stale request', () => {
  it('stale な fetch の結果は items に反映されない', async () => {
    let resolveFirst!: (v: unknown) => void;
    const firstFetch = new Promise((r) => { resolveFirst = r; });
    mockGetMediaList
      .mockReturnValueOnce(firstFetch)
      .mockResolvedValueOnce({ items: [makeMedia(99)], total: 1 });

    const sentinelRef = { current: document.createElement('div') };
    const { result, rerender } = renderHook(
      (filter) => useMediaFetch(filter, sentinelRef as React.RefObject<HTMLDivElement>),
      { initialProps: defaultFilter }
    );

    // fetch1 進行中（useEffect は Promise.resolve 経由で非同期）
    await waitFor(() => expect(mockGetMediaList).toHaveBeenCalledTimes(1));

    // フィルター変更で fetch2 をトリガー (reset=true)
    await act(async () => {
      rerender({ ...defaultFilter, mediaType: 'image' });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.items.some((i) => i.id === 99)).toBe(true);
    });

    // fetch1 を解決（stale）
    await act(async () => {
      resolveFirst({ items: [makeMedia(1)], total: 1 });
      await Promise.resolve();
    });

    // stale fetch1 の結果は無視される
    expect(result.current.items.some((i) => i.id === 1)).toBe(false);
    expect(result.current.items.some((i) => i.id === 99)).toBe(true);
  });
});

describe('useMediaFetch - ポーリング', () => {
  it('pending がなければポーリングタイマーが設定されない', async () => {
    mockGetMediaList.mockResolvedValue({ items: [makeMedia(1, 'done')], total: 1 });
    renderUseMediaFetch();
    await waitFor(() => expect(mockGetMediaList).toHaveBeenCalled());

    await act(async () => { jest.advanceTimersByTime(6000); });
    expect(mockGetMedia).not.toHaveBeenCalled();
  });

  it('pending アイテムがある場合に getMedia がポーリングされる', async () => {
    mockGetMediaList.mockResolvedValue({
      items: [makeMedia(1, 'pending'), makeMedia(2, 'done')],
      total: 2,
    });
    mockGetMedia.mockResolvedValue(makeMedia(1, 'done'));

    const { result } = renderUseMediaFetch();
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(mockGetMedia).toHaveBeenCalledWith(1);
    expect(mockGetMedia).not.toHaveBeenCalledWith(2);
  });

  it('pending が done になったとき getTags が再取得される', async () => {
    mockGetMediaList.mockResolvedValue({ items: [makeMedia(1, 'running')], total: 1 });
    mockGetMedia.mockResolvedValue(makeMedia(1, 'done'));

    const { result } = renderUseMediaFetch();
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    const tagsCallsBefore = mockGetTags.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(mockGetTags.mock.calls.length).toBeGreaterThan(tagsCallsBefore);
  });

  it('1件が rejected でも他のアイテムが正常に更新される (Promise.allSettled)', async () => {
    mockGetMediaList.mockResolvedValue({
      items: [makeMedia(1, 'pending'), makeMedia(2, 'pending')],
      total: 2,
    });
    mockGetMedia.mockImplementation((id: number) => {
      if (id === 1) return Promise.reject(new Error('network error'));
      return Promise.resolve(makeMedia(2, 'done'));
    });

    const { result } = renderUseMediaFetch();
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(mockGetMedia).toHaveBeenCalledWith(1);
    expect(mockGetMedia).toHaveBeenCalledWith(2);
    // クラッシュせず id=2 が still present
    expect(result.current.items.some((i) => i.id === 2)).toBe(true);
  });
});
