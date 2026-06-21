import { useNavigate } from 'react-router-dom';
import { useAuth }     from '../auth.jsx';
import AppShell        from './AppShell.jsx';

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <AppShell title="Profile">
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Profile</h1>
        </div>

        <div className="table-wrap" style={{ maxWidth: 480, padding: '1.5rem' }}>
          <div className="form-group">
            <span className="form-label">Name</span>
            <p style={{ marginTop: '0.25rem' }}>{user?.name}</p>
          </div>
          <div className="form-group">
            <span className="form-label">Role</span>
            <p style={{ marginTop: '0.25rem', textTransform: 'capitalize' }}>{user?.role}</p>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <span className="form-label">Email</span>
            <p style={{ marginTop: '0.25rem' }}>{user?.email}</p>
          </div>
        </div>

        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <a href="/change-password" className="btn btn-outline">Change Password</a>
          <button className="btn btn-outline" style={{ color: 'var(--color-red)', borderColor: 'var(--color-red)' }}
            onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </div>
    </AppShell>
  );
}
