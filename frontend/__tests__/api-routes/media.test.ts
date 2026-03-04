/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

// Next/Jest 環境差に耐える NextRequest 生成ヘルパー（フォールバック付き）
function makeRequest(url: string, init?: RequestInit): NextRequest {
  try {
    return new NextRequest(url, init);
  } catch {
    // フォールバック経路
    return new Request(url, init) as unknown as NextRequest;
  }
}

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('media route handlers', () => {
  const originalBackendUrl = process.env.BACKEND_URL;

  beforeEach(() => {
    mockFetch.mockReset();
    jest.resetModules();
  });
  afterEach(() => {
    if (originalBackendUrl === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = originalBackendUrl;
  });

  describe('BACKEND_URL 未設定時', () => {
    beforeEach(() => { delete process.env.BACKEND_URL; });

    it('GET /api/media — 500 + detail を返す', async () => {
      const { GET } = await import('@/app/api/media/route');
      const res = await GET(makeRequest('http://localhost/api/media'));
      expect(res.status).toBe(500);
      expect((await res.json()).detail).toBe('BACKEND_URL is not configured');
    });

    it('POST /api/media — フォールバック経路経由でも 500 を返す', async () => {
      const { POST } = await import('@/app/api/media/route');
      // フォールバック経路: Request as unknown as NextRequest
      const res = await POST(new Request('http://localhost/api/media', { method: 'POST' }) as unknown as NextRequest);
      expect(res.status).toBe(500);
    });
  });

  describe('BACKEND_URL 設定時（プロキシ挙動の回帰防止）', () => {
    beforeEach(() => { process.env.BACKEND_URL = 'http://test-backend:8000'; });

    it('GET /api/media — backend URL へ fetch する', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [], total: 0, offset: 0, limit: 50 }), { status: 200 })
      );
      const { GET } = await import('@/app/api/media/route');
      const res = await GET(makeRequest('http://localhost/api/media'));
      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('http://test-backend:8000/media'),
      );
    });
  });
});
