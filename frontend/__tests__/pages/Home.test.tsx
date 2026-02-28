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

  it('done になったアイテムがある場合に fetchTags が呼ばれる', async () => {
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
});
