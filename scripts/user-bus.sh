#!/usr/bin/env bash
# Sourced by the service scripts.
#
# `systemctl --user` needs XDG_RUNTIME_DIR and the session bus address. A
# non-login shell — cron, a detached terminal, an editor's task runner, an
# agent session — often has neither set even though the socket is right there,
# and the error it produces ("Failed to connect to user scope bus") reads as a
# systemd problem rather than an environment one.
: "${XDG_RUNTIME_DIR:=/run/user/$(id -u)}"
export XDG_RUNTIME_DIR
if [[ -z "${DBUS_SESSION_BUS_ADDRESS:-}" && -S "$XDG_RUNTIME_DIR/bus" ]]; then
  export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
fi

require_user_systemd() {
  if ! command -v systemctl >/dev/null 2>&1; then
    echo "systemctl not found. Run 'npm run serve' manually instead." >&2
    return 1
  fi
  if ! systemctl --user show-environment >/dev/null 2>&1; then
    echo "No systemd user session is reachable from this shell." >&2
    echo "Run this from a normal login session, or use 'npm run serve' instead." >&2
    return 1
  fi
}
