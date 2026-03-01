import React from 'react';
import { render } from '@testing-library/react';
import MediaThumb from '@/components/MediaThumb';
import { MediaResponse } from '@/lib/types';

jest.mock('@/lib/api', () => ({
  getMediaFileUrl: (id: number) => `/api/media/${id}/file`,
}));

function makeMedia(overrides: Partial<MediaResponse> = {}): MediaResponse {
  return {
    id: 1,
    original_filename: 'photo.jpg',
    minio_key: 'key/photo.jpg',
    media_type: 'image',
    created_at: '2024-01-01T00:00:00Z',
    deleted_at: null,
    tags: [],
    ...overrides,
  };
}

describe('MediaThumb – 画像', () => {
  it('img に loading="lazy" 属性がある', () => {
    const { container } = render(<MediaThumb media={makeMedia()} />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('外側 div に content-visibility: auto スタイルがある', () => {
    const { container } = render(<MediaThumb media={makeMedia()} />);
    const wrapper = container.querySelector('[style*="content-visibility"]');
    expect(wrapper).toBeInTheDocument();
  });
});

describe('MediaThumb – 動画', () => {
  it('video に preload="none" 属性がある', () => {
    const { container } = render(<MediaThumb media={makeMedia({ media_type: 'video', original_filename: 'clip.mp4', minio_key: 'key/clip.mp4' })} />);
    const video = container.querySelector('video');
    expect(video).toHaveAttribute('preload', 'none');
  });
});

describe('MediaThumb – React.memo', () => {
  it('同じ props で再レンダー時に再マウントしない（参照が安定）', () => {
    const media = makeMedia();
    const { rerender, container } = render(<MediaThumb media={media} selected={false} />);
    const before = container.firstChild;
    rerender(<MediaThumb media={media} selected={false} />);
    expect(container.firstChild).toBe(before);
  });
});
