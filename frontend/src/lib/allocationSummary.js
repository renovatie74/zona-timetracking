/**
 * Computes the allocation summary for the "Add / Edit Project Hours" dialog.
 *
 * @param {number}   attendanceMinutes  Today's attendance duration (0 if none recorded)
 * @param {Array}    projectHours       All project-hour entries for today
 * @param {number|null} editingId       ID of the entry being edited, or null when adding
 * @param {number}   selectedMinutes    Duration currently selected in the form
 * @returns {{ attendanceMinutes, alreadyAllocated, currentlyAdding, unallocated, overAllocated, isOver }}
 */
export function allocationSummary(attendanceMinutes, projectHours, editingId, selectedMinutes) {
  const att = attendanceMinutes ?? 0;
  const already = (projectHours ?? [])
    .filter(e => editingId == null || e.id !== editingId)
    .reduce((s, e) => s + (e.hours_minutes ?? 0), 0);
  const adding = selectedMinutes ?? 0;
  const diff = att - already - adding;
  return {
    attendanceMinutes: att,
    alreadyAllocated:  already,
    currentlyAdding:   adding,
    unallocated:       diff >= 0 ? diff : 0,
    overAllocated:     diff <  0 ? -diff : 0,
    isOver:            diff <  0,
  };
}
