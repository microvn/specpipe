# Adding a coding agent

Adding an agent is one registry entry plus a test. If the agent follows the `.agents/`
standard (a `SKILL.md` under `.agents/skills/` + `AGENTS.md`), it's even smaller — declare
the family and you're done.

## 1. Confirm the format (cite it)

Before writing code, find the agent's **official** convention and note the source:

- Where do its skills/instructions live? (path, file name)
- What frontmatter does it expect? (which fields are required)
- Does it have a guardrails/rules mechanism, or only a single instructions file?
- Can it enforce anything (hooks), or is everything advisory?

If you can't verify a format from official docs, add the agent as **experimental** and say
so in the README — don't guess paths.

## 2. Add the registry entry

In `cli/src/lib/agents.js`, add to `AGENTS`:

```js
windsurf: {
  label: 'Windsurf',
  // where skills land; inner is 'SKILL.md' or a reference path like 'references/x.md'
  skillTarget: (name, inner) => `.windsurf/skills/${name}/${inner}`,
  globalRoot: '.windsurf/skills',
  skillFile: 'SKILL.md',
  hooks: 'rules',            // 'native' (Claude) | 'rules' | 'agents-md' | 'none'
  capabilities: 'router-no-hooks',
  emitFrontmatter: fmNameDesc, // reuse an existing emitter, or write one
},
```

`emitFrontmatter(parsed, name)` returns the YAML frontmatter string for that agent.
Reuse `fmNameDesc` (name + description) unless the agent needs something special — see
`fmHermes` (adds version + tags) or `fmCursor` (description + globs + alwaysApply).

## 3. Declare its guardrails

In the `RULES` map (same file), add how the agent carries the always-on guards:

```js
windsurf: { mode: 'file', path: '.windsurf/rules/agentpipe-guards.md',
            frontmatter: 'activation: always' },
```

Modes: `file` (an owned rule file with frontmatter), `doc` (plain advisory markdown),
`agents-md` (a merged section in a shared `AGENTS.md`). Claude uses native hooks and has
no `RULES` entry.

## 4. Add a test

In `test/agents.mjs`, assert the emitted layout and that no Claude-only tool token leaks:

```js
eq('windsurf path', emitSkillFile('windsurf', REL, SKILL).path,
   '.windsurf/skills/ap-plan/SKILL.md');
not('windsurf: no AskUserQuestion leak',
    emitSkillFile('windsurf', '...', realSkillSrc).content, 'AskUserQuestion');
```

The existing "AskUserQuestion rewrite on real skills" block already loops every agent in
the registry, so a new agent is covered automatically for the leak check.

## 5. Update docs

- README "Supported agents" table (or Experimental).
- `docs/multi-agent.md` format matrix.

## 6. Run it

```bash
npm test                                   # all suites
node cli/bin/devkit.js init /tmp/x --agents windsurf   # eyeball the real output
```

That's the whole contract. No changes to install, lifecycle, or manifest code — they all
read the registry.
