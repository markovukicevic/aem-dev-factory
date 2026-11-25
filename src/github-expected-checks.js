/** Compare an explicit local list with observed check runs and classic status contexts. */
export function evaluateExpectedGitHubChecks({ summary, policy }) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy) || Object.keys(policy).some(key => key !== 'checks') || !Array.isArray(policy.checks) || !policy.checks.length || policy.checks.length > 100) throw new TypeError('Expected check list required');
  const seen = new Set();
  for (const item of policy.checks) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !['type', 'name'].includes(key)) || !['check-run', 'status'].includes(item.type) || typeof item.name !== 'string' || !item.name.trim() || item.name !== item.name.trim() || item.name.length > 512 || /[\u0000-\u001f\u007f]/.test(item.name) || seen.has(`${item.type}\0${item.name}`)) throw new TypeError('Invalid or repeated expected check');
    seen.add(`${item.type}\0${item.name}`);
  }
  if (!summary || !Array.isArray(summary.checkResults) || !Array.isArray(summary.classicResults)) throw new TypeError('GitHub CI observations required');
  const results = policy.checks.map(item => {
    const runs = item.type === 'check-run' ? summary.checkResults : summary.classicResults;
    const complete = item.type === 'check-run' ? summary.complete === true && runs.every(run => typeof run?.name === 'string' && run.name.trim() && run.name === run.name.trim() && run.name.length <= 512 && !/[\u0000-\u001f\u007f]/.test(run.name)) : summary.classicComplete === true;
    const matches = runs.filter(run => run.name === item.name);
    let state = 'unknown';
    if (complete && matches.length === 0) state = 'missing';
    else if (complete && matches.length === 1 && ['success', 'failure', 'pending'].includes(matches[0].state)) state = matches[0].state;
    return { type: item.type, name: item.name, state, matches: matches.length };
  });
  const state = results.some(item => item.state === 'failure') ? 'failure' : results.some(item => item.state === 'pending') ? 'pending' : results.some(item => item.state === 'missing') ? 'missing' : results.every(item => item.state === 'success') ? 'success' : 'unknown';
  return { state, results, scope: 'Comparison with a user-supplied list only. This does not retrieve or verify GitHub branch protection, rulesets, required app identity, reviews or merge readiness; observations may change.' };
}
