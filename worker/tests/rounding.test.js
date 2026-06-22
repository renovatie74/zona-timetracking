/**
 * Rounding unit tests — updated Sprint 3B.2
 *
 * New rule (§6 revised): round ONLY the total duration to the nearest 15 min.
 * Threshold: 0–7 min past a 15-min boundary → round DOWN; 8–14 → round UP.
 * Equivalent to Math.round(minutes / 15) * 15.
 *
 * Minimum duration: MIN_DURATION_MINUTES (10 min).
 */

import { describe, it, expect } from 'vitest';
import { roundDuration, computeRounded, MIN_DURATION_MINUTES } from '../src/lib/rounding.js';

// ── roundDuration ─────────────────────────────────────────────────────────────

describe('roundDuration', () => {

  it('TC-R01: 60 min (1h 00m) → 60', () => {
    expect(roundDuration(60)).toBe(60);
  });

  it('TC-R02: 65 min (1h 05m) → 60', () => {
    expect(roundDuration(65)).toBe(60);
  });

  it('TC-R03: 67 min (1h 07m) → 60  (7 min below threshold, rounds down)', () => {
    expect(roundDuration(67)).toBe(60);
  });

  it('TC-R04: 68 min (1h 08m) → 75  (8 min = at/above threshold, rounds up)', () => {
    expect(roundDuration(68)).toBe(75);
  });

  it('TC-R05: 74 min (1h 14m) → 75', () => {
    expect(roundDuration(74)).toBe(75);
  });

  it('TC-R06: 82 min (1h 22m) → 75', () => {
    expect(roundDuration(82)).toBe(75);
  });

  it('TC-R07: 83 min (1h 23m) → 90', () => {
    expect(roundDuration(83)).toBe(90);
  });

  it('TC-R08: 7 min → 0  (rounds down to 0)', () => {
    expect(roundDuration(7)).toBe(0);
  });

  it('TC-R09: 8 min → 15  (rounds up to first increment)', () => {
    expect(roundDuration(8)).toBe(15);
  });

  it('TC-R10: 15 min → 15  (exact boundary)', () => {
    expect(roundDuration(15)).toBe(15);
  });

  it('TC-R11: 0 min → 0', () => {
    expect(roundDuration(0)).toBe(0);
  });

  it('TC-R12: 480 min (8h) → 480  (exact)', () => {
    expect(roundDuration(480)).toBe(480);
  });

  it('TC-R13: 492 min (8h 12m) → 495 (8h 15m)', () => {
    expect(roundDuration(492)).toBe(495);
  });

});

// ── MIN_DURATION_MINUTES constant ─────────────────────────────────────────────

describe('MIN_DURATION_MINUTES', () => {
  it('equals 10', () => {
    expect(MIN_DURATION_MINUTES).toBe(10);
  });
});

// ── computeRounded ────────────────────────────────────────────────────────────

describe('computeRounded', () => {

  it('TC-R14: actual times are preserved (no floor/ceil on timestamps)', () => {
    const start = '2026-01-01T07:12:00.000Z';
    const stop  = '2026-01-01T08:19:00.000Z';
    const r = computeRounded(start, stop);
    expect(r.rounded_start_time).toBe(start);
    expect(r.rounded_stop_time).toBe(stop);
  });

  it('TC-R15: 1h 07m actual → 1h 00m rounded', () => {
    const r = computeRounded(
      '2026-01-01T08:00:00.000Z',
      '2026-01-01T09:07:00.000Z',
    );
    expect(r.duration_minutes).toBe(67);
    expect(r.rounded_duration_minutes).toBe(60);
  });

  it('TC-R16: 1h 08m actual → 1h 15m rounded', () => {
    const r = computeRounded(
      '2026-01-01T08:00:00.000Z',
      '2026-01-01T09:08:00.000Z',
    );
    expect(r.duration_minutes).toBe(68);
    expect(r.rounded_duration_minutes).toBe(75);
  });

  it('TC-R17: 1h 22m actual → 1h 15m rounded', () => {
    const r = computeRounded(
      '2026-01-01T08:00:00.000Z',
      '2026-01-01T09:22:00.000Z',
    );
    expect(r.duration_minutes).toBe(82);
    expect(r.rounded_duration_minutes).toBe(75);
  });

  it('TC-R18: 1h 23m actual → 1h 30m rounded', () => {
    const r = computeRounded(
      '2026-01-01T08:00:00.000Z',
      '2026-01-01T09:23:00.000Z',
    );
    expect(r.duration_minutes).toBe(83);
    expect(r.rounded_duration_minutes).toBe(90);
  });

  it('TC-R19: exact 15-min increment → no change', () => {
    const r = computeRounded(
      '2026-01-01T08:00:00.000Z',
      '2026-01-01T09:00:00.000Z',
    );
    expect(r.duration_minutes).toBe(60);
    expect(r.rounded_duration_minutes).toBe(60);
  });

  it('TC-R20: 8h 12m actual → 8h 15m rounded', () => {
    const r = computeRounded(
      '2026-01-01T03:10:00.000Z',
      '2026-01-01T11:22:00.000Z',
    );
    expect(r.duration_minutes).toBe(492);
    expect(r.rounded_duration_minutes).toBe(495);
  });

});
