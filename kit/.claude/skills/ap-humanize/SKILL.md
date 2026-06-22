---
description: |
  Rephrase plan, notes, bullet points, or drafts into natural human-sounding text,
  ready to copy-paste and send. Strips AI tone before content goes out.
  Use when asked to "humanize", "viết lại", "rephrase", "làm cho tự nhiên hơn",
  "soạn email/comment/post", "không nghe giống AI", "bỏ giọng AI",
  or invoked via `/ap-humanize`.
  Infers target format, language, audience, and tone from context — including
  uncommon formats (PR description, release note, slack announcement, postmortem,
  customer reply, LinkedIn post, RFC).
  Proactively invoke this skill (do NOT rephrase directly) when the user pastes
  plan / notes / AI output with a request to send it somewhere — the anti-AI
  pattern checks and preservation rules catch gaps that hand-paraphrasing misses.
  Skip for pure translation, summarization, or generating content from zero —
  those are not rephrasing.
allowed-tools: AskUserQuestion
---
# /ap-humanize — Rephrase to human voice

Turn plan / bullet / notes into natural prose, ready to send. Return the final
version directly — no preamble, no explanation of what was changed.

Input: $ARGUMENTS

Explicit user instructions always override the rules in this file. Asked for
emoji → use emoji. Asked for formal → formal. Asked to keep bullets → keep them.

Follow-up edits stay inside the skill. When the user asks to adjust an
already-humanized output ("shorter", "longer", "in English", "more formal"),
that request still runs through Step 5 + Step 7 before returning. Do not treat
it as a casual rephrase, that is exactly how em dashes and buzzwords leak back in.

---

## Step 1 — Infer target format

Walk this priority list and stop at the first clear signal:

1. **User stated it** — any named format → produce exactly that format.
2. **Session context** — channel currently being discussed (writing a PR → PR description; ongoing incident → postmortem; sprint discussion → status update).
3. **Input shape** — greeting/closing → email; ticket key/status → jira; heading/code → markdown.
4. **Fallback** — plain text, tight, in the session's dominant language.

No fixed whitelist. Uncommon or hybrid formats → follow that format's conventions. Unclear → prefer short, direct, focused on what the reader needs to know. Do not ask if the format can be inferred.

---

## Step 2 — Infer audience

Same content, phrasing shifts by reader:

| Audience | Phrasing |
|----------|----------|
| Engineering / internal | Technical terms direct, no re-explaining |
| Customer / external | Outcome-focused, hide implementation |
| Executive / stakeholder | Outcome + impact, drop technical detail unless critical |
| Public / community (blog, LinkedIn, OSS) | Enough context for outsiders, do not assume internal knowledge |
| Mixed | Lean toward the less technical side |

Unclear → infer from channel: jira/PR → engineering; customer support → external; public release note → public.

---

## Step 3 — Language

Follow the session's dominant language. Mixed Vietnamese-English is normal — keep technical terms (deploy, rollback, API, sprint, blocker, hotfix, regression, commit, PR) untranslated. Do not add parenthetical glosses like `deploy (triển khai)` unless the user asks.

---

## Step 4 — Format per channel convention

Apply to every format, including ones not listed:

- **Openings / closings** — only when the channel demands them (email yes, jira/PR no).
- **Structure** — match reader expectations. PR: What/Why/How. Release note: Added/Fixed/Changed. Postmortem: timeline / root cause / action. Slack: TL;DR first.
- **Length** — enough to deliver, no more. Every section must do work.
- **Bullets vs prose** — bullets when ≥3 parallel items or scanning matters; prose when there is flow or content is short.
- **Tone** — direct by default. More formal for external / executive. Friendlier for internal / chat.

---

## Step 5 — Preservation (mandatory)

Never paraphrase these: numbers, names of people / products, error codes, file paths, line numbers, commands, URLs, specific times, technical terms, commitments, decisions.

**Do not soften certainty.** "Will ship Monday" ≠ "hope to ship Monday". "Committed" ≠ "trying". "We chose Postgres" ≠ "we are considering Postgres". The certainty in the source is data.

**Self-check before returning:**
- Did any date / number change?
- Did any commitment / deadline disappear or get softened?
- Did any decision / risk get dropped?
- Is there any new info (not present in the source)?
- Any em dash `—` in body text, or leftover typographic unicode (en dash `–`, curly quotes, `…`, `•`, decorative emoji) anywhere?
- Any antithesis shape ("not X, it's Y" / "không phải X mà là Y")?
- Any banned buzzword or hollow opening/closing from Step 7?

If yes to any → fix it. This check runs on every return, including follow-up edits (see below).

Vague input → short, neutral output. Do not invent detail to make sentences flow. Do not add empty sections ("Risks: N/A", "ETA: TBD"). If context is too thin for a format that demands structure (postmortem, RFC) → ask one specific question via `AskUserQuestion` rather than guess.

---

## Step 6 — Compression / expansion

- **"Shorter", "brief", "tighten"** → cut 30-60%, keep load-bearing information.
- **"Longer", "more context"** → improve transitions, clarify meaning. **Do not** add new facts, risks, benefits, or timelines.

---

## Step 7 — Anti-AI patterns (hard rules)

**Punctuation**
- Avoid em dash `—` in body text. Use comma, period, colon, or split the sentence.
- Em dash is fine in subjects or headings.
- No emoji unless the user asks or the channel genuinely uses them (friendly slack, social post).
- Limit consecutive semicolons / colons.

**Keyboard symbols only** — normalize typographic unicode to plain ASCII everywhere, including headings. These are silent AI/word-processor tells:
- en dash `–` → `-`
- curly quotes `“ ” ‘ ’` → straight `"` `'`
- ellipsis `…` → `...`
- unicode bullet `•` → `-` or `*`
- decorative emoji (✨ 🚀 ✅ ❌ ➡ …) → remove, unless the user asked or the channel genuinely uses them
Exception: keep a character if the user's source deliberately used it and asked to preserve formatting.

**No antithesis** — do not manufacture contrast to create rhythm. Banned shapes and their variants:
- "It's not X, it's Y"
- "Not just X, but Y"
- "X isn't the problem, Y is"
- "không phải X, mà là Y"
State the claim directly. "Y is what matters" beats "It's not X, it's Y" — the X half is usually filler the writer never needed.

**Format**
- Do not bullet-ize 1-3 sentences that can be prose.
- No headings for short passages.
- No Title Case On Every Word.

**Banned EN buzzwords**
delve into, leverage, empower, robust, seamless, game-changing, cutting-edge, state-of-the-art, next-level, unlock, foster collaboration, navigate the complexities, in today's fast-paced world, synergy, world-class, innovative solution.

**Banned VI buzzwords**
"nhằm mục đích", "đảm bảo rằng", "tối ưu hóa trải nghiệm", "giải pháp toàn diện", "mang đến giá trị", "đồng hành cùng", "không ngừng nỗ lực".

**Banned hollow openings / closings**
"I hope this email finds you well", "Hope you're doing great", "In conclusion", "Overall", "Together, we can...", "Trân trọng cảm ơn và mong nhận được phản hồi sớm", "Rất mong nhận được sự hợp tác".

**Tone**
- No fake enthusiasm, no salesy phrasing.
- No "rule of three" pile-ups (clear, concise, and effective).
- Do not add certainty or emotion that the source lacks.
- Vary sentence rhythm; allow slight imperfection. Do not over-smooth.

**Vietnamese specifics**
- Use "anh/chị" instead of "quý khách hàng" for internal / friendly B2B.
- Avoid "Quý công ty chúng tôi xin trân trọng thông báo" for internal email.
- Avoid "Trong quá trình..." when a direct phrasing works.

---

## Step 8 — Output

Return the final version directly. No explanation of edits.

Only offer multiple versions when the differences are genuinely useful (shorter / more formal / softer) and the user seems to want a choice — use `AskUserQuestion` to confirm rather than dumping three variants by default.

---

## Examples

Illustrative, not a format whitelist.

**Input:**

```
/ap-humanize reply jira
- Fix null pointer bug at UserService.java:45
- Will do in sprint 24
- Add null check before calling getProfile()
```

**Output (engineering audience):**

```
Fixing in sprint 24.
Cause: null pointer at UserService.java:45, getProfile() is called before the user is loaded.
Fix: add a null check before the call.
```

**Same input, user switches to "draft a customer email" → audience shifts:**

```
Subject: Update on the account info loading issue

Hi,

We have identified the cause of the account info loading issue you reported. The team is working on it and the fix will go out in the next release.

I will follow up once the deploy is done.

Thanks,
[Name]
```

---

## Rules

1. **Preservation beats style.** Numbers, commitments, decisions are not paraphrased.
2. **No invention.** Vague input → short output, no filler.
3. **No softening certainty.** "Will" ≠ "hope". "Decided" ≠ "considering".
4. **Explicit user instructions win.** Emoji / formal / bullets on request → comply.
5. **Return the final output directly.** No preamble, no "here is the rephrased version".
