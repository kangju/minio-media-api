'use client';

import { useEffect, useState } from 'react';

interface BackToTopButtonProps {
  /** このref要素が画面から見えなくなったらボタンを表示する */
  watchRef?: React.RefObject<HTMLElement | null>;
}

export default function BackToTopButton({ watchRef }: BackToTopButtonProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!watchRef?.current) {
      // watchRefがない場合はスクロール量で判定
      const onScroll = () => setVisible(window.scrollY > 300);
      window.addEventListener('scroll', onScroll, { passive: true });
      return () => window.removeEventListener('scroll', onScroll);
    }

    const observer = new IntersectionObserver(
      (entries) => setVisible(!entries[0].isIntersecting),
      { threshold: 0 }
    );
    observer.observe(watchRef.current);
    return () => observer.disconnect();
  }, [watchRef]);

  if (!visible) return null;

  return (
    <button
      data-testid="back-to-top-btn"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      style={{
        position: 'fixed',
        bottom: 32,
        right: 32,
        zIndex: 200,
        background: 'rgba(13,13,13,0.9)',
        border: '1px solid var(--accent)',
        color: 'var(--accent)',
        width: 44,
        height: 44,
        borderRadius: '50%',
        cursor: 'pointer',
        fontSize: '1.1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(8px)',
        transition: 'all 0.2s',
        boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
      }}
      title="トップへ戻る"
    >
      ↑
    </button>
  );
}
