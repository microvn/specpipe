---
description: Multi-voice review — orchestrate multiple LLMs to review code, docs, architecture, or skills. Synthesize consensus + disagreements into actionable report.
allowed-tools: Read, Bash, Glob, Grep, Write, AskUserQuestion
---
# /mf-voices — Multi-Voice Review

Orchestrate multiple LLMs to independently review the same material,
then synthesize their perspectives into consensus, disagreements, and action items.

Target: $ARGUMENTS

---

## What This Does

1. Takes whatever you want reviewed (code diff, document, architecture, skill, PR)
2. Sends it to 2-3 different LLMs with open-ended review prompts + light bias
3. Collects their independent reviews (free-form, not templated)
4. Synthesizes: what they agree on, where they disagree, what to act on

You get a panel of reviewers instead of one opinion.

**Command:** `/mf-voices` or `/mf-voices <target>`

---

## Scope

```
This skill ORCHESTRATES reviews. It:
  ✓ Reads the target material
  ✓ Constructs review prompts
  ✓ Calls external LLMs via CLI
  ✓ Synthesizes findings into a report
  ✓ Writes report to file (optional)

It does NOT:
  ✗ Fix code or edit files (suggest only)
  ✗ Choose which findings to ignore (you decide)
  ✗ Require all LLMs to be available (graceful degradation)
```

---

## Prerequisites — LLM Access

This skill needs reviewers beyond the host (Claude Code main session).
Check availability in priority order. **At least 1 method required.**

```bash
echo "=== Reviewer availability ==="

# --- External LLMs (API/CLI) ---

# OpenAI
command -v openai &>/dev/null && echo "OPENAI_CLI: available" || \
  ([ -n "$OPENAI_API_KEY" ] && echo "OPENAI_API: key set" || echo "OPENAI: not available")

# Codex CLI (OpenAI agentic)
command -v codex &>/dev/null && echo "CODEX_CLI: available" || echo "CODEX: not available"

# Google Gemini
command -v gemini &>/dev/null && echo "GEMINI_CLI: available" || \
  ([ -n "$GEMINI_API_KEY" ] && echo "GEMINI_API: key set" || echo "GEMINI: not available")

# Perplexity
[ -n "$PERPLEXITY_API_KEY" ] && echo "PERPLEXITY_API: key set" || echo "PERPLEXITY: not available"

# Anthropic API (call different Claude model as external voice)
[ -n "$ANTHROPIC_API_KEY" ] && echo "ANTHROPIC_API: key set" || echo "ANTHROPIC: host only"

# Local models (Ollama)
command -v ollama &>/dev/null && echo "OLLAMA: available ($(ollama list 2>/dev/null | tail -n +2 | wc -l | xargs) models)" || echo "OLLAMA: not available"

# --- Self-spawn (always available as fallback) ---

# Claude Code CLI (spawn sub-agent)
command -v claude &>/dev/null && echo "CLAUDE_CLI: available (self-spawn)" || echo "CLAUDE_CLI: not available"

echo "==========================="
```

### Reviewer Priority (chọn voices theo thứ tự này)

```
Tier 1 — External LLM (khác model family = đa dạng nhất):
  GPT via API/CLI, Gemini via API/CLI, Perplexity via API
  → Khác training data, khác perspective = giá trị review cao nhất

Tier 2 — External agents (cùng family nhưng chạy independent):
  Codex CLI (OpenAI agentic — đọc code, chạy tools, suy luận dài)
  Anthropic API gọi model Claude khác (vd: main = Opus, voice = Sonnet)
  → Cùng family nhưng independent session = vẫn có giá trị

Tier 3 — Local models:
  Ollama (llama, codellama, deepseek, mistral...)
  → Free, private, nhưng capability thấp hơn

Tier 4 — Self-spawn (fallback — luôn available):
  Claude Code CLI spawn sub-agent
  → Cùng model BUT fresh context, no prior decisions, different role
  → Tốt hơn không review, nhưng kém đa dạng nhất
  → GHI RÕ trong report: "self-spawn voice — same model family"
```

**Minimum:** 1 reviewer ngoài main session. Nếu tất cả Tier 1-3 unavailable → dùng Tier 4 (self-spawn).
Nếu ngay cả `claude` CLI không có → single-voice review bằng main session với role switch.

**Recommended:** 2-3 voices, ít nhất 1 từ Tier 1 (khác model family).

**Large review + 3+ voices available → trigger D2.**

---

### Self-Spawn: Claude Code tự tạo sub-agent

Khi không có external LLM nào available, hoặc cần thêm voice:

**Cách hoạt động:**
```
Main session (đang chạy /review)
  │
  ├── Chuẩn bị prompt (material + bias)
  │
  ├── Spawn sub-agent qua claude CLI:
  │   claude --print --model <model> --system "<role prompt>"
  │   Input: review prompt qua stdin hoặc -p flag
  │   Sub-agent: fresh context, không biết gì về session hiện tại
  │   Output: review response → stdout
  │
  ├── Thu output từ sub-agent
  │
  └── Tiếp tục synthesis trong main session
```

**Implementation:**

```bash
# Spawn sub-agent với role reviewer
# --print: non-interactive, output rồi exit
# --system: set role khác main session
# --model: có thể chọn model khác (vd: sonnet cho speed)

REVIEW_OUTPUT=$(echo "$REVIEW_PROMPT" | claude --print \
  --system "You are an independent code reviewer. You have NO context about 
the developer's intentions, prior decisions, or conversation history. 
Review the code purely on its technical merits. Be direct and honest.
If you find nothing wrong, say so — do not invent findings." \
  --model claude-sonnet-4-20250514 \
  2>/dev/null)

if [ -z "$REVIEW_OUTPUT" ]; then
  echo "SELF_SPAWN: failed — empty response"
else
  echo "SELF_SPAWN: success"
  echo "$REVIEW_OUTPUT"
fi
```

**Tại sao self-spawn có giá trị (dù cùng model family):**

```
Main session biết:
  ✓ Mọi quyết định đã thảo luận với user
  ✓ Ngữ cảnh tại sao code được viết thế này
  ✓ Trade-offs đã chấp nhận
  → THIÊN KIẾN: có xu hướng đồng ý với code vì biết lý do

Sub-agent KHÔNG biết:
  ✗ Không biết lý do đằng sau code
  ✗ Không biết trade-offs đã thảo luận
  ✗ Không biết quyết định trước đó
  → FRESH EYES: đánh giá code thuần túy về mặt kỹ thuật
```

**Hạn chế — ghi rõ trong report:**
```
⚠ Self-spawn voice dùng cùng model family với main session.
Giá trị: fresh context, không thiên kiến từ conversation.
Hạn chế: cùng training data → có thể cùng blind spots.
Khuyến nghị: bổ sung bằng external LLM khi có thể.
```

**Codex CLI (nếu available) — agent mode, không chỉ text:**

```bash
# Codex chạy agentic — có thể đọc code, chạy commands
# Mạnh hơn plain API call vì nó tự explore codebase

TMPERR=$(mktemp /tmp/codex-err-XXXXXX.txt)

# Review mode (Codex tự đọc diff)
timeout 300 codex review \
  "IMPORTANT: Do NOT read files under ~/.claude/, .claude/, agents/. 
Stay focused on repository code only." \
  --base main \
  2>"$TMPERR"

# Hoặc exec mode (tự do hơn)
timeout 300 codex exec \
  "$REVIEW_PROMPT" \
  -C "$(git rev-parse --show-toplevel)" \
  -s read-only \
  --json < /dev/null 2>"$TMPERR"

rm -f "$TMPERR"
```

**Perplexity (nếu API key available) — tốt cho security + best practices:**

```bash
# Perplexity có web search built-in → biết CVEs mới, best practices mới
curl -s https://api.perplexity.ai/chat/completions \
  -H "Authorization: Bearer $PERPLEXITY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3.1-sonar-large-128k-online",
    "messages": [{"role": "user", "content": "'"$REVIEW_PROMPT"'"}],
    "max_tokens": 4000,
    "temperature": 0.3
  }' | jq -r '.choices[0].message.content'
```

---

## Decision Points — AskUserQuestion

Skill này có structured decision points ở các bước quan trọng.
Dùng `AskUserQuestion` tool — KHÔNG hỏi bằng prose trong chat.

**Rules cho mọi AskUserQuestion trong skill này:**

```
1. Re-ground: Nhắc lại đang review gì, branch nào, voice nào available.
   Assume user rời tab 20 phút rồi quay lại.

2. Recommend: Luôn recommend 1 option + lý do 1 dòng.
   Không neutral — nếu có preferred choice, nói thẳng.

3. Options ngắn: Label A/B/C + mô tả 1 dòng.
   Chi tiết đi trong question body, không trong options.

4. Không block cho minor decisions:
   - Cost < $0.10 → auto-proceed
   - 1 voice fails nhưng 2+ still available → auto-continue, just log
   - Material < 200 lines → auto-pick 2 voices, no ask
```

### Decision Point Map

Dưới đây là MỌI chỗ skill cần AskUserQuestion. Không ask ở chỗ khác.

---

### D1 — Review Type Ambiguous

**When:** Phase 1 cannot determine review type from `$ARGUMENTS`.

```json
{
  "questions": [{
    "question": "What should I review? I see [material description] but I'm not sure what angle you want.",
    "header": "Review type",
    "multiSelect": false,
    "options": [
      {"label": "Code review — check my diff for bugs, security, design"},
      {"label": "Document review — check this spec/doc for gaps and contradictions"},
      {"label": "Architecture review — check design for scalability and failure modes"},
      {"label": "Skill review — check this AI skill for clarity and edge cases"}
    ]
  }]
}
```

Recommendation: Pick most likely based on file extensions. `.swift/.ts/.py` → code. `.md` → document.

---

### D2 — Voice Panel Selection

**When:** 3+ LLMs available AND material is large (> 500 lines or > 10 files).
Skip this ask for small reviews — auto-pick 2-3 voices.

```json
{
  "questions": [{
    "question": "This is a large review ([N] lines across [M] files). I have [list available LLMs]. More voices = better coverage but higher cost.",
    "header": "How many reviewers?",
    "multiSelect": false,
    "options": [
      {"label": "2 voices (~$X.XX) — fast, good enough for most reviews"},
      {"label": "3 voices (~$X.XX) — thorough, catches more edge cases"},
      {"label": "All available (~$X.XX) — maximum coverage, recommended for critical changes"}
    ]
  }]
}
```

Recommendation: 3 voices for code touching auth/payment/data. 2 voices otherwise.

---

### D3 — Voice Unavailable

**When:** 1 LLM fails (timeout, auth error, rate limit) AND only 1 remaining voice.
If 2+ voices still available → auto-continue without asking.

```json
{
  "questions": [{
    "question": "[ModelName] failed: [reason]. Only [remaining model] is available. A single-voice review has no independent verification.",
    "header": "Reviewer down",
    "multiSelect": false,
    "options": [
      {"label": "Continue with 1 voice — flag as single-perspective"},
      {"label": "Retry [failed model] — might be transient"},
      {"label": "Stop — I'll fix the API key / connection and re-run"}
    ]
  }]
}
```

Recommendation: Retry once. If still fails → continue with remaining.

---

### D4 — Critical Finding Action

**When:** Synthesis finds a CRITICAL severity finding with CONSENSUS (2+ voices agree).
For HIGH and below → just report, don't ask.

```json
{
  "questions": [{
    "question": "2+ reviewers independently flagged a critical issue:\n\n[finding summary with file:line]\n\nThis is the kind of thing that causes incidents.",
    "header": "Critical finding",
    "multiSelect": false,
    "options": [
      {"label": "I'll fix this now — open /fix with this finding"},
      {"label": "I see it — I'll handle it, just continue the report"},
      {"label": "I disagree — explain why this isn't critical"}
    ]
  }]
}
```

Recommendation: Fix now if it's auth/data/security. Otherwise continue report.

---

### D5 — Disagreement Resolution

**When:** Voices directly contradict each other on a HIGH+ finding.
For MEDIUM and below disagreements → just report both sides, don't ask.

```json
{
  "questions": [{
    "question": "Reviewers disagree on [location]:\n\nVoice A ([model]): [position]\nVoice B ([model]): [position]\n\nThis affects [user impact].",
    "header": "Reviewers disagree",
    "multiSelect": false,
    "options": [
      {"label": "Get tiebreaker — ask a third model to weigh in (~$X.XX)"},
      {"label": "Voice A is right — I know the context"},
      {"label": "Voice B is right — I know the context"},
      {"label": "Note it — I'll investigate myself"}
    ]
  }]
}
```

Recommendation: Tiebreaker for security disagreements. "Note it" for design taste calls.

---

### D6 — Follow-Up Deep Dive

**When:** User requests drill-down on a specific finding AND estimated cost > $0.10.
Below $0.10 → auto-proceed.

```json
{
  "questions": [{
    "question": "Asking [ModelName] to elaborate on [finding]. Estimated cost: ~$X.XX.",
    "header": "Follow-up cost",
    "multiSelect": false,
    "options": [
      {"label": "Go ahead"},
      {"label": "Skip — the finding is clear enough"}
    ]
  }]
}
```

Recommendation: Go ahead if finding is CRITICAL/HIGH. Skip if LOW/NIT.

---

### D7 — Report Destination

**When:** Review is complete. Ask only if review has 3+ HIGH/CRITICAL findings.
For clean reviews → just show in chat, don't ask.

```json
{
  "questions": [{
    "question": "/mf-voices complete. [N] critical + high findings. Where should I put the report?",
    "header": "Save report?",
    "multiSelect": false,
    "options": [
      {"label": "Chat only — I'll act on it now"},
      {"label": "Save to docs/voices/ — reference later"},
      {"label": "Both — show now and save"}
    ]
  }]
}
```

Recommendation: Save if > 5 findings or if review is for a PR. Chat only for quick checks.

---

### 1.1 — Detect Review Type

Based on `$ARGUMENTS` and file inspection:

```
CODE REVIEW:
  Trigger: git diff, PR, specific files, "review my changes"
  Material: git diff output + affected files
  Command: git diff main...HEAD (or specified range)

DOCUMENT REVIEW:
  Trigger: .md file, spec, RFC, "review this doc"
  Material: file contents
  
ARCHITECTURE REVIEW:
  Trigger: "review architecture", "design review", system diagram
  Material: relevant source files + docs

SKILL REVIEW:
  Trigger: .md skill file, CLAUDE.md, "review this skill"
  Material: skill file contents

GENERAL:
  Trigger: anything else
  Material: $ARGUMENTS content or referenced files
```

### 1.2 — Gather Material

```bash
# For code review
MATERIAL=$(git diff main...HEAD 2>/dev/null)
[ -z "$MATERIAL" ] && MATERIAL=$(git diff HEAD~1 2>/dev/null)

# For file review
# MATERIAL=$(cat <file-path>)

# Truncation guard: if material > 8000 tokens (~32KB), summarize or chunk
MATERIAL_SIZE=$(echo "$MATERIAL" | wc -c)
```

If material > 32KB → split into logical chunks (by file for diffs, by section for docs).
Review each chunk separately, synthesize at end.

### 1.3 — Context Signal

From `$ARGUMENTS`, detect emphasis:

```
Security-sensitive:  "auth", "payment", "crypto", "token", "secret", "permission"
  → Weight security findings higher

Performance-sensitive: "slow", "scale", "optimize", "latency", "throughput"  
  → Weight performance findings higher

User-facing: "UI", "UX", "frontend", "customer", "user experience"
  → Weight usability/accessibility findings higher

No signal: balanced review across all dimensions
```

---

## Phase 2: Construct Review Prompts

### Prompt Philosophy

```
DO NOT feed structured format/options/categories into reviewer prompts.

Why:
  - Pre-defined categories → reviewer only thinks inside your box → misses insights outside it
  - Pre-defined severity levels → reviewer conforms instead of judging independently
  - Finding-by-finding template → kills holistic observations ("architecture is wrong" isn't a single finding)
  - Forcing 1 lens ("only look at security") → blind to obvious issues in other areas

Reviewer must THINK FREELY, decide what matters, express in their own words.
Structuring/categorizing findings is OUR job in Phase 4 (Synthesis).
```

### Core Prompt (shared across all LLMs)

Every reviewer gets the same material + same open-ended instruction.
NO template. NO checklist. NO severity scale.

```
BASE PROMPT:

"Review the following content. Be direct. Be honest.

I want to know:
- What's wrong or could go wrong?
- What concerns you?
- What would you change if this were your code/doc?
- What's good and should be kept?

Be specific — point to exact files, lines, sections.
If you see an overall pattern (not just individual bugs), say so.
If you find nothing wrong, say that — don't invent findings.

MATERIAL:
<material here>"
```

### Bias Prompts (light nudge — NOT constraint)

Each reviewer gets 1-2 extra sentences SUGGESTING a direction, but NOT limiting:

```
BIAS A — Lean toward correctness:
  "I'm especially curious: does this code actually do what it claims?
   But if you see something else more important, say that too."

BIAS B — Lean toward security:
  "I'm especially curious: how could this code be exploited?
   But if you see something else more important, say that too."

BIAS C — Lean toward design:
  "I'm especially curious: will the next person understand this code?
   But if you see something else more important, say that too."
```

**Key:** "But if you see something else more important, say that too."
→ Permits reviewer to OVERRIDE the suggested lens.

### Bias Assignment

```
If 3 LLMs available:
  Voice 1 (e.g., GPT)     → Bias A (lean correctness)
  Voice 2 (e.g., Gemini)  → Bias B (lean security)
  Voice 3 (e.g., Claude)  → Bias C (lean design)

If 2 LLMs available:
  Voice 1 → Bias A (lean correctness)
  Voice 2 → Bias B (lean security)
  No dedicated Bias C — both are still free to comment on design

If 1 external LLM:
  Voice 1 (external) → Bias A
  Voice 2 (host/self) → Bias B
  Flag: "2-voice review (limited diversity)"

If 0 external:
  Single voice: no bias, base prompt only
  Flag: "⚠ Single-voice review — no independent verification"
```

---

## Phase 3: Execute Reviews

### 3.1 — Call Each LLM

Call LLMs in parallel when possible. Each call is independent.

```bash
# === OpenAI (GPT) ===
# Via CLI
openai api chat.completions.create \
  -m gpt-4o \
  -g user "$REVIEW_PROMPT_A" \
  --max-tokens 4000 \
  2>/dev/null

# Via curl (fallback)
curl -s https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "'"$REVIEW_PROMPT_A"'"}],
    "max_tokens": 4000,
    "temperature": 0.3
  }' | jq -r '.choices[0].message.content'


# === Google Gemini ===
# Via CLI
gemini generate "$REVIEW_PROMPT_B" --model gemini-2.5-pro 2>/dev/null

# Via curl (fallback)
curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"parts": [{"text": "'"$REVIEW_PROMPT_B"'"}]}],
    "generationConfig": {"maxOutputTokens": 4000, "temperature": 0.3}
  }' | jq -r '.candidates[0].content.parts[0].text'


# === Ollama (local) ===
ollama run llama3.1:70b "$REVIEW_PROMPT_C" 2>/dev/null

# Via API
curl -s http://localhost:11434/api/generate \
  -d '{
    "model": "llama3.1:70b",
    "prompt": "'"$REVIEW_PROMPT_C"'",
    "stream": false
  }' | jq -r '.response'


# === Anthropic (different Claude model as second voice) ===
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "content-type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 4000,
    "messages": [{"role": "user", "content": "'"$REVIEW_PROMPT_B"'"}]
  }' | jq -r '.content[0].text'
```

### 3.2 — Handle Failures Gracefully

```
LLM call fails (timeout, rate limit, error)?
  → Log: "Voice N (ModelName): UNAVAILABLE — <error>"
  → Continue with remaining voices
  → Minimum 1 voice required to produce report
  → 0 voices succeed → BLOCKED, suggest retry or check API keys

LLM returns garbage (no structured findings)?
  → Log: "Voice N: UNSTRUCTURED — attempting extraction"
  → Best-effort parse: look for severity keywords, file references
  → If still unusable → mark as "Voice N: no usable findings"
```

### 3.3 — Temperature & Parameters

```
temperature: 0.3  (low — want analytical, not creative)
max_tokens: 4000  (enough for thorough review)
top_p: 0.9        (slightly narrow for consistency)

Rationale: review is analytical task. Low temperature reduces
hallucinated findings. We want disagreements from different
training data/perspectives, not from randomness.
```

---

## Phase 4: Synthesize

This is where the skill adds unique value. Reviewers return free-form responses —
paragraphs, bullets, or a mix. OUR job is structuring their responses into
comparable, actionable findings.

**Principle: WE structure, reviewers DON'T.**
Reviewers speak freely. We categorize after. This preserves insights
that rigid formats would kill.

### 4.1 — Parse findings from free-form responses

Read each response. Extract each distinct concern/observation.

For each concern a reviewer raises, WE assign:

```
  voice:      model name
  severity:   CRITICAL | HIGH | MEDIUM | LOW | NIT
              (WE assess based on reviewer's language +
               actual impact, NOT assigned by reviewer)
  category:   WE classify — reference list:
              LOGIC, EDGE_CASE, SECURITY, ERROR, RACE, PERF,
              NAMING, DESIGN, TESTABILITY, CONVENTION, DOCS, A11Y, DX
              If finding doesn't fit any category → create new or use "GENERAL"
  location:   file:line or section (if reviewer specified)
              If reviewer was vague → WE grep to find specific location
  issue:      summarize from reviewer's words (preserve meaning, don't add/remove)
  suggestion: if reviewer proposed a fix → keep
              if not → WE may add, marked "(suggestion from synthesis)"
  verbatim:   short quote from reviewer (so user sees what reviewer actually said)
```

**Important:** If a reviewer makes HOLISTIC observations (e.g., "this architecture is
over-complicated", "naming conventions are inconsistent throughout"), these are NOT
individual findings. Record separately as "Overall observations" in the report —
don't force into finding format.

### 4.2 — Find Consensus & Disagreements

```
CONSENSUS (2+ voices agree):
  Same location + same issue (even if different wording)
  → Merge into single finding
  → Confidence: REINFORCED (multiple independent reviewers agree)
  → Note: "Found by: Voice A, Voice B"
  → **If CRITICAL severity → trigger D4** (ask user to fix now or continue)

UNIQUE FINDINGS (only 1 voice):
  → Keep, but mark: "Single voice — verify before acting"
  → Not necessarily wrong — different lenses catch different things
  → Specialist findings (security from security lens) are expected unique

DISAGREEMENTS (voices contradict):
  Voice A says X is fine, Voice B says X is a bug
  → Flag explicitly: "DISAGREEMENT at <location>"
  → Present both perspectives
  → **If HIGH+ severity → trigger D5** (ask user to resolve or get tiebreaker)
  → If MEDIUM or below → just report both sides, don't ask
  
SEVERITY DISAGREEMENT:
  Same finding but different severity (A says HIGH, B says LOW)
  → Report higher severity + note disagreement
  → "Voice A: HIGH, Voice B: LOW — recommend treating as HIGH"
```

### 4.3 — Priority Ranking

```
CRITICAL findings first (always)
  then CONSENSUS HIGH (reinforced)
  then UNIQUE HIGH (single voice)
  then CONSENSUS MEDIUM
  then UNIQUE MEDIUM
  then LOW/NIT (grouped at end)

Context signal from Phase 1.3 adjusts:
  Security-sensitive → security findings promoted +1 severity tier
  Performance-sensitive → perf findings promoted +1
  User-facing → a11y/UX findings promoted +1
```

---

## Phase 5: Output Report

```
MULTI-VOICE REVIEW REPORT
════════════════════════════════════════════════════════════════

Target:     <what was reviewed>
Type:       <code | document | architecture | skill | general>
Date:       <date>
Voices:     <N voices — list model names>
            e.g., "3 voices: GPT-4o (correctness), Perplexity sonar-pro (security),
                   Claude Sonnet (design)"

─── SUMMARY ───
<2-3 sentences: overall quality assessment, biggest concern, recommended action>

Total findings: N (C critical, H high, M medium, L low, N nits)
Consensus findings: N (agreed by 2+ voices)
Unique findings: N (single voice)  
Disagreements: N

─── OVERALL OBSERVATIONS ───
(Holistic patterns, architecture concerns, direction — not individual findings)

Voice A (GPT-4o): "<overall observation if any, verbatim>"
Voice B (Gemini): "<overall observation if any, verbatim>"
Voice C (Claude): "<overall observation if any, verbatim>"

Common theme: <summary if multiple voices raised same holistic concern>
(Omit this section if no voice made holistic observations)

─── CRITICAL + HIGH FINDINGS ───

### [C1] <title> — CRITICAL
Location:   <file:line or section>
Category:   <SECURITY | LOGIC | ...>
Found by:   Voice A, Voice B (CONSENSUS — REINFORCED)
Issue:      <specific description>
Suggestion: <specific fix>
Impact:     <what goes wrong if not fixed>

### [H1] <title> — HIGH
Location:   <file:line>
Category:   <category>
Found by:   Voice B only (UNIQUE — verify)
Issue:      <description>
Suggestion: <fix>

... (all critical + high findings) ...

─── DISAGREEMENTS ───

### [D1] <location>
Voice A (GPT-4o):     "<finding or opinion>"
Voice B (Gemini):     "<contradicting finding or opinion>"
Implication:          <what this means for the developer>
Recommendation:       <suggest how to resolve — test, benchmark, or human judgment>

... (all disagreements, if any) ...

─── MEDIUM FINDINGS ───

### [M1] <title> — MEDIUM
Location:   <file:line>
Found by:   <voice(s)>
Issue:      <description>
Suggestion: <fix>

... 

─── LOW + NITS ───
(condensed — 1 line per finding)

- [L1] <file:line> — <issue> (<voice>)
- [L2] <file:line> — <issue> (<voice>)
- [N1] <file:line> — <nit> (<voice>)

─── VOICE BREAKDOWN ───

| Voice | Model | Lens | Findings | Unique | Consensus | Tokens | Est. Cost |
|-------|-------|------|----------|--------|-----------|--------|-----------|
| A | GPT-4o | Correctness | N | N | N | N | ~$X.XX |
| B | Gemini-2.5-Pro | Security | N | N | N | N | ~$X.XX |
| C | Claude Sonnet | Design | N | N | N | N | ~$X.XX |
| **Total** | | | **N** | **N** | **N** | **N** | **~$X.XX** |

─── META ───
Agreement rate:  <N% — (consensus findings / total unique findings) × 100>
                 100% = all voices found same things (possible shared blind spot)
                 < 30% = voices looked at very different concerns (expected with different lenses)
Blind spots:     <categories with 0 findings across all voices — may indicate gap>
Rabbit holes:    <"none" or "Voice N reviewed config files — findings demoted">
Limitations:     <material truncated? voice unavailable? single-voice degradation?>

════════════════════════════════════════════════════════════════
```

**After report displayed:** If 3+ HIGH/CRITICAL findings → **trigger D7** (ask save to file or chat only).
Clean review → show in chat, don't ask.

### Report File Naming

When saving to file:
```
docs/voices/YYYY-MM-DD-<target-short-name>.md
Example: docs/voices/2026-04-25-auth-middleware.md
```

---

## Adaptive Behavior

### Small Review (< 200 lines diff, < 5 files)

```
Use 2 voices (not 3)
Combine lenses: Correctness+Security, Design+DX
Report: condensed, skip voice breakdown table
```

### Large Review (> 500 lines, > 10 files)

```
Chunk material by file or logical group
Each chunk reviewed independently
Synthesis merges across chunks
Cross-file findings (e.g., API contract mismatch) flagged separately
```

### No External LLM Available

```
Single-voice mode:
  Run all 3 lenses sequentially as separate prompts to self
  Flag: "⚠ Single-voice — no independent verification"
  Still valuable: structured multi-lens review is better than ad-hoc
  But: consensus/disagreement analysis not possible
```

---

## Review-Type Specific Prompts

### Code Review — Additional Context

```
Append to base prompt:
  "Also check:
   - Does this diff introduce test coverage for new behavior?
   - Are there files that SHOULD have changed but didn't? (spec, docs, tests)
   - Is the commit atomic? (one concern per diff, or mixed changes?)
   - Any TODO/FIXME/HACK without ticket reference?"
```

### Document Review — Additional Context

```
Append to base prompt:
  "Also check:
   - Are there claims without evidence or examples?
   - Is the structure logical? (Can a reader follow top-to-bottom?)
   - Are there contradictions between sections?
   - Are edge cases and error paths documented, not just happy path?
   - Is terminology consistent throughout?"
```

### Architecture Review — Additional Context

```
Append to base prompt:
  "Also check:
   - Single points of failure?
   - What happens when [component] is down?
   - Are boundaries between modules clear? (Who owns what?)
   - Will this scale to 10x current load? What breaks first?
   - Are there implicit assumptions not documented?"
```

### Skill Review — Additional Context

```
Append to base prompt:
  "Also check:
   - Are instructions clear enough for an AI to follow unambiguously?
   - Are there steps that could be interpreted multiple ways?
   - Is there a clear stop condition for each phase?
   - Are edge cases handled? (empty input, failure, timeout)
   - Does the output format contain everything needed for the next step?"
```

---

## Rules

1. **Same material, different lenses.** Every voice reviews the same content. Difference comes from lens + model perspective, not from seeing different things.
2. **Low temperature.** Reviews are analytical. Disagreements should come from different training/perspective, not randomness.
3. **Don't resolve disagreements.** Present both sides. Developer decides. AI panel advises, human owns the decision.
4. **Graceful degradation.** 1 voice fails → continue with remaining. 0 succeed → BLOCKED.
5. **No phantom findings.** If a voice says "no issues in this category" → record that. Absence of findings IS data.
6. **Consensus ≠ correct.** All 3 voices can be wrong about the same thing (shared training bias). Flag this in META: "Agreement rate 100% — consider if shared blind spot exists."
7. **Findings must be specific.** "Code could be improved" is not a finding. "auth.ts:47 — token check returns undefined on expired session, should return AuthError.Expired" is a finding.
8. **Truncation = declared.** If material was truncated or chunked, say so. Reviewer saw partial picture → findings may miss cross-file issues.

---

## LLM Configuration Guide

### API Key Setup

```bash
# Add to shell profile (~/.zshrc, ~/.bashrc)

# OpenAI
export OPENAI_API_KEY="sk-..."

# Google Gemini
export GEMINI_API_KEY="..."

# Anthropic (if calling as second voice)
export ANTHROPIC_API_KEY="sk-ant-..."

# Ollama (no key needed, just install + pull model)
# brew install ollama
# ollama pull llama3.1:70b
```

### Recommended Model Combinations

```
Budget (low cost):
  Voice 1: GPT-4o-mini (correctness)
  Voice 2: Gemini Flash (security)
  → Cost: ~$0.01-0.05 per review

Standard:
  Voice 1: GPT-4o (correctness)
  Voice 2: Gemini 2.5 Pro (security)  
  Voice 3: Claude Sonnet (design) — via API, not self
  → Cost: ~$0.05-0.20 per review

Premium:
  Voice 1: GPT-4.1 (correctness)
  Voice 2: Gemini 2.5 Pro (security)
  Voice 3: Claude Opus (design)
  → Cost: ~$0.20-0.50 per review

Local (free, private):
  Voice 1: Ollama llama3.1:70b (correctness)
  Voice 2: Ollama codellama:34b (code-specific)
  → Cost: $0, but slower + less capable
```

### Model Strengths (guide lens assignment)

```
GPT-4o / 4.1:     Strong at logic bugs, edge cases, code correctness
Gemini 2.5 Pro:   Strong at security analysis, broad knowledge
Claude Sonnet/Opus: Strong at design, readability, nuanced reasoning
Llama 3.1 70B:    Decent at code review, good for privacy-sensitive
CodeLlama:        Specialized for code, misses design/docs concerns
DeepSeek Coder:   Strong at code logic, weaker on security/design
```

---

## Follow-Up: Drill Into Specific Findings

After the report is delivered, user may want to drill deeper into specific findings.

### Targeted Follow-Up

If user says "ask Voice B about finding H1" or "elaborate on the security concern":

1. Identify which voice and which finding
2. Construct follow-up prompt:
   ```
   <Filesystem Boundary>
   You previously reviewed this material and found:
   "<paste the specific finding>"
   
   The developer wants more detail:
   - Exact reproduction steps if this is a bug
   - Code example showing the fix
   - How confident are you this is a real issue vs false positive?
   
   <Original material for context>
   ```
3. Call ONLY that specific LLM (not all voices)
4. Present response attributed to that voice

### Cross-Examine a Disagreement

If user says "resolve disagreement D1" or "who's right about the auth issue":

1. Take the disagreement
2. Send to a THIRD voice (not either of the two that disagreed):
   ```
   <Filesystem Boundary>
   Two reviewers disagree about this code:
   
   Reviewer A says: "<Voice A's position>"
   Reviewer B says: "<Voice B's position>"
   
   The code in question: <relevant snippet>
   
   Who is correct? Or are they both partially right?
   Be specific — cite the code.
   ```
3. Present as "Tiebreaker voice (ModelName) says: ..."
4. Still don't auto-resolve — present all 3 opinions, user decides

### Cost Guard

Follow-up calls are individual API calls. **Trigger D6** if estimated cost > $0.10.
Below $0.10 → auto-proceed without asking.

# Review specific file
claude "/review src/auth/middleware.ts"

# Review with emphasis
claude "/review — focus on security, this handles payment tokens"

# Review a document
claude "/review docs/business-logic/FileList.md"

# Review architecture
claude "/review the caching architecture in src/cache/"

# Review a skill
claude "/review .claude/commands/fix.md"
```
