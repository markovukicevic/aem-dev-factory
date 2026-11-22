---
name: agent-bug-fix
description: Fix a researched bug within scope and record actual checks and remaining uncertainties.
---

# Fix a bug

Read the target repository instructions, source ticket, triage and reproduction evidence when available, relevant code and tests, and existing user changes. Confirm the intended behavior from evidence; distinguish a confirmed cause from a hypothesis. If essential requirements, access, or a safe approach are missing, report the blocker instead of inventing behavior. An unreproduced bug can be investigated, but do not claim reproduction.

Implement a minimal fix within the authorized scope and add or adjust a meaningful regression test when feasible. Run the regression test and other relevant project checks, inspect the full diff and document actual outcomes. Never weaken or skip a check to claim success. If a check or live verification cannot run, report the gap and do not present the bug as verified.

Create `bug-fix.md` in the spec directory without replacing an existing file. Record the change, evidence for the diagnosis, checks and results, remaining risks and follow-up verification. Preserve user changes. Respect the user's commit instructions; do not push, create a PR, change a tracker or send messages as an automatic side effect.
