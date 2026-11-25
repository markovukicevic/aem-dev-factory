/** Keep existing numeric step IDs numeric; retain reference-style corrective IDs as strings. */
export function normalizePlanStepId(value) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('Invalid plan step ID');
    return value;
  }
  if (typeof value !== 'string' || value.length > 32 || !/^(?:[1-9][0-9]*[a-z]?|R[1-9][0-9]*)$/.test(value)) throw new TypeError('Invalid plan step ID');
  if (/^[1-9][0-9]*$/.test(value)) {
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw new TypeError('Invalid plan step ID');
    return number;
  }
  return value;
}

export function isPlanStepId(value) {
  try { return normalizePlanStepId(value) === value; } catch { return false; }
}

/** Identify a reference-style corrective step for one numbered parent. */
export function isCorrectiveForStep(value, parent) {
  if (typeof value !== 'string' || !Number.isSafeInteger(parent) || parent < 1) return false;
  const match = /^([1-9][0-9]*)[a-z]$/.exec(value);
  return !!match && match[1] === String(parent);
}
