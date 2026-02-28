export type SortBy = 'created_at' | 'original_filename';
export type SortOrder = 'asc' | 'desc';

export interface TagInfo {
  id: number;
  name: string;
  score: number | null;
  source: 'user' | 'clip' | null;
}

export interface MediaResponse {
  id: number;
  original_filename: string;
  minio_key: string;
  media_type: 'image' | 'video';
  created_at: string;
  deleted_at: string | null;
  tags: TagInfo[];
  clip_status?: 'pending' | 'running' | 'done' | 'error';
}

export interface MediaListResponse {
  items: MediaResponse[];
  total: number;
  offset: number;
  limit: number;
}

export interface TagResponse {
  id: number;
  name: string;
  media_count: number;
  created_at: string;
}
