#!/usr/bin/env bash
# agentpipe-shell-guard.sh — blocking pre-shell/pre-tool hook (enforced guardrail).
#
# Portable across agents whose hook payload puts the shell command at either
#   .tool_input.command   (Codex PreToolUse, Claude PreToolUse)
#   .command              (Cursor beforeShellExecution)
# Blocks (exit 2) commands that explore wasteful directories or touch secrets.
#
# Exit codes: 0 = allow, 2 = block (reason on stderr). Exit 2 is the portable
# block primitive honored by Claude, Codex, and Cursor.
set -euo pipefail

INPUT=$(cat)
[[ -z "$INPUT" ]] && exit 0

extract_command() {
  if command -v node &>/dev/null; then
    printf '%s' "$1" | node -e "
      try {
        const d = JSON.parse(require('fs').readFileSync(0,'utf-8'));
        const c = d.tool_input?.command ?? d.command;
        if (typeof c === 'string') process.stdout.write(c);
      } catch {}
    " 2>/dev/null
  else
    printf '%s' "$1" | grep -oE '\"command\"[[:space:]]*:[[:space:]]*\"[^\"]*\"' | head -1 | sed -E 's/.*:[[:space:]]*\"//;s/\"$//'
  fi
}

COMMAND=$(extract_command "$INPUT") || exit 0
[[ -z "$COMMAND" ]] && exit 0

SEP="[/\\\\]"

# Secrets: block reading/copying credential files (allow *.example / *.sample).
SECRET="(^|[ /\\\\\"'])(\.env)($|[ /\\\\\"'.])"
SECRET+="|(^|[ /\\\\])\.env\.[A-Za-z0-9]+"
SECRET+="|\.(pem|key|p12|pfx|keystore)(\b|$)"
SECRET+="|(^|[ /\\\\])id_(rsa|ed25519|ecdsa)"
SECRET+="|(credentials|secrets?)\.(json|ya?ml|toml|txt)"
if printf '%s\n' "$COMMAND" | grep -qiE '(^|[ |;&`(])(cat|less|more|head|tail|bat|cp|nano|vi|vim|grep|rg|strings|xxd|od|base64)([ ])'; then
  CLEAN=$(printf '%s\n' "$COMMAND" | sed -E 's/\.env\.(example|sample|template)//g')
  if printf '%s\n' "$CLEAN" | grep -qiE "$SECRET"; then
    echo "Blocked: command accesses a secret file (.env / key / credentials). Use .env.example, or ask the user first." >&2
    exit 2
  fi
fi

# Wasteful directories: only when an exploration verb is present.
EXPLORE="(^|[[:space:]|;&\`(])(ls|ll|la|find|cat|head|tail|less|more|wc|stat|du|tree|bat|od|xxd|hexdump|nl)([[:space:]]|$)"
printf '%s\n' "$COMMAND" | grep -qE "$EXPLORE" || exit 0

BLOCKED="(^|[ /\\\\])node_modules(${SEP}|$| )"
BLOCKED+="|(__pycache__)|\.git${SEP}(objects|refs)"
BLOCKED+="|(^|[ /\\\\])dist${SEP}|(^|[ /\\\\])build${SEP}|\.next${SEP}"
BLOCKED+="|(^|[ /\\\\])vendor(${SEP}|$| )|(^|[ /\\\\])target${SEP}"
BLOCKED+="|(^|[ /\\\\])\.venv${SEP}|(^|[ /\\\\])venv${SEP}|\.pytest_cache${SEP}|\.cache(${SEP}|$| )"
CLEAN=$(printf '%s\n' "$COMMAND" | sed -E "s|node_modules[/\\]\.bin[/\\][^[:space:]]*||g")
if printf '%s\n' "$CLEAN" | grep -qE "$BLOCKED"; then
  M=$(printf '%s\n' "$COMMAND" | grep -oE "$BLOCKED" | head -1)
  echo "Blocked: command explores '$M' — a large/generated directory. Use scoped paths or Grep." >&2
  exit 2
fi

exit 0
