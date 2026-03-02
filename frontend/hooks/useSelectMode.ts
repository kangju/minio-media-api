import { useState } from 'react';
import { MediaResponse } from '@/lib/types';

export function useSelectMode(items: MediaResponse[]) {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

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

  return {
    selectMode, setSelectMode,
    selectedIds, setSelectedIds,
    handleSelect,
    handleSelectAll,
  };
}
