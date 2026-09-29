#!/usr/bin/env bash
# Restarts the always-on service after a rebuild. Used by `npm run redeploy`.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/user-bus.sh
source "$DIR/user-bus.sh"
require_user_systemd

if ! systemctl --user is-enabled bug-finder.service >/dev/null 2>&1; then
  echo "bug-finder.service is not installed. Run 'npm run install-service' first." >&2
  exit 1
fi

systemctl --user restart bug-finder.service

PORT="$(systemctl --user show bug-finder.service -p Environment --value |
  tr ' ' '\n' | sed -n 's/^PORT=//p' | head -1)"
PORT="${PORT:-8787}"

for _ in $(seq 1 40); do
  if curl -fs --max-time 2 "http://127.0.0.1:$PORT/" -o /dev/null; then
    echo "Restarted — http://127.0.0.1:$PORT/ is serving the new build."
    exit 0
  fi
  sleep 0.25
done

echo "Restarted, but nothing answered on port $PORT. Recent log:" >&2
journalctl --user -u bug-finder.service -n 30 --no-pager >&2 || true
exit 1
