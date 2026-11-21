---
name: agent-doctor
description: Inspect local project provider configuration and report missing credentials without exposing secrets.
---

# Inspect project configuration

Identify the target project and read repository instructions. Run `node "$AEM_DEVFLOW_MAX_HOME/bin/aem-devflow.js" project-inspect` for local project markers and `node "$AEM_DEVFLOW_MAX_HOME/bin/aem-devflow.js" project-doctor <providers.json>` for the explicit provider configuration. The latter reports only whether required environment variables are present; do not print, copy or store their values.

Report configuration errors, missing credentials and evidence gaps. Presence is not proof of valid credentials, permissions, network access or service health. If live checks are requested and the correct provider and target are known, use only appropriate read-only operations and report their actual results. Do not change configuration, install software, update external services or send messages as part of this inspection.

This initial workflow does not reproduce the original doctor's full checks for plugins, client configuration, dependencies, rules and MCP services.
