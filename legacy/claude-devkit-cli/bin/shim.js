#!/usr/bin/env node
// Redirect shim — `claude-devkit-cli` was renamed to `specpipe`.
// Keeps existing installs working: runs specpipe's CLI under the old command name,
// and nudges users to install the new package. specpipe is a dependency, so this
// always runs the latest specpipe 1.x without re-publishing this shim.
console.error(
  '\x1b[33m⚠ claude-devkit-cli has been renamed to "specpipe".\x1b[0m\n' +
  '  Switch when convenient:  npm i -g specpipe   (then use `specpipe` / `sp`)\n',
);

import('specpipe/bin/devkit.js').catch((err) => {
  console.error('Could not load specpipe. Install it directly:  npm i -g specpipe');
  console.error(String(err && err.message ? err.message : err));
  process.exit(1);
});
