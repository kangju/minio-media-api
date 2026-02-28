'use client';

import { useEffect, useRef, useState } from 'react';
import { TagResponse } from '@/lib/types';

interface TagFilterBarProps {
  tags: TagResponse[];
  activeTags: string[];
  onToggle: (tagName: string) => void;
}

export default function TagFilterBar({ tags, activeTags, onToggle }: TagFilterBarProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 画像数降順でソート済みのタグ（APIがmedia_count降順で返す）
  const sortedTags = [...tags].sort((a, b) => b.media_count - a.media_count);

  // ポップアップ外クリックで閉じる
  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const selectedCount = activeTags.length;

  function handleClear() {
    activeTags.forEach((t) => onToggle(t));
  }

  if (tags.length === 0) return null;

  return (
    <div
      ref={containerRef}
      data-testid="tag-filter-bar"
      style={{
        padding: '8px 40px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        position: 'relative',
      }}
    >
      <span style={{ fontSize: '0.7rem', color: 'var(--muted)', letterSpacing: 2, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
        Filter:
      </span>

      <button
        data-testid="tag-filter-btn"
        onClick={() => setOpen((o) => !o)}
        style={{
          background: selectedCount > 0 ? 'rgba(232,255,60,0.1)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${selectedCount > 0 ? 'var(--accent)' : 'var(--border)'}`,
          color: selectedCount > 0 ? 'var(--accent)' : 'var(--muted)',
          padding: '4px 14px',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: '0.75rem',
          letterSpacing: 1,
          whiteSpace: 'nowrap',
          transition: 'all 0.15s',
        }}
      >
        タグで絞り込む{selectedCount > 0 ? ` (${selectedCount})` : ''}
        <span style={{ marginLeft: 6, opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
      </button>

      {selectedCount > 0 && (
        <button
          data-testid="tag-filter-clear-btn"
          onClick={handleClear}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--muted)',
            cursor: 'pointer',
            fontSize: '0.72rem',
            padding: '4px 8px',
          }}
        >
          ✕ クリア
        </button>
      )}

      {/* 選択中タグのバッジ表示 */}
      {activeTags.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {activeTags.map((name) => (
            <span
              key={name}
              style={{
                background: 'var(--accent)',
                color: '#000',
                fontSize: '0.65rem',
                padding: '2px 8px',
                borderRadius: 12,
                fontWeight: 500,
              }}
            >
              {name}
            </span>
          ))}
        </div>
      )}

      {/* ポップアップドロップダウン */}
      {open && (
        <div
          data-testid="tag-filter-popup"
          style={{
            position: 'absolute',
            top: '100%',
            left: 40,
            zIndex: 300,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            minWidth: 240,
            maxHeight: 360,
            overflowY: 'auto',
            padding: '8px 0',
          }}
        >
          {sortedTags.map((tag) => {
            const active = activeTags.includes(tag.name);
            return (
              <label
                key={tag.id}
                data-testid={`tag-option-${tag.name}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 16px',
                  cursor: 'pointer',
                  background: active ? 'rgba(232,255,60,0.06)' : 'transparent',
                  transition: 'background 0.1s',
                }}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => onToggle(tag.name)}
                  style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
                <span style={{ flex: 1, fontSize: '0.8rem', color: active ? 'var(--accent)' : 'var(--text)' }}>
                  {tag.name}
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
                  {tag.media_count}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
