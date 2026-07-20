import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import TimesheetPage, { fmtH } from './TimesheetPage.jsx';
import { api } from '../../api.js';
import { weekStartFor } from '../../lib/weekUtils.js';
import { useAuth } from '../../auth.jsx';
import { useToast } from '../../hooks/useToast.jsx';

const NUM_WEEKS = 8;

export default function ProjectTimesheet() {
  const { id }           = useParams();
  const [searchParams]   = useSearchParams();
  const { user }         = useAuth();
  const { toast }        = useToast();
  const TODAY            = new Date().toISOString().slice(0, 10);

  const [endWeekStart, setEndWeekStart] = useState(() => {
    const w = searchParams.get('week');
    return w ? weekStartFor(w) : weekStartFor(TODAY);
  });
  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);

  const [invoiceStatuses, setInvoiceStatuses] = useState({});
  const [confirm,         setConfirm]         = useState(null);  // { weekStart, weekLabel, currentStatus }
  const [invoiceBusy,     setInvoiceBusy]     = useState(false);
  const [invoiceError,    setInvoiceError]    = useState('');

  const canInvoice = user?.role === 'administrator' || user?.role === 'manager';

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.get(`/api/projects/${id}/timesheet-matrix?weeks=${NUM_WEEKS}&end_week_start=${endWeekStart}`)
      .then(b => {
        setData(b);
        setInvoiceStatuses(b.invoice_statuses ?? {});
      })
      .catch(e => setError(e.message ?? 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id, endWeekStart]);

  function shift(delta) {
    const d = new Date(endWeekStart + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + delta * NUM_WEEKS * 7);
    setEndWeekStart(d.toISOString().slice(0, 10));
  }

  function handleWeekAction(weekStart, weekLabel, currentStatus) {
    setInvoiceError('');
    setConfirm({ weekStart, weekLabel, currentStatus });
  }

  async function confirmInvoiceAction() {
    const { weekStart, currentStatus } = confirm;
    const action = currentStatus ? 'uninvoice' : 'invoice';
    setInvoiceBusy(true);
    setInvoiceError('');
    try {
      const result = await api.put(`/api/projects/${id}/invoice-status`, { week_start: weekStart, action });
      setInvoiceStatuses(prev => {
        const next = { ...prev };
        if (result.invoice_status) {
          next[weekStart] = result.invoice_status;
        } else {
          delete next[weekStart];
        }
        return next;
      });
      toast(confirm.currentStatus ? 'Invoice status removed.' : 'Week marked as invoiced.');
      setConfirm(null);
    } catch (e) {
      setInvoiceError(e.message ?? 'Failed to update invoice status');
    } finally {
      setInvoiceBusy(false);
    }
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape' || invoiceBusy) return;
      if (confirm) setConfirm(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirm, invoiceBusy]);

  const proj    = data?.project ?? {};
  const weeks   = data?.weeks   ?? [];
  const rawRows = data?.rows    ?? [];
  const grand   = data?.grand_total_hours ?? 0;
  const activeEmps = rawRows.filter(r => r.total_hours > 0).length;
  const avgPerWeek = weeks.length > 0 ? Math.round(grand / weeks.length * 10) / 10 : 0;

  const rows = rawRows.map(r => ({
    id:           r.user_id,
    name:         r.employee_name,
    code:         r.employee_code,
    weekly_hours: r.weekly_hours,
    total_hours:  r.total_hours,
  }));

  const chips = [
    proj.project_code && { label: proj.project_code },
    proj.client_name  && { label: proj.client_name },
    proj.status       && { label: proj.status, className: 'ts-meta-role' },
  ].filter(Boolean);

  const stats = [
    { num: fmtH(grand),      label: 'Total in period' },
    { num: activeEmps,       label: 'Active employees' },
    { num: fmtH(avgPerWeek), label: 'Avg per week' },
  ];

  return (
    <>
      <TimesheetPage
        title={proj.name ? `${proj.name} — Timesheet` : 'Project Timesheet'}
        backPath="/projects"
        backLabel="Projects"
        entityName={proj.name}
        chips={chips}
        rowHeader="Employee"
        stats={!loading ? stats : null}
        loading={loading}
        error={error}
        weeks={weeks}
        rows={rows}
        totals={data?.totals_by_week ?? {}}
        grand={grand}
        drilldown={null}
        drilldownData={null}
        drilldownLoading={false}
        onCellClick={null}
        onDrilldownClose={null}
        onPrev={() => shift(-1)}
        onNext={() => shift(1)}
        onCurrent={() => setEndWeekStart(weekStartFor(TODAY))}
        invoiceStatuses={canInvoice ? invoiceStatuses : undefined}
        onWeekAction={canInvoice ? handleWeekAction : undefined}
      />

      {confirm && (
        <div className="modal-backdrop" onClick={() => !invoiceBusy && setConfirm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">
              {confirm.currentStatus ? 'Remove Invoice Status' : 'Mark as Invoiced'}
            </h2>
            <p style={{ color: 'var(--color-charcoal)', fontSize: '0.9375rem', lineHeight: '1.5' }}>
              {confirm.currentStatus
                ? `Remove invoice status for ${confirm.weekLabel}?`
                : `Mark ${proj.project_code} – ${confirm.weekLabel} as Invoiced?`}
            </p>
            {invoiceError && (
              <div className="error-banner" style={{ marginTop: '1rem' }}>{invoiceError}</div>
            )}
            <div className="modal-footer">
              <button
                className="btn btn-outline"
                onClick={() => setConfirm(null)}
                disabled={invoiceBusy}
              >
                Cancel
              </button>
              <button
                className={`btn ${confirm.currentStatus ? 'btn-danger' : 'btn-primary'}`}
                onClick={confirmInvoiceAction}
                disabled={invoiceBusy}
              >
                {invoiceBusy ? '…' : confirm.currentStatus ? 'Remove' : 'Mark as Invoiced'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
