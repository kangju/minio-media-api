/** BACKEND_URL を取得する。空文字・空白も未設定扱い（fail-fast）。*/
export function getBackendUrl(): string {
  const url = process.env.BACKEND_URL?.trim();
  if (!url) {
    throw new Error('BACKEND_URL environment variable is not set');
  }
  return url;
}
