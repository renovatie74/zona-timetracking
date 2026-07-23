import { useEffect } from 'react';

const PROD_HOST      = 'time.zonaproperties.ae';
const IS_DEV         = window.location.hostname !== PROD_HOST;
const BANNER_CONTENT = 28; // px — visible text row below the safe area

export default function DevBanner() {
  useEffect(() => {
    if (!IS_DEV) return;
    // Layout roots offset by just the content height; they each add
    // env(safe-area-inset-top) independently via their own CSS.
    document.documentElement.style.setProperty('--dev-banner-h', `${BANNER_CONTENT}px`);
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
        // Grow to cover the status-bar / notch area on iOS
        height:         `calc(${BANNER_CONTENT}px + env(safe-area-inset-top, 0px))`,
        paddingTop:     'env(safe-area-inset-top, 0px)',
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
        boxSizing:      'border-box',
      }}
    >
      <span style={{ fontSize: '0.875rem', lineHeight: 1 }}>⚠</span>
      {label} Environment — not production data
    </div>
  );
}
