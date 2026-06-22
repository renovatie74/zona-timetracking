import { useNavigate, useLocation } from 'react-router-dom';

export default function EmployeeNav() {
  const navigate  = useNavigate();
  const { pathname } = useLocation();

  const isCheckin = pathname === '/dashboard';
  const isMyTime  = pathname === '/my-time';
  const isExtras  = pathname === '/extras';

  return (
    <nav className="em-bottom-nav" aria-label="Main navigation">
      <button
        className={`em-nav-tab${isCheckin ? ' em-nav-tab-active' : ''}`}
        onClick={() => navigate('/dashboard')}
        aria-current={isCheckin ? 'page' : undefined}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="8.25" stroke="currentColor" strokeWidth="1.75"/>
          <path d="M11 7v4l2.5 2.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span>Check In</span>
      </button>

      <button
        className={`em-nav-tab${isMyTime ? ' em-nav-tab-active' : ''}`}
        onClick={() => navigate('/my-time')}
        aria-current={isMyTime ? 'page' : undefined}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <rect x="3.5" y="4.5" width="15" height="14" rx="2" stroke="currentColor" strokeWidth="1.75"/>
          <path d="M7 2v4M15 2v4M3.5 9.5h15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
          <path d="M7 13.5h4M7 16.5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <span>My Time</span>
      </button>

      <button
        className={`em-nav-tab${isExtras ? ' em-nav-tab-active' : ''}`}
        onClick={() => navigate('/extras')}
        aria-current={isExtras ? 'page' : undefined}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <rect x="3" y="3" width="16" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.75"/>
          <path d="M11 7v8M7 11h8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        </svg>
        <span>Extras</span>
      </button>
    </nav>
  );
}
