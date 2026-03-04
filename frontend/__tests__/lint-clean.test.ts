/**
 * @jest-environment node
 *
 * ISSUE #17: unused import/変数が存在しないことを CI で永続的に保証するテスト
 *
 * ESLint を直接実行して @typescript-eslint/no-unused-vars 違反数が
 * 0 であることを検証する。将来の再混入も即検知できる。
 */
import { execSync } from 'child_process';
import * as path from 'path';

const FRONTEND_DIR = path.join(__dirname, '..');

/**
 * 指定ファイルの @typescript-eslint/no-unused-vars 違反数を返す
 */
function countUnusedVarsViolations(relativeFilePath: string): number {
  const fullPath = path.join(FRONTEND_DIR, relativeFilePath);
  const cmd = [
    'npx eslint',
    `--rule '{"@typescript-eslint/no-unused-vars": ["error", {"vars": "all", "args": "after-used", "ignoreRestSiblings": true}]}'`,
    '--format json',
    `"${fullPath}"`,
  ].join(' ');

  try {
    const output = execSync(cmd, {
      cwd: FRONTEND_DIR,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const results: Array<{ messages: Array<{ ruleId: string | null }> }> = JSON.parse(output);
    return results.reduce(
      (sum, r) =>
        sum +
        r.messages.filter(
          (m) => m.ruleId === '@typescript-eslint/no-unused-vars'
        ).length,
      0
    );
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'stdout' in err) {
      const e = err as { stdout: string };
      try {
        const results: Array<{ messages: Array<{ ruleId: string | null }> }> = JSON.parse(e.stdout);
        return results.reduce(
          (sum, r) =>
            sum +
            r.messages.filter(
              (m) => m.ruleId === '@typescript-eslint/no-unused-vars'
            ).length,
          0
        );
      } catch {
        return 1;
      }
    }
    return 1;
  }
}

// ISSUE #17 で指定された対象ファイル
const TARGET_FILES = [
  'app/page.tsx',
  'components/BackToTopButton.tsx',
  'components/UploadModal.tsx',
  '__tests__/hooks/useMediaFetch.test.ts',
];

describe('ISSUE #17: unused import/変数が存在しない', () => {
  it.each(TARGET_FILES)(
    '%s に @typescript-eslint/no-unused-vars 違反がない',
    (file) => {
      const count = countUnusedVarsViolations(file);
      expect(count).toBe(0);
    }
  );
});
