---
name: agent-scan
description: Inspect local project styling and AEM structure to identify evidence-backed convention candidates.
---

# Inspect project conventions

Identify the target repository and read its instructions and existing configuration. Use `project-profile <project-directory>` for bounded project structure signals and `project-conventions <project-directory>` for candidate CSS custom-property and Sass-variable names and source paths. The latter scans tracked and untracked non-ignored CSS-family files; it may report false positives from strings, generated files or scoped variables and does not establish actual usage or live styles. Report skipped files and scan limits.

Inspect relevant source files, AEM dialogs, components and build configuration directly before describing a convention. Use the existing AEM discovery commands where appropriate. Distinguish what the repository demonstrates from guesses and note inaccessible repositories, live AEM, frontend rendering or design sources. Summarize evidence with exact paths and unresolved questions. Prepare proposed rule or knowledge updates only if requested, and preserve existing files; do not silently replace user customizations. Do not run builds, execute scripts, deploy or contact external services as a side effect.

This initial read-only workflow does not reproduce automatic seed-data generation or rule rewriting from the original project. Client discovery and behavior remain unverified.
