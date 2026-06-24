---
description: |
  Multi-voice review — orchestrate multiple LLMs (Claude + Codex + others) to
  independently evaluate any input, synthesize consensus and disagreements
  into actionable output.
  Use when asked to "multi-voice review", "second opinion", "ý kiến nhiều mô hình",
  "hỏi nhiều LLM", "ask multiple LLMs", "voices review", or "what do other models think".
  Proactively suggest for high-stakes or controversial decisions — irreversible
  architecture choices, security trade-offs, "are we sure about this design"
  moments — where a single model's confidence is not enough.
  Skip for trivial questions or work where one perspective is sufficient.
  Works on code, specs, plans, ideas, or any text input.
allowed-tools: Read, Bash, Glob, Grep, Write, AskUserQuestion
---
# /sp-voices — Multi-Voice Review

Get independent perspectives from multiple LLMs on anything —
code, ideas, documents, architecture, skills, decisions.

Target: $ARGUMENTS

---

## How It Works

```
1. Understand what you're asking          (Phase 1)
2. Find available reviewers               (Phase 2)
3. Ask them — open-ended, not templated   (Phase 3)
4. Synthesize their responses             (Phase 4)
5. Show you what matters for YOUR decision (Phase 5)
```

---

## Phase 1: Understand Intent

Read `$ARGUMENTS`. Don't classify into a box — understand what the user
is trying to DECIDE.

### 1.1 — What is the user trying to decide?

```
Parse $ARGUMENTS for decision intent:

"what do you think about..."  → User wants: opinions + consensus on direction
"review code/diff"            → User wants: bugs, risks, merge/block decision
"check this doc"              → User wants: readiness assessment, gaps
"is this approach ok"         → User wants: validation or alternatives
"any issues with this"        → User wants: risk identification
"compare A vs B"              → User wants: trade-off analysis
"this strategy"               → User wants: go/pivot/stop signal

If unclear → ask 1 question:
  "What decision are you trying to make from this review?"
  Don't ask "what type of review" — ask "what decision".
```

### 1.2 — What material is involved?

```bash
# If $ARGUMENTS points to file(s)
# Read and measure
MATERIAL=$(cat <file> 2>/dev/null)
LINES=$(echo "$MATERIAL" | wc -l | xargs)
echo "Material: <file>, $LINES lines"

# If $ARGUMENTS is about git diff
MATERIAL=$(git diff main...HEAD 2>/dev/null)
[ -z "$MATERIAL" ] && MATERIAL=$(git diff HEAD~1 2>/dev/null)

# If $ARGUMENTS is a question/idea (no file)
# Material = the question itself + any referenced context
```

If material > 32KB → chunk by logical sections.

### 1.3 — Confirm before proceeding

**Always confirm intent in 1 line before spawning voices.**
Include voice count + which voice(s).

```
Simple (1 voice, auto-selected):
  "Asking Perplexity if anyone has solved a similar problem. Ok?"
  "Having Claude review auth.ts for bugs. Ok?"

Medium (2 voices, auto-selected):
  "Getting 2 opinions: Claude (code logic) + Perplexity (security/CVEs). Ok?"
  "Asking GPT (business logic) + Claude (technical feasibility). Ok?"

Complex (N voices, user picks via AskUserQuestion):
  "Complex problem — I'll ask you to pick voices. First, confirm:
   you want to evaluate [intent summary] — correct?"
```

**If user corrects → adjust intent + voice selection.**
**If user says "add voice" or "fewer voices" → adjust.**

---

## Phase 2: Find Reviewers

### 2.1 — Probe Availability

```bash
echo "=== Reviewer availability ==="

# External LLMs
command -v openai &>/dev/null && echo "OPENAI_CLI: available" || \
  ([ -n "$OPENAI_API_KEY" ] && echo "OPENAI_API: key set" || echo "OPENAI: ✗")
# Codex needs binary AND auth (one of: $CODEX_API_KEY, $OPENAI_API_KEY,
# or ${CODEX_HOME:-~/.codex}/auth.json). Binary alone isn't enough.
if command -v codex &>/dev/null; then
  _CODEX_AUTH_FILE="${CODEX_HOME:-$HOME/.codex}/auth.json"
  if [ -n "$CODEX_API_KEY" ] || [ -n "$OPENAI_API_KEY" ] || [ -f "$_CODEX_AUTH_FILE" ]; then
    echo "CODEX_CLI: available"
  else
    echo "CODEX: ✗ (binary present, no auth — run 'codex login')"
  fi
else
  echo "CODEX: ✗"
fi
# Gemini API (generativelanguage / AI Studio) is a hosted REST endpoint — needs
# $GEMINI_API_KEY. NOTE: the standalone `gemini` CLI was retired 2026-06-18 and
# folded into Antigravity CLI (`agy`) — probe that separately below, not here.
[ -n "$GEMINI_API_KEY" ] && echo "GEMINI_API: key set" || echo "GEMINI: ✗"
[ -n "$PERPLEXITY_API_KEY" ] && echo "PERPLEXITY: available" || echo "PERPLEXITY: ✗"
# Antigravity CLI (`agy`) — Google's agentic terminal coding agent, the successor
# to the retired `gemini` CLI. Agentic like Codex: reads code, runs commands.
# Needs binary AND auth (one of: $ANTIGRAVITY_API_KEY, $GEMINI_API_KEY — both
# accepted by agy — or OS-keyring/OAuth state from a prior interactive `agy`
# login under ~/.gemini/antigravity-cli/). Binary alone isn't enough.
if command -v agy &>/dev/null; then
  if [ -n "$ANTIGRAVITY_API_KEY" ] || [ -n "$GEMINI_API_KEY" ] || [ -d "$HOME/.gemini/antigravity-cli" ]; then
    echo "ANTIGRAVITY_CLI: available"
  else
    echo "ANTIGRAVITY: ✗ (binary present, no auth — run 'agy' once to log in)"
  fi
else
  echo "ANTIGRAVITY: ✗"
fi
[ -n "$ANTHROPIC_API_KEY" ] && echo "ANTHROPIC_API: key set" || echo "ANTHROPIC: host only"
command -v ollama &>/dev/null && echo "OLLAMA: available" || echo "OLLAMA: ✗"
command -v claude &>/dev/null && echo "SELF_SPAWN: available" || echo "SELF_SPAWN: ✗"

echo "==========================="
```

### 2.2 — Auth Probe (Tier 1 voices only)

Before building expensive prompts, verify that API keys are actually valid.
A set key does not mean a working key.

```bash
# Lightweight auth probe — only for voices that will be used
# Each probe: small request, < 10 tokens, just check for 401/403

# OpenAI
if [ -n "$OPENAI_API_KEY" ]; then
  _OAI_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    https://api.openai.com/v1/models 2>/dev/null)
  [ "$_OAI_STATUS" = "200" ] && echo "OPENAI_AUTH: valid" || echo "OPENAI_AUTH: FAILED ($_OAI_STATUS)"
fi

# Perplexity — SKIPPED: Perplexity has no free auth-probe endpoint.
# A real chat completion (even max_tokens:1) is billed per request, so probing
# every run wastes money. Trust the key is set; if invalid, the actual review
# call will return 401 and Phase 3.5 (Post-Response Checks) flags it as
# "auth failed". Net cost: 1 wasted real call vs N probe calls per session.
if [ -n "$PERPLEXITY_API_KEY" ]; then
  echo "PERPLEXITY_AUTH: assumed valid (probe skipped — would cost money)"
fi

# Gemini API — use header auth (x-goog-api-key) to keep the key out of URLs/logs.
if [ -n "$GEMINI_API_KEY" ]; then
  _GEM_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "x-goog-api-key: $GEMINI_API_KEY" \
    https://generativelanguage.googleapis.com/v1beta/models 2>/dev/null)
  [ "$_GEM_STATUS" = "200" ] && echo "GEMINI_AUTH: valid" || echo "GEMINI_AUTH: FAILED ($_GEM_STATUS)"
fi

# Antigravity CLI — no cheap REST auth-probe endpoint; it authenticates the agent
# harness on first call. If $ANTIGRAVITY_API_KEY / $GEMINI_API_KEY is set or OAuth
# state exists, trust it; a dead key surfaces as an error on the real call
# (Phase 3.5 flags it).
if command -v agy &>/dev/null && { [ -n "$ANTIGRAVITY_API_KEY" ] || [ -n "$GEMINI_API_KEY" ] || [ -d "$HOME/.gemini/antigravity-cli" ]; }; then
  echo "ANTIGRAVITY_AUTH: assumed valid (agent harness — probe skipped)"
fi

# Anthropic
if [ -n "$ANTHROPIC_API_KEY" ]; then
  _ANT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    https://api.anthropic.com/v1/models 2>/dev/null)
  [ "$_ANT_STATUS" = "200" ] && echo "ANTHROPIC_AUTH: valid" || echo "ANTHROPIC_AUTH: FAILED ($_ANT_STATUS)"
fi
```

If any voice's auth probe returns FAILED:
- Remove it from available voices BEFORE voice selection
- Note in output: "Voice X skipped — auth failed"
- Do NOT waste tokens building a prompt for a dead key

### 2.3 — Reviewer Priority

```
Tier 1 — Different model family (most diverse):
  GPT, Gemini, Perplexity
  → Different training = different perspectives

Tier 2 — Agentic / independent session (reads code, runs commands, or fresh context):
  Codex CLI, Antigravity CLI (`agy`), Anthropic API (different Claude model)
  → Antigravity CLI is Google's agentic terminal agent (successor to the retired
    `gemini` CLI, shut down 2026-06-18) — it actually reads the repo, like Codex.
    Pick the backing model with `agy --model` (Gemini 3.1 Pro, Claude, GPT-OSS —
    depends on plan), so this voice doubles as a Google-family OR cross-family reviewer.
  → Independent context = still valuable

Tier 3 — Local:
  Ollama
  → Free, private, lower capability

Tier 4 — Self-spawn (always available):
  claude --print (fresh context, no conversation history)
  → Inherits the current Claude Code session's model by default
    (override via $MF_VOICES_SELF_SPAWN_MODEL)
  → Same model but fresh eyes — better than nothing
  → MARK in output: "self-spawn — same model family"
```

### Voice Strengths — Who's Good at What

```
┌─────────────────┬──────────────────────────────────────────────────────┐
│ Voice           │ Best For                                             │
├─────────────────┼──────────────────────────────────────────────────────┤
│ Claude          │ Code review, nuanced reasoning, design/architecture, │
│ (Haiku 4.5 /    │ long-context analysis, careful edge case thinking.   │
│  Sonnet 4.6 /   │ Default voice: sonnet-4-6 ($3/$15). Self-spawn      │
│  Opus 4.7)      │ inherits the current Claude Code session's model    │
│                 │ (override via $MF_VOICES_SELF_SPAWN_MODEL — e.g.    │
│                 │ haiku-4-5 $1/$5 for cheap second opinion).          │
│                 │ Bump to opus-4-7 ($5/$25) for                       │
│                 │ hardest reasoning.                                   │
│                 │ Strongest at: code quality, readability, subtle bugs.│
├─────────────────┼──────────────────────────────────────────────────────┤
│ GPT (5-mini /   │ Wide domain knowledge, business logic, product      │
│  5.5)           │ thinking, real-world patterns. Strong at connecting  │
│                 │ technical decisions to business impact.              │
│                 │ Default: gpt-5-mini ($0.25/$2). gpt-5.5 ($5/$30,    │
│                 │ released 2026-04-23) only when top quality matters  │
│                 │ — gpt-5.5 is now pricier than Sonnet 4.6.           │
│                 │ Strongest at: domain expertise, practical tradeoffs. │
├─────────────────┼──────────────────────────────────────────────────────┤
│ Gemini          │ Broad analysis, large context window, multi-modal.  │
│ (3 Flash /      │ Good at synthesizing large documents.               │
│  3.1 Pro)       │ Default: gemini-3-flash ($0.50/$3). Upgrade to      │
│                 │ gemini-3.1-pro-preview ($2/$12, $4/$18 >200k ctx).  │
│                 │ NOTE: gemini-3-pro deprecated 2026-03-09 — calls   │
│                 │ to that model ID will fail. Use 3.1-pro-preview.   │
│                 │ Strongest at: big-picture, cross-cutting concerns.  │
├─────────────────┼──────────────────────────────────────────────────────┤
│ Perplexity      │ Real-time web search. Knows current CVEs, latest    │
│ (sonar /        │ best practices, library health, who solved this     │
│  sonar-pro)     │ problem before. CITES SOURCES.                      │
│                 │ Default: sonar-pro ($3/$15) for citation quality.   │
│                 │ sonar ($1/$1) for cheap quick lookups.              │
│                 │ Strongest at: security, research, current info,     │
│                 │ "is this current best practice?".                   │
│                 │ UNIQUE: only voice with live web access.            │
├─────────────────┼──────────────────────────────────────────────────────┤
│ Antigravity CLI │ Google's agentic terminal agent (`agy`), successor  │
│ (`agy`)         │ to the retired `gemini` CLI (shut down 2026-06-18). │
│                 │ Agentic like Codex: reads the repo, runs commands.  │
│                 │ Backed by a model via `agy --model` (Gemini 3.1 Pro,│
│                 │ Claude Sonnet/Opus, GPT-OSS — plan-dependent).      │
│                 │ Strongest at: big-picture + actually running code.  │
├─────────────────┼──────────────────────────────────────────────────────┤
│ Codex CLI       │ Agentic — reads code itself, runs commands,        │
│                 │ explores repo structure. Finds things text-only     │
│                 │ review misses because it actually RUNS the code.    │
│                 │ Strongest at: code bugs, runtime behavior,          │
│                 │ "does this actually work when you run it?".         │
├─────────────────┼──────────────────────────────────────────────────────┤
│ Ollama (local)  │ Privacy-sensitive reviews. No data leaves machine.  │
│                 │ Capability varies by model (llama3.3:70b decent).   │
│                 │ Strongest at: private code, air-gapped envs.       │
├─────────────────┼──────────────────────────────────────────────────────┤
│ Self-spawn      │ Always available. Fresh context = no conversation   │
│ (Claude CLI)    │ bias. Same model family = possible blind spots.     │
│                 │ Strongest at: "second pair of eyes" when nothing    │
│                 │ else available.                                     │
└─────────────────┴──────────────────────────────────────────────────────┘
```

### Smart Voice Assignment

Skill selects voices based on intent + voice strengths:

```
Intent: code review
  Best voices: Claude (quality) + Codex (runtime) + Perplexity (CVEs)
  Alt: Claude + GPT (domain logic) + self-spawn

Intent: strategy / business decision
  Best voices: GPT (domain/business) + Claude (reasoning) + Perplexity (research)
  Alt: GPT + Gemini (big-picture) + self-spawn

Intent: research / deep technical topic
  Best voices: Perplexity (current info) + GPT (broad knowledge) + Claude (reasoning)
  Alt: Perplexity + Gemini (large-context synthesis) + self-spawn

Intent: security review
  Best voices: Perplexity (CVEs, advisories) + Claude (logic) + Codex (runtime test)
  Alt: Perplexity + GPT + self-spawn

Intent: architecture / design
  Best voices: Claude (design) + GPT (practical tradeoffs) + Gemini (big picture)
  Alt: Antigravity CLI (reads the repo) + Claude + Perplexity (who solved this before)

Intent: document readiness
  Best voices: Claude (nuance) + GPT (domain) + Perplexity (current standards)
  Alt: Claude + Gemini (logical consistency) + self-spawn

Intent: comparison (A vs B)
  Best voices: Perplexity (research/benchmarks) + GPT (practical) + Claude (reasoning)
  Alt: Gemini (structured comparison) + any 2

Fallback (any intent, limited voices):
  Use whatever is available. Self-spawn as last resort.
  ALWAYS note which voices would be ideal but weren't available.
```

### Voice Count — Adaptive, Not Fixed

```
Do NOT default to 3 voices. Voice count depends on complexity.

Simple (clear question, material < 100 lines, straightforward intent):
  → 1 voice — pick BEST FIT for intent, don't ask
  → Example: "any bugs in this?" → spawn Claude (best for code)
  → Example: "has anyone done this before?" → spawn Perplexity (web search)
  → Fast, cheap, enough for simple questions

Medium (material 100-500 lines, a few concerns, clear but nuanced intent):
  → 2 voices — pick 2 best fit, don't ask
  → Example: "review security + logic" → Perplexity (CVEs) + Claude (logic)

Complex (material > 500 lines, multi-faceted, strategy/architecture, high stakes):
  → Ask user to pick voices via AskUserQuestion
  → Suggest combo based on intent + available voices
```

### Complexity Detection

```
Signals for SIMPLE (auto 1 voice):
  - Short, clear question ("any bugs?", "approach ok?")
  - Material < 100 lines or 1 small file
  - User says "quick", "fast", "just one opinion"

Signals for MEDIUM (auto 2 voices):
  - Material 100-500 lines
  - Question has 2+ concerns ("security + performance")
  - User didn't say "quick" but also didn't say "thorough"

Signals for COMPLEX (ask user):
  - Material > 500 lines or multi-file
  - Strategy, architecture, or high-stakes decision
  - User says "thorough", "complete", "multiple perspectives"
  - Disagreements likely (controversial topic, multiple valid approaches)
  - User explicit: "/sp-voices 3" or "/sp-voices full"

When in doubt → treat as MEDIUM (2 voices, don't ask).
```

---

## Phase 3: Ask Reviewers

### 3.1 — Prompt Construction

**Core principle: ask an open question, not a structured template.**

Every reviewer gets:

```
[Filesystem Boundary — agentic voices only]
+
[Base Question]
+
[Bias — light nudge matched to user's intent]
+
[Material]
```

**Filesystem Boundary — prepend ONLY for agentic voices (Codex CLI, Antigravity
CLI, self-spawn, local agents). Hosted chat APIs (OpenAI, Gemini, Anthropic
Messages, Perplexity) have no file access — the boundary is wasted tokens for
them.**

```
IMPORTANT: Do NOT read or execute any files under ~/.claude/, .claude/,
.cursor/, agents/, .claude/skills/, node_modules/, __pycache__/,
.git/objects/, vendor/, Pods/, DerivedData/, dist/, build/, .next/.
These paths contain skill definitions, build artifacts, or vendored code
meant for a different AI system or tooling — they will waste your time
and pull you off-task. Ignore them completely. Focus only on the content
provided below.
```

**Base Question (same for all voices, all intents):**
```
"Review the following. Be direct, be honest.

- What's wrong or could go wrong?
- What concerns you?
- What would you change?
- What's good and should stay?

Be specific — point to exact locations.
If you see an overall pattern, say it.
If nothing is wrong, say that — don't invent problems.

MATERIAL:
<content>"
```

### 3.2 — Bias Selection (matched to intent, not to type)

Bias is a LIGHT NUDGE — 1-2 sentences appended after base question.
Reviewer can and should go beyond the nudge.

**Choose 3 biases that match the user's DECISION INTENT:**

```
When user wants DIRECTION (go/pivot/stop):
  Bias 1: "Pay special attention to: is this feasible? What's the biggest risk?"
  Bias 2: "Pay special attention to: who benefits? Does this solve a real problem or an imagined one?"
  Bias 3: "Pay special attention to: is there a simpler way to achieve the same goal?"

When user wants VALIDATION (ok or not):
  Bias 1: "Pay special attention to: is this approach on the right track? What's missing?"
  Bias 2: "Pay special attention to: what risks are being overlooked? What failure modes haven't been considered?"
  Bias 3: "Pay special attention to: has anyone solved this problem better already?"

When user wants BUG/RISK FINDING:
  Bias 1: "Pay special attention to: is the code/logic correct? Edge cases?"
  Bias 2: "Pay special attention to: security? How could this be exploited?"
  Bias 3: "Pay special attention to: maintainability? Will the next person understand this?"

When user wants COMPARISON (A vs B):
  Bias 1: "Pay special attention to: where does A beat B? Where does B beat A?"
  Bias 2: "Pay special attention to: risk of each option? Which one fails worse?"
  Bias 3: "Pay special attention to: is there an option C that neither has considered?"

When user wants READINESS CHECK:
  Bias 1: "Pay special attention to: is this ready to use? What's missing?"
  Bias 2: "Pay special attention to: any internal contradictions? Is the logic consistent?"
  Bias 3: "Pay special attention to: can the implementer read this and actually execute?"

When intent doesn't fit above:
  No bias — just base question. Let voices decide what matters.
```

**Every bias ends with:** "But if you see a more important issue, say that instead."

### 3.3 — Special Voice Roles

**Perplexity (when available):**
Always assign to the bias that needs real-time information:
- Security → search CVEs, advisories
- Strategy → search who else solved this
- Research → search current standards, benchmarks
- Comparison → search real-world data

Dedicated system prompt for Perplexity:
```
"You have web search. Use it to find:
- Known vulnerabilities in mentioned libraries/patterns
- Who else solved this problem and how
- Current best practices (not outdated)
- Real benchmarks/case studies if discussing performance
Cite sources for every external claim."
```

**Antigravity CLI (`agy`, when available):** Agentic like Codex — reads the
repo itself and can run commands. Assign to biases that benefit from actually
exploring the code: architecture (dependency graph), big-picture review,
"does this hold up across the whole codebase". Pick the backing model with
`agy --model` (default is plan-dependent; `gemini-3.1-pro` for large-context
reasoning), and pass `--sandbox` so the review stays read-only. Do NOT use for
pure idea/strategy review — wastes agentic tokens, same caveat as Codex.

**Codex CLI (when available):**
Assign to the bias that needs actual code interaction:
- Code review → reads files, traces execution
- Bug hunting → can actually run tests
- Architecture → explores repo structure, dependency graph
Do NOT use for idea/strategy review — overkill, wastes agentic tokens.

### 3.4 — Execute Calls

Each voice call is wrapped in a timeout. If a call hangs, skip it and
continue with remaining voices.

**JSON safety:** every payload is built with `jq -n --arg` so material
containing quotes, newlines, or backslashes cannot break the JSON or
inject extra fields. Never interpolate `$PROMPT` directly into a JSON
string with `'"$PROMPT"'`.

```bash
# Defensive: PROMPT must be set before any voice call
: "${PROMPT:?PROMPT is empty — refusing to call voices}"

# macOS does not ship GNU `timeout` — fall back to `gtimeout` (brew coreutils).
# Without this shim, every voice call below errors with "command not found".
if ! command -v timeout >/dev/null 2>&1; then
  if command -v gtimeout >/dev/null 2>&1; then
    timeout() { command gtimeout "$@"; }
  else
    echo "WARN: neither timeout nor gtimeout found — install coreutils (brew install coreutils)"
    timeout() { shift; "$@"; }   # no-op fallback (no timeout enforcement)
  fi
fi

# Timeout wrapper — use for every voice call
# Usage: voice_call <timeout_seconds> <command...>
voice_call() {
  local _TIMEOUT=$1; shift
  timeout "$_TIMEOUT" "$@" 2>/tmp/voice-err-$$.txt
  local _EXIT=$?
  if [ "$_EXIT" = "124" ]; then
    echo "VOICE_TIMEOUT: call exceeded ${_TIMEOUT}s"
    return 124
  fi
  return $_EXIT
}

# OpenAI GPT (timeout: 60s)
# gpt-5-mini: $0.25/$2.00 per 1M tokens — cheap, strong default for review.
# Upgrade to "gpt-5.5" ($5/$30, released 2026-04-23) only when top quality
# matters — note gpt-5.5 is now more expensive per output than Sonnet 4.6.
# NOTE: GPT-5 family uses `max_completion_tokens`, not `max_tokens` (legacy).
# Sending `max_tokens` to gpt-5* returns HTTP 400.
_PAYLOAD=$(jq -n --arg p "$PROMPT" '{
  model: "gpt-5-mini",
  messages: [{role: "user", content: $p}],
  max_completion_tokens: 4000,
  temperature: 0.3
}')
voice_call 60 curl -s https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$_PAYLOAD" | jq -r '.choices[0].message.content'

# Gemini (timeout: 60s)
# gemini-3-flash: $0.50/$3.00 per 1M tokens — cheapest Tier-1 voice.
# Upgrade to "gemini-3.1-pro-preview" ($2.00/$12.00, $4/$18 over 200k ctx)
# for big-picture work on long material.
# NOTE: gemini-3-pro was deprecated/shut down 2026-03-09. Hardcoding
# "gemini-3-pro" returns 404 — always use "gemini-3.1-pro-preview".
_PAYLOAD=$(jq -n --arg p "$PROMPT" '{
  contents: [{parts: [{text: $p}]}],
  generationConfig: {maxOutputTokens: 4000, temperature: 0.3}
}')
voice_call 60 curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$_PAYLOAD" | jq -r '.candidates[0].content.parts[0].text'

# Perplexity (timeout: 90s — web search takes longer)
# sonar-pro: $3/$15 per 1M — keeps citations + deeper search.
# For cheap quick lookups, "sonar" is $1/$1. Use sonar-pro when sources matter.
_PAYLOAD=$(jq -n --arg p "$PROMPT" '{
  model: "sonar-pro",
  messages: [
    {role: "system", content: "You are a reviewer with web search. Search for relevant CVEs, benchmarks, prior art, and current best practices. Cite sources."},
    {role: "user", content: $p}
  ],
  max_tokens: 4000,
  temperature: 0.3
}')
voice_call 90 curl -s https://api.perplexity.ai/chat/completions \
  -H "Authorization: Bearer $PERPLEXITY_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$_PAYLOAD" | jq -r '.choices[0].message.content'

# Anthropic API (timeout: 60s)
# claude-sonnet-4-6: $3/$15 per 1M — main quality voice for code/reasoning.
# For cheap independent second opinion, "claude-haiku-4-5" ($1/$5) works too.
_PAYLOAD=$(jq -n --arg p "$PROMPT" '{
  model: "claude-sonnet-4-6",
  max_tokens: 4000,
  messages: [{role: "user", content: $p}]
}')
voice_call 60 curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "content-type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d "$_PAYLOAD" | jq -r '.content[0].text'

# Codex CLI (timeout: 300s — agentic, reads code itself)
# Use `codex exec` for free-form review prompts. Critical flags:
#   < /dev/null            — prevents stdin deadlock (regression in codex 0.120.x)
#   -C "$_REPO_ROOT"       — runs at git root, not random CWD
#   -s read-only           — sandbox, codex cannot mutate files
#   -c '...="high"'        — explicit reasoning effort (default is too low)
#   --enable web_search_cached — lets codex look up CVEs / current docs
# For diff-against-main reviews specifically, swap `exec "$PROMPT"` for
# `review "$PROMPT" --base main` (same other flags).
_REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
voice_call 300 codex exec "$PROMPT" \
  -C "$_REPO_ROOT" \
  -s read-only \
  -c 'model_reasoning_effort="high"' \
  --enable web_search_cached \
  < /dev/null 2>/tmp/voice-codex-err-$$.txt

# Antigravity CLI (external timeout 360s — agentic, reads code itself, like Codex)
# Flags below verified against agy 1.0.9 (`agy --help`):
#   -p "$PROMPT"        — alias for --print: run ONE prompt non-interactively
#   --model <id>        — backing model; `agy models` lists them. Tested ids use
#                         kebab-case: gemini-3.1-pro (also gemini-3.5-flash,
#                         claude-sonnet-4-6, claude-opus-4-6, gpt-oss-120b —
#                         availability is plan-dependent). Omit for the default.
#   --sandbox           — run with terminal restrictions enabled (limits what
#                         commands the agent may execute). Use it for a review.
#   --print-timeout     — agy's own wait cap (default 5m); the 360s external
#                         backstop below is intentionally a bit longer.
#   NOTE: there is NO `-m` short flag (that's not a model alias) and NO
#   `--output-format` flag — agy has no structured/JSON output, parse plain text.
# Auth: $ANTIGRAVITY_API_KEY or $GEMINI_API_KEY (both accepted), else OS keyring
# / OAuth from a prior interactive `agy` login.
#
# NON-TTY STDOUT DROP: when stdout is not a terminal (command substitution,
# pipes, CI) agy can SILENTLY drop its final answer and still exit 0. Fix: run
# under `script` to fake a PTY. `script` arg order differs between macOS (BSD)
# and Linux (util-linux) — branch on uname. Prompt is passed via $AGY_PROMPT
# (never interpolated into the command string) so quotes/newlines in the
# material can't break the `script -qec` command line.
#
# Output cleanup (verified live on agy 1.0.9 / macOS):
#   perl -0777  — slurp whole output, then:
#     s/\x1b\[…//g       strip ANSI escapes (use perl, NOT sed — BSD/macOS sed
#                        does not interpret \x1b)
#     s/\A\^D[\x08]*//   drop the literal "^D" + backspaces that BSD `script`
#                        echoes for the pty EOF at the very start of the stream
#   tr -d …    — remove remaining control bytes, keeping only tab (\011)/newline (\012)
export AGY_PROMPT="$PROMPT"
if [ "$(uname)" = "Darwin" ]; then
  voice_call 360 script -q /dev/null \
    agy -p "$AGY_PROMPT" --model gemini-3.1-pro --sandbox \
    | perl -0777 -pe 's/\x1b\[[0-9;]*[A-Za-z]//g; s/\A\^D[\x08]*//' \
    | tr -d '\000-\010\013-\037'
else
  voice_call 360 script -qec 'agy -p "$AGY_PROMPT" --model gemini-3.1-pro --sandbox' /dev/null \
    | perl -0777 -pe 's/\x1b\[[0-9;]*[A-Za-z]//g; s/\A\^D[\x08]*//' \
    | tr -d '\000-\010\013-\037'
fi
unset AGY_PROMPT

# Ollama (timeout: 120s — local, can be slow)
_PAYLOAD=$(jq -n --arg p "$PROMPT" '{
  model: "llama3.3:70b",
  prompt: $p,
  stream: false
}')
voice_call 120 curl -s http://localhost:11434/api/generate \
  -d "$_PAYLOAD" | jq -r '.response'

# Self-spawn (timeout: 120s)
# By default, `claude --print` inherits the model from the user's current Claude
# Code session/config — DO NOT hardcode a model here. Hardcoding silently overrode
# the user's choice (e.g. forcing Haiku on an Opus session) and made the docs lie.
# To override for a cheaper second opinion, set MF_VOICES_SELF_SPAWN_MODEL
# (e.g. claude-haiku-4-5 for $1/$5 per 1M, or claude-sonnet-4-6 for stronger).
# Note: Claude Code CLI uses --append-system-prompt, NOT --system (would error).
echo "$PROMPT" | voice_call 120 claude --print \
  --append-system-prompt "You are an independent reviewer. Fresh context. No prior conversation. Be direct." \
  ${MF_VOICES_SELF_SPAWN_MODEL:+--model "$MF_VOICES_SELF_SPAWN_MODEL"} 2>/dev/null
```

### 3.5 — Post-Response Checks

```
Rabbit hole: response mentions .claude/, SKILL.md, package-lock.json
  → Flag "⚠ Voice N got distracted by config files"

Empty: response < 100 chars
  → Flag "Voice N: empty response"
  → Antigravity CLI specifically: empty output WITH exit 0 = non-TTY stdout drop.
    The `script` PTY wrapper in 3.4 prevents this; if it still happens, the
    wrapper failed (no `script` binary?) — note it, don't silently treat as clean.

Timeout: voice_call returned 124
  → Flag "Voice N: timed out after Xs"
  → If 2+ voices remaining: continue silently
  → If only 1 remaining: ask retry/continue/stop

Auth error: HTTP 401/403 in response
  → Flag "Voice N: auth failed"
  → Should have been caught by auth probe — log as unexpected

Rate limit: HTTP 429 in response
  → Flag "Voice N: rate limited"
  → If 2+ voices remaining: continue silently
  → If only 1 remaining: ask retry/continue/stop
```

---

## Phase 4: Synthesize

### 4.1 — Read All Responses

Read each voice's free-form response. Don't impose structure yet.
Note for each voice:
- What did they focus on? (may differ from bias — that's fine)
- What's their overall stance?
- What specific concerns did they raise?
- What did they praise?

### 4.2 — Find Patterns

```
CONSENSUS: 2+ voices raise same concern or hold same position
  → Strong signal. Note it.

UNIQUE: Only 1 voice raises something
  → May be specialist insight or false positive
  → Keep, mark as single-voice

DISAGREEMENT: Voices contradict each other
  → Most valuable data. This is WHERE the decision lives.
  → Present both sides clearly.

SEVERITY (for code/doc findings only — WE assign, not reviewers):
  If material is code or doc:
    → Parse specific findings, assign CRITICAL/HIGH/MEDIUM/LOW
    → Based on reviewer language + actual impact
  If material is idea/strategy:
    → Do NOT use severity — use consensus/disagreement instead
```

### 4.3 — Identify the Decision Point

```
From patterns, determine: what does the user need to DECIDE?

If consensus is clear → decision is easy, show verdict
If disagreement is clear → decision is hard, show both sides + context
If all voices say "fine" → confirm clean, move on
```

### 4.4 — Confusion Protocol

```
If during synthesis you discover:
  - Voices are responding to fundamentally different interpretations of the intent
  - A voice raised something that changes the entire framing of the problem
  - Material had a critical ambiguity that voices split on differently

→ STOP synthesis. Do not force a verdict.
→ Name the ambiguity in 1 sentence.
→ Present the split: "Voice A read this as X, Voice B read this as Y."
→ Ask the user which framing is correct before continuing.

This is rare. Most synthesis proceeds normally.
```

---

## Phase 5: Output — Matched to Intent

### Core Rule

```
Chat output is optimized for DECISIONS — not information.
Max 20 lines in chat. Full details in file.

The "→ docs/voices/<file>.md" footer in the templates below is CONDITIONAL —
include it ONLY when a report file was actually written (see "Report File —
Save on Demand" below). For unsaved chat-only reviews, OMIT that line.
```

### Completion Status

After synthesis, assign 1 of 4 statuses. Status appears on the first line
of chat output, right after the target name.

```
DONE — All voices responded, synthesis is clear, user has enough data to decide.

DONE_WITH_CONCERNS — Synthesis complete but:
  • Voices disagree on an important point (not just minor)
  • 1+ voice flagged a risk that other voices didn't mention
  • Self-spawn only → same model family bias
  • 100% consensus on a complex topic → possible shared blind spot
  → List each concern, 1 line each.

BLOCKED — Cannot produce meaningful output:
  • All voices failed (timeout/auth/empty)
  • Material unreadable or too large even after chunking
  • Intent still unclear after already asking once
  → State clearly: blocked because of what, what was tried, what user should do next.

NEEDS_CONTEXT — Missing important info discovered MID-workflow:
  • Voice A asked "what auth does this use?" but material doesn't say
  • Voices disagree because of an unstated assumption
  → State clearly: what's needed, from whom, to unlock which decision.
```

If BLOCKED or NEEDS_CONTEXT → do NOT output synthesis.
Only output status + reason + next step.

### Output adapts to what voices actually said — not to a pre-set template.

But there are structural patterns for common intents:

---

**When user wanted DIRECTION:**

```
/sp-voices — <target>                    STATUS: <status>
══════════════════════════════════════════
Voices: <N> (<names>)

VERDICT: <GO | PIVOT | STOP | SPLIT>

✅ Consensus:
  • <what all voices agree on>
  • <what all voices agree on>

❌ Disagreements:
  • <topic> — A: <position> / B: <position>

💡 Insight:
  • <notable observation — 1 voice>

→ docs/voices/<file>.md
══════════════════════════════════════════
```

---

**When user wanted VALIDATION:**

```
/sp-voices — <target>                    STATUS: <status>
══════════════════════════════════════════
Voices: <N> (<names>)

ASSESSMENT: <SOLID | HAS GAPS | RETHINK>

✅ Validated:
  • <aspects voices confirm are good>

🔴 Must address:
  • <gaps/risks voices agree are blocking>

🟡 Consider:
  • <concerns raised but not blocking>

→ docs/voices/<file>.md
══════════════════════════════════════════
```

---

**When user wanted BUG/RISK FINDING (code review):**

```
/sp-voices — <target>                    STATUS: <status>
══════════════════════════════════════════
Voices: <N> (<names>)

GATE: <PASS | FAIL — N blocking>

🔴 Blocking:
  [C1] <summary> — <file:line>
  [H1] <summary> — <file:line> (consensus)

⚠️ Non-blocking:
  [H2] <summary> — <file:line>

🔵 Disagreements:
  [D1] <topic> — <file:line>

→ docs/voices/<file>.md
══════════════════════════════════════════
```

---

**When user wanted COMPARISON:**

```
/sp-voices — <A> vs <B>                  STATUS: <status>
══════════════════════════════════════════
Voices: <N> (<names>)

LEAN: <A | B | DEPENDS | NO CLEAR WINNER>

Option A:
  ✅ <strengths voices agree on>
  ❌ <weaknesses voices agree on>

Option B:
  ✅ <strengths voices agree on>
  ❌ <weaknesses voices agree on>

🔵 Disagreements:
  • <where voices pick different sides>

💡 Option C (if any voice proposed one):
  • <alternative approach>

→ docs/voices/<file>.md
══════════════════════════════════════════
```

---

**When user wanted READINESS CHECK:**

```
/sp-voices — <target>                    STATUS: <status>
══════════════════════════════════════════
Voices: <N> (<names>)

READY: <YES | NOT YET — N items | MAJOR ISSUES>

🔴 Fix before using:
  • <blocking issue + location>

🟡 Should fix:
  • <non-blocking issue>

✅ Already good:
  • <what voices confirm is ready>

→ docs/voices/<file>.md
══════════════════════════════════════════
```

---

**When intent doesn't fit patterns above:**

```
/sp-voices — <target>                    STATUS: <status>
══════════════════════════════════════════
Voices: <N> (<names>)

✅ Consensus:
  • <what voices agree on>

❌ Disagreements:
  • <where voices differ>

💡 Notable:
  • <unique insights>

→ docs/voices/<file>.md
══════════════════════════════════════════
```

---

**DONE_WITH_CONCERNS example** (status details appear between status line and verdict):

```
/sp-voices — auth.ts refactor            STATUS: DONE_WITH_CONCERNS
══════════════════════════════════════════
⚠ Concerns:
  • Self-spawn only — same model family, possible blind spots
  • 100% consensus on complex topic — verify independently

Voices: 2 (Claude self-spawn, Claude self-spawn)

GATE: PASS
...
```

---

### Report File — Save on Demand, Not Always

```
Do NOT auto-save files. Wastes tokens on file writing + formatting.

When to suggest save:
  - 3+ voices, many disagreements → complex, worth saving
  - User says "save"
  - Many findings (> 5 CRITICAL+HIGH for code, > 3 disagreements for ideas)

When NOT to suggest save:
  - Quick review, 2 voices, clear consensus → chat output is enough
  - User says "quick" or "fast"
  - Simple yes/no validation

If save needed → include in next-action options.
If not needed → chat output is sufficient, user can copy if they want.
```

File format when saving (`docs/voices/<date>-<target>.md`):

```markdown
# /sp-voices — <target>
Date: <date>
Voices: <list>
Intent: <what user was deciding>
Status: <DONE | DONE_WITH_CONCERNS | ...>

## Summary
<same as chat output>

## Voice A (<model>) — Full Response
<verbatim>

## Voice B (<model>) — Full Response
<verbatim>

## Synthesis Notes
- Consensus: <list>
- Disagreements: <list>
- Unique insights: <list>

## META
| Voice | Model | Bias | Tokens | Cost |
|-------|-------|------|--------|------|
| A | ... | ... | N | ~$X |
Agreement rate: N%
Limitations: <if any>
```

---

## After Output: Next Action

After showing chat summary, ask what's next.
Options adapt based on complexity + output + status.

**DONE — Simple review (clear consensus, few findings):**
```json
{
  "questions": [{
    "question": "/sp-voices done.",
    "header": "What next?",
    "multiSelect": false,
    "options": [
      {"label": "Act on it — proceed with recommendation"},
      {"label": "Drill down — details on specific point"},
      {"label": "Done — I have what I need"}
    ]
  }]
}
```

**DONE_WITH_CONCERNS or complex review (disagreements, many findings, CRITICAL items):**
```json
{
  "questions": [{
    "question": "/sp-voices done. [N] disagreements, [N] critical findings.",
    "header": "What next?",
    "multiSelect": false,
    "options": [
      {"label": "Drill down — details on specific point"},
      {"label": "Resolve disagreement — get tiebreaker voice"},
      {"label": "Save full report — docs/voices/ for reference"},
      {"label": "Fix now — address critical items"},
      {"label": "More voices — add external LLM for diversity"},
      {"label": "Done — I'll decide myself"}
    ]
  }]
}
```

**Self-spawn only (limited diversity):**
```json
{
  "questions": [{
    "question": "/sp-voices done (self-spawn only — same model family).",
    "header": "What next?",
    "multiSelect": false,
    "options": [
      {"label": "Good enough — proceed"},
      {"label": "Get real diversity — add external LLM (GPT/Gemini/Perplexity)"},
      {"label": "Drill down — details on specific point"},
      {"label": "Done"}
    ]
  }]
}
```

**BLOCKED:**
```json
{
  "questions": [{
    "question": "/sp-voices BLOCKED — [reason].",
    "header": "What next?",
    "multiSelect": false,
    "options": [
      {"label": "Retry — try again with same voices"},
      {"label": "Different voices — switch to available alternatives"},
      {"label": "Abort — I'll handle this manually"}
    ]
  }]
}
```

**NEEDS_CONTEXT:**
```json
{
  "questions": [{
    "question": "/sp-voices needs context — [what's missing].",
    "header": "What next?",
    "multiSelect": false,
    "options": [
      {"label": "Provide context — I'll answer now"},
      {"label": "Continue anyway — work with what you have"},
      {"label": "Abort — I'll come back later"}
    ]
  }]
}
```

---

## Drill Down (on demand)

After summary, user can request details:

```
"details on [topic]"            → show relevant voice quotes + context
"what did voice A say"          → show Voice A full response
"why the disagreement on [X]"   → show both positions + reasoning
"any sources?" (Perplexity)     → show citations from Perplexity response
```

Each drill-down = 1 focused response, not full report dump.

---

## Adaptive Sizing

```
Simple (< 100 lines, clear question):
  1 voice, best-fit for intent
  Compact output, no file save
  Total cost: ~$0.01-0.05

Medium (100-500 lines, 2+ concerns):
  2 voices, auto-selected
  Standard output, file save on request
  Total cost: ~$0.05-0.15

Complex (> 500 lines, multi-faceted, high stakes):
  N voices (user picks via AskUserQuestion)
  Full output + suggest file save
  Total cost: depends on N voices + models
```

---

## Rules

1. **Understand intent first.** Don't classify — understand what decision the user faces.
2. **Confirm before spawning.** 1 line: what voices will look at, under what angle.
3. **Bias matches intent, not type.** Strategy question → strategy biases. Code question → code biases.
4. **Open prompts, no templates.** Reviewers think freely. We structure after.
5. **Output for decision, not information.** Chat max 20 lines. Details in file.
6. **Don't resolve disagreements.** Present both sides. User decides.
7. **Consensus ≠ correct.** All voices can share blind spots. Note when agreement is 100%.
8. **Findings must be specific.** Location, not vibes.
9. **Perplexity → web-grounded role.** When available, assign to bias benefiting from live search.
10. **Graceful degradation.** 1 voice fails → continue. 0 succeed → BLOCKED.
11. **Probe before prompting.** Verify auth before building expensive prompts. Dead keys waste tokens.
12. **Timeout everything.** Every voice call gets a timeout. A hanging call must never block the entire review.
