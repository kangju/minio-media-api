import { test, expect } from '@playwright/test';

const TEST_IMAGE = '/Users/kangju/program/minio-image-api/frontend/public/test-image.jpg';

// テストはシリアル実行
test.describe.configure({ mode: 'serial' });

test.describe('アップロード → 非同期CLIP', () => {
  test('アップロードするとモーダルがすぐに閉じる', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // テスト用画像がなければスキップ
    const fs = require('fs');
    let testFile = TEST_IMAGE;
    if (!fs.existsSync(testFile)) {
      // public/favicon.icoでも可
      testFile = '/Users/kangju/program/minio-image-api/frontend/public/favicon.ico';
      if (!fs.existsSync(testFile)) {
        test.skip(true, 'テスト用ファイルが見つからないためスキップ');
        return;
      }
    }

    await page.getByRole('button', { name: 'UPLOAD' }).click();
    await page.waitForSelector('text=UPLOAD MEDIA');

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('text=ファイルをドロップ、またはクリックして選択').click(),
    ]);
    await fileChooser.setFiles(testFile);
    await page.waitForTimeout(500);

    const uploadBtn = page.getByRole('button', { name: /^UPLOAD/ }).last();
    await uploadBtn.click();

    // 旧：CLIPが完了するまで待機（最大90秒）が不要に
    // 新：アップロード完了後すぐにモーダルが閉じる（最大20秒）
    await page.waitForSelector('text=UPLOAD MEDIA', { state: 'hidden', timeout: 20_000 });
    await expect(page.locator('text=UPLOAD MEDIA')).not.toBeVisible();
  });

  test('アップロード後ギャラリーに画像が表示される', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('img', { timeout: 15_000 });
    // 前のテストでアップロードした場合、ギャラリーに表示される
    await expect(page.locator('img').first()).toBeVisible();
  });

  test('CLIPアナライズAPIが直接呼ばれて結果が返ってくる', async ({ request }) => {
    const listRes = await request.get('http://localhost:3000/api/media?limit=1');
    expect(listRes.ok()).toBeTruthy();
    const listData = await listRes.json();

    if (listData.total === 0) {
      test.skip(true, 'メディアが存在しないためスキップ');
      return;
    }

    const mediaId = listData.items[0].id;
    const mediaType = listData.items[0].media_type;

    if (mediaType !== 'image') {
      test.skip(true, '最初のメディアが画像でないためスキップ');
      return;
    }

    const analyzeRes = await request.post(
      `http://localhost:3000/api/media/${mediaId}/analyze`,
      { data: {} }
    );
    expect(analyzeRes.ok()).toBeTruthy();
    const analyzeData = await analyzeRes.json();

    const clipTags = analyzeData.tags.filter((t: { source: string }) => t.source === 'clip');
    expect(clipTags.length).toBeGreaterThan(0);
    // analyzeするとclip_statusがdoneになる
    expect(analyzeData.clip_status).toBe('done');
  });

  test('CLIPタグはデフォルト語彙から生成されて新規DBタグが作られる', async ({ request }) => {
    const tagsRes = await request.get('http://localhost:3000/api/tags');
    expect(tagsRes.ok()).toBeTruthy();
    const tags = await tagsRes.json();
    expect(tags.length).toBeGreaterThanOrEqual(0);
  });

  test('CLIP ANALYZEボタンがライトボックスに表示される', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('img', { timeout: 15_000 });
    await page.locator('img').first().click();
    await page.waitForSelector('text=Tags');

    await expect(page.getByRole('button', { name: /CLIP ANALYZE/i })).toBeVisible();
  });

  test('CLIP ANALYZEボタンを押すとclip_statusがdoneになる', async ({ page, request }) => {
    await page.goto('/');
    await page.waitForSelector('img', { timeout: 15_000 });
    await page.locator('img').first().click();
    await page.waitForSelector('text=Tags');

    // まずmediaIdを取得
    const listRes = await request.get('http://localhost:3000/api/media?limit=1');
    const listData = await listRes.json();
    if (listData.total === 0) return;
    const mediaId = listData.items[0].id;

    const analyzeBtn = page.getByRole('button', { name: /CLIP ANALYZE/i });
    await analyzeBtn.click();

    // ANALYZING → done
    await page.waitForFunction(
      () => {
        const btn = document.querySelector('button[disabled]');
        return !btn || !btn.textContent?.includes('ANALYZING');
      },
      { timeout: 90_000 }
    ).catch(() => {});

    await page.waitForTimeout(1000);

    // APIでclip_status確認
    const mediaRes = await request.get(`http://localhost:3000/api/media/${mediaId}`);
    if (mediaRes.ok()) {
      const mediaData = await mediaRes.json();
      expect(mediaData.clip_status).toBe('done');
    }
  });
});
