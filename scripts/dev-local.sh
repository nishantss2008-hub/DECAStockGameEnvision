#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Local dev stack (npm run dev:local)
#
#    1. a fresh seeded market in the lobby, in a local SQLite file (npm run seed)
#    2. the authority server on :8081 — it owns the data and pushes live updates
#       over SSE (npm run dev:server)
#    3. the web app on :5173 (npm run dev:web)
#
#  Ctrl+C stops everything this script started. No emulators, no Java, no
#  Firebase login, no cloud project: the whole game runs in these two processes.
#
#  Environment:
#    ADMIN_PASSWORD  host password (default: captain)
#    GAME_SEED       fixed market seed (default: a random seed each run)
#    DB_FILE         SQLite database (default: ./data/dev.db, created if missing)
#    FRESH           1 = delete DB_FILE first, for a clean market and roster
#    PORT_OFFSET     whole number added to every port (default 0), so several stacks
#                    can run side by side: PORT_OFFSET=100 uses server 8181 and
#                    web 5273. Use offsets 100 apart.
#    LAN             1 = phones on the same Wi-Fi can open the app: the server and
#                    the web app listen on every network address, and the web app
#                    talks to the server through this computer's LAN IP
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

WAIT_SECONDS=90

SERVER_PID=""
WEB_PID=""

say() { printf '\n[dev:local] %s\n' "$*"; }
fail() { printf '\n[dev:local] %s\n' "$*" >&2; exit 1; }

# ── Process groups ───────────────────────────────────────────────────────────
# Each part runs as the leader of its own process group, so cleanup can stop the
# whole tree (npm → tsx/vite → node) while Ctrl+C reaches only this script.
# Usage: in_new_group cmd args… &   ($! is then the group id)
in_new_group() {
  exec perl -e 'setpgrp(0, 0) or die "setpgrp failed: $!\n"; exec { $ARGV[0] } @ARGV or die "cannot run $ARGV[0]: $!\n";' "$@"
}

group_alive() { kill -0 -- "-$1" 2>/dev/null; }

# While a part starts, its process may not have made its own group yet (perl has not run setpgrp),
# so the process itself counts as alive too. Without this, a fast check reads "stopped" at random.
starting_alive() { group_alive "$1" || kill -0 "$1" 2>/dev/null; }

# Every process descended from the given pids.
descendants() {
  ps -ax -o pid= -o ppid= | awk -v roots=" $* " '
    { parent[$1] = $2 }
    END {
      n = split(roots, r, " ")
      for (i = 1; i <= n; i++) keep[r[i]] = 1
      for (changed = 1; changed; ) {
        changed = 0
        for (p in parent) if (!(p in keep) && (parent[p] in keep)) { keep[p] = 1; changed = 1 }
      }
      for (p in keep) print p
    }'
}

# ── Stop everything we started ───────────────────────────────────────────────
cleanup() {
  local status=$?
  # The stack only ends through Ctrl+C/TERM (130/143) or a failure. Bash 3.2 reports 0 in this
  # trap after a `set -u` error, so a 0 here is an unexpected stop.
  [ "${status}" = 0 ] && status=1
  # A second Ctrl+C (npm forwards the first one too) must not cut the shutdown short.
  trap '' INT TERM
  trap - EXIT
  local groups="" tree="" pid alive i
  for pid in "${WEB_PID}" "${SERVER_PID}"; do
    [ -n "${pid}" ] && groups="${groups} ${pid}"
  done
  if [ -n "${groups}" ]; then
    say "Stopping the web app and the server…"
    tree="$(descendants ${groups})"
    for pid in ${groups}; do kill -TERM -- "-${pid}" 2>/dev/null || true; done
    # TERM first, so the server closes its database cleanly; KILL only if it will not go.
    for i in $(seq 1 20); do
      alive=0
      for pid in ${groups}; do if group_alive "${pid}"; then alive=1; fi; done
      for pid in ${tree}; do if kill -0 "${pid}" 2>/dev/null; then alive=1; fi; done
      [ "${alive}" = 0 ] && break
      if [ "${i}" = 10 ]; then
        for pid in ${tree}; do kill -TERM "${pid}" 2>/dev/null || true; done
      fi
      sleep 0.5
    done
    for pid in ${groups}; do kill -KILL -- "-${pid}" 2>/dev/null || true; done
    for pid in ${tree}; do kill -KILL "${pid}" 2>/dev/null || true; done
    say "Stopped."
  fi
  exit "${status}"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# ── Ports and network mode ───────────────────────────────────────────────────
PORT_OFFSET="${PORT_OFFSET:-0}"
case "${PORT_OFFSET}" in
  '' | *[!0-9]*) fail "PORT_OFFSET must be a whole number, like 100 (it was \"${PORT_OFFSET}\")." ;;
esac
PORT_OFFSET=$((10#${PORT_OFFSET}))
[ "${PORT_OFFSET}" -le 50000 ] || fail "PORT_OFFSET must be 50000 or less, so every port stays below 65536."

LAN="${LAN:-0}"
case "${LAN}" in
  0 | 1) ;;
  *) fail "LAN must be 1 (phones on the same Wi-Fi) or 0 (this computer only)." ;;
esac

SERVER_PORT=$((8081 + PORT_OFFSET))
WEB_PORT=$((5173 + PORT_OFFSET))

# This computer's address on the local network (macOS: Wi-Fi is usually en0, else en1; Linux/WSL: hostname -I).
lan_ip() {
  local ip=""
  if command -v ipconfig >/dev/null 2>&1; then
    ip="$(ipconfig getifaddr en0 2>/dev/null || true)"
    [ -n "${ip}" ] || ip="$(ipconfig getifaddr en1 2>/dev/null || true)"
  fi
  if [ -z "${ip}" ]; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  fi
  printf '%s' "${ip}"
}

if [ "${LAN}" = 1 ]; then
  LAN_IP="$(lan_ip)"
  [ -n "${LAN_IP}" ] || fail "LAN=1 couldn't find this computer's Wi-Fi address (tried ipconfig getifaddr en0 and en1). Connect to Wi-Fi and try again."
  WEB_URL="http://${LAN_IP}:${WEB_PORT}"
  API_BASE="http://${LAN_IP}:${SERVER_PORT}"
  WEB_CHECK_URL="${WEB_URL}/"
  # Browsers on phones send the LAN origin; this computer may still use localhost.
  export CORS_ORIGIN="${CORS_ORIGIN:+${CORS_ORIGIN},}http://${LAN_IP}:${WEB_PORT},http://localhost:${WEB_PORT},http://127.0.0.1:${WEB_PORT}"
else
  LAN_IP=""
  WEB_URL="http://localhost:${WEB_PORT}"
  API_BASE="http://localhost:${SERVER_PORT}"
  WEB_CHECK_URL="${WEB_URL}/"
fi

# ── Helpers ──────────────────────────────────────────────────────────────────
port_busy() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
  else
    curl -s -o /dev/null --max-time 1 "http://localhost:$1/"
  fi
}

# wait_for <name> <url> <pid>: polls the URL until it answers, the process exits, or time runs out.
wait_for() {
  local name=$1 url=$2 pid=$3
  for _ in $(seq 1 $((WAIT_SECONDS * 2))); do
    if curl -s -o /dev/null --max-time 2 "${url}"; then return 0; fi
    starting_alive "${pid}" || fail "${name} stopped before it was ready. See the output above."
    sleep 0.5
  done
  fail "${name} did not start within ${WAIT_SECONDS} seconds (${url})."
}

# ── Preflight ────────────────────────────────────────────────────────────────
[ -d "${ROOT}/node_modules" ] || fail "Dependencies are missing. Run npm install first."

for port in "${SERVER_PORT}" "${WEB_PORT}"; do
  if port_busy "${port}"; then
    fail "Port ${port} is already in use. Stop whatever is using it (lsof -i :${port}), or run a second stack with PORT_OFFSET=100, and try again."
  fi
done

# The shared package is imported from its build output.
if [ ! -f shared/dist/index.js ] || [ -n "$(find shared/src -newer shared/dist/index.js -print -quit)" ]; then
  say "Building the shared package…"
  npm run build:shared
fi

# ── 1. The database ──────────────────────────────────────────────────────────
# One SQLite file holds the whole game. Each stack gets its own, so PORT_OFFSET
# runs never share a market.
if [ -z "${DB_FILE:-}" ]; then
  if [ "${PORT_OFFSET}" = 0 ]; then DB_FILE="${ROOT}/server/data/dev.db"; else DB_FILE="${ROOT}/server/data/dev-${PORT_OFFSET}.db"; fi
fi
export DB_FILE
mkdir -p "$(dirname "${DB_FILE}")"
if [ "${FRESH:-0}" = 1 ]; then
  say "FRESH=1: deleting ${DB_FILE}"
  rm -f "${DB_FILE}" "${DB_FILE}-wal" "${DB_FILE}-shm"
fi
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-captain}"

# ── 2. Seed ──────────────────────────────────────────────────────────────────
say "Creating a market in the lobby (${DB_FILE})…"
npm run seed </dev/null

# ── 3. Server ────────────────────────────────────────────────────────────────
# The server listens on every address (0.0.0.0), so LAN mode needs no extra setting for it.
say "Starting the server on :${SERVER_PORT}…"
in_new_group env PORT="${SERVER_PORT}" DB_FILE="${DB_FILE}" npm run dev:server </dev/null &
SERVER_PID=$!

# ── 4. Web ───────────────────────────────────────────────────────────────────
say "Starting the web app on :${WEB_PORT}…"
WEB_ARGS=(--port "${WEB_PORT}" --strictPort)
if [ "${LAN}" = 1 ]; then WEB_ARGS+=(--host 0.0.0.0); fi
in_new_group env VITE_API_BASE="${API_BASE}" npm run dev -w @deca/web -- "${WEB_ARGS[@]}" </dev/null &
WEB_PID=$!

wait_for "The server" "http://127.0.0.1:${SERVER_PORT}/health" "${SERVER_PID}"
wait_for "The web app" "${WEB_CHECK_URL}" "${WEB_PID}"

say "Ready.
    Web app:       ${WEB_URL}
    Host login:    name \"admin\", password \"${ADMIN_PASSWORD}\"
    Server health: ${API_BASE}/health
    Database:      ${DB_FILE}
    Port offset:   ${PORT_OFFSET}
  Press Ctrl+C to stop everything."

if [ "${LAN}" = 1 ]; then
  printf '\n  ┌────────────────────────────────────────────────────────────┐\n'
  printf '    Open %s on phones on this Wi-Fi\n' "${WEB_URL}"
  printf '  └────────────────────────────────────────────────────────────┘\n'
  # A QR code for the address, only when qrcode-terminal is already installed (it is not a dependency).
  if node -e 'require.resolve("qrcode-terminal")' >/dev/null 2>&1; then
    node -e 'require("qrcode-terminal").generate(process.argv[1], { small: true })' "${WEB_URL}" || true
  fi
  printf '  If a phone cannot connect: allow incoming connections for node when your computer asks,\n'
  printf '  and use a home network or a phone hotspot (school and guest Wi-Fi often block this).\n'
  printf '  Anyone on this network can reach the server, so use LAN=1 only on a network you trust.\n'
fi

# ── Run until Ctrl+C or until any part stops ─────────────────────────────────
while group_alive "${SERVER_PID}" && group_alive "${WEB_PID}"; do
  sleep 1
done
fail "A part of the stack stopped unexpectedly. See the output above."
