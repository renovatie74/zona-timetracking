/**
 * Unit tests for time input utilities — Sprint 3A.2
 */

import { describe, it, expect } from 'vitest';
import { validateTime, stepTime, roundingPreview } from './timeInput.js';

// ── validateTime ──────────────────────────────────────────────────────────────

describe('validateTime', () => {

  it('TC-TI01: valid times return null', () => {
    expect(validateTime('07:00')).toBeNull();
    expect(validateTime('08:30')).toBeNull();
    expect(validateTime('13:15')).toBeNull();
    expect(validateTime('17:45')).toBeNull();
    expect(validateTime('00:00')).toBeNull();
    expect(validateTime('23:45')).toBeNull();
  });

  it('TC-TI02: empty / missing returns Required', () => {
    expect(validateTime('')).toBe('Required');
    expect(validateTime(null)).toBe('Required');
    expect(validateTime(undefined)).toBe('Required');
  });

  it('TC-TI03: wrong format returns error message', () => {
    expect(validateTime('7:00')).not.toBeNull();   // no leading zero
    expect(validateTime('0700')).not.toBeNull();    // missing colon
    expect(validateTime('07:0')).not.toBeNull();    // single-digit minute
    expect(validateTime('7:0')).not.toBeNull();
    expect(validateTime('abc')).not.toBeNull();
    expect(validateTime('25:00')).not.toBeNull();   // hours > 23
  });

  it('TC-TI04: invalid minutes (not 00/15/30/45) return error', () => {
    expect(validateTime('08:01')).not.toBeNull();
    expect(validateTime('08:14')).not.toBeNull();
    expect(validateTime('08:16')).not.toBeNull();
    expect(validateTime('08:29')).not.toBeNull();
    expect(validateTime('08:31')).not.toBeNull();
    expect(validateTime('08:59')).not.toBeNull();
  });

  it('TC-TI05: error message contains example', () => {
    const msg = validateTime('08:22');
    expect(msg).toContain('08:30');
  });
});

// ── stepTime ──────────────────────────────────────────────────────────────────

describe('stepTime', () => {

  it('TC-TI06: +15 increments correctly', () => {
    expect(stepTime('07:00', 15)).toBe('07:15');
    expect(stepTime('07:45', 15)).toBe('08:00');
    expect(stepTime('23:45', 15)).toBe('00:00');  // wraps midnight
  });

  it('TC-TI07: -15 decrements correctly', () => {
    expect(stepTime('08:00', -15)).toBe('07:45');
    expect(stepTime('00:00', -15)).toBe('23:45');  // wraps midnight
  });

  it('TC-TI08: invalid input returns unchanged', () => {
    expect(stepTime('', 15)).toBe('');
    expect(stepTime('abc', 15)).toBe('abc');
  });

  it('TC-TI13: + snaps UP to next boundary when not on a boundary', () => {
    expect(stepTime('08:12', 15)).toBe('08:15');
    expect(stepTime('08:27', 15)).toBe('08:30');
    expect(stepTime('08:01', 15)).toBe('08:15');
    expect(stepTime('08:14', 15)).toBe('08:15');
  });

  it('TC-TI14: - snaps DOWN to previous boundary when not on a boundary', () => {
    expect(stepTime('08:12', -15)).toBe('08:00');
    expect(stepTime('08:27', -15)).toBe('08:15');
    expect(stepTime('08:16', -15)).toBe('08:15');
    expect(stepTime('08:44', -15)).toBe('08:30');
  });

  it('TC-TI15: already on boundary steps normally', () => {
    expect(stepTime('08:30', 15)).toBe('08:45');
    expect(stepTime('08:30', -15)).toBe('08:15');
    expect(stepTime('08:00', 15)).toBe('08:15');
    expect(stepTime('08:45', -15)).toBe('08:30');
  });

  it('TC-TI16: result after step is always valid (error clears)', () => {
    // All spec cases from Sprint 3A.3 — step result must pass validateTime
    const cases = [
      ['08:12', 15, '08:15'],
      ['08:12', -15, '08:00'],
      ['08:27', 15, '08:30'],
      ['08:27', -15, '08:15'],
      ['08:30', 15, '08:45'],
      ['08:30', -15, '08:15'],
    ];
    for (const [input, delta, expected] of cases) {
      const result = stepTime(input, delta);
      expect(result).toBe(expected);
      expect(validateTime(result)).toBeNull();  // no error after step
    }
  });
});

// ── roundingPreview ───────────────────────────────────────────────────────────

describe('roundingPreview', () => {

  it('TC-TI09: valid pair returns actual and rounded durations', () => {
    const r = roundingPreview('07:00', '15:30');
    expect(r).not.toBeNull();
    expect(r.actual).toBe(510);   // 8h 30m
    expect(r.rounded).toBe(510);  // already on boundaries
  });

  it('TC-TI10: end before start returns null', () => {
    expect(roundingPreview('15:00', '07:00')).toBeNull();
    expect(roundingPreview('08:00', '08:00')).toBeNull();  // equal
  });

  it('TC-TI11: invalid time returns null', () => {
    expect(roundingPreview('', '15:00')).toBeNull();
    expect(roundingPreview('07:00', '')).toBeNull();
    expect(roundingPreview('07:22', '15:00')).toBeNull();  // invalid minutes
  });

  it('TC-TI12: short shift — 15-min increment', () => {
    const r = roundingPreview('09:00', '09:15');
    expect(r.actual).toBe(15);
    expect(r.rounded).toBe(15);
  });
});
