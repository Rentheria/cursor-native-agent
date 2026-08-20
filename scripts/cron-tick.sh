#!/usr/bin/env bash
# cron-tick.sh — entrypoint for system cron / systemd timers.
# Install via user crontab or systemd timer; see README.md.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Cron starts with a minimal PATH. Load nvm (if present) and ~/.local/bin so
# `npm`/`node`/`cursor-agent` resolve the same way as in an interactive shell.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "${NVM_DIR}/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR}/nvm.sh"
fi
export PATH="${HOME}/.local/bin:${PATH}"

exec npm run cron
