#!/usr/bin/env node
// comment-guard.js — PreToolUse hook for Claude Code
//
// Detects when an Edit would replace real code with placeholder comments like
// "// ... existing code ..." or "// rest of implementation". This is a
// common LLM failure mode where the model gets lazy and drops code.
//
// Blocking: Yes — exits 2 to reject the edit BEFORE it is applied.
// Event: PreToolUse on Edit|MultiEdit

"use strict";

const fs = require("fs");
const path = require("path");

// Patterns that indicate lazy placeholder comments (case-insensitive)
const PLACEHOLDER_PATTERNS = [
  /\/\/\s*\.{2,}\s*(existing|remaining|rest|previous|other|same|original)/i,
  /\/\/\s*\.{2,}\s*(code|implementation|logic|methods|functions|properties)/i,
  /\/\/\s*\[.*(?:remains?|unchanged|omitted|removed|truncated|collapsed).*\]/i,
  /\/\/\s*(?:unchanged|omitted|keep|stays?)\s*(?:as\s*(?:is|before))?/i,
  /\/\*\s*\.{2,}\s*\*\//,                          // /* ... */
  /#\s*\.{2,}\s*(existing|remaining|rest|previous)/i,  // Python: # ... existing
  /\/\/\s*TODO:?\s*implement/i,                     // // TODO: implement
  /\/\/\s*(?:add|put|insert)\s+.*\s+here/i,         // // add code here
  /\/\/\s*<\s*(?:your|actual)\s+/i,                 // // <your code>
  /pass\s*#\s*(?:TODO|placeholder|implement)/i,     // Python: pass # TODO
];

function isCommentLine(line) {
  const trimmed = line.trim();
  if (trimmed === "") return true; // blank lines are neutral
  if (trimmed.startsWith("//")) return true;
  if (trimmed.startsWith("#") && !trimmed.startsWith("#!")) return true;
  if (trimmed.startsWith("/*") || trimmed.startsWith("*") || trimmed.endsWith("*/")) return true;
  if (trimmed.startsWith("<!--")) return true;
  if (trimmed === "pass" || /^pass\s*#/.test(trimmed)) return true; // Python pass / pass # comment
  return false;
}

function getCodeLineCount(text) {
  if (!text) return 0;
  return text.split("\n").filter((line) => !isCommentLine(line)).length;
}

function hasPlaceholderPattern(text) {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text));
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

  // Skip files outside the project directory (e.g. ~/.claude/plans/)
  const filePath = payload.tool_input?.file_path;
  if (filePath) {
    const projectDir = process.cwd() + path.sep;
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(projectDir) && resolved !== process.cwd()) process.exit(0);
  }

  const oldStr = payload.tool_input?.old_string;
  const newStr = payload.tool_input?.new_string;

  // Only applies to Edit (not Write — Write creates new content)
  if (!oldStr || !newStr) process.exit(0);

  // If old content was already all comments, this is just editing comments — allow
  const oldCodeLines = getCodeLineCount(oldStr);
  if (oldCodeLines === 0) process.exit(0);

  // If new content has real code, allow (even if it also has comments)
  const newCodeLines = getCodeLineCount(newStr);
  if (newCodeLines > 0) process.exit(0);

  // At this point: old had code, new is all comments/blanks
  // Check if the new content contains placeholder patterns
  if (hasPlaceholderPattern(newStr)) {
    process.stderr.write(
      "Blocked: real code was replaced with placeholder comments. " +
      "Preserve the original code and make targeted changes instead.\n"
    );
    process.exit(2);
  }

  // New is all comments but no placeholder pattern — could be intentional
  // (e.g., replacing a code block with documentation comments)
  // Allow but only if the replacement is not drastically shorter
  const oldLines = oldStr.split("\n").length;
  const newLines = newStr.split("\n").length;

  if (newLines < oldLines * 0.3) {
    // Suspiciously shorter and all comments — likely lazy replacement
    process.stderr.write(
      "Blocked: code block was replaced with a much shorter comment-only block. " +
      "This looks like an accidental truncation. Preserve the original code.\n"
    );
    process.exit(2);
  }

  // Seems intentional
  process.exit(0);
}

try {
  main();
} catch {
  // Never crash — allow on error
  process.exit(0);
}
