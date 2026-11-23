---
name: agent-adapt
description: Inspect a project's local AEM, Maven and Node structure and identify candidate configuration.
---

# Inspect a project profile

Identify the target repository and read its instructions and existing configuration. Run `node "$AEM_DEVFLOW_MAX_HOME/bin/aem-devflow.js" project-profile <project-directory>` to inspect local Maven, Node and AEM layout signals. The command reports candidate roots, package script names and selected dependency indicators; it does not execute scripts, print their values, establish project type or inspect a live AEM instance. Treat incomplete scans, unreadable files and ambiguous signals as gaps.

Review the actual build files and relevant source before recommending commands, component roots or content mappings. Distinguish commands that merely compile or test from those that deploy or modify a running environment. Do not infer a deploy command, credentials, service URL or package manager solely from a filename. Where applicable, use `aem-project-inspect` and the existing AEM configuration workflow to prepare explicit source roots and mappings; do not overwrite existing files unless requested. Present the discovered evidence and unresolved choices. Do not execute builds, change rule files, deploy or contact services as a side effect of inspection.

This is an initial read-only workflow and does not reproduce the original automatic rule substitution or full project adaptation. Client discovery and behavior remain unverified.
