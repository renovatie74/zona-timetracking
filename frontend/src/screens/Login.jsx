/**
 * Login screen — Sprint 1 implementation.
 * This stub renders a placeholder so the Vite build succeeds in Sprint 0.
 */

export default function Login() {
  return (
    <div style={{
      minHeight: '100dvh',
      display:   'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#1B2A4A',
      color: '#FFFFFF',
      fontFamily: 'system-ui, sans-serif',
      gap: '1rem',
      padding: '2rem',
    }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Zona Time Tracker</h1>
      <p style={{ color: '#94A3B8', fontSize: '0.9rem' }}>Sprint 1 — Login screen</p>
    </div>
  );
}
