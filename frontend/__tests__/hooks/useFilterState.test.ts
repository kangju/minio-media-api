import { renderHook, act } from '@testing-library/react';
import { useFilterState } from '@/hooks/useFilterState';

describe('useFilterState', () => {
  it('初期値が正しい', () => {
    const { result } = renderHook(() => useFilterState());
    expect(result.current.mediaType).toBe('');
    expect(result.current.includeDeleted).toBe(false);
    expect(result.current.createdFrom).toBe('');
    expect(result.current.createdTo).toBe('');
    expect(result.current.sortBy).toBe('created_at');
    expect(result.current.sortOrder).toBe('desc');
    expect(result.current.activeTags).toEqual([]);
  });

  it('handleTagToggle でタグが追加される', () => {
    const { result } = renderHook(() => useFilterState());
    act(() => { result.current.handleTagToggle('cat'); });
    expect(result.current.activeTags).toEqual(['cat']);
  });

  it('handleTagToggle で同じタグを再度呼ぶと削除される', () => {
    const { result } = renderHook(() => useFilterState());
    act(() => { result.current.handleTagToggle('cat'); });
    act(() => { result.current.handleTagToggle('cat'); });
    expect(result.current.activeTags).toEqual([]);
  });

  it('handleTagToggle で複数タグを追加できる', () => {
    const { result } = renderHook(() => useFilterState());
    act(() => { result.current.handleTagToggle('cat'); });
    act(() => { result.current.handleTagToggle('dog'); });
    expect(result.current.activeTags).toEqual(['cat', 'dog']);
  });

  it('resetFilter で全フィールドが初期値に戻る', () => {
    const { result } = renderHook(() => useFilterState());
    act(() => {
      result.current.setMediaType('image');
      result.current.setIncludeDeleted(true);
      result.current.setCreatedFrom('2024-01-01');
      result.current.setCreatedTo('2024-12-31');
      result.current.setSortBy('original_filename');
      result.current.setSortOrder('asc');
      result.current.handleTagToggle('cat');
    });
    act(() => { result.current.resetFilter(); });
    expect(result.current.mediaType).toBe('');
    expect(result.current.includeDeleted).toBe(false);
    expect(result.current.createdFrom).toBe('');
    expect(result.current.createdTo).toBe('');
    expect(result.current.sortBy).toBe('created_at');
    expect(result.current.sortOrder).toBe('desc');
    expect(result.current.activeTags).toEqual([]);
  });
});
