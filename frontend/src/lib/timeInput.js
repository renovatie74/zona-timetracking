/**
 * Time input utilities for HH:MM manual entry fields.
 * 24-hour format, 15-minute steps only.
 */

const VALID_MINUTES = [0, 15, 30, 45];
const TIME_RE = /^\d{2}:\d{2}$/;

export function validateTime(val) {
  if (!val || val.trim() === '') return 'Required';
  if (!TIME_RE.test(val)) return 'Use 24-hour time in 15-minute steps, for example 08:30.';
  const [h, m] = val.split(':').map(Number);
  if (h < 0 || h > 23) return 'Use 24-hour time in 15-minute steps, for example 08:30.';
  if (!VALID_MINUTES.includes(m)) return 'Use 24-hour time in 15-minute steps, for example 08:30.';
  return null;
}

export function stepTime(hhmm, delta) {
  if (!TIME_RE.test(hhmm)) return hhmm;
  const [h, m] = hhmm.split(':').map(Number);
  let total = h * 60 + m + delta;
  total = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function roundingPreview(startHHMM, endHHMM) {
  if (!startHHMM || !endHHMM) return null;
  if (validateTime(startHHMM) || validateTime(endHHMM)) return null;
  const [sh, sm] = startHHMM.split(':').map(Number);
  const [eh, em] = endHHMM.split(':').map(Number);
  const startMins = sh * 60 + sm;
  const endMins   = eh * 60 + em;
  if (endMins <= startMins) return null;
  const roundedStart = Math.floor(startMins / 15) * 15;
  const roundedEnd   = Math.ceil(endMins   / 15) * 15;
  return {
    actual:  endMins - startMins,
    rounded: roundedEnd - roundedStart,
  };
}
