/**
 * next.config.ts の remotePatterns が環境変数から構築されることを検証する
 *
 * @jest-environment node
 */
import * as path from 'path';
import * as fs from 'fs';

const CONFIG_FILE = path.join(__dirname, '..', 'next.config.ts');
const ENV_EXAMPLE = path.join(__dirname, '..', '..', '.env.example');

describe('next.config.ts: remotePatterns が環境変数ベースで構築される', () => {
  it('NEXT_PUBLIC_MINIO_HOST 環境変数を参照している', () => {
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
    expect(content).toContain('NEXT_PUBLIC_MINIO_HOST');
  });

  it('NEXT_PUBLIC_MINIO_PORT 環境変数を参照している', () => {
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
    expect(content).toContain('NEXT_PUBLIC_MINIO_PORT');
  });
});

describe('.env.example: MinIO 環境変数の記載がある', () => {
  it('NEXT_PUBLIC_MINIO_HOST が記載されている', () => {
    const content = fs.readFileSync(ENV_EXAMPLE, 'utf-8');
    expect(content).toContain('NEXT_PUBLIC_MINIO_HOST');
  });

  it('NEXT_PUBLIC_MINIO_PORT が記載されている', () => {
    const content = fs.readFileSync(ENV_EXAMPLE, 'utf-8');
    expect(content).toContain('NEXT_PUBLIC_MINIO_PORT');
  });
});

describe('buildRemotePatterns: 環境変数からパターンが正しく構築される', () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.NEXT_PUBLIC_MINIO_HOST;
    delete process.env.NEXT_PUBLIC_MINIO_PORT;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_MINIO_HOST;
    delete process.env.NEXT_PUBLIC_MINIO_PORT;
  });

  it('環境変数未設定時はデフォルト localhost:9000 になる', async () => {
    const { buildRemotePatterns } = await import('../next.config');
    const patterns = buildRemotePatterns();
    expect(patterns).toEqual([
      { protocol: 'http', hostname: 'localhost', port: '9000' },
    ]);
  });

  it('環境変数を設定すると値が反映される', async () => {
    process.env.NEXT_PUBLIC_MINIO_HOST = 'minio.example.com';
    process.env.NEXT_PUBLIC_MINIO_PORT = '443';
    const { buildRemotePatterns } = await import('../next.config');
    const patterns = buildRemotePatterns();
    expect(patterns).toEqual([
      { protocol: 'http', hostname: 'minio.example.com', port: '443' },
    ]);
  });

  it('HOST のみ設定した場合 PORT はデフォルト 9000 になる', async () => {
    process.env.NEXT_PUBLIC_MINIO_HOST = 'storage.myapp.com';
    const { buildRemotePatterns } = await import('../next.config');
    const patterns = buildRemotePatterns();
    expect(patterns).toEqual([
      { protocol: 'http', hostname: 'storage.myapp.com', port: '9000' },
    ]);
  });
});
