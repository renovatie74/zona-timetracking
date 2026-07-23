import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider, useAuth }                  from './auth.jsx';
import { ToastProvider } from './hooks/useToast.jsx';
import { LangProvider, useTranslation }           from './i18n/index.jsx';
import DevBanner from './components/DevBanner.jsx';
import Login           from './screens/Login.jsx';
import ForgotPassword  from './screens/ForgotPassword.jsx';
import ResetPassword   from './screens/ResetPassword.jsx';
import ActivateAccount from './screens/ActivateAccount.jsx';
import ChangePassword  from './screens/ChangePassword.jsx';
import Dashboard       from './screens/Dashboard.jsx';
import MyTime         from './screens/MyTime.jsx';
import Profile         from './screens/Profile.jsx';
import Projects        from './screens/admin/Projects.jsx';
import Employees       from './screens/admin/Employees.jsx';
import Teams           from './screens/admin/Teams.jsx';
import Clients         from './screens/admin/Clients.jsx';
import Attendance      from './screens/admin/Attendance.jsx';
import Extras          from './screens/Extras.jsx';
import AdminExtras     from './screens/admin/Extras.jsx';
import AdminMileage    from './screens/admin/Mileage.jsx';
import AdminConsole        from './screens/admin/AdminConsole.jsx';
import EmployeeTimesheet   from './screens/admin/EmployeeTimesheet.jsx';
import ProjectTimesheet    from './screens/admin/ProjectTimesheet.jsx';
import MissingTimesheets   from './screens/admin/MissingTimesheets.jsx';
import MyDay               from './screens/MyDay.jsx';
import MyMileage           from './screens/MyMileage.jsx';

function LoadingScreen() {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
      <div className="em-spinner" />
    </div>
  );
}

function SessionWatcher() {
  const navigate  = useNavigate();
  const { logout } = useAuth();
  useEffect(() => {
    function onExpired() {
      logout().catch(() => {});
      navigate('/login?expired=1', { replace: true });
    }
    window.addEventListener('session:expired', onExpired);
    return () => window.removeEventListener('session:expired', onExpired);
  }, [navigate, logout]);
  return null;
}

function LangSyncer() {
  const { user, setUser } = useAuth();
  const { lang, setLang } = useTranslation();
  useEffect(() => {
    if (!user) return;
    const dbLang    = user.language ?? 'en';
    const localLang = lang; // what the user sees right now (from localStorage)

    if (dbLang === localLang) return; // already in sync — nothing to do

    // The user chose a language on the login screen before logging in.
    // Their explicit choice (localLang) wins; save it to the DB so future
    // sessions start in the right language without needing a re-selection.
    fetch('/api/profile', {
      method:      'PATCH',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ language: localLang }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setUser(u => ({ ...u, language: localLang }));
      })
      .catch(() => {}); // silent — UI already shows the right language
  }, [user?.id]); // eslint-disable-line — run once per login, not on every render
  return null;
}

function isMobileOrPWA() {
  return window.matchMedia('(pointer: coarse)').matches
      || window.matchMedia('(display-mode: standalone)').matches;
}

function HomeRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'employee') return <Navigate to="/my-day" replace />;
  if (user.role === 'supervisor') {
    return isMobileOrPWA()
      ? <Navigate to="/my-day" replace />
      : <Navigate to="/dashboard" replace />;
  }
  return <Navigate to="/dashboard" replace />;
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return user ? children : <Navigate to="/login" replace />;
}

function EmployeeRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!['employee', 'supervisor'].includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

function AdminOrManagerRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!['administrator', 'manager'].includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

function SupervisorOrAdminMgrRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!['administrator', 'manager', 'supervisor'].includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'administrator') return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <ToastProvider>
        <BrowserRouter>
          <LangSyncer />
          <DevBanner />
          <SessionWatcher />
          <Routes>
            {/* Root — auth-aware redirect; no blank screen */}
            <Route path="/" element={<HomeRoute />} />

            {/* Auth (Sprint 1) */}
            <Route path="/login"            element={<Login />} />
            <Route path="/forgot-password"  element={<ForgotPassword />} />
            <Route path="/reset-password"   element={<ResetPassword />} />
            <Route path="/activate"         element={<ActivateAccount />} />
            <Route path="/change-password"  element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />

            {/* App shell routes (Sprint 2 / Sprint 8) */}
            <Route path="/dashboard"  element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/dashboard/missing-timesheets" element={<SupervisorOrAdminMgrRoute><MissingTimesheets /></SupervisorOrAdminMgrRoute>} />
            <Route path="/profile"    element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/clients"    element={<AdminOrManagerRoute><Clients /></AdminOrManagerRoute>} />
            <Route path="/projects"   element={<SupervisorOrAdminMgrRoute><Projects /></SupervisorOrAdminMgrRoute>} />
            <Route path="/employees"  element={<AdminOrManagerRoute><Employees /></AdminOrManagerRoute>} />
            <Route path="/employees/:id/timesheet" element={<SupervisorOrAdminMgrRoute><EmployeeTimesheet /></SupervisorOrAdminMgrRoute>} />
            <Route path="/projects/:id/timesheet"  element={<SupervisorOrAdminMgrRoute><ProjectTimesheet  /></SupervisorOrAdminMgrRoute>} />
            <Route path="/teams"      element={<AdminOrManagerRoute><Teams /></AdminOrManagerRoute>} />
            <Route path="/attendance"   element={<SupervisorOrAdminMgrRoute><Attendance  /></SupervisorOrAdminMgrRoute>} />

            {/* Employee self-service (Sprint 3C–4, 6, 12) */}
            <Route path="/my-day"     element={<EmployeeRoute><MyDay     /></EmployeeRoute>} />
            <Route path="/my-time"    element={<EmployeeRoute><MyTime    /></EmployeeRoute>} />
            <Route path="/my-mileage" element={<EmployeeRoute><MyMileage /></EmployeeRoute>} />
            <Route path="/extras"     element={<EmployeeRoute><Extras    /></EmployeeRoute>} />

            {/* Admin Extras + Mileage (Sprint 4) */}
            <Route path="/admin/extras"   element={<AdminOrManagerRoute><AdminExtras  /></AdminOrManagerRoute>} />
            <Route path="/admin/mileage"  element={<AdminOrManagerRoute><AdminMileage /></AdminOrManagerRoute>} />

            {/* Admin Console (Sprint 5.5) */}
            <Route path="/admin-console"  element={<AdminRoute><AdminConsole /></AdminRoute>} />

            {/* Unknown paths fall back to home redirect */}
            <Route path="*" element={<HomeRoute />} />
          </Routes>
        </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </LangProvider>
  );
}
