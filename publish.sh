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

# Run test suite — must pass before publish
echo "running test suite..."
bash test/hooks.sh         || { echo "error: hooks tests failed — aborting publish"; exit 1; }
bash test/cli.sh           || { echo "error: cli tests failed — aborting publish"; exit 1; }
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
git push && git push --tags

# Publish
cd "$CLI_DIR"
npm publish

echo ""
echo "published agentpipe@$NEW_VERSION"

# Update global skills on the publishing machine using local CLI (no global install required)
echo "updating global skills..."
node "$CLI_DIR/bin/devkit.js" upgrade --global
