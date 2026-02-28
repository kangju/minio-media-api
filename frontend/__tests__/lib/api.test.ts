/**
 * api.ts ユニットテスト
 * fetch はすべてモック。実際のネットワーク通信は行わない。
 */

const mockFetch = jest.fn();
global.fetch = mockFetch;

// addTag は内部で getMedia(POST後) を呼ぶため 2 回 fetch が走る
const MEDIA_STUB = {
  id: 1,
  original_filename: 'test.jpg',
  minio_key: 'bucket/test.jpg',
  media_type: 'image',
  created_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
  tags: [],
};

function okJson(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

describe('getMediaList', () => {
  beforeEach(() => mockFetch.mockReset());

  it('パラメータなしで /api/media を呼ぶ', async () => {
    mockFetch.mockResolvedValue(okJson({ items: [], total: 0, offset: 0, limit: 50 }));
    const { getMediaList } = await import('@/lib/api');
    const result = await getMediaList();
    expect(result.total).toBe(0);
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/media'));
  });

  it('単一タグフィルタ: ?tag=xxx', async () => {
    mockFetch.mockResolvedValue(okJson({ items: [], total: 0, offset: 0, limit: 50 }));
    const { getMediaList } = await import('@/lib/api');
    await getMediaList({ tags: ['nature'] });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('tag=nature');
  });

  it('複数タグフィルタ: tag=a&tag=b', async () => {
    mockFetch.mockResolvedValue(okJson({ items: [], total: 0, offset: 0, limit: 50 }));
    const { getMediaList } = await import('@/lib/api');
    await getMediaList({ tags: ['cat', 'outdoor'] });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('tag=cat');
    expect(url).toContain('tag=outdoor');
  });

  it('offset / limit を URLに含む', async () => {
    mockFetch.mockResolvedValue(okJson({ items: [], total: 0, offset: 50, limit: 50 }));
    const { getMediaList } = await import('@/lib/api');
    await getMediaList({ offset: 50, limit: 50 });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('offset=50');
    expect(url).toContain('limit=50');
  });

  it('ok=false のとき Error を投げる', async () => {
    mockFetch.mockResolvedValue({ ok: false } as Response);
    const { getMediaList } = await import('@/lib/api');
    await expect(getMediaList()).rejects.toThrow();
  });
});

describe('getMedia', () => {
  beforeEach(() => mockFetch.mockReset());

  it('/api/media/{id} を GET する', async () => {
    mockFetch.mockResolvedValue(okJson(MEDIA_STUB));
    const { getMedia } = await import('@/lib/api');
    const result = await getMedia(1);
    expect(result.id).toBe(1);
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/media/1'));
  });
});

describe('uploadMedia', () => {
  beforeEach(() => mockFetch.mockReset());

  it('multipart POST /api/media を呼ぶ', async () => {
    mockFetch.mockResolvedValue(okJson(MEDIA_STUB));
    const { uploadMedia } = await import('@/lib/api');
    const file = new File(['x'], 'test.jpg', { type: 'image/jpeg' });
    const result = await uploadMedia(file, ['tag1']);
    expect(result.id).toBe(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/media'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('deleteMedia', () => {
  beforeEach(() => mockFetch.mockReset());

  it('DELETE /api/media/{id} を呼ぶ', async () => {
    mockFetch.mockResolvedValue({ ok: true } as Response);
    const { deleteMedia } = await import('@/lib/api');
    await deleteMedia(42);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/media/42'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('ok=false のとき Error を投げる', async () => {
    mockFetch.mockResolvedValue({ ok: false } as Response);
    const { deleteMedia } = await import('@/lib/api');
    await expect(deleteMedia(1)).rejects.toThrow();
  });
});

describe('analyzeMedia', () => {
  beforeEach(() => mockFetch.mockReset());

  it('candidatesなし: POSTボディに空配列を送る', async () => {
    mockFetch.mockResolvedValue(okJson({ ...MEDIA_STUB, tags: [{ id: 1, name: 'flower', score: 0.9, source: 'clip' }] }));
    const { analyzeMedia } = await import('@/lib/api');
    const result = await analyzeMedia(1);
    expect(result.tags).toHaveLength(1);
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/media/1/analyze');
    expect(opts.method).toBe('POST');
    expect(opts.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(JSON.parse(opts.body as string)).toEqual({ candidates: [] });
  });

  it('candidatesあり: POSTボディにcandidatesを送る', async () => {
    mockFetch.mockResolvedValue(okJson({ ...MEDIA_STUB, tags: [] }));
    const { analyzeMedia } = await import('@/lib/api');
    await analyzeMedia(1, ['sky', 'mountain']);
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(opts.body as string)).toEqual({ candidates: ['sky', 'mountain'] });
  });
});

describe('addTag', () => {
  beforeEach(() => mockFetch.mockReset());

  it('POST /tags → GET /media/{id} の順で呼ぶ', async () => {
    // 1回目: POST /media/{id}/tags → TagResponse
    mockFetch.mockResolvedValueOnce(okJson({ id: 99, name: 'flower', score: null, source: 'user' }));
    // 2回目: GET /media/{id} → MediaResponse
    mockFetch.mockResolvedValueOnce(okJson({
      ...MEDIA_STUB,
      tags: [{ id: 99, name: 'flower', score: null, source: 'user' }],
    }));
    const { addTag } = await import('@/lib/api');
    const result = await addTag(1, 'flower');
    expect(result.tags).toHaveLength(1);
    expect(result.tags[0].name).toBe('flower');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [url1, opt1] = mockFetch.mock.calls[0];
    expect(url1).toContain('/api/media/1/tags');
    expect(opt1).toMatchObject({ method: 'POST' });
    const [url2] = mockFetch.mock.calls[1];
    expect(url2).toContain('/api/media/1');
  });
});

describe('removeTag', () => {
  beforeEach(() => mockFetch.mockReset());

  it('DELETE /api/media/{id}/tags/{tagId} を呼ぶ', async () => {
    mockFetch.mockResolvedValue({ ok: true } as Response);
    const { removeTag } = await import('@/lib/api');
    await removeTag(1, 99);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/media/1/tags/99'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});

describe('getTags', () => {
  beforeEach(() => mockFetch.mockReset());

  it('/api/tags を GET してリストを返す', async () => {
    const tags = [
      { id: 1, name: 'nature', media_count: 5, created_at: '2024-01-01T00:00:00Z' },
    ];
    mockFetch.mockResolvedValue(okJson(tags));
    const { getTags } = await import('@/lib/api');
    const result = await getTags();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('nature');
  });
});

describe('getMediaFileUrl', () => {
  it('IDから URL文字列を生成する', async () => {
    const { getMediaFileUrl } = await import('@/lib/api');
    expect(getMediaFileUrl(7)).toContain('/media/7/file');
  });
});
