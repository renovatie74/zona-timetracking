import { describe, it, expect } from 'vitest';
import { allocationSummary } from './allocationSummary.js';

describe('allocationSummary', () => {

  it('AS-01: no existing entries, adding 60 min → unallocated = attendance - 60', () => {
    const r = allocationSummary(450, [], null, 60);
    expect(r.attendanceMinutes).toBe(450);
    expect(r.alreadyAllocated).toBe(0);
    expect(r.currentlyAdding).toBe(60);
    expect(r.unallocated).toBe(390);
    expect(r.isOver).toBe(false);
  });

  it('AS-02: existing entries reduce already-allocated, unallocated adjusts', () => {
    const hours = [{ id: 1, hours_minutes: 180 }, { id: 2, hours_minutes: 120 }];
    const r = allocationSummary(450, hours, null, 60);
    expect(r.alreadyAllocated).toBe(300);
    expect(r.currentlyAdding).toBe(60);
    expect(r.unallocated).toBe(90);
    expect(r.isOver).toBe(false);
  });

  it('AS-03: over-allocation — isOver=true and overAllocated is the excess', () => {
    const hours = [{ id: 1, hours_minutes: 180 }];
    const r = allocationSummary(300, hours, null, 180);
    expect(r.alreadyAllocated).toBe(180);
    expect(r.currentlyAdding).toBe(180);
    expect(r.isOver).toBe(true);
    expect(r.overAllocated).toBe(60);
    expect(r.unallocated).toBe(0);
  });

  it('AS-04: editing an entry — that entry is excluded from alreadyAllocated', () => {
    const hours = [{ id: 1, hours_minutes: 120 }, { id: 2, hours_minutes: 180 }];
    // Editing id=1 (120 min), now selecting 60 min → already = 180, not 300
    const r = allocationSummary(450, hours, 1, 60);
    expect(r.alreadyAllocated).toBe(180);
    expect(r.currentlyAdding).toBe(60);
    expect(r.unallocated).toBe(210);
    expect(r.isOver).toBe(false);
  });

  it('AS-05: editingId=null does not exclude any entry', () => {
    const hours = [{ id: 1, hours_minutes: 120 }, { id: 2, hours_minutes: 60 }];
    const r = allocationSummary(300, hours, null, 60);
    expect(r.alreadyAllocated).toBe(180);
    expect(r.currentlyAdding).toBe(60);
    expect(r.unallocated).toBe(60);
  });

  it('AS-06: exact match — unallocated=0, isOver=false', () => {
    const hours = [{ id: 1, hours_minutes: 360 }];
    const r = allocationSummary(480, hours, null, 120);
    expect(r.unallocated).toBe(0);
    expect(r.overAllocated).toBe(0);
    expect(r.isOver).toBe(false);
  });

  it('AS-07: no attendance (0) — unallocated stays 0, isOver reflects any allocation', () => {
    const r = allocationSummary(0, [], null, 60);
    expect(r.attendanceMinutes).toBe(0);
    expect(r.isOver).toBe(true);
    expect(r.overAllocated).toBe(60);
  });

  it('AS-08: live update — same call with different selectedMinutes reflects new value', () => {
    const hours = [{ id: 1, hours_minutes: 120 }];
    const r60  = allocationSummary(480, hours, null, 60);
    const r120 = allocationSummary(480, hours, null, 120);
    const r420 = allocationSummary(480, hours, null, 420);
    expect(r60.unallocated).toBe(300);
    expect(r120.unallocated).toBe(240);
    // already=120, adding=420 → total=540 → over by 60
    expect(r420.isOver).toBe(true);
    expect(r420.overAllocated).toBe(60);
  });

  it('AS-09: editing preserves correct remaining even when old value was large', () => {
    // employee had logged 420 min on one entry; editing it to 60 min
    const hours = [{ id: 5, hours_minutes: 420 }, { id: 6, hours_minutes: 30 }];
    const r = allocationSummary(480, hours, 5, 60);
    expect(r.alreadyAllocated).toBe(30);  // only id=6 counts
    expect(r.currentlyAdding).toBe(60);
    expect(r.unallocated).toBe(390);
    expect(r.isOver).toBe(false);
  });

});
