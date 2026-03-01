'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { MediaResponse, TagResponse } from '@/lib/types';
import { getMediaList, getTags, getMedia, deleteMedia } from '@/lib/api';
import Header from '@/components/Header';
import Gallery from '@/components/Gallery';
import Lightbox from '@/components/Lightbox';
import UploadModal from '@/components/UploadModal';
import TagFilterBar from '@/components/TagFilterBar';
import FilterPanel from '@/components/FilterPanel';
import BackToTopButton from '@/components/BackToTopButton';

type ViewMode = 'grid-large' | 'grid-small' | 'list';

export default function Home() {
  const [items, setItems] = useState<MediaResponse[]>([]);
  const [tags, setTags] = useState<TagResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('grid-large');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [mediaType, setMediaType] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [sortBy, setSortBy] = useState<'created_at' | 'original_filename'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [lightboxMedia, setLightboxMedia] = useState<MediaResponse | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  const requestIdRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const LIMIT = 50;

  const fetchMedia = useCallback(async (reset = false) => {
    if (!reset && loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    if (reset) setHasMore(true);
    const requestId = ++requestIdRef.current;
    try {
      const currentOffset = reset ? 0 : offsetRef.current;
      const data = await getMediaList({
        tags: activeTags.length > 0 ? activeTags : undefined,
        media_type: mediaType || undefined,
        include_deleted: includeDeleted || undefined,
        created_from: createdFrom || undefined,
        created_to: createdTo || undefined,
        offset: currentOffset,
        limit: LIMIT,
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      if (requestId !== requestIdRef.current) return;
      const newItems = data.items;
      if (reset) {
        setItems(newItems);
        offsetRef.current = newItems.length;
      } else {
        setItems((prev) => [...prev, ...newItems]);
        offsetRef.current = currentOffset + newItems.length;
      }
      setTotal(data.total);
      setHasMore(currentOffset + newItems.length < data.total);
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      console.error(e);
    }
    loadingRef.current = false;
    setLoading(false);
  }, [activeTags, mediaType, includeDeleted, createdFrom, createdTo, sortBy, sortOrder]);

  useEffect(() => {
    getTags().then(setTags).catch(console.error);
  }, []);


  useEffect(() => {
    offsetRef.current = 0;
    fetchMedia(true);
  }, [activeTags, mediaType, includeDeleted, createdFrom, createdTo, sortBy, sortOrder, fetchMedia]);

  // pendingIdsRef: ポーリング関数が常に最新の ID リストにアクセスできるよう useEffect 内で更新
  const pendingIdsRef = useRef<number[]>([]);
  // hasPending はステートから直接算出（レンダー中に ref を書き換えない）
  const hasPending = items.some(
    (i) => i.clip_status === 'pending' || i.clip_status === 'running'
  );
  useEffect(() => {
    pendingIdsRef.current = items
      .filter((i) => i.clip_status === 'pending' || i.clip_status === 'running')
      .map((i) => i.id);
  }, [items]);

  // Polling: pending/running アイテムのみ個別取得して in-place 更新
  useEffect(() => {
    if (!hasPending) return;
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      const ids = pendingIdsRef.current;
      if (ids.length === 0) return;
      try {
        const results = await Promise.allSettled(ids.map((id) => getMedia(id)));
        if (cancelled) return;
        const updates = results
          .filter((r): r is PromiseFulfilledResult<MediaResponse> => r.status === 'fulfilled')
          .map((r) => r.value);
        if (updates.length > 0) {
          setItems((prev) =>
            prev.map((item) => updates.find((u) => u.id === item.id) ?? item)
          );
          const anyCompleted = updates.some(
            (u) => u.clip_status !== 'pending' && u.clip_status !== 'running'
          );
          if (anyCompleted) getTags().then(setTags).catch(console.error);
        }
      } catch (e) {
        console.error(e);
      }
      if (!cancelled) setTimeout(poll, 5000);
    }

    const timer = setTimeout(poll, 5000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [hasPending]);

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingRef.current) {
          fetchMedia(false);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, fetchMedia]);

  function handleTagToggle(tagName: string) {
    setActiveTags((prev) =>
      prev.includes(tagName) ? prev.filter((t) => t !== tagName) : [...prev, tagName]
    );
  }

  function handleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSelectAll() {
    const allSelected = items.length > 0 && items.every((i) => selectedIds.has(i.id));
    setSelectedIds(allSelected ? new Set() : new Set(items.map((i) => i.id)));
  }

  async function handleDeleteSelected() {
    if (!confirm(`Delete ${selectedIds.size} items?`)) return;
    const idsToDelete = new Set(selectedIds);
    await Promise.all(Array.from(idsToDelete).map((id) => deleteMedia(id)));
    setItems((prev) => prev.filter((i) => !idsToDelete.has(i.id)));
    setTotal((prev) => prev - idsToDelete.size);
    setSelectedIds(new Set());
    setSelectMode(false);
    getTags().then(setTags).catch(console.error);
  }

  function handleOpen(media: MediaResponse) {
    setLightboxMedia(media);
  }

  const lightboxIndex = lightboxMedia
    ? items.findIndex((i) => i.id === lightboxMedia.id)
    : -1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header
        total={total}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        selectMode={selectMode}
        onSelectModeChange={(v) => {
          setSelectMode(v);
          if (!v) setSelectedIds(new Set());
        }}
        selectedCount={selectedIds.size}
        onDeleteSelected={handleDeleteSelected}
        onUploadClick={() => setShowUpload(true)}
        onSelectAll={handleSelectAll}
        allSelected={items.length > 0 && items.every((i) => selectedIds.has(i.id))}
      />

      {/* Item count */}
      <div style={{
        padding: '8px 40px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--muted)', marginLeft: 'auto' }}>
          {items.length} / {total} 件
        </span>
      </div>

      {/* Tag filter */}
      <TagFilterBar tags={tags} activeTags={activeTags} onToggle={handleTagToggle} />

      {/* Filter panel */}
      <div ref={filterPanelRef}>
      <FilterPanel
        mediaType={mediaType}
        includeDeleted={includeDeleted}
        createdFrom={createdFrom}
        createdTo={createdTo}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onMediaTypeChange={setMediaType}
        onIncludeDeletedChange={setIncludeDeleted}
        onCreatedFromChange={setCreatedFrom}
        onCreatedToChange={setCreatedTo}
        onSortByChange={setSortBy}
        onSortOrderChange={setSortOrder}
        onReset={() => {
          setMediaType('');
          setIncludeDeleted(false);
          setCreatedFrom('');
          setCreatedTo('');
          setSortBy('created_at');
          setSortOrder('desc');
        }}
      />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <Gallery
          items={items}
          viewMode={viewMode}
          selectMode={selectMode}
          selectedIds={selectedIds}
          onSelect={handleSelect}
          onOpen={handleOpen}
        />

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {loading && (
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)', letterSpacing: 2 }}>
              LOADING...
            </span>
          )}
          {!hasMore && items.length > 0 && (
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)', letterSpacing: 1 }}>
              — {total} 件すべて表示済み —
            </span>
          )}
        </div>
      </div>

      {lightboxMedia && (
        <Lightbox
          media={lightboxMedia}
          onClose={() => setLightboxMedia(null)}
          onPrev={() => lightboxIndex > 0 && setLightboxMedia(items[lightboxIndex - 1])}
          onNext={() =>
            lightboxIndex < items.length - 1 &&
            setLightboxMedia(items[lightboxIndex + 1])
          }
          hasPrev={lightboxIndex > 0}
          hasNext={lightboxIndex < items.length - 1}
          onUpdated={(updated) => {
            setLightboxMedia(updated);
            setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
          }}
          onDeleted={(id) => {
            setItems((prev) => prev.filter((i) => i.id !== id));
            setTotal((prev) => prev - 1);
            setLightboxMedia(null);
          }}
        />
      )}

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={() => {
            setShowUpload(false);
            offsetRef.current = 0;
            setHasMore(true);
            fetchMedia(true);
            getTags().then(setTags).catch(console.error);
          }}
        />
      )}

      <BackToTopButton watchRef={filterPanelRef} />
    </div>
  );
}
