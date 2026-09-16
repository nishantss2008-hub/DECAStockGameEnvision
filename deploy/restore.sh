#!/usr/bin/env bash
#
# restore.sh — pull the SQLite database back from Backblaze B2 with Litestream.
#
#   bash /opt/buccaneer/deploy/restore.sh            # restore over the live database
#   bash /opt/buccaneer/deploy/restore.sh --test     # restore to /tmp and check it, change nothing
#
# Use --test before every event. It is the only way to find out that the backup
# is real, and it is completely harmless: it downloads to a scratch file,
# counts some rows, and deletes it.
#
# The real restore is for two situations:
#   * Oracle reclaimed the VM and you have rebuilt it from scratch.
#   * The database on disk is damaged and you would rather have the copy from
#     ten seconds before the damage.
#
# It stops the game server first. SQLite readers and a restore writing the same
# file at the same time is how you turn one corrupted database into two.
#
# Litestream v0.5 syntax:  litestream restore [-o PATH] DB_PATH
#   https://litestream.io/reference/restore/
#
if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi
set -Eeuo pipefail

DATA_DIR="${DATA_DIR:-/var/lib/buccaneer}"
DB_FILE="${DB_FILE:-${DATA_DIR}/game.db}"
SERVICE_NAME="${SERVICE_NAME:-buccaneer}"
APP_PORT="${APP_PORT:-8081}"
LITESTREAM_CONFIG="${LITESTREAM_CONFIG:-/etc/litestream.yml}"
LITESTREAM_ENV_FILE="${LITESTREAM_ENV_FILE:-/etc/litestream.env}"

MODE=restore
case "${1:-}" in
  --test|-t) MODE=test ;;
  # Print the comment block at the top of this file, stopping at the first
  # line that is not a comment, so --help cannot drift out of date.
  --help|-h) sed -n '2,${/^[^#]/q;s/^# \{0,1\}//p;}' "$0"; exit 0 ;;
  '') ;;
  *) printf 'Unknown option: %s  (try --test or --help)\n' "$1" >&2; exit 2 ;;
esac

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '    \033[32mok\033[0m   %s\n' "$*"; }
warn() { printf '    \033[33mwarn\033[0m %s\n' "$*" >&2; }
die()  { printf '\n\033[31mFAILED:\033[0m %s\n' "$*" >&2; exit 1; }

command -v litestream >/dev/null 2>&1 || die "litestream is not installed on this machine.
   If you set this machine up without a Backblaze bucket, there is no backup to restore from.
   Add one now:  B2_BUCKET=your-bucket bash /opt/buccaneer/deploy/setup-oracle.sh"
sudo test -f "$LITESTREAM_CONFIG" || die "${LITESTREAM_CONFIG} does not exist, so Litestream does not know where the backup is.
   Re-run deploy/setup-oracle.sh with B2_BUCKET set."
sudo test -f "$LITESTREAM_ENV_FILE" || die "${LITESTREAM_ENV_FILE} does not exist, so there are no Backblaze keys to use.
   Re-run deploy/setup-oracle.sh with B2_BUCKET, B2_KEY_ID and B2_APP_KEY set."

# Litestream runs as root and takes its B2 keys from /etc/litestream.env. Running
# it by hand has to do the same, and there are two ways NOT to do it:
#   * `sudo -E` needs a sudoers privilege this account may not have;
#   * `sudo B2_APP_KEY=... litestream` puts the key in the process list, where
#     any user on the machine can read it out of `ps`.
# So hand root the FILE and let its own shell read it. The key never enters this
# script's environment and never appears in an argument.
litestream_root() {
  sudo /bin/sh -c 'set -a; . "$1"; set +a; shift; exec litestream "$@"' _ "$LITESTREAM_ENV_FILE" "$@"
}

# ---------------------------------------------------------------------------
step "What is in the backup"
# ---------------------------------------------------------------------------
# `litestream ltx` replaced `litestream generations` in v0.5.
# https://litestream.io/reference/ltx/
if ! litestream_root ltx -config "$LITESTREAM_CONFIG" "$DB_FILE" 2>&1 | sed 's/^/    /'; then
  die "Litestream could not read the backup. Check ${LITESTREAM_CONFIG} and the B2 key, then:
     sudo journalctl -u litestream -n 40 --no-pager"
fi

# ---------------------------------------------------------------------------
if [ "$MODE" = "test" ]; then
# ---------------------------------------------------------------------------
  step "Test restore to a scratch file (nothing on this machine changes)"
  SCRATCH="$(mktemp -d)"
  # sudo, because litestream writes the scratch file as root.
  trap 'sudo rm -rf "$SCRATCH"' EXIT
  litestream_root restore -config "$LITESTREAM_CONFIG" -o "${SCRATCH}/test.db" "$DB_FILE"
  sudo chown "$(id -un)" "${SCRATCH}/test.db"
  SIZE="$(du -h "${SCRATCH}/test.db" | cut -f1)"
  ok "restored ${SIZE} to ${SCRATCH}/test.db"

  step "Checking the restored file is a real, readable database"
  if command -v sqlite3 >/dev/null 2>&1; then
    INTEGRITY="$(sqlite3 "${SCRATCH}/test.db" 'PRAGMA integrity_check;' || echo 'failed')"
    [ "$INTEGRITY" = "ok" ] || die "integrity_check said: ${INTEGRITY}"
    ok "PRAGMA integrity_check: ok"
    printf '    tables and row counts:\n'
    sqlite3 "${SCRATCH}/test.db" \
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;" \
      | while IFS= read -r t; do
          [ -n "$t" ] || continue
          printf '      %-24s %s\n' "$t" "$(sqlite3 "${SCRATCH}/test.db" "SELECT count(*) FROM \"$t\";")"
        done
  else
    warn "sqlite3 is not installed, so the contents were not checked — only that the download worked."
  fi
  cat <<EOF

  The backup is real and restorable. Nothing was changed.

EOF
  exit 0
fi

# ---------------------------------------------------------------------------
step "Read this before you say yes"
# ---------------------------------------------------------------------------
CURRENT="(no file on disk)"
if sudo test -f "$DB_FILE"; then
  CURRENT="$(sudo du -h "$DB_FILE" | cut -f1), last written $(sudo date -r "$DB_FILE" '+%Y-%m-%d %H:%M:%S %Z')"
fi
cat <<EOF

    Database on this machine : ${DB_FILE}
                               ${CURRENT}
    Replacing it with        : the newest copy in Backblaze B2

    This will:
      1. stop ${SERVICE_NAME}.service and litestream.service  (the game goes offline)
      2. move the current database aside, keeping it as a dated .bak
      3. download the backup in its place
      4. start both services again

    Every trade made after the backup's last update is gone. If a game is
    running right now, stop and think about whether you really want this.

EOF
printf '    Type exactly  restore  to continue: '
IFS= read -r CONFIRM
[ "$CONFIRM" = "restore" ] || { printf '\n    Nothing was changed.\n\n'; exit 1; }

# ---------------------------------------------------------------------------
step "Stopping the game server and the replicator"
# ---------------------------------------------------------------------------
sudo systemctl stop "$SERVICE_NAME" || warn "${SERVICE_NAME} was not running"
sudo systemctl stop litestream || warn "litestream was not running"
# Give any in-flight SQLite write a moment to land before we move the file.
sleep 2
ok "both stopped"

# ---------------------------------------------------------------------------
step "Setting the current database aside"
# ---------------------------------------------------------------------------
STAMP="$(date -u '+%Y%m%dT%H%M%SZ')"
# Litestream keeps its local bookkeeping in a hidden sibling directory,
# ".<dbname>-litestream" (litestream.go: MetaDirSuffix). Leaving that behind
# while replacing the database underneath it gives Litestream a local state
# that does not match the file, so it moves aside with everything else.
META_DIR="$(dirname "$DB_FILE")/.$(basename "$DB_FILE")-litestream"
MOVED=0
if sudo test -f "$DB_FILE"; then
  for suffix in '' '-wal' '-shm'; do
    if sudo test -f "${DB_FILE}${suffix}"; then
      sudo mv "${DB_FILE}${suffix}" "${DB_FILE}${suffix}.${STAMP}.bak"
    fi
  done
  MOVED=1
  ok "kept as ${DB_FILE}.${STAMP}.bak — delete it once you are happy"
else
  ok "no existing database to move"
fi
if sudo test -d "$META_DIR"; then
  sudo mv "$META_DIR" "${META_DIR}.${STAMP}.bak"
  ok "Litestream's local state moved aside too"
fi

# ---------------------------------------------------------------------------
step "Downloading from Backblaze B2"
# ---------------------------------------------------------------------------
if ! litestream_root restore -config "$LITESTREAM_CONFIG" -o "$DB_FILE" "$DB_FILE"; then
  warn "The restore failed. Putting the old database back exactly as it was."
  sudo rm -f "$DB_FILE" "${DB_FILE}-wal" "${DB_FILE}-shm"
  if [ "$MOVED" -eq 1 ]; then
    for suffix in '' '-wal' '-shm'; do
      if sudo test -f "${DB_FILE}${suffix}.${STAMP}.bak"; then
        sudo mv "${DB_FILE}${suffix}.${STAMP}.bak" "${DB_FILE}${suffix}"
      fi
    done
    warn "restored the previous file — the machine is back how it was"
  fi
  if sudo test -d "${META_DIR}.${STAMP}.bak"; then
    sudo rm -rf "$META_DIR"
    sudo mv "${META_DIR}.${STAMP}.bak" "$META_DIR"
  fi
  sudo systemctl start "$SERVICE_NAME" || true
  sudo systemctl start litestream || true
  die "litestream restore failed. See the message above and: sudo journalctl -u litestream -n 40 --no-pager"
fi

# The service runs as an ordinary user; a root-owned database would fail to open.
OWNER="$(stat -c '%U:%G' "$(dirname "$DB_FILE")")"
sudo chown "$OWNER" "$DB_FILE"
sudo chmod 640 "$DB_FILE"
ok "restored $(sudo du -h "$DB_FILE" | cut -f1), owned by ${OWNER}"

if command -v sqlite3 >/dev/null 2>&1; then
  INTEGRITY="$(sudo sqlite3 "$DB_FILE" 'PRAGMA integrity_check;' 2>/dev/null || echo 'failed')"
  [ "$INTEGRITY" = "ok" ] && ok "PRAGMA integrity_check: ok" || warn "integrity_check said: ${INTEGRITY}"
fi

# ---------------------------------------------------------------------------
step "Starting everything again"
# ---------------------------------------------------------------------------
sudo systemctl start "$SERVICE_NAME"
sudo systemctl start litestream || warn "litestream did not start — the game is up but not being backed up"

HEALTH=""
for _ in $(seq 1 30); do
  if HEALTH="$(curl -fsS --max-time 3 "http://127.0.0.1:${APP_PORT}/health" 2>/dev/null)"; then break; fi
  HEALTH=""
  sleep 2
done
if [ -z "$HEALTH" ]; then
  sudo journalctl -u "$SERVICE_NAME" -n 20 --no-pager
  die "The server did not come back up. The log is above."
fi
ok "/health: ${HEALTH}"

cat <<EOF

  Restored.

  The old database is still here in case you want it back:
      ${DB_FILE}.${STAMP}.bak

  Check the game before you announce anything: open the host screen, confirm
  the crews and the leaderboard look like the game you remember, then delete
  the .bak file.

      sudo journalctl -u ${SERVICE_NAME} -f
      sudo journalctl -u litestream -n 20 --no-pager

EOF
