---
name: agent-sync
description: Inspect skill differences across explicitly selected consumer projects before synchronizing them.
---

# Inspect consumer projects

Identify the explicitly selected target projects, client and skills. Read each project's instructions, check its current changes, and use `skill-compare <codex|claude|copilot> <target-project> <skill>` to report local differences. If a hub configuration is available, `hub-repos` and `hub-select` can help identify configured paths, but do not assume every configured repository should be changed. Do not infer that a matching skill filename proves client discovery or equivalent behavior.

Present source and destination differences, project-specific customizations and any inaccessible projects. For an explicitly authorized synchronization, follow each repository's instructions and preserve unrelated work; do not silently replace custom files. The current installer only creates new skill destinations and cannot merge existing changes. Do not merge branches, commit, push, create PRs, deploy or send messages as a side effect of inspection. The reference project's automated multi-repository sync and publication are not reproduced by this initial workflow.
