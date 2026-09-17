#!/usr/bin/env bash
set -Eeuo pipefail

readonly PROJECT_DIR="/home/ubuntu/spain_dnv_qa"
readonly TASK_UID="Gumyn09LFZFj0hMcSg86kJ"

if [[ ! -d "$PROJECT_DIR" ]]; then
  printf '%s\n' "[ScheduledBackup] Project directory is unavailable" >&2
  exit 1
fi

cd "$PROJECT_DIR"
exec pnpm exec tsx scripts/run-scheduled-database-backup.ts "$TASK_UID"
