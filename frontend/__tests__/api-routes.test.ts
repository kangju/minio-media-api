const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('API Routes (mocked)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('getMediaList calls /api/media', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [], total: 0, offset: 0, limit: 50 }),
    });
    const { getMediaList } = await import('@/lib/api');
    const result = await getMediaList();
    expect(result.total).toBe(0);
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/media'));
  });

  it('uploadMedia calls POST /api/media', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 1,
        original_filename: 'test.jpg',
        minio_key: 'key',
        media_type: 'image',
        created_at: new Date().toISOString(),
        deleted_at: null,
        tags: [],
      }),
    });
    const { uploadMedia } = await import('@/lib/api');
    const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
    const result = await uploadMedia(file, ['tag1']);
    expect(result.id).toBe(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/media'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('deleteMedia calls DELETE /api/media/{id}', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const { deleteMedia } = await import('@/lib/api');
    await deleteMedia(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/media/1'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('getTags calls /api/tags', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 1, name: 'tag1', media_count: 2, created_at: new Date().toISOString() }],
    });
    const { getTags } = await import('@/lib/api');
    const result = await getTags();
    expect(result).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/tags'));
  });

  it('addTag calls POST /api/media/{id}/tags', async () => {
    // addTag は POST後にGETも呼ぶため2回mock
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 1, name: 'newtag', score: null, source: 'user' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 1, original_filename: 'test.jpg', minio_key: 'key',
          media_type: 'image', created_at: new Date().toISOString(), deleted_at: null,
          tags: [{ id: 1, name: 'newtag', score: null, source: 'user' }],
        }),
      });
    const { addTag } = await import('@/lib/api');
    const result = await addTag(1, 'newtag');
    expect(result.tags).toHaveLength(1);
  });

  it('analyzeMedia sends JSON body with candidates', async () => {
    const mediaStub = {
      id: 1, original_filename: 'test.jpg', minio_key: 'key',
      media_type: 'image', created_at: new Date().toISOString(), deleted_at: null,
      tags: [{ id: 1, name: 'sky', score: 0.9, source: 'clip' }],
    };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mediaStub });
    const { analyzeMedia } = await import('@/lib/api');
    const result = await analyzeMedia(1, ['sky', 'mountain']);
    expect(result.tags).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/media/1/analyze'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ candidates: ['sky', 'mountain'] }),
      })
    );
  });
});
