import { requireRole } from '../middleware/auth.js';
import { writeAudit } from '../lib/audit.js';

const ADMIN = requireRole('administrator');

const EXPORT_VERSION = '9.2';
const APP_VERSION    = 'Zona Time Tracker';

// ─── Date / format helpers ─────────────────────────────────────────────────────

function isoDate(d) { return d.toISOString().slice(0, 10); }

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DOW_SHORT    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function dayOfWeek(dateStr) {
  return DOW_SHORT[new Date(dateStr + 'T00:00:00Z').getUTCDay()];
}

function isoWeekNum(dateStr) {
  const d   = new Date(dateStr + 'T00:00:00Z');
  const thu = new Date(d);
  thu.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  return Math.ceil((((thu - yearStart) / 86400000) + 1) / 7);
}

function weekLabel(weekStart) { return `W${isoWeekNum(weekStart)}`; }

function fmtPeriodLabel(from, to) {
  const f    = new Date(from + 'T00:00:00Z');
  const t    = new Date(to   + 'T00:00:00Z');
  const fStr = `${MONTHS_SHORT[f.getUTCMonth()]} ${f.getUTCDate()}`;
  const tStr = `${MONTHS_SHORT[t.getUTCMonth()]} ${t.getUTCDate()}, ${t.getUTCFullYear()}`;
  if (Math.round((t - f) / 86400000) === 6) {
    return `Week ${isoWeekNum(from)} · ${fStr} – ${tStr}`;
  }
  return `${fStr} – ${tStr}`;
}

const EXTRA_TYPE_LABEL = {
  own_cost:   'Own Cost',
  extra_work: 'Extra Work',
};
const EXTRA_STATUS_LABEL = {
  open:                'Open',
  waiting_for_manager: 'Waiting for Review',
  processed:           'Processed',
};
function friendlyType(v)   { return EXTRA_TYPE_LABEL[v]   ?? v; }
function friendlyStatus(v) { return EXTRA_STATUS_LABEL[v] ?? v; }

function hhmm(minutes) {
  const m = Math.round(minutes ?? 0);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
function decHours(minutes) { return Math.round((minutes ?? 0) / 60 * 100) / 100; }

// Matrix hours display: '-' for zero/missing, decimal otherwise
function matH(minutes) { return (minutes > 0) ? decHours(minutes) : '-'; }

// ─── Period helpers ────────────────────────────────────────────────────────────

function calcPeriod(period) {
  const today = new Date();
  const dow   = (today.getDay() + 6) % 7; // 0=Mon…6=Sun
  if (period === 'this_month') {
    return {
      date_from: isoDate(new Date(today.getFullYear(), today.getMonth(), 1)),
      date_to:   isoDate(today),
    };
  }
  if (period === 'last_month') {
    return {
      date_from: isoDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      date_to:   isoDate(new Date(today.getFullYear(), today.getMonth(), 0)),
    };
  }
  if (period === 'this_week') {
    const mon = new Date(today); mon.setDate(today.getDate() - dow);
    const sun = new Date(mon);   sun.setDate(mon.getDate() + 6);
    return { date_from: isoDate(mon), date_to: isoDate(sun) };
  }
  if (period === 'last_week') {
    const thisMon = new Date(today); thisMon.setDate(today.getDate() - dow);
    const lastMon = new Date(thisMon); lastMon.setDate(thisMon.getDate() - 7);
    const lastSun = new Date(lastMon); lastSun.setDate(lastMon.getDate() + 6);
    return { date_from: isoDate(lastMon), date_to: isoDate(lastSun) };
  }
  return null;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateDates(from, to) {
  if (!ISO_DATE_RE.test(from)) return 'Invalid date_from';
  if (!ISO_DATE_RE.test(to))   return 'Invalid date_to';
  if (from > to)               return 'date_from must not be after date_to';
  return null;
}

// Return all ISO week-start Mondays that overlap [from, to]
function weeksInRange(from, to) {
  const d   = new Date(from + 'T00:00:00Z');
  const dow = d.getUTCDay();
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  const weeks = [];
  const cur   = new Date(mon);
  while (isoDate(cur) <= to) {
    weeks.push(isoDate(cur));
    cur.setUTCDate(cur.getUTCDate() + 7);
  }
  return weeks;
}

// ─── CRC-32 ───────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(data) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ data[i]) & 0xFF];
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ─── ZIP builder (STORE, no compression) ─────────────────────────────────────

function buildZip(files) {
  const enc = new TextEncoder();
  const entries = files.map(f => ({
    name: enc.encode(f.name),
    data: typeof f.data === 'string' ? enc.encode(f.data) : f.data,
  }));

  const parts = [];
  const centralDir = [];
  let offset = 0;

  for (const f of entries) {
    const crc = crc32(f.data);
    const nl  = f.name.length;
    const dl  = f.data.length;

    const lh = new DataView(new ArrayBuffer(30 + nl));
    lh.setUint32(0,  0x04034b50, true);
    lh.setUint16(4,  20, true);
    lh.setUint16(6,  0, true);
    lh.setUint16(8,  0, true); // STORE
    lh.setUint16(10, 0, true);
    lh.setUint16(12, 0, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, dl, true);
    lh.setUint32(22, dl, true);
    lh.setUint16(26, nl, true);
    lh.setUint16(28, 0, true);
    const lhb = new Uint8Array(lh.buffer);
    for (let i = 0; i < nl; i++) lhb[30 + i] = f.name[i];

    parts.push(lhb, f.data);

    const cd = new DataView(new ArrayBuffer(46 + nl));
    cd.setUint32(0,  0x02014b50, true);
    cd.setUint16(4,  20, true);
    cd.setUint16(6,  20, true);
    cd.setUint16(8,  0, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, 0, true);
    cd.setUint16(14, 0, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, dl, true);
    cd.setUint32(24, dl, true);
    cd.setUint16(28, nl, true);
    cd.setUint16(30, 0, true);
    cd.setUint16(32, 0, true);
    cd.setUint16(34, 0, true);
    cd.setUint16(36, 0, true);
    cd.setUint32(38, 0, true);
    cd.setUint32(42, offset, true);
    const cdb = new Uint8Array(cd.buffer);
    for (let i = 0; i < nl; i++) cdb[46 + i] = f.name[i];

    centralDir.push(cdb);
    offset += lhb.length + dl;
  }

  const cdStart = offset;
  const cdSize  = centralDir.reduce((s, b) => s + b.length, 0);

  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0,  0x06054b50, true);
  eocd.setUint16(4,  0, true);
  eocd.setUint16(6,  0, true);
  eocd.setUint16(8,  files.length, true);
  eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, cdStart, true);
  eocd.setUint16(20, 0, true);

  const all   = [...parts, ...centralDir, new Uint8Array(eocd.buffer)];
  const total = all.reduce((s, b) => s + b.length, 0);
  const out   = new Uint8Array(total);
  let pos = 0;
  for (const b of all) { out.set(b, pos); pos += b.length; }
  return out;
}

// ─── XLSX builder ─────────────────────────────────────────────────────────────

function xe(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function colLetter(idx) {
  let s = '', n = idx;
  do { s = String.fromCharCode(65 + n % 26) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

// Style indices (defined in buildXlsx stylesXml):
// 0  normal
// 1  bold + blue fill       (flat-table header row)
// 2  bold                   (section titles, strong labels)
// 3  grey fill              (alternating data rows – text)
// 4  bold + yellow fill     (totals rows – text)
// 5  centered               (number cells, default)
// 6  bold + blue + centered (matrix column headers)
// 7  bold + yellow + centered (matrix weekly-total numbers)
// 8  grey + centered        (alternating data rows – numbers)
// 9  salmon fill            (mismatch rows in reconciliation)

// Flat-table sheet (freeze row 1, auto-filter, auto-width)
// opts.rowStyleFn(row, rowIndex) → style index override for data cells (optional)
function wsXml(headers, rows, opts = {}) {
  const { rowStyleFn } = opts;

  const lens = headers.map(h => String(h ?? '').length);
  for (const row of rows) {
    row.forEach((v, c) => {
      if (v !== null && v !== undefined && c < lens.length) {
        const l = String(v).length;
        if (l > lens[c]) lens[c] = l;
      }
    });
  }
  const colWidths = lens.map(l => Math.min(Math.max(l + 2, 8), 50));

  let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">\n';

  xml += `  <sheetViews>
    <sheetView tabSelected="1" workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
      <selection pane="bottomLeft"/>
    </sheetView>
  </sheetViews>\n`;

  xml += '  <cols>\n';
  colWidths.forEach((w, i) => {
    xml += `    <col min="${i+1}" max="${i+1}" width="${w}" bestFit="1" customWidth="1"/>\n`;
  });
  xml += '  </cols>\n';

  xml += '  <sheetData>\n    <row r="1">\n';
  headers.forEach((h, c) => {
    xml += `      <c r="${colLetter(c)}1" t="inlineStr" s="1"><is><t>${xe(h)}</t></is></c>\n`;
  });
  xml += '    </row>\n';

  rows.forEach((row, r) => {
    const rn    = r + 2;
    const rowS  = rowStyleFn ? rowStyleFn(row, r) : 0;
    const cells = [];
    row.forEach((v, c) => {
      if (v === null || v === undefined || v === '') return;
      const ref = `${colLetter(c)}${rn}`;
      const s   = rowS ? ` s="${rowS}"` : '';
      if (typeof v === 'number') {
        cells.push(`      <c r="${ref}"${s}><v>${v}</v></c>`);
      } else {
        cells.push(`      <c r="${ref}" t="inlineStr"${s}><is><t>${xe(v)}</t></is></c>`);
      }
    });
    if (cells.length) xml += `    <row r="${rn}">\n${cells.join('\n')}\n    </row>\n`;
  });

  xml += '  </sheetData>\n';
  xml += `  <autoFilter ref="A1:${colLetter(headers.length - 1)}1"/>\n`;
  xml += '</worksheet>';
  return xml;
}

// Matrix / multi-section sheet
// rowDefs: array of (null | Array<{v, s}>)
//   null  → empty row
//   array → cells with value (v) and style (s)
function matrixWsXml(rowDefs, colWidths) {
  let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">\n';

  if (colWidths?.length) {
    xml += '  <cols>\n';
    colWidths.forEach((w, i) => {
      xml += `    <col min="${i+1}" max="${i+1}" width="${w}" bestFit="1" customWidth="1"/>\n`;
    });
    xml += '  </cols>\n';
  }

  xml += '  <sheetData>\n';
  rowDefs.forEach((row, r) => {
    const rn = r + 1;
    if (!row || !row.length) { xml += `    <row r="${rn}"/>\n`; return; }
    const cells = [];
    row.forEach((cell, c) => {
      if (!cell || cell.v === null || cell.v === undefined || cell.v === '') return;
      const ref = `${colLetter(c)}${rn}`;
      const s   = cell.s ? ` s="${cell.s}"` : '';
      if (typeof cell.v === 'number') {
        cells.push(`      <c r="${ref}"${s}><v>${cell.v}</v></c>`);
      } else {
        cells.push(`      <c r="${ref}" t="inlineStr"${s}><is><t>${xe(cell.v)}</t></is></c>`);
      }
    });
    if (cells.length) xml += `    <row r="${rn}">\n${cells.join('\n')}\n    </row>\n`;
    else xml += `    <row r="${rn}"/>\n`;
  });
  xml += '  </sheetData>\n</worksheet>';
  return xml;
}

function buildXlsx(sheets) {
  const n = sheets.length;

  const ctXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheets.map((_, i) => `  <Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const wbXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
${sheets.map((s, i) => `    <sheet name="${xe(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('\n')}
  </sheets>
</workbook>`;

  const wbRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `  <Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('\n')}
  <Relationship Id="rId${n+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  // 6 fills · 10 named styles — see style index comments above wsXml()
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
  </fonts>
  <fills count="6">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD6E4F0"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFCE4D6"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="10">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/>
    <xf numFmtId="0" fontId="1" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="0" xfId="0" applyFill="1"/>
  </cellXfs>
</styleSheet>`;

  return buildZip([
    { name: '[Content_Types].xml',        data: ctXml },
    { name: '_rels/.rels',                data: relsXml },
    { name: 'xl/workbook.xml',            data: wbXml },
    { name: 'xl/_rels/workbook.xml.rels', data: wbRelsXml },
    { name: 'xl/styles.xml',              data: stylesXml },
    ...sheets.map((s, i) => ({
      name: `xl/worksheets/sheet${i+1}.xml`,
      data: s.type === 'matrix'
        ? matrixWsXml(s.rowDefs, s.colWidths)
        : wsXml(s.headers, s.rows, { rowStyleFn: s.rowStyleFn }),
    })),
  ]);
}

// ─── CSV builder ──────────────────────────────────────────────────────────────

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv(headers, rows) {
  const lines = [];
  if (headers && headers.length) lines.push(headers.map(csvCell).join(','));
  lines.push(...rows.map(r => r.map(csvCell).join(',')));
  return lines.join('\r\n');
}

function matrixRowsForCsv(rowDefs) {
  return (rowDefs ?? []).map(row =>
    row ? row.map(c => c?.v ?? '') : []
  );
}

// ─── Data queries ─────────────────────────────────────────────────────────────

async function qEmployees(db) {
  const { results } = await db.prepare(`
    SELECT u.id, u.employee_number, u.first_name, u.last_name, u.email,
           r.name AS role,
           COALESCE(t.name,'') AS team,
           CASE WHEN u.is_active=1 THEN 'active'
                WHEN u.password_hash IS NULL THEN 'pending'
                ELSE 'inactive' END AS status,
           substr(u.created_at,1,10) AS created_date
    FROM Users u
    JOIN Roles r ON r.id=u.role_id
    LEFT JOIN Teams t ON t.id=u.team_id
    ORDER BY u.first_name, u.last_name
  `).all();
  return results;
}

async function qProjects(db) {
  const { results } = await db.prepare(`
    SELECT p.id, p.project_code, p.name,
           COALESCE(c.name,'') AS client,
           p.status,
           CASE WHEN p.is_active=1 THEN 'yes' ELSE 'no' END AS active,
           COALESCE(p.start_date,'') AS start_date,
           COALESCE(p.end_date,'')   AS end_date,
           substr(p.created_at,1,10) AS created_date
    FROM Projects p
    LEFT JOIN Clients c ON c.id=p.client_id
    ORDER BY p.name
  `).all();
  return results;
}

async function qClients(db) {
  const { results } = await db.prepare(`
    SELECT id, name, substr(created_at,1,10) AS created_date
    FROM Clients ORDER BY name
  `).all();
  return results;
}

async function qAttendance(db, from, to) {
  const { results } = await db.prepare(`
    SELECT da.work_date,
           da.start_time, da.finish_time, da.duration_minutes,
           (u.first_name||' '||u.last_name) AS employee_name,
           u.employee_number
    FROM DailyAttendance da
    JOIN Users u ON u.id=da.user_id
    WHERE da.is_deleted=0 AND da.work_date>=? AND da.work_date<=?
    ORDER BY da.work_date, u.first_name, u.last_name
  `).bind(from, to).all();
  return results;
}

async function qProjectHours(db, from, to) {
  const { results } = await db.prepare(`
    SELECT phe.work_date,
           (u.first_name||' '||u.last_name) AS employee_name,
           u.employee_number,
           p.name AS project_name, p.project_code,
           COALESCE(c.name,'') AS client,
           phe.hours_minutes,
           COALESCE(phe.note,'') AS note,
           phe.source,
           substr(phe.created_at,1,10) AS recorded_date
    FROM ProjectHourEntries phe
    JOIN Users    u ON u.id=phe.user_id
    JOIN Projects p ON p.id=phe.project_id
    LEFT JOIN Clients c ON c.id=p.client_id
    WHERE phe.is_deleted=0 AND phe.work_date>=? AND phe.work_date<=?
    ORDER BY phe.work_date, u.first_name, u.last_name, p.name
  `).bind(from, to).all();
  return results;
}

async function qExtras(db, from, to) {
  const { results } = await db.prepare(`
    SELECT e.id,
           substr(e.created_at,1,10) AS created_date,
           (u.first_name||' '||u.last_name) AS employee_name,
           u.employee_number,
           p.name AS project_name, p.project_code,
           e.type, e.description, e.status,
           COALESCE(substr(e.processed_at,1,10),'') AS processed_date
    FROM Extras e
    JOIN Users    u ON u.id=e.user_id
    JOIN Projects p ON p.id=e.project_id
    WHERE e.is_deleted=0
      AND substr(e.created_at,1,10)>=? AND substr(e.created_at,1,10)<=?
    ORDER BY e.created_at DESC
  `).bind(from, to).all();
  return results;
}

async function qMileage(db, from, to) {
  const { results } = await db.prepare(`
    SELECT wm.week_start,
           (u.first_name||' '||u.last_name) AS employee_name,
           u.employee_number,
           wm.mileage_km,
           substr(wm.created_at,1,10) AS recorded_date
    FROM WeeklyMileage wm
    JOIN Users u ON u.id=wm.user_id
    WHERE wm.week_start>=? AND wm.week_start<=?
    ORDER BY wm.week_start, u.first_name, u.last_name
  `).bind(from, to).all();
  return results;
}

async function qWeeklyEmployee(db, from, to) {
  const { results } = await db.prepare(`
    SELECT
      ph.week_start,
      ph.employee_name,
      ph.employee_number,
      ph.team,
      ph.days_logged,
      ph.project_minutes,
      ph.projects_count,
      ph.project_names,
      COALESCE(att.attendance_minutes, 0) AS attendance_minutes,
      COALESCE(ext.open_count, 0) AS open_extras,
      CASE WHEN mil.user_id IS NOT NULL THEN 'Yes' ELSE 'No' END AS mileage_submitted
    FROM (
      SELECT
        date(phe.work_date,'weekday 0','-6 days') AS week_start,
        phe.user_id,
        (u.first_name||' '||u.last_name) AS employee_name,
        u.employee_number,
        COALESCE(t.name,'') AS team,
        COUNT(DISTINCT phe.work_date) AS days_logged,
        SUM(phe.hours_minutes) AS project_minutes,
        COUNT(DISTINCT phe.project_id) AS projects_count,
        GROUP_CONCAT(DISTINCT p.name) AS project_names
      FROM ProjectHourEntries phe
      JOIN Users    u ON u.id=phe.user_id
      LEFT JOIN Teams t ON t.id=u.team_id
      JOIN Projects p ON p.id=phe.project_id
      WHERE phe.is_deleted=0 AND phe.work_date>=? AND phe.work_date<=?
      GROUP BY phe.user_id, date(phe.work_date,'weekday 0','-6 days')
    ) ph
    LEFT JOIN (
      SELECT
        date(da.work_date,'weekday 0','-6 days') AS week_start,
        da.user_id,
        SUM(da.duration_minutes) AS attendance_minutes
      FROM DailyAttendance da
      WHERE da.is_deleted=0 AND da.work_date>=? AND da.work_date<=?
      GROUP BY da.user_id, date(da.work_date,'weekday 0','-6 days')
    ) att ON att.user_id=ph.user_id AND att.week_start=ph.week_start
    LEFT JOIN (
      SELECT user_id, COUNT(*) AS open_count
      FROM Extras
      WHERE is_deleted=0 AND status='open'
      GROUP BY user_id
    ) ext ON ext.user_id=ph.user_id
    LEFT JOIN WeeklyMileage mil
      ON mil.user_id=ph.user_id AND mil.week_start=ph.week_start
    ORDER BY ph.week_start, ph.employee_name
  `).bind(from, to, from, to).all();
  return results;
}

async function qWeeklyProject(db, from, to) {
  const { results } = await db.prepare(`
    SELECT date(phe.work_date,'weekday 0','-6 days') AS week_start,
           p.name AS project_name, p.project_code,
           COALESCE(c.name,'') AS client,
           SUM(phe.hours_minutes) AS total_minutes,
           COUNT(DISTINCT phe.user_id) AS employee_count
    FROM ProjectHourEntries phe
    JOIN Projects p ON p.id=phe.project_id
    LEFT JOIN Clients c ON c.id=p.client_id
    WHERE phe.is_deleted=0 AND phe.work_date>=? AND phe.work_date<=?
    GROUP BY phe.project_id, date(phe.work_date,'weekday 0','-6 days')
    ORDER BY week_start, p.name
  `).bind(from, to).all();
  return results;
}

async function qExtrasCounts(db, from, to) {
  const { results } = await db.prepare(`
    SELECT status, COUNT(*) AS cnt
    FROM Extras
    WHERE is_deleted=0
      AND substr(created_at,1,10)>=? AND substr(created_at,1,10)<=?
    GROUP BY status
  `).bind(from, to).all();
  const counts = { open: 0, processed: 0, waiting_for_manager: 0 };
  for (const r of results) {
    if (r.status in counts) counts[r.status] = r.cnt;
  }
  return counts;
}

// Per-(employee, project, week) hours — used for both matrix sheets
async function qMatrixData(db, from, to) {
  const { results } = await db.prepare(`
    SELECT date(phe.work_date,'weekday 0','-6 days') AS week_start,
           phe.user_id,
           (u.first_name||' '||u.last_name) AS employee_name,
           u.employee_number,
           phe.project_id,
           p.name AS project_name,
           p.project_code,
           COALESCE(c.name,'') AS client,
           SUM(phe.hours_minutes) AS total_minutes
    FROM ProjectHourEntries phe
    JOIN Users    u ON u.id=phe.user_id
    JOIN Projects p ON p.id=phe.project_id
    LEFT JOIN Clients c ON c.id=p.client_id
    WHERE phe.is_deleted=0 AND phe.work_date>=? AND phe.work_date<=?
    GROUP BY phe.user_id, phe.project_id, date(phe.work_date,'weekday 0','-6 days')
    ORDER BY u.first_name, u.last_name, p.name, week_start
  `).bind(from, to).all();
  return results;
}

async function fetchAll(db, from, to) {
  const [
    employees, projects, clients, attendance, projectHours,
    extras, mileage, weeklyEmp, weeklyProj, extrasCounts, matrixRaw,
  ] = await Promise.all([
    qEmployees(db), qProjects(db), qClients(db),
    qAttendance(db, from, to), qProjectHours(db, from, to),
    qExtras(db, from, to), qMileage(db, from, to),
    qWeeklyEmployee(db, from, to), qWeeklyProject(db, from, to),
    qExtrasCounts(db, from, to),
    qMatrixData(db, from, to),
  ]);
  return { employees, projects, clients, attendance, projectHours, extras, mileage, weeklyEmp, weeklyProj, extrasCounts, matrixRaw };
}

// ─── Matrix builders ──────────────────────────────────────────────────────────

// Build in-memory maps for both matrix sheets in a single pass over rawData
function buildMatrixMaps(rawData, from, to) {
  const weeks = weeksInRange(from, to);

  // empMap: userId → { name, code, projects: Map<projId, {name,code,client,weeks:{}}>, weekTotals:{} }
  // projMap: projId → { name, code, client, employees: Map<userId, {name,code,weeks:{}}>, weekTotals:{} }
  const empMap  = new Map();
  const projMap = new Map();

  for (const r of rawData) {
    if (!empMap.has(r.user_id)) {
      empMap.set(r.user_id, {
        id: r.user_id, name: r.employee_name, code: r.employee_number,
        projects: new Map(), weekTotals: {},
      });
    }
    const emp = empMap.get(r.user_id);
    if (!emp.projects.has(r.project_id)) {
      emp.projects.set(r.project_id, {
        name: r.project_name, code: r.project_code, client: r.client, weeks: {},
      });
    }
    emp.projects.get(r.project_id).weeks[r.week_start] = r.total_minutes;
    emp.weekTotals[r.week_start] = (emp.weekTotals[r.week_start] ?? 0) + r.total_minutes;

    if (!projMap.has(r.project_id)) {
      projMap.set(r.project_id, {
        id: r.project_id, name: r.project_name, code: r.project_code, client: r.client,
        employees: new Map(), weekTotals: {},
      });
    }
    const proj = projMap.get(r.project_id);
    if (!proj.employees.has(r.user_id)) {
      proj.employees.set(r.user_id, {
        name: r.employee_name, code: r.employee_number, weeks: {},
      });
    }
    proj.employees.get(r.user_id).weeks[r.week_start] = r.total_minutes;
    proj.weekTotals[r.week_start] = (proj.weekTotals[r.week_start] ?? 0) + r.total_minutes;
  }

  return { empMap, projMap, weeks };
}

function buildEmpMatrixSheet(empMap, weeks) {
  const wLabels = weeks.map(weekLabel);

  let maxNameLen = Math.max('Project'.length, 'Weekly Total'.length);
  for (const emp of empMap.values()) {
    for (const proj of emp.projects.values()) {
      if (proj.name.length > maxNameLen) maxNameLen = proj.name.length;
    }
  }
  const col0W   = Math.min(Math.max(maxNameLen + 4, 22), 52);
  const colWidths = [col0W, ...weeks.map(() => 9), 9];

  const rowDefs = [];
  const sortedEmps = [...empMap.values()].sort((a, b) => a.name.localeCompare(b.name));

  for (const emp of sortedEmps) {
    // Section header
    rowDefs.push([{ v: emp.name, s: 2 }]);
    rowDefs.push([{ v: `Employee Code: ${emp.code}`, s: 0 }]);
    rowDefs.push(null);

    // Column header
    rowDefs.push([
      { v: 'Project', s: 1 },
      ...wLabels.map(lbl => ({ v: lbl, s: 6 })),
      { v: 'Total', s: 6 },
    ]);

    // Project rows (sorted by name)
    const sortedProjs = [...emp.projects.values()].sort((a, b) => a.name.localeCompare(b.name));
    sortedProjs.forEach((proj, idx) => {
      const isAlt = idx % 2 === 1;
      const st = isAlt ? 3 : 0;  // text
      const sn = isAlt ? 8 : 5;  // number/centered
      const projTotal = weeks.reduce((s, w) => s + (proj.weeks[w] ?? 0), 0);
      rowDefs.push([
        { v: proj.name, s: st },
        ...weeks.map(w => ({ v: matH(proj.weeks[w] ?? 0), s: sn })),
        { v: matH(projTotal), s: sn },
      ]);
    });

    // Weekly Total
    const grandTotal = Object.values(emp.weekTotals).reduce((s, m) => s + m, 0);
    rowDefs.push([
      { v: 'Weekly Total', s: 4 },
      ...weeks.map(w => ({ v: matH(emp.weekTotals[w] ?? 0), s: 7 })),
      { v: decHours(grandTotal), s: 7 },
    ]);

    rowDefs.push(null);
    rowDefs.push(null);
  }

  return { rowDefs, colWidths };
}

function buildProjMatrixSheet(projMap, weeks) {
  const wLabels = weeks.map(weekLabel);

  let maxNameLen = Math.max('Employee'.length, 'Weekly Total'.length);
  for (const proj of projMap.values()) {
    for (const emp of proj.employees.values()) {
      if (emp.name.length > maxNameLen) maxNameLen = emp.name.length;
    }
  }
  const col0W   = Math.min(Math.max(maxNameLen + 4, 22), 52);
  const colWidths = [col0W, ...weeks.map(() => 9), 9];

  const rowDefs = [];
  const sortedProjs = [...projMap.values()].sort((a, b) => a.name.localeCompare(b.name));

  for (const proj of sortedProjs) {
    rowDefs.push([{ v: proj.name, s: 2 }]);
    if (proj.client) {
      rowDefs.push([{ v: `Client: ${proj.client}`, s: 0 }]);
    }
    rowDefs.push(null);

    rowDefs.push([
      { v: 'Employee', s: 1 },
      ...wLabels.map(lbl => ({ v: lbl, s: 6 })),
      { v: 'Total', s: 6 },
    ]);

    const sortedEmps = [...proj.employees.values()].sort((a, b) => a.name.localeCompare(b.name));
    sortedEmps.forEach((emp, idx) => {
      const isAlt = idx % 2 === 1;
      const st = isAlt ? 3 : 0;
      const sn = isAlt ? 8 : 5;
      const empTotal = weeks.reduce((s, w) => s + (emp.weeks[w] ?? 0), 0);
      rowDefs.push([
        { v: emp.name, s: st },
        ...weeks.map(w => ({ v: matH(emp.weeks[w] ?? 0), s: sn })),
        { v: matH(empTotal), s: sn },
      ]);
    });

    const grandTotal = Object.values(proj.weekTotals).reduce((s, m) => s + m, 0);
    rowDefs.push([
      { v: 'Weekly Total', s: 4 },
      ...weeks.map(w => ({ v: matH(proj.weekTotals[w] ?? 0), s: 7 })),
      { v: decHours(grandTotal), s: 7 },
    ]);

    rowDefs.push(null);
    rowDefs.push(null);
  }

  return { rowDefs, colWidths };
}

// ─── Sheet definitions ────────────────────────────────────────────────────────

function toSheets(data, from, to, generatedAt) {
  const period     = fmtPeriodLabel(from, to);
  const activeProj = data.projects.filter(p => p.active === 'yes').length;
  const genDisplay = generatedAt.replace('T', ' ').slice(0, 19) + ' UTC';

  // Matrix sheets (built once, used for both XLSX and CSV)
  const { empMap, projMap, weeks } = buildMatrixMaps(data.matrixRaw, from, to);
  const empMatrix  = buildEmpMatrixSheet(empMap, weeks);
  const projMatrix = buildProjMatrixSheet(projMap, weeks);

  // Weekly Reconciliation rows (mismatch rows first)
  const reconRows = data.weeklyEmp
    .map(r => {
      const diff   = r.attendance_minutes - r.project_minutes;
      const diffH  = Math.round(diff / 60 * 100) / 100;
      const status = diff === 0 ? 'OK' : 'Mismatch';
      return [
        r.week_start, r.employee_name, r.employee_number, r.team,
        decHours(r.attendance_minutes), decHours(r.project_minutes), diffH, status,
      ];
    })
    .sort((a, b) => {
      if (a[7] !== b[7]) return a[7] === 'Mismatch' ? -1 : 1;
      if (a[0] !== b[0]) return a[0].localeCompare(b[0]);
      return a[1].localeCompare(b[1]);
    });

  return [
    // ── 10 existing sheets ─────────────────────────────────────────────────
    {
      name: 'Summary',
      headers: ['Field', 'Value'],
      rows: [
        ['Export Generated',          genDisplay],
        ['Selected Period',           period],
        ['', ''],
        ['Employees',                 data.employees.length],
        ['Active Projects',           activeProj],
        ['Clients',                   data.clients.length],
        ['', ''],
        ['Attendance Records',        data.attendance.length],
        ['Project Hour Entries',      data.projectHours.length],
        ['Open Extras',               data.extrasCounts.open],
        ['Extras Waiting for Review', data.extrasCounts.waiting_for_manager],
        ['Processed Extras',          data.extrasCounts.processed],
        ['Mileage Records',           data.mileage.length],
        ['', ''],
        ['Export Version',            EXPORT_VERSION],
        ['Application',               APP_VERSION],
      ],
    },
    {
      name: 'Employees',
      headers: ['Employee ID','First Name','Last Name','Email','Employee Code','Role','Team','Status','Created Date'],
      rows: data.employees.map(r => [r.id,r.first_name,r.last_name,r.email,r.employee_number,r.role,r.team,r.status,r.created_date]),
    },
    {
      name: 'Projects',
      headers: ['Project ID','Project Code','Project Name','Client','Status','Active','Start Date','End Date','Created Date'],
      rows: data.projects.map(r => [r.id,r.project_code,r.name,r.client,r.status,r.active,r.start_date,r.end_date,r.created_date]),
    },
    {
      name: 'Clients',
      headers: ['Client ID','Client Name','Created Date'],
      rows: data.clients.map(r => [r.id,r.name,r.created_date]),
    },
    {
      name: 'Attendance',
      headers: ['Date','Day','Employee Name','Employee Code','Start Time','Finish Time','Duration (h:mm)','Duration (hours)'],
      rows: data.attendance.map(r => [
        r.work_date, dayOfWeek(r.work_date),
        r.employee_name, r.employee_number,
        r.start_time, r.finish_time,
        hhmm(r.duration_minutes), decHours(r.duration_minutes),
      ]),
    },
    {
      name: 'Project Hours',
      headers: ['Date','Employee Name','Employee Code','Project Name','Project Code','Client','Hours (decimal)','Hours (h:mm)','Note','Source','Recorded Date'],
      rows: data.projectHours.map(r => [
        r.work_date, r.employee_name, r.employee_number,
        r.project_name, r.project_code, r.client,
        decHours(r.hours_minutes), hhmm(r.hours_minutes),
        r.note, r.source, r.recorded_date,
      ]),
    },
    {
      name: 'Extras',
      headers: ['ID','Date Created','Employee Name','Employee Code','Project Name','Project Code','Type','Description','Status','Date Processed'],
      rows: data.extras.map(r => [
        r.id, r.created_date, r.employee_name, r.employee_number,
        r.project_name, r.project_code,
        friendlyType(r.type), r.description,
        friendlyStatus(r.status), r.processed_date,
      ]),
    },
    {
      name: 'Mileage',
      headers: ['Week Start','Employee Name','Employee Code','Mileage (km)','Recorded Date'],
      rows: data.mileage.map(r => [r.week_start,r.employee_name,r.employee_number,r.mileage_km,r.recorded_date]),
    },
    {
      name: 'Employee Weekly Summary',
      headers: ['Week Start','Employee Name','Employee Code','Team','Attendance Hours','Allocated Project Hours','Difference','Days Logged','Projects Worked On','Open Extras','Mileage Submitted'],
      rows: data.weeklyEmp.map(r => [
        r.week_start, r.employee_name, r.employee_number, r.team,
        decHours(r.attendance_minutes),
        decHours(r.project_minutes),
        decHours(r.attendance_minutes - r.project_minutes),
        r.days_logged,
        r.project_names ?? '',
        r.open_extras,
        r.mileage_submitted,
      ]),
    },
    {
      name: 'Project Weekly Summary',
      headers: ['Week Start','Project Name','Project Code','Client','Total Hours (decimal)','Total Hours (h:mm)','Employees','Avg Hours/Employee'],
      rows: data.weeklyProj.map(r => [
        r.week_start, r.project_name, r.project_code, r.client,
        decHours(r.total_minutes), hhmm(r.total_minutes),
        r.employee_count,
        r.employee_count > 0 ? Math.round(decHours(r.total_minutes) / r.employee_count * 100) / 100 : 0,
      ]),
    },

    // ── 3 new operational sheets (Sprint 9.2) ────────────────────────────
    {
      name: 'Employee Timesheet Matrix',
      type: 'matrix',
      rowDefs:   empMatrix.rowDefs,
      colWidths: empMatrix.colWidths,
    },
    {
      name: 'Project Timesheet Matrix',
      type: 'matrix',
      rowDefs:   projMatrix.rowDefs,
      colWidths: projMatrix.colWidths,
    },
    {
      name: 'Weekly Reconciliation',
      headers: ['Week Start','Employee Name','Employee Code','Team','Attendance Hours','Allocated Hours','Difference','Status'],
      rows: reconRows,
      rowStyleFn: (row) => row[7] === 'Mismatch' ? 9 : 0,
    },
  ];
}

function toCsvFiles(data, from, to) {
  const sheets  = toSheets(data, from, to, new Date().toISOString());
  const nameMap = {
    'Summary':                  'summary.csv',
    'Employees':                'employees.csv',
    'Projects':                 'projects.csv',
    'Clients':                  'clients.csv',
    'Attendance':               'attendance.csv',
    'Project Hours':            'project_hours.csv',
    'Extras':                   'extras.csv',
    'Mileage':                  'mileage.csv',
    'Employee Weekly Summary':  'employee_weekly_summary.csv',
    'Project Weekly Summary':   'project_weekly_summary.csv',
    'Employee Timesheet Matrix':'employee_matrix.csv',
    'Project Timesheet Matrix': 'project_matrix.csv',
    'Weekly Reconciliation':    'weekly_reconciliation.csv',
  };
  return sheets.map(s => ({
    name: nameMap[s.name] ?? `${s.name}.csv`,
    data: s.type === 'matrix'
      ? buildCsv([], matrixRowsForCsv(s.rowDefs))
      : buildCsv(s.headers, s.rows),
  }));
}

// ─── Route handlers ───────────────────────────────────────────────────────────

// POST /api/admin-console/export
export async function generateExport(request, env) {
  const guard = await ADMIN(request, env);
  if (guard) return guard;

  const body = await request.json().catch(() => ({}));
  const { period } = body;

  let from, to;
  if (period && period !== 'custom') {
    const range = calcPeriod(period);
    if (!range) return Response.json({ error: 'Invalid period' }, { status: 400 });
    from = range.date_from;
    to   = range.date_to;
  } else {
    from = body.date_from ?? '';
    to   = body.date_to   ?? '';
  }

  const err = validateDates(from, to);
  if (err) return Response.json({ error: err }, { status: 400 });

  const generatedAt = new Date().toISOString();

  await writeAudit(env.DB, {
    actorId:    request.user.id,
    action:     'data_export_generated',
    entityType: 'export',
    entityId:   null,
    oldValues:  null,
    newValues:  { period: period ?? 'custom', date_from: from, date_to: to, formats: ['xlsx', 'csv'] },
    ipAddress:  null,
  });

  return Response.json({
    data: { date_from: from, date_to: to, generated_at: generatedAt, status: 'ready' },
  });
}

// GET /api/admin-console/export/xlsx?date_from=X&date_to=Y
export async function downloadXlsx(request, env) {
  const guard = await ADMIN(request, env);
  if (guard) return guard;

  const url  = new URL(request.url);
  const from = url.searchParams.get('date_from') ?? '';
  const to   = url.searchParams.get('date_to')   ?? '';

  const err = validateDates(from, to);
  if (err) return Response.json({ error: err }, { status: 400 });

  const data      = await fetchAll(env.DB, from, to);
  const sheets    = toSheets(data, from, to, new Date().toISOString());
  const xlsxBytes = buildXlsx(sheets);
  const filename  = `timetracking_export_${from}_${to}.xlsx`;

  return new Response(xlsxBytes, {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      String(xlsxBytes.length),
    },
  });
}

// GET /api/admin-console/export/csv?date_from=X&date_to=Y
export async function downloadCsv(request, env) {
  const guard = await ADMIN(request, env);
  if (guard) return guard;

  const url  = new URL(request.url);
  const from = url.searchParams.get('date_from') ?? '';
  const to   = url.searchParams.get('date_to')   ?? '';

  const err = validateDates(from, to);
  if (err) return Response.json({ error: err }, { status: 400 });

  const data     = await fetchAll(env.DB, from, to);
  const csvFiles = toCsvFiles(data, from, to);
  const zipBytes = buildZip(csvFiles);
  const filename = `timetracking_export_${from}_${to}.zip`;

  return new Response(zipBytes, {
    headers: {
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      String(zipBytes.length),
    },
  });
}
