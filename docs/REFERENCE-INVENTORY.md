# Reference inventory

Based on the local AEM DevFlow checkout at `7ecd2a0` (1.1.0). This is an initial inventory, not a full parity audit.

| Area | Reference | Max status |
| --- | --- | --- |
| Core development | agent-core: 49 skill directories | Not yet recreated |
| Multi-repository coordination | agent-hub: 5 skill directories | Not yet recreated |
| AEM workflows | aem-tools: 12 skill directories | Not yet recreated |
| Autonomous execution | agent-automation: 11 skill directories | Not yet recreated |
| Ticket retrieval | agent-req selects ADO or Jira, with provider-specific calls | Not yet recreated |
| Source control / PR | agent-pr discovers ADO repositories and creates PRs via ADO MCP | GitHub PR HTTP client only; not connected to a workflow |
| Jira attachments | agent-req records that image downloading is not wired | Not yet recreated |

Counts cover directories containing `SKILL.md` under the four plugins. Skills, helper scripts, configuration, MCP servers, supported clients, and autonomous workflows still need detailed inventory and behavioral verification.

The original is a reference, not a dependency: a standalone Node.js client does not reproduce the original plugin interface. Implementing a working end-to-end flow requires explicit integration with the eventual skill and configuration architecture.
