import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import PasswordInput from '../components/PasswordInput.jsx';

export default function ChangePassword() {
  const { logout }            = useAuth();
  const navigate              = useNavigate();

  const [current,  setCurrent]  = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState(false);
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('New passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/api/auth/change-password', {
        current_password: current,
        new_password:     password,
      });
      setSuccess(true);
      // Sign out after password change so a fresh login is required
      setTimeout(() => {
        logout().catch(() => {});
        navigate('/login', { replace: true });
      }, 2000);
    } catch (err) {
      setError(err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <h1>Zona Time Tracker</h1>
        </div>

        <p className="auth-title">Change password</p>

        {success ? (
          <div className="success-banner">
            Password changed successfully. Signing you out…
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {error && <div className="error-banner">{error}</div>}

            <div className="form-group">
              <label className="form-label" htmlFor="current">Current password</label>
              <PasswordInput
                id="current"
                autoComplete="current-password"
                required
                value={current}
                onChange={e => setCurrent(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="password">New password</label>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="confirm">Confirm new password</label>
              <PasswordInput
                id="confirm"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
              />
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Saving…' : 'Change password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
