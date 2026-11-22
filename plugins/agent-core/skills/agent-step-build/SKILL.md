---
name: agent-step-build
description: Run the project's selected build, diagnose actionable failures and report the actual results.
---

# Build and diagnose

Read the target repository instructions, the user's request, existing changes and project build documentation. Choose the explicitly requested command, or the repository's documented build command. If no appropriate command can be determined, report the missing information. Inspect the command and its side effects before running it: deployment, publishing and other remote changes require authorization in the request or existing session. Do not infer deployment from a successful compilation.

Run the selected command from the correct directory and record the command, exit status and relevant output. If it fails, examine the actual error and surrounding source before changing anything. For a reproducible, in-scope code error, make a minimal correction, rerun the same command and report the result. Stop after at most six total build attempts, or earlier if the failure is environmental, permissions-related, outside scope, requires an unapproved action, or cannot be diagnosed. Do not suppress errors, skip tests or change the command merely to make it pass.

Report the attempts, relevant changes, remaining failures and checks that were not run. A successful build is not proof that tests, deployment or review passed unless those were separately performed and observed. Preserve existing user work. Respect user instructions on commits; do not push, create a PR or notify others as a side effect.
