import { FullConfig, request } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const SEED_NAMES = [
  'seed-aaa.jpg',
  'seed-bbb.jpg',
  'seed-ccc.jpg',
  'seed-ddd.jpg',
  'seed-eee.jpg',
];

/** baseURL を FullConfig から解決する（テスト可能な純粋関数）。 */
export function resolveBaseURL(config: FullConfig): string {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) {
    throw new Error('[global-setup] baseURL が未設定です。PW_BASE_URL 環境変数を設定してください。');
  }
  return baseURL;
}

/**
 * Docker E2E 用グローバルセットアップ:
 * sort テストが依存する seed-aaa〜seed-eee が存在しない場合のみアップロードする。
 * タグ依存をやめ original_filename で判定することで、タグAPI変更の影響を受けない。
 */
async function globalSetup(config: FullConfig) {
  const baseURL = resolveBaseURL(config);
  const ctx = await request.newContext({ baseURL });

  // タグ条件なしで全件をページネーションし、SEED_NAMES に含まれるファイル名をクライアント側で抽出
  const existingNames = new Set<string>();
  const pageLimit = 100;
  let offset = 0;
  outer: while (true) {
    const res = await ctx.get(`/api/media?limit=${pageLimit}&offset=${offset}`);
    if (!res.ok()) break;
    const data = await res.json();
    const items: Array<{ original_filename: string }> = data.items ?? [];
    for (const item of items) {
      if (SEED_NAMES.includes(item.original_filename)) {
        existingNames.add(item.original_filename);
        if (existingNames.size === SEED_NAMES.length) break outer;
      }
    }
    if (items.length < pageLimit) break;
    offset += pageLimit;
  }
  console.log(`[global-setup] Found ${existingNames.size}/${SEED_NAMES.length} seed files already exist.`);

  // seed-aaa〜seed-eee がすべて揃っていればスキップ
  const missing = SEED_NAMES.filter((n) => !existingNames.has(n));
  if (missing.length === 0) {
    console.log('[global-setup] All seed files exist, skipping seed.');
    await ctx.dispose();
    return;
  }

  // テスト画像を探す（Docker では /work/public、ホストでは絶対パス）
  const candidates = [
    path.join(__dirname, '..', 'public', 'test-image.jpg'),
    path.join(__dirname, '..', 'public', 'favicon.ico'),
  ];
  const testFile = candidates.find((f) => fs.existsSync(f));
  if (!testFile) {
    console.warn('[global-setup] No test file found, skipping seed.');
    await ctx.dispose();
    return;
  }

  const fileBuffer = fs.readFileSync(testFile);
  let seeded = 0;
  for (const name of missing) {
    const res = await ctx.post('/api/media', {
      multipart: {
        file: { name, mimeType: 'image/jpeg', buffer: fileBuffer },
        tags: 'e2e-seed',
      },
    });
    if (res.ok()) seeded++;
  }
  console.log(`[global-setup] Seeded ${seeded} test images (missing: ${missing.join(', ')}).`);

  await ctx.dispose();
}

export default globalSetup;
