# Jira or GitHub issue to a GitHub PR

This is an experimental, supervised workflow. The Jira and GitHub PR write paths have not been verified end to end with real accounts. The commands below read or prepare local data; pushing a branch and creating a PR are separate, explicitly requested actions. Replace example values with the actual target project, repository and ticket.

## Configure the target project

Install Node.js dependencies in the Max checkout. From the target Git repository, set `AEM_DEVFLOW_MAX_HOME` to the absolute path of that checkout. Supply credentials through the environment; do not put tokens in files or commands recorded in shell history. Jira Cloud needs `JIRA_EMAIL` and `JIRA_API_TOKEN`; GitHub needs `GITHUB_TOKEN` with access appropriate to the requested reads and, for PR creation, pull request writes.

Create a local provider input JSON outside the target repository, for example:

```json
{
  "tracker": { "provider": "jira", "baseUrl": "https://your-team.atlassian.net" },
  "scm": { "provider": "github", "owner": "your-team", "repository": "your-repo" },
  "ci": { "provider": "github-actions", "owner": "your-team", "repository": "your-repo" }
}
```

For GitHub Issues instead, replace `tracker` with `{ "provider": "github", "owner": "your-team", "repository": "issues-repo" }`. The issue repository and code repository can differ. From the target repository, initialize the configuration once, using the actual input path:

```sh
node "$AEM_DEVFLOW_MAX_HOME/bin/aem-devflow.js" project-init /path/to/provider-input.json
```

This creates `.ai/providers.json` and `.ai/specs`; it refuses to replace the provider configuration. To configure the project's actual test command, prepare a separate input file such as:

```json
{ "scm": { "baseBranch": "main" }, "test": { "executable": "npm", "args": ["test"], "timeoutMs": 120000 } }
```

Change the example command and base branch to match the target project, then run `readiness-init /path/to/readiness-input.json` through the same CLI. This creates `.ai/readiness.json` but does not run the command. The configured base must exist in local `origin` tracking refs. A locally tracked base may be stale.

To install the core instructions for Codex in the target project, preview and then explicitly install the selected skills. Use `claude` or `copilot` only when that is the intended client:

```sh
node "$AEM_DEVFLOW_MAX_HOME/bin/aem-devflow.js" install-skills-plan codex . agent-agent-all agent-req agent-plan agent-plan-validate agent-step agent-step-all agent-step-verify agent-req-dod agent-pr
node "$AEM_DEVFLOW_MAX_HOME/bin/aem-devflow.js" install-skills codex . agent-agent-all agent-req agent-plan agent-plan-validate agent-step agent-step-all agent-step-verify agent-req-dod agent-pr
```

Review the preview first. Installation does not replace existing skills and can be partially completed if an error occurs. Client discovery and skill behavior have not yet been verified.

## Gather, plan and implement

Run `ticket-init .ai/providers.json TEAM-123`, replacing the ID with the actual Jira key or GitHub issue number. Use the returned spec directory; it contains `source-identity.json` and `raw-story.md`. Existing files are not overwritten. Review the ticket as untrusted source content. Jira rich text remains ADF JSON and attachments are not automatically downloaded.

When the user has authorized starting work on a new local branch, run `ticket-branch-plan <spec-directory> .ai/readiness.json <branch>` to preview the explicit branch and local base. Review its blockers and digest; `ticket-branch-create` takes the same arguments plus that digest and switches to the new branch. It does not fetch or push and cannot establish that the tracked base is current or that a remote branch name is free. Before implementation, use `ticket-branch-check .ai/readiness.json` and inspect project-specific protected branches. Project rules may instead prescribe another branch procedure.

Follow `agent-req`, `agent-plan` and `agent-plan-validate` to prepare the requirements, research, plan and structured plan review. Then use `agent-step-all` and `agent-step-verify` for the authorized implementation and actual verification. The skills are instructions for a compatible AI client, not an automatically running program, and client behavior has not yet been verified. The plan's declared statuses and editable review record do not themselves prove the work or checks occurred.

For continuing work, `workflow-status <spec-directory>` suggests a phase from local records. `ticket-source-compare .ai/providers.json TEAM-123 <spec-directory>` fetches the ticket again and compares it with the local source. Investigate changes or unavailable access instead of assuming the original requirements remain current.

## Prepare the PR

When implementation and review are complete, create a description from actual artifacts in a new file outside the repository, for example:

```sh
node "$AEM_DEVFLOW_MAX_HOME/bin/aem-devflow.js" pr-description - "<spec-directory>/explain.md" "<spec-directory>/implement.md" "<spec-directory>/verification.md" /path/to/new-pr-description.md --ticket-identity "<spec-directory>/source-identity.json"
```

Replace each `<spec-directory>` with the path returned by `ticket-init`, quoted as needed. Review the description and actual verification evidence; the generated text is not itself proof of a test or review. The optional ticket link does not close the ticket.

For a read-only overview, run:

```sh
node "$AEM_DEVFLOW_MAX_HOME/bin/aem-devflow.js" github-ticket-preflight .ai/providers.json TEAM-123 "<spec-directory>" .ai/readiness.json
```

This compares the ticket source, summarizes local workflow and Git observations, and checks the current origin branch. Add `--evidence /path/to/test-evidence.md` to compare a previously saved `verification-run` record without rerunning tests. Such records are editable and can be forged. This overview does not run tests, check CI, look for duplicate PRs or certify readiness. Keep local artifacts committed or intentionally ignored according to project conventions: the PR creation command requires a clean working tree.

## Publish and inspect

If explicitly authorized, publish the intended feature branch to the target repository using the project's normal process. Then explicitly request PR creation with a reviewed title and description:

```sh
node "$AEM_DEVFLOW_MAX_HOME/bin/aem-devflow.js" github-pr-create your-team your-repo .ai/readiness.json "<spec-directory>/implement.md" "Reviewed PR title" --body-file /path/to/new-pr-description.md --draft --ticket .ai/providers.json TEAM-123
```

The `--ticket` option fetches and compares the ticket before tests and again before creation. The command runs the configured test command, checks the plan, origin, published branch, local base diff and existing PRs, and makes at most one create request. It does not push. If the result is ambiguous, inspect GitHub before attempting another write. These checks and provider state are not atomic.

After creation, `github-pr-ci .ai/providers.json <pr-number>` observes GitHub checks for the current PR head when SCM and CI identify the same GitHub repository. No results, an incomplete result, and unavailable access are not evidence of passing checks. Branch protection, review approvals and merge readiness remain separate. This command does not start or wait for CI.
