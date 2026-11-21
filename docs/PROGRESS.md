# Progress

## 2026-11-21

- Added a read-only local AEM component candidate search and CLI. It finds matching source folders and dialog files using synthetic fixtures; it does not inspect a live AEM instance or resolve all external component files.

- Added an initial Claude Code marketplace manifest and structural plugin validation in CI. Claude Code is not installed here, so registration, installation and real skill behavior remain unverified.

- Added initial planning, single-step execution, verification, PR and AEM component-discovery skill instructions. Structurally validated only; client installation and behavioral validation remain open, and the original plugin functionality is not yet reproduced.

- Added an experimental GitLab.com merge request command with readiness, origin, published branch, duplicate and empty-diff checks. Tested with local Git and a simulated API; no live MR created.

- Added GitLab.com issue, merge-request, notes and pipeline read adapters and source export. Only simulated responses have been tested; live GitLab validation and self-managed GitLab remain open.

- Added an experimental guarded Bitbucket Cloud PR creation command with origin, readiness, published branch, duplicate and empty-diff checks. Tested with local Git and simulated API responses only; no live PR created.

- Added read-only Bitbucket Cloud SCM and commit-status adapters with paginated PR comments, plus SCM and CI commands. Bitbucket API responses are simulated in tests; Data Center and complete status pagination remain open.

- Added GitHub Actions workflow-run reading through the independent CI adapter and CLI. An individual run was read from the project repository; pagination and filtering are also covered by simulated tests. Workflow dispatch remains open.

- Added unique, non-overwriting ticket-directory setup and an initial `agent-req` requirements workflow using the configured tracker. Skill structure is validated; AI-client installation and behavioral testing remain open.

- Added an experimental Azure Repos PR command with readiness, origin, published branch, duplicate-PR and empty-diff checks. It was tested with local Git repositories and a simulated API; no live Azure PR was created.

- Added an Azure Repos SCM adapter for reading PRs and threads and submitting PR requests, plus an SCM read command. These API calls are simulated-test only; the direct create method is not connected to readiness checks and has not created a real PR.

- Added a read-only Azure DevOps Services work-item tracker and source export. It preserves fields, relations and paginated comments, uses a PAT, and has only simulated-response tests. Full Azure Repos workflow integration, work-item write-back and attachments remain open.

- Added provider-configured source-story export for Jira and GitHub. Jira ADF is retained as JSON and existing files are not overwritten. Tested with simulated Jira data; attachments and live Jira verification remain open.

## 2026-11-20

- Started a separate project inspired by the local AEM DevFlow reference at commit `7ecd2a0` (version 1.1.0). The original workflows are not yet implemented here.
- Recorded an initial inventory of its four plugins.
- Added a GitHub Cloud client for reading and creating pull requests and reading pages of comments, check runs, and combined commit status. It is not yet connected to the reference workflow or configuration system.
- Added read-only CLI commands for fetching a pull request and its first page of comments and checks. Verified both against a public `cli/cli` pull request. Added a read-only GitHub issue command and verified it on a public issue. PR creation has only been tested with simulated responses.
- Added independently instantiated tracker, SCM, and CI provider interfaces with GitHub implementations and a read-only Jira Cloud tracker. Jira preserves ADF and has only simulated-response tests; attachments and writes are not implemented. A configured tracker-ticket command was verified against a public GitHub issue; ADO, GitLab, and Bitbucket adapters are not implemented.
- Added issue export into a new raw-story Markdown file without overwriting existing content. Tested the export using a public issue; it does not infer requirements or fetch attachments.
- Added an explicit experimental GitHub PR creation CLI requiring a description file and token. The write path is tested with a simulated API only; it has not created a real PR.
- Added duplicate-open-PR and empty-diff checks to the experimental GitHub PR flow. The diff uses the locally tracked base and may be stale.
- Added an experimental GitHub PR creation flow that checks origin identity, readiness and whether the current commit is already published, with simulated GitHub writes and real local Git fixtures. It does not push, generate descriptions, or prevent concurrent changes after the final checks.
- Readiness base-branch resolution now rejects missing local origin tracking references. This does not verify the current remote state.
- Added GitHub issue context retrieval with paginated comments and an explicit incomplete-result failure. Verified against a public issue; attachments and the rest of the agent-req pipeline remain open.
- Added restricted legacy YAML readiness settings using a proper YAML parser and shell-argument parser; complex shell syntax is rejected, not executed.
- Added base-branch resolution from explicit configuration or the local origin default, plus a JSON-configured readiness CLI. The readiness command can also read `scm.base-branch` and a simple `build.test` command from the original `.ai/config.yaml` format.
- Added an optional test-command runner to readiness inspection. It uses an explicit executable and argument list, then re-reads plan and Git state; it does not discover project configuration or create a PR.
- Added a conservative parser for the reference implementation-plan format and connected it to Git readiness inspection. The test command and base branch are still supplied by the caller; unsupported or ambiguous plan formats are rejected.
- Added a `--page` option for paginated PR context, Git branch/worktree inspection, and preliminary PR readiness checks. The checks use caller-supplied plan and test evidence and are not yet a complete PR flow.
- Linked the new project to its GitHub origin and added a test workflow. The first GitHub Actions run passed on Node 20 and 22; action versions were then updated to address a deprecation warning.
- Most recent observed five-hour quota reset: 2026-11-20 21:27 Europe/Berlin. Scheduled sessions must verify the reset and current usage before starting; limits are shared across the account.

## Next

Expand the reference inventory; expand supported plan formats and expand legacy YAML and test-command compatibility, and broaden branch discovery; design the plugin and provider boundaries; and connect a complete GitHub PR flow. Preserve existing reference behavior as it is recreated.
