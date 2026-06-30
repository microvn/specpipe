#!/usr/bin/env bash
set -euo pipefail

# Usage: ./publish.sh [patch|minor|major] ["commit message"]
# Default: patch

BUMP="${1:-patch}"
COMMIT_MSG="${2:-}"
CLI_DIR="$(cd "$(dirname "$0")/cli" && pwd)"
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Validate bump type
if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo "Usage: $0 [patch|minor|major]"
  exit 1
fi

# Must be on main branch
BRANCH=$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  echo "error: must be on main branch (currently on '$BRANCH')"
  exit 1
fi

cd "$ROOT_DIR"

# Run test suite — must pass before publish (mirrors `npm test`: agents emitter +
# cli + hooks + coverage-gate). agents.mjs covers the multi-agent emitter/registry.
echo "running test suite..."
node test/agents.mjs       || { echo "error: agents (multi-agent) tests failed — aborting publish"; exit 1; }
bash test/cli.sh           || { echo "error: cli tests failed — aborting publish"; exit 1; }
bash test/hooks.sh         || { echo "error: hooks tests failed — aborting publish"; exit 1; }
bash test/coverage-gate.sh || { echo "error: coverage-gate tests failed — aborting publish"; exit 1; }
echo ""

# Stage + commit any pending changes first
if [[ -n "$(git status --short)" ]]; then
  if [[ -z "$COMMIT_MSG" ]]; then
    echo "error: uncommitted changes found but no commit message provided"
    echo "Usage: $0 [patch|minor|major] \"commit message\""
    git status --short
    exit 1
  fi
  echo "staging uncommitted changes..."
  git add -A
  git --no-pager diff --cached --stat
  git commit -m "$COMMIT_MSG"
fi

# Secret scan — block publish if a real credential value reached a commit.
# Scans the whole tree about to be pushed (HEAD), not just the last diff.
# Matches credential VALUES, not the words "secret"/"token" in prose.
echo "scanning for secrets..."
if git grep -nIE \
  -e '(postgres(ql)?(\+[a-z]+)?|mysql|mongodb(\+srv)?)://[^:@/ ]+:[^@/ ]+@' \
  -e '(sk_live_|rk_live_|ghp_|gho_|github_pat_)[A-Za-z0-9]{16,}' \
  -e 'AKIA[0-9A-Z]{16}' \
  -e '-----BEGIN [A-Z ]*PRIVATE KEY-----' \
  -e '(password|passwd|secret|api[_-]?key|access[_-]?token)["'"'"']?\s*[:=]\s*["'"'"'][^"'"'"' ]{8,}' \
  -- HEAD 2>/dev/null \
  | grep -viE 'dummy|example|placeholder|REDACTED|\$\{|<[a-z_]+>|xxx|sk_test_|whsec_dummy'; then
  echo "error: possible secret found in tracked files (above) — aborting publish. Redact or .gitignore it first."
  exit 1
fi
echo "secret scan clean."

# Bump version
cd "$CLI_DIR"
OLD_VERSION=$(node -p "require('./package.json').version")
npm version "$BUMP" --no-git-tag-version
NEW_VERSION=$(node -p "require('./package.json').version")
echo "bumping $OLD_VERSION → $NEW_VERSION"

# Commit version bump + tag + push
cd "$ROOT_DIR"
git add cli/package.json cli/package-lock.json
git commit -m "chore: bump version to $NEW_VERSION"
git tag "v$NEW_VERSION"
# Push to the public OSS remote. `origin` = github.com/microvn/specpipe.
git push origin main && git push origin --tags

# Publish
cd "$CLI_DIR"
npm publish

echo ""
echo "published specpipe@$NEW_VERSION"

# Update global skills on the publishing machine using local CLI (no global install required)
echo "updating global skills..."
node "$CLI_DIR/bin/devkit.js" upgrade --global
