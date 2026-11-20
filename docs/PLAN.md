# Development plan

## Goal

Build AEM DevFlow Max from the ground up, using AEM DevFlow as a functional reference while keeping ticket tracking, source control, and CI independently configurable. Preserve a record of which capabilities are implemented and verified; do not claim parity until tested.

## Milestones

1. Inventory the reference project's plugins, workflows, clients, configuration, and checks. Record gaps and migration priorities.
2. Establish provider contracts and GitHub repository / pull request operations, including review comments and checks. Integrate them into the development workflow alongside Azure Boards and Jira.
3. Add GitHub Issues and Actions, then evaluate autonomous triggers after the local flow works.
4. Add Bitbucket Cloud and GitLab support, with provider-specific tests. Treat Bitbucket Data Center as a separate target.
5. Improve Jira attachments and Confluence support; add optional Slack or Teams notifications.
6. Recreate and verify the reference project's AEM tools, multi-repository orchestration, supported client integrations, and automation; maintain backward-compatible behavior where practical.

Each milestone needs documentation, focused automated tests, and explicit evidence of any real-service verification. Keep commits small and meaningful. Never commit credentials or run external write operations without an explicit user request.
