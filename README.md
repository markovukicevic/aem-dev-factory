# AEM DevFlow Max

A new implementation inspired by AEM DevFlow, aiming to support its development workflows across multiple ticket, source-control and CI providers.

This project is at an early stage. It does not yet provide the original project's plugins, AEM workflows, or end-to-end provider integrations. See [the plan](docs/PLAN.md), [reference inventory](docs/REFERENCE-INVENTORY.md), and [progress record](docs/PROGRESS.md).

## Run tests

Use Node.js 18 or newer:

```sh
npm test
```

## Read a GitHub pull request or issue

Set `GITHUB_TOKEN` in your environment using your preferred credential manager. For a private repository the token needs access to that repository and permission to read pull requests or issues, depending on the command. Avoid putting credentials in files committed to Git.

```sh
node bin/aem-devflow.js github-pr OWNER REPOSITORY NUMBER
node bin/aem-devflow.js github-pr-context OWNER REPOSITORY NUMBER
node bin/aem-devflow.js github-pr-context OWNER REPOSITORY NUMBER --page 2
node bin/aem-devflow.js github-issue OWNER REPOSITORY NUMBER
```

These read-only commands print pull request or issue JSON; the context command also reads review and conversation comments, check runs, and combined status for the PR head commit. Context includes only the requested page of each paginated response (page 1 by default), clearly marked in its output; the response may contain private repository data. It uses GitHub Cloud's API and does not yet support GitHub Enterprise Server. The underlying client also supports creating a pull request and reading individual pages of review comments, conversation comments, check runs and combined commit status, but PR creation is not exposed through the command or connected to a complete workflow. GitHub paginates comment and check responses; callers must request subsequent pages explicitly.

The client is an early component, not a replacement for AEM DevFlow's existing plugins. Real-service coverage so far consists of reading a public pull request, its context, and an issue; other operations have only been tested with simulated responses.

## PR readiness components

The library can read a supported `implement.md` plan and inspect the current Git branch and whether the working tree is clean, then combine that with caller-provided test and base-branch evidence. A separate function can block PR creation when that evidence fails. These functions are building blocks only: they do not run tests, verify that a branch was pushed, refresh evidence automatically, or provide a full end-to-end PR flow. Do not treat caller-supplied evidence as automatically verified.

The plan parser accepts a restricted form of the reference template: numbered `Step N:` headings with one `**Status:**` line per step, and optional simple provenance frontmatter. Unsupported YAML or ambiguous status formats are rejected; it is not a general Markdown or YAML parser.
