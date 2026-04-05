#!/usr/bin/env bash
# ==============================================================================
# Prompt Logger — Claude Code hook (UserPromptSubmit)
#
# Runs on every prompt submission. Reads the hook JSON payload from stdin,
# POSTs it to the configured Prompt Logger instance, and returns immediately.
#
# Design properties:
#   - Non-blocking: always backgrounds the network call and exits 0.
#   - Fail-safe:   a broken server or network MUST NEVER break Claude Code.
#   - No shell interpolation of prompt content: JSON is built by jq, never
#     by string concatenation.
#   - HTTPS enforced (override with PROMPT_LOGGER_ALLOW_INSECURE=1 for dev).
#
# Config: ~/.config/prompt-logger/config.env (chmod 600)
#   PROMPT_LOGGER_URL=https://prompts.example.com
#   PROMPT_LOGGER_TOKEN=<long random string>
#   PROMPT_LOGGER_MODE=prompt-only    # or prompt-and-response
#
# Registration: add to ~/.claude/settings.json
#   {
#     "hooks": {
#       "UserPromptSubmit": [
#         { "hooks": [
#             { "type": "command",
#               "command": "/absolute/path/to/prompt-logger-hook.sh" }
#         ]}
#       ]
#     }
#   }
# ==============================================================================

set -u

CONFIG="${PROMPT_LOGGER_CONFIG:-$HOME/.config/prompt-logger/config.env}"
QUEUE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/prompt-logger"
QUEUE_FILE="$QUEUE_DIR/queue.jsonl"
MAX_PAYLOAD_BYTES=262144   # 256 KB

# Always exit 0. A failing hook must never block the user.
trap 'exit 0' EXIT

# Load config. If missing, silently exit — the user hasn't set this up yet.
[ -f "$CONFIG" ] || exit 0
# shellcheck disable=SC1090
. "$CONFIG"

: "${PROMPT_LOGGER_URL:=}"
: "${PROMPT_LOGGER_TOKEN:=}"
: "${PROMPT_LOGGER_MODE:=prompt-only}"
: "${PROMPT_LOGGER_ALLOW_INSECURE:=0}"

[ -z "$PROMPT_LOGGER_URL" ]   && exit 0
[ -z "$PROMPT_LOGGER_TOKEN" ] && exit 0

# Enforce HTTPS unless explicitly overridden.
case "$PROMPT_LOGGER_URL" in
  https://*) : ;;
  http://localhost*|http://127.0.0.1*)
    [ "$PROMPT_LOGGER_ALLOW_INSECURE" = "1" ] || exit 0
    ;;
  *)
    [ "$PROMPT_LOGGER_ALLOW_INSECURE" = "1" ] || exit 0
    ;;
esac

# Required tools: jq (for safe JSON construction), curl (for the POST).
command -v jq   >/dev/null 2>&1 || exit 0
command -v curl >/dev/null 2>&1 || exit 0

# Read Claude Code's hook payload from stdin (JSON). Cap size.
PAYLOAD=$(head -c "$MAX_PAYLOAD_BYTES")
[ -z "$PAYLOAD" ] && exit 0

# Re-shape the payload for our API: extract the fields we care about,
# attach mode + client hostname. jq handles all escaping.
BODY=$(printf '%s' "$PAYLOAD" | jq -c \
  --arg mode "$PROMPT_LOGGER_MODE" \
  --arg host "$(hostname 2>/dev/null || echo unknown)" \
  '{
     claude_session_id: (.session_id // .sessionId // null),
     cwd:               (.cwd // null),
     hook_event:        (.hook_event_name // "UserPromptSubmit"),
     prompt:            (.prompt // .user_prompt // .content // ""),
     mode:              $mode,
     client_host:       $host,
     client_ts:         (now | todate)
   }' 2>/dev/null)

[ -z "$BODY" ] && exit 0

# Background the network call so Claude Code never waits on us.
(
  mkdir -p "$QUEUE_DIR" 2>/dev/null || true

  HTTP_CODE=$(curl \
    --silent \
    --show-error \
    --output /dev/null \
    --write-out '%{http_code}' \
    --connect-timeout 2 \
    --max-time 5 \
    --request POST \
    --header "Content-Type: application/json" \
    --header "Authorization: Bearer $PROMPT_LOGGER_TOKEN" \
    --data-binary "$BODY" \
    "$PROMPT_LOGGER_URL/api/ingest" 2>/dev/null)

  # On failure, queue for later replay.
  case "$HTTP_CODE" in
    2??) : ;;
    *)   printf '%s\n' "$BODY" >> "$QUEUE_FILE" 2>/dev/null || true ;;
  esac
) &
disown 2>/dev/null || true

exit 0
