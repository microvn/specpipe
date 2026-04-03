#!/usr/bin/env bash
# sensitive-guard.sh — PreToolUse hook for Claude Code
#
# Blocks access to sensitive files: .env, private keys, credentials, tokens.
# Supports .agentignore for project-specific patterns.
#
# Exit codes:
#   0 — access allowed
#   2 — access blocked (sensitive file)
#
# Environment:
#   SENSITIVE_GUARD_EXTRA — additional pipe-separated filename patterns to block

set -euo pipefail

# Windows note: this hook requires bash (WSL or Git Bash).
# On Windows without bash, Claude Code will fail to run this hook and skip it silently.
# Install WSL or Git Bash and ensure `bash` is in PATH to activate protection.

# ─── Read hook payload from stdin ───────────────────────────────────

INPUT=$(cat)
[[ -z "$INPUT" ]] && exit 0

# Check Node.js availability — security hook should warn loudly if disabled
if ! command -v node &>/dev/null; then
    echo "WARNING: sensitive-guard disabled — Node.js not found. Sensitive files are NOT protected." >&2
    exit 0
fi

# Extract file path and/or command using inline Node.js
PARSED=$(printf '%s' "$INPUT" | node -e "
  try {
    const d = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
    const fp = d.tool_input?.file_path || d.tool_input?.path || '';
    const cmd = d.tool_input?.command || '';
    const pat = d.tool_input?.pattern || '';
    process.stdout.write(fp + '\n' + cmd + '\n' + pat);
  } catch { process.exit(0); }
" 2>/dev/null) || exit 0

FILE_PATH=$(printf '%s' "$PARSED" | sed -n '1p')
COMMAND=$(printf '%s' "$PARSED" | sed -n '2p')
PATTERN=$(printf '%s' "$PARSED" | sed -n '3p')

# ─── Sensitive filename patterns ────────────────────────────────────

# Returns 0 (true) if the path matches a sensitive pattern
is_sensitive() {
    local filepath="$1"
    local basename
    basename=$(basename "$filepath" 2>/dev/null) || return 1

    # Exact filenames (basename match)
    case "$basename" in
        .env|.env.local|.env.development|.env.production|.env.staging|.env.test)
            return 0 ;;
        .npmrc|.pypirc|.netrc)
            return 0 ;;
        id_rsa|id_ecdsa|id_ed25519|id_dsa)
            return 0 ;;
        serviceAccountKey.json|service-account*.json)
            return 0 ;;
        config.json)
            # config.json only sensitive inside .docker/
            [[ "$filepath" == *".docker/config.json"* ]] && return 0
            ;;
    esac

    # Extension patterns
    case "$basename" in
        *.pem|*.key|*.p12|*.pfx|*.jks|*.keystore|*.truststore)
            return 0 ;;
        *_rsa|*_ecdsa|*_ed25519|*_dsa)
            return 0 ;;
    esac

    # Substring patterns (case-insensitive via bash)
    local lower
    lower=$(echo "$basename" | tr '[:upper:]' '[:lower:]')
    case "$lower" in
        *credential*|*secret*|*private_key*|*privatekey*)
            return 0 ;;
        firebase-adminsdk*)
            return 0 ;;
    esac

    # .env.* but NOT .env.example or .env.sample or .env.template
    if [[ "$basename" =~ ^\.env\. ]]; then
        case "$basename" in
            .env.example|.env.sample|.env.template) return 1 ;;
            *) return 0 ;;
        esac
    fi

    # Extra patterns from env var
    if [[ -n "${SENSITIVE_GUARD_EXTRA:-}" ]]; then
        if printf '%s\n' "$filepath" | grep -qE "$SENSITIVE_GUARD_EXTRA"; then
            return 0
        fi
    fi

    return 1
}

# ─── Check .agentignore ────────────────────────────────────────────

check_agentignore() {
    local filepath="$1"
    local ignorefile=""

    # Look for ignore files in project root
    for candidate in .agentignore .aiignore .cursorignore; do
        if [[ -f "$candidate" ]]; then
            ignorefile="$candidate"
            break
        fi
    done

    [[ -z "$ignorefile" ]] && return 1

    # Simple line-by-line match (not full gitignore glob, but covers common cases)
    local relpath
    # Normalize separators to forward slash before stripping prefix (handles Git Bash on Windows)
    local normalized_fp normalized_pwd
    normalized_fp=$(printf '%s' "$filepath" | tr '\\' '/')
    normalized_pwd=$(pwd | tr '\\' '/')
    relpath=$(printf '%s' "$normalized_fp" | sed "s|^${normalized_pwd}/||") 2>/dev/null || relpath="$filepath"

    while IFS= read -r pattern || [[ -n "$pattern" ]]; do
        # Skip comments and empty lines
        [[ -z "$pattern" || "$pattern" == \#* ]] && continue
        # Simple glob match
        if [[ "$relpath" == $pattern ]] || [[ "$(basename "$relpath")" == $pattern ]]; then
            return 0
        fi
    done < "$ignorefile"

    return 1
}

# ─── Check file path access ────────────────────────────────────────

block_with_message() {
    local filepath="$1"
    echo "Blocked: '$filepath' is a sensitive file (secrets, keys, or credentials). Access denied to protect sensitive data. Use .env.example for templates instead." >&2
    exit 2
}

warn_with_message() {
    local filepath="$1"
    echo "Warning: '$filepath' is a sensitive file. If the user approved this access, proceed. Otherwise, ask the user for permission first via AskUserQuestion before reading sensitive files." >&2
    # Warn only — exit 0 allows the command to proceed
    # This enables the flow: Block Read → Claude asks user → User approves → Claude uses bash cat
    exit 0
}

# ─── Fast-path: skip obviously safe files ──────────────────────────

fast_path_safe() {
    local ext="${1##*.}"
    case "$ext" in
        md|ts|tsx|js|jsx|css|scss|html|svg|json|yaml|yml|toml|xml|txt|sh|py|rb|rs|go|java|kt|swift|c|cpp|h|hpp|cs|vue|svelte|astro)
            # But json could be sensitive — check name
            if [[ "$ext" == "json" ]]; then
                return 1  # not fast-path safe, need full check
            fi
            return 0 ;;
    esac
    return 1
}

# ─── Check direct file access (Read/Write/Edit) → BLOCK ────────────

if [[ -n "$FILE_PATH" ]]; then
    if ! fast_path_safe "$FILE_PATH"; then
        if is_sensitive "$FILE_PATH" || check_agentignore "$FILE_PATH"; then
            block_with_message "$FILE_PATH"
        fi
    fi
fi

# ─── Check bash commands → WARN only (allows approved access) ──────

if [[ -n "$COMMAND" ]]; then
    # Extract .env file references from commands
    SENSITIVE_IN_CMD=$(printf '%s\n' "$COMMAND" | grep -oE '[\./[:alnum:]_-]*\.env[\.[:alnum:]_-]*' | head -5) || true

    if [[ -n "$SENSITIVE_IN_CMD" ]]; then
        while IFS= read -r match; do
            case "$match" in
                *.example|*.sample|*.template) continue ;;
            esac
            if is_sensitive "$match"; then
                warn_with_message "$match"
            fi
        done <<< "$SENSITIVE_IN_CMD"
    fi

    # Check for key/cert file references in commands → also warn only
    KEY_IN_CMD=$(printf '%s\n' "$COMMAND" | grep -oE '[[:alnum:]_./-]*\.(pem|key|p12|pfx|jks|keystore)' | head -3) || true
    if [[ -n "$KEY_IN_CMD" ]]; then
        while IFS= read -r match; do
            warn_with_message "$match"
        done <<< "$KEY_IN_CMD"
    fi

    # Check for SSH keys, credentials, service accounts in commands
    SENSITIVE_NAMES=$(printf '%s\n' "$COMMAND" | grep -oiE '(id_rsa|id_ecdsa|id_ed25519|id_dsa|serviceAccountKey\.json|service-account[[:alnum:]_-]*\.json|\.npmrc|\.pypirc|\.netrc)' | head -3) || true
    if [[ -n "$SENSITIVE_NAMES" ]]; then
        while IFS= read -r match; do
            warn_with_message "$match"
        done <<< "$SENSITIVE_NAMES"
    fi

    # Check for credential/secret keywords in file arguments
    CRED_FILES=$(printf '%s\n' "$COMMAND" | grep -oiE '[[:alnum:]_./-]*(credential|secret|private_key|privatekey)[[:alnum:]_./-]*' | head -3) || true
    if [[ -n "$CRED_FILES" ]]; then
        while IFS= read -r match; do
            warn_with_message "$match"
        done <<< "$CRED_FILES"
    fi
fi

# ─── All checks passed ─────────────────────────────────────────────

exit 0
