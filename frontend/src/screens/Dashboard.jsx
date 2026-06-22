import { useAuth }          from '../auth.jsx';
import AppShell             from './AppShell.jsx';
import EmployeeDashboard    from './EmployeeDashboard.jsx';

export default function Dashboard() {
  const { user } = useAuth();

  if (user?.role === 'employee') {
    return <EmployeeDashboard />;
  }

  return (
    <AppShell title="Dashboard">
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Dashboard</h1>
        </div>
        <p style={{ color: 'var(--color-grey-600)', fontSize: '0.9rem' }}>
          Welcome back, <strong>{user?.name}</strong>. Sprint 3 will add live check-in/out tracking here.
        </p>
      </div>
    </AppShell>
  );
}
