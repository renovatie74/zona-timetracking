import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../AppShell.jsx';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function fmtCell(h) {
  if (!h || h <= 0) return null;
  const r = Math.round(h * 10) / 10;
  return r % 1 === 0 ? String(r) : r.toFixed(1);
}

export function fmtH(h) {
  if (!h || h <= 0) return '–';
  const r = Math.round(h * 10) / 10;
  return r % 1 === 0 ? `${r}h` : `${r.toFixed(1)}h`;
}

function periodLabel(weeks) {
  if (!weeks?.length) return '';
  const first = weeks[0], last = weeks[weeks.length - 1];
  if (first.year === last.year) return `W${first.week_number}–${last.week_number}, ${first.year}`;
  return `W${first.week_number} ${first.year} – W${last.week_number} ${last.year}`;
}

function cellHeatClass(h) {
  if (!h || h <= 0) return '';
  if (h < 8)  return 'ts-heat-1';
  if (h < 20) return 'ts-heat-2';
  if (h < 35) return 'ts-heat-3';
  return 'ts-heat-4';
}

function totalHeatClass(h) {
  if (!h || h <= 0) return '';
  if (h < 16) return 'ts-total-low';
  if (h < 35) return 'ts-total-mid';
  return 'ts-total-hi';
}

function weekdayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return DAYS[(d.getUTCDay() + 6) % 7];
}

/**
 * Shared full-page timesheet matrix layout.
 *
 * rows shape: [{ id, name, code?, weekly_hours: {[week_start]: hours}, total_hours }]
 * chips shape: [{ label, className? }]
 * stats shape: [{ num, label }]
 */
export default function TimesheetPage({
  title,
  backPath,
  backLabel,
  entityName,
  chips,
  rowHeader,
  stats,
  loading,
  error,
  weeks,
  rows,
  totals,
  grand,
  drilldown,
  drilldownData,
  drilldownLoading,
  onCellClick,
  onDrilldownClose,
  onPrev,
  onNext,
  onCurrent,
  invoiceStatuses,
  onWeekAction,
  children,
}) {
  const navigate    = useNavigate();
  const [openMenuWeek, setOpenMenuWeek] = useState(null);
  const w = weeks ?? [];
  const r = rows  ?? [];
  const t = totals ?? {};
  const g = grand  ?? 0;

  return (
    <AppShell title={title}>
      <div className="ts-page">

        <button className="btn btn-outline ts-back" onClick={() => navigate(backPath)}>
          ← {backLabel}
        </button>

        <div className="ts-header">
          <div className="ts-header-info">
            <h1 className="ts-name">{entityName ?? '…'}</h1>
            {chips?.length > 0 && (
              <div className="ts-meta">
                {chips.map((c, i) => (
                  <span key={i} className={['ts-meta-chip', c.className].filter(Boolean).join(' ')}>
                    {c.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="ts-nav">
            <button className="btn btn-outline ts-nav-btn" onClick={onPrev}>‹ Prev</button>
            <span className="ts-period">{periodLabel(w)}</span>
            <button className="btn btn-outline ts-nav-btn" onClick={onNext}>Next ›</button>
            <button className="btn btn-outline ts-nav-btn" onClick={onCurrent}>Current</button>
          </div>
        </div>

        {!loading && stats?.length > 0 && (
          <div className="ts-stats">
            {stats.flatMap((s, i) => {
              const items = [];
              if (i > 0) items.push(<div key={`sep-${i}`} className="ts-stat-sep" />);
              items.push(
                <div key={i} className="ts-stat">
                  <span className="ts-stat-num">{s.num}</span>
                  <span className="ts-stat-label">{s.label}</span>
                </div>
              );
              return items;
            })}
          </div>
        )}

        {error && <div className="error-banner" style={{ marginBottom: '1rem' }}>{error}</div>}

        {loading ? (
          <div className="ts-loading"><div className="em-spinner" /></div>
        ) : (
          <>
            <div className="ts-table-wrap">
              <table className="ts-table">
                <thead>
                  <tr>
                    <th className="ts-th-project">{rowHeader}</th>
                    {w.map(wk => {
                      const invStatus  = invoiceStatuses?.[wk.week_start];
                      const isInvoiced = !!invStatus;
                      const isMenuOpen = openMenuWeek === wk.week_start;
                      const canAct     = !!onWeekAction;
                      return (
                        <th
                          key={wk.week_start}
                          className={['ts-th-week', isInvoiced ? 'ts-th-week-invoiced' : ''].filter(Boolean).join(' ')}
                        >
                          <div className="ts-week-menu-wrap">
                            {canAct ? (
                              <button
                                className="ts-th-week-btn"
                                title={isInvoiced ? 'Click to manage invoice status' : 'Click to mark as invoiced'}
                                onClick={() => setOpenMenuWeek(isMenuOpen ? null : wk.week_start)}
                              >
                                <div className="ts-week-num">
                                  {isInvoiced && <span className="ts-invoice-check">✓ </span>}
                                  {wk.label}
                                </div>
                                <div className="ts-week-date">{wk.week_start.slice(5).replace('-', '/')}</div>
                              </button>
                            ) : (
                              <>
                                <div className="ts-week-num">
                                  {isInvoiced && <span className="ts-invoice-check">✓ </span>}
                                  {wk.label}
                                </div>
                                <div className="ts-week-date">{wk.week_start.slice(5).replace('-', '/')}</div>
                              </>
                            )}
                            {isMenuOpen && (
                              <>
                                <div
                                  className="ts-week-menu-backdrop"
                                  onClick={() => setOpenMenuWeek(null)}
                                />
                                <div className="ts-week-menu">
                                  <button
                                    className={['ts-week-menu-item', isInvoiced ? 'ts-week-menu-remove' : ''].filter(Boolean).join(' ')}
                                    onClick={() => {
                                      setOpenMenuWeek(null);
                                      onWeekAction(wk.week_start, wk.label, isInvoiced ? invStatus : null);
                                    }}
                                  >
                                    {isInvoiced ? 'Remove Invoice Status' : 'Mark Week as Invoiced'}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </th>
                      );
                    })}
                    <th className="ts-th-total">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {r.length === 0 ? (
                    <tr>
                      <td colSpan={w.length + 2} className="ts-empty-row">
                        No hours recorded in this period.
                      </td>
                    </tr>
                  ) : r.map(row => (
                    <tr key={row.id} className={drilldown?.id === row.id ? 'ts-row-open' : ''}>
                      <td className="ts-td-project">
                        <span className="ts-project-name">{row.name}</span>
                        {row.code && <span className="ts-project-code">{row.code}</span>}
                      </td>
                      {w.map(wk => {
                        const h = row.weekly_hours[wk.week_start];
                        const isOpen = drilldown?.id === row.id && drilldown?.weekStart === wk.week_start;
                        const clickable = !!(h && onCellClick);
                        return (
                          <td
                            key={wk.week_start}
                            className={[
                              'ts-td-cell',
                              h ? `ts-cell-value ${cellHeatClass(h)}` : 'ts-cell-empty',
                              isOpen  ? 'ts-cell-open'      : '',
                              clickable ? 'ts-cell-clickable' : '',
                            ].filter(Boolean).join(' ')}
                            onClick={() => clickable && onCellClick(row.id, row.name, wk.week_start, wk.label)}
                          >
                            {h ? <strong>{fmtCell(h)}</strong> : <span className="ts-dash">–</span>}
                          </td>
                        );
                      })}
                      <td className="ts-td-row-total">{fmtH(row.total_hours)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="ts-footer-row">
                    <td className="ts-td-project ts-footer-label">Weekly total</td>
                    {w.map(wk => {
                      const total = t[wk.week_start] ?? 0;
                      return (
                        <td key={wk.week_start} className={`ts-td-cell ts-footer-cell ${totalHeatClass(total)}`}>
                          {total > 0 ? fmtCell(total) : <span className="ts-dash">–</span>}
                        </td>
                      );
                    })}
                    <td className="ts-td-row-total ts-footer-grand">{fmtH(g)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {drilldown && (
              <div className="ts-drilldown">
                <div className="ts-drilldown-header">
                  <div>
                    <span className="ts-drilldown-project">{drilldown.name}</span>
                    <span className="ts-drilldown-week">{drilldown.weekLabel} · {drilldown.weekStart}</span>
                  </div>
                  <button className="btn btn-outline ts-nav-btn" onClick={onDrilldownClose}>
                    ✕ Close
                  </button>
                </div>
                {drilldownLoading ? (
                  <div className="ts-drilldown-loading"><div className="em-spinner" /></div>
                ) : !drilldownData?.length ? (
                  <p className="ts-drilldown-empty">No daily entries found.</p>
                ) : (
                  <table className="ts-drilldown-table">
                    <thead>
                      <tr>
                        <th>Day</th>
                        <th>Date</th>
                        <th>Hours</th>
                        <th>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drilldownData.map(row => {
                        const h = Math.round(row.minutes / 60 * 10) / 10;
                        return (
                          <tr key={row.work_date}>
                            <td className="ts-drilldown-day">{weekdayOf(row.work_date)}</td>
                            <td className="ts-drilldown-date">{row.work_date}</td>
                            <td className="ts-drilldown-hours">{h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`}</td>
                            <td className="ts-drilldown-note">
                              {row.notes ?? <span style={{ color: 'var(--color-grey-400)' }}>—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}
      </div>
      {children}
    </AppShell>
  );
}
