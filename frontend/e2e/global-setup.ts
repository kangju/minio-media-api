import { request } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const SEED_NAMES = [
  'seed-aaa.jpg',
  'seed-bbb.jpg',
  'seed-ccc.jpg',
  'seed-ddd.jpg',
  'seed-eee.jpg',
];

/**
 * Docker E2E 用グローバルセットアップ:
 * sort テストが依存する seed-aaa〜seed-eee が存在しない場合のみアップロードする。
 * total 件数ではなくファイル名で確認することで、既存データの混在による不安定を防ぐ。
 */
async function globalSetup() {
  const baseURL = process.env.PW_BASE_URL || 'http://localhost:3000';
  const ctx = await request.newContext({ baseURL });

  // 既存メディアのファイル名一覧を取得（上限100件で判定）
  const listRes = await ctx.get('/api/media?limit=100');
  const existingNames = new Set<string>();
  if (listRes.ok()) {
    const data = await listRes.json();
    for (const item of data.items ?? []) {
      existingNames.add(item.original_filename);
    }
  }

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
      },
    });
    if (res.ok()) seeded++;
  }
  console.log(`[global-setup] Seeded ${seeded} test images (missing: ${missing.join(', ')}).`);

  await ctx.dispose();
}

export default globalSetup;
