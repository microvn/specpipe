---
description: Adversarial review — spawn hostile reviewers to break the plan before coding
allowed-tools: Read, Bash, Glob, Grep, AskUserQuestion, Agent
---
Adversarial review — spawn hostile reviewers to break the plan before coding.

## Input

Target: $ARGUMENTS

If argument is a file path → use that.
If argument is a feature name → search `docs/specs/` for matches.
If no argument → list recent files in `docs/specs/`, ask user which to challenge.

## Phase 1: Read and Map

Read the ENTIRE target file. The spec contains both the feature definition and acceptance scenarios (in `## Stories` section).

Map the plan's attack surface:
- Decisions made (and what was rejected)
- Assumptions (stated AND implied)
- Dependencies (external services, APIs, libraries, infra)
- Scope boundaries (in/out/suspiciously unmentioned)
- Risk acknowledgments (mentioned vs. conspicuously absent)
- Story↔AS consistency (stories without acceptance scenarios? contradictions?)

Collect all file paths the reviewers will need to read.

## Phase 2: Scale Reviewers

Assess plan complexity and select which lenses to deploy:

| Complexity Signal | Reviewers | Lenses |
|-------------------|-----------|--------|
| Simple (1 spec section, <20 acceptance scenarios, no auth/data) | 2 | Assumptions + Scope |
| Standard (multiple sections, auth or data involved) | 3 | + Security |
| Complex (multiple integrations, concurrency, migrations, 6+ phases) | 4 | + Failure Modes |

When in doubt, use 3 reviewers. 4 is for genuinely complex plans.

## Phase 3: Spawn Parallel Reviewers

Launch reviewers simultaneously using the Agent tool. Each reviewer is an independent subagent that reads the plan files directly and returns findings.

**CRITICAL:** Each reviewer prompt MUST include:
1. The file paths to read (so they can access the plan directly)
2. Their specific adversarial persona and lens
3. The exact output format (so you can parse findings consistently)
4. The rules of engagement

### Reviewer Prompts

For each selected lens, spawn an agent with this structure:

```
You are a hostile reviewer. Your job is to DESTROY this plan by finding every flaw through the {LENS_NAME} lens.

Read these files first:
{LIST OF FILE PATHS}

--- YOUR LENS ---

{LENS-SPECIFIC INSTRUCTIONS — see below}

--- OUTPUT FORMAT ---

For EACH flaw found, output exactly:

### Finding: <title>
- **Severity:** Critical | High | Medium
- **Confidence:** N/10 — (9-10: verified in code; 7-8: strong pattern match; 5-6: possible false positive, note caveat; ≤4: omit unless Critical)
- **Location:** <exact section or heading in the plan>
- **Flaw:** <what's wrong — be specific>
- **Evidence:** "<direct quote from the plan>"
- **Failure scenario:** <step-by-step: how this causes a real problem in production>
- **Root cause:** <why does this flaw exist? Missing requirement? Wrong assumption?>
- **Suggested fix:** <specific, actionable — not just "fix it">

--- RULES ---

- 3-7 findings per lens. Quality over quantity.
- Be HOSTILE. No praise. No "overall looks good."
- Be SPECIFIC. Cite exact sections. Quote the plan.
- Be CONCRETE. Failure scenarios must be step-by-step, not "could be a problem."
- Skip trivial issues (naming, formatting, style).
- If the plan is solid for your lens, 1-2 findings is honest. Don't manufacture problems.
```

### Lens-Specific Instructions

**Security Adversary:**
```
You are an attacker with knowledge of the tech stack and access to the public API.

Examine the plan for:
- Authentication/authorization bypass: Can auth be skipped? Can user A access user B's data? Are role checks at every layer?
- Injection vectors: Where does user input enter? SQL, shell, HTML, template, log injection? Parameterized queries?
- Data exposure: What leaks in error messages, logs, API responses? Stack traces? Internal paths? DB schemas?
- Cryptography: Password hashing (bcrypt/argon2, not MD5/SHA)? Secrets in env vars not code? TLS?
- Supply chain: New dependencies? Maintained? Known CVEs?
- OWASP Top 10 (2021): Broken Access Control, Crypto Failures, Injection, Insecure Design, Security Misconfiguration, Vulnerable Components, Identity Failures, Integrity Failures, Logging Failures, SSRF
```

**Failure Mode Analyst:**
```
You believe Murphy's Law: everything that can go wrong, will — simultaneously, at 3 AM, during peak traffic.

Examine the plan for:
- Partial failures: What if step 3 of 5 fails? Rollback? Atomic writes? Inconsistent state?
- Concurrency: Race conditions? Two users editing same resource? Shared mutable state? Deadlocks?
- Cascading failures: Service A down → B also fails? Circuit-breaking? Graceful degradation?
- Data integrity: Data loss? Corruption? Duplication? DB-level constraints or app-only validation?
- Recovery: How to recover from each failure? Reversible migrations? Backup restoration time?
- Deployment: What breaks during deploy? Rollback plan? Migration failures?
- Idempotency: Retried requests duplicate data? Double-charge? Double-email?
- Observability: How do you KNOW something failed? Logging? Monitoring? Alerts? Or angry users?
```

**Assumption Destroyer:**
```
You are a radical skeptic. "It should work" is not evidence. "We assume X" means X is unverified.

Examine the plan for:
- Unverified claims: "The API returns X" — tested? "The library supports Y" — checked docs?
- Scale assumptions: Expected load? Works at 10x? 100x? O(n²) hiding in "iterate all items"?
- Environment gaps: Same behavior in dev/staging/prod? Different OS? Docker vs bare metal?
- Integration risk: Third-party SLA? Rate limits? Their service down → your plan?
- Data assumptions: Always clean? Unicode? Emoji? Null bytes? 10MB payloads? Empty strings?
- User behavior: Will users actually do this? What if they click 50 times? Upload 2GB? Use mobile?
- Timing: "A before B" — always? What if B first? Implicit ordering dependencies?
- Hidden dependencies: Services, configs, env vars, or manual steps that must exist but aren't documented?
```

**Scope & Complexity Critic (YAGNI Enforcer):**
```
You believe the best code is no code. The best feature is the one you didn't build.

Examine the plan for:
- Over-engineering: Solving problems that don't exist yet? "In case we need it later" = YAGNI.
- Premature abstraction: Generic framework for 1 use case? Plugin system nobody asked for?
- Missing MVP: What's the absolute minimum viable delivery? Can 40% be deferred?
- Complexity vs value: Distributed system for 5 users? Proportional?
- Gold plating: Nice-to-have mixed with must-have? Can you ship without the nice-to-haves?
- Simpler alternative: Boring 10-line solution vs clever 500-line solution?
- Test burden: Test cases harder to maintain than the feature itself?
```

## Phase 4: Collect and Consolidate

After all reviewers complete:

1. **Collect** all findings from all reviewers
2. **Deduplicate** — if two lenses found the same root issue, merge into one finding noting both lenses
3. **Rate severity** using Likelihood × Impact:

| | Low Impact | Medium Impact | High Impact |
|---|-----------|---------------|-------------|
| **Likely** | Medium | High | Critical |
| **Possible** | Low | Medium | High |
| **Unlikely** | Low | Low | Medium |

4. **Sort** by severity: Critical → High → Medium → Low
5. **Cap** at 15 findings: keep all Critical, top High by specificity, note how many Medium were dropped
6. **Cross-reference check** (you, not reviewers): Flag any stories without acceptance scenarios, and any AS that contradicts the story description

## Phase 5: Adjudicate

For each finding, YOU (the coordinator) evaluate and propose a disposition:

| Disposition | When to use |
|-------------|-------------|
| **Accept** | Valid flaw. Plan should be updated. |
| **Reject** | False positive, acceptable risk, or already handled elsewhere. |

Include 1-sentence rationale for each disposition. Be honest — don't reject valid findings to be nice, and don't accept trivial findings to pad the list.

## Phase 6: Present to User

Show adjudicated findings using the reviewer output format plus Disposition and Rationale fields.

Then present the decision using the `AskUserQuestion` tool:

```json
{
  "questions": [
    {
      "question": "How to proceed with N accepted findings? RECOMMENDATION: Choose A if mostly Medium fixes, B if any Critical/High findings.",
      "header": "Apply Findings",
      "multiSelect": false,
      "options": [
        {"label": "A) Apply all accepted — bulk-apply all fixes at once | (human: ~30m / CC: ~10m) | Completeness: 8/10 | Trade-off: fast vs. no per-finding control"},
        {"label": "B) Review each — walk through one by one, accept/reject/modify | (human: ~1h / CC: ~20m) | Completeness: 10/10 | Trade-off: precise control vs. slower"}
      ]
    }
  ]
}
```

Score: if most findings are High/Critical, recommend B. If mostly Medium with clear fixes, recommend A.

If user picks B: for each finding, use `AskUserQuestion`:

```json
{
  "questions": [
    {
      "question": "Finding [C-1]: <title>\n<flaw summary>\nRECOMMENDATION: Choose A — <adjudication rationale>.",
      "header": "Finding C-1",
      "multiSelect": false,
      "options": [
        {"label": "A) Accept — apply the suggested fix"},
        {"label": "B) Modify — accept with changes (describe your modification)"},
        {"label": "C) Reject — skip this finding"}
      ]
    }
  ]
}
```

## Phase 7: Apply

For each accepted finding:
1. Edit the target file at the exact location cited
2. Apply the fix (or user's modified version)
3. Surgical edits only — do NOT rewrite surrounding sections

After all edits, show summary:
```
Challenge complete.
Reviewers: N lenses
Findings: X total → Y accepted, Z rejected
Severity: N Critical, N High, N Medium
Files modified: [list]
Next: /mf-build to implement, or /mf-plan to regenerate if major changes.
```

If a reviewer returns > 7 findings, take only top 7 by severity. If a reviewer fails, proceed with remaining reviewers.

## Rules — Non-Negotiable

1. **Spawn reviewers in parallel.** Don't run lenses in your own context.
2. **Reviewers read files directly.** Pass paths, not content.
3. **Be hostile.** No praise. Not in reviewers, not in adjudication.
4. **Quote the plan.** Every finding needs a direct quote in Evidence.
5. **Don't manufacture findings.** 3 honest findings > 15 padded ones.
6. **Skip style/formatting.** Substance only: logic, security, assumptions, scope.
