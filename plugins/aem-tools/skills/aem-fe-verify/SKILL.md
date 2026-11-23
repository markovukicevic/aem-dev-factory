---
name: aem-fe-verify
description: Inspect an AEM frontend change and report observed rendering checks and evidence gaps.
---

# Verify AEM frontend behavior

Identify the target component, requirements, repository instructions and available verification environment. Inspect the actual frontend sources and tests. `aem-clientlibs <directory>` reports explicit local client library definitions and raw attributes, `aem-clientlib-files <directory>` inspects local `js.txt` and `css.txt` source paths, while `aem-component-overview` reports local component and dialog observations. `aem-clientlibs-overview <directory>` combines these observations, and `aem-clientlibs-report <directory> <output.md>` saves a new local report. None establishes deployed assets, effective dependencies or rendered appearance.

When the user has authorized a live AEM environment and the necessary tools are available, inspect the actual rendered component against the supplied requirements or design. Record the page, environment, revision when known, viewport, actions and observations. Do not claim visual, accessibility or responsive verification from local XML alone. If live AEM, browser access or reference designs are unavailable, report those checks as not run.

Do not deploy, create or change remote AEM content, or send messages as a side effect. This workflow does not yet provide live deployment or an automated fix loop.

If axe-core JSON results are available from a real authorized browser run, `axe-summary`, `axe-report` and `axe-compare` can format observations and compare rule/selector candidates. Incomplete rules need manual review; the commands do not run a browser or establish accessibility conformance.

For an explicitly authorized page, `axe-run <project-directory> <config.json> <new-output.json>` can use the project's existing Playwright and axe-core. Blocked resources, page timing, login and raw-result sensitivity require review; this does not establish accessibility conformance.

For an explicitly authorized page, `aem-screenshot <project-directory> <config.json> <new-output.png>` uses the project's Playwright to capture a viewport or unique element. Inspect blocked requests, viewport and timing. Browser behavior has only been validated with a simulated browser; the screenshot alone does not prove correctness.

Use `aem-screenshot-compare <project-directory> <before.png> <after.png> [--threshold <0-255>]` to count pixel differences for matching PNG dimensions. Review the images and explain environmental or timing differences; the count is not a pass/fail decision. Comparison has only been validated with a simulated browser.

When the selected AEM author page requires HTTP authentication, set `authenticate: true` in the screenshot config and provide `AEM_TOKEN` or Basic credentials via environment variables. Credentials are scoped to the page origin; interactive login is not implemented. Do not print or store credentials.
