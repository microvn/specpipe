#!/usr/bin/env bash
# specpipe-read-guard.sh — blocking pre-file-read hook (enforced guardrail).
#
# The single file-access guard for every agent. Reads the target path from
# whichever shape the agent's payload uses:
#   .tool_input.file_path (Claude/Codex Read/Write/Edit)  ·  .file_path (Cursor beforeReadFile)
#
# Blocks (exit 2) reads/writes of secret files: .env, private keys, credentials,
# tokens. Allows *.example / *.sample / *.template. Honors .agentignore.
#
# Exit codes: 0 = allow, 2 = block (reason on stderr).
# Env: SENSITIVE_GUARD_EXTRA — extra pipe-separated path patterns to block.
set -euo pipefail

INPUT=$(cat)
[[ -z "$INPUT" ]] && exit 0

# Security guard: warn loudly if Node is missing rather than silently allowing.
if ! command -v node &>/dev/null; then
  echo "WARNING: read-guard degraded — Node.js not found. Sensitive files are NOT fully protected." >&2
  exit 0
fi

extract_path() {
  printf '%s' "$1" | node -e "
    try {
      const d = JSON.parse(require('fs').readFileSync(0,'utf-8'));
      const p = d.tool_input?.file_path ?? d.file_path ?? d.tool_input?.path ?? d.path;
      if (typeof p === 'string') process.stdout.write(p);
    } catch {}
  " 2>/dev/null
}

FILE_PATH=$(extract_path "$INPUT") || exit 0
[[ -z "$FILE_PATH" ]] && exit 0

# ─── Fast-path: obviously safe source/doc files (json still checked) ─
fast_path_safe() {
  local ext="${1##*.}"
  case "$ext" in
    md|ts|tsx|js|jsx|css|scss|html|svg|yaml|yml|toml|xml|txt|sh|py|rb|rs|go|java|kt|swift|c|cpp|h|hpp|cs|vue|svelte|astro)
      return 0 ;;
  esac
  return 1
}

# ─── Sensitive filename detection ───────────────────────────────────
is_sensitive() {
  local filepath="$1" basename
  basename=$(basename "$filepath" 2>/dev/null) || return 1

  case "$basename" in
    .env|.env.local|.env.development|.env.production|.env.staging|.env.test) return 0 ;;
    .npmrc|.pypirc|.netrc) return 0 ;;
    id_rsa|id_ecdsa|id_ed25519|id_dsa) return 0 ;;
    serviceAccountKey.json|service-account*.json) return 0 ;;
    config.json) [[ "$filepath" == *".docker/config.json"* ]] && return 0 ;;
  esac
  case "$basename" in
    *.pem|*.key|*.p12|*.pfx|*.jks|*.keystore|*.truststore) return 0 ;;
    *_rsa|*_ecdsa|*_ed25519|*_dsa) return 0 ;;
  esac
  local lower
  lower=$(echo "$basename" | tr '[:upper:]' '[:lower:]')
  case "$lower" in
    *credential*|*secret*|*private_key*|*privatekey*) return 0 ;;
    firebase-adminsdk*) return 0 ;;
  esac
  if [[ "$basename" =~ ^\.env\. ]]; then
    case "$basename" in
      .env.example|.env.sample|.env.template) return 1 ;;
      *) return 0 ;;
    esac
  fi
  if [[ -n "${SENSITIVE_GUARD_EXTRA:-}" ]] && printf '%s\n' "$filepath" | grep -qE "$SENSITIVE_GUARD_EXTRA"; then
    return 0
  fi
  return 1
}

# ─── .agentignore / .aiignore / .cursorignore ───────────────────────
check_agentignore() {
  local filepath="$1" ignorefile=""
  for candidate in .agentignore .aiignore .cursorignore; do
    [[ -f "$candidate" ]] && { ignorefile="$candidate"; break; }
  done
  [[ -z "$ignorefile" ]] && return 1

  local normalized_fp normalized_pwd relpath
  normalized_fp=$(printf '%s' "$filepath" | tr '\\' '/')
  normalized_pwd=$(pwd | tr '\\' '/')
  relpath=$(printf '%s' "$normalized_fp" | sed "s|^${normalized_pwd}/||") 2>/dev/null || relpath="$filepath"

  while IFS= read -r pattern || [[ -n "$pattern" ]]; do
    [[ -z "$pattern" || "$pattern" == \#* ]] && continue
    if [[ "$relpath" == $pattern ]] || [[ "$(basename "$relpath")" == $pattern ]]; then
      return 0
    fi
  done < "$ignorefile"
  return 1
}

# ─── Allow example/template variants outright ───────────────────────
case "$FILE_PATH" in
  *.example|*.sample|*.template) exit 0 ;;
esac

if ! fast_path_safe "$FILE_PATH"; then
  if is_sensitive "$FILE_PATH" || check_agentignore "$FILE_PATH"; then
    echo "Blocked: '$FILE_PATH' is a sensitive file (secrets, keys, or credentials). Use its .example variant, or ask the user first." >&2
    exit 2
  fi
fi

exit 0
