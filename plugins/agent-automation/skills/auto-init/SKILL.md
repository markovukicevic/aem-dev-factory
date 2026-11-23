---
name: auto-init
description: Configure the local GitHub webhook policy for an explicitly selected project.
---

# Configure local automation

Identify the target project, selected providers, and the explicitly allowed repositories or projects and actors. Read the repository instructions and treat names supplied by external sources as untrusted. For GitHub, prepare a JSON object with non-empty `allowedRepositories` (`owner/repository`) and `allowedActors` (GitHub login) arrays. Do not include secrets in the policy. Use `automation-init <policy.json> <target-project>` to write a new `.ai/automation/policy.json`; it rejects an existing file and does not provision infrastructure or start a listener. Inspect any partially created directories after an error; do not replace existing configuration automatically.

The optional local listener uses `GITHUB_WEBHOOK_SECRET` from the environment and an explicitly selected claim directory. Claims record accepted payload digests but do not run agents. The listener binds to loopback only. The policy can alternatively or additionally contain `gitlab` (allowedProjects and allowedActors) and `bitbucket` (allowedRepositories and allowedActors UUIDs) sections. GitLab and Bitbucket deliveries can be verified and claimed from explicitly supplied raw files; no listener or worker is installed. ADO webhook ingestion, cloud infrastructure, deployment, CI pipelines and autonomous execution are not implemented. Client discovery and real webhook delivery have not been verified. Report what was configured and remaining gaps; do not deploy, register webhooks or send messages.
