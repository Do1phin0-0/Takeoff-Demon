#!/usr/bin/env node
// Execution-feedback capture: run any command, record stdout/stderr/exit
// code/duration as a trace event, and exit with the child's own code.
//
//   node agent/run-feedback.js [--label <name>] [--session <id>] -- <cmd> [args...]
//
// Example: node agent/run-feedback.js --label test-suite -- npm test
//
// Lives in agent/ (not lib/) on purpose: this spawns processes and is agent
// tooling — it must never end up in the deployed server's require graph.
const { spawnSync } = require("child_process");
const { createTraceSession } = require("../lib/trace");

const MAX_CAPTURED_OUTPUT = 200 * 1024; // keep trace lines bounded
// Node's default maxBuffer (1 MiB/stream) kills verbose children with ENOBUFS
// before they finish; capture generously here, bound later via tail().
const SPAWN_MAX_BUFFER = 64 * 1024 * 1024;

// Captured output can echo credentials (API error dumps, env debug prints);
// traces persist in plaintext, so redact known secret values before recording.
const SECRET_ENV_VARS = ["ANTHROPIC_API_KEY", "AUTH_PASSWORD"];

function scrub(text) {
  let out = text || "";
  for (const name of SECRET_ENV_VARS) {
    const value = process.env[name];
    if (value && value.length >= 8) out = out.split(value).join(`[redacted:${name}]`);
  }
  return out;
}

function tail(text, limit = MAX_CAPTURED_OUTPUT) {
  if (!text) return "";
  return text.length > limit ? text.slice(-limit) : text;
}

// cmd.exe quoting for the Windows .cmd-shim fallback: double internal quotes
// and wrap each token, so spaces and metacharacters (&, |, >) stay literal.
function quoteForCmd(token) {
  return '"' + String(token).replace(/"/g, '""') + '"';
}

// Resolve a bare command name to an absolute Windows executable path via
// `where`. Quoting a BARE .cmd name breaks the shim's %~dp0 self-location
// (npm then hunts for its modules in the CWD), so the shell fallback must
// always invoke the shim by absolute path.
function resolveWindowsCommand(name) {
  const where = spawnSync("where", [name], { encoding: "utf8" });
  if (where.status !== 0 || !where.stdout) return null;
  const lines = where.stdout.split(/\r?\n/).filter((l) => l.trim());
  return lines.find((l) => /\.(exe|cmd|bat)$/i.test(l)) || lines[0] || null;
}

function spawnCapture(argv) {
  // No shell by default: cmd.exe concatenates args without escaping, which
  // mangles anything quoted (e.g. node -e "..."). Only fall back on Windows
  // when the command itself can't spawn (npm/npx are .cmd shims) — resolve
  // it to an absolute path, then run through cmd.exe with every token quoted.
  let result = spawnSync(argv[0], argv.slice(1), { encoding: "utf8", maxBuffer: SPAWN_MAX_BUFFER });
  let usedShellFallback = false;
  if (result.error && result.error.code === "ENOENT" && process.platform === "win32") {
    const resolved = resolveWindowsCommand(argv[0]);
    if (resolved && /\.exe$/i.test(resolved)) {
      // PATHEXT miss on a real executable — no shell needed at all.
      result = spawnSync(resolved, argv.slice(1), { encoding: "utf8", maxBuffer: SPAWN_MAX_BUFFER });
    } else if (resolved) {
      usedShellFallback = true;
      const cmdline = [resolved, ...argv.slice(1)].map(quoteForCmd).join(" ");
      result = spawnSync(cmdline, { encoding: "utf8", shell: true, maxBuffer: SPAWN_MAX_BUFFER });
    }
    // Unresolvable: keep the honest ENOENT result rather than guessing.
  }
  return { result, usedShellFallback };
}

function runWithFeedback(argv, { label = null, sessionId = null, traceDir = undefined } = {}) {
  if (!argv || argv.length === 0) {
    throw new Error("No command given. Usage: run-feedback.js [--label x] -- <cmd> [args...]");
  }
  const session = createTraceSession({ sessionId, dir: traceDir, phase: "execution-feedback" });
  const startedAt = Date.now();
  const { result, usedShellFallback } = spawnCapture(argv);
  const durationMs = Date.now() - startedAt;

  // A failed trace write must never mask the child's real result — the whole
  // point of this tool is faithful feedback, and the child already ran.
  let event = null;
  let traceError = null;
  try {
    event = session.record("command_result", {
      label,
      command: scrub(argv.join(" ")),
      exitCode: result.status,
      signal: result.signal || null,
      spawnError: result.error ? result.error.message : null,
      usedShellFallback,
      durationMs,
      // Redact BEFORE truncating: tail() can cut a secret mid-string at the
      // boundary, and the surviving suffix no longer matches scrub's search.
      // This order at worst truncates a [redacted:...] marker, never key bytes.
      stdout: tail(scrub(result.stdout)),
      stderr: tail(scrub(result.stderr)),
    });
  } catch (err) {
    traceError = err;
  }

  return { session, event, result, traceError };
}

function parseArgs(rawArgs) {
  const opts = { label: null, sessionId: null };
  let i = 0;
  while (i < rawArgs.length) {
    const arg = rawArgs[i];
    if (arg === "--") {
      return { opts, command: rawArgs.slice(i + 1) };
    }
    if (arg === "--label" || arg === "--session") {
      const value = rawArgs[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${arg} requires a value. Usage: run-feedback.js [--label x] [--session id] -- <cmd> [args...]`);
      }
      if (arg === "--label") opts.label = value;
      else opts.sessionId = value;
      i += 2;
      continue;
    }
    // first non-flag token starts the command (allows omitting "--")
    return { opts, command: rawArgs.slice(i) };
  }
  return { opts, command: [] };
}

if (require.main === module) {
  try {
    const { opts, command } = parseArgs(process.argv.slice(2));
    const { session, result, traceError } = runWithFeedback(command, opts);
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    if (traceError) {
      console.error(`[run-feedback] warning: trace write failed (${traceError.message}); command result is unaffected`);
    }
    const spawnNote = result.error ? ` spawnError=${result.error.message}` : "";
    console.error(`\n[run-feedback] exit=${result.status}${spawnNote} trace=${session.filePath}`);
    // exitCode (not process.exit) lets piped stdout flush before the process
    // ends — exit() can truncate a large relay mid-write on Windows.
    process.exitCode = result.status === null ? 1 : result.status;
  } catch (err) {
    console.error(`[run-feedback] ${err.message}`);
    process.exitCode = 2;
  }
}

module.exports = { runWithFeedback, parseArgs };
