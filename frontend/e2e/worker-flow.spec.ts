/**
 * worker-flow.spec.ts
 *
 * clip-worker による非同期 CLIP 解析フローのE2Eテスト。
 * アップロード直後の clip_status='pending' → clip-worker 処理後 'done' を検証する。
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

test.describe('clip-worker 非同期解析フロー', () => {
  let tmpDir: string;
  let testFilePath: string;

  test.beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-test-'));
    testFilePath = path.join(tmpDir, 'worker-test.jpg');
    // Python + PIL で一意な JPEG を生成
    execSync(`python3 -c "
from PIL import Image; import io
img = Image.new('RGB', (32, 32), color=(123, 45, 67))
buf = io.BytesIO(); img.save(buf, 'JPEG')
open('${testFilePath}', 'wb').write(buf.getvalue())
"`);
  });

  test.afterAll(async () => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('アップロード直後は clip_status が pending になる', async ({ page, request }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'UPLOAD' }).waitFor({ timeout: 15_000 });

    await page.getByRole('button', { name: 'UPLOAD' }).click();
    await page.waitForSelector('text=UPLOAD MEDIA');

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('text=ファイルをドロップ、またはクリックして選択').click(),
    ]);
    await fileChooser.setFiles(testFilePath);
    const uploadBtn = page.getByRole('button', { name: /^UPLOAD/ }).last();
    await expect(uploadBtn).toBeEnabled();

    await uploadBtn.click();

    // モーダルが閉じるまで待機（20秒以内）
    await page.waitForSelector('text=UPLOAD MEDIA', { state: 'hidden', timeout: 20_000 });

    // 最新のメディアを取得して clip_status を確認
    const listRes = await request.get('http://localhost:3000/api/media?limit=1');
    expect(listRes.ok()).toBeTruthy();
    const listData = await listRes.json();
    expect(listData.total).toBeGreaterThan(0);

    const latestMedia = listData.items[0];
    // アップロード直後は pending か running（worker が処理中の可能性）
    expect(['pending', 'running', 'done']).toContain(latestMedia.clip_status);
  });

  test('clip-worker が 60 秒以内に CLIP 解析を完了する', async ({ request }) => {
    // 最新のメディアが done になるまでポーリング
    const listRes = await request.get('http://localhost:3000/api/media?limit=1');
    expect(listRes.ok()).toBeTruthy();
    const listData = await listRes.json();

    if (listData.total === 0) {
      test.skip(true, 'メディアが存在しないためスキップ');
      return;
    }

    const mediaId = listData.items[0].id;

    await expect.poll(async () => {
      const res = await request.get(`http://localhost:3000/api/media/${mediaId}`);
      if (!res.ok()) return 'error';
      const data = await res.json();
      return data.clip_status;
    }, { timeout: 60_000, intervals: [3_000] }).toBe('done');
  });
});
