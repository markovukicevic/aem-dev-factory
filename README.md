# AEM Dev Factory

An AI-assisted development workflow for AEM projects, from a ticket and implementation plan to a pull request and CI checks.

AEM Dev Factory is inspired by [AEM DevFlow](https://github.com/markovukicevic/aem-dev-flow). It extends the workflow toward projects that use different systems for tickets, source control and CI. Choose the tools your team uses for each part of the work.

> **Early development:** The project is experimental and does not yet match the original AEM DevFlow feature for feature. Selected GitHub read operations have been exercised against public repositories. PR creation and most other provider integrations have been checked with simulated responses, not verified end to end with real accounts.

## From ticket to pull request

A typical workflow starts with a Jira ticket or GitHub issue and a target repository. The project helps an AI assistant and developer work through the task in stages:

1. **Understand the work** — retrieve the ticket, preserve its source and prepare requirements and repository research.
2. **Plan and implement** — create and review a plan, work on a feature branch, and record the checks actually performed.
3. **Prepare a pull request** — review the description, check the ticket and plan for changes, and publish the branch and PR when explicitly requested.
4. **Inspect CI** — see checks for the current PR commit and compare them with an explicitly supplied list of expected checks.

The workflow keeps source material, plans and review records available for inspection. Remote writes such as publishing a branch, creating a PR or linking it back to Jira are explicit actions.

## Tools and integrations

| Area | Current direction |
| --- | --- |
| Tickets | Jira Cloud, GitHub Issues, GitLab.com issues and Azure DevOps work items |
| Code and reviews | GitHub, GitLab.com, Bitbucket Cloud and Azure Repos |
| CI | GitHub Actions, GitLab CI, Bitbucket Pipelines and Azure Pipelines |
| AEM | Component and dialog inspection, local diagnostics and initial live-instance workflows |
| Supporting workflows | Confluence, Figma, accessibility checks and multi-repository coordination |

Provider support varies by operation. In particular, GitLab self-managed, Bitbucket Data Center and GitHub Enterprise Server are not covered by the current cloud adapters. Live AEM, Figma and several provider write paths still need validation. See the [developer reference](DEVELOPMENT.md) for details and limitations.

## Getting started

Use Node.js 18 or newer. Clone this repository and install its dependencies:

```sh
git clone https://github.com/markovukicevic/aem-dev-factory.git
cd aem-dev-factory
npm ci --ignore-scripts
```

Explore the CLI and bundled skills:

```sh
node bin/aem-devflow.js --help
node bin/aem-devflow.js list-skills
```

For an example of setting up a target project and working from a tracker ticket to a GitHub PR, follow the [ticket-to-PR guide](docs/TICKET-TO-PR.md). It covers configuration, credentials, local branches, review and the limits of the current implementation.

## Project documentation

- [Developer reference](DEVELOPMENT.md) — detailed commands, configuration and integration notes.
- [Development plan](docs/PLAN.md) — project goals and milestones.
- [Progress](docs/PROGRESS.md) — implemented work and verification notes.
- [Reference inventory](docs/REFERENCE-INVENTORY.md) — comparison with the original AEM DevFlow.
