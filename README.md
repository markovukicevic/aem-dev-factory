# AEM DevFlow Max

A new implementation inspired by AEM DevFlow, aiming to support its development workflows across multiple ticket, source-control and CI providers.

This project is at an early stage. It does not yet provide the original project's plugins, AEM workflows, or end-to-end provider integrations. See [the plan](docs/PLAN.md), [reference inventory](docs/REFERENCE-INVENTORY.md), and [progress record](docs/PROGRESS.md).

## Run tests

Use Node.js 18 or newer:

```sh
npm ci --ignore-scripts
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

The issue context command retrieves the issue and comment pages, returning an error instead of silently truncating if its page limit is reached. It rejects pull requests returned by the Issues API and has been read-tested against a public GitHub issue. It does not fetch attachments or create spec files.

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

The experimental GitHub PR flow is currently a library function and has only been exercised with a simulated GitHub API and local test repositories. It checks readiness and remote branch state again before making one create request; it does not automatically retry ambiguous failures. Remote branches and local files may still change between checks and creation.
