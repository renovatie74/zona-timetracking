import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import PasswordInput from '../components/PasswordInput.jsx';

export default function ActivateAccount() {
  const [params]              = useSearchParams();
  const navigate              = useNavigate();
  const { setUser }           = useAuth();
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
      const user = await api.post('/api/auth/activate-account', { token, password });
      setUser(user);
      navigate('/dashboard', { replace: true });
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
          <div className="error-banner">Invalid invitation link. Please contact your administrator.</div>
          <div className="auth-footer">
            <Link to="/login" className="btn-link">Back to sign in</Link>
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
          <p>Activate your account</p>
        </div>

        <p className="auth-title">Set your password</p>
        <p className="auth-subtitle">
          Choose a password to activate your account and sign in.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          {error && <div className="error-banner">{error}</div>}

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
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
            <label className="form-label" htmlFor="confirm">Confirm password</label>
            <PasswordInput
              id="confirm"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Activating…' : 'Activate account'}
          </button>
        </form>
      </div>
    </div>
  );
}
