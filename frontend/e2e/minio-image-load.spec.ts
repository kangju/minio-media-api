/**
 * E2E スモークテスト: 環境変数で指定した MinIO ホストから画像が表示されること
 * ISSUE #53 の受け入れ条件検証
 */
import { test, expect } from '@playwright/test';

test.describe('ISSUE #53: MinIO 画像表示スモーク', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('img', { timeout: 15_000 });
  });

  test('ページが正常にロードされ GALLERY タイトルが表示される', async ({ page }) => {
    await expect(page.locator('text=GALLERY').first()).toBeVisible();
  });

  test('画像が broken image なく表示される', async ({ page }) => {
    const failedImages: string[] = [];
    page.on('response', (response) => {
      if (response.request().resourceType() === 'image' && !response.ok()) {
        failedImages.push(response.url());
      }
    });
    await page.reload();
    await page.waitForSelector('img', { timeout: 15_000 });
    await page.waitForTimeout(2_000);
    expect(failedImages).toHaveLength(0);
  });

  test('next/image が生成した img タグが有効な src を持つ', async ({ page }) => {
    const img = page.locator('img').first();
    await expect(img).toBeVisible();
    const src = await img.getAttribute('src');
    expect(src).toBeTruthy();
    expect(src).toMatch(/(\/_next\/image|http)/);
  });
});
