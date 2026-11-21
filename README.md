# AEM DevFlow Max

A new implementation inspired by AEM DevFlow, aiming to support its development workflows across multiple ticket, source-control and CI providers.

This project is at an early stage. It does not yet provide the original project's plugins, AEM workflows, or end-to-end provider integrations. See [the plan](docs/PLAN.md), [reference inventory](docs/REFERENCE-INVENTORY.md), and [progress record](docs/PROGRESS.md).

## Run tests

Use Node.js 18 or newer:

```sh
npm ci --ignore-scripts
npm run validate:plugins
npm test
```

## Read a GitHub pull request or issue

Set `GITHUB_TOKEN` in your environment using your preferred credential manager. For a private repository the token needs access to that repository and permission to read pull requests or issues, depending on the command. Avoid putting credentials in files committed to Git.

```sh
node bin/aem-devflow.js github-pr OWNER REPOSITORY NUMBER
node bin/aem-devflow.js github-pr-context OWNER REPOSITORY NUMBER
node bin/aem-devflow.js github-pr-context OWNER REPOSITORY NUMBER --page 2
node bin/aem-devflow.js github-issue OWNER REPOSITORY NUMBER
node bin/aem-devflow.js github-issue-context OWNER REPOSITORY NUMBER
```

These read-only commands print pull request or issue JSON; the context command also reads review and conversation comments, check runs, and combined status for the PR head commit. Context includes only the requested page of each paginated response (page 1 by default), clearly marked in its output; the response may contain private repository data. It uses GitHub Cloud's API and does not yet support GitHub Enterprise Server. The underlying client also supports creating a pull request and reading individual pages of review comments, conversation comments, check runs and combined commit status, but PR creation is not exposed through the command or connected to a complete workflow. GitHub paginates comment and check responses; callers must request subsequent pages explicitly.

The issue context command retrieves the issue and comment pages, returning an error instead of silently truncating if its page limit is reached. It rejects pull requests returned by the Issues API and has been read-tested against a public GitHub issue. It does not fetch attachments.

The client is an early component, not a replacement for AEM DevFlow's existing plugins. Real-service coverage so far consists of reading a public pull request, its context, and an issue; other operations have only been tested with simulated responses.

## PR readiness components

The library can read a supported `implement.md` plan and inspect the current Git branch and whether the working tree is clean, then combine that with test results and a caller-provided base branch. An optional inspection runs an explicitly supplied executable and argument list before refreshing the plan and Git state. A separate function can block PR creation when that evidence fails. These functions are building blocks only: a separate experimental GitHub creation flow also checks that the origin matches the chosen repository and that the same branch commit is already published. It does not push the branch, generate a PR description, or provide a complete reference-equivalent workflow. Do not treat caller-supplied evidence as automatically verified.

The plan parser accepts a restricted form of the reference template: numbered `Step N:` headings with one `**Status:**` line per step, and optional simple provenance frontmatter. Unsupported YAML or ambiguous status formats are rejected; it is not a general Markdown or YAML parser.

The optional test runner executes the selected program directly, without a shell; callers must supply its executable and arguments explicitly. It discards captured output and treats a nonzero exit, timeout, or launch failure as a failed check. Tests can have side effects, so use only commands appropriate for the target project.

## Run a readiness check

Create a trusted JSON file, for example `devflow.json`:

```json
{
  "scm": { "baseBranch": "main" },
  "test": { "executable": "npm", "args": ["test"], "timeoutMs": 120000 }
}
```

From the target Git repository, run:

```sh
node /path/to/aem-dev-flow-max/bin/aem-devflow.js readiness /path/to/devflow.json /path/to/implement.md
```

The command runs the configured program, checks the plan and local Git state, and outputs the result as JSON. It exits with 0 when ready and 1 when blocked or an error occurs. It does not create or push a PR. `scm.baseBranch` may be omitted if the local `origin/HEAD` points to an existing remote-tracking branch. An explicitly configured base must also exist as a local `origin` remote-tracking reference. These references can be stale and are not refreshed automatically. The command also accepts the reference project's `.ai/config.yaml`: it reads `scm.base-branch` and `build.test`. Simple test commands and quoted arguments are supported; shell operators, variables, substitutions, and globs are rejected. Other legacy settings are not yet used. JSON configuration remains supported.

The experimental GitHub PR creation command has only been exercised with a simulated GitHub API and local test repositories. It checks readiness, the published branch, commits and actual file changes beyond the locally tracked base, and existing open PRs before making one create request; it does not automatically retry ambiguous failures. Remote branches and local files may still change between checks and creation.

The open-PR and commit checks reduce duplicates and empty PRs but are not atomic with PR creation. The commit comparison uses the local tracking reference for the base branch, which can be stale.

## Create a GitHub pull request (experimental)

From the target repository, after publishing the branch, supply a reviewed description file and token with pull request write access:

```sh
node /path/to/aem-dev-flow-max/bin/aem-devflow.js github-pr-create OWNER REPOSITORY /path/to/config.yaml /path/to/implement.md "PR title" --body-file /path/to/pr-description.md --draft
```

Remove `--draft` for a non-draft PR. This is an explicit GitHub write operation. The command runs the configured tests and checks the plan, Git state, origin identity, published branch, locally tracked base, and existing PRs. It never pushes the branch. It prints a JSON result and does not automatically retry a failed or ambiguous create request. Check GitHub before retrying after a network failure. The existing client and this command have not been tested by creating an actual GitHub PR.

## Export a GitHub issue

```sh
node bin/aem-devflow.js github-issue-export OWNER REPOSITORY NUMBER /path/to/raw-story.md
```

The parent directory must already exist. The command creates a new file and refuses to overwrite one. It includes the original issue description and comments as untrusted source content; it does not infer acceptance criteria, fetch attachments, or implement the other reference `agent-req` phases.

## Independently configured providers

The experimental provider adapters keep tracker, source control, and CI choices separate. A tracker can be used without configuring the others. For example, create a JSON file containing:

```json
{
  "tracker": { "provider": "github", "owner": "my-team", "repository": "issues" },
  "scm": { "provider": "github", "owner": "my-team", "repository": "site" },
  "ci": { "provider": "github-actions", "owner": "my-team", "repository": "site" }
}
```

`node bin/aem-devflow.js tracker-ticket /path/to/providers.json 123` reads the ticket using only the tracker settings. The implemented tracker adapters cover GitHub Issues, Jira Cloud, and read-only Azure DevOps Services work items. SCM adapters cover GitHub, an initial Azure Repos implementation, and read-only Bitbucket Cloud. CI adapters cover GitHub Actions, Bitbucket commit status reads, GitLab CI, and Azure Pipelines builds. Bitbucket Data Center and GitLab self-managed adapters are not implemented; unsupported choices fail rather than falling back. Full ADO/Jira workflows are not implemented yet.

### Jira Cloud tracker

Set `tracker` to `{"provider":"jira","baseUrl":"https://your-team.atlassian.net"}`, and provide `JIRA_EMAIL` and `JIRA_API_TOKEN` through the environment. Then run `tracker-ticket /path/to/providers.json TEAM-123`. This reads an issue and its comments using Jira Cloud REST API v3. Rich text is returned in Atlassian Document Format (ADF), not converted to Markdown. It includes attachment metadata when available but does not update Jira. Pagination is bounded and fails if incomplete. This adapter has only been tested with simulated Jira responses; it has not been tested against a live Jira account.

### Export a tracker issue

`node bin/aem-devflow.js tracker-export /path/to/providers.json TEAM-123 /path/to/raw-story.md` uses the configured tracker and creates a new source file without overwriting an existing one. It also accepts GitHub issue numbers for a GitHub tracker. Jira descriptions and comments remain in ADF JSON, rather than being converted to Markdown; the export lists attachment metadata but does not download attachments. Jira export has only been tested with simulated responses.

### Azure DevOps Services tracker

Set `tracker` to `{"provider":"ado","organization":"my-org","project":"My Project"}` and provide `ADO_PAT` in the environment. `tracker-ticket /path/to/providers.json 123` reads a work item and paginated comments. `tracker-export` writes the fields, relations and comments as untrusted source data, without overwriting an existing file. This initial adapter only supports Azure DevOps Services at `dev.azure.com`; it does not download attachments or write back, and has only been tested with simulated responses.

### Azure Repos SCM

Set `scm` to `{"provider":"ado","organization":"my-org","project":"My Project","repository":"my-repo"}` and provide `ADO_PAT`. `node bin/aem-devflow.js scm-pr /path/to/providers.json 123` reads a pull request. The library adapter can also read threads and submit a PR with explicit refs and optional Azure work-item IDs. The direct library create method does not run readiness checks; an explicit Azure PR command provides a guarded alternative. Azure Repos operations have only been tested with simulated API responses.

### Create an Azure Repos pull request (experimental)

From the target repository, after publishing the branch, supply `ADO_PAT`, a tested config, plan, and reviewed description:

```sh
node /path/to/aem-devflow-max/bin/aem-devflow.js ado-pr-create ORG PROJECT REPO /path/to/config.yaml /path/to/implement.md "PR title" --body-file /path/to/pr-description.md --draft --work-item 123
```

`--draft` and `--work-item` are optional. The command runs readiness checks, verifies the origin, published commit, locally tracked base, and active PRs. It does not push, and it does not automatically retry an ambiguous failure. The checks are not atomic; local references can be stale and branches can change after inspection. Creation is tested with a simulated Azure API and local Git repositories, not a live Azure account.

## Early requirements workflow

`plugins/agent-core/skills/agent-req/SKILL.md` contains an initial five-phase requirements workflow using the tracker commands. `spec-init` creates or selects a unique directory under `.ai/specs/` without overwriting existing work:

```sh
node bin/aem-devflow.js spec-init github-123 "Story title"
node bin/aem-devflow.js spec-init TEAM-123 "Story title"
```

Use `ado-123` for Azure work-item IDs. The skill requires `AEM_DEVFLOW_MAX_HOME` to point to this checkout and a separately prepared provider config. Its instruction file has been structurally validated, but it has not been installed or behaviorally tested in an AI client. It does not yet provide full reference-project parity, attachment handling, or existing-spec updates.

### Read GitHub Actions runs

With a configured `ci` provider and a token with Actions read access, `ci-runs /path/to/providers.json <commit-sha> [--page N]` reads one page of workflow runs for a commit, and `ci-run /path/to/providers.json <run-id>` reads one run. These commands only read; they do not trigger workflows. Individual run retrieval was verified against this project's GitHub repository. `ci-summary /path/to/providers.json <commit-sha>` summarizes up to 1,000 check runs across 10 pages and combined classic statuses. It reports incomplete data and uncertain conclusions conservatively; success applies only to observed results and does not establish that required branch protection checks are satisfied.

### Bitbucket Cloud

Set `scm` to `{"provider":"bitbucket-cloud","workspace":"my-team","repository":"site"}` and provide `BITBUCKET_TOKEN` as a Bitbucket Cloud access token. `scm-pr /path/to/providers.json 123` reads a PR. The library adapter can also read its comment pages, rejecting unexpected next-page URLs and incomplete results. Set `ci` to `{"provider":"bitbucket-pipelines","workspace":"my-team","repository":"site"}` and use `ci-status /path/to/providers.json <commit-sha>` to read the first page of commit statuses. For a complete list use `ci-status-all /path/to/providers.json <commit-sha>`; it follows up to 10 pages and fails if the result is incomplete or a next-page URL is unsafe. Bitbucket Data Center is not supported, and these reads have only been tested with simulated responses.

### Create a Bitbucket Cloud pull request (experimental)

After publishing the branch, provide `BITBUCKET_TOKEN`, a config and plan, and a reviewed description:

```sh
node /path/to/aem-dev-flow-max/bin/aem-devflow.js bitbucket-pr-create WORKSPACE REPO /path/to/config.yaml /path/to/implement.md "PR title" --body-file /path/to/pr-description.md --draft
```

The command checks readiness, origin, published branch, locally tracked base and existing open PRs before a single create request. It does not push or retry a failed write. Checks are not atomic, and local tracking references may be stale. Creation has been tested with local Git repositories and a simulated API, not a live Bitbucket account. The direct library create method does not perform readiness checks.

### GitLab.com

For a GitLab.com project such as `team/subgroup/site`, use `{"provider":"gitlab","project":"team/subgroup/site"}` for the tracker or SCM and `{"provider":"gitlab-ci","project":"team/subgroup/site"}` for CI. Supply `GITLAB_TOKEN`. `tracker-ticket`, `tracker-export`, `scm-pr`, and `ci-status` read issues, export source, read merge requests, and list the first page of commit pipelines respectively. The library can also read paginated merge-request notes and individual pipelines. `ci-status-all /path/to/providers.json <commit-sha>` reads up to 10 pages of GitLab pipelines and fails if the result remains incomplete. GitLab export uses `gitlab-<number>` for `spec-init`. GitLab.com reads have only been tested with simulated responses; self-managed instances are not supported.

### Create a GitLab.com merge request (experimental)

After publishing the branch, provide `GITLAB_TOKEN`, a config and plan, and a reviewed description:

```sh
node /path/to/aem-devflow-max/bin/aem-devflow.js gitlab-mr-create team/subgroup/site /path/to/config.yaml /path/to/implement.md "MR title" --body-file /path/to/description.md --draft
```

The command checks readiness, origin, published branch, locally tracked base and existing open MRs before one create request. It does not push or retry an ambiguous write. Checks are not atomic, and local tracking references may be stale. Creation has been tested with local Git repositories and a simulated API, not a live GitLab account. The direct library create method does not perform readiness checks.

### Initial planning, execution and AEM discovery workflows

The early `agent-core` plugin also includes instruction files for `agent-plan`, `agent-step`, `agent-step-verify`, and `agent-pr`. The initial `aem-tools` plugin includes `aem-component` for local component discovery and optional read-only live inspection. These are first implementations, not feature parity with the original plugins. Their instruction files have been structurally validated, but they have not yet been installed or behaviorally tested in AI clients.

### Plugin packaging

The repository contains an initial Claude Code marketplace manifest for `agent-core-max`, `aem-tools-max`, `agent-hub-max`, and `agent-automation-max`. `npm run validate:plugins` checks the manifest, source paths and skill frontmatter; it does not prove runtime behavior. Claude Code is not installed in the development environment used for this work, so marketplace registration, installation and skill invocation have not been verified. The CLI-based skills also require `AEM_DEVFLOW_MAX_HOME` to point to a checkout with dependencies installed.

### Local AEM component candidates

From an AEM repository, `node /path/to/aem-dev-flow-max/bin/aem-devflow.js aem-components hero` lists matching source directories, observed component definitions, dialogs, and selected files. It searches exact names below directories named `components`, skips common generated directories and symlinks, and fails instead of returning incomplete results when its search limit is exceeded. It does not resolve external models, inspect authored pages, parse dialog fields, or verify runtime behavior. Tested using local synthetic component trees only.

### Inspect a local AEM dialog

`node bin/aem-devflow.js aem-dialog /path/to/_cq_dialog/.content.xml` extracts explicit field names, resource types, labels, descriptions, required flags, and value/default-value attributes. It rejects malformed XML, DTD/entity declarations and files larger than 1 MiB. These are local XML attributes only; inherited fields, authored values and runtime behavior are not checked. Tests use synthetic dialog XML, not a live AEM instance.

### Azure Pipelines builds

Set `ci` to `{"provider":"ado-pipelines","organization":"my-org","project":"My Project"}` and provide `ADO_PAT`. `ado-builds /path/to/providers.json feature/branch` lists one page of builds for that branch; a returned continuation token can be supplied with `--continuation`. `ado-build /path/to/providers.json 123` reads one build. A branch can have builds for multiple commits, so inspect each build's source version before associating it with a change. These operations are read-only and have only been tested with simulated API responses.

### Read multi-repository hub status

From a hub directory with `hub.enabled: true` in `.ai/config.yaml`, `node /path/to/aem-dev-flow-max/bin/aem-devflow.js hub-status [ticket-id]` reads the reference project's `state/<ticket-id>/status.json` files. Missing or invalid entries are reported as incomplete. This does not launch agents, update status, or clean state; a recorded status does not prove a process is still running. Tests use synthetic hub files.

### Read Confluence Cloud documentation

Set `documentation` in `providers.json` to `{"provider":"confluence","baseUrl":"https://your-team.atlassian.net/wiki"}` and supply `CONFLUENCE_EMAIL` and `CONFLUENCE_API_TOKEN`. `confluence-page /path/to/providers.json 123` reads the explicitly selected page in Confluence storage format; it does not follow ticket links or modify content. This initial operation has only been tested with simulated responses.

### Download a Jira attachment

`jira-attachment /path/to/providers.json 123 /path/to/new-file` downloads an explicitly selected attachment using the Jira tracker credentials. The output file must not already exist. The download is limited to 5 MiB, does not follow redirects, and is not automatically decoded or validated as an image; treat the file as untrusted. Metadata can also be retrieved through the Jira tracker library. These operations have only been tested with simulated responses.

### Compare local dialog snapshots

`aem-dialog-snapshot <dialog.xml> <new-output.json>` saves local explicit dialog fields without overwriting. `aem-dialog-compare <before.json> <after.json>` reports added, removed and changed fields by XML path. Snapshot files are limited to 1 MiB. This is not a live AEM snapshot or visual comparison; inherited fields and authored values are outside its scope. Tests use synthetic XML.

### Dispatch a GitHub Actions workflow (experimental)

`ci-dispatch /path/to/providers.json build.yml feature-branch [--inputs-file /path/to/inputs.json]` explicitly requests a `workflow_dispatch` run using the configured GitHub Actions provider. The token needs Actions write permission, and the workflow must support manual dispatch. Inputs are a JSON object; do not put secrets in workflow inputs. An `accepted` result means GitHub accepted the request, not that a run completed or succeeded. The command does not retry; after an ambiguous error, inspect GitHub before trying again. This write operation has only been tested with simulated responses.

### Prepare a PR description

`pr-description <share-plan-or-dash> <explain-or-dash> <implement.md> <verification.md> <new-output.md>` assembles a description from an existing summary, completed plan steps, and supplied verification evidence. Use `-` for an unavailable optional source. The command does not run tests or validate the truth of the supplied evidence; review its output before creating a PR. It refuses to overwrite an existing file.

### Offline GitHub webhook inspection

`webhook-inspect <policy.json> <headers.json> <body.json>` checks the raw body against `GITHUB_WEBHOOK_SECRET` and explicit `allowedRepositories` and `allowedActors` arrays. The headers file has `signature`, `event`, and `deliveryId` fields. Supported events are narrowly classified; no task is executed and no listener is started. This building block does not prevent replay or establish that the event and delivery headers are bound to the signed body, and it is not a production webhook service. The signature implementation is tested against GitHub's published test vector and synthetic deliveries.

`webhook-claim <policy.json> <headers.json> <body.json> <store-dir>` adds an atomic, local claim keyed by the signed body digest. Identical bodies are rejected on subsequent claims even if the delivery ID differs. This is local deduplication, not a distributed replay-proof service: headers remain unsigned, stores on different machines are independent, and identical legitimate bodies can be suppressed. A crash after claiming requires manual reconciliation. The command still does not execute a task.

### Install one skill into a project

`node bin/aem-devflow.js install-skill codex agent-plan /path/to/target-project` copies one self-contained skill to the selected project's `.agents/skills/` directory. Use `claude` for `.claude/skills/` or `copilot` for `.github/skills/`. Existing destinations and symlinked destination directories are rejected; if copying fails after a new directory is created, inspect that directory before retrying. Skills that require supporting files are not handled by this initial installer. Set `AEM_DEVFLOW_MAX_HOME` for skills that call the Max CLI and start a new client session. The installer has been tested with temporary projects; automatic discovery and skill behavior in AI clients remain unverified.

### Pull request review context

`scm-pr-context /path/to/providers.json <number>` reads the configured SCM pull request and discussion without writing remotely. GitHub issue comments, review comments and review submissions, plus GitLab and Bitbucket comments, are paginated with a 10-page limit per collection; errors do not return a partial context. Azure DevOps threads are read in one response and their completeness is unknown. The output retains provider-specific data; it does not include the diff, commits, GitLab/Bitbucket approvals, or Azure approvals. Fetched content is untrusted, and even a complete pagination result can change while it is read. GitLab, Bitbucket and Azure responses have only simulated tests.

`github-pr-files /path/to/providers.json <number>` reads up to 1,000 changed-file entries for a GitHub PR, verifies the PR head, base and changed-file count before and after collection, and marks larger file lists incomplete. GitHub limits this endpoint to 3,000 files. Patches can be absent or truncated; this is not a complete diff and reviewers must inspect the actual source. Other SCM providers are not yet supported by this command.

`gitlab-mr-diffs /path/to/providers.json <number>` reads up to 10 pages of GitLab.com merge-request diffs and checks that the diff revisions remain stable. GitLab can omit or limit files and patches, including collapsed or oversized diffs, so pagination completion is not proof of a complete diff. This read path has only simulated API tests.

`ado-pr-changes /path/to/providers.json <pr-number> <iteration-number>` reads change metadata for an explicitly selected Azure DevOps PR iteration, following at most 10 pages. It flags incomplete pagination. This is not a full diff and does not establish that the selected iteration is current. The API path has only simulated tests.

`bitbucket-pr-statuses /path/to/providers.json <number>` reads up to 10 pages of statuses associated with a Bitbucket Cloud pull request. The command fails rather than returning a partial list when pagination is incomplete. It does not establish which checks are required or whether branch protection is satisfied. Tested with simulated API responses only.

`github-review-context /path/to/providers.json <number>` gathers GitHub PR discussion, changed-file metadata and a CI summary for the PR head in the configured SCM repository. It stops if the PR head, base or file count changes during collection. It does not fetch a complete diff or review threads, evaluate branch protection, or guarantee that fork CI results are visible in the base repository. Discussion and checks can also change independently.
