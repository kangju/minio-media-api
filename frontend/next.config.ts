import type { NextConfig } from 'next';

/**
 * MinIO の remotePatterns を環境変数から構築する。
 * デフォルト値は localhost:9000（ローカル開発専用）。
 * 本番/ステージングでは NEXT_PUBLIC_MINIO_HOST / NEXT_PUBLIC_MINIO_PORT を設定すること。
 */
export function buildRemotePatterns(): NonNullable<
  NonNullable<NextConfig['images']>['remotePatterns']
> {
  const hostname = process.env.NEXT_PUBLIC_MINIO_HOST ?? 'localhost';
  const port = process.env.NEXT_PUBLIC_MINIO_PORT ?? '9000';
  return [{ protocol: 'http', hostname, port }];
}

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: buildRemotePatterns(),
  },
};

export default nextConfig;
