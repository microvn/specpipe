#!/usr/bin/env node
// Redirect shim — `claude-devkit-cli` was renamed to `agentpipe`.
// Keeps existing installs working: runs agentpipe's CLI under the old command name,
// and nudges users to install the new package. agentpipe is a dependency, so this
// always runs the latest agentpipe 1.x without re-publishing this shim.
console.error(
  '\x1b[33m⚠ claude-devkit-cli has been renamed to "agentpipe".\x1b[0m\n' +
  '  Switch when convenient:  npm i -g agentpipe   (then use `agentpipe` / `ap`)\n',
);

import('agentpipe/bin/devkit.js').catch((err) => {
  console.error('Could not load agentpipe. Install it directly:  npm i -g agentpipe');
  console.error(String(err && err.message ? err.message : err));
  process.exit(1);
});
