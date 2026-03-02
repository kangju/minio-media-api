import React from 'react';
import { render } from '@testing-library/react';
import MediaThumb, { mediaMemoEqual, MediaThumbProps } from '@/components/MediaThumb';
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

// ---------------------------------------------------------------------------
// mediaMemoEqual – 比較関数の直接テスト
//
// 設計メモ: `media.tags` は参照比較（===）を行うと API レスポンスごとに新配列が生成され
// 常に false になるため comparator から除外している。
// MediaThumb は現状 tags を表示しないため、表示上の影響もない。
// 将来タグ表示を追加する場合は length + id の浅い比較を実装すること。
// ---------------------------------------------------------------------------

describe('mediaMemoEqual', () => {
  function makeProps(
    media: MediaResponse,
    overrides: Partial<MediaThumbProps> = {}
  ): MediaThumbProps {
    return {
      media,
      selected: false,
      selectMode: false,
      size: 'large',
      onSelect: undefined,
      onClick: undefined,
      ...overrides,
    };
  }

  it('media 参照のみ変わり値は同じなら true（メモ化の主目的）', () => {
    const a = makeMedia();
    const b = { ...a }; // 同じ値、別参照
    expect(mediaMemoEqual(makeProps(a), makeProps(b))).toBe(true);
  });

  it('id が変わったら false', () => {
    expect(mediaMemoEqual(makeProps(makeMedia({ id: 1 })), makeProps(makeMedia({ id: 2 })))).toBe(false);
  });

  it('clip_status が変わったら false（pending バッジの再レンダーに必要）', () => {
    expect(mediaMemoEqual(
      makeProps(makeMedia({ clip_status: 'pending' })),
      makeProps(makeMedia({ clip_status: 'done' }))
    )).toBe(false);
  });

  it('original_filename が変わったら false', () => {
    expect(mediaMemoEqual(
      makeProps(makeMedia({ original_filename: 'a.jpg' })),
      makeProps(makeMedia({ original_filename: 'b.jpg' }))
    )).toBe(false);
  });

  it('media_type が変わったら false', () => {
    expect(mediaMemoEqual(
      makeProps(makeMedia({ media_type: 'image' })),
      makeProps(makeMedia({ media_type: 'video', original_filename: 'clip.mp4', minio_key: 'k/clip.mp4' }))
    )).toBe(false);
  });

  it('deleted_at が変わったら false', () => {
    expect(mediaMemoEqual(
      makeProps(makeMedia({ deleted_at: null })),
      makeProps(makeMedia({ deleted_at: '2024-01-01T00:00:00Z' }))
    )).toBe(false);
  });

  it('selected が変わったら false', () => {
    const media = makeMedia();
    expect(mediaMemoEqual(makeProps(media, { selected: false }), makeProps(media, { selected: true }))).toBe(false);
  });

  it('selectMode が変わったら false', () => {
    const media = makeMedia();
    expect(mediaMemoEqual(makeProps(media, { selectMode: false }), makeProps(media, { selectMode: true }))).toBe(false);
  });

  it('size が変わったら false', () => {
    const media = makeMedia();
    expect(mediaMemoEqual(makeProps(media, { size: 'large' }), makeProps(media, { size: 'small' }))).toBe(false);
  });

  it('onSelect が変わったら false（陳腐化したコールバックを呼ばないための保険）', () => {
    const media = makeMedia();
    expect(mediaMemoEqual(
      makeProps(media, { onSelect: () => {} }),
      makeProps(media, { onSelect: () => {} }) // 別参照
    )).toBe(false);
  });

  it('onClick が変わったら false（陳腐化したコールバックを呼ばないための保険）', () => {
    const media = makeMedia();
    expect(mediaMemoEqual(
      makeProps(media, { onClick: () => {} }),
      makeProps(media, { onClick: () => {} }) // 別参照
    )).toBe(false);
  });

  it('onSelect 参照が同じなら true', () => {
    const media = makeMedia();
    const handler = jest.fn();
    expect(mediaMemoEqual(
      makeProps(media, { onSelect: handler }),
      makeProps(media, { onSelect: handler })
    )).toBe(true);
  });
});
