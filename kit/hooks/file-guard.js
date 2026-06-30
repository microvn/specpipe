#!/usr/bin/env node
// file-guard.js — PostToolUse hook for Claude Code
//
// Warns when a Write/Edit operation produces a source code file exceeding a line threshold.
// Only checks source code files — docs (.md), configs (.json/.yaml/.toml), and templates
// are intentionally excluded since they are naturally long.
// Non-blocking: always exits 0 and injects advisory context.
//
// Environment:
//   FILE_GUARD_THRESHOLD  — max lines before warning (default: 350)
//   FILE_GUARD_EXCLUDE    — comma-separated globs to skip (e.g. "*.generated.swift,*.pb.go")

"use strict";

const fs = require("fs");
const path = require("path");

const THRESHOLD = parseInt(process.env.FILE_GUARD_THRESHOLD, 10) || 350;

// Only warn for source code files — docs, configs, and templates are naturally long
const SOURCE_EXTENSIONS = new Set([
  // JavaScript / TypeScript
  ".js", ".mjs", ".cjs", ".jsx",
  ".ts", ".tsx", ".mts", ".cts",
  // Frontend frameworks
  ".vue", ".svelte", ".astro",
  // Python
  ".py", ".pyw", ".pyi", ".pyx", ".pxd",
  // PHP
  ".php", ".php3", ".php4", ".php5", ".php7", ".php8", ".phtml",
  // Ruby
  ".rb", ".rbw",
  // Rust
  ".rs",
  // Go
  ".go",
  // Swift
  ".swift",
  // Kotlin
  ".kt", ".kts",
  // Java
  ".java",
  // C#
  ".cs", ".csx",
  // C / C++
  ".c", ".h", ".cc", ".cpp", ".cxx", ".c++", ".hpp", ".hh", ".hxx", ".h++",
  // Objective-C
  ".m", ".mm",
  // Dart
  ".dart",
  // Elixir
  ".ex", ".exs",
  // Scala
  ".scala", ".sc",
  // Groovy
  ".groovy",
  // Clojure
  ".clj", ".cljs", ".cljc",
  // Haskell
  ".hs", ".lhs",
  // F#
  ".fs", ".fsx", ".fsi",
  // OCaml
  ".ml", ".mli", ".mll", ".mly",
  // Erlang
  ".erl", ".hrl",
  // Lua
  ".lua",
  // R
  ".r",
  // Julia
  ".jl",
  // Nim
  ".nim", ".nims",
  // Zig
  ".zig",
  // Crystal
  ".cr",
  // Perl
  ".pl", ".pm",
  // Solidity
  ".sol",
  // PowerShell
  ".ps1", ".psm1", ".psd1",
  // PureScript
  ".purs",
  // Elm
  ".elm",
  // ReScript / ReasonML
  ".res", ".resi",
  // Lisp / Scheme / Racket
  ".lisp", ".lsp", ".cl", ".el", ".scm", ".ss", ".rkt",
  // Prolog
  ".pro",
  // Fortran
  ".f", ".f90", ".f95", ".f03", ".f08",
  // Pascal / Delphi
  ".pas", ".pp",
  // VB.NET
  ".vb",
  // Arduino
  ".ino",
]);

const EXCLUDE = (process.env.FILE_GUARD_EXCLUDE || "")
  .split(",")
  .map((g) => g.trim())
  .filter(Boolean);

function matchesExclude(filePath) {
  const name = path.basename(filePath);
  return EXCLUDE.some((pattern) => {
    // Simple glob: *.ext or exact match
    if (pattern.startsWith("*")) {
      return name.endsWith(pattern.slice(1));
    }
    return name === pattern;
  });
}

function isBinary(buf) {
  // Check first 512 bytes for null bytes (common binary indicator)
  const check = buf.slice(0, 512);
  for (let i = 0; i < check.length; i++) {
    if (check[i] === 0) return true;
  }
  return false;
}

function main() {
  let input;
  try {
    input = fs.readFileSync(0, "utf-8").trim();
  } catch {
    process.exit(0);
  }

  if (!input) process.exit(0);

  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  const filePath = payload.tool_input?.file_path;
  if (!filePath) process.exit(0);

  // Cursor's generic postToolUse fires for EVERY tool (Read, Grep, Shell, …); only act
  // on writes/edits. Claude's PostToolUse matcher already restricts this, so tool_name is
  // either a write-ish name or absent there — both pass.
  const toolName = payload.tool_name;
  if (toolName && !/^(Write|Edit|MultiEdit|write_to_file|replace_file_content)/i.test(toolName)) process.exit(0);

  // Skip files outside the project directory (e.g. ~/.claude/plans/). Cursor passes the
  // project root in workspace_roots; otherwise fall back to cwd.
  const projectRoot = (Array.isArray(payload.workspace_roots) && payload.workspace_roots[0]) || process.cwd();
  const projectDir = projectRoot + path.sep;
  const resolvedFile = path.resolve(filePath);
  if (!resolvedFile.startsWith(projectDir) && resolvedFile !== projectRoot) process.exit(0);

  // Skip non-source-code files (docs, configs, templates are naturally long)
  const ext = path.extname(filePath).toLowerCase();
  if (!SOURCE_EXTENSIONS.has(ext)) process.exit(0);

  // Skip excluded patterns
  if (matchesExclude(filePath)) process.exit(0);

  // Skip if file doesn't exist (deleted?) or is a symlink to outside project
  try {
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink() || !stat.isFile()) process.exit(0);
  } catch {
    process.exit(0);
  }

  // Cap read at 1MB to avoid OOM on huge files
  const MAX_BYTES = 1024 * 1024;
  let content;
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_BYTES) {
      const rel = path.relative(projectRoot, filePath);
      emitWarning(`Warning: ${rel} is ${Math.round(stat.size / 1024)}KB. Consider splitting into smaller modules.`, payload);
      process.exit(0);
    }
    const buf = fs.readFileSync(filePath);
    if (isBinary(buf)) process.exit(0);
    content = buf.toString("utf-8");
  } catch {
    process.exit(0);
  }

  const lineCount = content.split("\n").length;
  if (lineCount <= THRESHOLD) process.exit(0);

  // Inject non-blocking warning
  const rel = path.relative(projectRoot, filePath);
  emitWarning(`Warning: ${rel} has ${lineCount} lines (threshold: ${THRESHOLD}). Consider splitting into smaller, focused modules.`, payload);
}

// Inject an advisory warning in the agent's native shape. Cursor's postToolUse reads
// `additional_context`; Claude (and Codex PostToolUse) read hookSpecificOutput.additionalContext.
function emitWarning(warning, payload) {
  if (payload.cursor_version || payload.hook_event_name === "postToolUse") {
    process.stdout.write(JSON.stringify({ additional_context: warning }) + "\n");
  } else {
    process.stdout.write(JSON.stringify({
      continue: true,
      hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: warning },
    }) + "\n");
  }
}

try {
  main();
} catch {
  // Never block on error
}
process.exit(0);
