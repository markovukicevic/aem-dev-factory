---
name: auto-status
description: Inspect local GitHub webhook automation policy and claim metadata without modifying state.
---

# Inspect local automation

Identify the target project and read its instructions. Run `automation-status <target-project>` using the Max CLI. Report whether the local policy is structurally valid, whether the webhook secret environment variable is present, and the observed local claim counts and any unreadable records. A missing claim directory can mean no events have been recorded. Never display secret values or infer that a secret is valid from its presence.

A claim records accepted payload metadata, not work completion. This command does not check whether a listener is running, whether GitHub delivered events, or AWS queues, budgets, pipelines, alarms or cloud infrastructure. Do not label the automation healthy or deployed from local state alone. Do not start processes, modify files, query cloud services or send messages as a side effect. This initial skill does not reproduce the original AWS dashboard; AI-client behavior is unverified.
