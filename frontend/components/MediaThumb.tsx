'use client';

import { useState } from 'react';
import { MediaResponse } from '@/lib/types';
import { getMediaFileUrl } from '@/lib/api';

interface MediaThumbProps {
  media: MediaResponse;
  selected?: boolean;
  selectMode?: boolean;
  onSelect?: (id: number) => void;
  onClick?: (media: MediaResponse) => void;
  size?: 'large' | 'small';
}

export default function MediaThumb({
  media,
  selected = false,
  selectMode = false,
  onSelect,
  onClick,
  size = 'large',
}: MediaThumbProps) {
  const url = getMediaFileUrl(media.id);
  const dim = size === 'large' ? 280 : 160;
  const [hovered, setHovered] = useState(false);

  function handleClick() {
    if (selectMode && onSelect) {
      onSelect(media.id);
    } else if (onClick) {
      onClick(media);
    }
  }

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        width: dim,
        height: dim,
        background: 'var(--surface)',
        border: `1px solid ${selected ? 'var(--accent)' : hovered ? 'rgba(232,255,60,0.4)' : 'var(--border)'}`,
        borderRadius: 4,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'border-color 0.2s',
        flexShrink: 0,
      }}
    >
      {media.media_type === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={media.original_filename}
          loading="lazy"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: hovered ? 'scale(1.08)' : 'scale(1)',
            transition: 'transform 0.3s ease',
          }}
        />
      ) : (
        <video
          src={url}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: hovered ? 'scale(1.08)' : 'scale(1)',
            transition: 'transform 0.3s ease',
          }}
          muted
          playsInline
        />
      )}

      {selectMode && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            width: 20,
            height: 20,
            borderRadius: '50%',
            border: `2px solid ${selected ? 'var(--accent)' : '#fff'}`,
            background: selected ? 'var(--accent)' : 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {selected && <span style={{ fontSize: 10, color: '#000', fontWeight: 700 }}>✓</span>}
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'linear-gradient(transparent, rgba(0,0,0,0.75))',
          padding: '20px 8px 8px',
          fontSize: '0.7rem',
          color: '#fff',
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.2s',
        }}
      >
        {media.original_filename}
      </div>

      {media.media_type === 'video' && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            fontSize: '0.65rem',
            padding: '2px 6px',
            borderRadius: 3,
            letterSpacing: 1,
          }}
        >
          VIDEO
        </div>
      )}

      {(media.clip_status === 'pending' || media.clip_status === 'running') && (
        <div
          data-testid="pending-badge"
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            background: 'rgba(0,0,0,0.75)',
            color: media.clip_status === 'running' ? '#5dde8a' : 'var(--accent)',
            fontSize: '0.6rem',
            padding: '3px 8px',
            borderRadius: 3,
            letterSpacing: 1,
            border: `1px solid ${media.clip_status === 'running' ? 'rgba(93,222,138,0.3)' : 'rgba(232,255,60,0.3)'}`,
          }}
        >
          {media.clip_status === 'running' ? '⟳ 解析中' : '⏳ 待機中'}
        </div>
      )}
    </div>
  );
}
