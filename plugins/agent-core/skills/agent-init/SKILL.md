---
name: agent-init
description: Set up explicit non-secret tracker, source-control and CI configuration for a target project without replacing existing files.
---

# Set up a project

Identify the target project and read its instructions. Run `node "$AEM_DEVFLOW_MAX_HOME/bin/aem-devflow.js" project-inspect` in the target project for local markers, then inspect existing `.ai` configuration and the documented provider options in AEM DevFlow Max. Ask for any required provider, repository, project or organization values that cannot be established from reliable local evidence; do not guess. Tracker, source control, CI and documentation can be configured independently. Never ask for credentials in chat or store them in configuration files; use the documented environment variables or an existing credential mechanism.

Prepare a JSON file containing only supported provider fields and no secrets. Explain the chosen values and their source. From the target project, call `node "$AEM_DEVFLOW_MAX_HOME/bin/aem-devflow.js" project-init <providers.json>` with the explicit file path. The command creates `.ai/providers.json` and `.ai/specs`; it refuses to replace an existing provider configuration. If a file already exists or setup fails, inspect the existing state and report it; do not silently overwrite or adopt settings. Directories can remain after a failed setup.

If the user wants skills installed, inspect `list-skills` and use `install-skills` with explicitly selected names and target client; report partial results without deleting files. Verify the created non-secret configuration and report the environment variables needed for the selected providers, without printing their values. This initial workflow does not generate the original `.ai/config.yaml`, test commands, rules, MCP servers or project documentation. It does not validate live provider access, and AI-client behavior is untested. Do not create remote resources or perform network writes as part of setup.
