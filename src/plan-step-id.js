/** Keep existing numeric step IDs numeric; retain reference-style corrective IDs as strings. */
export function normalizePlanStepId(value) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('Invalid plan step ID');
    return value;
  }
  if (typeof value !== 'string' || value.length > 32 || !/^(?:[1-9][0-9]*(?:[a-z](?:[1-9][0-9]*)?)?|R[1-9][0-9]*[a-z]?)$/.test(value)) throw new TypeError('Invalid plan step ID');
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
  const match = /^([1-9][0-9]*)[a-z](?:[1-9][0-9]*)?$/.exec(value);
  return !!match && match[1] === String(parent);
}

/** A pending or active repair may address one blocked numeric parent and prior repairs. */
export function canRunCorrectiveStep(steps, id) {
  if (!Array.isArray(steps) || typeof id !== 'string') return false;
  const match = /^([1-9][0-9]*)[a-z](?:[1-9][0-9]*)?$/.exec(id);
  if (!match) return false;
  const parent = Number(match[1]);
  if (!Number.isSafeInteger(parent)) return false;
  const index = steps.findIndex(item => item.number === id), parentIndex = steps.findIndex(item => item.number === parent);
  if (index < 0 || parentIndex < 0 || parentIndex >= index || steps[parentIndex].status !== 'blocked') return false;
  if (steps.some(item => item.status === 'in-progress' && item.number !== id)) return false;
  if (steps.slice(0, index).some(item => item.status === 'pending')) return false;
  return steps.every((item, i) => item.status !== 'blocked' || (i < index && (item.number === parent || isCorrectiveForStep(item.number, parent))));
}
