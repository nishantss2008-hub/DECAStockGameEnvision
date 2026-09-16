#!/usr/bin/env bash
#
# setup-oracle.sh — put Buccaneer Exchange on a fresh Oracle Cloud Always Free VM.
#
# Run this ONCE, as the ordinary `ubuntu` user (NOT as root), on a brand-new
# Ubuntu 24.04 instance. It is safe to run again: every step checks first and
# skips work that is already done, so if it fails halfway you fix the cause and
# re-run the whole thing.
#
#   curl -fsSL https://raw.githubusercontent.com/OWNER/REPO/main/deploy/setup-oracle.sh -o setup-oracle.sh
#   bash setup-oracle.sh
#
# What it ends up with:
#   /opt/buccaneer          the code (owned by you, read-only to the service)
#   /var/lib/buccaneer      game.db — the ONLY thing that must survive a redeploy
#   /etc/buccaneer.env      the server's secrets (mode 600, root-owned)
#   buccaneer.service       the game server on 127.0.0.1:8081, restarts on crash/reboot
#   caddy.service           HTTPS on your DuckDNS name, proxying to 8081
#   duckdns-update.timer    keeps the DuckDNS name pointed at this VM (every 5 min)
#   litestream.service      continuous SQLite backup to Backblaze B2 (optional)
#
# Nothing secret is ever echoed, written to your shell history by this script,
# or committed. Passwords are read with `read -rs`.
#
# Sources for the non-obvious bits (checked 2026-09-15):
#   Oracle Always Free allowances / idle reclamation
#     https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
#   Oracle: DO NOT use UFW on Ubuntu images; edit iptables instead
#     https://docs.oracle.com/en-us/iaas/Content/Compute/References/bestpracticescompute.htm#firewall
#     https://docs.oracle.com/en-us/iaas/Content/Compute/known-issues.htm  ("Ubuntu instance fails to reboot after enabling UFW")
#   Default VCN security list opens only 22 + ICMP
#     https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/securitylists.htm
#   NodeSource apt install for Ubuntu Noble (Node 18/20/21/22/23/24 all supported)
#     https://github.com/nodesource/distributions/blob/master/DEV_README.md
#   Caddy official apt repository
#     https://caddyserver.com/docs/install
#   Caddy flushes text/event-stream immediately (SSE needs no extra config)
#     https://caddyserver.com/docs/caddyfile/directives/reverse_proxy
#   DuckDNS update URL + 5-minute interval
#     https://www.duckdns.org/install.jsp
#   Litestream v0.5 config (`replica:` singular; `replicas:` is deprecated) and B2 guide
#     https://litestream.io/reference/config/   https://litestream.io/guides/backblaze/
#   Litestream releases (asset naming)
#     https://github.com/benbjohnson/litestream/releases
#

# This script uses bash features (arrays of options, `local`, `read -rs`). Being
# run as `sh setup-oracle.sh` is an easy mistake to make, so re-run ourselves
# under bash rather than failing in a confusing way halfway through.
if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

# -E so the friendly "run it again" message below also fires for a failure
# inside a function or a ( subshell ), not only at the top level.
set -Eeuo pipefail

# ---------------------------------------------------------------------------
# Settings. Everything here can be overridden from the environment, e.g.
#   NODE_MAJOR=24 DUCKDNS_SUBDOMAIN=decastock bash setup-oracle.sh
# ---------------------------------------------------------------------------
REPO_URL="${REPO_URL:-https://github.com/nishantss2008-hub/DECAStockGameEnvision.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"

APP_DIR="${APP_DIR:-/opt/buccaneer}"
DATA_DIR="${DATA_DIR:-/var/lib/buccaneer}"
ENV_FILE="${ENV_FILE:-/etc/buccaneer.env}"
SERVICE_NAME="${SERVICE_NAME:-buccaneer}"
APP_PORT="${APP_PORT:-8081}"

# Node 22 is the current Active LTS line and has better-sqlite3 prebuilds for
# both arm64 and amd64. Pinned on purpose: an unpinned "latest" is how a working
# VM breaks itself three months later.
NODE_MAJOR="${NODE_MAJOR:-22}"

# Pinned so a future Litestream release cannot change the config schema under us.
LITESTREAM_VERSION="${LITESTREAM_VERSION:-0.5.17}"

DUCKDNS_SUBDOMAIN="${DUCKDNS_SUBDOMAIN:-}"   # just the label, e.g. "decastock"
DUCKDNS_TOKEN="${DUCKDNS_TOKEN:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"         # the host (teacher) sign-in password

SKIP_LITESTREAM="${SKIP_LITESTREAM:-}"       # set to 1 to skip backups entirely
B2_BUCKET="${B2_BUCKET:-}"
B2_ENDPOINT="${B2_ENDPOINT:-}"               # e.g. s3.us-west-004.backblazeb2.com
B2_KEY_ID="${B2_KEY_ID:-}"
B2_APP_KEY="${B2_APP_KEY:-}"
B2_PATH="${B2_PATH:-buccaneer/game.db}"
LITESTREAM_ENV_FILE="${LITESTREAM_ENV_FILE:-/etc/litestream.env}"
LITESTREAM_CONFIG="${LITESTREAM_CONFIG:-/etc/litestream.yml}"

DUCKDNS_ENV_FILE=/etc/duckdns.env
DUCKDNS_SCRIPT=/usr/local/bin/duckdns-update.sh

# ---------------------------------------------------------------------------
# Output helpers. Progress goes to stdout, problems to stderr.
# ---------------------------------------------------------------------------
STEP_N=0
step()  { STEP_N=$((STEP_N + 1)); printf '\n\033[1;36m[%2d] %s\033[0m\n' "$STEP_N" "$*"; }
ok()    { printf '     \033[32mok\033[0m   %s\n' "$*"; }
skip()  { printf '     \033[90mskip\033[0m %s\n' "$*"; }
info()  { printf '     ---- %s\n' "$*"; }
warn()  { printf '     \033[33mwarn\033[0m %s\n' "$*" >&2; }
die()   { printf '\n\033[31mFAILED:\033[0m %s\n' "$*" >&2; exit 1; }
have()  { command -v "$1" >/dev/null 2>&1; }

# Escape a value for a systemd EnvironmentFile. systemd understands double
# quotes with C-style escapes and does NOT expand $VAR there, so escaping
# backslash and double-quote is enough.
#
# IMPORTANT: this is safe for /etc/buccaneer.env, which ONLY systemd ever reads.
# It is NOT safe for a file that a shell sources, because `sh` *does* expand
# $VAR and `cmd` inside double quotes. Values that end up in a shell-sourced
# file go through require_plain_value below instead.
env_quote() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

# /etc/duckdns.env and /etc/litestream.env are read BOTH by systemd and by a
# /bin/sh script that sources them, and the two disagree about quoting. Rather
# than pick an escaping that is right for one and wrong for the other, refuse
# anything that is not plainly unambiguous to both. Every value that goes in
# these files — a DuckDNS token (a UUID), a Backblaze keyID and applicationKey,
# a bucket name, an endpoint — is drawn from this character set already, so in
# practice this only ever fires on a copy-paste mistake.
require_plain_value() {
  # $1 = human name, $2 = value
  case "$2" in
    '')             die "$1 is empty." ;;
    *[!A-Za-z0-9._:/+=-]*)
      die "$1 contains a character this installer will not write to a settings file.
     Allowed: letters, digits, and  . _ : / + = -
     That usually means a stray space, quote or newline came along with a
     copy-paste. Copy the value again and re-run." ;;
  esac
}

# Read one line without echoing it, then a newline so output stays tidy.
read_secret() {
  # $1 = prompt, sets REPLY_SECRET
  printf '     %s' "$1" >&2
  IFS= read -rs REPLY_SECRET
  printf '\n' >&2
}

# Pull a single value out of an existing root-owned env file without printing it.
# Reverses env_quote: strips the wrapping quotes, then unescapes \" and \\.
existing_env_value() {
  # $1 = file, $2 = key
  sudo test -f "$1" || return 1
  sudo sed -n "s/^$2=//p" "$1" \
    | head -n 1 \
    | sed -e 's/^"//' -e 's/"$//' -e 's/\\"/"/g' -e 's/\\\\/\\/g'
}

# Atomically install a file we built in a temp location, with owner + mode.
# The temp file is removed either way: a failed install must not leave a copy of
# a secret sitting in /tmp.
install_file() {
  # $1 = source temp file, $2 = destination, $3 = mode
  local rc=0
  sudo install -o root -g root -m "$3" "$1" "$2" || rc=$?
  rm -f "$1"
  return "$rc"
}

# Stop the game server if it is running. `npm ci` deletes and rebuilds
# node_modules underneath a running server, which is not something to do to a
# process that is serving phones. The last step of this script starts it again.
stop_service_for_work() {
  if sudo systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    info "stopping ${SERVICE_NAME} while the code is rebuilt (the game is offline for a few minutes)"
    sudo systemctl stop "$SERVICE_NAME"
  fi
}

# `systemctl enable` that actually tells you when it did not work — a unit that
# silently failed to enable is a machine that does not come back after a reboot.
enable_unit() {
  # $1 = unit name
  sudo systemctl enable "$1" >/dev/null 2>&1 || true
  case "$(sudo systemctl is-enabled "$1" 2>/dev/null)" in
    enabled|enabled-runtime|static|indirect|alias|generated) return 0 ;;
    *)
      sudo systemctl enable "$1" || true
      die "Could not enable ${1} to start at boot. The machine would not come back on its own after a reboot, so this is worth fixing before your event. The error is above."
      ;;
  esac
}

trap 'printf "\n\033[31mSetup stopped.\033[0m Fix the error above and run this script again — it picks up where it left off\nand never touches a game that is already on the machine.\nIf the game server was running before, start it again with:  sudo systemctl start %s\n" "${SERVICE_NAME:-buccaneer}" >&2' ERR

cat <<'BANNER'

  ============================================================
    Buccaneer Exchange  ·  Oracle Cloud Always Free installer
  ============================================================

BANNER

# ---------------------------------------------------------------------------
step "Checking this machine"
# ---------------------------------------------------------------------------
[ "$(id -u)" -ne 0 ] || die "Run this as the normal 'ubuntu' user, not as root. The script calls sudo where it needs to."
have sudo || die "sudo is not installed. This script expects a stock Oracle Ubuntu image."
sudo -n true 2>/dev/null || sudo true || die "This user cannot use sudo."

RUN_USER="$(id -un)"
RUN_GROUP="$(id -gn)"

[ -r /etc/os-release ] || die "No /etc/os-release — this does not look like Ubuntu."
# shellcheck disable=SC1091
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] || die "This installer targets Ubuntu. Found: ${PRETTY_NAME:-unknown}"
case "${VERSION_ID:-}" in
  24.04) ok "Ubuntu 24.04 (Noble) — the tested version" ;;
  22.04) warn "Ubuntu 22.04 detected. It should work, but 24.04 is what was tested." ;;
  *)     warn "Ubuntu ${VERSION_ID:-?} detected. Untested; continuing." ;;
esac

ARCH="$(uname -m)"
case "$ARCH" in
  aarch64) LITESTREAM_ARCH=arm64  ; ok "Architecture aarch64 (Ampere A1)" ;;
  x86_64)  LITESTREAM_ARCH=x86_64 ; ok "Architecture x86_64 (AMD E2.1.Micro)" ;;
  *)       die "Unsupported architecture '$ARCH'. Expected aarch64 (Ampere A1) or x86_64 (E2.1.Micro)." ;;
esac

MEM_KB="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
MEM_MB=$((MEM_KB / 1024))
info "RAM: ${MEM_MB} MB · running as: ${RUN_USER}"

# ---------------------------------------------------------------------------
step "Collecting the things only you know"
# ---------------------------------------------------------------------------
# Anything already set in the environment is used as-is; the rest is prompted
# for, but only if there is a terminal to prompt on.
INTERACTIVE=0
[ -t 0 ] && INTERACTIVE=1

if [ -z "$DUCKDNS_SUBDOMAIN" ]; then
  if [ "$INTERACTIVE" -eq 1 ]; then
    printf '     DuckDNS subdomain (just the label, e.g. decastock): ' >&2
    IFS= read -r DUCKDNS_SUBDOMAIN
  else
    die "DUCKDNS_SUBDOMAIN is not set and there is no terminal to ask on."
  fi
fi
DUCKDNS_SUBDOMAIN="${DUCKDNS_SUBDOMAIN%%.duckdns.org}"
case "$DUCKDNS_SUBDOMAIN" in
  ''|*[!a-z0-9-]*) die "DuckDNS subdomain must be lowercase letters, digits and hyphens only. Got: '$DUCKDNS_SUBDOMAIN'" ;;
esac
SITE_HOST="${DUCKDNS_SUBDOMAIN}.duckdns.org"
SITE_URL="https://${SITE_HOST}"
ok "Site will be ${SITE_URL}"

if [ -z "$DUCKDNS_TOKEN" ]; then
  if [ "$INTERACTIVE" -eq 1 ]; then
    read_secret "DuckDNS token (from duckdns.org, not shown as you type): "
    DUCKDNS_TOKEN="$REPLY_SECRET"; unset REPLY_SECRET
  else
    die "DUCKDNS_TOKEN is not set and there is no terminal to ask on."
  fi
fi
require_plain_value "The DuckDNS token" "$DUCKDNS_TOKEN"
ok "DuckDNS token captured"

# The host password. Keep an already-installed one if the operator just presses
# Enter, so re-running the script does not silently change the teacher's login.
EXISTING_ADMIN=""
if sudo test -f "$ENV_FILE"; then
  EXISTING_ADMIN="$(existing_env_value "$ENV_FILE" ADMIN_PASSWORD || true)"
fi
# Only a password chosen right now has to clear the 12-character minimum. One
# that is already installed is accepted as-is with a warning, so a re-run of the
# installer can never be blocked by a choice made months ago.
ADMIN_PASSWORD_IS_NEW=1
if [ -z "$ADMIN_PASSWORD" ]; then
  if [ "$INTERACTIVE" -eq 1 ]; then
    if [ -n "$EXISTING_ADMIN" ]; then
      read_secret "Host password [Enter to keep the one already installed]: "
    else
      read_secret "Host password — the teacher's sign-in, 12 characters or more: "
    fi
    ADMIN_PASSWORD="$REPLY_SECRET"; unset REPLY_SECRET
    if [ -z "$ADMIN_PASSWORD" ] && [ -n "$EXISTING_ADMIN" ]; then
      ADMIN_PASSWORD="$EXISTING_ADMIN"
      ADMIN_PASSWORD_IS_NEW=0
      ok "Keeping the host password already installed"
    else
      read_secret "Host password again: "
      [ "$ADMIN_PASSWORD" = "$REPLY_SECRET" ] || die "The two host passwords did not match."
      unset REPLY_SECRET
    fi
  elif [ -n "$EXISTING_ADMIN" ]; then
    ADMIN_PASSWORD="$EXISTING_ADMIN"
    ADMIN_PASSWORD_IS_NEW=0
  else
    die "ADMIN_PASSWORD is not set and there is no terminal to ask on."
  fi
fi
# The host login can start, pause and end the game, reset every crew's password
# and hand out money. The server answers up to 240 sign-in attempts a minute, so
# a short password really is guessable; 12 characters is the floor, not advice.
if [ "$ADMIN_PASSWORD_IS_NEW" -eq 1 ]; then
  [ "${#ADMIN_PASSWORD}" -ge 12 ] || die "The host password must be at least 12 characters. It can start and end the game and reset every crew's password, so it is the one password on this machine worth making long. Four unrelated words is plenty: 'anchor-gale-tin-mast'."
else
  [ "${#ADMIN_PASSWORD}" -ge 12 ] || warn "The host password already installed is under 12 characters. Change it with: sudo nano ${ENV_FILE}  (then: sudo systemctl restart ${SERVICE_NAME})"
fi
ok "Host password captured (never printed, never logged)"

# Backblaze B2, or explicitly skipped.
if [ -z "$SKIP_LITESTREAM" ] && [ -z "$B2_BUCKET" ] && [ "$INTERACTIVE" -eq 1 ]; then
  printf '     Backblaze B2 bucket name (Enter to skip backups for now): ' >&2
  IFS= read -r B2_BUCKET
fi
if [ -z "$B2_BUCKET" ]; then
  SKIP_LITESTREAM=1
  warn "No B2 bucket given — continuous backup will NOT be installed."
  warn "The game will run, but if Oracle reclaims this VM the history is gone. Re-run with B2_BUCKET set to add it later."
else
  if [ -z "$B2_ENDPOINT" ] && [ "$INTERACTIVE" -eq 1 ]; then
    printf '     B2 S3 endpoint from the bucket page (e.g. s3.us-west-004.backblazeb2.com): ' >&2
    IFS= read -r B2_ENDPOINT
  fi
  B2_ENDPOINT="${B2_ENDPOINT#https://}"
  B2_ENDPOINT="${B2_ENDPOINT%/}"
  case "$B2_ENDPOINT" in
    s3.*.backblazeb2.com) ok "B2 endpoint ${B2_ENDPOINT}" ;;
    '') die "B2 endpoint is required when a bucket is given." ;;
    *)  warn "'$B2_ENDPOINT' does not look like s3.<region>.backblazeb2.com — continuing, but check the bucket page if backups fail." ;;
  esac
  if [ -z "$B2_KEY_ID" ]; then
    if [ "$INTERACTIVE" -eq 1 ]; then
      printf '     B2 application keyID: ' >&2
      IFS= read -r B2_KEY_ID
    else
      die "B2_KEY_ID is not set and there is no terminal to ask on."
    fi
  fi
  if [ -z "$B2_APP_KEY" ]; then
    if [ "$INTERACTIVE" -eq 1 ]; then
      read_secret "B2 applicationKey (shown only once by Backblaze): "
      B2_APP_KEY="$REPLY_SECRET"; unset REPLY_SECRET
    else
      die "B2_APP_KEY is not set and there is no terminal to ask on."
    fi
  fi
  require_plain_value "The B2 bucket name"   "$B2_BUCKET"
  require_plain_value "The B2 endpoint"      "$B2_ENDPOINT"
  require_plain_value "The B2 keyID"         "$B2_KEY_ID"
  require_plain_value "The B2 applicationKey" "$B2_APP_KEY"
  require_plain_value "The B2 path"          "$B2_PATH"
  ok "B2 credentials captured"
fi

# ---------------------------------------------------------------------------
step "Installing system packages"
# ---------------------------------------------------------------------------
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -qq
# build-essential + python3 because better-sqlite3 falls back to compiling from
# source when no prebuilt binary matches this Node/arch combination.
# sqlite3 so you can inspect game.db by hand when something looks wrong.
sudo apt-get install -y -qq \
  ca-certificates curl gnupg git unzip build-essential python3 sqlite3 \
  debian-keyring debian-archive-keyring apt-transport-https
ok "base packages installed"

# ---------------------------------------------------------------------------
step "Making sure the build has enough memory"
# ---------------------------------------------------------------------------
# The Vite build of the web app peaks around 1 GB. On a 1 GB E2.1.Micro that is
# an out-of-memory kill with a confusing message, so add swap once.
if [ "$MEM_MB" -lt 2048 ]; then
  if [ -f /swapfile ]; then
    skip "/swapfile already exists"
  else
    info "Only ${MEM_MB} MB of RAM — creating a 2 GB swap file so the web build does not get OOM-killed"
    # fallocate is instant but can leave an extent layout that swapon refuses
    # ("it appears to have holes"), so fall back to dd, which is slow and always
    # works, if any part of the fast path fails.
    if ! { sudo fallocate -l 2G /swapfile \
        && sudo chmod 600 /swapfile \
        && sudo mkswap /swapfile >/dev/null 2>&1 \
        && sudo swapon /swapfile; }; then
      info "fallocate route did not take — writing the swap file the slow way (about a minute)"
      sudo swapoff /swapfile 2>/dev/null || true
      sudo rm -f /swapfile
      sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
      sudo chmod 600 /swapfile
      sudo mkswap /swapfile >/dev/null
      sudo swapon /swapfile
    fi
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
    ok "2 GB swap file active and enabled at boot"
  fi
else
  skip "${MEM_MB} MB of RAM is plenty — no swap needed"
fi

# ---------------------------------------------------------------------------
step "Installing Node.js ${NODE_MAJOR}"
# ---------------------------------------------------------------------------
NODE_CURRENT=""
have node && NODE_CURRENT="$(node --version 2>/dev/null | sed 's/^v//' | cut -d. -f1)"
if [ "$NODE_CURRENT" = "$NODE_MAJOR" ]; then
  skip "Node $(node --version) already installed"
else
  info "Adding the NodeSource repository for Node ${NODE_MAJOR}.x"
  NODE_SETUP="$(mktemp)"
  NODE_LOG="$(mktemp)"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" -o "$NODE_SETUP" \
    || die "Could not download NodeSource's setup script. Check this machine has internet: curl -I https://deb.nodesource.com"
  # `sudo env VAR=...` rather than `sudo -E`: -E needs a sudoers privilege this
  # user may not have, while `env` is just a command. NodeSource's script prints
  # its errors on stdout, so capture and show them instead of >/dev/null, which
  # would leave a beginner staring at a bare failure.
  if ! sudo env DEBIAN_FRONTEND=noninteractive bash "$NODE_SETUP" >"$NODE_LOG" 2>&1; then
    tail -n 20 "$NODE_LOG" | sed 's/^/     /'
    rm -f "$NODE_SETUP" "$NODE_LOG"
    die "NodeSource's setup script failed. The last lines are above."
  fi
  rm -f "$NODE_SETUP" "$NODE_LOG"
  sudo apt-get install -y -qq nodejs
fi

# Whatever route we took, the build has to happen on the Node we expect. apt
# will not downgrade across majors on its own, so a machine that already had a
# different Node quietly keeps it — which shows up much later as a confusing
# build error. Check it here, where the fix is one line.
have node || die "Node is still not installed. Try again: sudo apt-get install -y nodejs"
NODE_CURRENT="$(node --version | sed 's/^v//' | cut -d. -f1)"
if [ "$NODE_CURRENT" != "$NODE_MAJOR" ]; then
  die "This machine is running Node ${NODE_CURRENT}, but the installer asked for Node ${NODE_MAJOR}.
     Either accept what is here:   NODE_MAJOR=${NODE_CURRENT} bash setup-oracle.sh
     or force the switch:          sudo apt-get install -y --allow-downgrades nodejs && bash setup-oracle.sh"
fi
NPM_BIN="$(command -v npm)"
[ -n "$NPM_BIN" ] || die "npm is missing after installing Node."
ok "Node $(node --version), npm $(npm --version)"

# ---------------------------------------------------------------------------
step "Creating ${APP_DIR} and ${DATA_DIR}"
# ---------------------------------------------------------------------------
# The database deliberately lives OUTSIDE the code directory so that a redeploy
# (git reset --hard, npm ci) can never touch it.
sudo mkdir -p "$APP_DIR" "$DATA_DIR"
sudo chown "$RUN_USER":"$RUN_GROUP" "$APP_DIR" "$DATA_DIR"
sudo chmod 755 "$APP_DIR"
sudo chmod 750 "$DATA_DIR"
ok "$APP_DIR (code) and $DATA_DIR (game.db) owned by ${RUN_USER}"

# ---------------------------------------------------------------------------
step "Fetching the code"
# ---------------------------------------------------------------------------
if [ -d "$APP_DIR/.git" ]; then
  info "Repository already here — updating to the latest ${REPO_BRANCH}"
  git -C "$APP_DIR" remote set-url origin "$REPO_URL"
  git -C "$APP_DIR" fetch --prune origin "$REPO_BRANCH"
  git -C "$APP_DIR" checkout -B "$REPO_BRANCH" "origin/${REPO_BRANCH}"
  git -C "$APP_DIR" reset --hard "origin/${REPO_BRANCH}"
else
  # A directory that has files in it but no .git is the leftover of a clone that
  # was interrupted. git would refuse with "destination path already exists",
  # and the private-repo advice below would then be the wrong advice.
  if [ -n "$(ls -A "$APP_DIR" 2>/dev/null)" ]; then
    die "${APP_DIR} already has files in it, but it is not a git checkout — almost
     always a download that was interrupted. Clear it out and run this again:
       sudo rm -rf ${APP_DIR} && bash setup-oracle.sh
     (This removes only the CODE. Your game is in ${DATA_DIR} and is not touched.)"
  fi
  if ! git clone --branch "$REPO_BRANCH" "$REPO_URL" "$APP_DIR"; then
    die "Could not clone ${REPO_URL}.

     If the repository is PRIVATE, GitHub refuses an anonymous clone and this is
     what you see. Give this machine a read-only deploy key — copy and paste all
     four lines:

       ssh-keygen -t ed25519 -C buccaneer-vm -f ~/.ssh/id_ed25519 -N ''
       ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts
       chmod 600 ~/.ssh/known_hosts
       cat ~/.ssh/id_ed25519.pub

     Copy the line that prints. On github.com open the repository, then
     Settings > Deploy keys > Add deploy key, paste it, leave 'Allow write
     access' UNCHECKED, and save. Then run the installer again like this:

       REPO_URL=git@github.com:OWNER/REPO.git bash setup-oracle.sh

     (The ssh-keyscan line matters: without it git stops to ask whether it
     trusts github.com, and an installer has nobody to answer.)"
  fi
fi
ok "at commit $(git -C "$APP_DIR" rev-parse --short HEAD) on ${REPO_BRANCH}"

# ---------------------------------------------------------------------------
step "Installing dependencies and building"
# ---------------------------------------------------------------------------
# `npm ci` deletes node_modules and puts it back. Doing that under a running
# server is how a re-run on a live machine turns into a mystery, so stop first.
stop_service_for_work

# Root install, not server/ — this is one npm workspace (shared, server, web).
info "npm ci (this is the slow one — 2 to 5 minutes)"
( cd "$APP_DIR" && npm ci --no-audit --no-fund )

# better-sqlite3 is the one dependency with compiled C++ in it. It normally
# downloads a prebuilt binary for this Node + architecture; when no prebuild
# matches it compiles from source, which is why build-essential and python3 are
# installed above. Prove it actually loads now, where the message can be useful,
# rather than at 8am as a service that will not start.
if ! ( cd "$APP_DIR" && node -e 'new (require("better-sqlite3"))(":memory:").close()' ) 2>/dev/null; then
  info "better-sqlite3 did not load — rebuilding it from source (2 to 4 minutes on an Arm machine)"
  if ! ( cd "$APP_DIR" && npm rebuild better-sqlite3 --build-from-source ); then
    die "better-sqlite3 could not be built on this machine. The compiler output is above.
     Almost always one of:
       * build tools missing —  sudo apt-get install -y build-essential python3
       * out of memory (1 GB machines) — check 'free -h'; the installer adds swap
         when RAM is under 2 GB, so re-running this script usually fixes it
     Then run this script again."
  fi
  ( cd "$APP_DIR" && node -e 'new (require("better-sqlite3"))(":memory:").close()' ) \
    || die "better-sqlite3 still will not load after rebuilding. The output above is the real error."
  ok "better-sqlite3 rebuilt from source"
else
  ok "better-sqlite3 loads (the database engine works on this machine)"
fi

info "building @deca/shared"
( cd "$APP_DIR" && npm run build -w @deca/shared )
info "building @deca/web"
( cd "$APP_DIR" && npm run build -w @deca/web )
WEB_DIR="$APP_DIR/web/dist"
[ -f "$WEB_DIR/index.html" ] || die "The web build produced no ${WEB_DIR}/index.html. Scroll up for the Vite error."
ok "web app built into ${WEB_DIR}"

# ---------------------------------------------------------------------------
step "Writing ${ENV_FILE}"
# ---------------------------------------------------------------------------
# SESSION_SECRET signs the login tokens. Keep the existing one when re-running,
# otherwise every phone in the room is signed out mid-game.
SESSION_SECRET="${SESSION_SECRET:-}"
if [ -z "$SESSION_SECRET" ] && sudo test -f "$ENV_FILE"; then
  SESSION_SECRET="$(existing_env_value "$ENV_FILE" SESSION_SECRET || true)"
  [ -n "$SESSION_SECRET" ] && info "reusing the SESSION_SECRET already installed (keeps signed-in phones signed in)"
fi
if [ -z "$SESSION_SECRET" ]; then
  SESSION_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
  info "generated a new 48-byte SESSION_SECRET"
fi

ENV_TMP="$(umask 077; mktemp)"
cat >"$ENV_TMP" <<EOF
# Buccaneer Exchange — written by deploy/setup-oracle.sh on $(date -u '+%Y-%m-%d %H:%M UTC').
# Mode 600, root-owned. systemd reads it; nothing here is ever logged.
# Re-running setup-oracle.sh rewrites this file but keeps SESSION_SECRET.
PORT=${APP_PORT}
DB_FILE=${DATA_DIR}/game.db
WEB_DIR=${WEB_DIR}
CORS_ORIGIN=${SITE_URL}
SESSION_SECRET="$(env_quote "$SESSION_SECRET")"
ADMIN_PASSWORD="$(env_quote "$ADMIN_PASSWORD")"
# GAME_SEED is intentionally unset: the seed script generates a high-entropy
# seed and keeps it server-side. Anyone who knew it could predict every price.
GAME_SEED=
NODE_ENV=production
EOF
install_file "$ENV_TMP" "$ENV_FILE" 600
ok "${ENV_FILE} written (mode 600, root only)"

# ---------------------------------------------------------------------------
step "Installing the ${SERVICE_NAME}.service unit"
# ---------------------------------------------------------------------------
UNIT_TMP="$(mktemp)"
cat >"$UNIT_TMP" <<EOF
[Unit]
Description=Buccaneer Exchange authority server
Documentation=https://github.com/nishantss2008-hub/DECAStockGameEnvision
# network-online, not just network: the engine reads the wall clock and opens
# the SQLite file on boot, and Caddy in front needs the socket to be there.
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
Group=${RUN_GROUP}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
# HOME and the npm cache are redirected into the data dir because ProtectHome
# below hides /home and ProtectSystem=strict makes everything else read-only.
Environment=HOME=${DATA_DIR}
Environment=npm_config_cache=${DATA_DIR}/.npm
Environment=npm_config_update_notifier=false
ExecStart=${NPM_BIN} run start
Restart=always
RestartSec=5
# SIGTERM reaches every process in the unit's cgroup (npm -> npm -w -> tsx ->
# node), so the server's own shutdown handler runs and closes SQLite cleanly.
# 20s is more than the engine needs to finish an in-flight tick.
KillSignal=SIGTERM
TimeoutStopSec=20

# Hardening. Exactly one directory is writable: the one holding game.db.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${DATA_DIR}
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
RestrictRealtime=true
LockPersonality=true
RemoveIPC=true

StandardOutput=journal
StandardError=journal
SyslogIdentifier=buccaneer

[Install]
WantedBy=multi-user.target
EOF
install_file "$UNIT_TMP" "/etc/systemd/system/${SERVICE_NAME}.service" 644
mkdir -p "${DATA_DIR}/.npm"
sudo systemctl daemon-reload
enable_unit "${SERVICE_NAME}"
ok "${SERVICE_NAME}.service installed (Restart=always, starts at boot)"

# ---------------------------------------------------------------------------
step "Creating the market"
# ---------------------------------------------------------------------------
# A brand-new database starts with NO companies — the server runs, the host can
# sign in, and there is nothing to trade. Seeding builds the hidden market.
#
# Gated on the database file not existing, because seeding again would throw
# away the market of a game in progress. That makes re-running this installer
# safe on a machine that already has a game on it.
if [ -f "${DATA_DIR}/game.db" ]; then
  skip "${DATA_DIR}/game.db already exists — leaving the existing game alone"
  info "to start a fresh game later, use 'New game' in the host console"
else
  stop_service_for_work
  SEED_LOG="$(mktemp)"
  if ( cd "$APP_DIR" \
       && DB_FILE="${DATA_DIR}/game.db" \
          ADMIN_PASSWORD="$ADMIN_PASSWORD" \
          GAME_SEED='' \
          npm run seed -w @deca/server ) >"$SEED_LOG" 2>&1; then
    # The generated game seed is a secret — anyone holding it can predict every
    # future price — so that line is stripped before any of this is printed.
    sed -e '/[Gg]ame seed/d' -e '/^$/d' "$SEED_LOG" | sed 's/^/     /'
    rm -f "$SEED_LOG"
    # The database holds every crew's password hash and the hidden game seed.
    # Nothing but the service user (and root) has any business reading it.
    chmod 640 "${DATA_DIR}/game.db" 2>/dev/null || true
    ok "market created — the game is in the lobby, waiting for you to start it"
  else
    sed -e '/[Gg]ame seed/d' "$SEED_LOG" | tail -n 25
    rm -f "$SEED_LOG"
    die "Could not create the market. The output is above."
  fi
  if [ -z "$SKIP_LITESTREAM" ]; then
    info "rebuilding a machine Oracle reclaimed? Do NOT keep this empty game —"
    info "run 'bash ${APP_DIR}/deploy/restore.sh' to pull the real one back from B2."
  fi
fi

# ---------------------------------------------------------------------------
step "Opening ports 80 and 443 on the machine itself"
# ---------------------------------------------------------------------------
# Oracle's Ubuntu images ship an iptables ruleset that allows 22 and then
# REJECTs everything else, so a working Caddy is still unreachable until this
# runs. There is a SECOND firewall in the Oracle console (the VCN security
# list) that this script cannot touch — see docs/DEPLOY-ORACLE.md step 4.
#
# NOTE, deliberately not a bug: we INSERT accept rules above the REJECT rather
# than flushing the chain. Oracle's platform images carry essential rules that
# keep non-root users away from the boot/block volumes over iSCSI; flushing
# removes those. Same reason UFW is left alone below.
if ! have netfilter-persistent; then
  info "installing iptables-persistent so the rules survive a reboot"
  echo 'iptables-persistent iptables-persistent/autosave_v4 boolean false' | sudo debconf-set-selections
  echo 'iptables-persistent iptables-persistent/autosave_v6 boolean false' | sudo debconf-set-selections
  sudo apt-get install -y -qq iptables-persistent
fi

allow_port() {
  # $1 = iptables binary, $2 = port
  local ipt="$1" port="$2" idx
  if sudo "$ipt" -C INPUT -p tcp -m conntrack --ctstate NEW --dport "$port" -j ACCEPT 2>/dev/null; then
    skip "${ipt}: tcp/${port} already allowed"
    return 0
  fi
  # Insert immediately before the first REJECT/DROP so the ACCEPT actually wins,
  # without disturbing the rules above it.
  idx="$(sudo "$ipt" -L INPUT --line-numbers -n 2>/dev/null | awk '$2=="REJECT"||$2=="DROP"{print $1; exit}')"
  if [ -n "$idx" ]; then
    sudo "$ipt" -I INPUT "$idx" -p tcp -m conntrack --ctstate NEW --dport "$port" -j ACCEPT
  else
    sudo "$ipt" -A INPUT -p tcp -m conntrack --ctstate NEW --dport "$port" -j ACCEPT
  fi
  ok "${ipt}: tcp/${port} allowed"
}

allow_port iptables 80
allow_port iptables 443
if have ip6tables && sudo ip6tables -L INPUT -n >/dev/null 2>&1; then
  allow_port ip6tables 80
  allow_port ip6tables 443
fi
sudo netfilter-persistent save >/dev/null
ok "rules saved to /etc/iptables/rules.v4 — they survive a reboot"

# UFW. Oracle explicitly warns that enabling UFW on an Ubuntu image can leave
# the instance unable to boot, because UFW drops the essential iSCSI rules:
#   https://docs.oracle.com/en-us/iaas/Content/Compute/known-issues.htm
# So: if UFW is already active we must add the ports (it is in charge, and
# Caddy would be blocked otherwise); if it is inactive we leave it inactive.
if have ufw && sudo ufw status 2>/dev/null | head -n 1 | grep -qi 'Status: active'; then
  sudo ufw allow 80/tcp  >/dev/null
  sudo ufw allow 443/tcp >/dev/null
  ok "ufw is active on this machine — allowed 80/tcp and 443/tcp there too"
else
  skip "ufw is not active — leaving it that way (Oracle: enabling UFW on Ubuntu images can prevent the VM from booting)"
  info "set ALLOW_UFW=1 only if you understand that warning and want ufw enabled anyway"
  if [ "${ALLOW_UFW:-}" = "1" ] && have ufw; then
    sudo ufw allow 22/tcp  >/dev/null
    sudo ufw allow 80/tcp  >/dev/null
    sudo ufw allow 443/tcp >/dev/null
    sudo ufw --force enable >/dev/null
    warn "ufw enabled at your request. If this VM ever fails to reboot, that is why."
  fi
fi

# ---------------------------------------------------------------------------
step "Pointing ${SITE_HOST} at this machine"
# ---------------------------------------------------------------------------
DUCK_ENV_TMP="$(umask 077; mktemp)"
# No quotes, deliberately: both values passed require_plain_value, so they hold
# nothing systemd or /bin/sh could read two different ways. This file is read by
# both — systemd as an EnvironmentFile, and the updater script when it is run by
# hand — and agreement between them is worth more than generality here.
cat >"$DUCK_ENV_TMP" <<EOF
DUCKDNS_SUBDOMAIN=${DUCKDNS_SUBDOMAIN}
DUCKDNS_TOKEN=${DUCKDNS_TOKEN}
EOF
install_file "$DUCK_ENV_TMP" "$DUCKDNS_ENV_FILE" 600

DUCK_SH_TMP="$(mktemp)"
cat >"$DUCK_SH_TMP" <<'EOF'
#!/bin/sh
# Tell DuckDNS the current public IP of this machine. Leaving &ip= empty makes
# DuckDNS use the source address of the request, which is exactly what we want.
# https://www.duckdns.org/install.jsp
#
# The token is in the URL, so curl's own error text is suppressed: it would
# otherwise print the full URL into the journal.
set -eu
. /etc/duckdns.env
url="https://www.duckdns.org/update?domains=${DUCKDNS_SUBDOMAIN}&token=${DUCKDNS_TOKEN}&ip="
if ! response=$(curl -fsS --max-time 20 "$url" 2>/dev/null); then
  echo "duckdns: update request failed (network problem, or the token is wrong)" >&2
  exit 1
fi
if [ "$response" != "OK" ]; then
  echo "duckdns: DuckDNS refused the update (replied KO) — check the subdomain and token" >&2
  exit 1
fi
echo "duckdns: ${DUCKDNS_SUBDOMAIN}.duckdns.org updated OK"
EOF
install_file "$DUCK_SH_TMP" "$DUCKDNS_SCRIPT" 755

DUCK_SVC_TMP="$(mktemp)"
cat >"$DUCK_SVC_TMP" <<EOF
[Unit]
Description=Update the DuckDNS record for ${SITE_HOST}
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=${DUCKDNS_SCRIPT}
EnvironmentFile=${DUCKDNS_ENV_FILE}
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
EOF
install_file "$DUCK_SVC_TMP" /etc/systemd/system/duckdns-update.service 644

DUCK_TMR_TMP="$(mktemp)"
cat >"$DUCK_TMR_TMP" <<'EOF'
[Unit]
Description=Refresh the DuckDNS record every 5 minutes

[Timer]
OnBootSec=1min
OnUnitActiveSec=5min
# Catch up after the VM has been off; a stale A record is what breaks the event.
Persistent=true
AccuracySec=30s
Unit=duckdns-update.service

[Install]
WantedBy=timers.target
EOF
install_file "$DUCK_TMR_TMP" /etc/systemd/system/duckdns-update.timer 644

sudo systemctl daemon-reload
enable_unit duckdns-update.timer
sudo systemctl start duckdns-update.timer >/dev/null 2>&1 || true
info "running the first DuckDNS update now — Caddy cannot get a certificate until this succeeds"
if sudo systemctl start duckdns-update.service; then
  ok "DuckDNS accepted the update for ${SITE_HOST}"
else
  sudo journalctl -u duckdns-update.service -n 5 --no-pager || true
  die "DuckDNS refused the update. Check the subdomain and token at https://www.duckdns.org and re-run."
fi

# DuckDNS saying OK is not the same as the name working yet. Let's Encrypt is
# about to look this name up from the outside, and if it still points somewhere
# else the certificate fails with an error that reads like a Caddy problem. Ten
# seconds of checking here saves an hour of looking in the wrong place.
PUBLIC_IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
DNS_IP=""
for _ in $(seq 1 10); do
  DNS_IP="$(getent ahostsv4 "$SITE_HOST" 2>/dev/null | awk 'NR==1{print $1}')"
  [ -n "$DNS_IP" ] && break
  sleep 3
done
if [ -z "$DNS_IP" ]; then
  warn "${SITE_HOST} does not resolve yet. DNS sometimes takes a couple of minutes."
  warn "Carry on — if the certificate fails at the end, run: sudo systemctl restart caddy"
elif [ -n "$PUBLIC_IP" ] && [ "$DNS_IP" != "$PUBLIC_IP" ]; then
  warn "${SITE_HOST} points at ${DNS_IP}, but this machine's public address is ${PUBLIC_IP}."
  warn "If that does not fix itself within a few minutes, the certificate will fail."
  warn "Check the 'current ip' box for this subdomain at https://www.duckdns.org"
else
  ok "${SITE_HOST} resolves to ${DNS_IP} — this machine"
fi

# ---------------------------------------------------------------------------
step "Installing Caddy (automatic HTTPS)"
# ---------------------------------------------------------------------------
if have caddy; then
  skip "Caddy $(caddy version 2>/dev/null | head -n 1) already installed"
else
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | sudo gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  sudo chmod o+r /etc/apt/sources.list.d/caddy-stable.list
  sudo apt-get update -qq
  sudo apt-get install -y -qq caddy
  ok "Caddy installed from the official repository"
fi

CADDY_TMP="$(mktemp)"
cat >"$CADDY_TMP" <<EOF
# Buccaneer Exchange — written by deploy/setup-oracle.sh.
#
# Naming the host (rather than :80) is what makes Caddy fetch and renew a real
# Let's Encrypt certificate on its own, and redirect http:// to https:// for
# you. Nothing else is needed for HTTPS.
#
# There is no buffering directive on purpose. Caddy writes the headers of a
# text/event-stream response straight away and flushes the compressor on every
# write, so the live price stream works as-is; adding flush_interval would be
# redundant and adding buffering would freeze prices on every phone in the room.
# https://caddyserver.com/docs/caddyfile/directives/reverse_proxy
${SITE_HOST} {
	encode zstd gzip

	# The host console lives at /admin inside the phone app, but the game
	# server treats /admin as API surface and answers a plain browser request
	# for it with a JSON 404. Without this rule, the teacher pressing reload on
	# the control screen — or opening a bookmark to it — gets
	# {"error":"not_found"} instead of the game. This sends browser PAGE loads
	# under /admin to the app shell; the app then reads /admin out of the
	# address bar and opens the right screen.
	#
	# Only page loads match: a browser navigation sends "Accept: text/html",
	# while the app's own /admin API calls send "Accept: */*" and are proxied
	# through untouched, as is every POST and DELETE.
	@host_console_page {
		method GET HEAD
		path /admin /admin/*
		header Accept *text/html*
	}
	rewrite @host_console_page /

	reverse_proxy 127.0.0.1:${APP_PORT}

	log {
		output file /var/log/caddy/access.log {
			roll_size 10MiB
			roll_keep 5
		}
	}
}
EOF
install_file "$CADDY_TMP" /etc/caddy/Caddyfile 644
sudo mkdir -p /var/log/caddy
if ! sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
  sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile || true
  die "The generated Caddyfile is invalid — the error is above, the file is /etc/caddy/Caddyfile"
fi
# `caddy validate` really opens the access log to check it can, and running it
# under sudo leaves that file owned by root and mode 600. Caddy itself runs as
# the 'caddy' user, so leaving it that way makes caddy.service fail to start
# with a permission error that looks nothing like its cause. Fix the ownership
# AFTER validating, never before.
sudo chown -R caddy:caddy /var/log/caddy
enable_unit caddy
ok "Caddyfile written for ${SITE_HOST} -> 127.0.0.1:${APP_PORT}"

# ---------------------------------------------------------------------------
step "Installing Litestream (continuous backup to Backblaze B2)"
# ---------------------------------------------------------------------------
if [ -n "$SKIP_LITESTREAM" ]; then
  skip "no B2 bucket configured — backups not installed"
else
  LS_HAVE=""
  have litestream && LS_HAVE="$(litestream version 2>/dev/null | tr -d 'v' | head -n 1)"
  if [ "$LS_HAVE" = "$LITESTREAM_VERSION" ]; then
    skip "Litestream ${LITESTREAM_VERSION} already installed"
  else
    LS_DEB="litestream-${LITESTREAM_VERSION}-linux-${LITESTREAM_ARCH}.deb"
    LS_URL="https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/${LS_DEB}"
    info "downloading ${LS_DEB}"
    LS_TMP="$(mktemp -d)"
    curl -fsSL "$LS_URL" -o "${LS_TMP}/${LS_DEB}" || die "Could not download ${LS_URL}"
    sudo dpkg -i "${LS_TMP}/${LS_DEB}" >/dev/null
    rm -rf "$LS_TMP"
    ok "Litestream $(litestream version) installed (its systemd unit comes with the package)"
  fi

  # Secrets go in an env file; the YAML only references them, so /etc/litestream.yml
  # holds no keys. Litestream expands $VAR / ${VAR} in its config.
  # https://litestream.io/reference/config/
  LS_ENV_TMP="$(umask 077; mktemp)"
  # Unquoted on purpose — see the DuckDNS env file above. deploy/restore.sh
  # sources this file from /bin/sh, and systemd hands it to litestream.service.
  cat >"$LS_ENV_TMP" <<EOF
# Backblaze B2 application key for Litestream. Mode 600, root-only.
B2_KEY_ID=${B2_KEY_ID}
B2_APP_KEY=${B2_APP_KEY}
EOF
  install_file "$LS_ENV_TMP" "$LITESTREAM_ENV_FILE" 600

  LS_YML_TMP="$(mktemp)"
  cat >"$LS_YML_TMP" <<EOF
# Buccaneer Exchange — written by deploy/setup-oracle.sh.
# Litestream v0.5 syntax: one 'replica:' per database ('replicas:' is deprecated).
# Credentials come from ${LITESTREAM_ENV_FILE} via the systemd drop-in, so this
# file contains no secrets and can be read freely.
dbs:
  - path: ${DATA_DIR}/game.db
    replica:
      type: s3
      bucket: ${B2_BUCKET}
      path: ${B2_PATH}
      endpoint: ${B2_ENDPOINT}
      access-key-id: \${B2_KEY_ID}
      secret-access-key: \${B2_APP_KEY}
      # Ten seconds of worst-case loss. The default of 1s would mean ~86,000
      # uploads a day for no benefit: the engine can recompute a few ticks.
      sync-interval: 10s
      # v0.5.0+ auto-detects Backblaze endpoints and sets force-path-style and
      # sign-payload itself; stated explicitly so a future default cannot
      # silently change it. https://litestream.io/guides/backblaze/
      force-path-style: true
EOF
  install_file "$LS_YML_TMP" "$LITESTREAM_CONFIG" 644

  sudo mkdir -p /etc/systemd/system/litestream.service.d
  LS_DROP_TMP="$(mktemp)"
  # The unit that ships in the .deb is deliberately bare: ExecStart, Restart and
  # nothing else. It runs as root, which is what lets it read game.db in a
  # directory that is otherwise the service user's alone.
  cat >"$LS_DROP_TMP" <<EOF
[Unit]
# Do not race the game server for the database file on boot, and do not start
# uploading before this machine has a network.
After=${SERVICE_NAME}.service network-online.target
Wants=network-online.target

[Service]
EnvironmentFile=${LITESTREAM_ENV_FILE}
Restart=always
RestartSec=5
EOF
  install_file "$LS_DROP_TMP" /etc/systemd/system/litestream.service.d/buccaneer.conf 644
  sudo systemctl daemon-reload
  enable_unit litestream
  ok "${LITESTREAM_CONFIG} written · replicating to b2://${B2_BUCKET}/${B2_PATH}"
fi

# ---------------------------------------------------------------------------
step "Starting everything"
# ---------------------------------------------------------------------------
sudo systemctl restart "${SERVICE_NAME}"
info "waiting for the game server to answer on 127.0.0.1:${APP_PORT}"
HEALTH_OK=0
for _ in $(seq 1 30); do
  if curl -fsS --max-time 3 "http://127.0.0.1:${APP_PORT}/health" >/dev/null 2>&1; then HEALTH_OK=1; break; fi
  sleep 2
done
if [ "$HEALTH_OK" -eq 1 ]; then
  ok "game server healthy: $(curl -fsS "http://127.0.0.1:${APP_PORT}/health")"
else
  sudo journalctl -u "${SERVICE_NAME}" -n 30 --no-pager || true
  die "The game server did not come up. The last 30 log lines are above."
fi

sudo systemctl restart caddy
sleep 2
if sudo systemctl is-active --quiet caddy; then
  ok "caddy is running"
else
  sudo journalctl -u caddy -n 25 --no-pager || true
  die "Caddy did not start, so nothing is listening on 80 or 443. The log is above.
     'permission denied' on /var/log/caddy/access.log is fixed with:
       sudo chown -R caddy:caddy /var/log/caddy && sudo systemctl restart caddy"
fi

if [ -z "$SKIP_LITESTREAM" ]; then
  sudo systemctl restart litestream
  sleep 3
  if sudo systemctl is-active --quiet litestream; then
    ok "litestream is running"
  else
    sudo journalctl -u litestream -n 20 --no-pager || true
    warn "litestream is not running — the game works, but there is no backup. See the log above."
  fi
fi

info "waiting for the HTTPS certificate (Let's Encrypt usually takes 10-40 seconds)"
TLS_OK=0
for _ in $(seq 1 40); do
  if curl -fsS --max-time 5 "${SITE_URL}/health" >/dev/null 2>&1; then TLS_OK=1; break; fi
  sleep 3
done
if [ "$TLS_OK" -eq 1 ]; then
  ok "${SITE_URL} is live over HTTPS"
else
  warn "Could not reach ${SITE_URL} yet."
  warn "Almost always this means the Oracle console firewall is still closed."
  warn "Open ingress TCP 80 and 443 (source 0.0.0.0/0) in your VCN's security list"
  warn "(docs/DEPLOY-ORACLE.md step 3), then run:"
  warn "  sudo systemctl restart caddy && curl -v ${SITE_URL}/health"
  warn "The other possibility is DNS: 'ping ${SITE_HOST}' must answer with this"
  warn "machine's public address. Everything else is already installed and running."
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
[ -n "${PUBLIC_IP:-}" ] || PUBLIC_IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || echo 'unknown')"

cat <<EOF

  ============================================================
    Done.
  ============================================================

    Game address (give this to students)
        ${SITE_URL}

    Host console (the teacher's screen)
        Go to ${SITE_URL}/login
        Crew name:  admin
        Password:   the one you typed above — not printed here on purpose
        Signing in as admin lands you on the control screen. Bookmark
        ${SITE_URL}/login, not the screen you end up on.

    The game is seeded and sitting in the lobby. Open the host console and
    press Start when you are ready; nothing ticks until you do.

    This machine
        Public IP     ${PUBLIC_IP}
        Code          ${APP_DIR}      (commit $(git -C "$APP_DIR" rev-parse --short HEAD))
        Database      ${DATA_DIR}/game.db
        Settings      ${ENV_FILE}  (root, mode 600)
$( [ -z "$SKIP_LITESTREAM" ] && echo "        Backup        b2://${B2_BUCKET}/${B2_PATH}  (every 10s)" || echo "        Backup        NOT CONFIGURED — re-run with B2_BUCKET set" )

    Watch it work
        sudo journalctl -u ${SERVICE_NAME} -f          # game server, live
        sudo journalctl -u caddy -n 50 --no-pager      # HTTPS / certificates
        sudo journalctl -u duckdns-update -n 20        # DNS updates
$( [ -z "$SKIP_LITESTREAM" ] && echo "        sudo journalctl -u litestream -n 20            # backups" )
        curl -s ${SITE_URL}/health                     # tick number should climb

    Everyday jobs
        bash ${APP_DIR}/deploy/update.sh               # deploy the latest code
        bash ${APP_DIR}/deploy/restore.sh              # pull the database back from B2
        node ${APP_DIR}/deploy/crew-sheet.mjs --url ${SITE_URL} --count 12
                                                       # make crews + the printable handout

    Before your event: run the restore test in docs/DEPLOY-ORACLE.md.
    An untested backup is not a backup.

EOF
