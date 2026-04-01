#!/usr/bin/env node
// glob-guard.js — PreToolUse hook for Claude Code
//
// Blocks overly broad glob patterns (e.g. **/*.ts at project root) that would
// return thousands of files and fill the context window. Suggests scoped
// alternatives instead.
//
// Blocking: Yes — exits 2 when a broad pattern at a high-level path is detected.
// Event: PreToolUse on Glob

"use strict";

const fs = require("fs");

// Patterns that match too many files when run at project root
const BROAD_PATTERNS = [
  /^\*\*$/,                   // **
  /^\*$/,                     // *
  /^\*\*\/\*$/,               // **/*
  /^\*\.\w+$/,                // *.ts, *.js
  /^\*\.\{[^}]+\}$/,          // *.{ts,js}
  /^\*\*\/\*\.\w+$/,          // **/*.ts
  /^\*\*\/\*\.\{[^}]+\}$/,    // **/*.{ts,tsx}
  /^\*\*\/\.\*$/,             // **/.* (all dotfiles)
];

// Directories that indicate an intentional, scoped search
const SCOPED_DIRS = [
  "src", "lib", "app", "apps", "packages", "components", "pages",
  "api", "server", "client", "web", "mobile", "shared", "common",
  "utils", "helpers", "services", "hooks", "store", "routes",
  "models", "controllers", "views", "tests", "__tests__", "spec",
  "Sources", "Tests", "cmd", "pkg", "internal",
];

function isBroadPattern(pattern) {
  if (!pattern) return false;
  return BROAD_PATTERNS.some((re) => re.test(pattern.trim()));
}

function startsWithScopedDir(pattern) {
  if (!pattern) return false;
  // Only allow dirs explicitly in SCOPED_DIRS — not arbitrary dirs like node_modules/
  return SCOPED_DIRS.some(
    (d) => pattern.startsWith(d + "/") || pattern.startsWith("./" + d + "/")
  );
}

function isRootLevel(basePath) {
  if (!basePath) return true;
  const norm = basePath.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!norm || norm === ".") return true;
  const segments = norm.split("/").filter((s) => s && s !== ".");
  if (segments.length === 0) return true;
  if (segments.length === 1 && !SCOPED_DIRS.includes(segments[0])) return true;
  return false;
}

function suggest(pattern) {
  let ext = "";
  const m = pattern.match(/\*\.(\{[^}]+\}|\w+)$/);
  if (m) ext = m[1];
  const dirs = ["src", "lib", "app", "tests"];
  return ext
    ? dirs.map((d) => `${d}/**/*.${ext}`).slice(0, 3)
    : dirs.map((d) => `${d}/**/*`).slice(0, 3);
}

function main() {
  let input;
  try { input = fs.readFileSync(0, "utf-8").trim(); } catch { process.exit(0); }
  if (!input) process.exit(0);

  let payload;
  try { payload = JSON.parse(input); } catch { process.exit(0); }

  const pattern = payload.tool_input?.pattern;
  const basePath = payload.tool_input?.path;

  if (!pattern) process.exit(0);
  if (startsWithScopedDir(pattern)) process.exit(0);
  if (!isBroadPattern(pattern)) process.exit(0);
  if (!isRootLevel(basePath)) process.exit(0);

  const alt = suggest(pattern);
  process.stderr.write(
    [
      `Blocked: '${pattern}' is too broad for ${basePath || "project root"} — would fill the context window.`,
      "Use a scoped pattern instead:",
      ...alt.map((s) => `  - ${s}`),
    ].join("\n") + "\n"
  );
  process.exit(2);
}

try { main(); } catch { process.exit(0); }
