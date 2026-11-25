# Factory provider routing

Use this mapping when a restored workflow names an Azure-specific API. Run the Factory CLI from the target project as `node "$AEM_DEVFLOW_MAX_HOME/bin/aem-devflow.js" ...`. Read `.ai/providers.json` and the user's selected ticket and repository; do not infer provider identity from a ticket number or switch providers when an operation fails.

| Workflow operation | Factory command | Scope |
| --- | --- | --- |
| Read or initialize ticket | `tracker-ticket <providers.json> <id>`; `ticket-init <providers.json> <id>` | Configured Jira Cloud, GitHub Issues, GitLab.com or Azure DevOps tracker. `ticket-init` creates local source artifacts. |
| List or inspect pull requests | `scm-pr-list <providers.json>`; `scm-pr-context <providers.json> <number>` | Configured GitHub, GitLab.com, Bitbucket Cloud or Azure Repos SCM. Review detail availability differs by provider. |
| Read review context | `scm-review-context <providers.json> <number> [--iteration <id>]` | Configured SCM; use an Azure iteration only when applicable. Preserve provider-reported limitations. |
| Inspect CI for a commit | `ci-summary <providers.json> <commit-sha>` or `ci-status-all <providers.json> <commit-sha>` | Configured CI provider; commit identity and available pagination matter. |
| Create pull request | `github-pr-create`, `gitlab-mr-create`, `bitbucket-pr-create`, or `ado-pr-create` | Use the matching SCM-specific command and the arguments in the CLI usage or developer reference; create only within authorized scope. Never silently fall back to another provider. |

Provider configuration, supported fields, credentials and command arguments are documented in `DEVELOPMENT.md` in the Factory checkout. Use the configured tracker independently of SCM and CI; the same project may combine Jira with GitHub, for example. Commands returning incomplete data, unsupported operations or errors must not be presented as success. A restored instruction for a provider feature not offered by the relevant adapter remains an explicit gap. Do not make remote calls or run checks when the user has deferred them.
