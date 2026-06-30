#!/usr/bin/env bash
# specpipe-shell-guard.sh — blocking pre-shell/pre-tool hook (enforced guardrail).
#
# The single shell guard for every agent. Reads the command from whichever shape
# the agent's hook payload uses:
#   .tool_input.command   (Claude PreToolUse, Codex PreToolUse)
#   .command              (Cursor beforeShellExecution)
#
# Two protections:
#   1. Secrets — commands that read/copy credential files (.env, keys, …).
#        SECRET_POLICY=block (default) → exit 2; =warn → warn on stderr, exit 0
#        (the approval flow: Claude asks the user, then may `cat .env`).
#   2. Wasteful dirs — exploring node_modules / build output / caches, which
#        burns tokens. Always blocks (exit 2) when an exploration verb is present.
#
# Exit codes: 0 = allow, 2 = block (reason on stderr). Exit 2 is the portable
# block primitive honored by Claude, Codex, and Cursor.
#
# Env:
#   SECRET_POLICY          block (default) | warn
#   PATH_GUARD_EXTRA       extra pipe-separated dir patterns to block
#   SENSITIVE_GUARD_EXTRA  extra pipe-separated secret patterns to block
set -euo pipefail

INPUT=$(cat)
[[ -z "$INPUT" ]] && exit 0
POLICY="${SECRET_POLICY:-block}"

# Antigravity honors a stdout JSON decision ({"decision":"deny","reason":…}), NOT exit
# codes — a non-zero exit is logged as a hook failure and falls through to its native
# permission prompt. Detect its payload shape so block() emits the right thing.
IS_ANTIGRAVITY=0
printf '%s' "$INPUT" | grep -q '"toolCall"' && IS_ANTIGRAVITY=1

# Block primitive. Antigravity → stdout JSON deny (+ exit 0, clean). Everyone else →
# reason on stderr + exit 2 (honored by Claude/Codex directly, Cursor via failClosed).
block() {
  local reason="$1"
  if [[ "$IS_ANTIGRAVITY" == "1" ]]; then
    local esc; esc=$(printf '%s' "$reason" | sed 's/\\/\\\\/g; s/"/\\"/g')
    printf '{"decision":"deny","reason":"%s"}\n' "$esc"
    exit 0
  fi
  echo "$reason" >&2
  exit 2
}

# ─── Extract command (multi-payload) ────────────────────────────────
# Covers every agent's hook payload shape:
#   .tool_input.command   Claude / Codex (PreToolUse Bash)
#   .command              Cursor (beforeShellExecution)
#   .tool_args.CommandLine  Antigravity (PreToolUse run_command) — verified 2026
extract_command() {
  if command -v node &>/dev/null; then
    printf '%s' "$1" | node -e "
      try {
        const d = JSON.parse(require('fs').readFileSync(0,'utf-8'));
        const a = d.toolCall?.args ?? {};   // Antigravity 1.0.13: { toolCall: { args: { CommandLine } } }
        const c = d.tool_input?.command ?? d.command ?? d.tool_args?.CommandLine
                  ?? a.CommandLine ?? a.Command ?? a.command;
        if (typeof c === 'string') process.stdout.write(c);
      } catch {}
    " 2>/dev/null
  else
    printf '%s' "$1" | grep -oE '"(command|CommandLine)"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*:[[:space:]]*"//;s/"$//'
  fi
}

COMMAND=$(extract_command "$INPUT") || exit 0
[[ -z "$COMMAND" ]] && exit 0

SEP="[/\\\\]"

# ─── Secrets in the command ─────────────────────────────────────────
# Only flag when a read/copy verb is present (so "echo use .env.example" or
# variable assignments don't trip the guard).
handle_secret() {
  local match="$1"
  if [[ "$POLICY" == "warn" ]]; then
    echo "Warning: '$match' is a sensitive file. If the user approved this access, proceed. Otherwise ask the user first before reading secrets." >&2
    exit 0
  fi
  block "Blocked: command accesses a secret file ('$match'). Use its .example variant, or ask the user first."
}

# No verb gate here (matches the original sensitive-guard): a secret referenced
# anywhere in the command is flagged — `ssh -i id_rsa`, `openssl -in cert.pem`,
# `gcloud --key-file=…` included. The .example/.sample/.template strip avoids the
# obvious false positives.
CLEAN=$(printf '%s\n' "$COMMAND" | sed -E 's/\.env\.(example|sample|template)//g')

SENSITIVE_IN_CMD=$(printf '%s\n' "$CLEAN" | grep -oE '[\./[:alnum:]_-]*\.env([\.[:alnum:]_-]*)?' | head -5) || true
if [[ -n "$SENSITIVE_IN_CMD" ]]; then
  while IFS= read -r m; do
    [[ -z "$m" ]] && continue
    case "$m" in *.example|*.sample|*.template) continue ;; esac
    handle_secret "$m"
  done <<< "$SENSITIVE_IN_CMD"
fi
KEY_IN_CMD=$(printf '%s\n' "$CLEAN" | grep -oE '[[:alnum:]_./-]*\.(pem|key|p12|pfx|jks|keystore)($|[^[:alnum:]])' | head -3) || true
[[ -n "$KEY_IN_CMD" ]] && handle_secret "$(printf '%s' "$KEY_IN_CMD" | head -1)"
NAME_IN_CMD=$(printf '%s\n' "$CLEAN" | grep -oiE '(id_rsa|id_ecdsa|id_ed25519|id_dsa|serviceAccountKey\.json|service-account[[:alnum:]_-]*\.json|\.npmrc|\.pypirc|\.netrc)' | head -3) || true
[[ -n "$NAME_IN_CMD" ]] && handle_secret "$(printf '%s' "$NAME_IN_CMD" | head -1)"
CRED_IN_CMD=$(printf '%s\n' "$CLEAN" | grep -oiE '[[:alnum:]_./-]*(credential|secret|private_key|privatekey)[[:alnum:]_./-]*' | head -3) || true
[[ -n "$CRED_IN_CMD" ]] && handle_secret "$(printf '%s' "$CRED_IN_CMD" | head -1)"
if [[ -n "${SENSITIVE_GUARD_EXTRA:-}" ]] && printf '%s\n' "$CLEAN" | grep -qE "$SENSITIVE_GUARD_EXTRA"; then
  handle_secret "$(printf '%s\n' "$CLEAN" | grep -oE "$SENSITIVE_GUARD_EXTRA" | head -1)"
fi

# ─── Wasteful directories ───────────────────────────────────────────
BLOCKED="(^|[ /\\\\])node_modules(${SEP}|$| )"
BLOCKED+="|(__pycache__)"
BLOCKED+="|\.git${SEP}(objects|refs)"
BLOCKED+="|(^|[ /\\\\])dist${SEP}"
BLOCKED+="|(^|[ /\\\\])build${SEP}"
BLOCKED+="|\.next${SEP}"
BLOCKED+="|(^|[ /\\\\])vendor(${SEP}|$| )"
BLOCKED+="|(^|[ /\\\\])Pods(${SEP}|$| )"
BLOCKED+="|\.build${SEP}"
BLOCKED+="|DerivedData"
BLOCKED+="|\.gradle${SEP}"
BLOCKED+="|(^|[ /\\\\])target${SEP}"
BLOCKED+="|\.nuget"
BLOCKED+="|\.cache(${SEP}|$| )"
BLOCKED+="|(^|[ /\\\\])\.venv${SEP}"
BLOCKED+="|(^|[ /\\\\])venv${SEP}"
BLOCKED+="|\.mypy_cache${SEP}"
BLOCKED+="|\.pytest_cache${SEP}"
BLOCKED+="|\.ruff_cache${SEP}"
BLOCKED+="|\.egg-info(${SEP}|$| )"
BLOCKED+="|(^|[ /\\\\])bin${SEP}(Debug|Release|net|x64|x86)"
BLOCKED+="|(^|[ /\\\\])obj${SEP}(Debug|Release|net)"
BLOCKED+="|\.nuxt${SEP}"
BLOCKED+="|\.svelte-kit${SEP}"
BLOCKED+="|\.parcel-cache${SEP}"
BLOCKED+="|\.turbo${SEP}"
BLOCKED+="|(^|[ /\\\\])out${SEP}(server|static|_next)"
BLOCKED+="|\.bundle${SEP}"

if [[ -n "${PATH_GUARD_EXTRA:-}" ]]; then
    BLOCKED+="|$PATH_GUARD_EXTRA"
fi

EXPLORE_VERB_RE="(^|[[:space:]|;&\`(])(ls|ll|la|find|cat|head|tail|less|more|wc|stat|du|tree|bat|od|xxd|hexdump|nl)([[:space:]]|$)"
if ! printf '%s\n' "$COMMAND" | grep -qE "$EXPLORE_VERB_RE"; then
    exit 0
fi

# Strip node_modules/.bin/<binary> — executing an installed binary isn't exploration.
COMMAND_FOR_CHECK=$(printf '%s\n' "$COMMAND" | sed -E "s|node_modules[/\\]\.bin[/\\][^[:space:]]*||g")

if printf '%s\n' "$COMMAND_FOR_CHECK" | grep -qE "$BLOCKED"; then
    MATCHED=$(printf '%s\n' "$COMMAND" | grep -oE "$BLOCKED" | head -1)
    block "Blocked: command references '$MATCHED' — this directory is typically large and exploring it wastes tokens. Use Glob or Grep tools instead."
fi

exit 0
