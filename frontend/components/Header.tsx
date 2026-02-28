'use client';

import Link from 'next/link';

type ViewMode = 'grid-large' | 'grid-small' | 'list';

interface HeaderProps {
  total: number;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  selectMode: boolean;
  onSelectModeChange: (v: boolean) => void;
  selectedCount: number;
  onDeleteSelected: () => void;
  onUploadClick: () => void;
  onSelectAll?: () => void;
  allSelected?: boolean;
}

export default function Header({
  total,
  viewMode,
  onViewModeChange,
  selectMode,
  onSelectModeChange,
  selectedCount,
  onDeleteSelected,
  onUploadClick,
  onSelectAll,
  allSelected,
}: HeaderProps) {
  return (
    <>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 40px',
          borderBottom: '1px solid var(--border)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'rgba(13,13,13,0.92)',
          backdropFilter: 'blur(12px)',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link
            href="/"
            style={{
              fontFamily: 'var(--font-bebas-neue)',
              fontSize: '2rem',
              letterSpacing: 6,
              color: 'var(--accent)',
              textDecoration: 'none',
            }}
          >
            GALLERY
          </Link>
          <Link
            href="/tags"
            style={{
              fontFamily: 'var(--font-bebas-neue)',
              fontSize: '1.4rem',
              letterSpacing: 4,
              color: 'var(--muted)',
              textDecoration: 'none',
            }}
          >
            TAGS
          </Link>
          <span
            style={{
              fontSize: '0.8rem',
              color: 'var(--muted)',
              letterSpacing: 2,
              textTransform: 'uppercase',
            }}
          >
            {total} items
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {(['grid-large', 'grid-small', 'list'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => onViewModeChange(mode)}
              style={{
                background: 'none',
                border: `1px solid ${viewMode === mode ? 'var(--accent)' : 'var(--border)'}`,
                color: viewMode === mode ? 'var(--accent)' : 'var(--muted)',
                padding: '6px 14px',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: '0.75rem',
                letterSpacing: 1,
                textTransform: 'uppercase',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              {mode === 'grid-large' ? 'Grid L' : mode === 'grid-small' ? 'Grid S' : 'List'}
            </button>
          ))}

          <div style={{ width: 1, height: 24, background: 'var(--border)' }} />

          <button
            onClick={() => onSelectModeChange(!selectMode)}
            style={{
              background: selectMode ? 'var(--accent)' : 'none',
              border: `1px solid ${selectMode ? 'var(--accent)' : 'var(--border)'}`,
              color: selectMode ? '#000' : 'var(--muted)',
              padding: '6px 18px',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: '0.75rem',
              letterSpacing: 1,
              textTransform: 'uppercase',
              transition: 'all 0.2s',
              fontWeight: selectMode ? 500 : 400,
              whiteSpace: 'nowrap',
            }}
          >
            SELECT
          </button>

          <button
            onClick={onUploadClick}
            style={{
              background: 'var(--accent)',
              border: '1px solid var(--accent)',
              color: '#000',
              padding: '6px 18px',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: '0.75rem',
              letterSpacing: 1,
              textTransform: 'uppercase',
              fontWeight: 500,
              whiteSpace: 'nowrap',
            }}
          >
            UPLOAD
          </button>
        </div>
      </header>

      {selectMode && (selectedCount > 0 || onSelectAll) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 40px',
            background: 'rgba(232,255,60,0.05)',
            borderBottom: '1px solid rgba(232,255,60,0.15)',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <span style={{ fontSize: '0.85rem', color: 'var(--accent)' }}>
            {selectedCount} selected
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {onSelectAll && (
              <button
                onClick={onSelectAll}
                data-testid="select-all-btn"
                style={{
                  background: 'none',
                  border: '1px solid var(--border)',
                  color: 'var(--muted)',
                  padding: '6px 18px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}
              >
                {allSelected ? 'DESELECT ALL' : 'SELECT ALL'}
              </button>
            )}
            <button
              onClick={onDeleteSelected}
              style={{
                background: 'none',
                border: '1px solid #ff4444',
                color: '#ff4444',
                padding: '6px 18px',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: '0.75rem',
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              DELETE SELECTED
            </button>
          </div>
        </div>
      )}
    </>
  );
}
