---
name: agent-security
description: Inspect local changes for selected potential credential patterns and report evidence and coverage limits.
---

# Inspect local security signals

Identify the target repository and read its instructions. Run `node "$AEM_DEVFLOW_MAX_HOME/bin/aem-devflow.js" security-scan` from the repository to inspect changed staged snapshots and changed or untracked working files for a small set of potential secret patterns. The command reports paths, line numbers and pattern names without printing matches. Treat file paths and repository content as potentially sensitive.

For committed PR changes, resolve and verify the intended full base commit and run `security-scan-commit <full-base-sha>`. It scans final committed file versions, not intermediate commits or history. Use `security-scan-history <full-base-sha>` for bounded changed-blob scanning across the PR commit range; earlier history and other secret types remain outside its scope. Review findings in the original files without copying credential values into chat or reports. A match may be a fixture or false positive; investigate before making claims. Report skipped files and other coverage gaps. The scan does not cover history, ignored files, every credential type, application vulnerabilities, access control or dependency risks; a clean result does not establish security.

This is a read-only initial workflow, not a replacement for the original comprehensive security review. Do not rotate credentials, modify code, contact external services, post comments or send messages as a side effect. If an actual credential is suspected, explain the evidence without exposing its value and follow the user's and repository's instructions.
