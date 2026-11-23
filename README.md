# AEM DevFlow Max

A new implementation inspired by AEM DevFlow, aiming to support its development workflows across multiple ticket, source-control and CI providers.

This project is at an early stage. Its initial plugins and workflows do not yet match the original project's functionality, and end-to-end provider integrations remain incomplete. See [the plan](docs/PLAN.md), [reference inventory](docs/REFERENCE-INVENTORY.md), and [progress record](docs/PROGRESS.md).

Run `node bin/aem-devflow.js --help` for command syntax and `node bin/aem-devflow.js list-skills` for bundled skills.

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

These read-only commands print pull request or issue JSON; the context command also reads review and conversation comments, check runs, and combined status for the PR head commit. Context includes only the requested page of each paginated response (page 1 by default), clearly marked in its output; the response may contain private repository data. It uses GitHub Cloud's API and does not yet support GitHub Enterprise Server. Experimental guarded PR creation commands are available separately; review their documented limitations before use. GitHub paginates comment and check responses; callers must request subsequent pages explicitly.

The issue context command retrieves the issue and comment pages, returning an error instead of silently truncating if its page limit is reached. It rejects pull requests returned by the Issues API and has been read-tested against a public GitHub issue. It does not fetch attachments.

The client is an early component, not a replacement for AEM DevFlow's existing plugins. Real-service coverage includes selected public GitHub issue and pull-request reads, ticket initialization, review context and Actions reads. Other providers and write operations have primarily been tested with simulated responses.

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

The command checks that the plan, branch and commit remain stable and the worktree starts and ends clean around the configured test program, then outputs the result as JSON. The PR creation flows also reject a plan or normalized readiness configuration that changed after the test run. Readiness, publication and the local tracked base diff are rechecked after duplicate-PR lookup, but transient changes during a test and races after final checks cannot be ruled out. It exits with 0 when ready and 1 when blocked or an error occurs. It does not create or push a PR. `scm.baseBranch` may be omitted if the local `origin/HEAD` points to an existing remote-tracking branch. An explicitly configured base must also exist as a local `origin` remote-tracking reference. These references can be stale and are not refreshed automatically. The command also accepts the reference project's `.ai/config.yaml`: it reads `scm.base-branch` and `build.test`. Simple test commands and quoted arguments are supported; shell operators, variables, substitutions, and globs are rejected. Other legacy settings are not yet used. JSON configuration remains supported.

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

`node bin/aem-devflow.js tracker-ticket /path/to/providers.json 123` reads the ticket using only the tracker settings. Tracker adapters cover GitHub Issues, GitLab.com issues, Jira Cloud, and Azure DevOps Services work items. SCM adapters cover GitHub, Azure Repos, GitLab.com and Bitbucket Cloud, including experimental guarded PR or MR creation. CI adapters cover GitHub Actions, Bitbucket commit status reads, GitLab CI, and Azure Pipelines builds. Bitbucket Data Center and GitLab self-managed adapters are not implemented; unsupported choices fail rather than falling back. Full provider workflows are not implemented yet. Bitbucket Cloud removed its native issue-tracker API in August 2026; configure a supported external tracker such as Jira instead.

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

With a configured `ci` provider and a token with Actions read access, `ci-runs /path/to/providers.json <commit-sha> [--page N]` reads one page of workflow runs for a commit, and `ci-run /path/to/providers.json <run-id>` reads one run. These commands only read; they do not trigger workflows. Individual run retrieval was verified against this project's GitHub repository. `ci-summary /path/to/providers.json <commit-sha>` summarizes up to 1,000 check runs across 10 pages and combined classic statuses. It includes individual observed check results and reports incomplete data and uncertain conclusions conservatively; success applies only to observed results and does not establish that required branch protection checks are satisfied.

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

`axe-run <project-directory> <config.json> <output.json>` explicitly scans one HTTP(S) page using the target project's installed `playwright` and `axe-core` packages and Chromium browser. Example configuration: `{ "url": "http://localhost:4502/content/site/en.html", "allowOrigins": [], "timeoutMs": 30000, "axeTags": ["wcag2a", "wcag2aa"] }`. The optional `waitForSelector` waits for a specific element. URLs with credentials, query strings or fragments are rejected. The browser permits GET/HEAD requests to explicitly allowed origins and reports blocked requests; dynamic pages, redirects, websocket traffic and page behavior can still affect results. No login is performed. Raw output may contain sensitive DOM data and selectors; it is written once with restricted permissions. The command has only been checked using a simulated browser and has not been validated against live AEM. Do not install browser dependencies or run this against an environment without authorization.

`axe-summary <result.json>` and `axe-report <result.json> <output.md>` summarize supplied axe-core JSON without DOM snippets or URL query strings. `axe-compare <before.json> <after.json>` compares rule/selector observations; changes are candidates, not proof of fixes. Incomplete results need manual review. No command runs a browser or proves accessibility conformance. See the [axe-core API](https://github.com/dequelabs/axe-core/blob/develop/doc/API.md). Selectors and page paths may still be sensitive.

`node bin/aem-devflow.js aem-dialog /path/to/_cq_dialog/.content.xml` extracts explicit field names, resource types, labels, descriptions, required flags, and value/default-value attributes. It rejects malformed XML, DTD/entity declarations and files larger than 1 MiB. These are local XML attributes only; inherited fields, authored values and runtime behavior are not checked. Tests use synthetic dialog XML, not a live AEM instance.

### Azure Pipelines builds

Set `ci` to `{"provider":"ado-pipelines","organization":"my-org","project":"My Project"}` and provide `ADO_PAT`. `ado-builds /path/to/providers.json feature/branch` lists one page of builds for that branch; a returned continuation token can be supplied with `--continuation`. `ado-build /path/to/providers.json 123` reads one build. A branch can have builds for multiple commits, so inspect each build's source version before associating it with a change. These operations are read-only and have only been tested with simulated API responses.

### Read multi-repository hub status

From a hub directory with `hub.enabled: true` in `.ai/config.yaml`, `node /path/to/aem-dev-flow-max/bin/aem-devflow.js hub-status [ticket-id]` reads the reference project's `state/<ticket-id>/status.json` files. Missing or invalid entries are reported as incomplete. This does not launch agents, update status, or clean state; a recorded status does not prove a process is still running. Tests use synthetic hub files.

### Read Confluence Cloud documentation

Set `documentation` in `providers.json` to `{"provider":"confluence","baseUrl":"https://your-team.atlassian.net/wiki"}` and supply `CONFLUENCE_EMAIL` and `CONFLUENCE_API_TOKEN`. `confluence-page /path/to/providers.json 123` reads the explicitly selected page in Confluence storage format; it does not follow ticket links or modify content. This initial operation has only been tested with simulated responses.

### Download a Jira attachment

`jira-attachment-plan <providers.json> <issue-key> <directory> <id> [id ...]` previews selected Jira issue attachments, their reported sizes and current destination collisions without downloading or writing files. A passing preview does not guarantee access or unchanged state during a later download.

`confluence-search <providers.json> <cql>` reads the first page of up to 25 results for an explicit Confluence query; completeness is unknown. `confluence-search-all <providers.json> <cql>` follows validated same-site pagination up to 10 pages and reports whether pagination ended. Permissions and server-side omissions are not verified. `confluence-export <providers.json> <page-id> <output.md>` saves an explicitly selected page and its storage markup to a new local file. `confluence-export-many <providers.json> <directory> <id> [id ...]` exports up to 25 explicitly selected pages into an existing directory as `<id>.md` after collision preflight; partial results are retained and reported. `confluence-export-check-many <providers.json> <directory> <id> [id ...]` checks selected ID-named exports and reports missing or unavailable pages individually. `confluence-export-check <providers.json> <output.md>` compares the saved site, content, title and version with the current page; records created before site identity was added cannot be checked. A match does not authenticate an editable file or cover later changes. Source content is untrusted, potentially private and not rendered. These operations use separate Confluence credentials and have not been verified against a live Confluence account. Search follows the [Confluence Cloud REST API](https://developer.atlassian.com/cloud/confluence/rest/v1/api-group-content/).

`jira-ticket-evidence <providers.json> <issue-key> <directory> <manifest.json> <id> [id ...]` checks that Jira reports the selected IDs on the issue, saves the attachments, verifies that local bytes still match the downloaded-byte hashes, and creates a local hash manifest labelled with the configured Jira site and issue. Existing destinations are preserved. If a download or manifest creation fails, saved files are retained and reported. Source labels and hashes are editable and do not authenticate content or establish safety.

`jira-attachment-manifest <directory> <output.json> <id> [id ...]` records SHA-256 and size for selected local `<id>.bin` files without overwriting; `jira-attachment-check <directory> <manifest.json>` detects missing, changed or unsafe files. Hash comparisons do not establish Jira provenance, file safety or manifest authenticity, and concurrent changes remain possible.

`jira-ticket-attachments <providers.json> <issue-key> <directory> <id> [id ...]` first verifies that Jira reports each explicitly selected ID on that issue, then uses the same non-overwriting batch download. Membership reflects the fetched issue and can change later. No files are downloaded if a selected ID is absent.

`jira-attachments <providers.json> <directory> <id> [id ...]` downloads up to 50 explicitly selected Jira attachments into an existing directory as `<id>.bin`, after checking all destinations for collisions. It stops on failure and reports saved files without rollback; a size mismatch is reported but does not validate the content. Each download is limited to 5 MiB. Provider filenames and bytes are untrusted, directory changes can race with the check, and live Jira behavior remains unverified.

`jira-attachment /path/to/providers.json 123 /path/to/new-file` downloads an explicitly selected attachment using the Jira tracker credentials. The output file must not already exist. The download is limited to 5 MiB, does not follow redirects, and checks unencoded response length when supplied. It is not automatically decoded or validated as an image; treat the file as untrusted. Metadata can also be retrieved through the Jira tracker library. These operations have only been tested with simulated responses.

### Compare local dialog snapshots

`aem-knowledge-status <target-project>` reports known local project knowledge files; `aem-knowledge-search <target-project> <query>` returns case-insensitive literal match locations without printing source text. Missing, unsafe and unsupported files are reported. These commands do not establish source freshness, content correctness or live AEM behavior.

`aem-refresh-plan <source-directory> <target-project>` previews supported local project knowledge files and destination collisions. `aem-refresh-compare <source-directory> <target-project>` compares existing local bytes and identifies new or changed candidates without updating them; `aem-refresh-comparison <source-directory> <target-project> <output.md>` saves a new local report. `aem-refresh-import` copies only available, explicitly mapped inputs to new `.ai/project` files after preflight, preserving existing work and reporting partial failures. The source directory contains `components/component-index.md`, `project.yaml`, `file-patterns.yaml`, `architecture.md`, `features.md`, and optionally `content-paths.yaml`. `aem-refresh-stage <source-directory> <target-project> <new-staging-directory>` creates a separate staging directory with copies and a byte-comparison report without modifying the target project. Partial staging is retained on failure. This initial workflow does not overwrite existing knowledge, fetch remote documentation, or validate source contents.

`aem-project-inspect <directory>` lists bounded local directory-name candidates for JCR, components, content, frontend, client libraries and OSGi; these markers do not establish project or runtime correctness. `aem-project-init <input.json>` creates `.ai/aem.json` from explicit existing project-relative `componentRoots` and `contentRoots` arrays plus an optional non-secret `authorUrl` and explicit `contentMappings` entries with `root` and `jcrBase`. `aem-project-status` checks whether those configured local roots still exist without contacting AEM. `aem-configured-components <name>` searches up to 10 configured component root directories for local candidates. `aem-configured-search <resource-type>` searches up to 10 configured content roots for exact local references and reports unavailable or partial roots; it uses only explicitly configured JCR mappings and does not establish live usage. `aem-configured-search-report <resource-type> <output.md>` saves the same observations to a new local file, including partial results. Existing configuration is never overwritten. This initial setup does not edit the original YAML, install client rules or contact AEM.

`aem-source-usage <directory> <resource-type> [--jcr-base <content-path>]` finds exact `sling:resourceType` references in local `.content.xml` files within bounded search limits. It reports skipped paths and limits. An explicit `--jcr-base` supplies the JCR content path corresponding to the selected local directory; declared `cq:Page` roots then yield candidate paths. This mapping is supplied by the user and does not prove that live AEM pages use the component. Inheritance and fragment references are not resolved. `aem-source-usage-report <directory> <resource-type> <output.md> [--jcr-base <content-path>]` saves the same bounded observations without overwriting. The live search below is separate from this local search.

`aem-live-usage <author-origin> <content-root> <resource-type>` queries the explicitly selected AEM author instance for exact resource type matches using `AEM_TOKEN` (Bearer) or `AEM_USERNAME` and `AEM_PASSWORD` (Basic). It permits HTTPS origins or HTTP loopback, does not follow redirects, and reads at most four 25-hit pages. Matching paths under `jcr:content` become candidate author-page links. Query completion, permissions, concurrent changes, references, other roots and inheritance affect the results; an empty result is not proof of absence. This path has only simulated validation; no live AEM instance was queried. See [Adobe Query Builder API](https://experienceleague.adobe.com/en/docs/experience-manager-65-lts/content/implementing/developing/platform/query-builder/querybuilder-api). `aem-live-usage-many <author-origin> <resource-type> <content-root> [root ...]` searches up to ten explicit roots independently and reports incomplete or unavailable roots rather than treating partial results as complete.

`aem-live-snapshot <author-origin> <content-root> <resource-type> <dialog.xml> <output.json>` saves one local dialog observation and one bounded live usage observation separately, without overwriting. `aem-live-snapshot-compare <before.json> <after.json>` compares matching query scopes and local field paths. Snapshots are editable; incomplete queries, access changes and concurrent edits limit page comparisons. Local XML is not evidence of the deployed dialog. No authored properties or rendered output are captured. Live querying has only simulated validation.

`aem-clientlibs <directory>` inspects explicit local `cq:ClientLibraryFolder` definitions and reports raw categories, dependencies, embeds and proxy attributes. It does not resolve those values or establish build output, runtime inclusion or rendering. `aem-clientlib-files <directory>` inspects local `js.txt` and `css.txt` references, reporting missing, duplicate, unsupported or symlinked paths. `aem-clientlibs-overview <directory>` combines these observations for up to 100 libraries; `aem-clientlibs-report <directory> <output.md>` saves them to a new file. Limits and skipped paths are reported. It does not evaluate generated or deployed assets. See [Adobe client library documentation](https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/developing/full-stack/clientlibs). The initial `aem-fe-verify` skill describes frontend verification without implementing live AEM or screenshot automation.

`aem-editorial-guide <dialog.xml> <output.md>` creates a local reference from explicit dialog field attributes, without overwriting. It does not establish live authoring behavior, inherited fields or translations. The initial skill is not yet validated in an AI client.

`aem-qa-handoff <input.json> <output.md>` creates a local QA handoff from explicit `component`, `environment`, optional `revision`, `checks` (`name`, `result`, `evidence`) and `limitations`. Results are `passed`, `failed` or `not-run`. `aem-qa-status <handoff.md>` summarizes the declared results without validating them; `ticket-status` recognizes `qa-handoff.md` as a local artifact. The handoff does not perform or validate checks, and never overwrites an existing file. Initial `aem-verify`, `aem-qa` and `aem-qa-handoff` skills describe the workflow; live AEM and AI-client behavior are unverified.

`aem-component-overview <component-directory> [--jcr-root <directory>]` combines local component, dialog-audit and optional supertype candidate observations. Missing or invalid parts are reported separately; it does not establish AEM runtime behavior, effective inheritance or accessibility. `aem-component-overview-report <component-directory> <output.md> [--jcr-root <directory>]` saves the same observations to a new local file.

`aem-supertype <component-directory> <jcr-root>` inspects local candidates for an explicit component supertype under one supplied JCR root. Relative resource types are checked under `apps` and `libs`; absolute paths must start with one of those roots. Missing paths and symlinks are reported. This does not establish AEM search-path ordering, inheritance, repository completeness or runtime behavior.

`aem-dialog-audit <dialog.xml>` identifies exact duplicate field names and explicit fields without a nonblank `fieldLabel`. These are inspection candidates, not proven defects or accessibility results: hidden fields, multifield scopes, inheritance and runtime behavior need separate review. It reads local XML and does not print field values.

`aem-dialog-snapshot <dialog.xml> <new-output.json>` saves local explicit dialog fields without overwriting. `aem-dialog-compare <before.json> <after.json>` reports added, removed and changed fields by XML path. It also suggests possible moves when an exact name is unique in both snapshots and the resource type matches; added and removed entries remain visible because identity is not proven. Snapshot files are limited to 1 MiB. This is not a live AEM snapshot or visual comparison; inherited fields and authored values are outside its scope. Tests use synthetic XML.

### Dispatch a GitHub Actions workflow (experimental)

`gitlab-pipeline-dispatch <providers.json> <branch>` and `bitbucket-pipeline-dispatch <providers.json> <branch> <custom-pipeline>` explicitly request a run on the selected provider. These commands may run deployment-capable pipelines; inspect the selected configuration and branch before invoking them. An accepted response is not completion and the branch may move. If the response is unclear, inspect the provider before retrying. No variables or secrets are passed. Tested with simulated responses only. See the [GitLab pipeline API](https://docs.gitlab.com/api/pipelines/#create-a-new-pipeline) and [Bitbucket pipeline API](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pipelines/#api-repositories-workspace-repo-slug-pipelines-post).

`gitlab-pipeline-status <providers.json> <id>` and `bitbucket-pipeline-status <providers.json> <uuid>` read a selected run's reported state and commit without displaying pipeline variables. They do not establish required checks or deployment success.

`ado-pipeline-dispatch <providers.json> <definition-id> <branch> [--commit <sha>]` explicitly queues an Azure build using a selected definition and branch, optionally with a full source commit. `ado-pipeline-status <providers.json> <build-id>` reads selected status fields. A queued build may deploy; an accepted response does not establish the actual checked-out commit or completion. Inspect Azure before retrying an ambiguous request. Simulated responses only. See [Azure Build Queue API](https://learn.microsoft.com/en-us/rest/api/azure/devops/build/builds/queue?view=azure-devops-rest-7.1).

`ci-dispatch /path/to/providers.json build.yml feature-branch [--inputs-file /path/to/inputs.json]` explicitly requests a `workflow_dispatch` run using the configured GitHub Actions provider. The token needs Actions write permission, and the workflow must support manual dispatch. Inputs are a JSON object; do not put secrets in workflow inputs. An `accepted` result means GitHub accepted the request, not that a run completed or succeeded. The command does not retry; after an ambiguous error, inspect GitHub before trying again. This write operation has only been tested with simulated responses.

### Prepare a PR description

`pr-description <share-plan-or-dash> <explain-or-dash> <implement.md> <verification.md> <new-output.md>` assembles a description from an existing summary, completed plan steps, and supplied verification evidence. Use `-` for an unavailable optional source. The command does not run tests or validate the truth of the supplied evidence; review its output before creating a PR. It refuses to overwrite an existing file.

### Offline GitHub webhook inspection

`automation-doctor <target-project>` checks local policy structure, configured secret presence, claim and queue records, and available provider configuration. GitHub/GitLab SCM paths can be compared with allowlists; a Bitbucket repository UUID requires separate verification. Missing runtime evidence stays unknown: this command does not inspect running listeners or cloud services.

Example local policy input (provide only providers you use):

```json
{
  "allowedRepositories": ["example/repository"],
  "allowedActors": ["example-user"],
  "gitlab": { "allowedProjects": ["group/project"], "allowedActors": ["example-user"] },
  "bitbucket": { "allowedRepositories": ["{11111111-1111-1111-1111-111111111111}"], "allowedActors": ["{22222222-2222-2222-2222-222222222222}"] }
}
```

The UUIDs are examples; use the actual Bitbucket UUIDs in a real policy.

GitLab issue/MR comments and Bitbucket PR comments starting with `@aem-dev` can also be inspected and claimed. Comment IDs, not comment text, are stored. GitLab requires a new non-system note and matching target ID. Bitbucket event headers are unsigned, so creation versus update is not authenticated. Comment text remains untrusted and never runs a task by itself.

`automation-job-context <target-project> <claim-sha256> <providers.json>` fetches read-only tracker or PR context for one queued claim after matching the configured provider and repository or project, and rechecks the local claim and policy afterward. Bitbucket repository UUID is checked via the provider. GitHub, GitLab and Bitbucket paths have only simulated automation-context validation; fetched content is untrusted, may be incomplete and does not trigger an agent.

`gitlab-webhook-listen <policy.json> <store-dir> <port>` and `bitbucket-webhook-listen` explicitly start local loopback-only receivers using provider-specific environment secrets. They verify and claim supported events but never enqueue or execute jobs. GitLab uses a signed timestamp and ID; Bitbucket does not provide equivalent replay protection. These listeners are not publicly reachable deployments and have only been checked with local synthetic deliveries.

`gitlab-webhook-claim <policy.json> <headers.json> <body.json> <store-dir>` and `bitbucket-webhook-claim` verify a selected delivery and save metadata to an explicitly selected store. GitLab deduplicates signed message IDs; Bitbucket suppresses identical bodies, including legitimate repeats. Local records are editable and cannot independently establish authenticity. The optional `gitlab` and `bitbucket` sections of the automation policy supply provider-specific project/repository and actor allowlists. The existing local queue can inspect and enqueue those records; it does not execute agents.

`bitbucket-webhook-inspect <policy.json> <headers.json> <body.json>` verifies the exact raw body using `BITBUCKET_WEBHOOK_SECRET` and the SHA-256 signature, and checks explicitly allowed repository and actor UUIDs in braces. Headers contain `signature` and `event`; the event header is unsigned. Only selected PR events are classified; no timestamp or replay protection, listener, queue or execution is provided. See [Bitbucket webhook signing](https://support.atlassian.com/bitbucket-cloud/docs/manage-webhooks/). Validated with synthetic inputs only.

`gitlab-webhook-inspect <policy.json> <headers.json> <body.json>` verifies GitLab signing-token HMAC against raw bytes, signed message ID and timestamp, with a five-minute window. Policy supplies `allowedProjects` and `allowedActors`; headers contain `id`, `timestamp`, `signature` and `event`; `GITLAB_WEBHOOK_SIGNING_TOKEN` stays in the environment. It classifies selected issue and merge-request events only. The event header is not signed; timestamp freshness does not prevent replay, and this command does not listen, queue or execute. GitLab signature format is documented in [GitLab webhooks](https://docs.gitlab.com/user/project/integrations/webhooks/#signing-tokens). Tested with synthetic signatures only.

`automation-enqueue <target-project> <claim-sha256>` records one explicitly selected local webhook claim as a new metadata-only job if its actor and repository remain allowlisted. `automation-jobs <target-project>` compares job records to current claims and policy. This queue does not execute agents or verify signatures again; local files are editable and untrusted. Duplicate jobs are not overwritten.

`automation-init <policy.json> <target-project>` saves explicit `allowedRepositories` and `allowedActors` lists to a new `.ai/automation/policy.json` without overwriting. `automation-status <target-project>` inspects this local policy, webhook-secret environment presence and local claim counts; it does not check whether a listener is running, process events or query any cloud service. No infrastructure or agent is deployed.

`webhook-inspect <policy.json> <headers.json> <body.json>` checks the raw body against `GITHUB_WEBHOOK_SECRET` and explicit `allowedRepositories` and `allowedActors` arrays. The headers file has `signature`, `event`, and `deliveryId` fields. Supported events are narrowly classified; no task is executed and no listener is started. This building block does not prevent replay or establish that the event and delivery headers are bound to the signed body, and it is not a production webhook service. The signature implementation is tested against GitHub's published test vector and synthetic deliveries.

`webhook-claim <policy.json> <headers.json> <body.json> <store-dir>` adds an atomic, local claim keyed by the signed body digest. Identical bodies are rejected on subsequent claims even if the delivery ID differs. This is local deduplication, not a distributed replay-proof service: headers remain unsigned, stores on different machines are independent, and identical legitimate bodies can be suppressed. A crash after claiming requires manual reconciliation. The command still does not execute a task.

### Install one skill into a project

`skill-compare <codex|claude|copilot> <target-project> <skill>` compares an installed skill with the bundled copy by file bytes and executable flags. It reports missing, extra and changed files without replacing either copy. A difference may be an intentional customization; paths may be sensitive and files can change after inspection.

`install-skills-plan <codex|claude|copilot> <target-project> <skill> [skill ...]` previews selected skills and destination collisions without creating files. A later installation rechecks inputs; the preview cannot guarantee the files remain unchanged.

Skill installation copies an explicitly selected skill directory, including supporting files, with limits of 100 files, 1 MiB per file, 8 MiB total and five directory levels. Symlinks and special files are rejected. Existing destination skills are preserved; inspect any partial installation after a copy failure. Executable bits are retained. Client discovery and behavior remain unverified.

`node bin/aem-devflow.js install-skill codex agent-plan /path/to/target-project` copies one skill and its bounded supporting files to the selected project's `.agents/skills/` directory. Use `claude` for `.claude/skills/` or `copilot` for `.github/skills/`. Existing destinations and symlinked destination directories are rejected; if copying fails after a new directory is created, inspect that directory before retrying. Set `AEM_DEVFLOW_MAX_HOME` for skills that call the Max CLI and start a new client session. The installer has been tested with temporary projects; automatic discovery and skill behavior in AI clients remain unverified.

### Pull request review context

`github-issue-comment-plan <providers.json> <issue> <body.md>` previews a new GitHub issue comment using the tracker configuration. `github-review-reply-plan <providers.json> <pr> <comment-id> <body.md>` previews a reply to a top-level GitHub review comment using the SCM configuration. The corresponding `-send` commands require the preview digest, recheck the target and send one message only when explicitly requested. GitHub does not allow replies to replies through this endpoint. If a send result is unclear, inspect GitHub before retrying. These write paths have only simulated validation; no live comments were sent. See [GitHub review comment API](https://docs.github.com/en/rest/pulls/comments#create-a-reply-for-a-review-comment) and [issue comments API](https://docs.github.com/en/rest/issues/comments#create-an-issue-comment).

For GitLab.com, `gitlab-mr-discussions <providers.json> <mr>` lists discussion IDs and notes for inspection (bounded pagination). `gitlab-issue-comment-plan <providers.json> <issue> <body.md>` and `gitlab-review-reply-plan <providers.json> <mr> <discussion-id> <body.md>` preview issue comments and replies to merge request discussions. The corresponding `-send` commands require the preview digest and explicitly send one note after rechecking the target. Individual notes are not supported as discussion replies. If a send result is unclear, inspect GitLab before retrying. These write paths have only simulated validation; no live notes were sent. See [GitLab discussions](https://docs.gitlab.com/api/discussions/) and [notes](https://docs.gitlab.com/api/notes/).

For Bitbucket Cloud, `bitbucket-review-reply-plan <providers.json> <pr> <comment-id> <body.md>` previews a reply to a PR comment. `bitbucket-review-reply-send` takes the same arguments plus the preview digest and sends one reply after rechecking the target. An unclear result requires inspection before retrying. This write path has only simulated validation; no live comments were sent. See the [Bitbucket Cloud pull request API](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/).

For Azure Repos, `ado-review-reply-plan <providers.json> <pr> <thread-id> <comment-id> <body.md>` previews a reply to an existing PR thread comment; `ado-review-reply-send` takes the same arguments plus the preview digest. Thread content and the latest reported merge commits are rechecked, but those commits do not establish current branch heads. An unclear result requires inspection before retrying. This write path has only simulated validation; no live comments were sent. See the [Azure thread comments API](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-thread-comments?view=azure-devops-rest-7.1).

`issue-state-plan <providers.json> <issue> <open|closed>` previews opening or closing a GitHub or GitLab issue using the tracker configuration. `issue-state-apply` takes the same arguments plus the preview digest and rechecks the target before one update. This does not manage GitHub project-board statuses or Jira workflows. Issue state may change after the last check; inspect the provider before retrying an unclear update. These write paths have only simulated validation.

For Jira Cloud, `jira-transitions <providers.json> <issue-key>` lists currently available workflow transitions, including their reported fields. `jira-transition-plan <providers.json> <issue-key> <transition-id>` previews a selected transition; `jira-transition-apply` takes the same arguments plus the preview digest. Transitions requiring fields are not supported. Jira can run workflow side effects; the preview cannot enumerate or guarantee them. Inspect Jira before retrying an unclear response. This path has only simulated validation; no live transition was made.

`jira-comment-plan <providers.json> <issue-key> <body-adf.json>` previews a Jira issue comment supplied as an Atlassian Document Format JSON document. `jira-comment-send` takes the same arguments plus its preview digest and sends one comment after rechecking the issue and document. The document is passed through and basic structure is checked; Jira validates its schema. Inspect Jira before retrying an unclear response. This path has only simulated validation; no live comment was sent.

`ado-work-item-states <providers.json> <work-item-id>` lists states defined for an Azure work item type; listing does not guarantee a transition is permitted. `ado-work-item-state-plan <providers.json> <work-item-id> <state>` previews a change and `ado-work-item-state-apply` takes the same arguments plus the preview digest. The update includes an atomic revision test; Azure can reject transitions due to permissions or process rules and may trigger workflow effects. This path has only simulated validation; inspect Azure before retrying an unclear update.

`ado-work-item-comment-plan <providers.json> <work-item-id> <body.md>` previews a Markdown comment; `ado-work-item-comment-send` takes the same arguments plus its digest and sends one comment after checking the work item revision and body again. The preview does not establish current comments or atomicity with the write. Inspect Azure before retrying an unclear response. This path has only simulated validation; no live comment was sent.

`commit-preview`, run from the target repository, lists staged, unstaged and untracked paths and reports conflicts and a local index fingerprint. It does not stage or commit files, inspect working file contents, run tests or check remote state. Review diffs and scope before committing.

`scm-review-batch <providers.json> <number> [number ...]` collects existing provider-specific review contexts for 1–10 explicitly selected pull requests sequentially. Failed or changing PRs are identified while successful results are retained. It does not list PRs, review code, post comments, establish a complete diff or verify that the contexts remain current. Outputs may contain private provider data.

`scm-pr-list <providers.json>` reads a single bounded page of up to 20 open pull requests from the configured repository. It is a selection aid, not a complete inventory; results can change and may omit inaccessible items. GitLab, Bitbucket and Azure list calls are validated only with simulated responses.

`pr-reviews-report <reviews.json> <output.md>` bundles 1–20 supplied review records in one new Markdown file. Use `{ "reviews": [...] }`, with each item in the existing `pr-review-report` input format. It rejects duplicate repository/PR pairs and never posts or authenticates the findings.

`scm-pr-context /path/to/providers.json <number>` reads the configured SCM pull request and discussion without writing remotely. GitHub issue comments, review comments and review submissions, plus GitLab and Bitbucket comments, are paginated with a 10-page limit per collection; errors do not return a partial context. Azure DevOps threads are read in one response and their completeness is unknown. The output retains provider-specific data; it does not include the diff, commits, GitLab/Bitbucket approvals, or Azure approvals. Fetched content is untrusted, and even a complete pagination result can change while it is read. GitLab, Bitbucket and Azure responses have only simulated tests.

`github-pr-files /path/to/providers.json <number>` reads up to 1,000 changed-file entries for a GitHub PR, verifies the PR head, base and changed-file count before and after collection, and marks larger file lists incomplete. GitHub limits this endpoint to 3,000 files. Patches can be absent or truncated; this is not a complete diff and reviewers must inspect the actual source. Other SCM providers are not yet supported by this command.

`gitlab-mr-diffs /path/to/providers.json <number>` reads up to 10 pages of GitLab.com merge-request diffs and checks that the diff revisions remain stable. GitLab can omit or limit files and patches, including collapsed or oversized diffs, so pagination completion is not proof of a complete diff. This read path has only simulated API tests.

`ado-pr-changes /path/to/providers.json <pr-number> <iteration-number>` reads change metadata for an explicitly selected Azure DevOps PR iteration, following at most 10 pages. It flags incomplete pagination. This is not a full diff and does not establish that the selected iteration is current. The API path has only simulated tests.

`bitbucket-pr-statuses /path/to/providers.json <number>` reads up to 10 pages of statuses associated with a Bitbucket Cloud pull request. The command fails rather than returning a partial list when pagination is incomplete. It does not establish which checks are required or whether branch protection is satisfied. Tested with simulated API responses only.

`ci-observations <providers.json> <full-sha> [--branch <name>]` reads the independently configured CI provider. It groups observed GitLab, Bitbucket or Azure states without an overall verdict; GitHub returns its existing observed summary. Azure requires an explicit branch and reports project-wide results without verifying repository identity. Provider pagination limits, status attribution and required branch checks remain outside the result’s guarantees.

`scm-review-evidence-check <providers.json> <output.md>` compares saved source identifiers and PR revisions with current configured sources and remote PR metadata. Azure revision matching remains unknown. CI freshness is not checked; the editable record can be forged, so a match is not proof of review or readiness. Records created before source identifiers were added cannot be checked.

`scm-review-evidence <providers.json> <number> <full-sha> <output.md> [--branch <name>]` collects the same PR and CI context and saves a new local Markdown record with restrictive file permissions. Existing files are never replaced. The record can contain private and untrusted provider content, may become stale, and does not establish a review, repository identity or readiness.

`scm-review-ci <providers.json> <number> <full-sha> [--branch <name>]` combines PR review context with observations from the independently configured CI provider. For GitHub, GitLab and Bitbucket it requires the explicit SHA to match the observed PR head and rechecks revisions after fetching CI. Azure SCM does not expose a verified current head here, so the match is unknown. Azure CI requires `--branch`. The result records only whitelisted configured SCM and CI identifiers; equal fields are not proof of repository identity. The CI project or repository is not automatically verified as the SCM repository, and this command does not establish required checks or readiness.

`scm-review-context <providers.json> <number> [--iteration <id>]` combines discussion and commit evidence for the configured SCM. GitHub uses the richer review context below. GitLab adds available diff entries and Bitbucket adds diffstat; both compare reported PR revisions across the collected data, but neither guarantees a complete code diff; Azure returns one commit page and does not establish revision consistency or thread completeness. For Azure only, `--iteration <id>` adds change metadata from an explicitly selected iteration; it does not establish that the iteration is current. The result does not itself establish a full diff, review or required checks.

`github-review-context /path/to/providers.json <number>` gathers GitHub PR discussion, changed-file metadata, bounded commit metadata and a CI summary for the PR head in the configured SCM repository. It stops if the PR head, base, file count or commit count changes during collection. Commit lists are limited to 250 entries. It does not fetch a complete diff or review threads, evaluate branch protection, or guarantee that fork CI results are visible in the base repository. Discussion and checks can also change independently.

### Plan execution progress

The initial bug workflow provides `agent-bug-triage`, `agent-bug-verify`, `agent-bug-fix` and `agent-bug-all` for ticket investigation, reproduction, fixes and verification. `ticket-status` lists their local reports. These are instructional workflows, not automatic execution or proof of reproduction, and AI-client behavior and live integrations remain unverified.

`plan-review-record <implement.md> <review.json> <output.md>` records explicitly supplied `verdict` (`ready`, `needs-changes` or `blocked`), `summary`, `findings` and `unresolved` against a digest of plan content. Execution statuses and provenance verification are excluded so ordinary progress does not stale the review. When available, the record also binds to the local source story, Definition of Ready, explanation and research files, and records whether a source identity file was present; missing context or older records without identity metadata require manual inspection. `plan-review-check <implement.md> <review.md>` compares that content; a successful comparison requires plan, requirements context and recorded identity presence or content to match, but does not mean the recorded verdict is ready. Records are editable and do not prove review or correctness. Comments in plans require manual inspection. `workflow-status` treats unstructured, stale or non-ready reviews as requiring inspection before suggesting the next step.

`workflow-step-plan <spec-directory> <step>` previews a step start using declared status and the structured review record. `workflow-step-start <spec-directory> <step> <expected-sha256>` requires the current full plan digest and a matching ready record, then transitions the next step and rechecks plan and context. Records are editable and cannot prove an actual review. If the transition succeeds but its recheck fails, the step remains in progress and must be inspected; concurrent changes can still occur.

`workflow-step-finish <spec-directory> <step> <done|blocked> <evidence.json> <output.json> <expected-sha256>` records supplied `summary`, `checks` (`name`, `result`, `evidence`) and `limitations`, then transitions the in-progress step. A `done` declaration requires at least one supplied check, no supplied failure and disclosure of any unrun checks; it does not execute or authenticate checks. A stale plan or review blocks completion. If the record is written but transition fails, it is retained for inspection; races remain possible.

`workflow-step-evidence-check <spec-directory> <step> <record.json>` compares a newer step record with declared status, plan content and, for completed steps, the same current plan review and requirements context. Older records without fingerprints require manual inspection. Matching editable records do not prove that checks or review occurred.

`workflow-evidence-audit <spec-directory> <index.json>` checks an explicit index such as `{"version":1,"records":[{"step":1,"path":"evidence/step-1.json"}]}`. Paths are relative to the spec directory. It reports missing, stale, invalid or unlisted completed/blocked step records; it does not discover records or prove the work was done.

`workflow-snapshot <spec-directory> <output.json> [--repo <directory>]` records hashes and declared statuses of known local ticket artifacts, and optionally branch, commit and clean-state metadata. `workflow-snapshot-compare <spec-directory> <snapshot.json> [--repo <directory>]` reports artifact changes; when Git metadata was captured, pass the same explicit repository to compare it. A dirty worktree makes the Git comparison unknown. The editable snapshot does not capture uncommitted source contents, prove tests ran, establish readiness, or eliminate concurrent changes.

`workflow-status <spec-directory>` suggests the next ticket phase from local artifact presence and declared plan statuses. It does not validate requirements, source identity, plan approval, checks or readiness; inspect actual evidence before acting. Initial `agent-agent-all`, `agent-agent-re` and `agent-agent-dev` skills describe the related workflows, without implementing automatic dispatch or the original run-state protocol.

`plan-status <implement.md>` reads the supported plan format, reports declared step counts and selects the first pending step only when none are blocked or in progress. An in-progress step requires inspection before resuming. This is a read-only status summary; `allStepsDone` does not establish test or review success. The initial `agent-step-all` skill describes a sequential execution workflow, but has not been validated in an AI client. The initial `agent-step-build` and `agent-step-fix` skills describe bounded build diagnosis and blocked-step recovery; they do not implement the original automatic healing protocol and have not been behaviorally validated in AI clients.

`bitbucket-pr-diffstat /path/to/providers.json <number>` reads Bitbucket Cloud PR changed-file statistics after validating the provider redirect and pagination URLs, and checks source and destination commit hashes before and after retrieval. It fails on incomplete pagination. Diff statistics are not a code diff; verify changes separately. Tested with simulated API responses only.

`list-skills` shows bundled skill names, descriptions, plugins and whether the directory installer supports them. A listed skill has not necessarily been tested in an AI client.

### Initialize a ticket with source identity

`task-plan-estimate <spec-directory> <record.json>` totals explicitly supplied per-task hours and groups them by area. If any task has no estimate, `totalHours` is null and the missing items are listed; known hours are only a partial sum. The command checks local task-plan consistency but does not estimate unknown tasks, validate assumptions or convert hours to calendar time.

`gitlab-subtask-plan <providers.json> <spec-directory> <record.json> <index> <work-item-type-id>` previews one GitLab child work item using an explicitly supplied project-specific type global ID and the current parent ID and update time. `gitlab-subtask-create` accepts the same arguments plus the preview digest and sends one GraphQL mutation after rechecking. Review and explicitly authorize creation. A response can identify a created item while leaving the parent relationship unconfirmed; inspect GitLab before retrying. Simulated transport only, no live work item created; GitLab GraphQL schema and permitted types may differ. [GitLab work item API](https://docs.gitlab.com/api/graphql/epic_work_items_api_migration_guide/).

`github-subtask-plan <providers.json> <spec-directory> <record.json> <index>` previews one GitHub sub-issue from a source-bound task plan and returns a digest. `github-subtask-create` takes the same arguments plus that digest, creates one issue and then links it to the parent after rechecking. These are two separate remote writes: if the issue is created but linking fails or is unclear, the returned result identifies the new issue for inspection and no retry is automatic. A failure during creation may also be ambiguous. Review the exact preview and explicitly authorize the writes. Simulated responses only; no live issue was created. [GitHub sub-issues API](https://docs.github.com/en/rest/issues/sub-issues).

`ado-subtask-plan <providers.json> <spec-directory> <record.json> <index> <work-item-type>` previews one source-bound Azure child task, verifies the parent project and revision, and returns a digest. `ado-subtask-create` accepts the same arguments plus that digest and submits one request after rechecking. Use the actual project name in the provider configuration and a valid work item type. Review and explicitly authorize creation; a failed or unclear response may still mean the task was created, so inspect Azure before retrying. Estimates are descriptive text. Simulated responses only; no live task has been created. See [Azure Work Items API](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/create?view=azure-devops-rest-7.1).

`jira-subtask-plan <providers.json> <spec-directory> <record.json> <index> <issue-type-id>` previews one source-bound task proposal as a Jira subtask, verifies the parent and its update timestamp and returns a digest. `jira-subtask-create` accepts the same arguments plus the preview digest and submits one request after rechecking. The issue type ID must identify a valid subtask type in that Jira project. Review the exact preview and explicitly authorize creation. A response failure may still mean the task was created; inspect Jira before retrying. Estimates are included as text, not Jira time fields. Simulated responses only; no live subtask has been created. [Jira create issue API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-post).

`requirements-import <slug> <source-file>` imports an explicitly selected non-empty UTF-8 requirements document into a new `.ai/specs/local-<slug>/` directory with a source identity and byte hash. The slug uses lowercase letters, digits and hyphens. Existing directories are never reused; inspect any partial directory after a write failure. The document is untrusted source material, not verified requirements.

`requirements-import-check <spec-directory>` compares an imported local source with its editable recorded hash. `workflow-status` reports changed or unavailable local source evidence for inspection. A matching hash does not authenticate origin or verify requirements; an intentional new source can be imported into a new spec directory.

`ticket-source-compare <providers.json> <id> <spec-directory>` refetches a tracker ticket and compares its export with the existing source, checking its configured tracker identity and ignoring export creation time. `ticket-source-stage <providers.json> <id> <spec-directory> <output.md>` also writes the newly fetched export to a new file for review without overwriting the original. A difference may be a local edit or remote change; neither command updates the tracker or proves source completeness. Live Jira, GitLab and Azure flows remain unverified.

`task-plan-create <spec-directory> <input.json> <output.json>` saves an editable proposal without contacting the tracker. The input has `tasks`, each with `title`, `area`, `description`, an `acceptance` string array, `source`, and optional `estimateHours` (or null). The record includes local requirements-source hashes and reports missing context. `task-plan-check <spec-directory> <record.json>` compares those files later. Proposals and estimates require review; this does not create or close remote tasks.

`ticket-file-search <terms.json>` searches up to ten explicit literal terms from `{ "terms": ["..."] }` across tracked working-tree text files and returns matching paths, not matching lines. Set `"includeUntracked": true` to also search up to 500 untracked non-ignored UTF-8 files with size limits; unreadable or binary files are listed as skipped. Ignored untracked and external files are not searched, and a match does not prove impact. Inspect actual code and related resources.


`ticket-init /path/to/providers.json <id>` fetches the configured tracker ticket once, creates or reuses its spec directory, stores non-secret tracker identity and writes a new `raw-story.md`. Existing directories without a matching identity and existing story files are not overwritten. A failure can leave an identity-only directory; inspect it before retrying. Identity is scoped to the configured provider and project. Existing legacy spec directories require manual review rather than automatic adoption.

`ticket-status <spec-directory>` inspects expected local ticket artifacts and summarizes a supported implementation plan when present. It reports missing or unreadable files; presence does not establish that evidence, tracker identity, requirements or verification are correct. No tracker or remote system is contacted.

### Initialize a project

`project-conventions <project-directory>` finds bounded CSS custom-property and Sass-variable name candidates in tracked and untracked non-ignored CSS-family files. It returns names and source paths, not values; generated files, strings and scopes can produce false positives. Skipped or truncated results are reported. No files are modified.

`project-profile <project-directory>` inspects bounded local Maven, Node and AEM layout signals and reports package script names without printing or executing their values. It records incomplete scans and unreadable files; candidates are not verified build commands, project classifications or live AEM evidence. No configuration is written.

From the target project, `project-inspect` reports local technology markers without running commands or inferring provider credentials. `project-init <providers.json>` validates an explicit JSON provider configuration and creates `.ai/providers.json` and `.ai/specs` without replacing existing files. Only recognized, non-secret provider fields are accepted; credentials must be supplied through environment variables. It creates directories before the config file and can leave them behind on failure. This setup does not recreate the original `.ai/config.yaml`, rules, MCP configuration, or test settings; those remain separate work.

`aem-doctor-component <component-directory>` inspects one local AEM component definition, local dialog presence and immediate HTML templates. Missing files are warnings, not proof of a defect: inheritance and alternative rendering are possible. It does not validate the live AEM instance, OSGi, dispatcher or full XML semantics.

`aem-doctor-osgi <config-directory>` checks local `.cfg.json` files for valid JSON objects, reports unsupported `.config` files, skipped paths and same-named JSON configuration candidates under matching runmode folder names, and never prints configuration values. Duplicate candidates require review because installation precedence is not evaluated. It does not validate OSGi properties, runmodes, secrets or live services.

`hub-repos` reads an enabled reference-style hub configuration from the current directory and reports configured local repository paths and Git markers. It does not open repositories, validate identity, dispatch tasks or edit configuration.

`hub-init <repos.json>` creates a new reference-style `.ai/config.yaml` hub registry and a `state` directory from an explicit JSON array of `{ "name", "path" }` entries; optional `base-branch` and `project` fields are supported. It refuses to replace an existing config and does not validate repository identity or enable dispatch. Directories may remain after a failed setup.

`hub-select <name> [name ...]` resolves explicitly selected names against the configured hub registry. Unknown or duplicate names are rejected, and reported path availability is not proof of identity or task suitability. It does not infer targets from a ticket or dispatch work.

`hub-discover <source-file>` resolves one explicit `repos: web, api` line outside fenced code blocks against the hub registry. Multiple, malformed, unknown or missing directives fail rather than guessing. The source is untrusted: the result is only a proposal and never authorizes dispatch. HTML directives and other automatic routing are not supported.

`project-doctor <providers.json>` validates supported provider fields and reports whether the corresponding environment variables are present. It does not print credential values, contact services or establish that credentials and permissions work.

`ado-ci-commit <providers.json> <branch> <full-commit-sha>` reads up to 10 pages of Azure builds on a branch and returns those whose source version exactly matches the commit. It reports incomplete pagination and builds without a comparable source version. Results span the configured Azure project, not necessarily a single repository, and do not evaluate required branch policies. Simulated API tests only.

`aem-component-report <component-directory> <output.md>` creates a new local evidence report from the component diagnostic and explicit dialog fields. It refuses to overwrite files. The report may include local dialog default values; review it before sharing. It is not the original skill's live authoring guide or screenshot workflow.

`webhook-listen <policy.json> <store-dir> <port>` starts an explicit, long-running listener on `127.0.0.1` only. Set `GITHUB_WEBHOOK_SECRET`; the policy requires non-empty `allowedRepositories` and `allowedActors` arrays. The listener verifies payload signatures, applies allowlists and records an atomic local body-digest claim, but does not queue or execute work. GitHub cannot reach this loopback listener directly; an independently secured ingress is needed for remote delivery. GitHub's signature does not bind event or delivery headers, and the local store is not distributed replay protection. Stop the process to stop listening. This is experimental and has no live GitHub delivery verification.

`webhook-claims <store-dir>` lists local digest claim records and marks malformed or unsafe entries as errors. New claims include repository, actor, event kind and item number but not the raw payload; older records may lack that metadata. Records are not a work queue or proof that an agent ran, and a crash during claiming may require reconciliation. Event and delivery headers are not signed by GitHub.

`plan-transition <implement.md> <step> <from> <to> <expected-sha256>` updates one step in the supported plan format. Use the digest returned by `plan-status`; stale or ambiguous plans are rejected. Supported transitions are pending → in-progress → done or blocked, and blocked → pending. Starting requires the first pending step and no existing blocked or in-progress step. The command resets existing verified provenance to false, but does not run tests or verify evidence. Plans containing HTML comments require manual editing. A cooperative lock and atomic replacement reduce conflicts but cannot eliminate races with unrelated processes; an interrupted process may leave a lock file that must be inspected before removal.

`verification-run <config.json> <implement.md> <output.md>` runs the explicitly configured test command and writes a new automated test-evidence record, including the observed branch, commit and plan/config digests. It returns a failure status if tests or consistency checks fail, but still records the outcome when possible. It does not retain command output or mark the plan verified. A passing record does not establish review, other required checks, or overall readiness. Existing output is never replaced.

`verification-check <config.json> <implement.md> <evidence.md>` compares a saved test record with the current plan, normalized settings, branch, commit and clean working tree without rerunning tests. It returns a failure status for a failed record or mismatches. Keep evidence outside the repository or in an ignored location if its presence would make the working tree dirty. The record is editable and can be forged, so a match is not proof that tests ran, a substitute for review, or an overall readiness verdict. Any later plan or code change can make it stale.

`install-skills <codex|claude|copilot> <target-project> <skill> [skill ...]` preflights an explicit list of supported skills with bounded supporting files and destination collisions, then installs each without replacement. Installation is not atomic: a concurrent change or copy error can leave some skills installed or a partial destination; the result identifies completed and failed names for inspection. Client discovery and skill behavior remain unverified.

### Explicit local hub task

`hub-plan <task.json>` performs a read-only preflight of the same task, reporting selected paths, branches and commits without running a command or printing arguments. It returns a digest binding the task arguments, repository snapshots and concurrency. `hub-run <task.json> --preview <sha256>` rejects a changed task or initial repository snapshot before creating state. Review the task file directly; the digest does not verify the executable, environment or future repository state. `hub-run <task.json>` runs one explicitly selected executable in registered, initially clean repositories. An optional `concurrency` from 1 to 4 enables bounded parallel execution; the default is 1. The JSON object requires `ticket`, `title`, `repositories` (an array of registry names), an **absolute** `executable`, an `args` array and `timeoutMs` (1,000–600,000). Example:

```json
{ "ticket": "LOCAL-7", "title": "Run checks", "repositories": ["web", "api"], "executable": "/usr/bin/git", "args": ["status", "--short"], "timeoutMs": 30000 }
```

The command is started directly without a shell, inherits the user's environment and can perform any action its own permissions allow. Use only trusted explicit commands; do not put credentials in arguments. The hub itself does not push, create PRs or send messages. It preflights all selected repositories, requires distinct paths with a clean branch and commit, rechecks each immediately before running, records local status under `state/<ticket>/status.json`, and stops scheduling on the first failure; already running processes can still finish and make changes. Command output is not retained. For locally run tasks, `hub-status` includes recorded process states, starting commits and exit codes. A `done` state means only that the process exited successfully; it does not verify code, tests or external effects. Existing ticket state is never replaced, and crashes may leave a `running` state or partial files requiring inspection. Timeouts send termination and then attempt to force-kill the direct process if needed; subprocess descendants may still outlive it. This local runner does not create agent sessions or implement the original agent dispatcher.

`pr-response-draft <context.json> <output.md>` creates a new local discussion workspace from a saved `scm-pr-context` result for GitHub, GitLab, Bitbucket Cloud or Azure DevOps. It preserves comment text as untrusted source data but writes no replies, does not infer resolution and never posts. The output can contain private discussion; review it before sharing. Provider completeness and freshness remain subject to the source context's limitations.

`scm-pr-commits <providers.json> <number> [--continuation <token>]` selects the configured GitHub, GitLab, Bitbucket Cloud or Azure DevOps SCM and returns its provider-specific result and limitations. The optional continuation token applies only to Azure; completeness and revision guarantees differ by provider as described below.

`ado-pr-commits <providers.json> <number> [--continuation <token>]` reads one Azure DevOps PR commit page and returns any continuation token. Pagination completeness and current branch revisions are not established; Azure merge-result SHAs may be stale. Live Azure behavior remains unverified. See the [Azure REST API](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-commits/get-pull-request-commits?view=azure-devops-rest-7.1).

`bitbucket-pr-commits <providers.json> <number>` reads Bitbucket Cloud PR commits through bounded pagination and compares source and destination revisions before and after. Next-page URLs are restricted to the same API path; pagination completion does not establish server-side completeness or review. Live Bitbucket behavior is unverified. See [Bitbucket Cloud PR API](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/).

`gitlab-mr-commits <providers.json> <number>` reads one GitLab.com MR commit response and checks diff revisions before and after. It accepts at most 1,000 returned commits and reports completeness as unknown; server-side limits and live API behavior remain unverified. See the [GitLab API documentation](https://docs.gitlab.com/api/merge_requests/#retrieve-merge-request-commits).

`github-pr-commits <providers.json> <number>` reads GitHub PR commit metadata and checks the PR head, base and commit count around pagination. GitHub returns at most 250 commits through this endpoint; `commitListComplete` is false when the reported count exceeds the returned list. This does not fetch a full diff or validate the commits. See the [GitHub REST documentation](https://docs.github.com/en/rest/pulls/pulls#list-commits-on-a-pull-request).

`pr-review-report <findings.json> <output.md>` formats explicitly supplied review findings, checks and limitations into a new local report. Input requires `repository`, numeric `pullRequest`, full `head` commit, `findings`, `checks` and `limitations`. Each finding has `priority` (P0–P3), `category` (`bug`, `security`, `accessibility`, `performance`, `regression`, `test`, or `other`), `file`, `line`, `title` and `body`. Each check has `name`, `result` (`passed`, `failed`, or `not-run`) and optional `details`. The command does not perform a review, validate supplied evidence or publish the report; it never overwrites an existing file.

`security-scan` checks changed staged snapshots and changed or untracked working files for a small set of potential private-key, GitHub-token and AWS access-key-ID patterns. It reports filenames, line numbers and pattern names but not matched values. Binary, unreadable, deleted or oversized files are reported as skipped; findings and skips yield a nonzero exit status. This is not a comprehensive secret scanner: it does not inspect history, ignored files, every staged file or all credential types, and matches can be false positives.

`security-scan-commit <full-base-sha>` scans final committed file versions changed between the merge base and current HEAD, anchored to the observed head SHA. It does not scan intermediate commits or history; a secret added and removed within the range will not be detected. The scan reports skipped files and whether HEAD changed, does not print matched values, and is not a comprehensive security review.

`security-scan-history <full-base-sha>` scans changed blobs in up to 100 commits and 500 file versions after the unique merge base with the current HEAD. It can identify supported patterns added and later removed within that range, without printing matching values. Earlier history, ignored files, other secret types and complete security coverage are outside its scope. Limits or ambiguous merge bases stop the scan rather than claiming completeness.

`security-evidence <full-base-sha> <output.md>` runs the local changed-file and bounded PR-history scans and records their potential finding locations in a new file without detected values. It never replaces existing files. Findings, skipped files or changed Git state produce a nonzero exit status. The scans are not a complete security review, and dirty worktree content may change while scanning. The report can contain sensitive file paths.

The GitHub Actions test workflow runs for pull requests or by explicit manual dispatch; it does not run automatically on every push.
Skill installation copies an explicitly selected skill directory, including supporting files, with limits of 100 files, 1 MiB per file, 8 MiB total and five directory levels. Symlinks and special files are rejected. Existing destination skills are preserved; inspect any partial installation after a copy failure. Executable bits are retained. Client discovery and behavior remain unverified.
