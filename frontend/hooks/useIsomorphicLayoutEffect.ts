import { useEffect, useLayoutEffect } from 'react';

// SSR（Next.js サーバーサイドレンダリング）では useLayoutEffect が React の warning を出す。
// typeof window チェックによりブラウザ環境では useLayoutEffect、SSR 環境では useEffect にフォールバックする。
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export default useIsomorphicLayoutEffect;
