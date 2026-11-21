---
name: agent-help
description: Explain the available AEM DevFlow Max commands and skills and their current limitations.
---

# Help with AEM DevFlow Max

Identify the user's goal and target project. Read the Max README, current progress and relevant target repository instructions. Run `node "$AEM_DEVFLOW_MAX_HOME/bin/aem-devflow.js" --help` for command syntax and `node "$AEM_DEVFLOW_MAX_HOME/bin/aem-devflow.js" list-skills` for bundled skills. The catalog shows installer compatibility, not proof of actual AI-client discovery or workflow behavior.

Suggest the smallest relevant sequence using the configured tracker, source-control and CI providers. State which steps are read-only and identify any experimental behavior or missing implementation. Distinguish local evidence from live-service verification and never claim parity with the original project solely from a matching skill name. Do not print credential values, guess provider settings, run writes, modify files, send messages or dispatch work as a side effect of explaining help.

If the requested capability is not implemented, say so and identify a practical next step. This initial help workflow does not reproduce all reference-project documentation or detect every client and plugin environment.
