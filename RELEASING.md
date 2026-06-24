# Releasing

## One-time OSS launch (rename `claude-devkit-cli` → `specpipe`, keep old users)

Run as the `microvn` npm account (`npm whoami` to check; `npm login` if needed).

1. **Publish the new package** (`specpipe`):
   ```bash
   cd cli
   npm publish --access public
   ```
   `prepublishOnly` copies `../kit` → `templates/` and `../README.md`; `postpublish` cleans them.

2. **Publish the redirect shim** so existing `claude-devkit-cli` installs keep working and
   auto-pull specpipe:
   ```bash
   cd ../legacy/claude-devkit-cli
   npm publish
   ```
   (version `1.14.0` > the old `1.13.1`; it depends on `specpipe@^1` and forwards the
   `claude-devkit` / `claude-devkit-cli` commands to it.)

3. **Deprecate the old name** with a migration nudge (install still works — this only adds
   a warning):
   ```bash
   npm deprecate claude-devkit-cli "Renamed to 'specpipe' (multi-agent). Install: npm i -g specpipe — https://github.com/microvn/specpipe"
   ```

After this: `npm i claude-devkit-cli` still runs specpipe + shows the nudge; new users
install `specpipe`. You only maintain `specpipe` from now on — the shim pulls the latest
specpipe 1.x automatically (re-publish the shim only if specpipe goes to a new major).

## Ongoing releases (specpipe only)

```bash
# bump cli/package.json version + update CHANGELOG.md
cd cli && npm publish
git tag vX.Y.Z && git push github vX.Y.Z
```

CI (test matrix + lint) must be green before publishing.
