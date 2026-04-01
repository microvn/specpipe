#!/usr/bin/env node
// file-guard.js — PostToolUse hook for Claude Code
//
// Warns when a Write/Edit operation produces a file exceeding a line threshold.
// Non-blocking: always exits 0 and injects advisory context.
//
// Environment:
//   FILE_GUARD_THRESHOLD  — max lines before warning (default: 200)
//   FILE_GUARD_EXCLUDE    — comma-separated globs to skip (e.g. "*.generated.swift,*.pb.go")

"use strict";

const fs = require("fs");
const path = require("path");

const THRESHOLD = parseInt(process.env.FILE_GUARD_THRESHOLD, 10) || 200;
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
      // >1MB = definitely over threshold, warn without exact count
      const rel = path.relative(process.cwd(), filePath);
      process.stdout.write(JSON.stringify({
        continue: true,
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: `Warning: ${rel} is ${Math.round(stat.size / 1024)}KB. Consider splitting into smaller modules.`,
        },
      }));
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
  const rel = path.relative(process.cwd(), filePath);
  const warning = `Warning: ${rel} has ${lineCount} lines (threshold: ${THRESHOLD}). Consider splitting into smaller, focused modules.`;

  process.stdout.write(
    JSON.stringify({
      continue: true,
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: warning,
      },
    })
  );
}

try {
  main();
} catch {
  // Never block on error
}
process.exit(0);
