'use client';

import { useState } from 'react';
import { MediaResponse } from '@/lib/types';
import MediaThumb from './MediaThumb';
import { getMediaFileUrl } from '@/lib/api';

type ViewMode = 'grid-large' | 'grid-small' | 'list';

interface GalleryProps {
  items: MediaResponse[];
  viewMode: ViewMode;
  selectMode: boolean;
  selectedIds: Set<number>;
  onSelect: (id: number) => void;
  onOpen: (media: MediaResponse) => void;
}

export default function Gallery({
  items,
  viewMode,
  selectMode,
  selectedIds,
  onSelect,
  onOpen,
}: GalleryProps) {
  if (items.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 400,
          color: 'var(--muted)',
          fontSize: '0.9rem',
          letterSpacing: 2,
          textTransform: 'uppercase',
        }}
      >
        No media found
      </div>
    );
  }

  if (viewMode === 'list') {
    return (
      <div style={{ padding: '20px 40px' }}>
        {items.map((item) => (
          <ListRow
            key={item.id}
            item={item}
            selected={selectedIds.has(item.id)}
            selectMode={selectMode}
            onSelect={onSelect}
            onOpen={onOpen}
          />
        ))}
      </div>
    );
  }

  const size = viewMode === 'grid-large' ? 'large' : 'small';

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        padding: '20px 40px',
      }}
    >
      {items.map((item) => (
        <MediaThumb
          key={item.id}
          media={item}
          selected={selectedIds.has(item.id)}
          selectMode={selectMode}
          onSelect={onSelect}
          onClick={onOpen}
          size={size}
        />
      ))}
    </div>
  );
}

function ListRow({
  item,
  selected,
  selectMode,
  onSelect,
  onOpen,
}: {
  item: MediaResponse;
  selected: boolean;
  selectMode: boolean;
  onSelect: (id: number) => void;
  onOpen: (media: MediaResponse) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={() => { if (selectMode) onSelect(item.id); else onOpen(item); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '10px 16px',
        marginBottom: 4,
        background: selected ? 'rgba(232,255,60,0.05)' : hovered ? 'rgba(255,255,255,0.03)' : 'var(--surface)',
        border: `1px solid ${selected ? 'var(--accent)' : hovered ? 'rgba(232,255,60,0.3)' : 'var(--border)'}`,
        borderRadius: 4,
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ width: 48, height: 48, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
        {item.media_type === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={getMediaFileUrl(item.id)}
            alt={item.original_filename}
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: hovered ? 'scale(1.15)' : 'scale(1)', transition: 'transform 0.3s ease' }}
          />
        ) : (
          <video
            src={getMediaFileUrl(item.id)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: hovered ? 'scale(1.15)' : 'scale(1)', transition: 'transform 0.3s ease' }}
            muted
          />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.original_filename}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 2 }}>
          {item.media_type} · {new Date(item.created_at).toLocaleDateString()}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 300 }}>
        {item.tags.slice(0, 5).map((t) => (
          <span key={t.id} style={{ background: 'rgba(232,255,60,0.1)', color: 'var(--accent)', fontSize: '0.65rem', padding: '2px 8px', borderRadius: 12 }}>
            {t.name}
          </span>
        ))}
      </div>
    </div>
  );
}
