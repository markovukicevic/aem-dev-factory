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

## Initial PR workflow details

The reference `agent-pr` reads the per-ticket `implement.md`, requires all steps to be done, blocks explicitly unverified provenance, and warns on low confidence. Its fallback checks tests and working-tree cleanliness, discovers the target branch, pushes, and calls ADO to create the PR. It derives the title and description from spec files and links the ADO work item. Hub mode dispatches the workflow per repository.

The Max readiness components cover only a subset of these rules. They parse a restricted subset of `implement.md`; they do not yet run tests, create the description, discover the configured base, push, link a ticket, or implement hub dispatch. The current provider call accepts supplied readiness evidence; it does not independently ensure that evidence is fresh.

Other reference skills directly call ADO repository APIs, including `agent-pr-commit`, `agent-pr-review`, `agent-pr-answer`, and the PR reporting skills. Jira-backed requirement gathering includes an ADO-specific attachment helper, with Jira image downloads explicitly not wired. These need their own provider-aware replacements and tests.
