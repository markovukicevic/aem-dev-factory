# aem-tools — AEM Plugin for Claude Code

AEM-specific tools for Adobe Experience Manager projects: component verification, dialog inspection, demo capture, and QA automation. Built on top of the [agent-core](https://github.com/yourorg/claude-dx) development workflow plugin.

## Prerequisites

Install the `agent-core` plugin first:

```bash
/plugin marketplace add aem-dev-flow
/plugin install agent-core@aem-dev-flow
```

## Installation

```bash
/plugin install aem-tools@aem-dev-flow
```

## Quick Start

```bash
/agent-init                          # One-time project setup (dx plugin)
/aem-init                         # Add AEM config to .ai/config.yaml

/aem-snapshot starterkit          # Baseline before development
# ... develop your changes ...
/agent-step-build                         # Build & deploy to AEM
/aem-verify starterkit            # Verify component after deployment
/aem-editorial-guide starterkit              # Screenshot dialog, write authoring guide
```

## Skills (10)

### Verification

| Skill | Description |
|-------|-------------|
| `/aem-snapshot` | Baseline component state before development — dialog fields, properties, pages |
| `/aem-verify` | Check component after deployment, compare against baseline, create test page |
| `/aem-editorial-guide` | Open AEM editor, screenshot dialog, write authoring guide |

### QA

| Skill | Description |
|-------|-------------|
| `/aem-qa` | Full QA agent — navigate pages, check rendering/dialogs, capture screenshots, create Bug tickets |

### Documentation

| Skill | Description |
|-------|-------------|
| `/aem-doc-gen` | Generate AEM demo docs — find existing pages, create docs page, capture dialog + website screenshots on QA, write authoring guide |

### Recon

| Skill | Description |
|-------|-------------|
| `/aem-init` | Detect AEM structure, add `aem:` section to .ai/config.yaml |
| `/aem-component` | Find all source files, AEM pages, and dialog fields for a component |
| `/aem-page-search` | Find all AEM pages using a specific component |
| `/aem-refresh` | Update `.ai/project/` seed data from plugin, external docs repo, or manual sources |
| `/aem-doctor` | Check AEM project infrastructure health — component definitions, OSGi, dispatcher |

## Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| `aem-inspector` | Sonnet | Dialog/component inspection, docs page creation, publishing via AEM MCP |
| `aem-editorial-guide-capture` | Sonnet | Playwright screenshots, QA Basic Auth, dialog + publisher view capture |
| `aem-file-resolver` | Haiku | Resolve all source files for an AEM component across repos |
| `aem-page-finder` | Haiku | Find AEM pages using a specific component |
| `aem-bug-executor` | Sonnet | AEM-specific bug verification via Playwright and AEM MCP |

## Configuration

`/aem-init` appends to `.ai/config.yaml`:

```yaml
aem:
  url: http://localhost:4502
  component-prefix: myproject
  brands: [brand-a, brand-b, brand-c]
  author-url-qa: "https://qa-author.example.com"
  publish-url-qa: "https://qa-publish.example.com"
  qa-basic-auth:
    username: "myuser"
    password: "mypassword"
```

### QA Basic Auth

QA/Stage environments often require HTTP Basic Auth. Configure credentials in `aem.qa-basic-auth` above. `/aem-init` also installs `.claude/rules/qa-basic-auth.md` — a convention rule that agents (`aem-editorial-guide-capture`, `aem-doc-gen`, `aem-bug-executor`) read at runtime for auth handling patterns (URL embedding, fetch fallback, QA URL detection).

The `aem.component-prefix` config is used by agents to construct CSS selectors when locating components on rendered pages.

## MCP Servers

This plugin bundles two MCP servers (configured automatically via `.mcp.json`):

- **[AEM MCP](https://www.npmjs.com/package/aem-mcp-server)** (`aem-mcp-server`) — JCR content, component dialogs, page management, node queries. Supports multi-instance configurations (local + QA). Included with the plugin — no separate install needed.
- **Playwright MCP** — browser automation for screenshots, navigation, and dialog interaction

## Full Workflow

```
/aem-snapshot hero  →  /agent-step-all  →  /agent-step-build  →  /aem-verify hero  →  /aem-editorial-guide hero
```
