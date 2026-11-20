# Progress

## 2026-11-20

- Started a separate project inspired by the local AEM DevFlow reference at commit `7ecd2a0` (version 1.1.0). The original workflows are not yet implemented here.
- Recorded an initial inventory of its four plugins.
- Added a GitHub Cloud client for reading and creating pull requests and reading pages of comments, check runs, and combined commit status. It is not yet connected to the reference workflow or configuration system.
- Added a read-only CLI command for fetching a pull request. Verified it by reading a public `cli/cli` pull request. Other operations have only been tested with simulated responses.
- Linked the new project to its GitHub origin and added a test workflow.
- Most recent observed five-hour quota reset: 2026-11-20 21:27 Europe/Berlin. Scheduled sessions must verify the reset and current usage before starting; limits are shared across the account.

## Next

Expand the reference inventory, design the plugin and provider boundaries, and connect a complete GitHub PR flow to a real workflow with suitable checks. Preserve existing reference behavior as it is recreated.
