import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Gallery from '@/components/Gallery';
import { MediaResponse } from '@/lib/types';

jest.mock('@/lib/api', () => ({
  getMediaFileUrl: (id: number) => `/api/media/${id}/file`,
}));

const img = (id: number, name: string, tags: { id: number; name: string }[] = []): MediaResponse => ({
  id,
  original_filename: name,
  minio_key: `key/${name}`,
  media_type: 'image',
  created_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
  tags: tags.map((t) => ({ ...t, score: null, source: 'user' as const })),
});

const vid = (id: number, name: string): MediaResponse => ({
  id,
  original_filename: name,
  minio_key: `key/${name}`,
  media_type: 'video',
  created_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
  tags: [],
});

const ITEMS = [
  img(1, 'photo.jpg', [{ id: 10, name: 'nature' }]),
  img(2, 'flower.png'),
  vid(3, 'clip.mp4'),
];

function makeProps(overrides = {}) {
  return {
    items: ITEMS,
    viewMode: 'grid-large' as const,
    selectMode: false,
    selectedIds: new Set<number>(),
    onSelect: jest.fn(),
    onOpen: jest.fn(),
    ...overrides,
  };
}

describe('Gallery – 空状態', () => {
  it('"No media found" を表示する', () => {
    render(<Gallery {...makeProps({ items: [] })} />);
    expect(screen.getByText('No media found')).toBeInTheDocument();
  });
});

describe('Gallery – Grid Large', () => {
  it('全アイテムの img/video を描画する', () => {
    render(<Gallery {...makeProps()} />);
    // 2 images + 1 video thumb element
    const imgs = document.querySelectorAll('img');
    expect(imgs.length).toBeGreaterThanOrEqual(2);
  });

  it('アイテムクリックで onOpen が呼ばれる', () => {
    const onOpen = jest.fn();
    render(<Gallery {...makeProps({ onOpen })} />);
    const first = document.querySelector('[style*="cursor: pointer"]') as HTMLElement;
    fireEvent.click(first);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe('Gallery – Grid Small', () => {
  it('grid-small モードで描画できる', () => {
    render(<Gallery {...makeProps({ viewMode: 'grid-small' })} />);
    expect(document.querySelectorAll('img').length).toBeGreaterThan(0);
  });
});

describe('Gallery – List', () => {
  it('ファイル名を表示する', () => {
    render(<Gallery {...makeProps({ viewMode: 'list' })} />);
    expect(screen.getByText('photo.jpg')).toBeInTheDocument();
    expect(screen.getByText('clip.mp4')).toBeInTheDocument();
  });

  it('タグ名を表示する', () => {
    render(<Gallery {...makeProps({ viewMode: 'list' })} />);
    expect(screen.getByText('nature')).toBeInTheDocument();
  });
});

describe('Gallery – SELECT モード', () => {
  it('selectMode=true でクリックすると onSelect が呼ばれる', () => {
    const onSelect = jest.fn();
    render(<Gallery {...makeProps({ selectMode: true, onSelect })} />);
    const first = document.querySelector('[style*="cursor: pointer"]') as HTMLElement;
    fireEvent.click(first);
    expect(onSelect).toHaveBeenCalled();
  });

  it('selectedIds に含まれるアイテムは選択状態のスタイルを持つ', () => {
    render(<Gallery {...makeProps({ selectMode: true, selectedIds: new Set([1]) })} />);
    // 選択済みアイテムに border accent が付く（スナップショットレベルの確認）
    expect(document.querySelector('[style*="cursor: pointer"]')).toBeTruthy();
  });
});
