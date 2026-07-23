import { useState } from 'react';
import { useNavigate, useSearchParams, Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import { useTranslation, SUPPORTED_LANGS } from '../i18n/index.jsx';

export default function Login() {
  const { login, user, loading: authLoading } = useAuth();
  const navigate  = useNavigate();
  const [params]  = useSearchParams();
  const { t, lang, setLang } = useTranslation();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const activated = params.get('activated') === '1';
  const expired   = params.get('expired')   === '1';

  // Already authenticated — HomeRoute handles role-based redirect
  if (!authLoading && user) return <Navigate to="/" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message ?? 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <h1>Zona Time Tracker</h1>
          <p>Zona Properties</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {activated && !error && (
            <div className="success-banner">{t('accountActivated')}</div>
          )}
          {expired && !error && !activated && (
            <div className="error-banner" style={{ background: 'rgba(180,83,9,0.06)', borderColor: 'rgba(180,83,9,0.25)', color: 'var(--color-amber-dark, #92660a)' }}>
              {t('sessionExpired')}
            </div>
          )}
          {error && <div className="error-banner">{error}</div>}

          <div className="form-group">
            <label className="form-label" htmlFor="email">{t('email')}</label>
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

          <div className="form-group">
            <label className="form-label" htmlFor="password">{t('password')}</label>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? t('signingIn') : t('signIn')}
          </button>
        </form>

        <div className="auth-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link to="/forgot-password" className="btn-link">{t('forgotPassword')}</Link>
          <select
            value={lang}
            onChange={e => setLang(e.target.value)}
            style={{
              fontSize: '0.8125rem',
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              padding: '0.2rem 0.4rem',
              background: 'transparent',
              color: 'var(--color-text)',
              cursor: 'pointer',
            }}
          >
            {SUPPORTED_LANGS.map(l => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
