import { getBackendUrl } from '@/lib/server-config';

describe('getBackendUrl', () => {
  const original = process.env.BACKEND_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = original;
  });

  it('returns BACKEND_URL when set', () => {
    process.env.BACKEND_URL = 'http://localhost:8000';
    expect(getBackendUrl()).toBe('http://localhost:8000');
  });

  it('throws when BACKEND_URL is not set', () => {
    delete process.env.BACKEND_URL;
    expect(() => getBackendUrl()).toThrow('BACKEND_URL environment variable is not set');
  });

  it('throws when BACKEND_URL is blank (whitespace only)', () => {
    process.env.BACKEND_URL = '   ';
    expect(() => getBackendUrl()).toThrow('BACKEND_URL environment variable is not set');
  });
});
