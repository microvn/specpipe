#!/usr/bin/env bash
# build-test.sh — Universal test runner with auto-detection
# Detects project language/framework and runs the appropriate test command.
#
# Usage:
#   bash scripts/build-test.sh                  # run all tests
#   bash scripts/build-test.sh --filter "Auth"  # filter by pattern
#   bash scripts/build-test.sh --list           # show detected project type
#   bash scripts/build-test.sh --ci             # machine-readable output
#
# Supports: Swift (SPM/Xcode), Node (Vitest/Jest), Python (pytest/unittest),
#           Rust (cargo), Go, Java (Gradle/Maven), C# (.NET), Ruby (RSpec/Minitest)
#
# Exit codes:
#   0 — all tests passed
#   1 — tests failed
#   2 — no project detected or missing tooling

set -euo pipefail

# ─── Argument parsing ───────────────────────────────────────────────

FILTER=""
CI_MODE=false
LIST_ONLY=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --filter)  FILTER="${2:-}"; shift 2 ;;
        --ci)      CI_MODE=true; shift ;;
        --list)    LIST_ONLY=true; shift ;;
        --help|-h) sed -n '2,16p' "$0"; exit 0 ;;
        *)         FILTER="$1"; shift ;;  # bare arg = filter
    esac
done

# ─── Output helpers ─────────────────────────────────────────────────

info()  { echo "[INFO] $*"; }
pass()  { echo "[PASS] $*"; }
fail()  { echo "[FAIL] $*"; }
skip()  { echo "[SKIP] $*"; }

# ─── Language detectors ─────────────────────────────────────────────
# Each function returns 0 if detected, 1 otherwise.
# Sets LANG_NAME and TEST_CMD as side effects.

detect_swift_spm() {
    [[ -f "Package.swift" ]] || return 1
    LANG_NAME="Swift (SPM)"
    if [[ -n "$FILTER" ]]; then
        TEST_CMD="swift test --filter '$FILTER'"
    else
        TEST_CMD="swift test"
    fi
}

# Resolve a partial test name to a fully-qualified xcodebuild test ID.
# xcodebuild -only-testing requires: TestTarget/TestClass/methodName
# If FILTER already contains '/', treat as already qualified.
# Otherwise, grep Swift test files to find which class/struct contains the method.
resolve_xcode_filter() {
    local filter="$1"
    [[ "$filter" == *"/"* ]] && { echo "$filter"; return; }

    # Find the Swift file containing this test method
    local file
    file=$(grep -rl "func ${filter}" --include="*.swift" . 2>/dev/null | head -1)
    [[ -z "$file" ]] && { echo "$filter"; return; }

    # Extract the class/struct name enclosing the method (handles @Test @MainActor etc.)
    local class_line
    class_line=$(awk '/^[[:space:]]*(final[[:space:]]+|open[[:space:]]+|public[[:space:]]+)*(class|struct)[[:space:]]/{cls=$0} \
        /func '"$filter"'/{print cls; exit}' "$file")
    [[ -z "$class_line" ]] && { echo "$filter"; return; }

    local class_name
    class_name=$(echo "$class_line" | awk '{for(i=1;i<=NF;i++) if($i=="class"||$i=="struct"){print $(i+1); exit}}' | tr -d '{:')
    [[ -z "$class_name" ]] && { echo "$filter"; return; }

    # Extract test target name from the file path (directory component ending in *Tests)
    local target
    target=$(echo "$file" | grep -oE '[^/]+(Tests|UITests)[^/]*' | head -1)
    [[ -z "$target" ]] && { echo "$class_name/$filter"; return; }

    echo "$target/$class_name/$filter"
}

detect_swift_xcode() {
    local project=""
    local flag=""

    if compgen -G "*.xcworkspace" > /dev/null 2>&1; then
        project=$(compgen -G "*.xcworkspace" | head -1)
        flag="-workspace"
    elif compgen -G "*.xcodeproj" > /dev/null 2>&1; then
        project=$(compgen -G "*.xcodeproj" | head -1)
        flag="-project"
    else
        return 1
    fi

    local scheme
    scheme=$(xcodebuild "$flag" "$project" -list 2>/dev/null \
        | sed -n '/Schemes:/,/^$/p' | tail -n +2 | head -1 | xargs) || return 1

    [[ -z "$scheme" ]] && return 1

    LANG_NAME="Swift (Xcode: $scheme)"
    TEST_CMD="xcodebuild test $flag '$project' -scheme '$scheme' -destination 'platform=macOS,arch=arm64'"
    if [[ -n "$FILTER" ]]; then
        local qualified
        qualified=$(resolve_xcode_filter "$FILTER")
        info "Filter resolved: '$FILTER' → '$qualified'"
        TEST_CMD="$TEST_CMD -only-testing:'$qualified'"
    fi
}

detect_node() {
    [[ -f "package.json" ]] || return 1

    # Detect package manager
    local runner="npx"
    [[ -f "pnpm-lock.yaml" ]] && runner="pnpm exec"
    [[ -f "bun.lockb" || -f "bun.lock" ]] && runner="bunx"

    if [[ -f "vitest.config.ts" || -f "vitest.config.js" || -f "vitest.config.mts" ]] \
       || grep -q '"vitest"' package.json 2>/dev/null; then
        LANG_NAME="Node (Vitest)"
        if [[ -n "$FILTER" ]]; then
            TEST_CMD="$runner vitest run '$FILTER'"
        else
            TEST_CMD="$runner vitest run"
        fi
    elif [[ -f "jest.config.ts" || -f "jest.config.js" || -f "jest.config.mjs" ]] \
         || grep -q '"jest"' package.json 2>/dev/null; then
        LANG_NAME="Node (Jest)"
        if [[ -n "$FILTER" ]]; then
            TEST_CMD="$runner jest '$FILTER' --no-cache"
        else
            TEST_CMD="$runner jest --no-cache"
        fi
    elif grep -q '"test"' package.json 2>/dev/null; then
        LANG_NAME="Node (npm test)"
        TEST_CMD="npm test"
    else
        return 1
    fi
}

detect_python() {
    [[ -f "pyproject.toml" || -f "setup.py" || -f "pytest.ini" || -f "setup.cfg" ]] \
        || { [[ -d "tests" && -f "requirements.txt" ]]; } \
        || return 1

    if command -v pytest &>/dev/null || python3 -m pytest --version &>/dev/null 2>&1; then
        LANG_NAME="Python (pytest)"
        if [[ -n "$FILTER" ]]; then
            TEST_CMD="python3 -m pytest -xvs -k '$FILTER'"
        else
            TEST_CMD="python3 -m pytest -x"
        fi
    else
        LANG_NAME="Python (unittest)"
        TEST_CMD="python3 -m unittest discover -s tests"
    fi
}

detect_rust() {
    [[ -f "Cargo.toml" ]] || return 1
    LANG_NAME="Rust (cargo)"
    if [[ -n "$FILTER" ]]; then
        TEST_CMD="cargo test '$FILTER'"
    else
        TEST_CMD="cargo test"
    fi
}

detect_go() {
    [[ -f "go.mod" ]] || return 1
    LANG_NAME="Go"
    if [[ -n "$FILTER" ]]; then
        TEST_CMD="go test -race -run '$FILTER' ./..."
    else
        TEST_CMD="go test -race ./..."
    fi
}

detect_gradle() {
    [[ -f "build.gradle" || -f "build.gradle.kts" ]] || return 1
    LANG_NAME="Java/Kotlin (Gradle)"
    if [[ -n "$FILTER" ]]; then
        TEST_CMD="./gradlew test --tests '$FILTER'"
    else
        TEST_CMD="./gradlew test"
    fi
}

detect_maven() {
    [[ -f "pom.xml" ]] || return 1
    LANG_NAME="Java (Maven)"
    if [[ -n "$FILTER" ]]; then
        TEST_CMD="mvn test -Dtest='$FILTER'"
    else
        TEST_CMD="mvn test"
    fi
}

detect_dotnet() {
    compgen -G "*.sln" > /dev/null 2>&1 || compgen -G "*.csproj" > /dev/null 2>&1 || return 1
    LANG_NAME="C# (.NET)"
    if [[ -n "$FILTER" ]]; then
        TEST_CMD="dotnet test --filter '$FILTER'"
    else
        TEST_CMD="dotnet test"
    fi
}

detect_ruby() {
    [[ -f "Gemfile" ]] || return 1
    if grep -q 'rspec' Gemfile 2>/dev/null; then
        LANG_NAME="Ruby (RSpec)"
        if [[ -n "$FILTER" ]]; then
            TEST_CMD="bundle exec rspec --tag '$FILTER'"
        else
            TEST_CMD="bundle exec rspec"
        fi
    else
        LANG_NAME="Ruby (Minitest)"
        TEST_CMD="bundle exec rake test"
    fi
}

# ─── Detection order (first match wins) ────────────────────────────

DETECTORS=(
    detect_swift_spm
    detect_swift_xcode
    detect_node
    detect_python
    detect_rust
    detect_go
    detect_gradle
    detect_maven
    detect_dotnet
    detect_ruby
)

LANG_NAME=""
TEST_CMD=""

for detector in "${DETECTORS[@]}"; do
    if $detector; then
        break
    fi
done

# ─── No project detected ───────────────────────────────────────────

if [[ -z "$LANG_NAME" ]]; then
    fail "No supported project detected in $(pwd)"
    info "Supported: Swift (SPM/Xcode), Node (Vitest/Jest), Python (pytest),"
    info "           Rust (cargo), Go, Java (Gradle/Maven), C# (.NET), Ruby"
    exit 2
fi

# ─── List mode ──────────────────────────────────────────────────────

if $LIST_ONLY; then
    if $CI_MODE; then
        echo "$LANG_NAME"
    else
        info "Detected: $LANG_NAME"
        info "Command:  $TEST_CMD"
    fi
    exit 0
fi

# ─── Run tests ──────────────────────────────────────────────────────

info "Detected: $LANG_NAME"
info "Running:  $TEST_CMD"
echo ""

if eval "$TEST_CMD"; then
    echo ""
    pass "All tests passed ($LANG_NAME)"
    exit 0
else
    STATUS=$?
    echo ""
    fail "Tests failed ($LANG_NAME, exit code: $STATUS)"
    exit 1
fi
