# Customization

[← Back to README](../README.md)


### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FILE_GUARD_THRESHOLD` | `350` | Max lines before file guard warns |
| `FILE_GUARD_EXCLUDE` | _(empty)_ | Comma-separated globs to skip (e.g. `*.generated.swift`) |
| `PATH_GUARD_EXTRA` | _(empty)_ | Additional pipe-separated patterns to block (e.g. `\.terraform`) |
| `SENSITIVE_GUARD_EXTRA` | _(empty)_ | Additional pipe-separated patterns for sensitive files (e.g. `\.vault`) |
| `SELF_REVIEW_ENABLED` | `true` | Set to `false` to disable the self-review checklist on Stop |

Set these in your shell profile or project `.envrc` (if using direnv).

### Extending CLAUDE.md

Add project-specific rules to `.claude/CLAUDE.md`:

```markdown
## Project-Specific Rules

- All API endpoints must have OpenAPI annotations
- Database migrations must be reversible
- UI components must support dark mode
- All strings must be localized via i18n keys
```

### Adding Custom Skills

Create new skills in `.claude/skills/<name>/SKILL.md`:

```markdown
# .claude/skills/deploy/SKILL.md

Run the deployment pipeline:
1. /sp-review
2. /sp-commit
3. Run: bash scripts/deploy.sh $ARGUMENTS
4. Verify deployment health: curl -f https://api.example.com/health
```

Then use: `/deploy staging`

---

