#!/bin/sh
set -e

# Apply kernel iptables network isolation rules for UID 1001 (sandbox_user)
if command -v iptables >/dev/null 2>&1; then
  echo "[Sandbox Init] Applying kernel network isolation for UID 1001 (sandbox_user)..."
  iptables -F || true
  iptables -A OUTPUT -m owner --uid-owner 1001 -j DROP 2>/dev/null || true
  iptables -A INPUT -m owner --uid-owner 1001 -j DROP 2>/dev/null || true
  echo "[Sandbox Init] Network disabled for sandbox_user."
fi

# Hand off execution to dumb-init
exec "$@"
