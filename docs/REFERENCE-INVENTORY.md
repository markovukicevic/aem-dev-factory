# Reference inventory

**Update:** The 77 original skill instruction files and available support assets have been restored into the Factory plugins, with inline execution guidance and existing Factory provider extensions. The following table records the earlier implementation inventory; it does not establish runtime parity. Live-service behavior remains for user verification.

Based on the local AEM DevFlow checkout at `7ecd2a0` (1.1.0). This is an initial inventory, not a full parity audit. For a name-by-name comparison, see [SKILL-INVENTORY.md](SKILL-INVENTORY.md).

| Area | Reference | Max status |
| --- | --- | --- |
| Core development | agent-core: 49 skill directories | Initial skills and partial supporting functionality; see skill inventory |
| Multi-repository coordination | agent-hub: 5 skill directories | Initial skills and partial supporting functionality; see skill inventory |
| AEM workflows | aem-tools: 12 skill directories | Initial skills and partial supporting functionality; see skill inventory |
| Autonomous execution | agent-automation: 11 skill directories | Initial skills and partial supporting functionality; see skill inventory |
| Ticket retrieval | agent-req selects ADO or Jira, with provider-specific calls | Provider adapters and source export exist; full requirements workflow remains incomplete |
| Source control / PR | agent-pr discovers ADO repositories and creates PRs via ADO MCP | Experimental guarded PR/MR flows exist for GitHub, Azure Repos, GitLab.com and Bitbucket Cloud; live writes remain unverified |
| Jira attachments | agent-req records that image downloading is not wired | Metadata and explicit bounded download exist; simulated tests only |

Counts cover directories containing `SKILL.md` under the four plugins. Skills, helper scripts, configuration, MCP servers, supported clients, and autonomous workflows still need detailed inventory and behavioral verification.

The original is a reference, not a dependency: a standalone Node.js client does not reproduce the original plugin interface. Implementing a working end-to-end flow requires explicit integration with the eventual skill and configuration architecture.

## Initial PR workflow details

The reference `agent-pr` reads the per-ticket `implement.md`, requires all steps to be done, blocks explicitly unverified provenance, and warns on low confidence. Its fallback checks tests and working-tree cleanliness, discovers the target branch, pushes, and calls ADO to create the PR. It derives the title and description from spec files and links the ADO work item. Hub mode dispatches the workflow per repository.

The Max readiness components cover only a subset of these rules. They parse a restricted subset of `implement.md`; they can use a new JSON test configuration and resolve a configured base or local origin default, or the corresponding base and simple test command from the original YAML. An experimental GitHub flow rechecks readiness and whether the current commit is published; a separate description builder can include a Jira or GitHub ticket link, and optional tracker comparisons can block a GitHub PR write on a changed source. The flow does not push, update the tracker, or implement hub dispatch. Checks cannot prevent concurrent changes after they run.

Other reference skills directly call ADO repository APIs, including `agent-pr-commit`, `agent-pr-review`, `agent-pr-answer`, and the PR reporting skills. Jira-backed requirement gathering includes an ADO-specific attachment helper, with Jira image downloads explicitly not wired. These need their own provider-aware replacements and tests.
