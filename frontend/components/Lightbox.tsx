'use client';

import { useEffect, useState } from 'react';
import { MediaResponse, TagResponse } from '@/lib/types';
import { getMediaFileUrl, analyzeMedia, addTag, removeTag, deleteMedia, getTags } from '@/lib/api';

interface LightboxProps {
  media: MediaResponse;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  onUpdated: (media: MediaResponse) => void;
  onDeleted: (id: number) => void;
}

export default function Lightbox({
  media,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  onUpdated,
  onDeleted,
}: LightboxProps) {
  const [newTag, setNewTag] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [allTags, setAllTags] = useState<TagResponse[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [candidateInput, setCandidateInput] = useState('');
  const [showCandidateInput, setShowCandidateInput] = useState(false);

  useEffect(() => {
    getTags().then(setAllTags).catch(() => {});
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) onPrev();
      if (e.key === 'ArrowRight' && hasNext) onNext();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  const url = getMediaFileUrl(media.id);
  const existingTagIds = new Set(media.tags.map((t) => t.id));
  const suggestions = allTags.filter(
    (t) => !existingTagIds.has(t.id) && t.name.toLowerCase().includes(newTag.toLowerCase())
  );

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      const candidates = candidateInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const updated = await analyzeMedia(media.id, candidates.length > 0 ? candidates : undefined);
      onUpdated(updated);
    } catch (e) {
      console.error(e);
    }
    setAnalyzing(false);
  }

  async function handleAddTag(tagName?: string) {
    const name = (tagName ?? newTag).trim();
    if (!name) return;
    setAddingTag(true);
    try {
      const updated = await addTag(media.id, name);
      onUpdated(updated);
      setNewTag('');
      setShowSuggestions(false);
    } catch (e) {
      console.error(e);
    }
    setAddingTag(false);
  }

  async function handleRemoveTag(tagId: number) {
    try {
      await removeTag(media.id, tagId);
      onUpdated({ ...media, tags: media.tags.filter((t) => t.id !== tagId) });
    } catch (e) {
      console.error(e);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this media?')) return;
    try {
      await deleteMedia(media.id);
      onDeleted(media.id);
      onClose();
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.92)',
        zIndex: 1000,
        display: 'flex',
      }}
    >
      {/* Image area */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          minWidth: 0,
        }}
      >
        {/* Close button */}
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'rgba(0,0,0,0.7)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff',
            width: 40,
            height: 40,
            borderRadius: '50%',
            cursor: 'pointer',
            fontSize: '1.3rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001,
          }}
        >
          ×
        </button>

        {hasPrev && (
          <button
            onClick={(e) => { e.stopPropagation(); onPrev(); }}
            style={{
              position: 'absolute',
              left: 20,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'rgba(0,0,0,0.7)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff',
              width: 48,
              height: 48,
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: '1.6rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ‹
          </button>
        )}

        {media.media_type === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={media.original_filename}
            style={{ maxWidth: '100%', maxHeight: '100vh', objectFit: 'contain' }}
          />
        ) : (
          <video
            src={url}
            controls
            autoPlay
            style={{ maxWidth: '100%', maxHeight: '100vh' }}
          />
        )}

        {hasNext && (
          <button
            onClick={(e) => { e.stopPropagation(); onNext(); }}
            style={{
              position: 'absolute',
              right: 20,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'rgba(0,0,0,0.7)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff',
              width: 48,
              height: 48,
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: '1.6rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ›
          </button>
        )}

        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: '0.78rem',
            color: 'rgba(255,255,255,0.4)',
            letterSpacing: 1,
            whiteSpace: 'nowrap',
            maxWidth: '80%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {media.original_filename}
        </div>
      </div>

      {/* Right detail panel */}
      <div
        data-testid="lightbox-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 280,
          background: 'rgba(18,18,18,0.98)',
          borderLeft: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        {/* File info */}
        <div style={{ padding: '64px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: '0.78rem', color: '#fff', marginBottom: 6, wordBreak: 'break-all' }}>
            {media.original_filename}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)' }}>
            {media.media_type} · {new Date(media.created_at).toLocaleDateString()}
          </div>
        </div>

        {/* Tags */}
        <div style={{ padding: '16px 20px', flex: 1 }}>
          <div style={{
            fontSize: '0.68rem',
            color: 'rgba(255,255,255,0.35)',
            letterSpacing: 2,
            textTransform: 'uppercase',
            marginBottom: 10,
          }}>
            Tags
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {media.tags.length === 0 && (
              <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.25)' }}>No tags</span>
            )}
            {media.tags.map((tag) => (
              <span
                key={tag.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  background: 'rgba(232,255,60,0.08)',
                  border: '1px solid rgba(232,255,60,0.25)',
                  color: '#e8ff3c',
                  fontSize: '0.72rem',
                  padding: '3px 8px',
                  borderRadius: 12,
                }}
              >
                {tag.name}
                {tag.score != null && (
                  <span style={{ opacity: 0.45, fontSize: '0.65rem' }}>
                    {(tag.score * 100).toFixed(0)}%
                  </span>
                )}
                <button
                  onClick={() => handleRemoveTag(tag.id)}
                  title="タグを削除"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#e8ff3c',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    lineHeight: 1,
                    padding: 0,
                    opacity: 0.6,
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          {/* Add tag with autocomplete */}
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                value={newTag}
                onChange={(e) => { setNewTag(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddTag();
                  if (e.key === 'Escape') setShowSuggestions(false);
                }}
                placeholder="タグを追加..."
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 4,
                  color: '#fff',
                  padding: '6px 10px',
                  fontSize: '0.78rem',
                  outline: 'none',
                }}
              />
              <button
                onClick={() => handleAddTag()}
                disabled={addingTag || !newTag.trim()}
                style={{
                  background: '#e8ff3c',
                  border: 'none',
                  color: '#000',
                  padding: '6px 12px',
                  borderRadius: 4,
                  cursor: addingTag || !newTag.trim() ? 'not-allowed' : 'pointer',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  opacity: addingTag || !newTag.trim() ? 0.5 : 1,
                }}
              >
                +
              </button>
            </div>

            {/* Suggestions dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 40,
                  background: '#1e1e1e',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 4,
                  marginTop: 2,
                  maxHeight: 160,
                  overflowY: 'auto',
                  zIndex: 10,
                }}
              >
                {suggestions.slice(0, 8).map((tag) => (
                  <div
                    key={tag.id}
                    onMouseDown={() => handleAddTag(tag.name)}
                    style={{
                      padding: '7px 12px',
                      fontSize: '0.78rem',
                      color: '#e8ff3c',
                      cursor: 'pointer',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(232,255,60,0.1)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {tag.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}>
          {media.media_type === 'image' && (
            <>
              {/* Candidates input */}
              <div>
                <button
                  onClick={() => setShowCandidateInput((v) => !v)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255,255,255,0.4)',
                    cursor: 'pointer',
                    fontSize: '0.68rem',
                    padding: '0 0 4px',
                    textDecoration: 'underline',
                    letterSpacing: 0.5,
                  }}
                >
                  {showCandidateInput ? '▾ 候補タグを非表示' : '▸ カスタム候補タグを追加'}
                </button>
                {showCandidateInput && (
                  <textarea
                    value={candidateInput}
                    onChange={(e) => setCandidateInput(e.target.value)}
                    placeholder="flower, sky, cat, dog（カンマ区切り）"
                    rows={2}
                    data-testid="candidate-input"
                    style={{
                      width: '100%',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 4,
                      color: '#fff',
                      padding: '6px 10px',
                      fontSize: '0.75rem',
                      outline: 'none',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                    }}
                  />
                )}
              </div>
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                style={{
                  background: 'none',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: analyzing ? 'rgba(255,255,255,0.3)' : '#fff',
                  padding: '9px',
                  borderRadius: 4,
                  cursor: analyzing ? 'not-allowed' : 'pointer',
                  fontSize: '0.72rem',
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                }}
              >
                {analyzing ? 'ANALYZING...' : '🔍 CLIP ANALYZE'}
              </button>
            </>
          )}
          <button
            onClick={handleDelete}
            style={{
              background: 'none',
              border: '1px solid #ff4444',
              color: '#ff4444',
              padding: '9px',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: '0.72rem',
              letterSpacing: 1.5,
              textTransform: 'uppercase',
            }}
          >
            🗑 DELETE
          </button>
        </div>
      </div>
    </div>
  );
}
