import { useState, useEffect, useRef } from 'react';
import { useAuth }  from '../auth.jsx';
import { useGPS }   from '../hooks/useGPS.js';

const api = path => `/api${path}`;

function pad2(n) { return String(n).padStart(2, '0'); }

function fmtDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${pad2(m)}m`;
}

function fmtTime(isoString) {
  const d = new Date(isoString);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

function useElapsed(startIso) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startIso) return;
    const update = () => setElapsed(Math.floor((Date.now() - new Date(startIso).getTime()) / 60000));
    update();
    const id = setInterval(update, 30000);
    return () => clearInterval(id);
  }, [startIso]);
  return elapsed;
}

// ── Project picker modal ──────────────────────────────────────────────────────
function ProjectPicker({ recentProjects, onSelect, onCancel, loading }) {
  const [search, setSearch]     = useState('');
  const [results, setResults]   = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    const id = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(api(`/projects/mine?q=${encodeURIComponent(search)}`), { credentials: 'include' });
        const data = await res.json();
        setResults(data.data ?? []);
      } catch { setResults([]); }
      setSearching(false);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const displayed = search.trim() ? results : recentProjects;

  return (
    <div className="em-overlay" onClick={onCancel}>
      <div className="em-picker" onClick={e => e.stopPropagation()}>
        <div className="em-picker-header">
          <h2 className="em-picker-title">Select Project</h2>
          <button className="em-btn-close" onClick={onCancel} aria-label="Cancel">✕</button>
        </div>

        <div className="em-search-wrap">
          <input
            className="em-search"
            type="text"
            placeholder="Search projects…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        {!search.trim() && recentProjects.length > 0 && (
          <p className="em-recent-label">Recent</p>
        )}

        <ul className="em-project-list">
          {displayed.length === 0 && search.trim() && !searching && (
            <li className="em-no-results">No projects found</li>
          )}
          {displayed.map(p => (
            <li key={p.id}>
              <button
                className="em-project-btn"
                onClick={() => onSelect(p)}
                disabled={loading}
              >
                <span className="em-project-name">{p.name}</span>
                {p.project_code && <span className="em-project-code">{p.project_code}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Checked-out state (idle) ──────────────────────────────────────────────────
function IdleView({ user, onCheckin }) {
  return (
    <div className="em-screen">
      <header className="em-header">
        <div className="em-greeting">Good day, <strong>{user?.first_name}</strong></div>
        <div className="em-status-badge em-badge-idle">Not checked in</div>
      </header>

      <div className="em-hero">
        <div className="em-clock-icon" aria-hidden="true">⏱</div>
        <p className="em-hero-text">Tap below to start your work session</p>
      </div>

      <button className="em-btn-checkin" onClick={onCheckin}>
        Check In
      </button>
    </div>
  );
}

// ── Checked-in state (active session) ────────────────────────────────────────
function ActiveView({ user, session, onCheckout }) {
  const elapsed = useElapsed(session.start_time);

  return (
    <div className="em-screen">
      <header className="em-header">
        <div className="em-greeting">Good day, <strong>{user?.first_name}</strong></div>
        <div className="em-status-badge em-badge-active">Checked in</div>
      </header>

      {session.unclosed_warning && (
        <div className="em-warning">
          Session open for more than 12 hours. Please check out.
        </div>
      )}

      <div className="em-session-card">
        <div className="em-session-project">{session.project_name}</div>
        <div className="em-session-time">
          <span className="em-time-label">Started</span>
          <span className="em-time-value">{fmtTime(session.start_time)}</span>
        </div>
        <div className="em-session-elapsed">
          <span className="em-elapsed-label">Duration</span>
          <span className="em-elapsed-value">{fmtDuration(elapsed)}</span>
        </div>
        {session.gps_status === 'captured' && (
          <div className="em-gps-chip em-gps-ok" title="GPS location captured">
            📍 GPS captured
          </div>
        )}
        {session.gps_status === 'denied' && (
          <div className="em-gps-chip em-gps-deny" title="Location access denied">
            📍 Location denied
          </div>
        )}
      </div>

      <button className="em-btn-checkout" onClick={onCheckout}>
        Check Out
      </button>
    </div>
  );
}

// ── Summary screen shown briefly after checkout ───────────────────────────────
function SummaryView({ summary, onDone }) {
  return (
    <div className="em-screen">
      <header className="em-header">
        <div className="em-status-badge em-badge-done">Session complete</div>
      </header>

      <div className="em-summary-card">
        <div className="em-summary-title">Great work!</div>
        <div className="em-summary-row">
          <span>Project</span>
          <strong>{summary.project_name}</strong>
        </div>
        <div className="em-summary-row">
          <span>Start</span>
          <strong>{fmtTime(summary.start_time)}</strong>
        </div>
        <div className="em-summary-row">
          <span>End</span>
          <strong>{fmtTime(summary.stop_time)}</strong>
        </div>
        <div className="em-summary-row">
          <span>Duration</span>
          <strong>{fmtDuration(summary.rounded_duration_minutes ?? summary.duration_minutes)}</strong>
        </div>
      </div>

      <button className="em-btn-checkin" onClick={onDone}>
        Done
      </button>
    </div>
  );
}

// ── Main EmployeeDashboard ────────────────────────────────────────────────────
export default function EmployeeDashboard() {
  const { user }     = useAuth();
  const gps          = useGPS();

  const [session,   setSession]   = useState(null);   // active entry or null
  const [loading,   setLoading]   = useState(true);
  const [picking,   setPicking]   = useState(false);  // show project picker
  const [summary,   setSummary]   = useState(null);   // post-checkout summary
  const [error,     setError]     = useState('');
  const [recent,    setRecent]    = useState([]);

  // Load active session and recent projects
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [activeRes, projectsRes] = await Promise.all([
          fetch(api('/time-entries/active'), { credentials: 'include' }),
          fetch(api('/projects/mine'), { credentials: 'include' }),
        ]);
        const activeData   = await activeRes.json();
        const projectsData = await projectsRes.json();
        if (!cancelled) {
          setSession(activeData.data ?? null);
          setRecent(projectsData.data ?? []);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const handleCheckinClick = () => {
    setError('');
    setPicking(true);
  };

  const handleProjectSelect = async (project) => {
    setPicking(false);
    setLoading(true);
    setError('');

    const gpsData = await gps.capture();

    try {
      const res = await fetch(api('/time-entries/checkin'), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ project_id: project.id, gps: gpsData }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Check-in failed');
      } else {
        setSession({ ...data.data, project_name: project.name });
      }
    } catch {
      setError('Network error. Please try again.');
    }
    setLoading(false);
  };

  const handleCheckout = async () => {
    setLoading(true);
    setError('');

    const gpsData = await gps.capture();

    try {
      const res = await fetch(api('/time-entries/checkout'), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ gps: gpsData }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Check-out failed');
      } else {
        setSummary(data.data);
        setSession(null);
      }
    } catch {
      setError('Network error. Please try again.');
    }
    setLoading(false);
  };

  const handleSummaryDone = () => setSummary(null);

  if (loading) {
    return (
      <div className="em-screen em-loading">
        <div className="em-spinner" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="em-root">
      {error && (
        <div className="em-error-banner" role="alert">
          {error}
          <button className="em-error-close" onClick={() => setError('')}>✕</button>
        </div>
      )}

      {summary ? (
        <SummaryView summary={summary} onDone={handleSummaryDone} />
      ) : session ? (
        <ActiveView user={user} session={session} onCheckout={handleCheckout} />
      ) : (
        <IdleView user={user} onCheckin={handleCheckinClick} />
      )}

      {picking && (
        <ProjectPicker
          recentProjects={recent}
          onSelect={handleProjectSelect}
          onCancel={() => setPicking(false)}
          loading={loading}
        />
      )}
    </div>
  );
}
