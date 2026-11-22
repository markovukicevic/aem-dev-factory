---
name: aem-init
description: Inspect local AEM project structure and initialize explicitly selected non-secret settings.
---

# Set up local AEM settings

Identify the target repository and read its instructions and existing `.ai` settings. Run `aem-project-inspect <directory>` to list bounded local directory-name candidates. Markers do not establish component identity, JCR mappings or a running AEM instance. Inspect candidate paths before selecting them; do not guess author URLs or credentials.

If the user has authorized project setup, provide an explicit JSON file with `componentRoots`, `contentRoots` and optional `authorUrl`. Roots are existing project-relative directories. Run `aem-project-init <input.json>` from the target repository to create `.ai/aem.json`; existing files are never overwritten. Do not include credentials in the configuration. Use `aem-project-status` to inspect configured local paths without contacting AEM. Report the chosen paths, omitted settings and checks that were not performed.

This initial workflow does not modify the original `.ai/config.yaml`, install client rules or agents, build, deploy, contact AEM or reproduce the original setup workflow. Use other supported workflows only when explicitly appropriate.
