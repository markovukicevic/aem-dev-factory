---
name: agent-bug-all
description: Carry a bug through triage, reproduction, a scoped fix and verification with explicit evidence.
---

# Bug workflow

Identify the requested ticket and target repository, then read its instructions and existing spec artifacts. Follow `agent-bug-triage`, `agent-bug-verify` for reproduction, `agent-bug-fix`, and `agent-bug-verify` for post-fix verification in order. Existing artifacts must be inspected for source identity, scope and freshness; their presence alone does not establish success. Preserve existing files and user changes. Report collisions rather than overwriting prior reports.

Proceed when the evidence and user authorization support the next phase. If reproduction is blocked or not reproduced, distinguish that result from confirmation and investigate within the available scope; stop if the intended behavior or a safe fix cannot be determined. If a required post-fix check fails or cannot run, report the bug as unverified with the precise blocker. Separate observed behavior, test results and root-cause hypotheses throughout.

Summarize changes, verification, unresolved gaps and any work that requires a live environment. Respect the user's commit and push instructions; do not post tracker comments, create or merge a PR, deploy or send messages as an automatic side effect. This initial workflow does not implement the original's browser automation, automatic tracker updates or client-specific orchestration.
