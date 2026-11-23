---
name: agent-agent-dev
description: Coordinate implementation and verification of an existing ticket plan.
---

# Implement and verify an existing plan

Identify the target repository and ticket spec directory. Read repository instructions, existing changes, requirements, plan and validation evidence. Run `workflow-status <spec-directory>` to inspect declared progress; do not treat file presence or plan statuses as proof of tests or review. Preserve existing files and investigate blocked or interrupted steps before resuming.

Follow `agent-step-all`, then `agent-step-verify` and `agent-req-dod` when appropriate. Execute the user's requested scope and report actual checks and remaining gaps. Respect the user's preferences for tests, commits and push frequency. Do not create a PR, update external tickets or send messages without authorization. This initial workflow does not implement the original automatic dispatch, healing or AI-client orchestration.
