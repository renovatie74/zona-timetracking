import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth }                  from './auth.jsx';
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
import TimeEntries     from './screens/admin/TimeEntries.jsx';

// Smart home redirect: authenticated → /dashboard, unauthenticated → /login.
// Waits for auth check to finish so it never shows a blank screen.
function HomeRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={user ? '/dashboard' : '/login'} replace />;
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? children : <Navigate to="/login" replace />;
}

function EmployeeRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'employee') return <Navigate to="/dashboard" replace />;
  return children;
}

function AdminOrManagerRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!['administrator', 'manager'].includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Root — auth-aware redirect; no blank screen */}
          <Route path="/" element={<HomeRoute />} />

          {/* Auth (Sprint 1) */}
          <Route path="/login"            element={<Login />} />
          <Route path="/forgot-password"  element={<ForgotPassword />} />
          <Route path="/reset-password"   element={<ResetPassword />} />
          <Route path="/activate"         element={<ActivateAccount />} />
          <Route path="/change-password"  element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />

          {/* App shell routes (Sprint 2) */}
          <Route path="/dashboard"  element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/profile"    element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/clients"    element={<AdminOrManagerRoute><Clients /></AdminOrManagerRoute>} />
          <Route path="/projects"   element={<AdminOrManagerRoute><Projects /></AdminOrManagerRoute>} />
          <Route path="/employees"  element={<AdminOrManagerRoute><Employees /></AdminOrManagerRoute>} />
          <Route path="/teams"      element={<AdminOrManagerRoute><Teams /></AdminOrManagerRoute>} />
          <Route path="/time-entries" element={<AdminOrManagerRoute><TimeEntries /></AdminOrManagerRoute>} />

          {/* Employee self-service (Sprint 3C) */}
          <Route path="/my-time" element={<EmployeeRoute><MyTime /></EmployeeRoute>} />

          {/* Unknown paths fall back to home redirect */}
          <Route path="*" element={<HomeRoute />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
