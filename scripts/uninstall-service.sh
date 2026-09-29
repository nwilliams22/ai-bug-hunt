#!/usr/bin/env bash
# Removes the always-on service. Your progress is in the browser's local
# storage, not here, so nothing you have written is affected.
set -euo pipefail

UNIT_NAME="bug-finder.service"
UNIT="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/$UNIT_NAME"

# shellcheck source=scripts/user-bus.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/user-bus.sh"

systemctl --user disable --now "$UNIT_NAME" 2>/dev/null || true
rm -f "$UNIT"
systemctl --user daemon-reload
echo "Removed $UNIT. Linger, if it was enabled, is left alone — other user"
echo "services may rely on it. Turn it off with: loginctl disable-linger $USER"
