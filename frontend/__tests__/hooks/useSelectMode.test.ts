import { renderHook, act } from '@testing-library/react';
import { useSelectMode } from '@/hooks/useSelectMode';
import { MediaResponse } from '@/lib/types';

function makeMedia(id: number): MediaResponse {
  return {
    id,
    original_filename: `file${id}.jpg`,
    minio_key: `key/${id}`,
    media_type: 'image',
    created_at: '2024-01-01T00:00:00Z',
    deleted_at: null,
    tags: [],
    clip_status: 'done',
  };
}

describe('useSelectMode', () => {
  it('初期値が正しい', () => {
    const { result } = renderHook(() => useSelectMode([]));
    expect(result.current.selectMode).toBe(false);
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('handleSelect で ID が追加される', () => {
    const { result } = renderHook(() => useSelectMode([makeMedia(1), makeMedia(2)]));
    act(() => { result.current.handleSelect(1); });
    expect(result.current.selectedIds.has(1)).toBe(true);
    expect(result.current.selectedIds.has(2)).toBe(false);
  });

  it('handleSelect で同じ ID を再度呼ぶと削除される（toggle）', () => {
    const { result } = renderHook(() => useSelectMode([makeMedia(1)]));
    act(() => { result.current.handleSelect(1); });
    act(() => { result.current.handleSelect(1); });
    expect(result.current.selectedIds.has(1)).toBe(false);
  });

  it('handleSelectAll で全アイテムが選択される', () => {
    const items = [makeMedia(1), makeMedia(2), makeMedia(3)];
    const { result } = renderHook(() => useSelectMode(items));
    act(() => { result.current.handleSelectAll(); });
    expect(result.current.selectedIds.size).toBe(3);
    expect(result.current.selectedIds.has(1)).toBe(true);
    expect(result.current.selectedIds.has(2)).toBe(true);
    expect(result.current.selectedIds.has(3)).toBe(true);
  });

  it('handleSelectAll で全選択済みの場合は全解除される', () => {
    const items = [makeMedia(1), makeMedia(2)];
    const { result } = renderHook(() => useSelectMode(items));
    // まず全選択
    act(() => { result.current.handleSelectAll(); });
    expect(result.current.selectedIds.size).toBe(2);
    // 再度 handleSelectAll で全解除
    act(() => { result.current.handleSelectAll(); });
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('items が空の場合 handleSelectAll で何も選択されない', () => {
    const { result } = renderHook(() => useSelectMode([]));
    act(() => { result.current.handleSelectAll(); });
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('setSelectMode(false) は呼び出し元が selectedIds をクリアできる', () => {
    const { result } = renderHook(() => useSelectMode([makeMedia(1)]));
    act(() => { result.current.handleSelect(1); });
    act(() => {
      result.current.setSelectMode(false);
      result.current.setSelectedIds(new Set());
    });
    expect(result.current.selectMode).toBe(false);
    expect(result.current.selectedIds.size).toBe(0);
  });
});
