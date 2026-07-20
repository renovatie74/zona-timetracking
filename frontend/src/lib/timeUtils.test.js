import { describe, it, expect } from 'vitest';
import { minsFromTime, timeFromMins, stepTime } from './timeUtils.js';

// ── minsFromTime ──────────────────────────────────────────────────────────────

describe('minsFromTime', () => {
  it('AT-01: parses a chip start time correctly', () => {
    expect(minsFromTime('08:00')).toBe(480);
  });

  it('AT-02: parses a chip finish time correctly', () => {
    expect(minsFromTime('16:30')).toBe(990);
  });

  it('AT-03: returns null for empty string (no selection)', () => {
    expect(minsFromTime('')).toBeNull();
  });

  it('AT-04: parses 00:00 as 0 (lower boundary)', () => {
    expect(minsFromTime('00:00')).toBe(0);
  });

  it('AT-05: parses 23:45 as 1425 (upper boundary)', () => {
    expect(minsFromTime('23:45')).toBe(1425);
  });
});

// ── timeFromMins ──────────────────────────────────────────────────────────────

describe('timeFromMins', () => {
  it('AT-06: converts minutes back to HH:MM chip value', () => {
    expect(timeFromMins(480)).toBe('08:00');
    expect(timeFromMins(990)).toBe('16:30');
  });

  it('AT-07: clamps below 0 to 00:00', () => {
    expect(timeFromMins(-15)).toBe('00:00');
  });

  it('AT-08: clamps above 1425 to 23:45', () => {
    expect(timeFromMins(1440)).toBe('23:45');
  });
});

// ── stepTime ──────────────────────────────────────────────────────────────────

describe('stepTime', () => {
  it('AT-09: [+] increments by 15 minutes', () => {
    expect(stepTime('08:00', 15)).toBe('08:15');
  });

  it('AT-10: [-] decrements by 15 minutes', () => {
    expect(stepTime('08:00', -15)).toBe('07:45');
  });

  it('AT-11: cannot go below 00:00', () => {
    expect(stepTime('00:00', -15)).toBe('00:00');
  });

  it('AT-12: cannot go above 23:45', () => {
    expect(stepTime('23:45', 15)).toBe('23:45');
  });
});

// ── Finish-after-Start validation ─────────────────────────────────────────────

describe('finish-after-start validation', () => {
  function isFinishAfterStart(start, finish) {
    const s = minsFromTime(start);
    const f = minsFromTime(finish);
    return s !== null && f !== null && f > s;
  }

  it('AT-13: finish later than start is valid', () => {
    expect(isFinishAfterStart('08:00', '16:00')).toBe(true);
  });

  it('AT-14: finish equal to start is invalid', () => {
    expect(isFinishAfterStart('08:00', '08:00')).toBe(false);
  });

  it('AT-15: finish earlier than start is invalid', () => {
    expect(isFinishAfterStart('16:00', '08:00')).toBe(false);
  });

  it('AT-16: empty start blocks save (null check)', () => {
    expect(isFinishAfterStart('', '16:00')).toBe(false);
  });
});
