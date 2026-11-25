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

/** A pending or active repair may address a blocked parent or a grouped review cycle. */
export function canRunCorrectiveStep(steps, id) {
  if (!Array.isArray(steps) || typeof id !== 'string') return false;
  const numeric = /^([1-9][0-9]*)[a-z](?:[1-9][0-9]*)?$/.exec(id);
  const review = /^(R[1-9][0-9]*)[a-z]$/.exec(id);
  if (!numeric && !review) return false;
  const parent = numeric ? Number(numeric[1]) : review[1];
  if (numeric && !Number.isSafeInteger(parent)) return false;
  const index = steps.findIndex(item => item.number === id), parentIndex = steps.findIndex(item => item.number === parent);
  if (index < 0 || parentIndex < 0 || parentIndex >= index || (numeric ? steps[parentIndex].status !== 'blocked' : !['done', 'blocked'].includes(steps[parentIndex].status))) return false;
  if (steps.some(item => item.status === 'in-progress' && item.number !== id)) return false;
  if (steps.slice(0, index).some(item => item.status === 'pending')) return false;
  if (review) {
    const blocked = steps.filter(item => item.status === 'blocked');
    return blocked.length > 0 && blocked.every(item => typeof item.number === 'string' && /^R[1-9][0-9]*$/.test(item.number) && steps.findIndex(step => step.number === item.number) < index && steps.some(step => step.number === `${item.number}b`));
  }
  return steps.every((item, i) => item.status !== 'blocked' || (i < index && (item.number === parent || isCorrectiveForStep(item.number, parent))));
}
