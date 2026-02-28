'use client';

interface FilterPanelProps {
  mediaType: string;
  includeDeleted: boolean;
  createdFrom: string;
  createdTo: string;
  onMediaTypeChange: (v: string) => void;
  onIncludeDeletedChange: (v: boolean) => void;
  onCreatedFromChange: (v: string) => void;
  onCreatedToChange: (v: string) => void;
  onReset: () => void;
}

export default function FilterPanel({
  mediaType,
  includeDeleted,
  createdFrom,
  createdTo,
  onMediaTypeChange,
  onIncludeDeletedChange,
  onCreatedFromChange,
  onCreatedToChange,
  onReset,
}: FilterPanelProps) {
  return (
    <div
      data-testid="filter-panel"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '8px 40px',
        borderBottom: '1px solid var(--border)',
        flexWrap: 'wrap',
        fontSize: '0.78rem',
        color: 'var(--muted)',
      }}
    >
      <span style={{ letterSpacing: 1, textTransform: 'uppercase', color: 'var(--muted)' }}>
        Filter:
      </span>

      <select
        data-testid="media-type-select"
        value={mediaType}
        onChange={(e) => onMediaTypeChange(e.target.value)}
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          color: 'var(--text)',
          padding: '4px 8px',
          fontSize: '0.78rem',
          cursor: 'pointer',
        }}
      >
        <option value="">すべて</option>
        <option value="image">画像</option>
        <option value="video">動画</option>
        <option value="audio">音声</option>
        <option value="application">その他</option>
      </select>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
        <input
          data-testid="include-deleted-checkbox"
          type="checkbox"
          checked={includeDeleted}
          onChange={(e) => onIncludeDeletedChange(e.target.checked)}
        />
        削除済み含む
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        作成日From:
        <input
          data-testid="created-from-input"
          type="date"
          value={createdFrom}
          onChange={(e) => onCreatedFromChange(e.target.value)}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: 'var(--text)',
            padding: '4px 8px',
            fontSize: '0.78rem',
          }}
        />
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        To:
        <input
          data-testid="created-to-input"
          type="date"
          value={createdTo}
          onChange={(e) => onCreatedToChange(e.target.value)}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: 'var(--text)',
            padding: '4px 8px',
            fontSize: '0.78rem',
          }}
        />
      </label>

      <button
        data-testid="filter-reset-btn"
        onClick={onReset}
        style={{
          background: 'none',
          border: '1px solid var(--border)',
          color: 'var(--muted)',
          padding: '4px 12px',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: '0.78rem',
          letterSpacing: 1,
          textTransform: 'uppercase',
        }}
      >
        リセット
      </button>
    </div>
  );
}
