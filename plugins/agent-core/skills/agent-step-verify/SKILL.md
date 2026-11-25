---
name: agent-step-verify
description: Verify a completed implementation plan before a pull request, using actual project checks and review evidence.
---

# Verify completed work

Read the target repository instructions, `implement.md`, requirements, research, configured build and test commands, and the full change diff. Stop if any plan step is not `done`. Set `provenance.verified` to `false` before starting when it exists.

Run the applicable project build, lint, tests, and security or secret checks required by the repository. The explicit `verification-run <config> <implement.md> <test-evidence.md>` command can run the configured test command and record its actual result without exposing output or marking the plan verified. The read-only `verification-check <config> <implement.md> <test-evidence.md>` compares that record with the current plan, configuration, Git state and any recorded local requirements context and ticket identity. Older records can lack source binding. Store evidence outside the repository or in an ignored location to keep the working tree clean. A matching record is editable and is not proof that tests ran; treat it only as a consistency check and evidence for the checks actually observed. Review the change against the ticket, architecture rules, and tests. Record the actual commands, outcomes, review findings and any checks that could not be run in a new `verification.md` in the ticket spec directory. If that file exists, preserve it unless the user requests an update. Missing required tools, failed checks, unresolved review findings, or unverified acceptance criteria block verification; do not infer success from a lack of output.

Only when every required check passes and the actual review supports the change may `provenance.verified` be changed to `true`. Preserve all other frontmatter and plan content. If the plan has no provenance, report that it is a legacy plan; do not silently claim a provenance verification. Report the evidence and remaining risks to the user. Do not push, create a PR, or send messages as a side effect.

For applicable frontend work, consult `$AEM_DEVFLOW_MAX_HOME/plugins/agent-core/shared/accessibility-checklist.md`; distinguish observations from items not checked. Follow the user’s instructions about running checks.
