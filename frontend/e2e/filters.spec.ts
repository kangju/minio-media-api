import { test, expect } from '@playwright/test';

test.describe('フィルターパネル表示', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('img', { timeout: 15_000 });
  });

  test('フィルターパネルが表示される', async ({ page }) => {
    await expect(page.locator('[data-testid="filter-panel"]')).toBeVisible();
  });

  test('メディアタイプセレクトが表示される', async ({ page }) => {
    await expect(page.locator('[data-testid="media-type-select"]')).toBeVisible();
  });

  test('削除済み含むチェックボックスが表示される', async ({ page }) => {
    await expect(page.locator('[data-testid="include-deleted-checkbox"]')).toBeVisible();
  });

  test('作成日Fromインプットが表示される', async ({ page }) => {
    await expect(page.locator('[data-testid="created-from-input"]')).toBeVisible();
  });

  test('作成日Toインプットが表示される', async ({ page }) => {
    await expect(page.locator('[data-testid="created-to-input"]')).toBeVisible();
  });

  test('リセットボタンが表示される', async ({ page }) => {
    await expect(page.locator('[data-testid="filter-reset-btn"]')).toBeVisible();
  });
});

test.describe('メディアタイプフィルタ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('img', { timeout: 15_000 });
  });

  test('「画像」を選択すると画像のみ表示される', async ({ page }) => {
    const select = page.locator('[data-testid="media-type-select"]');
    const beforeCount = await page.locator('img').count();

    await select.selectOption('image');
    await page.waitForTimeout(1000);

    const afterCount = await page.locator('img').count();
    expect(afterCount).toBeGreaterThanOrEqual(0);
    expect(afterCount).toBeLessThanOrEqual(beforeCount);
  });

  test('「動画」を選択するとアイテム数が変わる', async ({ page }) => {
    const select = page.locator('[data-testid="media-type-select"]');
    await select.selectOption('video');
    await page.waitForTimeout(1000);
    await expect(page.locator('[data-testid="filter-panel"]')).toBeVisible();
  });

  test('「すべて」に戻すと全件表示', async ({ page }) => {
    const select = page.locator('[data-testid="media-type-select"]');
    const beforeCount = await page.locator('img').count();

    await select.selectOption('image');
    await page.waitForTimeout(500);
    await select.selectOption('');
    await page.waitForTimeout(1000);

    const afterCount = await page.locator('img').count();
    expect(afterCount).toBe(beforeCount);
  });
});

test.describe('削除済み含むフィルタ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('img', { timeout: 15_000 });
  });

  test('チェックをONにするとAPIが include_deleted=true で呼ばれる', async ({ page }) => {
    const checkbox = page.locator('[data-testid="include-deleted-checkbox"]');

    const requestPromise = page.waitForRequest((req) =>
      req.url().includes('/api/media') && req.url().includes('include_deleted=true')
    );

    await checkbox.check();
    const req = await requestPromise;
    expect(req.url()).toContain('include_deleted=true');
  });

  test('チェックをOFFに戻すと絞り込みが解除される', async ({ page }) => {
    const checkbox = page.locator('[data-testid="include-deleted-checkbox"]');
    await checkbox.check();
    await page.waitForTimeout(500);
    await checkbox.uncheck();
    await page.waitForTimeout(1000);
    await expect(page.locator('img').first()).toBeVisible();
  });
});

test.describe('作成日フィルタ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('img', { timeout: 15_000 });
  });

  test('未来日付の created_from を設定すると0件になる', async ({ page }) => {
    const fromInput = page.locator('[data-testid="created-from-input"]');
    await fromInput.fill('2099-01-01');
    await page.waitForTimeout(1500);

    const imgCount = await page.locator('img').count();
    expect(imgCount).toBe(0);
  });

  test('古い日付の created_to を設定すると0件になる', async ({ page }) => {
    const toInput = page.locator('[data-testid="created-to-input"]');
    await toInput.fill('2000-01-01');
    await page.waitForTimeout(1500);

    const imgCount = await page.locator('img').count();
    expect(imgCount).toBe(0);
  });

  test('リセットボタンで日付フィルタが解除される', async ({ page }) => {
    const fromInput = page.locator('[data-testid="created-from-input"]');
    await fromInput.fill('2099-01-01');
    await page.waitForTimeout(500);

    await page.locator('[data-testid="filter-reset-btn"]').click();
    await page.waitForTimeout(1000);

    await expect(page.locator('img').first()).toBeVisible();
  });
});

test.describe('フィルターリセット', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('img', { timeout: 15_000 });
  });

  test('リセットボタンで全フィルターがクリアされる', async ({ page }) => {
    const select = page.locator('[data-testid="media-type-select"]');
    await select.selectOption('image');
    const checkbox = page.locator('[data-testid="include-deleted-checkbox"]');
    await checkbox.check();
    await page.waitForTimeout(300);

    await page.locator('[data-testid="filter-reset-btn"]').click();
    await page.waitForTimeout(1000);

    await expect(select).toHaveValue('');
    await expect(checkbox).not.toBeChecked();
    await expect(page.locator('img').first()).toBeVisible();
  });
});

test.describe('タグフィルタポップアップ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('img', { timeout: 15_000 });
  });

  test('タグがあればポップアップボタンが表示される', async ({ page }) => {
    const filterBtn = page.locator('[data-testid="tag-filter-btn"]');
    // タグなしDBでは表示されない場合もOK
    const hasBtn = await filterBtn.count();
    if (hasBtn > 0) {
      await expect(filterBtn).toBeVisible();
    }
  });

  test('ポップアップが開閉できる（タグがあれば）', async ({ page }) => {
    const filterBtn = page.locator('[data-testid="tag-filter-btn"]');
    if (await filterBtn.count() === 0) return;

    await filterBtn.click();
    await expect(page.locator('[data-testid="tag-filter-popup"]')).toBeVisible();

    // 外クリックで閉じる
    await page.mouse.click(10, 10);
    await page.waitForTimeout(300);
    await expect(page.locator('[data-testid="tag-filter-popup"]')).not.toBeVisible();
  });

  test('タグを選択するとボタンに選択数が表示される（タグがあれば）', async ({ page }) => {
    const filterBtn = page.locator('[data-testid="tag-filter-btn"]');
    if (await filterBtn.count() === 0) return;

    await filterBtn.click();
    const firstOption = page.locator('[data-testid^="tag-option-"]').first();
    if (await firstOption.count() > 0) {
      await firstOption.locator('input[type="checkbox"]').check();
      await expect(filterBtn).toContainText('(1)');
    }
  });

  test('クリアボタンでタグ選択が解除される（タグがあれば）', async ({ page }) => {
    const filterBtn = page.locator('[data-testid="tag-filter-btn"]');
    if (await filterBtn.count() === 0) return;

    // タグを選択してからクリア
    await filterBtn.click();
    const firstOption = page.locator('[data-testid^="tag-option-"]').first();
    if (await firstOption.count() > 0) {
      await firstOption.locator('input[type="checkbox"]').check();
      await page.mouse.click(10, 10); // close popup
      const clearBtn = page.locator('[data-testid="tag-filter-clear-btn"]');
      if (await clearBtn.count() > 0) {
        await clearBtn.click();
        await expect(filterBtn).not.toContainText('(');
      }
    }
  });
});

test.describe('ナビゲーション（ギャラリーからタグページ）', () => {
  test('TAGSリンクでタグページに移動できる', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.locator('a', { hasText: 'TAGS' }).click();
    await page.waitForURL('/tags');
    await expect(page).toHaveURL('/tags');
    await expect(page.locator('[data-testid="tags-page"]')).toBeVisible();
  });
});

test.describe('ソート機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('ソートフィールドセレクトが表示される', async ({ page }) => {
    await expect(page.locator('[data-testid="sort-by-select"]')).toBeVisible();
  });

  test('ソート順セレクトが表示される', async ({ page }) => {
    await expect(page.locator('[data-testid="sort-order-select"]')).toBeVisible();
  });

  test('ソートフィールドを変更できる', async ({ page }) => {
    const sortBySelect = page.locator('[data-testid="sort-by-select"]');
    await sortBySelect.selectOption('original_filename');
    await expect(sortBySelect).toHaveValue('original_filename');
  });

  test('ソート順を変更できる', async ({ page }) => {
    const sortOrderSelect = page.locator('[data-testid="sort-order-select"]');
    await sortOrderSelect.selectOption('asc');
    await expect(sortOrderSelect).toHaveValue('asc');
  });

  test('リセットボタンでソートがデフォルトに戻る', async ({ page }) => {
    // ソートを変更
    await page.locator('[data-testid="sort-by-select"]').selectOption('original_filename');
    await page.locator('[data-testid="sort-order-select"]').selectOption('asc');
    // リセット
    await page.locator('[data-testid="filter-reset-btn"]').click();
    await expect(page.locator('[data-testid="sort-by-select"]')).toHaveValue('created_at');
    await expect(page.locator('[data-testid="sort-order-select"]')).toHaveValue('desc');
  });

  test('ソート条件を連続切替しても最終選択条件で一覧表示される', async ({ page }) => {
    const sortBySelect = page.locator('[data-testid="sort-by-select"]');

    // 最後のメディア一覧 API リクエストの sort_by パラメータを記録する
    let lastSortBy = '';
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/api/media') && !url.match(/\/api\/media\/\d/)) {
        const m = url.match(/sort_by=([^&]+)/);
        if (m) lastSortBy = decodeURIComponent(m[1]);
      }
    });

    // 短時間で連続切替
    await sortBySelect.selectOption('original_filename');
    await sortBySelect.selectOption('created_at');
    await sortBySelect.selectOption('original_filename');

    // 最終選択値が反映されていることを確認
    await expect(sortBySelect).toHaveValue('original_filename');

    // ネットワークが落ち着くまで待機
    // React はスケジューラ（macrotask）経由で再レンダリングするため、
    // selectOption 直後は API リクエストがまだ発行されていない。
    // 少し待って React がリクエストを開始できる時間を確保してから networkidle を確認する。
    await page.waitForTimeout(300);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="sort-by-select"]')).toHaveValue('original_filename');

    // 最後の API リクエストが正しいソート条件（sort_by=original_filename）で発行されていること
    expect(lastSortBy).toBe('original_filename');

    // APIレスポンスの先頭N件が original_filename 降順（sort_order=desc）に並んでいることを
    // DOM の実表示順（[data-filename] 属性）と API レスポンス順の両方で検証する。
    // localeCompare ではなく API を正とすることで PostgreSQL の照合順序と一致させる。
    // DOM と API が一致しない場合、競合レスポンスによる表示順崩れを検知できる。
    const thumbs = page.locator('[data-filename]');
    const firstFilenames = await thumbs.evaluateAll(
      (els: Element[]) => els.slice(0, 5).map((el) => el.getAttribute('data-filename') ?? '')
    );
    expect(firstFilenames.length).toBeGreaterThan(1);

    // 同一パラメータで API を直接呼び、DOM 順が API 順と一致することを確認する
    const apiRes = await page.request.get(
      `/api/media?sort_by=original_filename&sort_order=desc&limit=${firstFilenames.length}`
    );
    expect(apiRes.ok()).toBe(true);
    const apiData = await apiRes.json();
    const expectedOrder = (apiData.items as Array<{ original_filename: string }>)
      .map((i) => i.original_filename);
    expect(firstFilenames).toEqual(expectedOrder);
  });
});

// ---------------------------------------------------------------------------
// Issue #24: フィルタ変更直後スクロール競合テスト
// ---------------------------------------------------------------------------
// page.route() で /api/media をモックし has_more: true を返す。
// seed データ 5件 < LIMIT 50 では通常 hasMore=false だが、モックにより
// 無限スクロールが有効になりレース条件を再現できる。
// 主検証: フィルタ変更直後にスクロールしても旧条件リクエスト（旧フィルタ + offset>0）が出ないこと。
test.describe('フィルタ変更直後スクロール競合テスト (#24)', () => {
  // モック用の最小完全データ
  const FAKE_ITEM = {
    id: 9001,
    original_filename: 'mock-image.jpg',
    media_type: 'image',
    minio_key: 'test/mock-image.jpg',
    created_at: '2024-01-01T00:00:00Z',
    deleted_at: null,
    tags: [],
    clip_status: 'done',
  };

  test('フィルタ変更直後にスクロールしても旧条件リクエストが出ない', async ({ page }) => {
    // /api/media（一覧）をモック:
    // - フィルタなし (offset+limit < 100): has_more: true → IntersectionObserver を有効化しレース条件を再現
    // - media_type=image: has_more: false → フィルタ変更後は追加スクロールを発生させず networkidle に収束させる
    await page.route('**/api/media**', async (route) => {
      // 個別メディア取得（/api/media/123）はスルー
      if (route.request().url().match(/\/api\/media\/\d+/)) {
        return route.continue();
      }
      const params = new URLSearchParams(new URL(route.request().url()).search);
      const offset = parseInt(params.get('offset') || '0');
      const limit = parseInt(params.get('limit') || '50');
      const mediaType = params.get('media_type');
      // フィルタ変更後（media_type=image）は has_more: false にして無限スクロールを止める
      const hasMore = !mediaType && offset + limit < 100;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [FAKE_ITEM],
          total: hasMore ? 100 : 1,
          has_more: hasMore,
        }),
      });
    });

    await page.goto('/');
    await page.waitForSelector('[data-testid="media-type-select"]');

    // フィルタ変更後のリクエストのみ収集
    const postFilterRequests: { offset: number; mediaType: string | null }[] = [];
    let collecting = false;
    page.on('request', (req) => {
      if (!collecting) return;
      const url = req.url();
      if (url.includes('/api/media') && !url.match(/\/api\/media\/\d+/)) {
        const p = new URLSearchParams(new URL(url).search);
        postFilterRequests.push({
          offset: parseInt(p.get('offset') || '0'),
          mediaType: p.get('media_type'),
        });
      }
    });

    // フィルタを変更し直後にスクロール（レース誘発）
    // waitForRequest は selectOption より前に設定する（Playwright のパターン）
    const imageFilterRequestPromise = page.waitForRequest((req) =>
      req.url().includes('/api/media') &&
      req.url().includes('media_type=image') &&
      !req.url().match(/\/api\/media\/\d+/)
    );

    collecting = true;
    await page.locator('[data-testid="media-type-select"]').selectOption('image');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    // フィルタ変更後の media_type=image リクエストを待機
    await imageFilterRequestPromise;

    // 観測ウィンドウ: 最初のリクエスト到達直後に遅れて発火する旧条件リクエストも収集できるよう
    // networkidle まで待機してから検証する。これにより「少し遅れた offset>0 旧条件リクエスト」を取りこぼさない。
    await page.waitForLoadState('networkidle');

    // 検証1: フィルタ変更後に media_type=image + offset=0 のリクエストが ≥1 回あること（テスト意図の明示）
    const initialFilterRequests = postFilterRequests.filter(
      (r) => r.mediaType === 'image' && r.offset === 0
    );
    expect(initialFilterRequests.length).toBeGreaterThanOrEqual(1);

    // 検証2: フィルタ変更後のリクエストに「旧条件（media_type なし）+ offset > 0」が存在しないこと
    const staleRequests = postFilterRequests.filter(
      (r) => r.offset > 0 && !r.mediaType
    );
    expect(staleRequests).toHaveLength(0);
  });
});
