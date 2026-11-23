---
name: agent-pr-commit
description: Review and commit explicitly authorized changes, with optional separately requested push or pull request.
---

# Commit changes

Read the target repository instructions and identify the user's requested scope. Use `node "$AEM_DEVFLOW_MAX_HOME/bin/aem-devflow.js" commit-preview` in that repository to inspect the current branch, staged paths, unstaged paths, untracked paths and conflicts. This is a local snapshot, not evidence of authorship or remote state. Inspect the relevant staged and unstaged diffs. If the preview is unstable or conflicts exist, stop and inspect them before acting. Never assume a file belongs to you solely because it appears in a branch diff or status output.

Preserve unrelated work and existing staging. Only stage specific authorized paths after checking their contents; do not use broad staging commands. If the index already contains unrelated changes, do not include them in a commit or reset them. If a file mixes authorized and unrelated changes, stage only reviewed hunks when feasible, otherwise stop and explain. Review the exact staged diff immediately before committing, and perform the checks appropriate to the change. The `security-scan` command can flag a limited set of potential credential patterns; its coverage is incomplete. Do not print secrets. Never claim checks were run or passed unless observed.

Commit only when authorized, with a concise message describing the completed change. Verify the resulting commit and report it with actual validation and any limitations. Do not push unless authorized; do not rebase, amend existing commits, force-push, or discard work as a side effect. If the user also requested a PR, follow `agent-pr` only after the branch is published and the required evidence is available. Avoid inventing work-item IDs and never send messages as a side effect.

This is an initial provider-independent workflow; client discovery and behavior have not been verified.
