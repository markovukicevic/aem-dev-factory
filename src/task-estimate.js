import { checkTaskPlan, readTaskPlan } from './task-plan.js';
const round = value => Math.round((value + Number.EPSILON) * 1000) / 1000;

/** Summarize explicitly supplied task estimates without inventing missing effort. */
export async function summarizeTaskEstimates({ path, recordPath }) {
  const [before, initial] = await Promise.all([checkTaskPlan({ path, recordPath }), readTaskPlan(recordPath)]);
  const groups = new Map(), unestimated = [];
  let knownHours = 0;
  for (const [index, task] of initial.tasks.entries()) {
    if (!groups.has(task.area)) groups.set(task.area, { area: task.area, tasks: 0, estimated: 0, knownHours: 0 });
    const group = groups.get(task.area); group.tasks++;
    if (task.estimateHours === null) unestimated.push({ index: index + 1, title: task.title, area: task.area });
    else { group.estimated++; group.knownHours += task.estimateHours; knownHours += task.estimateHours; }
  }
  const [after, current] = await Promise.all([checkTaskPlan({ path, recordPath }), readTaskPlan(recordPath)]);
  const stable = initial.digest === current.digest && before.matches && after.matches && before.sourceComplete && after.sourceComplete && JSON.stringify(before.files) === JSON.stringify(after.files);
  const byArea = [...groups.values()].map(item => ({ ...item, knownHours: round(item.knownHours), complete: item.tasks === item.estimated })).sort((a, b) => a.area.localeCompare(b.area));
  return { tasks: initial.tasks.length, estimatedTasks: initial.tasks.length - unestimated.length, knownHours: round(knownHours), totalHours: unestimated.length ? null : round(knownHours), unestimated, byArea, sourceComplete: before.sourceComplete && after.sourceComplete, stable, scope: 'Hours are rounded to three decimal places. Arithmetic over editable supplied estimates only; hours, uncertainty, dependencies, calendar duration and task completeness are not independently verified. Files may change afterward.' };
}
