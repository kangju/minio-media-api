import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import Lightbox from '@/components/Lightbox';
import { MediaResponse } from '@/lib/types';

jest.mock('@/lib/api', () => ({
  getMediaFileUrl: (id: number) => `/api/media/${id}/file`,
  getTags: jest.fn().mockResolvedValue([
    { id: 1, name: 'nature', media_count: 3, created_at: '2024-01-01T00:00:00Z' },
    { id: 2, name: 'flower', media_count: 1, created_at: '2024-01-01T00:00:00Z' },
  ]),
  analyzeMedia: jest.fn(),
  addTag:       jest.fn(),
  removeTag:    jest.fn().mockResolvedValue(undefined),
  deleteMedia:  jest.fn(),
}));

const MEDIA: MediaResponse = {
  id: 1,
  original_filename: 'test.jpg',
  minio_key: 'bucket/test.jpg',
  media_type: 'image',
  created_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
  tags: [{ id: 10, name: 'nature', score: 0.85, source: 'clip' }],
};

const MEDIA_NO_TAGS: MediaResponse = { ...MEDIA, id: 2, tags: [] };

function renderLightbox(overrides: Partial<React.ComponentProps<typeof Lightbox>> = {}) {
  const defaults = {
    media: MEDIA,
    onClose: jest.fn(),
    onPrev: jest.fn(),
    onNext: jest.fn(),
    hasPrev: false,
    hasNext: true,
    onUpdated: jest.fn(),
    onDeleted: jest.fn(),
    ...overrides,
  };
  return { ...render(<Lightbox {...defaults} />), ...defaults };
}

// 各テスト後にDOMとwindowイベントをクリーンアップ
afterEach(cleanup);

describe('Lightbox – 基本描画', () => {
  it('ファイル名を含むテキストを表示する', async () => {
    renderLightbox();
    await waitFor(() => {
      const els = screen.getAllByText('test.jpg');
      expect(els.length).toBeGreaterThan(0);
    });
  });

  it('既存タグを表示する', async () => {
    renderLightbox();
    await waitFor(() => expect(screen.getByText('nature')).toBeInTheDocument());
  });

  it('タグがない場合 "No tags" を表示する', async () => {
    renderLightbox({ media: MEDIA_NO_TAGS });
    await waitFor(() => expect(screen.getByText('No tags')).toBeInTheDocument());
  });

  it('CLIP ANALYZE ボタンを表示する（image）', async () => {
    renderLightbox();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /CLIP ANALYZE/i })).toBeInTheDocument()
    );
  });

  it('動画のとき CLIP ANALYZE ボタンを表示しない', async () => {
    const video: MediaResponse = { ...MEDIA, media_type: 'video' };
    renderLightbox({ media: video });
    await waitFor(() => screen.getByText('🗑 DELETE'));
    expect(screen.queryByRole('button', { name: /CLIP ANALYZE/i })).not.toBeInTheDocument();
  });

  it('DELETE ボタンを表示する', async () => {
    renderLightbox();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /DELETE/i })).toBeInTheDocument()
    );
  });

  it('× 閉じるボタンをクリックすると onClose が呼ばれる', async () => {
    const onClose = jest.fn();
    renderLightbox({ onClose });
    // 閉じるボタンは title なし、タグ削除 × は title='タグを削除'
    await waitFor(() => screen.getAllByRole('button'));
    const closeBtn = screen.getAllByRole('button').find(
      (b) => b.textContent === '×' && !b.title
    );
    expect(closeBtn).toBeTruthy();
    fireEvent.click(closeBtn!);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Lightbox – ナビゲーション', () => {
  it('hasNext=true のとき › ボタンを表示する', async () => {
    renderLightbox({ hasNext: true });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '›' })).toBeInTheDocument()
    );
  });

  it('hasPrev=true のとき ‹ ボタンを表示する', async () => {
    renderLightbox({ hasPrev: true });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '‹' })).toBeInTheDocument()
    );
  });

  it('hasPrev=false のとき ‹ ボタンを表示しない', async () => {
    renderLightbox({ hasPrev: false });
    await waitFor(() => screen.getAllByText('test.jpg'));
    expect(screen.queryByRole('button', { name: '‹' })).not.toBeInTheDocument();
  });
});

describe('Lightbox – タグ操作', () => {
  it('タグの × をクリックすると removeTag が呼ばれる', async () => {
    const { removeTag } = await import('@/lib/api');
    (removeTag as jest.Mock).mockClear();
    const onUpdated = jest.fn();
    renderLightbox({ onUpdated });
    await waitFor(() => screen.getByText('nature'));

    const tagDelBtn = screen.getAllByRole('button').find((b) => b.title === 'タグを削除');
    expect(tagDelBtn).toBeTruthy();
    fireEvent.click(tagDelBtn!);
    await waitFor(() => expect(removeTag).toHaveBeenCalledWith(1, 10));
  });

  it('タグ追加 input に入力して + ボタンが有効になる', async () => {
    renderLightbox();
    await waitFor(() => screen.getByPlaceholderText('タグを追加...'));
    const input = screen.getByPlaceholderText('タグを追加...');
    fireEvent.change(input, { target: { value: 'flower' } });
    const addBtn = screen.getByRole('button', { name: '+' });
    expect(addBtn).not.toBeDisabled();
  });

  it('空のとき + ボタンが無効', async () => {
    renderLightbox();
    await waitFor(() => screen.getByPlaceholderText('タグを追加...'));
    const addBtn = screen.getByRole('button', { name: '+' });
    expect(addBtn).toBeDisabled();
  });
});

describe('Lightbox – CLIP candidates UI', () => {
  it('「カスタム候補タグを追加」トグルボタンが表示される（image）', async () => {
    renderLightbox();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /カスタム候補タグを追加/i })).toBeInTheDocument()
    );
  });

  it('トグルをクリックすると候補入力エリアが表示される', async () => {
    renderLightbox();
    await waitFor(() => screen.getByRole('button', { name: /カスタム候補タグを追加/i }));
    fireEvent.click(screen.getByRole('button', { name: /カスタム候補タグを追加/i }));
    await waitFor(() =>
      expect(screen.getByTestId('candidate-input')).toBeInTheDocument()
    );
  });

  it('candidatesを入力してCLIP ANALYZEするとanalyzeMediaにcandidates配列が渡る', async () => {
    const { analyzeMedia } = await import('@/lib/api');
    (analyzeMedia as jest.Mock).mockResolvedValue({ ...MEDIA, tags: [] });
    renderLightbox();
    await waitFor(() => screen.getByRole('button', { name: /カスタム候補タグを追加/i }));
    fireEvent.click(screen.getByRole('button', { name: /カスタム候補タグを追加/i }));
    await waitFor(() => screen.getByTestId('candidate-input'));
    fireEvent.change(screen.getByTestId('candidate-input'), { target: { value: 'sky, mountain, ocean' } });
    fireEvent.click(screen.getByRole('button', { name: /CLIP ANALYZE/i }));
    await waitFor(() =>
      expect(analyzeMedia).toHaveBeenCalledWith(1, ['sky', 'mountain', 'ocean'])
    );
  });

  it('candidatesが空のままANALYZEするとundefinedが渡る', async () => {
    const { analyzeMedia } = await import('@/lib/api');
    (analyzeMedia as jest.Mock).mockResolvedValue({ ...MEDIA, tags: [] });
    renderLightbox();
    await waitFor(() => screen.getByRole('button', { name: /CLIP ANALYZE/i }));
    fireEvent.click(screen.getByRole('button', { name: /CLIP ANALYZE/i }));
    await waitFor(() =>
      expect(analyzeMedia).toHaveBeenCalledWith(1, undefined)
    );
  });
});
describe('Lightbox – Keyboard', () => {
  it('Escape キーで onClose が呼ばれる', async () => {
    const onClose = jest.fn();
    renderLightbox({ onClose });
    await waitFor(() => screen.getAllByText('test.jpg'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('ArrowRight で onNext が呼ばれる（hasNext=true）', async () => {
    const onNext = jest.fn();
    renderLightbox({ onNext, hasNext: true });
    await waitFor(() => screen.getAllByText('test.jpg'));
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onNext).toHaveBeenCalled();
  });

  it('ArrowLeft で onPrev が呼ばれる（hasPrev=true）', async () => {
    const onPrev = jest.fn();
    renderLightbox({ onPrev, hasPrev: true });
    await waitFor(() => screen.getAllByText('test.jpg'));
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onPrev).toHaveBeenCalled();
  });

  it('hasNext=false のとき ArrowRight で onNext が呼ばれない', async () => {
    const onNext = jest.fn();
    renderLightbox({ onNext, hasNext: false });
    await waitFor(() => screen.getAllByText('test.jpg'));
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onNext).not.toHaveBeenCalled();
  });
});
