# agent-core — Development Workflow Plugin for Claude Code

A comprehensive development workflow plugin for Azure DevOps and Jira projects. Covers the entire lifecycle: requirements gathering, implementation planning, step-by-step execution with testing and review, code review, bug fixes, and PR management. Works with any tech stack — pair with the [aem](https://github.com/yourorg/claude-aem) plugin for AEM projects.

## Installation

```bash
/plugin marketplace add aem-dev-flow
/plugin install agent-core@aem-dev-flow
```

## Quick Start

```bash
/agent-init                    # One-time project setup — generates .ai/config.yaml
/agent-req 2416553             # Fetch work item (ADO/Jira), distill requirements, research codebase
/agent-plan                    # Generate step-by-step implementation plan
/agent-step-all                # Execute all steps autonomously (test + review + commit loop)
/agent-step-build                   # Build & deploy, auto-fix errors
/agent-step-verify             # 6-phase verification before shipping
/agent-pr                      # Create pull request
```

## Skills

### Estimation

| Skill | Description |
|-------|-------------|
| `/agent-estimate` | Analyze work item (ADO/Jira) and produce structured estimation — hours/SP, implementation plan, open questions |

### Requirements

| Skill | Description |
|-------|-------------|
| `/agent-req` | Full requirements pipeline — fetch, validate DoR, distill, research, share (5 phases) |
| `/agent-req-tasks` | Create child Task work items with hour estimates |
| `/agent-req-dod` | Check Definition of Done compliance and auto-fix gaps — reviews PR, tasks, docs |
| `/agent-req-import` | Validate external (non-ADO) requirements document |

### Planning

| Skill | Description |
|-------|-------------|
| `/agent-plan` | Generate implementation plan with status-tracked steps |
| `/agent-plan-validate` | Verify plan covers all requirements, no extras |
| `/agent-plan-resolve` | Fix risks flagged by validation |

### Execution

| Skill | Description |
|-------|-------------|
| `/agent-step-all` | Execute all plan steps (step → test → review → commit loop) |
| `/agent-step` | Execute next pending step — implement, test, review, and commit |
| `/agent-step-fix` | Diagnose and fix a blocked step — direct fix or corrective steps |
| `/agent-step-build` | Build & deploy to local environment, auto-fix errors |

### Build & Ship

| Skill | Description |
|-------|-------------|
| `/agent-step-verify` | 6-phase verification with auto-fix (compile, lint, test, secrets, architecture, review) |
| `/agent-pr` | Create pull request via ADO MCP |

### PR Review

| Skill | Description |
|-------|-------------|
| `/agent-pr-review` | Review a single PR — analyze code, post comments, propose fixes |
| `/agent-pr-review-all` | Batch-review multiple open PRs |
| `/agent-pr-answer` | Answer open PR comments with codebase context, apply agree-will-fix changes |

### Bug Fix

| Skill | Description |
|-------|-------------|
| `/agent-bug-all` | Full bug workflow: triage → verify → fix |
| `/agent-bug-triage` | Fetch bug, find affected component, save triage |
| `/agent-bug-verify` | Reproduce bug via Playwright |
| `/agent-bug-fix` | Generate and execute fix plan |

### Recon

| Skill | Description |
|-------|-------------|
| `/agent-init` | Configure project — generates .ai/config.yaml, README, rule templates |
| `/agent-ticket-analyze` | Research ADO ticket, find all relevant source files |
| `/agent-help` | Answer architecture questions from local docs |
| `/agent-pr-commit` | Commit with ADO work item linking, optional PR creation |

### Agent Roles

| Skill | Description |
|-------|-------------|
| `/agent-agent-re` | RE Agent — analyze story, produce structured requirements spec |
| `/agent-agent-dev` | Dev Agent — implement from spec, self-check, commit |
| `/agent-agent-all` | Full pipeline: requirements → development with checkpoints |

### Documentation

| Skill | Description |
|-------|-------------|
| `/agent-doc-gen` | Generate wiki docs from spec files — reads aem-doc-gen output for Authoring/Website sections, posts to ADO wiki |
| `/agent-doc-retro` | Retroactive wiki docs for completed stories — fetches ADO story, finds linked PRs, generates docs |

### Utility

| Skill | Description |
|-------|-------------|
| `/agent-adapt` | Adapt project config after plugin updates — regenerate templates, filter rules |
| `/agent-doctor` | Check health of all dx workflow files — config, rules, scripts, seed data, MCP, settings |
| `/agent-upgrade` | Fix all issues found by agent-doctor — updates stale files, installs missing files |
| `/agent-eject` | Eject all plugin assets into local repo — skills, agents, rules, templates. Works without plugins after. |

## Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| `agent-code-reviewer` | Opus | Deep code review with confidence-based filtering (≥80) |
| `agent-pr-reviewer` | Sonnet | PR diff analysis, structured findings with severity |
| `agent-file-resolver` | Haiku | Source file lookup across repos via ADO MCP |
| `agent-doc-searcher` | Haiku | Local documentation index search |
| `agent-figma-styles` | Haiku | CSS/SCSS convention discovery for prototype generation |
| `agent-figma-markup` | Haiku | HTML/accessibility convention discovery for prototype generation |

Model tiering is also applied at the skill level via `model:` frontmatter (e.g., Opus for agent-plan, agent-step-verify, agent-pr-review; Haiku for agent-ticket-analyze, agent-help).

## Configuration

`/agent-init` generates `.ai/config.yaml` in your project root:

```yaml
project:
  name: "My Project"
  prefix: "myproject"

scm:
  provider: ado
  org: https://myorg.visualstudio.com/
  project: "My Project"
  repo-id: "uuid"
  base-branch: develop

build:
  command: "mvn clean install -PautoInstallPackage"
  test: "mvn test"
  lint-js: "npm run lint:js"
  lint-css: "npm run lint:css"
```

## Customization

### Config overrides

Add an `overrides:` section to `.ai/config.yaml` for simple tweaks:

```yaml
overrides:
  pr-review:
    tone: "direct, no praise"
    severity-threshold: 80
  pr-answer:
    persona: "senior developer, brief responses"
```

### Shared rules

`/agent-init` installs shared rules to `.ai/rules/`. Edit these to customize behavior for both local dx skills and automation agents:

| File | What it controls |
|------|-----------------|
| `.ai/rules/pr-review.md` | PR review criteria and comment format |
| `.ai/rules/pr-answer.md` | PR answer tone and response categories |
| `.ai/rules/pragmatism.md` | Pragmatism filter for plans and questions |
| `.ai/rules/plan-format.md` | Implementation plan template |

Precedence: `.ai/rules/<topic>.md` > `config.yaml overrides` > plugin defaults.

### Skill shadowing

Create a skill with the same name in your project's `.claude/skills/` to override any plugin skill entirely.

## AEM Projects

Pair with the [aem](https://github.com/yourorg/claude-aem) plugin for AEM-specific tools (component verification, dialog inspection, QA automation).
