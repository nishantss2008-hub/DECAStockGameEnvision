#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Local dev stack (npm run dev:local)
#
#    1. Firestore + Auth emulators for the demo-deca project (no Firebase login,
#       never a real project)
#    2. a fresh seeded market in the lobby (npm run seed)
#    3. the authority server on :8081 (npm run dev:server)
#    4. the web app on :5173 in emulator mode (npm run dev:web)
#
#  Ctrl+C stops everything this script started, emulators included.
#
#  Environment:
#    JAVA_HOME       Java 21 for the Firestore emulator (optional if java is on PATH)
#    ADMIN_PASSWORD  host password (default: captain)
#    GAME_SEED       fixed market seed (default: a random seed each run)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

PROJECT_ID="demo-deca"
FIRESTORE_PORT=8080
AUTH_PORT=9099
SERVER_PORT=8081
WEB_PORT=5173
WAIT_SECONDS=90

EMULATOR_PID=""
SERVER_PID=""
WEB_PID=""

say() { printf '\n[dev:local] %s\n' "$*"; }
fail() { printf '\n[dev:local] %s\n' "$*" >&2; exit 1; }

# ── Process groups ───────────────────────────────────────────────────────────
# Each part runs as the leader of its own process group, so cleanup can stop the
# whole tree (npm → tsx/vite → node, firebase → emulators) while Ctrl+C reaches only
# this script. Usage: in_new_group cmd args… &   ($! is then the group id)
in_new_group() {
  exec perl -e 'setpgrp(0, 0) or die "setpgrp failed: $!\n"; exec { $ARGV[0] } @ARGV or die "cannot run $ARGV[0]: $!\n";' "$@"
}

group_alive() { kill -0 -- "-$1" 2>/dev/null; }

# Every process descended from the given pids (firebase-tools starts the Firestore
# emulator's java in a process group of its own, so a group kill alone can miss it).
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
  for pid in "${WEB_PID}" "${SERVER_PID}" "${EMULATOR_PID}"; do
    [ -n "${pid}" ] && groups="${groups} ${pid}"
  done
  if [ -n "${groups}" ]; then
    say "Stopping the web app, server and emulators…"
    tree="$(descendants ${groups})"
    for pid in ${groups}; do kill -TERM -- "-${pid}" 2>/dev/null || true; done
    # One TERM lets firebase-tools shut the emulators down cleanly (a second TERM makes it
    # stop at once). After 10 s, stray descendants get their own TERM; after 20 s, KILL.
    for i in $(seq 1 40); do
      alive=0
      for pid in ${groups}; do if group_alive "${pid}"; then alive=1; fi; done
      for pid in ${tree}; do if kill -0 "${pid}" 2>/dev/null; then alive=1; fi; done
      [ "${alive}" = 0 ] && break
      if [ "${i}" = 20 ]; then
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
    group_alive "${pid}" || fail "${name} stopped before it was ready. See the output above."
    sleep 0.5
  done
  fail "${name} did not start within ${WAIT_SECONDS} seconds (${url})."
}

# ── Preflight ────────────────────────────────────────────────────────────────
if [ -n "${JAVA_HOME:-}" ]; then export PATH="${JAVA_HOME}/bin:${PATH}"; fi
command -v java >/dev/null 2>&1 || fail "The Firestore emulator needs Java 21. Install it, or set JAVA_HOME to a Java 21 home, and try again."
[ -d "${ROOT}/node_modules" ] || fail "Dependencies are missing. Run npm install first."

FIREBASE="${ROOT}/node_modules/.bin/firebase"
[ -x "${FIREBASE}" ] || FIREBASE="firebase"
command -v "${FIREBASE}" >/dev/null 2>&1 || fail "firebase-tools is missing. Run npm install first."

for port in "${FIRESTORE_PORT}" "${AUTH_PORT}" "${SERVER_PORT}" "${WEB_PORT}"; do
  if port_busy "${port}"; then
    fail "Port ${port} is already in use. Stop whatever is using it (lsof -i :${port}) and try again."
  fi
done

# The shared package is imported from its build output.
if [ ! -f shared/dist/index.js ] || [ -n "$(find shared/src -newer shared/dist/index.js -print -quit)" ]; then
  say "Building the shared package…"
  npm run build:shared
fi

# ── 1. Emulators ─────────────────────────────────────────────────────────────
say "Starting the Firestore and Auth emulators (project ${PROJECT_ID})…"
in_new_group "${FIREBASE}" emulators:start --only firestore,auth --project "${PROJECT_ID}" </dev/null &
EMULATOR_PID=$!
wait_for "The Firestore emulator" "http://127.0.0.1:${FIRESTORE_PORT}/" "${EMULATOR_PID}"
wait_for "The Auth emulator" "http://127.0.0.1:${AUTH_PORT}/" "${EMULATOR_PID}"

# Everything below talks to the emulators only. No service account is ever used.
export FIRESTORE_EMULATOR_HOST="127.0.0.1:${FIRESTORE_PORT}"
export FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:${AUTH_PORT}"
export GCLOUD_PROJECT="${PROJECT_ID}"
unset FIREBASE_SERVICE_ACCOUNT FIREBASE_SERVICE_ACCOUNT_FILE GOOGLE_APPLICATION_CREDENTIALS
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-captain}"

# ── 2. Seed ──────────────────────────────────────────────────────────────────
say "Creating a market in the lobby…"
npm run seed </dev/null

# ── 3. Server ────────────────────────────────────────────────────────────────
say "Starting the server on :${SERVER_PORT}…"
in_new_group env PORT="${SERVER_PORT}" npm run dev:server </dev/null &
SERVER_PID=$!

# ── 4. Web ───────────────────────────────────────────────────────────────────
say "Starting the web app on :${WEB_PORT}…"
in_new_group env \
  VITE_USE_EMULATORS=1 \
  VITE_API_BASE="http://localhost:${SERVER_PORT}" \
  VITE_FIREBASE_PROJECT_ID="${PROJECT_ID}" \
  npm run dev:web </dev/null &
WEB_PID=$!

wait_for "The server" "http://localhost:${SERVER_PORT}/health" "${SERVER_PID}"
wait_for "The web app" "http://localhost:${WEB_PORT}/" "${WEB_PID}"

say "Ready.
    Web app:       http://localhost:${WEB_PORT}
    Host login:    name \"admin\", password \"${ADMIN_PASSWORD}\"
    Server health: http://localhost:${SERVER_PORT}/health
    Emulators:     Firestore 127.0.0.1:${FIRESTORE_PORT}, Auth 127.0.0.1:${AUTH_PORT} (project ${PROJECT_ID})
  Press Ctrl+C to stop everything."

# ── Run until Ctrl+C or until any part stops ─────────────────────────────────
while group_alive "${EMULATOR_PID}" && group_alive "${SERVER_PID}" && group_alive "${WEB_PID}"; do
  sleep 1
done
fail "A part of the stack stopped unexpectedly. See the output above."
