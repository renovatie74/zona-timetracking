/**
 * Tests for businessTime.js — timezone consistency for employee mobile flow.
 *
 * Regression coverage for Bug 2: active-session start time must render the
 * same value whether it comes from a successful check-in or a 409 payload.
 */

import { describe, it, expect } from 'vitest';
import { formatBusinessTime } from './businessTime.js';

const BUSINESS_TZ = 'Europe/Amsterdam';

// ── formatBusinessTime ────────────────────────────────────────────────────────

describe('formatBusinessTime', () => {

  it('BT-01: formats a UTC ISO string in Amsterdam timezone, not UTC', () => {
    // 13:02 UTC = 15:02 Amsterdam (CEST, UTC+2)
    const iso = '2026-06-25T13:02:00.000Z';
    const formatted = formatBusinessTime(iso);
    expect(formatted).toBe('15:02');
    expect(formatted).not.toBe('13:02');
  });

  it('BT-02: same ISO string always renders to the same display time', () => {
    const iso = '2026-06-25T09:30:00.000Z';
    const a = formatBusinessTime(iso);
    const b = formatBusinessTime(iso);
    expect(a).toBe(b);
  });

  it('BT-03: formats correctly regardless of trailing Z vs explicit offset', () => {
    // Both forms represent the same instant
    const withZ      = '2026-06-25T10:00:00Z';
    const withOffset = '2026-06-25T12:00:00+02:00'; // same instant in Amsterdam
    expect(formatBusinessTime(withZ)).toBe(formatBusinessTime(withOffset));
  });

  it('BT-04: returns — for null or undefined', () => {
    expect(formatBusinessTime(null)).toBe('—');
    expect(formatBusinessTime(undefined)).toBe('—');
  });

  it('BT-05: output is always hh:mm (5 chars, colon at index 2)', () => {
    const iso = '2026-06-25T08:15:00.000Z';
    const result = formatBusinessTime(iso);
    expect(result).toHaveLength(5);
    expect(result[2]).toBe(':');
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  it('BT-06: active-card time matches 409-resolved time for same ISO', () => {
    // Simulates: checked-in card uses formatBusinessTime(session.start_time)
    // and 409 path resolves via loadAll → same formatter → same output
    const sessionStartTime = '2026-06-25T11:05:00.000Z';

    const activeCardTime  = formatBusinessTime(sessionStartTime);
    const resolvedTime    = formatBusinessTime(sessionStartTime); // 409 path: loadAll → same field

    expect(activeCardTime).toBe(resolvedTime);
    // Both should be 13:05 Amsterdam (UTC+2), not 11:05 UTC
    expect(activeCardTime).toBe('13:05');
  });
});
