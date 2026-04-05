# Prompt Logger — Claude Code hook

A tiny POSIX bash script that runs on every Claude Code prompt submission,
extracts the payload, and POSTs it to your Prompt Logger instance.

## Properties

- **Non-blocking.** The network call runs in the background; Claude Code never
  waits on it.
- **Fail-safe.** A broken server, network, or config never breaks Claude Code —
  the hook always exits `0`.
- **Safe JSON construction.** Prompt content is passed through `jq`, never
  shell-interpolated. Prompts containing shell metacharacters cannot escape.
- **HTTPS enforced.** Refuses plaintext unless `PROMPT_LOGGER_ALLOW_INSECURE=1`.
- **Payload capped at 256 KB.** Larger stdin input is truncated.
- **Offline queue.** On network failure, the payload is appended to
  `~/.local/state/prompt-logger/queue.jsonl` for later replay.
- **~100 lines of bash,** fully auditable.

## Requirements

- `bash` (any modern version)
- `jq` — for safe JSON construction
- `curl` — for the POST

On Debian/Ubuntu: `sudo apt install jq curl`.
On macOS: `brew install jq` (curl ships with the OS).
On Windows: run inside WSL, or use `prompt-logger-hook.ps1` (the PowerShell twin).

## Install

```bash
./install-hook.sh
```

The installer will prompt for:

- `PROMPT_LOGGER_URL`   — e.g. `https://prompts.example.com`
- `PROMPT_LOGGER_TOKEN` — the ingest bearer token from your server's `.env`
- `PROMPT_LOGGER_MODE`  — `prompt-only` (default) or `prompt-and-response`

It writes `~/.config/prompt-logger/config.env` with `chmod 600` and prints the
JSON snippet to paste into `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/absolute/path/to/prompt-logger-hook.sh"
          }
        ]
      }
    ]
  }
}
```

## Configuration file

```bash
# ~/.config/prompt-logger/config.env   (chmod 600)
PROMPT_LOGGER_URL=https://prompts.example.com
PROMPT_LOGGER_TOKEN=<long random string>
PROMPT_LOGGER_MODE=prompt-only
# PROMPT_LOGGER_ALLOW_INSECURE=1   # dev only, never set in production
```

## Modes

- **`prompt-only`** (default) — fires on `UserPromptSubmit` only. Logs exactly
  what you typed. No assistant responses are captured.
- **`prompt-and-response`** — additionally register a `Stop` hook that PATCHes
  the same endpoint with the assistant's final response. Useful for teaching
  when students should see both sides of the conversation.

## Testing the hook manually

```bash
echo '{"session_id":"test-1","cwd":"/tmp","prompt":"hello world"}' \
  | ./prompt-logger-hook.sh
```

Then check your server's `/admin` dashboard — a new session should appear.

## Rotating the ingest token

1. Generate a new token: `openssl rand -hex 32`
2. Update `INGEST_TOKEN` in the server's `.env` and restart.
3. Update `PROMPT_LOGGER_TOKEN` in each client's `config.env`.

The old token becomes invalid immediately.

## Troubleshooting

The hook never prints anything to stderr by design — silence is a feature.
To debug:

1. Run it manually with a test payload (above) and check the HTTP status.
2. Inspect the offline queue: `cat ~/.local/state/prompt-logger/queue.jsonl`.
3. Tail your server logs: `docker compose logs -f app`.
