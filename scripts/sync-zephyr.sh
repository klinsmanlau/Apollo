#!/usr/bin/env bash
#
# Zephyr → Apollo update sync.
#
# Re-runnable: syncs the shared case library first (source of truth), then each
# POD's test cycles. Existing cases/cycles are updated in place, so running this
# again just brings Apollo up to date with Zephyr.
#
# Usage:
#   ZEPHYR_API_TOKEN=... ./scripts/sync-zephyr.sh
#
# Options (env vars):
#   SKIP_CASE_SYNC=1   Skip step 1 (case library) and only sync cycles.
#   STOP_ON_ERROR=1    Abort on the first POD that fails (default: continue).
#
# Portable: works in bash 3.2 (macOS default) and zsh — no associative arrays.

set -o pipefail
cd "$(dirname "$0")/.." || exit 1

# ---------------------------------------------------------------------------
# Config — edit these. Left side is the Apollo project id, right side the
# Zephyr/Jira project key. If a POD's Zephyr key equals its Apollo id, repeat it.
# ---------------------------------------------------------------------------
QA_TEAM_PROJECT="rytbank-qa-team"
QA_TEAM_ZEPHYR_KEY="TS"

pods=(
  "lending:PBLP"
  "wealth:PODWEALTH"
  "rytai:PA"
  "cards:PODCARDS"
  "payments:PODPAY"
  "rewards:PODREW"
  "deposit:PODDEP"
  "customer-pod:PODCUST"
)

# ---------------------------------------------------------------------------

# tsx does NOT auto-load .env, so we run it with --env-file=.env when a .env is
# present (that loads ZEPHYR_API_TOKEN, DATABASE_URL, etc.). With no .env we fall
# back to whatever is already exported in the shell.
if [ -f .env ]; then
  ENV_FLAG="--env-file=.env"
else
  ENV_FLAG=""
  if [ -z "${ZEPHYR_API_TOKEN:-}" ]; then
    echo "ERROR: no .env found and ZEPHYR_API_TOKEN is not exported." >&2
    exit 1
  fi
fi

# Run a sync entrypoint with the resolved env loading.
run_sync() { npx tsx $ENV_FLAG "$@"; }

has_placeholder() { case "$1" in *"<"*">"*) return 0;; *) return 1;; esac; }

fail_count=0
ok_count=0
failed_pods=""

# 1) Case library first — cycle executions link to these cases.
if [ "${SKIP_CASE_SYNC:-0}" != "1" ]; then
  if has_placeholder "$QA_TEAM_ZEPHYR_KEY"; then
    echo "ERROR: QA_TEAM_ZEPHYR_KEY is still a placeholder — edit the script or set the env var." >&2
    exit 1
  fi
  echo "=== Syncing case library: $QA_TEAM_PROJECT  (Zephyr $QA_TEAM_ZEPHYR_KEY) ==="
  if ! run_sync prisma/zephyr-sync.ts "$QA_TEAM_PROJECT" "$QA_TEAM_ZEPHYR_KEY"; then
    echo "!! Case library sync failed — aborting (cycles depend on it)." >&2
    exit 1
  fi
fi

# 2) Cycles per POD.
for entry in "${pods[@]}"; do
  pod="${entry%%:*}"
  key="${entry##*:}"

  if has_placeholder "$key"; then
    echo "-- Skipping $pod: Zephyr key not set ($key)"
    continue
  fi

  echo "=== Syncing cycles: $pod  (Zephyr $key) ==="
  if run_sync prisma/zephyr-sync-cycles.ts "$pod" "$key"; then
    ok_count=$((ok_count + 1))
  else
    fail_count=$((fail_count + 1))
    failed_pods="$failed_pods $pod"
    echo "!! $pod failed" >&2
    if [ "${STOP_ON_ERROR:-0}" = "1" ]; then
      echo "STOP_ON_ERROR set — aborting." >&2
      exit 1
    fi
  fi
done

echo ""
echo "=== Done. $ok_count POD(s) synced, $fail_count failed. ==="
if [ "$fail_count" -gt 0 ]; then
  echo "Failed:$failed_pods" >&2
  exit 1
fi
