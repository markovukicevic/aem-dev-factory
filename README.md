# AEM Dev Factory

AEM Dev Factory brings design, development and delivery workflows together for Adobe Experience Manager projects. Configure your team's ticketing, repository and CI services, then use the bundled AI workflows to take work from a design or ticket through implementation and delivery.

## From design to delivery

AEM Dev Factory is designed to connect the stages of an AEM development pipeline:

1. **Design handoff** — work from Figma designs and extract the details needed for implementation.
2. **Requirements** — gather a Jira issue, Azure DevOps work item, GitHub issue or GitLab issue and connect it to the project context.
3. **Planning** — research the existing codebase and prepare an implementation plan.
4. **Development** — implement the changes using the project's AEM components, conventions and configuration.
5. **Review and verification** — review the change and capture available build, accessibility and verification results.
6. **Delivery** — prepare a pull request or merge request and inspect the configured CI pipeline.

The workflows are intended to coordinate these stages as a continuous pipeline. The available automation and provider operations depend on the configuration and the workflow; some actions require explicit authorization.

## Connect your tools

Choose the services your project uses for each part of the workflow:

| Area | Supported services and workflows |
| --- | --- |
| Tickets | Jira Cloud, Azure DevOps work items, GitHub Issues, GitLab.com issues |
| Code and reviews | GitHub, Azure Repos, GitLab.com, Bitbucket Cloud |
| CI | GitHub Actions, Azure Pipelines, GitLab CI, Bitbucket Pipelines |
| Design and AEM | Figma workflows, AEM component and dialog inspection |
| Additional workflows | Confluence, accessibility and multi-repository coordination |

Configure each provider independently, so a team can use, for example, Jira for tickets, GitHub for code and GitHub Actions for CI. Provider support varies by operation; see the [developer reference](DEVELOPMENT.md) for configuration and current capabilities.

## Get started

Install Node.js 18 or newer, then clone the repository and install its dependencies:

```sh
git clone https://github.com/markovukicevic/aem-dev-factory.git
cd aem-dev-factory
npm ci --ignore-scripts
```

Explore the available commands and skills:

```sh
node bin/aem-devflow.js --help
node bin/aem-devflow.js list-skills
```

Follow the [ticket-to-PR guide](docs/TICKET-TO-PR.md) to configure your project, credentials and selected services, install the core skills and start a workflow.

## Documentation

- [Developer reference](DEVELOPMENT.md) — configuration, commands and integrations.
- [Development plan](docs/PLAN.md) — project goals and milestones.
- [Progress](docs/PROGRESS.md) — implementation and verification notes.
- [Reference inventory](docs/REFERENCE-INVENTORY.md) — workflow comparison with AEM DevFlow.
