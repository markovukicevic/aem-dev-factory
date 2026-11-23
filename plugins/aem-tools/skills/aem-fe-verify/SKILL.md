---
name: aem-fe-verify
description: Inspect an AEM frontend change and report observed rendering checks and evidence gaps.
---

# Verify AEM frontend behavior

Identify the target component, requirements, repository instructions and available verification environment. Inspect the actual frontend sources and tests. `aem-clientlibs <directory>` reports explicit local client library definitions and raw attributes, `aem-clientlib-files <directory>` inspects local `js.txt` and `css.txt` source paths, while `aem-component-overview` reports local component and dialog observations. `aem-clientlibs-overview <directory>` combines these observations, and `aem-clientlibs-report <directory> <output.md>` saves a new local report. None establishes deployed assets, effective dependencies or rendered appearance.

When the user has authorized a live AEM environment and the necessary tools are available, inspect the actual rendered component against the supplied requirements or design. Record the page, environment, revision when known, viewport, actions and observations. Do not claim visual, accessibility or responsive verification from local XML alone. If live AEM, browser access or reference designs are unavailable, report those checks as not run.

Do not deploy, create or change remote AEM content, or send messages as a side effect. This initial workflow does not reproduce the original screenshot comparison, live deployment or automated fix loop.

If axe-core JSON results are available from a real authorized browser run, `axe-summary`, `axe-report` and `axe-compare` can format observations and compare rule/selector candidates. Incomplete rules need manual review; the commands do not run a browser or establish accessibility conformance.

For an explicitly authorized page, `axe-run <project-directory> <config.json> <new-output.json>` can use the project's existing Playwright and axe-core. Blocked resources, page timing, login and raw-result sensitivity require review; this does not establish accessibility conformance.
