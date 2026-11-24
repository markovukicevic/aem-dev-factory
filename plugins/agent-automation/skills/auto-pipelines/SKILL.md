---
name: auto-pipelines
description: Inspect and explicitly request configured GitHub, GitLab, Bitbucket or Azure CI pipeline runs.
---

# Request an explicit pipeline run

Use this workflow only when the user asks to start a particular pipeline. Identify the target repository, configured CI provider, branch, and exact workflow or custom-pipeline name where applicable. Read the repository instructions and pipeline definition. Confirm the selected pipeline's actual effects with the user when required by their instructions; a pipeline can deploy or modify external resources. Do not infer that a webhook event authorizes a pipeline run. Credentials stay in environment variables and must never be printed.

For Azure use `ado-pipeline-dispatch <providers.json> <definition-id> <branch> [--commit <sha>]`; for GitHub use `ci-dispatch <providers.json> <workflow> <ref>`; for GitLab use `gitlab-pipeline-dispatch <providers.json> <branch>`; for Bitbucket Cloud use `bitbucket-pipeline-dispatch <providers.json> <branch> <custom-pipeline>`. These commands issue a single explicit request; an accepted response is not evidence the run completed, and the branch may change. If a request fails ambiguously, inspect the provider before any retry to avoid duplicate runs. The Azure, GitLab and Bitbucket paths have only simulated-response validation and no live run. No variables or secret values are passed by those commands.

When asked, use `gitlab-pipeline-status <providers.json> <id>`, `bitbucket-pipeline-status <providers.json> <uuid>` or `ado-pipeline-status <providers.json> <build-id>` to inspect a selected run, then report its observed status and limitations. Do not create pipeline definitions, change settings, register webhooks, deploy or send messages as a side effect. The original Azure pipeline-definition import and variable-configuration workflow is not reproduced here; AI-client behavior remains unverified.

For an explicitly requested retry of failed GitHub Actions or GitLab CI jobs, inspect the pipeline definition and use `ci-retry-plan <providers.json> <run-id>` followed by `ci-retry-apply` with its digest. Dependent or deployment-capable jobs may run. An acknowledgment is not completion; inspect the provider before retrying an unclear result. Live behavior has only simulated validation.

Only for an explicitly requested cancellation of a selected active GitHub or GitLab run, use `ci-cancel-plan <providers.json> <run-id>` and then `ci-cancel-apply` with its digest. Cancellation may interrupt deployments and cannot undo prior effects. Provider acknowledgment is not proof of completion; live behavior has only simulated validation.

For a separately requested GitHub Actions integration, `github-actions-template-plan <config.json>` previews a workflow using explicit actor names, a fixed repository-relative JavaScript entrypoint and Node version. `github-actions-template-save <config.json> <preview-sha256> <output.yml>` creates a new local file; it does not register or publish the workflow. Review the complete workflow, mutable action tags, the required npm lockfile, dependency installation, token permissions, selected script, event handling and repository policy before use. GitHub Actions concurrency is not durable deduplication, and comments may change after the event. No live GitHub workflow has been verified.
