import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import Login           from './screens/Login.jsx';
import ForgotPassword  from './screens/ForgotPassword.jsx';
import ResetPassword   from './screens/ResetPassword.jsx';
import ActivateAccount from './screens/ActivateAccount.jsx';
import ChangePassword  from './screens/ChangePassword.jsx';
import Dashboard       from './screens/Dashboard.jsx';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Auth (Sprint 1) */}
          <Route path="/login"            element={<Login />} />
          <Route path="/forgot-password"  element={<ForgotPassword />} />
          <Route path="/reset-password"   element={<ResetPassword />} />
          <Route path="/activate"         element={<ActivateAccount />} />
          <Route path="/change-password"  element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />

          {/* Post-login landing (Sprint 1 stub, expanded in Sprint 2+) */}
          <Route path="/dashboard"        element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

          {/* Worker (Sprint 3+) */}
          {/* <Route path="/"                 element={<ProtectedRoute><Home /></ProtectedRoute>} /> */}
          {/* <Route path="/select-project"   element={<ProtectedRoute><ProjectSelect /></ProtectedRoute>} /> */}
          {/* <Route path="/checked-in"       element={<ProtectedRoute><CheckedIn /></ProtectedRoute>} /> */}
          {/* <Route path="/checked-out"      element={<ProtectedRoute><CheckedOut /></ProtectedRoute>} /> */}

          {/* Timesheet + Notes (Sprint 4) */}
          {/* <Route path="/timesheet"        element={<ProtectedRoute><MyTimesheet /></ProtectedRoute>} /> */}
          {/* <Route path="/timesheet/edit/:id" element={<ProtectedRoute><EditEntry /></ProtectedRoute>} /> */}
          {/* <Route path="/timesheet/add"    element={<ProtectedRoute><AddEntry /></ProtectedRoute>} /> */}
          {/* <Route path="/add-note"         element={<ProtectedRoute><AddNote /></ProtectedRoute>} /> */}

          {/* Dashboards (Sprint 5) */}
          {/* <Route path="/dashboard/live"     element={<ManagerRoute><DashboardLive /></ManagerRoute>} /> */}
          {/* <Route path="/dashboard/billable" element={<ManagerRoute><DashboardBillable /></ManagerRoute>} /> */}
          {/* <Route path="/dashboard/summary"  element={<ManagerRoute><DashboardSummary /></ManagerRoute>} /> */}

          {/* Reports (Sprint 5) */}
          {/* <Route path="/reports/employee-hours" element={<ManagerRoute><ReportEmployeeHours /></ManagerRoute>} /> */}
          {/* <Route path="/reports/project-hours"  element={<ManagerRoute><ReportProjectHours /></ManagerRoute>} /> */}
          {/* <Route path="/reports/open-notes"     element={<ManagerRoute><ReportOpenNotes /></ManagerRoute>} /> */}
          {/* <Route path="/reports/mileage"        element={<ManagerRoute><ReportMileage /></ManagerRoute>} /> */}

          {/* Admin (Sprint 2+) */}
          {/* <Route path="/admin/users"            element={<AdminRoute><AdminUsers /></AdminRoute>} /> */}
          {/* <Route path="/admin/users/:id"        element={<AdminRoute><AdminUserForm /></AdminRoute>} /> */}
          {/* <Route path="/admin/projects"         element={<AdminRoute><AdminProjects /></AdminRoute>} /> */}
          {/* <Route path="/admin/projects/:id"     element={<AdminRoute><AdminProjectForm /></AdminRoute>} /> */}
          {/* <Route path="/admin/entries"          element={<AdminRoute><AdminEntries /></AdminRoute>} /> */}
          {/* <Route path="/admin/notes"            element={<AdminRoute><AdminNotes /></AdminRoute>} /> */}
          {/* <Route path="/admin/audit"            element={<AdminRoute><AuditLog /></AdminRoute>} /> */}

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
