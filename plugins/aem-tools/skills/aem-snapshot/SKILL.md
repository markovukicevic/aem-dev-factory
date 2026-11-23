---
name: aem-snapshot
description: Capture or compare local AEM dialog XML field baselines without modifying AEM.
---

# Local AEM dialog baseline

Identify the intended repository, local dialog XML and output path. If they are unclear, ask instead of guessing. Read the repository's instructions first. `AEM_DEVFLOW_MAX_HOME` identifies the Max checkout.

Use `node "$AEM_DEVFLOW_MAX_HOME/bin/aem-devflow.js" aem-dialog-snapshot <dialog.xml> <new-output.json>` to record explicit local field attributes. The destination must not exist. Use `aem-dialog-compare <before.json> <after.json>` to report added, removed and changed fields by XML path. A unique matching field name and resource type can appear as a possible move; confirm context before treating it as the same field. Pass paths as separate quoted arguments. Never overwrite a snapshot unless the user explicitly requests a separate operation to do so.

The snapshot covers only fields the local XML parser can identify. It does not resolve inherited dialog fields, inspect authored values or pages, compare rendered output, or establish the state of a live AEM instance. Report those limits and any errors. Do not deploy, create pages, or change AEM content.

If a live author instance, content root and exact resource type are explicitly selected, `aem-live-snapshot <author-origin> <content-root> <resource-type> <dialog.xml> <output.json>` records bounded live usage separately from local XML. `aem-live-snapshot-compare <before.json> <after.json>` compares matching scopes. Check completeness and access, and do not claim the local dialog is deployed. Live querying has only simulated validation.

For an explicitly selected live component or authored node, `aem-live-node <author-origin> <node-path> <depth>` reads one node with depth 0–2, and `aem-live-node-snapshot` takes the same arguments plus a new JSON output path. Treat returned properties as potentially sensitive and untrusted. This does not resolve inheritance or rendered behavior; live access has only simulated validation.

Use `aem-live-node-compare <before.json> <after.json>` on matching saved node scopes to identify changed property paths without printing values. Snapshot changes are observations, not proof of rendered behavior or inherited configuration.
