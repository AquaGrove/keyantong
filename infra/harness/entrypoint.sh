#!/usr/bin/env bash
set -euo pipefail
mkdir -p "${DSH_HOME:-/data/harness}"
DSH_PORT="${DSH_PORT:-3079}"
PROXY_PORT="${PROXY_PORT:-3080}"

# Start loopback-only dsh web (official rejects 0.0.0.0)
# --no-open: container has no browser
echo "[entrypoint] starting dsh web on 127.0.0.1:${DSH_PORT}"
dsh web --no-open --host 127.0.0.1 --port "${DSH_PORT}" &
DSH_PID=$!

# Give dsh a moment; proxy will 502 until ready
sleep 2
echo "[entrypoint] starting proxy on 0.0.0.0:${PROXY_PORT}"
node /opt/dsh/proxy.mjs &
PROXY_PID=$!

term() {
  kill -TERM "$DSH_PID" "$PROXY_PID" 2>/dev/null || true
}
trap term INT TERM

# If either exits, stop the other
while kill -0 "$DSH_PID" 2>/dev/null && kill -0 "$PROXY_PID" 2>/dev/null; do
  sleep 5
done
term
wait || true
exit 1
