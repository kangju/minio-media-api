import type { MediaListResponse, MediaResponse, TagResponse } from './types';

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

export async function getMediaList(params?: {
  tags?: string[];
  media_type?: string;
  include_deleted?: boolean;
  created_from?: string;
  created_to?: string;
  offset?: number;
  limit?: number;
  sort_by?: 'created_at' | 'original_filename';
  sort_order?: 'asc' | 'desc';
}): Promise<MediaListResponse> {
  const q = new URLSearchParams();
  params?.tags?.forEach((t) => q.append('tag', t));
  if (params?.media_type) q.set('media_type', params.media_type);
  if (params?.include_deleted) q.set('include_deleted', 'true');
  if (params?.created_from) q.set('created_from', params.created_from);
  if (params?.created_to) q.set('created_to', params.created_to);
  if (params?.offset != null) q.set('offset', String(params.offset));
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.sort_by) q.set('sort_by', params.sort_by);
  if (params?.sort_order) q.set('sort_order', params.sort_order);
  const res = await fetch(`${BASE}/media?${q.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch media list');
  return res.json();
}

export async function uploadMedia(file: File, tags: string[]): Promise<MediaResponse> {
  const form = new FormData();
  form.append('file', file);
  tags.forEach((t) => form.append('tags[]', t));
  const res = await fetch(`${BASE}/media`, { method: 'POST', body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (body?.media_id) {
      // MinIOアップロード失敗だがDBレコードは作成済み
      throw new Error(`ストレージ保存失敗 (ID: ${body.media_id})`);
    }
    throw new Error(body?.detail ?? 'Upload failed');
  }
  return res.json();
}

export async function getMedia(id: number): Promise<MediaResponse> {
  const res = await fetch(`${BASE}/media/${id}`);
  if (!res.ok) throw new Error('Failed to fetch media');
  return res.json();
}

export function getMediaFileUrl(id: number): string {
  return `${BASE}/media/${id}/file`;
}

export async function deleteMedia(id: number): Promise<void> {
  const res = await fetch(`${BASE}/media/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Delete failed');
}

export async function analyzeMedia(id: number, candidates?: string[]): Promise<MediaResponse> {
  const res = await fetch(`${BASE}/media/${id}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidates: candidates ?? [] }),
  });
  if (!res.ok) throw new Error('Analyze failed');
  return res.json();
}

export async function addTag(id: number, tagName: string): Promise<MediaResponse> {
  const res = await fetch(`${BASE}/media/${id}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag_name: tagName }),
  });
  if (!res.ok) throw new Error('Add tag failed');
  // backend returns TagResponse, so refetch full media
  return getMedia(id);
}

export async function removeTag(id: number, tagId: number): Promise<void> {
  const res = await fetch(`${BASE}/media/${id}/tags/${tagId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Remove tag failed');
}

export async function getTags(): Promise<TagResponse[]> {
  const res = await fetch(`${BASE}/tags`);
  if (!res.ok) throw new Error('Failed to fetch tags');
  return res.json();
}

export async function createTag(name: string): Promise<TagResponse> {
  const res = await fetch(`${BASE}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? 'Create tag failed');
  }
  return res.json();
}

export async function updateTag(id: number, name: string): Promise<TagResponse> {
  const res = await fetch(`${BASE}/tags/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('Update tag failed');
  return res.json();
}

export async function deleteTag(id: number): Promise<void> {
  const res = await fetch(`${BASE}/tags/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Delete tag failed');
}
