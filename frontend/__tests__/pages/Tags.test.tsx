/**
 * Tags ページのテスト
 *
 * - 初期ロード時に getTags が呼ばれること
 * - タグ一覧がテーブルに表示されること
 * - getTags 失敗時にエラーメッセージが表示されること
 * - タグ追加・削除操作が正しく動作すること
 * - react-hooks/set-state-in-effect 修正の回帰テスト
 */
import React from 'react';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import TagsPage from '@/app/tags/page';
import { TagResponse } from '@/lib/types';

// ---------------------------------------------------------------------------
// モック定義
// ---------------------------------------------------------------------------

const mockGetTags = jest.fn();
const mockCreateTag = jest.fn();
const mockUpdateTag = jest.fn();
const mockDeleteTag = jest.fn();

jest.mock('@/lib/api', () => ({
  getTags: (...args: unknown[]) => mockGetTags(...args),
  createTag: (...args: unknown[]) => mockCreateTag(...args),
  updateTag: (...args: unknown[]) => mockUpdateTag(...args),
  deleteTag: (...args: unknown[]) => mockDeleteTag(...args),
}));

// ---------------------------------------------------------------------------
// テストデータ ヘルパー
// ---------------------------------------------------------------------------

function makeTag(id: number, name: string, media_count = 0): TagResponse {
  return { id, name, media_count, created_at: '2024-01-01T00:00:00Z' };
}

// ---------------------------------------------------------------------------
// 共通セットアップ
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockGetTags.mockResolvedValue([]);
  mockCreateTag.mockResolvedValue({});
  mockUpdateTag.mockResolvedValue({});
  mockDeleteTag.mockResolvedValue({});
  // confirm はデフォルトで true (削除確認)
  window.confirm = jest.fn(() => true);
});

afterEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('Tags ページ', () => {
  it('マウント時に getTags が呼ばれる (react-hooks/set-state-in-effect 回帰テスト)', async () => {
    // Promise.resolve().then() パターンで effect から fetchTags を呼んでいることの確認
    await act(async () => {
      render(<TagsPage />);
    });
    expect(mockGetTags).toHaveBeenCalledTimes(1);
  });

  it('タグ一覧がテーブルに表示される', async () => {
    mockGetTags.mockResolvedValue([
      makeTag(1, 'cat', 3),
      makeTag(2, 'dog', 1),
    ]);

    await act(async () => {
      render(<TagsPage />);
    });

    await waitFor(() => {
      expect(screen.getByText('cat')).toBeInTheDocument();
      expect(screen.getByText('dog')).toBeInTheDocument();
    });
  });

  it('getTags 失敗時にエラーメッセージが表示される', async () => {
    mockGetTags.mockRejectedValue(new Error('network error'));

    await act(async () => {
      render(<TagsPage />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeInTheDocument();
    });
    expect(screen.getByTestId('error-message')).toHaveTextContent('タグの取得に失敗しました');
  });

  it('新しいタグ名を入力して追加ボタンをクリックすると createTag が呼ばれる', async () => {
    mockGetTags.mockResolvedValue([makeTag(1, 'cat')]);
    mockCreateTag.mockResolvedValue({});

    await act(async () => {
      render(<TagsPage />);
    });
    await waitFor(() => expect(screen.getByText('cat')).toBeInTheDocument());

    const input = screen.getByTestId('new-tag-input');
    fireEvent.change(input, { target: { value: 'dog' } });
    const addBtn = screen.getByTestId('add-tag-btn');

    mockGetTags.mockResolvedValue([makeTag(1, 'cat'), makeTag(2, 'dog')]);
    await act(async () => {
      fireEvent.click(addBtn);
    });

    expect(mockCreateTag).toHaveBeenCalledWith('dog');
    await waitFor(() => expect(mockGetTags).toHaveBeenCalledTimes(2));
  });

  it('削除ボタンをクリックすると deleteTag が呼ばれる', async () => {
    mockGetTags.mockResolvedValue([makeTag(1, 'cat', 0)]);

    await act(async () => {
      render(<TagsPage />);
    });
    await waitFor(() => expect(screen.getByTestId('delete-tag-btn-1')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByTestId('delete-tag-btn-1'));
    });

    expect(mockDeleteTag).toHaveBeenCalledWith(1);
    expect(mockGetTags).toHaveBeenCalledTimes(2);
  });

  it('タグが空のとき空のテーブルが表示される', async () => {
    mockGetTags.mockResolvedValue([]);

    await act(async () => {
      render(<TagsPage />);
    });

    await waitFor(() => expect(mockGetTags).toHaveBeenCalled());
    // テーブル自体は存在するが行がないこと
    expect(screen.queryByTestId(/^tag-row-/)).not.toBeInTheDocument();
  });
});
