# Launch and handoff checklist

Use the original project's launch domains as a review guide. Adapt them to the change and the user's authorized scope. Record each applicable item as observed, failed, not applicable or not checked; do not infer deployment readiness from a completed checklist.

- **Code quality:** review the change and relevant build, lint and test results when available; report any unrun checks and outstanding issues.
- **Security:** consider secrets, input handling, authorization, dependencies and error disclosure where applicable. A clean source review alone does not establish that history or dependencies are clean.
- **Performance and accessibility:** assess applicable budgets, rendering, images, keyboard access, labels and focus. Use the shared accessibility checklist and report how observations were obtained.
- **Operations:** document configuration, migrations, monitoring and rollback needs relevant to the change. A health response alone does not establish application readiness.
- **Documentation:** update user-facing and operational guidance when behavior or setup changes.
- **Feature flags and rollout:** if used, identify an owner, removal plan, monitoring signals and project-approved thresholds. Hold or roll back according to the actual operational plan; do not invent baselines or claim a rollout occurred.

Check live systems, deploy, change flags or publish only within the user's authorization. If those actions are deferred, identify them as unverified handoff items.
