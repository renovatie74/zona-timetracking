import { useNavigate, useLocation } from 'react-router-dom';

export default function EmployeeNav() {
  const navigate     = useNavigate();
  const { pathname } = useLocation();

  const isMyDay    = pathname === '/my-day';
  const isMyTime   = pathname === '/my-time';
  const isMileage  = pathname === '/my-mileage';
  const isExtras   = pathname === '/extras';
  const isAccount  = pathname === '/profile' || pathname === '/change-password';

  const tabs = [
    {
      label: 'My Day',
      active: isMyDay,
      onClick: () => navigate('/my-day'),
      icon: (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <rect x="3.5" y="4.5" width="15" height="14" rx="2" stroke="currentColor" strokeWidth="1.75"/>
          <path d="M7 2v4M15 2v4M3.5 9.5h15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
          <path d="M8 13.5l2 2 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      label: 'My Time',
      active: isMyTime,
      onClick: () => navigate('/my-time'),
      icon: (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <rect x="3.5" y="4.5" width="15" height="14" rx="2" stroke="currentColor" strokeWidth="1.75"/>
          <path d="M7 2v4M15 2v4M3.5 9.5h15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
          <path d="M7 13.5h4M7 16.5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      label: 'Mileage',
      active: isMileage,
      onClick: () => navigate('/my-mileage'),
      icon: (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <circle cx="11" cy="13" r="7" stroke="currentColor" strokeWidth="1.75"/>
          <path d="M11 13L14 10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
          <path d="M7 5h8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      label: 'Extras',
      active: isExtras,
      onClick: () => navigate('/extras'),
      icon: (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <rect x="3" y="3" width="16" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.75"/>
          <path d="M11 7v8M7 11h8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      label: 'Account',
      active: isAccount,
      onClick: () => navigate('/profile'),
      icon: (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <circle cx="11" cy="8" r="4" stroke="currentColor" strokeWidth="1.75"/>
          <path d="M3 20c0-4.418 3.582-7 8-7s8 2.582 8 7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        </svg>
      ),
    },
  ];

  return (
    <nav className="em-bottom-nav" aria-label="Main navigation">
      {tabs.map(tab => (
        <button
          key={tab.label}
          className={`em-nav-tab${tab.active ? ' em-nav-tab-active' : ''}`}
          onClick={tab.onClick}
          aria-current={tab.active ? 'page' : undefined}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
