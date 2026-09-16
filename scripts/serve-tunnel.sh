#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  serve-tunnel.sh — run the whole game from this laptop on a public HTTPS
#  address, with no server to rent and no account to create.
#
#    1. builds the web app
#    2. starts the server on a free port, with the game database in ./data
#    3. opens a Cloudflare quick tunnel and prints the public https:// address
#    4. checks that the live price stream actually survives the tunnel
#
#  Students open the printed address on their phones. Ctrl+C stops everything.
#
#  Requires `cloudflared`. If it is missing this script tells you how to get it
#  (macOS: brew install cloudflared).
#
#  Environment:
#    ADMIN_PASSWORD  host console password. Generated and printed if unset.
#    DB_FILE         SQLite database (default ./data/game.db)
#    PORT            server port (default: the first free port from 8081)
#    FRESH           1 = delete the database first and build a brand new market
#    SKIP_BUILD      1 = reuse the existing web/dist (faster restarts)
#
#  Plain-English walkthrough: docs/DEPLOY-EASY.md
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

# How long to wait for each part to answer. Overridable so the script can be
# exercised quickly without sitting through the full timeouts.
WAIT_SECONDS="${WAIT_SECONDS:-90}"
TUNNEL_WAIT_SECONDS="${TUNNEL_WAIT_SECONDS:-60}"

SERVER_PID=""
TUNNEL_PID=""
TUNNEL_LOG=""

say()  { printf '\n[tunnel] %s\n' "$*"; }
warn() { printf '\n[tunnel] %s\n' "$*" >&2; }
fail() { printf '\n[tunnel] %s\n' "$*" >&2; exit 1; }

# ── Process groups ───────────────────────────────────────────────────────────
# Each part runs as the leader of its own process group so cleanup can stop the
# whole tree (npm → tsx → node) while Ctrl+C reaches only this script.
in_new_group() {
  exec perl -e 'setpgrp(0, 0) or die "setpgrp failed: $!\n"; exec { $ARGV[0] } @ARGV or die "cannot run $ARGV[0]: $!\n";' "$@"
}

group_alive() { kill -0 -- "-$1" 2>/dev/null; }

# While a part starts it may not have made its own group yet, so the process
# itself counts as alive too.
starting_alive() { group_alive "$1" || kill -0 "$1" 2>/dev/null; }

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
  [ "${status}" = 0 ] && status=1
  trap '' INT TERM
  trap - EXIT
  local groups="" tree="" pid alive i
  for pid in "${TUNNEL_PID}" "${SERVER_PID}"; do
    [ -n "${pid}" ] && groups="${groups} ${pid}"
  done
  if [ -n "${groups}" ]; then
    say "Closing the tunnel and stopping the server…"
    tree="$(descendants ${groups})"
    for pid in ${groups}; do kill -TERM -- "-${pid}" 2>/dev/null || true; done
    # TERM first so the server closes its database cleanly; KILL only if it will not go.
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
    say "Stopped. The game is saved in ${DB_FILE:-./data/game.db} — run this again to carry on."
  fi
  [ -n "${TUNNEL_LOG}" ] && rm -f "${TUNNEL_LOG}"
  exit "${status}"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# ── Preflight ────────────────────────────────────────────────────────────────
[ -d "${ROOT}/node_modules" ] || fail "Dependencies are missing. Run: npm install"

if ! command -v cloudflared >/dev/null 2>&1; then
  cat >&2 <<'MISSING'

[tunnel] cloudflared is not installed — that is the program that puts this
         laptop on a public https:// address.

  macOS (Homebrew):   brew install cloudflared
  Windows (winget):   winget install --id Cloudflare.cloudflared
  Linux / other:      https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/

  Then run this script again. Nothing else to set up — no Cloudflare account,
  no credit card, no domain name.

MISSING
  exit 1
fi

port_busy() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
  else
    curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$1/"
  fi
}

# wait_for <name> <url> <pid>
wait_for() {
  local name=$1 url=$2 pid=$3
  for _ in $(seq 1 $((WAIT_SECONDS * 2))); do
    if curl -s -o /dev/null --max-time 2 "${url}"; then return 0; fi
    starting_alive "${pid}" || fail "${name} stopped before it was ready. See the output above."
    sleep 0.5
  done
  fail "${name} did not start within ${WAIT_SECONDS} seconds (${url})."
}

# ── Port ─────────────────────────────────────────────────────────────────────
if [ -n "${PORT:-}" ]; then
  port_busy "${PORT}" && fail "Port ${PORT} is already in use. Pick another, or leave PORT unset to choose one automatically."
  SERVER_PORT="${PORT}"
else
  SERVER_PORT=""
  for candidate in $(seq 8081 8140); do
    if ! port_busy "${candidate}"; then SERVER_PORT="${candidate}"; break; fi
  done
  [ -n "${SERVER_PORT}" ] || fail "No free port between 8081 and 8140. Close some programs and try again."
fi

# ── Database ─────────────────────────────────────────────────────────────────
DB_FILE="${DB_FILE:-${ROOT}/data/game.db}"
export DB_FILE
mkdir -p "$(dirname "${DB_FILE}")"

if [ "${FRESH:-0}" = 1 ]; then
  say "FRESH=1: deleting ${DB_FILE}"
  rm -f "${DB_FILE}" "${DB_FILE}-wal" "${DB_FILE}-shm"
fi

# ── Host password ────────────────────────────────────────────────────────────
# This address is on the public internet, so there is no safe default password.
GENERATED_PASSWORD=0
if [ -z "${ADMIN_PASSWORD:-}" ]; then
  if [ -f "${DB_FILE}" ]; then
    # An existing game already has a host password; leave it alone.
    ADMIN_PASSWORD=""
  else
    ADMIN_PASSWORD="$(node -e '
      const words = ["anchor","barrel","cannon","compass","harbor","kraken","lantern","mutiny","parrot","rigging","sextant","tide"];
      const { randomInt } = require("node:crypto");
      console.log(words[randomInt(words.length)] + "-" + words[randomInt(words.length)] + "-" + String(randomInt(1000)).padStart(3, "0"));
    ')"
    GENERATED_PASSWORD=1
  fi
fi
[ -n "${ADMIN_PASSWORD}" ] && export ADMIN_PASSWORD

# ── Build ────────────────────────────────────────────────────────────────────
if [ "${SKIP_BUILD:-0}" = 1 ] && [ -f "${ROOT}/web/dist/index.html" ]; then
  say "SKIP_BUILD=1: reusing the web app already in web/dist"
else
  say "Building the web app (this takes a minute the first time)…"
  npm run build:web
fi
[ -f "${ROOT}/web/dist/index.html" ] || fail "The web build produced no web/dist/index.html. See the output above."

# ── Market ───────────────────────────────────────────────────────────────────
# Seeding builds a BRAND NEW market and resets every crew to its starting cash,
# so it only runs when there is no database yet. Use FRESH=1 to start over.
if [ ! -f "${DB_FILE}" ]; then
  say "Creating a market in the lobby (${DB_FILE})…"
  npm run seed </dev/null
else
  say "Carrying on with the existing game in ${DB_FILE}"
fi

# ── Server ───────────────────────────────────────────────────────────────────
say "Starting the server on :${SERVER_PORT}…"
in_new_group env PORT="${SERVER_PORT}" DB_FILE="${DB_FILE}" npm run start </dev/null &
SERVER_PID=$!
wait_for "The server" "http://127.0.0.1:${SERVER_PORT}/health" "${SERVER_PID}"

# ── Tunnel ───────────────────────────────────────────────────────────────────
TUNNEL_LOG="$(mktemp -t buccaneer-tunnel)"
say "Opening the public address…"
in_new_group cloudflared tunnel --url "http://127.0.0.1:${SERVER_PORT}" >"${TUNNEL_LOG}" 2>&1 </dev/null &
TUNNEL_PID=$!

PUBLIC_URL=""
for _ in $(seq 1 $((TUNNEL_WAIT_SECONDS * 2))); do
  PUBLIC_URL="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "${TUNNEL_LOG}" 2>/dev/null | head -1 || true)"
  [ -n "${PUBLIC_URL}" ] && break
  starting_alive "${TUNNEL_PID}" || { cat "${TUNNEL_LOG}" >&2; fail "cloudflared stopped before it gave out an address."; }
  sleep 0.5
done
if [ -z "${PUBLIC_URL}" ]; then
  cat "${TUNNEL_LOG}" >&2
  fail "No public address after ${TUNNEL_WAIT_SECONDS} seconds. Check this computer's internet connection and try again."
fi

# The tunnel takes a few more seconds to start answering.
wait_for "The public address" "${PUBLIC_URL}/health" "${TUNNEL_PID}"

# ── Does the live price stream survive the tunnel? ────────────────────────────
# Cloudflare documents that quick tunnels "do not support Server-Sent Events
# (SSE)", which is exactly how prices reach the phones. Rather than trust or
# doubt that, measure it: a working stream sends bytes the instant it opens
# (a `retry:` line and a snapshot), so 8 seconds of silence means it is broken.
#
#   https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/
#
# Checking merely for "some bytes" is not enough: an unauthorized reply, a
# Cloudflare 429 or an error page are all non-empty and would score as a pass.
# A real stream always opens with SSE framing, so insist on seeing it.
looks_like_sse() {
  case "$1" in
    *'event:'* | *'retry:'*) return 0 ;;
    *) return 1 ;;
  esac
}

STREAM_STATUS="skipped"
if [ -n "${ADMIN_PASSWORD}" ]; then
  LOGIN_JSON="$(curl -s --max-time 10 -X POST "http://127.0.0.1:${SERVER_PORT}/auth/login" \
    -H 'content-type: application/json' \
    --data-binary "$(ADMIN_PASSWORD="${ADMIN_PASSWORD}" node -e 'process.stdout.write(JSON.stringify({ name: "admin", password: process.env.ADMIN_PASSWORD }))')" || true)"
  TOKEN="$(printf '%s' "${LOGIN_JSON}" | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try { process.stdout.write(JSON.parse(s).token ?? ""); } catch { process.stdout.write(""); }
    });' 2>/dev/null || true)"

  if [ -n "${TOKEN}" ]; then
    say "Checking that live price updates get through the tunnel…"
    # curl exits 28 on --max-time; that is expected for a stream that stays open.
    BYTES="$(curl -sN --max-time 8 -H "Authorization: Bearer ${TOKEN}" "${PUBLIC_URL}/api/stream" 2>/dev/null | head -c 200 || true)"
    if looks_like_sse "${BYTES}"; then
      STREAM_STATUS="ok"
    else
      LOCAL_BYTES="$(curl -sN --max-time 8 -H "Authorization: Bearer ${TOKEN}" "http://127.0.0.1:${SERVER_PORT}/api/stream" 2>/dev/null | head -c 200 || true)"
      if looks_like_sse "${LOCAL_BYTES}"; then STREAM_STATUS="blocked-by-tunnel"; else STREAM_STATUS="broken-locally"; fi
    fi
  else
    STREAM_STATUS="login-failed"
  fi
fi

# ── Banner ───────────────────────────────────────────────────────────────────
printf '\n\n'
printf '  ╔══════════════════════════════════════════════════════════════════╗\n'
printf '  ║                                                                  ║\n'
printf '  ║   BUCCANEER EXCHANGE IS LIVE                                     ║\n'
printf '  ║                                                                  ║\n'
printf '  ║   Students open this on their phones:                            ║\n'
printf '  ║                                                                  ║\n'
printf '  ║   %-62s ║\n' "${PUBLIC_URL}"
printf '  ║                                                                  ║\n'
printf '  ║   Host console — sign in with:                                   ║\n'
printf '  ║     Crew name:  admin                                            ║\n'
if [ "${GENERATED_PASSWORD}" = 1 ]; then
printf '  ║     Password:   %-49s║\n' "${ADMIN_PASSWORD}  (save this)"
elif [ -n "${ADMIN_PASSWORD}" ]; then
printf '  ║     Password:   %-49s║\n' "(the ADMIN_PASSWORD you set)"
else
printf '  ║     Password:   %-49s║\n' "(unchanged from this game's last run)"
fi
printf '  ║                                                                  ║\n'
printf '  ╚══════════════════════════════════════════════════════════════════╝\n'
printf '\n'

if command -v qrencode >/dev/null 2>&1; then
  qrencode -t ANSIUTF8 -m 2 "${PUBLIC_URL}" 2>/dev/null || true
elif node -e 'require.resolve("qrcode-terminal")' >/dev/null 2>&1; then
  node -e 'require("qrcode-terminal").generate(process.argv[1], { small: true })' "${PUBLIC_URL}" || true
fi

case "${STREAM_STATUS}" in
  ok)
    printf '  Live price updates: WORKING through the tunnel (checked just now).\n' ;;
  blocked-by-tunnel)
    printf '\n'
    printf '  ┌────────────────────────────────────────────────────────────────┐\n'
    printf '  │  STOP — prices will NOT move on the phones.                    │\n'
    printf '  └────────────────────────────────────────────────────────────────┘\n'
    printf '  The live stream works on this laptop but produced nothing through the\n'
    printf '  tunnel. Cloudflare says quick tunnels do not support Server-Sent\n'
    printf '  Events, and that is what the game uses. The app will load and then sit\n'
    printf '  frozen.\n'
    printf '  Do NOT run a graded game on this address. Use a named Cloudflare\n'
    printf '  tunnel or the Render option instead — docs/DEPLOY-EASY.md.\n' ;;
  broken-locally)
    printf '  Live price updates: could NOT be checked — the stream gave nothing even\n'
    printf '  on this laptop. Something is wrong with the server, not the tunnel.\n' ;;
  login-failed)
    printf '  Live price updates: not checked — signing in as "admin" failed, so the\n'
    printf '  host password above may be wrong. Try FRESH=1 to start a new game.\n' ;;
  *)
    printf '  Live price updates: NOT checked — this is a resumed game, so the script does\n'
    printf '  not know the host password. Either sign in and watch a price for 10 seconds\n'
    printf '  before class, or re-run with ADMIN_PASSWORD=... to have it checked for you.\n' ;;
esac

printf '\n  Next steps\n'
printf '    1. Make the crews and print the handout, in a SECOND terminal window:\n'
printf '         node deploy/crew-sheet.mjs --url %s --count 12\n' "${PUBLIC_URL}"
printf '    2. Open the address yourself, sign in as admin, and start the game.\n'
printf '\n  Keep this laptop awake — a sleeping laptop ends the game for everyone.\n'
printf '  Run this in a SECOND terminal window and leave it running:\n'
printf '\n      caffeinate -dimsu -w %s\n' "$$"
printf '\n  (It stops on its own when this script does. Also: keep the lid open, stay\n'
printf '  on the same Wi-Fi, and plug in the charger.)\n'
printf '\n  This address dies when you press Ctrl+C, and a new one is issued next\n'
printf '  time — so print the crew sheets AFTER you see the address above.\n'
printf '\n  Press Ctrl+C to stop everything.\n\n'

# ── Run until Ctrl+C or until any part stops ─────────────────────────────────
while group_alive "${SERVER_PID}" && group_alive "${TUNNEL_PID}"; do
  sleep 1
done
fail "The server or the tunnel stopped unexpectedly. See the output above."
