import { useState, useEffect } from 'react';
import { useNavigate, useBlocker } from 'react-router-dom';
import { useAuth }         from '../auth.jsx';
import { api }             from '../api.js';
import AppShell            from './AppShell.jsx';
import EmployeeNav         from '../components/EmployeeNav.jsx';
import PhoneInput          from '../components/PhoneInput.jsx';
import { useToast }        from '../hooks/useToast.jsx';
import { useBeforeUnload } from '../hooks/useBeforeUnload.js';

export default function Profile() {
  const { user, logout, setUser } = useAuth();
  const navigate                  = useNavigate();
  const { toast }                 = useToast();

  const [editing, setEditing] = useState(false);
  const [form,    setForm]    = useState({ first_name: '', last_name: '', phone: '' });
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  useBeforeUnload(editing);
  const blocker = useBlocker(editing);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm('You have unsaved changes. Leave anyway?')) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker]);

  function startEdit() {
    setForm({
      first_name: user?.first_name ?? '',
      last_name:  user?.last_name  ?? '',
      phone:      user?.phone      ?? '',
    });
    setError('');
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setError('');
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const data = await api.patch('/api/profile', {
        first_name: form.first_name.trim(),
        last_name:  form.last_name.trim(),
        phone:      form.phone || null,
      });
      setUser({ ...user, first_name: data.first_name, last_name: data.last_name, name: data.name, phone: data.phone });
      setEditing(false);
      toast('Profile updated.');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    try { await logout(); } catch { /* expired or offline */ }
    navigate('/login', { replace: true });
  }

  const displayName = user ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || user.name : '';

  if (user?.role === 'employee') {
    return (
      <div className="mt-root">
        <div className="mt-screen" style={{ padding: '1.25rem 1rem 5rem' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem' }}>Account</h1>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
            {[
              ['Name',  displayName || '—'],
              ['Email', user?.email  ?? '—'],
              ['Role',  user?.role   ?? '—'],
              ['Phone', user?.phone  ?? '—'],
            ].map(([label, value]) => (
              <div key={label} style={{ background: 'var(--color-surface,#fff)', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '0.75rem 1rem' }}>
                <div style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.06em', color: 'var(--color-grey-500)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>{label}</div>
                <div style={{ fontWeight: 500, textTransform: label === 'Role' ? 'capitalize' : undefined }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <a
              href="/change-password"
              style={{ display: 'block', textAlign: 'center', padding: '0.75rem', border: '1px solid var(--color-border)', borderRadius: '10px', fontWeight: 500, color: 'var(--color-charcoal)', textDecoration: 'none', background: 'var(--color-surface,#fff)' }}
            >
              Change Password
            </a>
            <button
              onClick={handleLogout}
              style={{ padding: '0.75rem', border: '1px solid var(--color-red,#d93025)', borderRadius: '10px', fontWeight: 500, color: 'var(--color-red,#d93025)', background: 'transparent', cursor: 'pointer' }}
            >
              Sign Out
            </button>
          </div>
        </div>
        <EmployeeNav />
      </div>
    );
  }

  return (
    <AppShell title="Profile">
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Profile</h1>
          {!editing && (
            <button className="btn btn-outline" onClick={startEdit}>Edit</button>
          )}
        </div>

        {editing ? (
          <form onSubmit={handleSave} style={{ maxWidth: 480 }}>
            {error && <div className="error-banner">{error}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group">
                <label className="form-label">First Name *</label>
                <input
                  className="form-input"
                  required
                  value={form.first_name}
                  onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Last Name *</label>
                <input
                  className="form-input"
                  required
                  value={form.last_name}
                  onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Phone</label>
              <PhoneInput
                value={form.phone}
                onChange={v => setForm(f => ({ ...f, phone: v }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Role</label>
              <p style={{ marginTop: '0.25rem', textTransform: 'capitalize',
                color: 'var(--color-grey-600)', fontSize: '0.9rem' }}>
                {user?.role} <span style={{ fontSize: '0.8rem' }}>(read-only)</span>
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">Email</label>
              <p style={{ marginTop: '0.25rem', color: 'var(--color-grey-600)', fontSize: '0.9rem' }}>
                {user?.email} <span style={{ fontSize: '0.8rem' }}>(read-only)</span>
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button type="button" className="btn btn-outline" onClick={cancelEdit}>
                Cancel
              </button>
              <button type="submit" className="btn btn-solid" disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        ) : (
          <div className="table-wrap" style={{ maxWidth: 480, padding: '1.5rem' }}>
            <div className="form-group">
              <span className="form-label">Name</span>
              <p style={{ marginTop: '0.25rem' }}>{displayName}</p>
            </div>
            <div className="form-group">
              <span className="form-label">Role</span>
              <p style={{ marginTop: '0.25rem', textTransform: 'capitalize' }}>{user?.role}</p>
            </div>
            <div className="form-group">
              <span className="form-label">Email</span>
              <p style={{ marginTop: '0.25rem' }}>{user?.email}</p>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <span className="form-label">Phone</span>
              <p style={{ marginTop: '0.25rem' }}>{user?.phone ?? '—'}</p>
            </div>
          </div>
        )}

        {!editing && (
          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <a href="/change-password" className="btn btn-outline">Change Password</a>
            <button
              className="btn btn-outline"
              style={{ color: 'var(--color-red)', borderColor: 'var(--color-red)' }}
              onClick={handleLogout}
            >
              Sign Out
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
