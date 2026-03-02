'use client';

import { useRef, useState } from 'react';
import { deleteMedia } from '@/lib/api';
import { MediaResponse } from '@/lib/types';
import { useFilterState } from '@/hooks/useFilterState';
import { useMediaFetch } from '@/hooks/useMediaFetch';
import { useSelectMode } from '@/hooks/useSelectMode';
import Header from '@/components/Header';
import Gallery from '@/components/Gallery';
import Lightbox from '@/components/Lightbox';
import UploadModal from '@/components/UploadModal';
import TagFilterBar from '@/components/TagFilterBar';
import FilterPanel from '@/components/FilterPanel';
import BackToTopButton from '@/components/BackToTopButton';

type ViewMode = 'grid-large' | 'grid-small' | 'list';

export default function Home() {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);

  const filter = useFilterState();
  const {
    items, setItems, tags, total, setTotal,
    loading, hasMore, fetchMedia, refreshTags,
  } = useMediaFetch(filter, sentinelRef);
  const {
    selectMode, setSelectMode,
    selectedIds, setSelectedIds,
    handleSelect, handleSelectAll, exitSelectMode,
  } = useSelectMode(items);

  const [viewMode, setViewMode] = useState<ViewMode>('grid-large');
  const [lightboxMedia, setLightboxMedia] = useState<MediaResponse | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  async function handleDeleteSelected() {
    if (!confirm(`Delete ${selectedIds.size} items?`)) return;
    const idsToDelete = new Set(selectedIds);
    await Promise.all(Array.from(idsToDelete).map((id) => deleteMedia(id)));
    setItems((prev) => prev.filter((i) => !idsToDelete.has(i.id)));
    setTotal((prev) => prev - idsToDelete.size);
    exitSelectMode();
    refreshTags();
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
          if (v) setSelectMode(true);
          else exitSelectMode();
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
      <TagFilterBar tags={tags} activeTags={filter.activeTags} onToggle={filter.handleTagToggle} />

      {/* Filter panel */}
      <div ref={filterPanelRef}>
        <FilterPanel
          mediaType={filter.mediaType}
          includeDeleted={filter.includeDeleted}
          createdFrom={filter.createdFrom}
          createdTo={filter.createdTo}
          sortBy={filter.sortBy}
          sortOrder={filter.sortOrder}
          onMediaTypeChange={filter.setMediaType}
          onIncludeDeletedChange={filter.setIncludeDeleted}
          onCreatedFromChange={filter.setCreatedFrom}
          onCreatedToChange={filter.setCreatedTo}
          onSortByChange={filter.setSortBy}
          onSortOrderChange={filter.setSortOrder}
          onReset={filter.resetFilter}
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
            fetchMedia(true);
            refreshTags();
          }}
        />
      )}

      <BackToTopButton watchRef={filterPanelRef} />
    </div>
  );
}
