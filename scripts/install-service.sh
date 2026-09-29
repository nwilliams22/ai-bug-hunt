#!/usr/bin/env bash
# Installs Bug Finder as an always-on systemd *user* service on this machine.
#
#   ./scripts/install-service.sh [port]
#
# No root. Nothing is written outside ~/.config/systemd/user, and the service
# listens on loopback only. `loginctl enable-linger` is attempted so the course
# is up after a reboot without anyone logging in; if the policy on this machine
# refuses it, the service still starts at login and everything else works.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${1:-8787}"
UNIT_NAME="bug-finder.service"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNIT="$UNIT_DIR/$UNIT_NAME"

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1024 || PORT > 65535 )); then
  echo "Port must be an unprivileged number between 1024 and 65535; got '$PORT'." >&2
  exit 1
fi

NODE="$(command -v node || true)"
if [[ -z "$NODE" ]]; then
  echo "node is not on PATH." >&2
  exit 1
fi
# systemd does not run a login shell, so a version-manager shim resolves to
# nothing at boot. Bake in the absolute path of the interpreter in use now.
NODE="$(readlink -f "$NODE")"

# shellcheck source=scripts/user-bus.sh
source "$DIR/scripts/user-bus.sh"
require_user_systemd

echo "==> Building"
( cd "$DIR" && npm run build )

echo "==> Writing $UNIT"
mkdir -p "$UNIT_DIR"
sed -e "s|@@DIR@@|$DIR|g" -e "s|@@NODE@@|$NODE|g" -e "s|@@PORT@@|$PORT|g" \
  "$DIR/scripts/bug-finder.service.in" > "$UNIT"

echo "==> Enabling"
systemctl --user daemon-reload
systemctl --user enable --now "$UNIT_NAME"

if loginctl enable-linger "$USER" 2>/dev/null; then
  echo "    linger enabled — it will be up after a reboot without logging in"
else
  echo "    could not enable linger (needs authorisation); it will start at login"
fi

echo "==> Verifying"
URL="http://127.0.0.1:$PORT/"
for _ in $(seq 1 40); do
  # No -S: a refused connection on the first attempt is expected while the unit
  # starts, and printing it reads as a failure when the next attempt succeeds.
  if curl -fs --max-time 2 "$URL" -o /dev/null; then
    echo
    echo "Bug Finder is live at $URL"
    echo
    echo "  systemctl --user status bug-finder    # check on it"
    echo "  npm run redeploy                      # rebuild and restart after a change"
    exit 0
  fi
  sleep 0.25
done

echo "The service did not answer on $URL. Recent log:" >&2
systemctl --user --no-pager status "$UNIT_NAME" >&2 || true
journalctl --user -u "$UNIT_NAME" -n 30 --no-pager >&2 || true
exit 1
