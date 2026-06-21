import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function ForgotPassword() {
  const [email,   setEmail]   = useState('');
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/api/auth/forgot-password', { email });
      setSent(true);
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

        <p className="auth-title">Reset your password</p>

        {sent ? (
          <>
            <div className="success-banner">
              If an account exists for <strong>{email}</strong>, a reset link has been sent.
              Check your inbox.
            </div>
            <div className="auth-footer">
              <Link to="/login" className="btn-link">Back to sign in</Link>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <p className="auth-subtitle">
              Enter your email and we'll send you a link to reset your password.
            </p>

            {error && <div className="error-banner">{error}</div>}

            <div className="form-group">
              <label className="form-label" htmlFor="email">Email</label>
              <input
                id="email"
                className="form-input"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>

            <div className="auth-footer">
              <Link to="/login" className="btn-link">Back to sign in</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
