import { NextResponse } from 'next/server';
import { getBackendUrl } from './server-config';

type Handler<T extends unknown[]> = (backend: string, ...args: T) => Promise<Response>;

/** BACKEND_URL を解決し、未設定なら 500 を返す共通ラッパー。 */
export function withBackend<T extends unknown[]>(
  handler: Handler<T>
): (...args: T) => Promise<Response> {
  return async (...args: T): Promise<Response> => {
    let backend: string;
    try {
      backend = getBackendUrl();
    } catch {
      return NextResponse.json({ detail: 'BACKEND_URL is not configured' }, { status: 500 });
    }
    return handler(backend, ...args);
  };
}
