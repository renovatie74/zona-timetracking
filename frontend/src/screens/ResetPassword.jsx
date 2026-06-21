import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';

export default function ResetPassword() {
  const [params]              = useSearchParams();
  const navigate              = useNavigate();
  const token                 = params.get('token') ?? '';

  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/api/auth/reset-password', { token, password });
      navigate('/login?reset=1', { replace: true });
    } catch (err) {
      setError(err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo"><h1>Zona Time Tracker</h1></div>
          <div className="error-banner">Invalid reset link. Please request a new one.</div>
          <div className="auth-footer">
            <Link to="/forgot-password" className="btn-link">Request new link</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <h1>Zona Time Tracker</h1>
        </div>

        <p className="auth-title">Set a new password</p>

        <form onSubmit={handleSubmit} noValidate>
          {error && <div className="error-banner">{error}</div>}

          <div className="form-group">
            <label className="form-label" htmlFor="password">New password</label>
            <input
              id="password"
              className="form-input"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="confirm">Confirm new password</label>
            <input
              id="confirm"
              className="form-input"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Saving…' : 'Set new password'}
          </button>
        </form>

        <div className="auth-footer">
          <Link to="/login" className="btn-link">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
