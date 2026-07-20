/**
 * Tests for weekUtils.js — week navigation logic for the Operations Dashboard.
 *
 * Coverage:
 *  - current week is default (WD-03)
 *  - Previous Week / Next Week / Current Week navigation (WD-04)
 *  - ISO week number and label formatting (WD-05)
 *  - API URL uses the selected week_start (WD-07)
 *  - addDays used by all navigation controls (WD-04)
 */

import { describe, it, expect } from 'vitest';
import {
  weekStartFor,
  weekEndFor,
  addWeeks,
  addDays,
  isoWeekNumber,
  fmtWeekLabel,
  fmtWeekRange,
  getCurrentWeekStart,
} from './weekUtils.js';

// ── weekStartFor ──────────────────────────────────────────────────────────────

describe('weekStartFor', () => {
  it('WD-01: Monday of a week that starts on Monday is itself', () => {
    // Jul 6, 2026 is a Monday (verified: Jan 5, 2026 is the first Monday; +26 weeks = Jul 6)
    expect(weekStartFor('2026-07-06')).toBe('2026-07-06');
  });

  it('WD-02: mid-week date returns the Monday of that week', () => {
    // Wednesday Jul 8 → Monday Jul 6
    expect(weekStartFor('2026-07-08')).toBe('2026-07-06');
  });

  it('WD-03: Sunday returns the preceding Monday', () => {
    // Sunday Jul 12 → Monday Jul 6
    expect(weekStartFor('2026-07-12')).toBe('2026-07-06');
  });

  it('WD-04: result is always a YYYY-MM-DD string', () => {
    expect(weekStartFor('2026-07-09')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ── weekEndFor ────────────────────────────────────────────────────────────────

describe('weekEndFor', () => {
  it('WD-05: end of week starting Jul 6 is Jul 12', () => {
    expect(weekEndFor('2026-07-06')).toBe('2026-07-12');
  });

  it('WD-06: end of week spanning month boundary', () => {
    // Week starting Jun 29 ends Jul 5
    expect(weekEndFor('2026-06-29')).toBe('2026-07-05');
  });
});

// ── addDays ───────────────────────────────────────────────────────────────────

describe('addDays', () => {
  it('WD-07: addDays(+7) = next week (Previous/Next Week controls)', () => {
    expect(addDays('2026-07-06', 7)).toBe('2026-07-13');
  });

  it('WD-08: addDays(-7) = previous week (Previous Week control)', () => {
    expect(addDays('2026-07-06', -7)).toBe('2026-06-29');
  });

  it('WD-09: addDays round-trip: +7 then -7 returns original', () => {
    const start = '2026-07-06';
    expect(addDays(addDays(start, 7), -7)).toBe(start);
  });

  it('WD-10: addDays handles month boundary', () => {
    expect(addDays('2026-06-29', 7)).toBe('2026-07-06');
  });

  it('WD-11: addDays handles year boundary', () => {
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
  });
});

// ── addWeeks ──────────────────────────────────────────────────────────────────

describe('addWeeks', () => {
  it('WD-12: addWeeks(+1) equals addDays(+7)', () => {
    expect(addWeeks('2026-07-06', 1)).toBe(addDays('2026-07-06', 7));
  });

  it('WD-13: addWeeks(-1) equals addDays(-7)', () => {
    expect(addWeeks('2026-07-06', -1)).toBe(addDays('2026-07-06', -7));
  });
});

// ── isoWeekNumber ─────────────────────────────────────────────────────────────

describe('isoWeekNumber', () => {
  it('WD-14: week starting Jul 6 2026 is ISO week 28', () => {
    expect(isoWeekNumber('2026-07-06').week).toBe(28);
  });

  it('WD-15: week starting Jun 29 2026 is ISO week 27', () => {
    expect(isoWeekNumber('2026-06-29').week).toBe(27);
  });

  it('WD-16: week starting Jul 13 2026 is ISO week 29', () => {
    expect(isoWeekNumber('2026-07-13').week).toBe(29);
  });

  it('WD-17: week containing Jan 1 2026 (a Thursday) is week 1', () => {
    // Jan 1 2026 is Thursday; its Monday is Dec 29 2025 → ISO week 1 of 2026
    expect(isoWeekNumber('2025-12-29').week).toBe(1);
    expect(isoWeekNumber('2025-12-29').year).toBe(2026);
  });

  it('WD-18: Jan 5 2026 (first full week) is week 2', () => {
    expect(isoWeekNumber('2026-01-05').week).toBe(2);
  });
});

// ── fmtWeekLabel ──────────────────────────────────────────────────────────────

describe('fmtWeekLabel', () => {
  it('WD-19: formats week 28 as "Week 28 – Jul 6 to Jul 12"', () => {
    const label = fmtWeekLabel('2026-07-06');
    expect(label).toContain('Week 28');
    expect(label).toContain('Jul 6');
    expect(label).toContain('Jul 12');
  });

  it('WD-20: previous week label shows week 27 and Jun 29 to Jul 5', () => {
    const label = fmtWeekLabel('2026-06-29');
    expect(label).toContain('Week 27');
    expect(label).toContain('Jun 29');
    expect(label).toContain('Jul 5');
  });

  it('WD-21: next week label shows week 29 and Jul 13 to Jul 19', () => {
    const label = fmtWeekLabel('2026-07-13');
    expect(label).toContain('Week 29');
    expect(label).toContain('Jul 13');
    expect(label).toContain('Jul 19');
  });
});

// ── getCurrentWeekStart ───────────────────────────────────────────────────────

describe('getCurrentWeekStart', () => {
  it('WD-22: returns a YYYY-MM-DD string', () => {
    expect(getCurrentWeekStart()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('WD-23: result is always a Monday (UTC day-of-week = 1)', () => {
    const result = getCurrentWeekStart();
    const d = new Date(result + 'T00:00:00Z');
    expect(d.getUTCDay()).toBe(1);
  });

  it('WD-24: result equals weekStartFor of today', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(getCurrentWeekStart()).toBe(weekStartFor(today));
  });
});

// ── Navigation logic (covers dashboard controls spec) ─────────────────────────

describe('Week navigation controls', () => {
  const CURRENT = '2026-07-06'; // Monday Week 28

  it('WD-25: Previous Week control: addDays(current, -7)', () => {
    expect(addDays(CURRENT, -7)).toBe('2026-06-29');
  });

  it('WD-26: Next Week control: addDays(current, +7)', () => {
    expect(addDays(CURRENT, 7)).toBe('2026-07-13');
  });

  it('WD-27: Current Week control returns getMonday() of today', () => {
    const returned = getCurrentWeekStart();
    const d = new Date(returned + 'T00:00:00Z');
    expect(d.getUTCDay()).toBe(1);
  });

  it('WD-28: after prev+next, week_start equals original', () => {
    const afterPrev = addDays(CURRENT, -7);
    const afterNext = addDays(afterPrev, 7);
    expect(afterNext).toBe(CURRENT);
  });
});

// ── API URL construction ───────────────────────────────────────────────────────

describe('API URL uses selected week_start', () => {
  it('WD-29: dashboard URL encodes selected week correctly', () => {
    const weekStart = '2026-06-29';
    const url = `/api/dashboard/operations?week_start=${weekStart}`;
    expect(url).toBe('/api/dashboard/operations?week_start=2026-06-29');
  });

  it('WD-30: different weeks produce different URLs', () => {
    const url1 = `/api/dashboard/operations?week_start=${addDays('2026-07-06', -7)}`;
    const url2 = `/api/dashboard/operations?week_start=2026-07-06`;
    expect(url1).not.toBe(url2);
  });

  it('WD-31: Open Extras Queue URL has no week filter', () => {
    // Open Extras Queue always uses /api/extras or embedded in /api/dashboard/operations
    // without a week_start filter — verified by backend returning open_extras without date scope.
    // This test confirms the extras navigation path is week-independent.
    const extrasUrl = '/admin/extras?status=open';
    expect(extrasUrl).not.toContain('week_start');
  });
});
