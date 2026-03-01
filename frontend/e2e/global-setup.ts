import { request } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const SEED_COUNT = 5; // ソート順検証に必要な最低件数

/**
 * Docker E2E 用グローバルセットアップ:
 * テスト用画像をアップロードして DB を初期化する（不足している場合のみ）。
 */
async function globalSetup() {
  const baseURL = process.env.PW_BASE_URL || 'http://localhost:3000';
  const ctx = await request.newContext({ baseURL });

  // 既に十分なデータがある場合はスキップ
  const listRes = await ctx.get('/api/media?limit=1');
  if (listRes.ok()) {
    const data = await listRes.json();
    if (data.total >= SEED_COUNT) {
      console.log(`[global-setup] DB has ${data.total} items, skipping seed.`);
      await ctx.dispose();
      return;
    }
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
  // a〜e の5ファイルをアップロードしてソート順を検証できるようにする
  const names = ['seed-aaa.jpg', 'seed-bbb.jpg', 'seed-ccc.jpg', 'seed-ddd.jpg', 'seed-eee.jpg'];
  let seeded = 0;
  for (const name of names) {
    const res = await ctx.post('/api/media', {
      multipart: {
        file: { name, mimeType: 'image/jpeg', buffer: fileBuffer },
      },
    });
    if (res.ok()) seeded++;
  }
  console.log(`[global-setup] Seeded ${seeded} test images.`);

  await ctx.dispose();
}

export default globalSetup;
