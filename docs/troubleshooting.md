# Troubleshooting

[← Back to README](../README.md)


### Hook not firing

**Symptom:** File guard or path guard doesn't trigger.

**Check:**
1. Is `settings.json` valid? `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf-8'))"`
2. Are hooks executable? `ls -la .claude/hooks/`
3. Is Node.js available? `node --version`
4. Is `$CLAUDE_PROJECT_DIR` set? Check in Claude Code with: `echo $CLAUDE_PROJECT_DIR`

### Tests not detected

**Symptom:** `/sp-build` or `/sp-fix` can't figure out how to run the tests.

**Check:**
1. Are you in the project root? `pwd`
2. Does the project marker file exist? (e.g., `package.json`, `Cargo.toml`, `pyproject.toml`)
3. If your test command is non-standard, set it explicitly in `.claude/CLAUDE.md` under **Testing** so the skills use it.

### Wrong base branch

**Symptom:** `/sp-build` or `/sp-review` compares against wrong branch.

**Check:**
```bash
git symbolic-ref refs/remotes/origin/HEAD
```

If this is wrong or missing:
```bash
git remote set-head origin <your-main-branch>
```

### Path guard blocking a legitimate command

**Symptom:** Claude can't run a command you need.

**Fix:** The path guard blocks broad patterns. If you need to access `build/` for a specific reason, run the command directly in your terminal (not through Claude Code).

### File guard warning on generated files

**Fix:** Set the exclude pattern:
```bash
export FILE_GUARD_EXCLUDE="*.generated.swift,*.pb.go,*.min.js,*.snap"
```

---

