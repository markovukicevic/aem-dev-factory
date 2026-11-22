---
name: aem-fe-verify
description: Inspect an AEM frontend change and report observed rendering checks and evidence gaps.
---

# Verify AEM frontend behavior

Identify the target component, requirements, repository instructions and available verification environment. Inspect the actual frontend sources and tests. `aem-clientlibs <directory>` reports explicit local client library definitions and raw attributes, while `aem-component-overview` reports local component and dialog observations. Neither establishes deployed assets, effective dependencies or rendered appearance.

When the user has authorized a live AEM environment and the necessary tools are available, inspect the actual rendered component against the supplied requirements or design. Record the page, environment, revision when known, viewport, actions and observations. Do not claim visual, accessibility or responsive verification from local XML alone. If live AEM, browser access or reference designs are unavailable, report those checks as not run.

Do not deploy, create or change remote AEM content, or send messages as a side effect. This initial workflow does not reproduce the original screenshot comparison, live deployment or automated fix loop.
