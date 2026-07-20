import { Navigate }              from 'react-router-dom';
import { useAuth }              from '../auth.jsx';
import OperationsDashboard      from './admin/OperationsDashboard.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  if (user?.role === 'employee') return <Navigate to="/my-day" replace />;
  return <OperationsDashboard />;
}
