'use client';

import { useState, useRef, DragEvent, useCallback } from 'react';
import { uploadMedia } from '@/lib/api';

interface UploadModalProps {
  onClose: () => void;
  onUploaded: () => void;
}

type FileStatus = 'pending' | 'uploading' | 'done' | 'error';

interface FileItem {
  file: File;
  status: FileStatus;
  error?: string;
}

const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm';
const CONCURRENCY = 3; // 同時アップロード数

export default function UploadModal({ onClose, onUploaded }: UploadModalProps) {
  const [items, setItems] = useState<FileItem[]>([]);
  const [tags, setTags] = useState('');
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<'select' | 'uploading' | 'done'>('select');
  const inputRef = useRef<HTMLInputElement>(null);

  // ファイル追加（重複除外）
  const addFiles = useCallback((fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    setItems((prev) => {
      const existingNames = new Set(prev.map((i) => i.file.name + i.file.size));
      const newItems = incoming
        .filter((f) => !existingNames.has(f.name + f.size))
        .map((f) => ({ file: f, status: 'pending' as FileStatus }));
      return [...prev, ...newItems];
    });
  }, []);

  function removeFile(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  }

  // 並列アップロード（CONCURRENCY 件ずつ処理）
  async function handleUpload() {
    if (items.length === 0) return;
    const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
    setPhase('uploading');

    // すべてを uploading にリセット
    setItems((prev) => prev.map((i) => ({ ...i, status: 'uploading' })));

    // CONCURRENCY 件ずつ並列アップロード
    const queue = [...items.map((_, idx) => idx)];
    const inFlight = new Set<number>();

    async function uploadOne(idx: number) {
      const file = items[idx].file;
      try {
        const result = await uploadMedia(file, tagList);
        setItems((prev) =>
          prev.map((it, i) => (i === idx ? { ...it, status: 'done' } : it))
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Upload failed';
        setItems((prev) =>
          prev.map((it, i) => (i === idx ? { ...it, status: 'error', error: msg } : it))
        );
      } finally {
        inFlight.delete(idx);
      }
    }

    // Promise プール
    const results: Promise<void>[] = [];
    while (queue.length > 0 || inFlight.size > 0) {
      while (inFlight.size < CONCURRENCY && queue.length > 0) {
        const idx = queue.shift()!;
        inFlight.add(idx);
        results.push(uploadOne(idx));
      }
      await Promise.race(results.filter((_, i) => {
        // 完了済みを除外しながら待機
        return true;
      }));
      // 少し待って再チェック
      await new Promise((r) => setTimeout(r, 50));
    }
    // 全完了を確実に待つ
    await Promise.all(results);

    setPhase('done');
    onUploaded();
  }

  const doneCount = items.filter((i) => i.status === 'done').length;
  const errorCount = items.filter((i) => i.status === 'error').length;
  const totalCount = items.length;
  const progress = totalCount > 0 ? Math.round(((doneCount + errorCount) / totalCount) * 100) : 0;

  return (
    <div
      onClick={phase === 'select' ? onClose : undefined}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.85)',
        zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 32,
          width: 560,
          maxWidth: '95vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* ヘッダー */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{
            fontFamily: 'var(--font-bebas-neue)',
            fontSize: '1.6rem', letterSpacing: 4,
            color: 'var(--accent)', margin: 0,
          }}>
            UPLOAD MEDIA
          </h2>
          {phase !== 'uploading' && (
            <button onClick={onClose} style={iconBtnStyle}>✕</button>
          )}
        </div>

        {/* ドロップゾーン（選択フェーズのみ表示） */}
        {phase === 'select' && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 8,
              padding: '32px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
              color: dragging ? 'var(--accent)' : 'var(--muted)',
              background: dragging ? 'rgba(232,255,60,0.04)' : 'transparent',
            }}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT}
              style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files) addFiles(e.target.files); }}
            />
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>↑</div>
            <div style={{ fontSize: '0.9rem', letterSpacing: 1, marginBottom: 4 }}>
              ファイルをドロップ、またはクリックして選択
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
              画像: JPEG・PNG・GIF・WebP　動画: MP4・MOV・AVI・MKV・WebM
            </div>
          </div>
        )}

        {/* タグ入力（選択フェーズのみ） */}
        {phase === 'select' && (
          <div>
            <label style={labelStyle}>TAGS（カンマ区切り）</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="cat, outdoor, nature"
              style={inputStyle}
            />
          </div>
        )}

        {/* ファイル一覧 */}
        {items.length > 0 && (
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: 280 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
              {totalCount} FILES
              {phase !== 'select' && ` — ${doneCount} 完了 / ${errorCount} エラー`}
            </div>
            {items.map((item, idx) => (
              <div key={idx} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 0',
                borderBottom: '1px solid var(--border)',
              }}>
                {/* ステータスアイコン */}
                <span style={{ fontSize: '0.8rem', flexShrink: 0, width: 18, textAlign: 'center' }}>
                  {item.status === 'pending' && <span style={{ color: 'var(--muted)' }}>○</span>}
                  {item.status === 'uploading' && <span style={{ color: 'var(--accent)' }}>⟳</span>}
                  {item.status === 'done' && <span style={{ color: '#5dde8a' }}>✓</span>}
                  {item.status === 'error' && <span style={{ color: '#ff4444' }}>✕</span>}
                </span>
                {/* ファイル名 */}
                <span style={{
                  flex: 1, fontSize: '0.78rem',
                  color: item.status === 'error' ? '#ff4444' : item.status === 'done' ? 'var(--muted)' : 'var(--text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {item.file.name}
                </span>
                {/* ファイルサイズ */}
                <span style={{ fontSize: '0.7rem', color: 'var(--muted)', flexShrink: 0 }}>
                  {formatSize(item.file.size)}
                </span>
                {/* エラーメッセージ */}
                {item.error && (
                  <span style={{ fontSize: '0.7rem', color: '#ff4444', flexShrink: 0 }}>
                    {item.error}
                  </span>
                )}
                {/* 削除ボタン（選択フェーズのみ） */}
                {phase === 'select' && (
                  <button onClick={() => removeFile(idx)} style={{
                    background: 'none', border: 'none',
                    color: 'var(--muted)', cursor: 'pointer', fontSize: '0.8rem',
                    padding: '0 4px', flexShrink: 0,
                  }}>✕</button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* プログレスバー（アップロード中・完了後） */}
        {phase !== 'select' && totalCount > 0 && (
          <div>
            <div style={{
              height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${progress}%`,
                background: errorCount > 0 ? '#ff4444' : 'var(--accent)',
                transition: 'width 0.3s',
                borderRadius: 2,
              }} />
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 6, textAlign: 'right' }}>
              {progress}% — {doneCount}/{totalCount} 完了
            </div>
          </div>
        )}

        {/* ボタン */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          {phase === 'select' && (
            <>
              <button onClick={onClose} style={cancelBtnStyle}>CANCEL</button>
              <button
                onClick={handleUpload}
                disabled={items.length === 0}
                style={{
                  ...primaryBtnStyle,
                  opacity: items.length === 0 ? 0.4 : 1,
                  cursor: items.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                {items.length > 1 ? `UPLOAD ${items.length} FILES` : 'UPLOAD'}
              </button>
            </>
          )}
          {phase === 'uploading' && (
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)', letterSpacing: 1 }}>
              アップロード中...
            </div>
          )}
          {phase === 'done' && (
            <>
              {errorCount > 0 && (
                <button
                  onClick={() => {
                    setItems((prev) =>
                      prev.filter((i) => i.status !== 'done').map((i) => ({ ...i, status: 'pending' }))
                    );
                    setPhase('select');
                  }}
                  style={cancelBtnStyle}
                >
                  RETRY ERRORS ({errorCount})
                </button>
              )}
              <button onClick={onClose} style={primaryBtnStyle}>CLOSE</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none', border: '1px solid var(--border)',
  color: 'var(--muted)', width: 32, height: 32, borderRadius: '50%',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.72rem', color: 'var(--muted)',
  letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase',
};
const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg)',
  border: '1px solid var(--border)', borderRadius: 4,
  color: 'var(--text)', padding: '8px 12px',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};
const cancelBtnStyle: React.CSSProperties = {
  background: 'none', border: '1px solid var(--border)',
  color: 'var(--muted)', padding: '8px 20px', borderRadius: 4,
  cursor: 'pointer', fontSize: '0.75rem', letterSpacing: 1, textTransform: 'uppercase',
};
const primaryBtnStyle: React.CSSProperties = {
  background: 'var(--accent)', border: 'none', color: '#000',
  padding: '8px 24px', borderRadius: 4, cursor: 'pointer',
  fontSize: '0.75rem', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600,
};
