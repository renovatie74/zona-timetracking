import { useAuth } from '../auth.jsx';

export default function Dashboard() {
  const { user, logout } = useAuth();

  async function handleLogout() {
    await logout();
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-grey-50)',
      gap: '1rem',
      padding: '2rem',
      fontFamily: 'var(--font-sans)',
    }}>
      <h1 style={{ color: 'var(--color-navy)', fontSize: '1.5rem', fontWeight: 700 }}>
        Welcome, {user?.name}
      </h1>
      <p style={{ color: 'var(--color-grey-600)', fontSize: '0.9rem' }}>
        Dashboard — Sprint 2
      </p>
      <button
        onClick={handleLogout}
        style={{
          padding: '0.5rem 1.5rem',
          background: 'var(--color-navy)',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          fontSize: '0.9rem',
          cursor: 'pointer',
        }}
      >
        Sign out
      </button>
    </div>
  );
}
