---
name: auto-doctor
description: Diagnose local automation configuration and queued webhook records without cloud or process changes.
---

# Diagnose local automation

Identify the target project and read its instructions. Run `automation-doctor <target-project>` using the Max CLI. Review the reported local policy, presence of environment variables, claim store, queue and provider configuration. Inspect malformed records, mismatched configured repositories and unavailable files without exposing secrets. A missing claim store may simply mean no deliveries have been recorded.

Secret presence does not establish validity. A matched allowlist does not prove that a delivery was authentic or that a user has current provider access. The command does not check running listeners, public connectivity, AWS infrastructure, pipeline configuration, cloud alarms, task execution or overall readiness. Report these unknowns along with actual local issues; do not infer that the automation is healthy or deployed. Do not start listeners, change configuration, query cloud services or send messages as a side effect. This initial local workflow does not reproduce the original cloud health checks; client behavior remains unverified.

The doctor also observes whether Git ignore rules cover runtime claims and jobs and whether the worktree is clean. Ignore rules do not untrack files, and cleanliness or coverage does not prove that a worker is running or ready. Where appropriate, `automation-ignore-init <target-project>` can create a dedicated ignore file without replacing an existing one; the file and policy may need to be committed or ignored separately.
