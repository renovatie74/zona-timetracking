import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

function IconDashboard() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <rect x="2" y="2" width="7" height="7" rx="1.5"/>
      <rect x="11" y="2" width="7" height="7" rx="1.5"/>
      <rect x="2" y="11" width="7" height="7" rx="1.5"/>
      <rect x="11" y="11" width="7" height="7" rx="1.5"/>
    </svg>
  );
}

function IconProjects() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="2" y="5" width="16" height="12" rx="2"/>
      <path d="M6 5V4a2 2 0 014 0v1"/>
      <path d="M6 10h8M6 13h5"/>
    </svg>
  );
}

function IconEmployees() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="8" cy="7" r="3"/>
      <path d="M2 17c0-3.314 2.686-5 6-5s6 1.686 6 5"/>
      <path d="M13 4a3 3 0 010 6M18 17c0-2.209-1.79-4-4-4"/>
    </svg>
  );
}

function IconTeams() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="10" cy="6" r="3"/>
      <path d="M4 17c0-3.314 2.686-5 6-5s6 1.686 6 5"/>
      <circle cx="3.5" cy="8" r="2"/>
      <circle cx="16.5" cy="8" r="2"/>
    </svg>
  );
}

function IconProfile() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="10" cy="7" r="4"/>
      <path d="M2 19c0-4.418 3.582-7 8-7s8 2.582 8 7"/>
    </svg>
  );
}

function IconMenu() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 5h14M3 10h14M3 15h14"/>
    </svg>
  );
}

export default function AppShell({ children, title }) {
  const { user, logout }   = useAuth();
  const navigate           = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  function close() { setSidebarOpen(false); }

  const navLinks = [
    { to: '/dashboard',  label: 'Dashboard',  Icon: IconDashboard },
    { to: '/projects',   label: 'Projects',   Icon: IconProjects },
    { to: '/employees',  label: 'Employees',  Icon: IconEmployees },
    { to: '/teams',      label: 'Teams',      Icon: IconTeams },
    { to: '/profile',    label: 'Profile',    Icon: IconProfile },
  ];

  return (
    <div className="shell">
      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={close}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <nav className={`sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="Main navigation">
        <div className="sidebar-logo">
          <h2>Zona Time Tracker</h2>
          <p>Zona Properties</p>
        </div>

        <div className="sidebar-nav">
          {navLinks.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={close}
            >
              <Icon />
              {label}
            </NavLink>
          ))}
        </div>

        <div className="sidebar-footer">
          <strong>{user?.name}</strong>
          <span style={{ textTransform: 'capitalize' }}>{user?.role}</span>
          <button
            className="nav-item"
            style={{ marginTop: '0.5rem', color: 'rgba(255,255,255,0.5)' }}
            onClick={handleLogout}
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* Main */}
      <div className="shell-main">
        {/* Mobile topbar */}
        <div className="topbar">
          <button className="btn-icon" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <IconMenu />
          </button>
          <span className="topbar-title">{title}</span>
        </div>

        {children}
      </div>
    </div>
  );
}
