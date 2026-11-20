# Progress

## 2026-11-20

- Started a separate project inspired by the local AEM DevFlow reference at commit `7ecd2a0` (version 1.1.0). The original workflows are not yet implemented here.
- Recorded an initial inventory of its four plugins.
- Added a GitHub Cloud client for reading and creating pull requests and reading pages of comments, check runs, and combined commit status. It is not yet connected to the reference workflow or configuration system.
- Added read-only CLI commands for fetching a pull request and its first page of comments and checks. Verified both against a public `cli/cli` pull request. Added a read-only GitHub issue command and verified it on a public issue. PR creation has only been tested with simulated responses.
- Added an experimental GitHub PR creation flow that checks origin identity, readiness and whether the current commit is already published, with simulated GitHub writes and real local Git fixtures. It does not push, generate descriptions, or prevent concurrent changes after the final checks.
- Readiness base-branch resolution now rejects missing local origin tracking references. This does not verify the current remote state.
- Added GitHub issue context retrieval with paginated comments and an explicit incomplete-result failure. Verified against a public issue; spec generation and attachments remain open.
- Added restricted legacy YAML readiness settings using a proper YAML parser and shell-argument parser; complex shell syntax is rejected, not executed.
- Added base-branch resolution from explicit configuration or the local origin default, plus a JSON-configured readiness CLI. The readiness command can also read `scm.base-branch` and a simple `build.test` command from the original `.ai/config.yaml` format.
- Added an optional test-command runner to readiness inspection. It uses an explicit executable and argument list, then re-reads plan and Git state; it does not discover project configuration or create a PR.
- Added a conservative parser for the reference implementation-plan format and connected it to Git readiness inspection. The test command and base branch are still supplied by the caller; unsupported or ambiguous plan formats are rejected.
- Added a `--page` option for paginated PR context, Git branch/worktree inspection, and preliminary PR readiness checks. The checks use caller-supplied plan and test evidence and are not yet a complete PR flow.
- Linked the new project to its GitHub origin and added a test workflow. The first GitHub Actions run passed on Node 20 and 22; action versions were then updated to address a deprecation warning.
- Most recent observed five-hour quota reset: 2026-11-20 21:27 Europe/Berlin. Scheduled sessions must verify the reset and current usage before starting; limits are shared across the account.

## Next

Expand the reference inventory; expand supported plan formats and expand legacy YAML and test-command compatibility, and broaden branch discovery; design the plugin and provider boundaries; and connect a complete GitHub PR flow. Preserve existing reference behavior as it is recreated.
