import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppShell from '../AppShell.jsx';
import { fmtWeekLabel, getCurrentWeekStart } from '../../lib/weekUtils.js';

export default function MissingTimesheets() {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const weekStart      = searchParams.get('week_start') ?? getCurrentWeekStart();

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/dashboard/missing-timesheets?week_start=${weekStart}`, { credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.json();
      })
      .then(json => setData(json.data))
      .catch(err  => setError(err.message))
      .finally(() => setLoading(false));
  }, [weekStart]);

  const employees = data?.employees ?? [];
  const weekLabel = fmtWeekLabel(weekStart);

  return (
    <AppShell title="Missing Timesheets">
      <div className="page">

        <div className="page-header">
          <div>
            <h1 className="page-title">Missing Timesheets</h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-grey-600)', margin: '2px 0 0' }}>
              {weekLabel}
            </p>
          </div>
          <button className="btn btn-outline" onClick={() => navigate('/dashboard')}>
            ← Back to Dashboard
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <div className="em-spinner" />
          </div>
        ) : (
          <>
            {employees.length === 0 ? (
              <p className="od-empty od-empty-ok">
                All employees have submitted for {weekLabel}.
              </p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Code</th>
                      <th>Team</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Issue</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map(emp => (
                      <tr key={emp.id}>
                        <td style={{ fontWeight: 500 }}>{emp.employee_name}</td>
                        <td>
                          <code style={{ fontSize: '0.8125rem' }}>{emp.employee_number}</code>
                        </td>
                        <td>{emp.team_name ?? '—'}</td>
                        <td style={{ textTransform: 'capitalize' }}>{emp.role ?? '—'}</td>
                        <td><span className="badge badge-active">Active</span></td>
                        <td>
                          <span className="od-badge od-badge-amber">
                            Missing project hours this week
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn-ghost"
                            style={{ fontSize: '0.8125rem' }}
                            onClick={() => navigate(`/employees/${emp.id}/timesheet?week=${weekStart}`)}
                          >
                            Open Timesheet →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-grey-500)', marginTop: '0.75rem' }}>
              {employees.length} employee{employees.length !== 1 ? 's' : ''} without submissions for {weekLabel}
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}
