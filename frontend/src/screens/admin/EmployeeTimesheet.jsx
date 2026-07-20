import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import TimesheetPage, { fmtH } from './TimesheetPage.jsx';
import { api } from '../../api.js';
import { weekStartFor } from '../../lib/weekUtils.js';
import EmployeeExtras  from './EmployeeExtras.jsx';
import EmployeeMileage from './EmployeeMileage.jsx';

const NUM_WEEKS = 8;

export default function EmployeeTimesheet() {
  const { id }         = useParams();
  const [searchParams] = useSearchParams();
  const TODAY          = new Date().toISOString().slice(0, 10);

  // ?week= lets the dashboard link directly to a specific week
  const urlWeek = searchParams.get('week');
  const [endWeekStart, setEndWeekStart] = useState(() => urlWeek ?? weekStartFor(TODAY));
  const [data,             setData]             = useState(null);
  const [loading,          setLoading]          = useState(true);
  const [error,            setError]            = useState(null);
  const [drilldown,        setDrilldown]        = useState(null);
  const [drilldownData,    setDrilldownData]    = useState(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.get(`/api/employees/${id}/timesheet-matrix?weeks=${NUM_WEEKS}&end_week_start=${endWeekStart}`)
      .then(b => setData(b))
      .catch(e => setError(e.message ?? 'Failed to load'))
      .finally(() => setLoading(false));
    setDrilldown(null);
    setDrilldownData(null);
  }, [id, endWeekStart]);

  function handleCellClick(projectId, projectName, weekStart, weekLabel) {
    if (drilldown?.id === projectId && drilldown?.weekStart === weekStart) {
      setDrilldown(null); setDrilldownData(null); return;
    }
    setDrilldown({ id: projectId, name: projectName, weekStart, weekLabel });
    setDrilldownData(null);
    setDrilldownLoading(true);
    api.get(`/api/employees/${id}/hours-by-day?project_id=${projectId}&week_start=${weekStart}`)
      .then(rows => setDrilldownData(rows))
      .catch(() => setDrilldownData([]))
      .finally(() => setDrilldownLoading(false));
  }

  function shift(delta) {
    const d = new Date(endWeekStart + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + delta * NUM_WEEKS * 7);
    setEndWeekStart(d.toISOString().slice(0, 10));
  }

  const emp      = data?.employee ?? {};
  const weeks    = data?.weeks    ?? [];
  const rawRows  = data?.rows     ?? [];
  const grand    = data?.grand_total_hours ?? 0;
  const activeProjs = rawRows.filter(r => r.total_hours > 0).length;
  const avgPerWeek  = weeks.length > 0 ? Math.round(grand / weeks.length * 10) / 10 : 0;

  const rows = rawRows.map(r => ({
    id:           r.project_id,
    name:         r.project_name,
    code:         r.project_code,
    weekly_hours: r.weekly_hours,
    total_hours:  r.total_hours,
  }));

  const chips = [
    emp.employee_code && { label: emp.employee_code },
    emp.team_name     && { label: emp.team_name },
    emp.role          && { label: emp.role, className: 'ts-meta-role' },
  ].filter(Boolean);

  const stats = [
    { num: fmtH(grand),      label: 'Total in period' },
    { num: fmtH(avgPerWeek), label: 'Avg per week' },
    { num: activeProjs,      label: 'Active projects' },
  ];

  return (
    <TimesheetPage
      title={emp.name ? `${emp.name} — Timesheet` : 'Timesheet'}
      backPath="/employees"
      backLabel="Employees"
      entityName={emp.name}
      chips={chips}
      rowHeader="Project"
      stats={!loading ? stats : null}
      loading={loading}
      error={error}
      weeks={weeks}
      rows={rows}
      totals={data?.totals_by_week ?? {}}
      grand={grand}
      drilldown={drilldown}
      drilldownData={drilldownData}
      drilldownLoading={drilldownLoading}
      onCellClick={handleCellClick}
      onDrilldownClose={() => { setDrilldown(null); setDrilldownData(null); }}
      onPrev={() => shift(-1)}
      onNext={() => shift(1)}
      onCurrent={() => setEndWeekStart(weekStartFor(TODAY))}
    >
      <EmployeeExtras  employeeId={id} />
      <EmployeeMileage employeeId={id} />
    </TimesheetPage>
  );
}
