import { useState, useEffect, useCallback, useRef, RefObject } from 'react';
import useIsomorphicLayoutEffect from './useIsomorphicLayoutEffect';
import { MediaResponse, TagResponse } from '@/lib/types';
import { getMediaList, getMedia, getTags } from '@/lib/api';

const LIMIT = 50;

interface FilterState {
  activeTags: string[];
  mediaType: string;
  includeDeleted: boolean;
  createdFrom: string;
  createdTo: string;
  sortBy: 'created_at' | 'original_filename';
  sortOrder: 'asc' | 'desc';
}

export function useMediaFetch(
  filter: FilterState,
  sentinelRef: RefObject<HTMLDivElement | null>
) {
  const { activeTags, mediaType, includeDeleted, createdFrom, createdTo, sortBy, sortOrder } = filter;

  const [items, setItems] = useState<MediaResponse[]>([]);
  const [tags, setTags] = useState<TagResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const offsetRef = useRef(0);
  const inflightRef = useRef(0);
  const requestIdRef = useRef(0);
  const fetchMediaRef = useRef<(reset?: boolean) => Promise<void>>(async () => {});

  const fetchMedia = useCallback(async (reset = false) => {
    if (!reset && inflightRef.current > 0) return;
    inflightRef.current++;
    setLoading(true);
    if (reset) setHasMore(true);
    const requestId = ++requestIdRef.current;
    const currentOffset = reset ? 0 : offsetRef.current;
    let data: Awaited<ReturnType<typeof getMediaList>> | undefined;
    try {
      data = await getMediaList({
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
    } catch (e) {
      console.error(e);
    } finally {
      inflightRef.current--;
      if (inflightRef.current === 0) setLoading(false);
    }
    // stale check and state updates after finally — inflightRef is always decremented
    if (!data || requestId !== requestIdRef.current) return;
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
  }, [activeTags, mediaType, includeDeleted, createdFrom, createdTo, sortBy, sortOrder]);

  const refreshTags = useCallback(() => {
    getTags().then(setTags).catch(console.error);
  }, []);

  useEffect(() => {
    refreshTags();
  }, [refreshTags]);

  // useIsomorphicLayoutEffect で描画前に ref を同期更新する。
  // useEffect だとフィルタ変更後の React コミット〜useEffect 実行の間に
  // IntersectionObserver が発火し、旧 fetchMedia（旧フィルタ条件）が呼ばれるレースがある。
  // useLayoutEffect はコミット直後（ペイント前）に同期実行されるためこの競合を排除できる。
  // SSR 安全性のため useIsomorphicLayoutEffect を使用する（Issue #24）。
  useIsomorphicLayoutEffect(() => {
    fetchMediaRef.current = fetchMedia;
  }, [fetchMedia]);

  // Initial load and when filters change.
  // deps is [fetchMedia] only — fetchMedia's own useCallback deps already cover all filter values,
  // so this avoids the double-trigger risk when filter state changes.
  useEffect(() => {
    offsetRef.current = 0;
    void Promise.resolve().then(() => fetchMedia(true));
  }, [fetchMedia]);

  // pendingIdsRef: ポーリング関数が常に最新の ID リストにアクセスできるよう useEffect 内で更新
  const pendingIdsRef = useRef<number[]>([]);
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
          const updateMap = new Map(updates.map((u) => [u.id, u]));
          setItems((prev) => prev.map((item) => updateMap.get(item.id) ?? item));
          const anyCompleted = updates.some(
            (u) => u.clip_status !== 'pending' && u.clip_status !== 'running'
          );
          if (anyCompleted) refreshTags();
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
  }, [hasPending, refreshTags]);

  // Infinite scroll — sentinelRef is a stable ref object, no need to include in deps
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && inflightRef.current === 0) {
          fetchMediaRef.current(false);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    items, setItems,
    tags,
    total, setTotal,
    loading,
    hasMore,
    fetchMedia,
    refreshTags,
  };
}
