---
name: agent-hub-status
description: Inspect existing multi-repository hub dispatch status without launching or changing work.
---

# Read hub status

Run from the intended hub directory after reading its repository instructions. The hub must have `hub.enabled: true` in `.ai/config.yaml`. If the target hub is unclear, ask for it rather than guessing.

Use `node "$AEM_DEVFLOW_MAX_HOME/bin/aem-devflow.js" hub-status` to inspect existing dispatches, or add a ticket ID to narrow the result. The CLI reads the reference `state/<ticket-id>/status.json` format and returns a completeness flag and errors. Report any missing or invalid files instead of presenting a partial result as complete.

Summarize each ticket, repository and reported state. For local-command tasks, inspect the recorded process state, starting commit, exit code and observed ending Git state when available. An unavailable or detached ending state is unknown. A status file is a report from a previous process, not proof that a process is still running or a task is verified. Do not launch agents, change status files, clean up directories, or send messages in this read-only workflow. The local runner does not reproduce the original hub agent-dispatch system.
