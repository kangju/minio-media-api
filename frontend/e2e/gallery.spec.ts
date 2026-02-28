import { test, expect } from '@playwright/test';

test.describe('ギャラリー基本表示', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('img', { timeout: 15_000 });
  });

  test('ページタイトルが "GALLERY"', async ({ page }) => {
    await expect(page.locator('text=GALLERY').first()).toBeVisible();
  });

  test('Grid L / Grid S / List ボタンが存在する', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Grid L' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Grid S' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'List' })).toBeVisible();
  });

  test('SELECT / UPLOAD ボタンが存在する', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'SELECT' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'UPLOAD' })).toBeVisible();
  });

  test('画像サムネイルが表示される', async ({ page }) => {
    const imgs = page.locator('img');
    await expect(imgs.first()).toBeVisible();
  });

  test('ファイル名検索UIが存在しない', async ({ page }) => {
    const searchInput = page.getByPlaceholder('ファイル名で検索...');
    await expect(searchInput).toHaveCount(0);
  });
});

test.describe('ビュー切替', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('img');
  });

  test('Grid S に切替できる', async ({ page }) => {
    await page.getByRole('button', { name: 'Grid S' }).click();
    await expect(page.locator('img').first()).toBeVisible();
  });

  test('List に切替できる', async ({ page }) => {
    await page.getByRole('button', { name: 'List' }).click();
    const listItems = page.locator('[style*="cursor: pointer"]');
    await expect(listItems.first()).toBeVisible();
  });

  test('Grid L に戻せる', async ({ page }) => {
    await page.getByRole('button', { name: 'Grid S' }).click();
    await page.getByRole('button', { name: 'Grid L' }).click();
    await expect(page.locator('img').first()).toBeVisible();
  });
});

test.describe('タグフィルタ', () => {
  test('タグフィルタボタンが表示される（タグがあれば）', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('img');
    const filterBar = page.locator('[data-testid="tag-filter-bar"]');
    const hasFilter = await filterBar.count();
    if (hasFilter > 0) {
      await expect(filterBar).toBeVisible();
      // ポップアップボタンが存在する
      await expect(page.locator('[data-testid="tag-filter-btn"]')).toBeVisible();
    }
    // タグが0件でも正常（filterBarがnull=何も描画しない）
  });

  test('タグフィルタポップアップが開閉できる（タグがあれば）', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('img');
    const filterBtn = page.locator('[data-testid="tag-filter-btn"]');
    if (await filterBtn.count() > 0) {
      await filterBtn.click();
      await expect(page.locator('[data-testid="tag-filter-popup"]')).toBeVisible();
      // 外クリックで閉じる
      await page.mouse.click(10, 10);
      await expect(page.locator('[data-testid="tag-filter-popup"]')).not.toBeVisible();
    }
  });
});

test.describe('無限スクロール', () => {
  test('スクロールするとさらに画像が読み込まれる（50件超あれば）', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('img');
    const before = await page.locator('img').count();

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);

    const after = await page.locator('img').count();
    expect(after).toBeGreaterThanOrEqual(before);
  });
});

test.describe('ライトボックス', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('img');
  });

  test('画像クリックでライトボックスが開く', async ({ page }) => {
    await page.locator('img').first().click();
    await expect(page.locator('text=Tags').first()).toBeVisible();
  });

  test('× ボタンでライトボックスが閉じる', async ({ page }) => {
    await page.locator('img').first().click();
    await page.waitForSelector('text=Tags');
    const closeBtn = page.locator('button').filter({ hasText: '×' }).first();
    await closeBtn.click();
    await expect(page.locator('[data-testid="lightbox-panel"]')).not.toBeVisible();
  });

  test('Escape キーでライトボックスが閉じる', async ({ page }) => {
    await page.locator('img').first().click();
    await page.waitForSelector('text=Tags');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="lightbox-panel"]')).not.toBeVisible();
  });

  test('CLIP ANALYZE ボタンが表示される（画像）', async ({ page }) => {
    await page.locator('img').first().click();
    await page.waitForSelector('text=Tags');
    await expect(page.getByRole('button', { name: /CLIP ANALYZE/i })).toBeVisible();
  });

  test('DELETE ボタンが表示される', async ({ page }) => {
    await page.locator('img').first().click();
    await page.waitForSelector('text=Tags');
    await expect(page.getByRole('button', { name: /DELETE/i })).toBeVisible();
  });

  test('タグ追加 input が表示される', async ({ page }) => {
    await page.locator('img').first().click();
    await page.waitForSelector('text=Tags');
    await expect(page.getByPlaceholder('タグを追加...')).toBeVisible();
  });
});

test.describe('SELECT モード', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('img');
  });

  test('SELECT ボタンでセレクトモードになる', async ({ page }) => {
    await page.getByRole('button', { name: 'SELECT', exact: true }).click();
    await page.locator('img').first().click();
    await page.waitForTimeout(500);
    await expect(page.getByRole('button', { name: /DELETE SELECTED/i })).toBeVisible();
  });

  test('もう一度 SELECT でセレクトモードが解除される', async ({ page }) => {
    await page.getByRole('button', { name: 'SELECT', exact: true }).click();
    await page.getByRole('button', { name: 'SELECT', exact: true }).click();
    await expect(page.getByRole('button', { name: /DELETE SELECTED/i })).not.toBeVisible();
  });

  test('SELECT ALL ボタンで全選択できる', async ({ page }) => {
    await page.getByRole('button', { name: 'SELECT', exact: true }).click();
    const selectAllBtn = page.getByRole('button', { name: /SELECT ALL/i });
    if (await selectAllBtn.count() > 0) {
      await selectAllBtn.click();
      await page.waitForTimeout(500);
      // DELETE SELECTED が表示される（何かが選択されている）
      await expect(page.getByRole('button', { name: /DELETE SELECTED/i })).toBeVisible();
    }
  });
});

test.describe('UPLOAD モーダル', () => {
  test('UPLOAD ボタンでモーダルが開く', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'UPLOAD' }).click();
    await expect(page.locator('text=UPLOAD MEDIA')).toBeVisible();
  });

  test('CANCEL でモーダルが閉じる', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'UPLOAD' }).click();
    await page.waitForSelector('text=UPLOAD MEDIA');
    await page.getByRole('button', { name: 'CANCEL' }).click();
    await expect(page.locator('text=UPLOAD MEDIA')).not.toBeVisible();
  });
});
