import { useState } from 'react';

export function useFilterState() {
  const [mediaType, setMediaType] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [sortBy, setSortBy] = useState<'created_at' | 'original_filename'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [activeTags, setActiveTags] = useState<string[]>([]);

  function handleTagToggle(tagName: string) {
    setActiveTags((prev) =>
      prev.includes(tagName) ? prev.filter((t) => t !== tagName) : [...prev, tagName]
    );
  }

  function resetFilter() {
    setMediaType('');
    setIncludeDeleted(false);
    setCreatedFrom('');
    setCreatedTo('');
    setSortBy('created_at');
    setSortOrder('desc');
    setActiveTags([]);
  }

  return {
    mediaType, setMediaType,
    includeDeleted, setIncludeDeleted,
    createdFrom, setCreatedFrom,
    createdTo, setCreatedTo,
    sortBy, setSortBy,
    sortOrder, setSortOrder,
    activeTags, setActiveTags,
    handleTagToggle,
    resetFilter,
  };
}
