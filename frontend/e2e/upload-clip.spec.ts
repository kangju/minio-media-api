import { test, expect } from '@playwright/test';
import fs from 'fs';
import * as path from 'path';

const TEST_IMAGE_CANDIDATES = [
  path.join(__dirname, '..', 'public', 'test-image.jpg'),
  path.join(__dirname, '..', 'public', 'favicon.ico'),
];

// テストはシリアル実行
test.describe.configure({ mode: 'serial' });

test.describe('アップロード → 非同期CLIP', () => {
  test('アップロードするとモーダルがすぐに閉じる', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'UPLOAD' }).waitFor({ timeout: 15_000 });

    // テスト用画像がなければスキップ
    const testFile = TEST_IMAGE_CANDIDATES.find((f) => fs.existsSync(f));
    if (!testFile) {
      test.skip(true, 'テスト用ファイルが見つからないためスキップ');
      return;
    }

    await page.getByRole('button', { name: 'UPLOAD' }).click();
    await page.waitForSelector('text=UPLOAD MEDIA');

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('text=ファイルをドロップ、またはクリックして選択').click(),
    ]);
    await fileChooser.setFiles(testFile);
    const uploadBtn = page.getByRole('button', { name: /^UPLOAD/ }).last();
    await expect(uploadBtn).toBeEnabled();

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
    const listRes = await request.get('/api/media?limit=1');
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
      `/api/media/${mediaId}/analyze`,
      { data: {} }
    );
    expect(analyzeRes.ok()).toBeTruthy();
    const analyzeData = await analyzeRes.json();

    const clipTags = analyzeData.tags.filter((t: { source: string }) => t.source === 'clip');
    expect(clipTags.length).toBeGreaterThan(0);
    // analyzeするとclip_statusがdoneになる
    expect(analyzeData.clip_status).toBe('done');
  });

  test('analyze結果のclipタグがDBに反映される', async ({ request }) => {
    // 未解析の画像を探す（clip_status !== 'done'）
    const listRes = await request.get('/api/media?limit=50');
    expect(listRes.ok()).toBeTruthy();
    const listData = await listRes.json();

    const pendingImage = listData.items.find(
      (item: { media_type: string; clip_status: string }) =>
        item.media_type === 'image' && item.clip_status !== 'done'
    );
    if (!pendingImage) {
      test.skip(true, '未解析の画像が存在しないためスキップ');
      return;
    }

    // analyze前: このメディアのCLIPタグIDを記録（未解析なので空のはず）
    const beforeMediaRes = await request.get(`/api/media/${pendingImage.id}`);
    expect(beforeMediaRes.ok()).toBeTruthy();
    const beforeMedia = await beforeMediaRes.json();
    const beforeClipIds = new Set(
      (beforeMedia.tags ?? [])
        .filter((t: { source: string }) => t.source === 'clip')
        .map((t: { id: number }) => t.id)
    );

    // analyze実行
    const analyzeRes = await request.post(`/api/media/${pendingImage.id}/analyze`, { data: {} });
    expect(analyzeRes.ok()).toBeTruthy();
    const analyzeData = await analyzeRes.json();

    // analyzeレスポンスにCLIPタグが含まれること
    const responseClipTags: Array<{ id: number; source: string }> = analyzeData.tags.filter(
      (t: { source: string }) => t.source === 'clip'
    );
    expect(responseClipTags.length).toBeGreaterThan(0);

    // analyze後: このメディアを再取得し、CLIPタグが追加されたことを確認（因果検証）
    const afterMediaRes = await request.get(`/api/media/${pendingImage.id}`);
    expect(afterMediaRes.ok()).toBeTruthy();
    const afterMedia = await afterMediaRes.json();
    const newClipTagsForMedia = (afterMedia.tags ?? []).filter(
      (t: { source: string; id: number }) =>
        t.source === 'clip' && !beforeClipIds.has(t.id)
    );
    expect(newClipTagsForMedia.length).toBeGreaterThan(0);
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
    const listRes = await request.get('/api/media?limit=1');
    const listData = await listRes.json();
    if (listData.total === 0) {
      test.skip(true, 'メディアが存在しないためスキップ');
      return;
    }
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

    // APIでclip_status確認
    const mediaRes = await request.get(`/api/media/${mediaId}`);
    expect(mediaRes.ok()).toBeTruthy();
    const mediaData = await mediaRes.json();
    expect(mediaData.clip_status).toBe('done');
  });
});
