/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

function makeRequest(url: string, init?: RequestInit): NextRequest {
  try {
    return new NextRequest(url, init);
  } catch {
    return new Request(url, init) as unknown as NextRequest;
  }
}

describe('tags route handlers', () => {
  const originalBackendUrl = process.env.BACKEND_URL;

  beforeEach(() => {
    jest.resetModules();
    delete process.env.BACKEND_URL;
  });
  afterEach(() => {
    if (originalBackendUrl === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = originalBackendUrl;
  });

  it('GET /api/tags — BACKEND_URL 未設定時に 500 を返す', async () => {
    const { GET } = await import('@/app/api/tags/route');
    const res = await GET(makeRequest('http://localhost/api/tags'));
    expect(res.status).toBe(500);
    expect((await res.json()).detail).toBe('BACKEND_URL is not configured');
  });
});
