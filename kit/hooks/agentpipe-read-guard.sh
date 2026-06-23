#!/usr/bin/env bash
# agentpipe-read-guard.sh — blocking pre-file-read hook (enforced guardrail).
#
# For agents whose pre-read payload puts the path at .file_path (Cursor
# beforeReadFile) or .tool_input.file_path (Claude/Codex Read). Blocks (exit 2)
# reads of secret files; allows *.example / *.sample / *.template.
#
# Exit codes: 0 = allow, 2 = block (reason on stderr).
set -euo pipefail

INPUT=$(cat)
[[ -z "$INPUT" ]] && exit 0

extract_path() {
  if command -v node &>/dev/null; then
    printf '%s' "$1" | node -e "
      try {
        const d = JSON.parse(require('fs').readFileSync(0,'utf-8'));
        const p = d.file_path ?? d.tool_input?.file_path ?? d.path;
        if (typeof p === 'string') process.stdout.write(p);
      } catch {}
    " 2>/dev/null
  else
    printf '%s' "$1" | grep -oE '\"file_path\"[[:space:]]*:[[:space:]]*\"[^\"]*\"' | head -1 | sed -E 's/.*:[[:space:]]*\"//;s/\"$//'
  fi
}

P=$(extract_path "$INPUT") || exit 0
[[ -z "$P" ]] && exit 0

# Allow example/template variants.
case "$P" in
  *.example|*.sample|*.template) exit 0 ;;
esac

SECRET="(\.env)($|\.[A-Za-z0-9]+$)|\.(pem|key|p12|pfx|keystore)$|id_(rsa|ed25519|ecdsa)$|(credentials|secrets?)\.(json|ya?ml|toml|txt)$"
if printf '%s\n' "$P" | grep -qiE "$SECRET"; then
  echo "Blocked: '$P' is a secret file. Use its .example variant, or ask the user first." >&2
  exit 2
fi

exit 0
