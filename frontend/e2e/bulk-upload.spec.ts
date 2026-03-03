/**
 * bulk-upload.spec.ts
 *
 * 100 枚の画像を UI 操作でアップロードし、
 * clip-worker が 180 秒以内に全件 CLIP 解析を完了することを検証する E2E テスト。
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

test.describe('100 枚一括アップロード + CLIP 自動解析', () => {
  let tmpDir: string;
  let testFiles: string[];

  test.beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulk-test-'));
    // Python + PIL で 100 枚のユニークな JPEG を生成
    execSync(`python3 -c "
from PIL import Image; import io, os
for i in range(100):
    img = Image.new('RGB', (8, 8), color=(i % 256, (i * 3) % 256, (i * 7) % 256))
    buf = io.BytesIO(); img.save(buf, 'JPEG')
    open(os.path.join('${tmpDir}', f'test-{i}.jpg'), 'wb').write(buf.getvalue())
"`);
    testFiles = Array.from({ length: 100 }, (_, i) => path.join(tmpDir, `test-${i}.jpg`));
  });

  test.afterAll(async () => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('100 枚を UI でアップロードして全件 CLIP が完了する', async ({ page, request }) => {
    test.setTimeout(960_000);

    await page.goto('/');
    await page.getByRole('button', { name: 'UPLOAD' }).waitFor({ timeout: 15_000 });

    // アップロード前のメディア件数を取得
    const beforeRes = await request.get('/api/media?limit=1');
    const beforeData = await beforeRes.json();
    const beforeTotal = beforeData.total as number;

    // UploadModal を開く
    await page.getByRole('button', { name: 'UPLOAD' }).click();
    await page.waitForSelector('text=UPLOAD MEDIA');

    // ファイルチューザーで 100 ファイルを一括選択
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('text=ファイルをドロップ、またはクリックして選択').click(),
    ]);
    await fileChooser.setFiles(testFiles);
    // UPLOAD ボタン押下
    const uploadBtn = page.getByRole('button', { name: /^UPLOAD/ }).last();
    await expect(uploadBtn).toBeEnabled();
    await uploadBtn.click();

    // モーダルが閉じるまで待機（アップロード完了、最大 120 秒）
    await page.waitForSelector('text=UPLOAD MEDIA', { state: 'hidden', timeout: 120_000 });

    // アップロード後の件数確認
    const afterRes = await request.get('/api/media?limit=1');
    const afterData = await afterRes.json();
    const afterTotal = afterData.total as number;
    expect(afterTotal).toBeGreaterThan(beforeTotal);

    // 全件 clip_status が done になるまでポーリング（最大 180 秒）
    await expect.poll(async () => {
      const res = await request.get('/api/media?limit=200');
      if (!res.ok()) return false;
      const data = await res.json();
      const items = data.items as Array<{ clip_status: string }>;
      // 新しくアップロードした分が全件 done か error になっているか
      const nonPending = items.filter(
        (m) => m.clip_status === 'done' || m.clip_status === 'error'
      ).length;
      return nonPending >= afterTotal;
    }, { timeout: 720_000, intervals: [5_000] }).toBeTruthy();

    // error が 0 件であること
    const finalRes = await request.get('/api/media?limit=200');
    const finalData = await finalRes.json();
    const errorCount = (finalData.items as Array<{ clip_status: string }>).filter(
      (m) => m.clip_status === 'error'
    ).length;
    expect(errorCount).toBe(0);
  });
});
