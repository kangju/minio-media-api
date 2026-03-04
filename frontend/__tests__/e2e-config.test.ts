/**
 * @jest-environment node
 */
import * as fs from 'fs';
import * as path from 'path';
import { resolveBaseURL } from '../e2e/global-setup';

const E2E_DIR = path.join(__dirname, '..', 'e2e');
const e2eFiles = fs.readdirSync(E2E_DIR).filter((f) => f.endsWith('.ts'));
const CONFIG_FILE = path.join(__dirname, '..', 'playwright.config.ts');

describe('localhost:3000 のハードコードがない（e2e + playwright.config.ts）', () => {
  it.each(e2eFiles)('e2e/%s に localhost:3000 が含まれない', (file) => {
    const content = fs.readFileSync(path.join(E2E_DIR, file), 'utf-8');
    expect(content).not.toMatch(/localhost:3000/);
  });

  it('playwright.config.ts に localhost:3000 のハードコードがない', () => {
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
    expect(content).not.toMatch(/localhost:3000/);
  });
});

describe('resolveBaseURL', () => {
  it('projects[0].use.baseURL を優先して返す', () => {
    const config = {
      projects: [{ use: { baseURL: 'http://ci-host:3001' } }],
      use: { baseURL: 'http://fallback:3000' },
    } as any;
    expect(resolveBaseURL(config)).toBe('http://ci-host:3001');
  });

  it('projects が空のとき config.use.baseURL にフォールバックする', () => {
    const config = {
      projects: [],
      use: { baseURL: 'http://fallback:3000' },
    } as any;
    expect(resolveBaseURL(config)).toBe('http://fallback:3000');
  });

  it('baseURL が未設定のとき Error を throw する', () => {
    const config = { projects: [], use: {} } as any;
    expect(() => resolveBaseURL(config)).toThrow('[global-setup] baseURL が未設定');
  });
});
