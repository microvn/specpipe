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
# /mf-voices — Multi-Voice Review

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
command -v codex &>/dev/null && echo "CODEX_CLI: available" || echo "CODEX: ✗"
command -v gemini &>/dev/null && echo "GEMINI_CLI: available" || \
  ([ -n "$GEMINI_API_KEY" ] && echo "GEMINI_API: key set" || echo "GEMINI: ✗")
[ -n "$PERPLEXITY_API_KEY" ] && echo "PERPLEXITY: available" || echo "PERPLEXITY: ✗"
[ -n "$ANTIGRAVITY_API_KEY" ] && echo "ANTIGRAVITY: available" || \
  (command -v antigravity &>/dev/null && echo "ANTIGRAVITY_CLI: available" || echo "ANTIGRAVITY: ✗")
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

# Perplexity
if [ -n "$PERPLEXITY_API_KEY" ]; then
  _PPX_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $PERPLEXITY_API_KEY" \
    https://api.perplexity.ai/chat/completions \
    -d '{"model":"sonar","messages":[{"role":"user","content":"ping"}],"max_tokens":1}' \
    -H "Content-Type: application/json" 2>/dev/null)
  [ "$_PPX_STATUS" = "200" ] && echo "PERPLEXITY_AUTH: valid" || echo "PERPLEXITY_AUTH: FAILED ($_PPX_STATUS)"
fi

# Gemini
if [ -n "$GEMINI_API_KEY" ]; then
  _GEM_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY" 2>/dev/null)
  [ "$_GEM_STATUS" = "200" ] && echo "GEMINI_AUTH: valid" || echo "GEMINI_AUTH: FAILED ($_GEM_STATUS)"
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
  GPT, Gemini, Perplexity, Antigravity
  → Different training = different perspectives

Tier 2 — Same family, independent session:
  Codex CLI, Anthropic API (different Claude model)
  → Independent context = still valuable

Tier 3 — Local:
  Ollama
  → Free, private, lower capability

Tier 4 — Self-spawn (always available):
  claude --print (fresh context, no conversation history)
  → Same model but fresh eyes — better than nothing
  → MARK in output: "self-spawn — same model family"
```

### Voice Strengths — Who's Good at What

```
┌─────────────────┬──────────────────────────────────────────────────────┐
│ Voice           │ Best For                                             │
├─────────────────┼──────────────────────────────────────────────────────┤
│ Claude          │ Code review, nuanced reasoning, design/architecture, │
│ (Sonnet/Opus)   │ long-context analysis, careful edge case thinking.   │
│                 │ Strongest at: code quality, readability, subtle bugs.│
├─────────────────┼──────────────────────────────────────────────────────┤
│ GPT (4o/4.1)    │ Wide domain knowledge, business logic, product      │
│                 │ thinking, real-world patterns. Strong at connecting  │
│                 │ technical decisions to business impact.              │
│                 │ Strongest at: domain expertise, practical tradeoffs. │
├─────────────────┼──────────────────────────────────────────────────────┤
│ Gemini          │ Broad analysis, large context window, multi-modal.  │
│ (2.5 Pro)       │ Good at synthesizing large documents.               │
│                 │ Strongest at: big-picture, cross-cutting concerns.  │
├─────────────────┼──────────────────────────────────────────────────────┤
│ Perplexity      │ Real-time web search. Knows current CVEs, latest    │
│ (sonar-pro)     │ best practices, library health, who solved this     │
│                 │ problem before. CITES SOURCES.                      │
│                 │ Strongest at: security, research, current info,     │
│                 │ "is this still best practice in 2026?".             │
│                 │ UNIQUE: only voice with live web access.            │
├─────────────────┼──────────────────────────────────────────────────────┤
│ Antigravity     │ Research-grade analysis, academic rigor, deep       │
│                 │ technical topics, literature review, comparative    │
│                 │ analysis. Strong at structured argumentation.       │
│                 │ Strongest at: research, essays, deep domain,        │
│                 │ "what does the literature say about this approach?" │
├─────────────────┼──────────────────────────────────────────────────────┤
│ Codex CLI       │ Agentic — reads code itself, runs commands,        │
│                 │ explores repo structure. Finds things text-only     │
│                 │ review misses because it actually RUNS the code.    │
│                 │ Strongest at: code bugs, runtime behavior,          │
│                 │ "does this actually work when you run it?".         │
├─────────────────┼──────────────────────────────────────────────────────┤
│ Ollama (local)  │ Privacy-sensitive reviews. No data leaves machine.  │
│                 │ Capability varies by model (llama3.1:70b decent).   │
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
  Alt: GPT + Antigravity (deep analysis) + self-spawn

Intent: research / deep technical topic
  Best voices: Perplexity (current info) + Antigravity (academic rigor) + Claude (reasoning)
  Alt: Perplexity + GPT (broad knowledge) + self-spawn

Intent: security review
  Best voices: Perplexity (CVEs, advisories) + Claude (logic) + Codex (runtime test)
  Alt: Perplexity + GPT + self-spawn

Intent: architecture / design
  Best voices: Claude (design) + GPT (practical tradeoffs) + Gemini (big picture)
  Alt: Claude + Perplexity (who solved this before) + self-spawn

Intent: document readiness
  Best voices: Claude (nuance) + GPT (domain) + Antigravity (rigor)
  Alt: Claude + Perplexity (current standards) + self-spawn

Intent: comparison (A vs B)
  Best voices: Perplexity (research/benchmarks) + GPT (practical) + Claude (reasoning)
  Alt: Antigravity (structured comparison) + any 2

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
  - User explicit: "/mf-voices 3" or "/mf-voices full"

When in doubt → treat as MEDIUM (2 voices, don't ask).
```

---

## Phase 3: Ask Reviewers

### 3.1 — Prompt Construction

**Core principle: ask an open question, not a structured template.**

Every reviewer gets:

```
[Filesystem Boundary]
+
[Base Question]
+
[Bias — light nudge matched to user's intent]
+
[Material]
```

**Filesystem Boundary (always prepend):**
```
IMPORTANT: Do NOT read files under ~/.claude/, .claude/, .cursor/,
agents/, node_modules/, __pycache__/, .git/objects/, vendor/,
Pods/, DerivedData/, dist/, build/, .next/.
Focus only on the content provided below.
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

**Antigravity (when available):**
Assign to the bias that needs deep analysis, structured reasoning:
- Research topics → academic perspective, literature
- Complex comparisons → structured argumentation
- Strategy → rigorous feasibility analysis
- Document review → logical consistency, argumentation quality

**Codex CLI (when available):**
Assign to the bias that needs actual code interaction:
- Code review → reads files, traces execution
- Bug hunting → can actually run tests
- Architecture → explores repo structure, dependency graph
Do NOT use for idea/strategy review — overkill, wastes agentic tokens.

### 3.4 — Execute Calls

Each voice call is wrapped in a timeout. If a call hangs, skip it and
continue with remaining voices.

```bash
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
voice_call 60 curl -s https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "'"$PROMPT"'"}],
    "max_tokens": 4000, "temperature": 0.3
  }' | jq -r '.choices[0].message.content'

# Gemini (timeout: 60s)
voice_call 60 curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"parts": [{"text": "'"$PROMPT"'"}]}],
    "generationConfig": {"maxOutputTokens": 4000, "temperature": 0.3}
  }' | jq -r '.candidates[0].content.parts[0].text'

# Perplexity (timeout: 90s — web search takes longer)
voice_call 90 curl -s https://api.perplexity.ai/chat/completions \
  -H "Authorization: Bearer $PERPLEXITY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sonar-pro",
    "messages": [
      {"role": "system", "content": "You are a reviewer with web search. Search for relevant CVEs, benchmarks, prior art, and current best practices. Cite sources."},
      {"role": "user", "content": "'"$PROMPT"'"}
    ],
    "max_tokens": 4000, "temperature": 0.3
  }' | jq -r '.choices[0].message.content'

# Anthropic API (timeout: 60s)
voice_call 60 curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "content-type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 4000,
    "messages": [{"role": "user", "content": "'"$PROMPT"'"}]
  }' | jq -r '.content[0].text'

# Codex CLI (timeout: 300s — agentic, for code review only)
voice_call 300 codex review "$PROMPT" --base main 2>/dev/null

# Antigravity (timeout: 60s)
[ -n "$ANTIGRAVITY_API_KEY" ] && \
voice_call 60 curl -s https://api.antigravity.ai/v1/chat/completions \
  -H "Authorization: Bearer $ANTIGRAVITY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "antigravity-latest",
    "messages": [{"role": "user", "content": "'"$PROMPT"'"}],
    "max_tokens": 4000, "temperature": 0.3
  }' | jq -r '.choices[0].message.content'

# Ollama (timeout: 120s — local, can be slow)
voice_call 120 curl -s http://localhost:11434/api/generate \
  -d '{"model": "llama3.1:70b", "prompt": "'"$PROMPT"'", "stream": false}' \
  | jq -r '.response'

# Self-spawn (timeout: 120s)
echo "$PROMPT" | voice_call 120 claude --print \
  --system "You are an independent reviewer. Fresh context. No prior conversation. Be direct." \
  --model claude-sonnet-4-20250514 2>/dev/null
```

### 3.5 — Post-Response Checks

```
Rabbit hole: response mentions .claude/, SKILL.md, package-lock.json
  → Flag "⚠ Voice N got distracted by config files"

Empty: response < 100 chars
  → Flag "Voice N: empty response"

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
/mf-voices — <target>                    STATUS: <status>
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
/mf-voices — <target>                    STATUS: <status>
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
/mf-voices — <target>                    STATUS: <status>
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
/mf-voices — <A> vs <B>                  STATUS: <status>
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
/mf-voices — <target>                    STATUS: <status>
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
/mf-voices — <target>                    STATUS: <status>
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
/mf-voices — auth.ts refactor            STATUS: DONE_WITH_CONCERNS
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
# /mf-voices — <target>
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
    "question": "/mf-voices done.",
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
    "question": "/mf-voices done. [N] disagreements, [N] critical findings.",
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
    "question": "/mf-voices done (self-spawn only — same model family).",
    "header": "What next?",
    "multiSelect": false,
    "options": [
      {"label": "Good enough — proceed"},
      {"label": "Get real diversity — add external LLM (GPT/Perplexity/Antigravity)"},
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
    "question": "/mf-voices BLOCKED — [reason].",
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
    "question": "/mf-voices needs context — [what's missing].",
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
