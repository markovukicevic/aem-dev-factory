# AEM DevFlow Max

A new implementation inspired by AEM DevFlow, aiming to support its development workflows across multiple ticket, source-control and CI providers.

This project is at an early stage. It does not yet provide the original project's plugins, AEM workflows, or end-to-end provider integrations. See [the plan](docs/PLAN.md), [reference inventory](docs/REFERENCE-INVENTORY.md), and [progress record](docs/PROGRESS.md).

## Run tests

Use Node.js 18 or newer:

```sh
npm test
```

## Read a GitHub pull request

Set `GITHUB_TOKEN` in your environment using your preferred credential manager. For a private repository the token needs access to that repository and permission to read pull requests. Avoid putting credentials in files committed to Git.

```sh
node bin/aem-devflow.js github-pr OWNER REPOSITORY NUMBER
node bin/aem-devflow.js github-pr-context OWNER REPOSITORY NUMBER
```

These read-only commands print pull request JSON; the context command also reads review and conversation comments, check runs, and combined status for the PR head commit. Context includes only the first page of each paginated response, clearly marked in its output; the response may contain private repository data. It uses GitHub Cloud's API and does not yet support GitHub Enterprise Server. The underlying client also supports creating a pull request and reading individual pages of review comments, conversation comments, check runs and combined commit status, but creation and explicit page selection are not yet exposed through the command or connected to a workflow. GitHub paginates comment and check responses; callers must request subsequent pages explicitly.

The client is an early component, not a replacement for AEM DevFlow's existing plugins. Real-service coverage so far consists of reading a public pull request and its context; other operations have only been tested with simulated responses.
