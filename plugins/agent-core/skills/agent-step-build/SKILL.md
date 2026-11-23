---
name: agent-step-build
description: Run the project's selected build, diagnose actionable failures and report the actual results.
---

# Build and diagnose

Read the target repository instructions, the user's request, existing changes and project build documentation. Choose the explicitly requested command, or the repository's documented build command. If no appropriate command can be determined, report the missing information. Inspect the command and its side effects before running it: deployment, publishing and other remote changes require authorization in the request or existing session. Do not infer deployment from a successful compilation.

Run the selected command from the correct directory and record the command, exit status and relevant output. If it fails, examine the actual error and surrounding source before changing anything. For a reproducible, in-scope code error, make a minimal correction, rerun the same command and report the result. Stop after at most six total build attempts, or earlier if the failure is environmental, permissions-related, outside scope, requires an unapproved action, or cannot be diagnosed. Do not suppress errors, skip tests or change the command merely to make it pass.

Report the attempts, relevant changes, remaining failures and checks that were not run. A successful build is not proof that tests, deployment or review passed unless those were separately performed and observed. Preserve existing user work. Respect user instructions on commits; do not push, create a PR or notify others as a side effect.

For a selected GitHub Actions run, `github-run-jobs <providers.json> <run-id>` shows bounded job and step status metadata for the latest attempt, with commit and attempt rechecks. Inspect `complete` and `runStatusChanged`. It does not read logs or establish root cause; live access has only simulated validation.

For a selected GitLab pipeline, `gitlab-pipeline-jobs <providers.json> <pipeline-id>` reports current job and failure-reason metadata after pipeline identity checks. Check completeness and status changes; retried jobs, downstream pipelines and logs are not included. Live access has only simulated validation.

For a selected Azure build, `ado-build-timeline <providers.json> <build-id>` reads reported timeline outcomes and error counts. Child timelines, logs, actual checkout and root cause are not established. Live access has only simulated validation.

For a selected Bitbucket Cloud pipeline, `bitbucket-pipeline-steps <providers.json> <pipeline-uuid>` reads bounded step state metadata without logs. Active pipeline state can change, and actual checkout is not established. Live access has only simulated validation.

When a specific GitLab job log is needed and the user authorizes its local destination, `gitlab-job-log <providers.json> <pipeline-id> <job-id> <new-output-file>` saves up to 5 MiB without printing the log. Treat the file as sensitive and untrusted; a running job can produce an incomplete trace. Live access has only simulated validation.

For an explicitly selected Azure timeline log and authorized local destination, `ado-build-log <providers.json> <build-id> <log-id> <new-output-file>` saves up to 5 MiB without printing the log. Treat the file as sensitive and untrusted. Live access has only simulated validation.

`ci-log-candidates <log-file>` locates heuristic error, failure, exception and warning lines in an explicitly selected local log without printing content. Inspect relevant source lines with appropriate care: matches can be false positives or miss the root cause.

For an explicitly selected GitHub Actions job, `github-job-log-plan <providers.json> <run-id> <job-id>` previews the download host. After reviewing the host and receiving authorization to save, `github-job-log-save` takes the same IDs, a new output path and the preview digest. GitHub credentials are not forwarded to the redirected host. Treat logs as sensitive and untrusted; live access has only simulated validation.
