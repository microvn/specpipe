# Security Policy

## Scope

specpipe is a local CLI that writes skill/config files into your project and runs
shell/Node hooks **on your own machine** under your agent. It has no network service.
The security surface is: the installed hook scripts, the files written on `init`/`upgrade`,
and the npm package supply chain.

## Reporting a vulnerability

Please **do not open a public issue** for a security vulnerability.

Email **microvn.gm@gmail.com** with:
- a description of the issue and its impact,
- steps to reproduce (or a proof of concept),
- affected version (`specpipe --version`) and OS.

You'll get an acknowledgement within a few days. Once a fix ships, we'll credit you in
the release notes unless you prefer to stay anonymous.

## Supported versions

The latest published `specpipe` release receives security fixes. Older versions do not.

## Hardening notes

- The kit's own guard hooks (path/sensitive/comment guards) block reading `.env`, keys,
  and credentials, and refuse to overwrite files outside the install target. Review
  `.claude/settings.json` after install to see exactly what is wired.
- `init` never executes arbitrary remote code; it copies/emits files from the package.
