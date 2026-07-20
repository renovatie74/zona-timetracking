import { useEffect } from 'react';

const PROD_HOST = 'time.zonaproperties.ae';
const IS_DEV    = window.location.hostname !== PROD_HOST;
const BANNER_H  = 28;

export default function DevBanner() {
  useEffect(() => {
    if (!IS_DEV) return;
    document.documentElement.style.setProperty('--dev-banner-h', `${BANNER_H}px`);
    return () => document.documentElement.style.removeProperty('--dev-banner-h');
  }, []);

  if (!IS_DEV) return null;

  const label = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'LOCAL'
    : 'DEV';

  return (
    <div
      aria-live="polite"
      style={{
        position:       'fixed',
        top:            0,
        left:           0,
        right:          0,
        height:         BANNER_H,
        zIndex:         9999,
        background:     '#F59E0B',
        color:          '#451A03',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            '0.5rem',
        fontSize:       '0.6875rem',
        fontWeight:     700,
        letterSpacing:  '0.07em',
        textTransform:  'uppercase',
        userSelect:     'none',
        pointerEvents:  'none',
        fontFamily:     'inherit',
      }}
    >
      <span style={{ fontSize: '0.875rem', lineHeight: 1 }}>⚠</span>
      {label} Environment — not production data
    </div>
  );
}
