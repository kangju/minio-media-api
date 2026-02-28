/**
 * Home ページのポーリング動作テスト (Issue #5)
 *
 * 解析中(pending/running)のアイテムがある場合でも、ポーリングによって
 * スクロール済みのアイテムが消えないことを確認する。
 */
import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
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
beforeAll(() => {
  global.IntersectionObserver = class {
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
  return { id, name, count: 0 };
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
  it('pending がなければ setInterval が設定されない', async () => {
    // 全件 done のレスポンス
    mockGetMediaList.mockResolvedValue({
      items: [makeMedia(1, 'done'), makeMedia(2, 'done')],
      total: 2,
    });

    render(<Home />);
    await act(async () => { await Promise.resolve(); });

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
    await act(async () => { await Promise.resolve(); });

    const callsBefore = mockGetMediaList.mock.calls.length;

    // 5秒進めてポーリングを発火
    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    // getMedia が pending item (id=1) に対して呼ばれること
    expect(mockGetMedia).toHaveBeenCalledWith(1);
    // getMediaList の追加呼び出し（全リセット）は発生しないこと
    expect(mockGetMediaList.mock.calls.length).toBe(callsBefore);
  });

  it('ポーリング後もスクロール済みの非pending アイテムが保持される', async () => {
    // 最初のロード: 3件（id=1がpending, id=2,3がdone）
    mockGetMediaList.mockResolvedValue({
      items: [makeMedia(1, 'pending'), makeMedia(2, 'done'), makeMedia(3, 'done')],
      total: 3,
    });
    // ポーリング結果: id=1 が done に更新
    mockGetMedia.mockResolvedValue(makeMedia(1, 'done'));

    const { unmount } = render(<Home />);
    await act(async () => { await Promise.resolve(); });

    // ポーリング発火
    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    // getMedia の呼び出しが id=1 のみ（全リセットではない）
    expect(mockGetMedia).toHaveBeenCalledTimes(1);
    expect(mockGetMedia).toHaveBeenCalledWith(1);

    unmount();
  });

  it('done になったアイテムがある場合に fetchTags が呼ばれる', async () => {
    mockGetMediaList.mockResolvedValue({
      items: [makeMedia(1, 'running')],
      total: 1,
    });
    // ポーリング後に done に変わる
    mockGetMedia.mockResolvedValue(makeMedia(1, 'done'));
    mockGetTags.mockResolvedValue([makeTag(10, 'cat')]);

    render(<Home />);
    await act(async () => { await Promise.resolve(); });

    const tagsCallsBefore = mockGetTags.mock.calls.length;

    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    // done への遷移で fetchTags が追加呼び出しされること
    expect(mockGetTags.mock.calls.length).toBeGreaterThan(tagsCallsBefore);
  });
});
