/**
 * Rounding unit tests — Sprint 3A.1
 *
 * Business rules (spec §6 / Sprint 3A.1):
 *   Check-in  → FLOOR to nearest 15-min boundary (always rounds DOWN)
 *   Check-out → CEIL  to next   15-min boundary  (always rounds UP; exact = no change)
 */

import { describe, it, expect } from 'vitest';
import { roundCheckin, roundCheckout, computeRounded } from '../src/lib/rounding.js';

function utc(h, m, s = 0) {
  return new Date(`2026-01-01T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.000Z`);
}

function hhmm(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().slice(11, 16);
}

// ── roundCheckin (FLOOR — always down) ───────────────────────────────────────

describe('roundCheckin', () => {

  it('TC-R01: 03:10 → 03:00 (spec example)', () => {
    expect(hhmm(roundCheckin(utc(3, 10)))).toBe('03:00');
  });

  it('TC-R02: 10:07 → 10:00 (just before half-boundary)', () => {
    expect(hhmm(roundCheckin(utc(10, 7)))).toBe('10:00');
  });

  it('TC-R03: 10:08 → 10:00 (just past half-boundary, still floors)', () => {
    // NEAREST rule would give 10:15 here; FLOOR always gives 10:00
    expect(hhmm(roundCheckin(utc(10, 8)))).toBe('10:00');
  });

  it('TC-R04: 10:10 → 10:00 (FLOOR rule — spec: "10:10 → 10:15 if nearest was implemented")', () => {
    // With old NEAREST rule: 10:10 → 10:15 (10 > 7.5)
    // With new FLOOR rule:   10:10 → 10:00
    expect(hhmm(roundCheckin(utc(10, 10)))).toBe('10:00');
  });

  it('TC-R05: 07:53 → 07:45 (near next quarter, still floors)', () => {
    expect(hhmm(roundCheckin(utc(7, 53)))).toBe('07:45');
  });

  it('TC-R06: exactly on boundary → no change', () => {
    expect(hhmm(roundCheckin(utc(7, 15)))).toBe('07:15');
    expect(hhmm(roundCheckin(utc(8, 0)))).toBe('08:00');
    expect(hhmm(roundCheckin(utc(8, 45)))).toBe('08:45');
  });

  it('TC-R07: 07:14 → 07:00 (1 min before boundary, floors to previous)', () => {
    expect(hhmm(roundCheckin(utc(7, 14)))).toBe('07:00');
  });

  it('TC-R08: midnight boundary', () => {
    expect(hhmm(roundCheckin(utc(0, 1)))).toBe('00:00');
    expect(hhmm(roundCheckin(utc(0, 14)))).toBe('00:00');
  });

});

// ── roundCheckout (CEIL — always up) ─────────────────────────────────────────

describe('roundCheckout', () => {

  it('TC-R09: 11:22 → 11:30 (spec example)', () => {
    expect(hhmm(roundCheckout(utc(11, 22)))).toBe('11:30');
  });

  it('TC-R10: 15:00 → 15:00 (exactly on boundary: no change)', () => {
    expect(hhmm(roundCheckout(utc(15, 0)))).toBe('15:00');
  });

  it('TC-R11: 15:01 → 15:15 (1 min past boundary, ceils up)', () => {
    expect(hhmm(roundCheckout(utc(15, 1)))).toBe('15:15');
  });

  it('TC-R12: 15:59 → 16:00', () => {
    expect(hhmm(roundCheckout(utc(15, 59)))).toBe('16:00');
  });

  it('TC-R13: 23:45 → 23:45 (exact boundary at end of day)', () => {
    expect(hhmm(roundCheckout(utc(23, 45)))).toBe('23:45');
  });

  it('TC-R14: 23:46 → 00:00 next day (crosses midnight)', () => {
    const result = roundCheckout(utc(23, 46));
    // result should be 24:00 which is next day 00:00
    expect(result.getTime() - utc(23, 46).getTime()).toBeLessThan(15 * 60 * 1000);
    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
  });

});

// ── computeRounded (end-to-end) ───────────────────────────────────────────────

describe('computeRounded', () => {

  it('TC-R15: 03:10 → 11:22 = 8h 30m (spec example)', () => {
    const r = computeRounded(
      '2026-01-01T03:10:00.000Z',
      '2026-01-01T11:22:00.000Z',
    );
    expect(r.duration_minutes).toBe(492);          // 8h 12m actual
    expect(hhmm(r.rounded_start_time)).toBe('03:00');
    expect(hhmm(r.rounded_stop_time)).toBe('11:30');
    expect(r.rounded_duration_minutes).toBe(510);  // 8h 30m
  });

  it('TC-R16: exact 15-min boundaries → duration unchanged', () => {
    const r = computeRounded(
      '2026-01-01T03:15:00.000Z',
      '2026-01-01T10:00:00.000Z',
    );
    expect(r.duration_minutes).toBe(405);
    expect(r.rounded_duration_minutes).toBe(405);
  });

  it('TC-R17: start before half-boundary, checkout past boundary', () => {
    // 04:06 → 04:00 (floor), 04:38 → 04:45 (ceil)
    const r = computeRounded(
      '2026-01-01T04:06:00.000Z',
      '2026-01-01T04:38:00.000Z',
    );
    expect(hhmm(r.rounded_start_time)).toBe('04:00');
    expect(hhmm(r.rounded_stop_time)).toBe('04:45');
    expect(r.rounded_duration_minutes).toBe(45);
  });

  it('TC-R18: start after half-boundary (old NEAREST would round UP, FLOOR rounds down)', () => {
    // 07:12 → 07:00 (floor; old NEAREST gave 07:15)
    const r = computeRounded(
      '2026-01-01T07:12:00.000Z',
      '2026-01-01T10:34:00.000Z',
    );
    expect(hhmm(r.rounded_start_time)).toBe('07:00');
    expect(hhmm(r.rounded_stop_time)).toBe('10:45');
    expect(r.rounded_duration_minutes).toBe(225);  // old NEAREST gave 210
  });

  it('TC-R19: checkout exactly on boundary → no change', () => {
    // 08:03 → 08:00 (floor), 09:00 → 09:00 (exactly on boundary)
    const r = computeRounded(
      '2026-01-01T08:03:00.000Z',
      '2026-01-01T09:00:00.000Z',
    );
    expect(hhmm(r.rounded_start_time)).toBe('08:00');
    expect(hhmm(r.rounded_stop_time)).toBe('09:00');
    expect(r.rounded_duration_minutes).toBe(60);
  });

  it('TC-R20: crosses noon', () => {
    // 11:52 → 11:45 (floor), 13:07 → 13:15 (ceil)
    const r = computeRounded(
      '2026-01-01T11:52:00.000Z',
      '2026-01-01T13:07:00.000Z',
    );
    expect(hhmm(r.rounded_start_time)).toBe('11:45');
    expect(hhmm(r.rounded_stop_time)).toBe('13:15');
    expect(r.rounded_duration_minutes).toBe(90);
  });

  it('TC-R21: single-quarter shift (15-min increment)', () => {
    const r = computeRounded(
      '2026-01-01T06:00:00.000Z',
      '2026-01-01T06:15:00.000Z',
    );
    expect(r.duration_minutes).toBe(15);
    expect(r.rounded_duration_minutes).toBe(15);
  });

});
