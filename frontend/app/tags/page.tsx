'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { TagResponse } from '@/lib/types';
import { getTags, createTag, updateTag, deleteTag } from '@/lib/api';

export default function TagsPage() {
  const [tags, setTags] = useState<TagResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState('');

  const fetchTags = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTags();
      setTags(data);
    } catch (e) {
      setError('タグの取得に失敗しました');
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => fetchTags());
  }, [fetchTags]);

  async function handleAdd() {
    if (!newTagName.trim()) return;
    setError('');
    try {
      await createTag(newTagName.trim());
      setNewTagName('');
      await fetchTags();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'タグの作成に失敗しました');
      console.error(e);
    }
  }

  function handleEditStart(tag: TagResponse) {
    setEditId(tag.id);
    setEditName(tag.name);
  }

  async function handleEditSave(id: number) {
    if (!editName.trim()) return;
    setError('');
    try {
      await updateTag(id, editName.trim());
      setEditId(null);
      setEditName('');
      await fetchTags();
    } catch (e) {
      setError('タグの更新に失敗しました');
      console.error(e);
    }
  }

  function handleEditCancel() {
    setEditId(null);
    setEditName('');
  }

  async function handleDelete(tag: TagResponse) {
    const warning =
      tag.media_count > 0
        ? `このタグを削除すると ${tag.media_count} 件のメディアから外れます。削除しますか？`
        : `タグ "${tag.name}" を削除しますか？`;
    if (!confirm(warning)) return;
    setError('');
    try {
      await deleteTag(tag.id);
      await fetchTags();
    } catch (e) {
      setError('タグの削除に失敗しました');
      console.error(e);
    }
  }

  return (
    <div
      data-testid="tags-page"
      style={{ minHeight: '100vh', color: 'var(--text)', padding: '40px' }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 32 }}>
        <h1
          style={{
            fontFamily: 'var(--font-bebas-neue)',
            fontSize: '2.4rem',
            letterSpacing: 6,
            color: 'var(--accent)',
            margin: 0,
          }}
        >
          TAGS
        </h1>
        <Link
          href="/"
          style={{
            fontSize: '0.82rem',
            color: 'var(--muted)',
            textDecoration: 'none',
            letterSpacing: 1,
          }}
        >
          ← Gallery
        </Link>
      </div>

      {/* Error */}
      {error && (
        <div
          data-testid="error-message"
          style={{
            marginBottom: 16,
            padding: '10px 16px',
            background: 'rgba(255,68,68,0.1)',
            border: '1px solid rgba(255,68,68,0.3)',
            borderRadius: 4,
            color: '#ff4444',
            fontSize: '0.82rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Tags table */}
      {loading ? (
        <p style={{ color: 'var(--muted)', letterSpacing: 2 }}>LOADING...</p>
      ) : (
        <table
          style={{
            width: '100%',
            maxWidth: 720,
            borderCollapse: 'collapse',
            fontSize: '0.85rem',
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom: '1px solid var(--border)',
                color: 'var(--muted)',
                textAlign: 'left',
                letterSpacing: 1,
                textTransform: 'uppercase',
                fontSize: '0.72rem',
              }}
            >
              <th style={{ padding: '8px 12px' }}>Name</th>
              <th style={{ padding: '8px 12px' }}>件数</th>
              <th style={{ padding: '8px 12px' }}>アクション</th>
            </tr>
          </thead>
          <tbody>
            {tags.map((tag) => (
              <tr
                key={tag.id}
                data-testid={`tag-row-${tag.id}`}
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <td style={{ padding: '8px 12px' }}>
                  {editId === tag.id ? (
                    <input
                      data-testid={`edit-tag-input-${tag.id}`}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleEditSave(tag.id);
                        if (e.key === 'Escape') handleEditCancel();
                      }}
                      style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid var(--accent)',
                        borderRadius: 4,
                        color: 'var(--text)',
                        padding: '4px 8px',
                        fontSize: '0.85rem',
                        outline: 'none',
                      }}
                      autoFocus
                    />
                  ) : (
                    tag.name
                  )}
                </td>
                <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{tag.media_count}</td>
                <td style={{ padding: '8px 12px', display: 'flex', gap: 8 }}>
                  {editId === tag.id ? (
                    <>
                      <button
                        data-testid={`save-tag-btn-${tag.id}`}
                        onClick={() => handleEditSave(tag.id)}
                        style={btnStyle('var(--accent)', '#000')}
                      >
                        保存
                      </button>
                      <button
                        onClick={handleEditCancel}
                        style={btnStyle('transparent', 'var(--muted)', 'var(--border)')}
                      >
                        キャンセル
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        data-testid={`edit-tag-btn-${tag.id}`}
                        onClick={() => handleEditStart(tag)}
                        style={btnStyle('transparent', 'var(--muted)', 'var(--border)')}
                      >
                        編集
                      </button>
                      <button
                        data-testid={`delete-tag-btn-${tag.id}`}
                        onClick={() => handleDelete(tag)}
                        style={btnStyle('transparent', '#ff4444', 'rgba(255,68,68,0.3)')}
                      >
                        削除
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} style={{ padding: '16px 12px 0' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    data-testid="new-tag-input"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    placeholder="新しいタグ名..."
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      color: 'var(--text)',
                      padding: '6px 12px',
                      fontSize: '0.82rem',
                      outline: 'none',
                      minWidth: 200,
                    }}
                  />
                  <button
                    data-testid="add-tag-btn"
                    onClick={handleAdd}
                    disabled={!newTagName.trim()}
                    style={btnStyle('var(--accent)', '#000')}
                  >
                    追加
                  </button>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

function btnStyle(bg: string, color: string, border?: string): React.CSSProperties {
  return {
    background: bg,
    border: `1px solid ${border ?? bg}`,
    color,
    padding: '4px 12px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: '0.75rem',
    letterSpacing: 1,
    whiteSpace: 'nowrap',
  };
}
