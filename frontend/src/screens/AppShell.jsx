import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import ToastContainer from '../components/Toast.jsx';

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

function IconClients() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="2" y="6" width="16" height="11" rx="2"/>
      <path d="M6 6V5a4 4 0 018 0v1"/>
      <path d="M10 11v2M8 13h4"/>
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

function IconAttendance() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="10" cy="10" r="8"/>
      <path d="M10 6v4l2.5 2.5"/>
    </svg>
  );
}

function IconExtras() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="2" y="2" width="16" height="16" rx="2.5"/>
      <path d="M10 6v8M6 10h8"/>
    </svg>
  );
}

function IconMileage() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="11" r="7"/>
      <path d="M10 11L13 8"/>
      <path d="M6 4h8"/>
    </svg>
  );
}

function IconConsole() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="16" height="14" rx="2"/>
      <path d="M5 8l3 3-3 3"/>
      <path d="M11 14h4"/>
    </svg>
  );
}

function IconMyTime() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="2" y="4" width="16" height="13" rx="2"/>
      <path d="M6 2v3M14 2v3M2 9h16"/>
      <path d="M6 13h4M6 15.5h7"/>
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
  const [extrasBadge, setExtrasBadge] = useState(0);

  const isAdminOrMgr = ['administrator', 'manager'].includes(user?.role);
  const isSupervisor = user?.role === 'supervisor';

  useEffect(() => {
    if (!isAdminOrMgr) return;
    fetch('/api/extras/summary', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!json?.data) return;
        const count = user?.role === 'manager'
          ? (json.data.waiting_for_manager ?? 0)
          : (json.data.open ?? 0);
        setExtrasBadge(count);
      })
      .catch(() => {});
  }, [isAdminOrMgr, user?.role]); // eslint-disable-line

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // session already expired or network error — still clear local state
    }
    navigate('/login', { replace: true });
  }

  function close() { setSidebarOpen(false); }

  const isAdmin = user?.role === 'administrator';

  const navLinks = [
    { to: '/dashboard',      label: 'Dashboard',     Icon: IconDashboard,   show: true,                         badge: 0           },
    { to: '/clients',        label: 'Clients',       Icon: IconClients,     show: isAdminOrMgr,                 badge: 0           },
    { to: '/projects',       label: 'Projects',      Icon: IconProjects,    show: isAdminOrMgr || isSupervisor, badge: 0           },
    { to: '/employees',      label: 'Employees',     Icon: IconEmployees,   show: isAdminOrMgr,                 badge: 0           },
    { to: '/teams',          label: 'Teams',         Icon: IconTeams,       show: isAdminOrMgr,                 badge: 0           },
    { to: '/attendance',     label: 'Attendance',    Icon: IconAttendance,  show: isAdminOrMgr || isSupervisor, badge: 0           },
    { to: '/admin/extras',   label: 'Extras',        Icon: IconExtras,      show: isAdminOrMgr,                 badge: extrasBadge },
    { to: '/admin/mileage',  label: 'Mileage',       Icon: IconMileage,     show: isAdminOrMgr,                 badge: 0           },
    { to: '/admin-console',  label: 'Admin Console', Icon: IconConsole,     show: isAdmin,                      badge: 0           },
    { to: '/my-time',        label: 'My Time',       Icon: IconMyTime,      show: isSupervisor,                 badge: 0           },
    { to: '/profile',        label: 'Profile',       Icon: IconProfile,     show: true,                         badge: 0           },
  ].filter(l => l.show);

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
          {navLinks.map(({ to, label, Icon, badge }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={close}
            >
              <Icon />
              {label}
              {badge > 0 && <span className="nav-badge">{badge}</span>}
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
      <ToastContainer />
    </div>
  );
}
