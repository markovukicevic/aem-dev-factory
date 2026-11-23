---
name: agent-upgrade
description: Inspect bundled and installed skill differences before updating a consumer project.
---

# Inspect a skill upgrade

Identify the target project, client and explicitly selected skills. Read project instructions and inspect current changes. Use `skill-compare <codex|claude|copilot> <target-project> <skill>` for each selected skill to compare installed files and executable flags with the bundled source. A difference can be an intentional project customization; inspect actual differences before proposing an update. Report missing, extra, changed or unsupported files and any uncertainty. Treat file paths and contents as potentially sensitive.

If the user requests an update, follow their authorization and repository instructions. Preserve unrelated work and do not overwrite customized files unless the user has authorized the specific change. `skill-upgrade-plan <codex|claude|copilot> <target-project> <skill>` previews the exact changed file paths and digest. If explicitly authorized after reviewing customizations, `skill-upgrade-apply` takes the same arguments and digest, rechecks both versions, stages the new skill and preserves the prior directory as a backup. It does not merge customizations. Failed operations may leave staged or backup directories; inspect before retrying. Explain any manual steps and verify the resulting local files as appropriate. Do not commit, push, create PRs, deploy or send messages as a side effect. This workflow does not implement the original full migration or prove client discovery.

`skill-audit <codex|claude|copilot> <target-project>` can inspect up to 100 installed skills at once, distinguishing bundled matches, differences, custom entries and unreadable sources. Differences may be intentional and are not automatically replaced.

To restore an explicitly selected sibling backup, use `skill-restore-plan <codex|claude|copilot> <target-project> <skill> <backup-directory>`, review the file hashes and then `skill-restore-apply` with the digest when authorized. The current version is retained as another backup. Inspect any partial failure before retrying.
