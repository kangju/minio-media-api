import { test, expect } from '@playwright/test';

test.describe('タグ管理ページ基本表示', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tags');
    await page.waitForLoadState('networkidle');
  });

  test('TAGSページが表示される', async ({ page }) => {
    await expect(page.locator('[data-testid="tags-page"]')).toBeVisible();
  });

  test('← Gallery リンクが表示される', async ({ page }) => {
    await expect(page.locator('a', { hasText: /Gallery/i }).first()).toBeVisible();
  });

  test('← Gallery リンクでギャラリーに戻れる', async ({ page }) => {
    await page.locator('a', { hasText: /Gallery/i }).first().click();
    await page.waitForURL('/');
    await expect(page).toHaveURL('/');
  });

  test('タグ一覧が表示される（タグがあれば）', async ({ page }) => {
    const rows = page.locator('[data-testid^="tag-row-"]');
    const count = await rows.count();
    // DBにタグがあれば表示される
    if (count > 0) {
      await expect(rows.first()).toBeVisible();
    }
  });

  test('新規タグ入力フォームが表示される', async ({ page }) => {
    await expect(page.locator('[data-testid="new-tag-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="add-tag-btn"]')).toBeVisible();
  });
});

test.describe('タグ CRUD 操作', () => {
  const testTagName = `e2e-tag-${Date.now()}`;
  const renamedTagName = `e2e-tag-renamed-${Date.now()}`;

  test('新規タグを作成できる', async ({ page }) => {
    await page.goto('/tags');
    await page.waitForLoadState('networkidle');

    const input = page.locator('[data-testid="new-tag-input"]');
    await input.fill(testTagName);
    await page.locator('[data-testid="add-tag-btn"]').click();

    // 作成後にタグが一覧に現れる
    await page.waitForTimeout(1000);
    await expect(page.locator(`text=${testTagName}`)).toBeVisible();
  });

  test('作成したタグを編集できる', async ({ page }) => {
    await page.goto('/tags');
    await page.waitForLoadState('networkidle');

    // 対象タグの行を探す
    const rows = page.locator('[data-testid^="tag-row-"]');
    const count = await rows.count();

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const text = await row.textContent();
      if (text?.includes(testTagName)) {
        // 編集ボタンを取得してクリック
        const editBtns = page.locator('[data-testid^="edit-tag-btn-"]');
        const editBtn = editBtns.nth(i);
        await editBtn.click();

        // 入力フィールドが現れる
        const editInput = page.locator('[data-testid^="edit-tag-input-"]').first();
        await editInput.fill(renamedTagName);

        // 保存
        const saveBtns = page.locator('[data-testid^="save-tag-btn-"]');
        await saveBtns.first().click();
        await page.waitForTimeout(1000);

        await expect(page.locator(`text=${renamedTagName}`)).toBeVisible();
        break;
      }
    }
  });

  test('空名でタグを作成しようとするとエラー', async ({ page }) => {
    await page.goto('/tags');
    await page.waitForLoadState('networkidle');

    const addBtn = page.locator('[data-testid="add-tag-btn"]');
    // 入力なしでボタンが無効になっているか確認
    const isDisabled = await addBtn.isDisabled();
    expect(isDisabled).toBe(true);
  });

  test('作成したタグを削除できる', async ({ page }) => {
    await page.goto('/tags');
    await page.waitForLoadState('networkidle');

    // renamedTagName または testTagName を削除
    const rows = page.locator('[data-testid^="tag-row-"]');
    const count = await rows.count();

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const text = await row.textContent();
      if (text?.includes(renamedTagName) || text?.includes(testTagName)) {
        const deleteBtns = page.locator('[data-testid^="delete-tag-btn-"]');
        const deleteBtn = deleteBtns.nth(i);

        // confirm ダイアログを受け入れる
        page.on('dialog', (dialog) => dialog.accept());
        await deleteBtn.click();
        await page.waitForTimeout(1000);

        // タグが消えていることを確認
        await expect(page.locator(`text=${renamedTagName}`)).not.toBeVisible();
        break;
      }
    }
  });

  test('同名タグを作成するとエラーメッセージが出る', async ({ page }) => {
    await page.goto('/tags');
    await page.waitForLoadState('networkidle');

    // まず1つ作成
    const dupTagName = `e2e-dup-${Date.now()}`;
    const input = page.locator('[data-testid="new-tag-input"]');
    await input.fill(dupTagName);
    await page.locator('[data-testid="add-tag-btn"]').click();
    await page.waitForTimeout(1000);

    // 同名を再度作成
    await input.fill(dupTagName);
    await page.locator('[data-testid="add-tag-btn"]').click();
    await page.waitForTimeout(1000);

    // エラーメッセージが表示される
    await expect(page.locator('[data-testid="error-message"]').or(
      page.locator('text=/既に存在|duplicate|conflict/i')
    )).toBeVisible();

    // クリーンアップ: 作成したタグを削除
    const rows = page.locator('[data-testid^="tag-row-"]');
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const text = await row.textContent();
      if (text?.includes(dupTagName)) {
        const deleteBtns = page.locator('[data-testid^="delete-tag-btn-"]');
        page.on('dialog', (dialog) => dialog.accept());
        await deleteBtns.nth(i).click();
        await page.waitForTimeout(500);
        break;
      }
    }
  });
});

test.describe('ヘッダーナビゲーション（TAGSページから）', () => {
  test('GALLERYリンクでギャラリーに移動できる', async ({ page }) => {
    await page.goto('/tags');
    await page.waitForLoadState('networkidle');
    // HeaderのGALLERYリンクをクリック
    await page.locator('a', { hasText: 'GALLERY' }).click();
    await page.waitForURL('/');
    await expect(page).toHaveURL('/');
  });
});
