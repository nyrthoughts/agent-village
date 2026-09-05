#!/bin/sh

set -eu

RUNTIME_DIR=''
SERVER_PID=''

fail() {
  printf 'Agent Village: %s\n' "$1" >&2
  exit "${2:-1}"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

check_node_version() {
  version=$(node --version 2>/dev/null | sed 's/^v//')
  major=$(printf '%s' "$version" | cut -d. -f1)
  minor=$(printf '%s' "$version" | cut -d. -f2)
  case "$major.$minor" in
    *[!0-9.]*) fail 'Node.js version could not be read' ;;
  esac
  if [ "$major" -lt 20 ] || { [ "$major" -eq 20 ] && [ "$minor" -lt 19 ]; }; then
    fail 'Node.js 20.19 or newer is required'
  fi
}

stop_server() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill -TERM "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  SERVER_PID=''
}

cleanup() {
  trap - EXIT INT TERM HUP
  stop_server
  if [ -n "$RUNTIME_DIR" ]; then
    case "$RUNTIME_DIR" in
      "$TEMP_PARENT"/agent-village.*) rm -rf -- "$RUNTIME_DIR" ;;
      *) printf 'Agent Village: refused to remove unexpected path %s\n' "$RUNTIME_DIR" >&2 ;;
    esac
  fi
}

handle_signal() {
  exit "$1"
}

wait_for_health() {
  attempts=0
  while [ "$attempts" -lt 50 ]; do
    if curl --fail --silent --max-time 1 "$VILLAGE_URL/api/health" >/dev/null 2>&1; then
      return 0
    fi
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      return 1
    fi
    attempts=$((attempts + 1))
    sleep 0.1
  done
  return 1
}

open_browser() {
  if command -v open >/dev/null 2>&1; then
    open "$VILLAGE_URL" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$VILLAGE_URL" >/dev/null 2>&1 || true
  fi
}

for required in node npm sqlite3 curl tar; do
  require_command "$required"
done
check_node_version

if [ -n "${VILLAGE_FILE:-}" ] && [ ! -f "$VILLAGE_FILE" ]; then
  fail "VILLAGE_FILE does not exist: $VILLAGE_FILE"
fi

PORT=${PORT:-4180}
case "$PORT" in
  ''|*[!0-9]*) fail 'PORT must be an integer between 1 and 65535' ;;
esac
if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
  fail 'PORT must be an integer between 1 and 65535'
fi

TEMP_PARENT=${TMPDIR:-/tmp}
TEMP_PARENT=${TEMP_PARENT%/}
RUNTIME_DIR=$(mktemp -d "$TEMP_PARENT/agent-village.XXXXXX")
SOURCE_DIR="$RUNTIME_DIR/source"
ARCHIVE_PATH="$RUNTIME_DIR/source.tar.gz"
NPM_CACHE_DIR="$RUNTIME_DIR/npm-cache"
VILLAGE_URL="http://127.0.0.1:$PORT"
VILLAGE_AUTH_DIR="$RUNTIME_DIR/private-auth"

trap cleanup EXIT
trap 'handle_signal 130' INT
trap 'handle_signal 143' TERM
trap 'handle_signal 129' HUP

mkdir -p "$SOURCE_DIR" "$NPM_CACHE_DIR"
printf 'Agent Village: downloading temporary runtime…\n'
curl \
  --fail \
  --location \
  --silent \
  --show-error \
  --retry 2 \
  --output "$ARCHIVE_PATH" \
  'https://github.com/nyrthoughts/agent-village/archive/refs/heads/main.tar.gz'
tar -xzf "$ARCHIVE_PATH" -C "$SOURCE_DIR" --strip-components=1

cd "$SOURCE_DIR"
export npm_config_cache="$NPM_CACHE_DIR"
npm ci --ignore-scripts --no-audit --no-fund
npm run build

if [ -z "${VILLAGE_FILE:-}" ]; then
  VILLAGE_FILE="$SOURCE_DIR/fixtures/village.observer.yaml"
fi
export VILLAGE_FILE
export VILLAGE_MODE=native
export PORT
export VILLAGE_AUTH_DIR

# This launcher promises no persistent state. Owner enrollment belongs to this
# temporary runtime and is removed by the existing validated cleanup trap.
node node_modules/tsx/dist/cli.mjs scripts/auth-setup.ts

node node_modules/tsx/dist/cli.mjs src/server/index.ts &
SERVER_PID=$!

if ! wait_for_health; then
  fail 'local server did not become healthy'
fi

printf 'Agent Village: %s\n' "$VILLAGE_URL"
printf 'Press Ctrl-C to stop and remove the temporary runtime.\n'
open_browser

wait "$SERVER_PID"
