#!/usr/bin/env bash
# update-progress.sh — /agent-bug-all wrapper around shared/update-progress.sh.
# Keeps the bug-progress.md filename and heading; all logic lives in the
# shared script so every coordinator writes the same table shape.
#
# Usage: update-progress.sh <spec-dir> <step-name> <status> [note]
#   status: pending | in_progress | done | failed | skipped | blocked

set -euo pipefail

exec env \
  MV_PROGRESS_FILE="bug-progress.md" \
  MV_PROGRESS_TITLE="/agent-bug-all Progress" \
  MV_PROGRESS_LABEL="Step" \
  bash "$(dirname "${BASH_SOURCE[0]}")/../../../shared/update-progress.sh" "$@"
