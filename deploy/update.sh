#!/usr/bin/env bash
#
# update.sh — deploy the latest code onto a VM that setup-oracle.sh already set up.
#
#   bash /opt/buccaneer/deploy/update.sh
#
# It pulls main, reinstalls dependencies, rebuilds shared + web, restarts the
# service and then proves the server is answering. It never touches
# /var/lib/buccaneer/game.db, /etc/buccaneer.env or the Caddy configuration, so
# the game state and every crew password survive a deploy untouched.
#
# DO NOT run this during a game. The restart drops every live price stream for a
# few seconds; phones reconnect on their own and the engine replays the ticks it
# missed, but there is no reason to make students watch that happen.
#
if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/buccaneer}"
SERVICE_NAME="${SERVICE_NAME:-buccaneer}"
APP_PORT="${APP_PORT:-8081}"
REPO_BRANCH="${REPO_BRANCH:-main}"

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '    \033[32mok\033[0m   %s\n' "$*"; }
warn() { printf '    \033[33mwarn\033[0m %s\n' "$*" >&2; }
die()  { printf '\n\033[31mFAILED:\033[0m %s\n' "$*" >&2; exit 1; }

[ -d "$APP_DIR/.git" ] || die "No git checkout at ${APP_DIR}. Run deploy/setup-oracle.sh first."

# Running this with sudo is the tempting mistake, and it is the expensive one:
# every file npm writes would end up owned by root, and the service — which runs
# as an ordinary user — would then fail to start with a permission error that
# says nothing about sudo. Refuse, and say which account to use.
[ "$(id -u)" -ne 0 ] || die "Do not run this with sudo. Run it as the ordinary user that owns ${APP_DIR}:
     su - $(stat -c '%U' "$APP_DIR" 2>/dev/null || echo ubuntu)
     bash ${APP_DIR}/deploy/update.sh
   (The script uses sudo by itself for the two commands that need it.)"

DIR_OWNER="$(stat -c '%U' "$APP_DIR" 2>/dev/null || echo '')"
if [ -n "$DIR_OWNER" ] && [ "$DIR_OWNER" != "$(id -un)" ]; then
  die "${APP_DIR} belongs to '${DIR_OWNER}', but you are '$(id -un)'.
     Rebuilding as the wrong user leaves files the game server cannot read.
     Switch user and try again:  sudo -u ${DIR_OWNER} bash ${APP_DIR}/deploy/update.sh"
fi

cd "$APP_DIR"

# ---------------------------------------------------------------------------
step "Checking for local edits"
# ---------------------------------------------------------------------------
# Someone editing a file on the server by hand is the classic way a deploy
# quietly reverts a hotfix. Stop and say so rather than throwing the work away.
if [ -n "$(git status --porcelain)" ]; then
  git status --short
  die "There are uncommitted changes in ${APP_DIR}.
     Commit and push them, or throw them away with:
       git -C ${APP_DIR} reset --hard && git -C ${APP_DIR} clean -fd
     then run this script again."
fi
BEFORE="$(git rev-parse --short HEAD)"
ok "clean working tree at ${BEFORE}"

# ---------------------------------------------------------------------------
step "Pulling the latest ${REPO_BRANCH}"
# ---------------------------------------------------------------------------
git fetch --prune origin "$REPO_BRANCH" \
  || die "Could not reach the repository. If this machine uses a deploy key, check it:  ssh -T git@github.com"
git checkout -B "$REPO_BRANCH" "origin/${REPO_BRANCH}" >/dev/null \
  || die "Could not switch to ${REPO_BRANCH}. The git error is above."
git reset --hard "origin/${REPO_BRANCH}"
AFTER="$(git rev-parse --short HEAD)"
if [ "$BEFORE" = "$AFTER" ]; then
  ok "already up to date at ${AFTER} — rebuilding anyway"
else
  ok "${BEFORE} -> ${AFTER}"
  git --no-pager log --oneline "${BEFORE}..${AFTER}" | sed 's/^/    /'
fi

# ---------------------------------------------------------------------------
step "Installing dependencies (npm ci at the workspace root)"
# ---------------------------------------------------------------------------
# `npm ci` throws node_modules away and puts it back, so the running server is
# on borrowed time for the next few minutes. That is fine between games and is
# the reason this script says not to run it during one. Stopping the service
# first would be cleaner but would take the site down for the whole build; this
# way the only real window is the restart below.
npm ci --no-audit --no-fund \
  || die "npm ci failed, and node_modules is now incomplete — the game server will not restart until this is fixed.
     Try once more (it is usually a network blip):  cd ${APP_DIR} && npm ci
     If it keeps failing, go back to the version that worked:
       git -C ${APP_DIR} reset --hard ${BEFORE} && bash ${APP_DIR}/deploy/update.sh"
ok "dependencies installed"

# The one dependency with compiled C++ in it. If a Node upgrade came with this
# deploy, its prebuilt binary may no longer match — better to find that out here
# than from a service that restarts forever.
node -e 'new (require("better-sqlite3"))(":memory:").close()' 2>/dev/null \
  || { warn "better-sqlite3 did not load — rebuilding it from source (a few minutes)"; npm rebuild better-sqlite3 --build-from-source; }
node -e 'new (require("better-sqlite3"))(":memory:").close()' \
  || die "better-sqlite3 will not load, so the server cannot open the database. The error is above."
ok "database engine loads"

# ---------------------------------------------------------------------------
step "Building shared + web"
# ---------------------------------------------------------------------------
npm run build -w @deca/shared
npm run build -w @deca/web
[ -f "$APP_DIR/web/dist/index.html" ] || die "No web/dist/index.html after the build — see the Vite error above."
ok "web/dist rebuilt ($(find "$APP_DIR/web/dist" -type f | wc -l | tr -d ' ') files)"

# ---------------------------------------------------------------------------
step "Restarting ${SERVICE_NAME}.service"
# ---------------------------------------------------------------------------
sudo systemctl restart "$SERVICE_NAME"
ok "restart requested"

# ---------------------------------------------------------------------------
step "Waiting for /health"
# ---------------------------------------------------------------------------
HEALTH=""
for _ in $(seq 1 30); do
  if HEALTH="$(curl -fsS --max-time 3 "http://127.0.0.1:${APP_PORT}/health" 2>/dev/null)"; then break; fi
  HEALTH=""
  sleep 2
done

# ---------------------------------------------------------------------------
step "Last 20 log lines"
# ---------------------------------------------------------------------------
sudo journalctl -u "$SERVICE_NAME" -n 20 --no-pager --output=short

if [ -z "$HEALTH" ]; then
  die "The server is not answering on http://127.0.0.1:${APP_PORT}/health after 60 seconds.
     The log above says why. To go back to the previous version:
       git -C ${APP_DIR} reset --hard ${BEFORE} && bash ${APP_DIR}/deploy/update.sh"
fi

printf '\n'
if printf '%s' "$HEALTH" | grep -q '"ok":true'; then
  ok "/health returns ok"
else
  warn "/health answered but did not contain \"ok\":true — read it carefully:"
fi
printf '    %s\n' "$HEALTH"
# Node is already installed here, so read the JSON with it rather than adding a
# jq dependency just for one line of output.
printf '%s' "$HEALTH" | node -e '
  let raw = "";
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    try {
      const h = JSON.parse(raw);
      console.log(`    phase=${h.phase} tick=${h.tick}/${h.totalTicks} ticksBehind=${h.ticksBehind}`);
      if (h.ticksBehind > 2) {
        console.log("    (the engine is catching up on ticks it missed during the restart — this is expected)");
      }
    } catch {
      /* /health is not JSON we recognise; the raw line above is what matters. */
    }
  });
'

# ---------------------------------------------------------------------------
step "Checking the public address"
# ---------------------------------------------------------------------------
# Everything above only proved the loopback port. This is the address students
# actually type, so it is the one that matters.
PUBLIC_URL="$(sudo sed -n 's/^CORS_ORIGIN=//p' "${ENV_FILE:-/etc/buccaneer.env}" 2>/dev/null | head -n 1 | tr -d '"')"
if [ -z "$PUBLIC_URL" ] || [ "$PUBLIC_URL" = "*" ]; then
  warn "CORS_ORIGIN in /etc/buccaneer.env is not a URL — skipping the public check."
elif curl -fsS --max-time 10 "${PUBLIC_URL}/health" >/dev/null 2>&1; then
  ok "${PUBLIC_URL}/health responds over HTTPS"
else
  warn "${PUBLIC_URL}/health did not respond. Caddy or DNS, not your code:"
  warn "  sudo journalctl -u caddy -n 30 --no-pager"
  warn "  sudo systemctl start duckdns-update.service"
fi

cat <<EOF

  Deployed ${AFTER}.

  Follow the log:   sudo journalctl -u ${SERVICE_NAME} -f
  Roll back:        git -C ${APP_DIR} reset --hard ${BEFORE} && bash ${APP_DIR}/deploy/update.sh

EOF
