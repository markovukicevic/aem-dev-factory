---
name: agent-hub-init
description: Initialize a local multi-repository hub registry from explicitly selected repositories without replacing existing configuration.
---

# Initialize a hub registry

Identify the intended hub directory and read applicable repository instructions. Identify the repositories and their local paths from the user's request and reliable local evidence; ask for any missing selection rather than guessing. Prepare an explicit JSON array of entries containing `name` and `path`, with optional `base-branch` and `project`. Do not include credentials.

From the chosen hub directory, run `node "$AEM_DEVFLOW_MAX_HOME/bin/aem-devflow.js" hub-init <repos.json>`. The command creates a reference-style `.ai/config.yaml` and a `state` directory without replacing an existing config. If configuration already exists, preserve it and report the collision; directories may remain after failure. Run `hub-repos` afterward and report unavailable paths or unverified repository identity.

This initial workflow creates a registry only. It does not discover repositories automatically, configure AI clients, create workspaces, validate remote access, launch agents or dispatch work. The original hub orchestration and setup functionality remains incomplete.

For simple-block routing, the user can supply `role` (`frontend`, `backend`, `fullstack`, `config`) and `platform` for every repository, with optional `brand`; `hub-init` then writes matching reference-style routing metadata. Do not infer these values from names. If metadata is incomplete, the command rejects the entire input before creating configuration.
