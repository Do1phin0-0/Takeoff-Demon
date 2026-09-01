const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createTraceSession, readTrace } = require("../lib/trace");
const { runWithFeedback, parseArgs } = require("../agent/run-feedback");

function tmpTraceDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "trace-test-"));
}

test("trace session writes well-formed JSONL with monotonic seq", () => {
  const dir = tmpTraceDir();
  const session = createTraceSession({ dir, phase: "unit-test" });
  session.record("thought", { text: "first" });
  session.record("action", { text: "second" });
  session.record("observation", { text: "third" });

  const events = readTrace(session.filePath);
  assert.strictEqual(events.length, 3);
  assert.deepStrictEqual(events.map((e) => e.seq), [0, 1, 2]);
  assert.deepStrictEqual(events.map((e) => e.type), ["thought", "action", "observation"]);
  for (const e of events) {
    assert.strictEqual(e.sessionId, session.sessionId);
    assert.strictEqual(e.phase, "unit-test");
    assert.ok(!Number.isNaN(Date.parse(e.ts)), "ts must be a valid ISO timestamp");
  }
});

test("readTrace skips a torn final line instead of failing", () => {
  const dir = tmpTraceDir();
  const session = createTraceSession({ dir });
  session.record("thought", { text: "complete" });
  fs.appendFileSync(session.filePath, '{"ts":"2026-01-01T00:00:00Z","seq":1,"ty'); // torn write

  const events = readTrace(session.filePath);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].payload.text, "complete");
});

test("runWithFeedback captures exit code 0 and stdout of a passing command", () => {
  const dir = tmpTraceDir();
  const { event, result } = runWithFeedback(
    [process.execPath, "-e", "console.log('ok-from-child')"],
    { label: "pass-case", traceDir: dir }
  );
  assert.strictEqual(result.status, 0);
  assert.strictEqual(event.payload.exitCode, 0);
  assert.strictEqual(event.payload.label, "pass-case");
  assert.match(event.payload.stdout, /ok-from-child/);
  assert.ok(event.payload.durationMs >= 0);
});

test("runWithFeedback preserves a nonzero exit code and stderr of a failing command", () => {
  const dir = tmpTraceDir();
  const { event, result } = runWithFeedback(
    [process.execPath, "-e", "console.error('boom-from-child'); process.exit(3)"],
    { label: "fail-case", traceDir: dir }
  );
  assert.strictEqual(result.status, 3);
  assert.strictEqual(event.payload.exitCode, 3);
  assert.match(event.payload.stderr, /boom-from-child/);
});

test("parseArgs splits flags from the command at -- and without it", () => {
  assert.deepStrictEqual(parseArgs(["--label", "x", "--", "npm", "test"]), {
    opts: { label: "x", sessionId: null },
    command: ["npm", "test"],
  });
  assert.deepStrictEqual(parseArgs(["node", "-e", "1"]), {
    opts: { label: null, sessionId: null },
    command: ["node", "-e", "1"],
  });
});

test("parseArgs rejects a flag with a missing or flag-like value", () => {
  assert.throws(() => parseArgs(["--label", "--", "npm", "test"]), /--label requires a value/);
  assert.throws(() => parseArgs(["--session", "--label", "x", "cmd"]), /--session requires a value/);
  assert.throws(() => parseArgs(["--label"]), /--label requires a value/);
});

test("reusing a sessionId resumes seq from the existing file instead of restarting at 0", () => {
  const dir = tmpTraceDir();
  const first = createTraceSession({ dir, sessionId: "shared" });
  first.record("thought", { text: "one" });
  first.record("thought", { text: "two" });
  const second = createTraceSession({ dir, sessionId: "shared" });
  second.record("thought", { text: "three" });

  const events = readTrace(second.filePath);
  assert.deepStrictEqual(events.map((e) => e.seq), [0, 1, 2]);
});

test("resuming a session after a torn final line preserves the first new event", () => {
  const dir = tmpTraceDir();
  const first = createTraceSession({ dir, sessionId: "torn" });
  first.record("thought", { text: "complete" });
  // Crash mid-append: partial line, no trailing newline.
  fs.appendFileSync(first.filePath, '{"ts":"2026-01-01T00:00:00Z","seq":1,"ty');

  const second = createTraceSession({ dir, sessionId: "torn" });
  const evt = second.record("thought", { text: "survivor" });

  const events = readTrace(second.filePath);
  assert.strictEqual(events.length, 2, "the new event must not concatenate onto the torn line");
  assert.deepStrictEqual(events.map((e) => e.payload.text), ["complete", "survivor"]);
  assert.strictEqual(evt.seq, 1);
});

test("sessionId with NTFS-invalid or path characters is sanitized into the filename", () => {
  const dir = tmpTraceDir();
  const session = createTraceSession({ dir, sessionId: "2026-08-28T10:00:00Z" });
  session.record("thought", { text: "sanitized" });
  assert.strictEqual(session.sessionId, "2026-08-28T10-00-00Z");
  assert.strictEqual(path.dirname(session.filePath), dir);
  assert.strictEqual(readTrace(session.filePath).length, 1);

  const traversal = createTraceSession({ dir, sessionId: "../../escape" });
  traversal.record("thought", { text: "contained" });
  assert.strictEqual(path.dirname(traversal.filePath), dir);
});

test("a child writing more than 1 MiB of output completes instead of dying on ENOBUFS", () => {
  const dir = tmpTraceDir();
  const { event, result } = runWithFeedback(
    [process.execPath, "-e", "process.stdout.write('x'.repeat(2 * 1024 * 1024)); console.error('done')"],
    { label: "big-output", traceDir: dir }
  );
  assert.strictEqual(result.status, 0);
  assert.strictEqual(event.payload.exitCode, 0);
  assert.strictEqual(event.payload.spawnError, null);
});

test("a trace-write failure surfaces as traceError without masking the child's result", () => {
  const dir = tmpTraceDir();
  // Pre-create a DIRECTORY at the trace file's path so appendFileSync throws.
  fs.mkdirSync(path.join(dir, "blocked.jsonl"));
  const { event, result, traceError } = runWithFeedback(
    [process.execPath, "-e", "console.log('child-ok')"],
    { sessionId: "blocked", traceDir: dir }
  );
  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /child-ok/);
  assert.strictEqual(event, null);
  assert.ok(traceError, "traceError must be set when the trace write fails");
});

test("win32 shell fallback preserves args with spaces and metacharacters through a real .cmd shim", { skip: process.platform !== "win32" }, () => {
  const dir = tmpTraceDir();
  // A .cmd shim that echoes its first arg — stand-in for npm.cmd. Placed on
  // PATH via a temp dir so the bare name takes the ENOENT->resolve fallback.
  const shimDir = fs.mkdtempSync(path.join(os.tmpdir(), "shim-"));
  // %1 (not %~1): stripping the quotes would re-expose & and > to cmd.exe
  // inside the shim itself, which is not what this test measures.
  fs.writeFileSync(path.join(shimDir, "trace-test-shim.cmd"), "@echo off\r\necho arg1=[%1]\r\n");
  const originalPath = process.env.PATH;
  process.env.PATH = `${shimDir};${originalPath}`;
  try {
    const tricky = "Plan & Spec > v2.pdf";
    const { event, result } = runWithFeedback(["trace-test-shim", tricky], { traceDir: dir });
    assert.strictEqual(result.status, 0);
    assert.strictEqual(event.payload.usedShellFallback, true);
    assert.match(result.stdout, /arg1=\["Plan & Spec > v2\.pdf"\]/);
  } finally {
    process.env.PATH = originalPath;
  }
});

test("createTraceSession prunes trace files beyond the retention cap, newest kept", () => {
  const dir = tmpTraceDir();
  // MAX_TRACE_FILES defaults to 30; create 32 with distinct mtimes.
  for (let i = 0; i < 32; i++) {
    const f = path.join(dir, `old-${String(i).padStart(2, "0")}.jsonl`);
    fs.writeFileSync(f, "{}\n");
    fs.utimesSync(f, new Date(), new Date(Date.now() - (32 - i) * 60000));
  }
  const session = createTraceSession({ dir, sessionId: "fresh" });
  session.record("thought", { text: "hello" });

  const remaining = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort();
  assert.ok(remaining.includes("fresh.jsonl"));
  // The two oldest (old-00, old-01) must be gone; newest survivors remain.
  assert.ok(!remaining.includes("old-00.jsonl"));
  assert.ok(!remaining.includes("old-01.jsonl"));
  assert.ok(remaining.includes("old-31.jsonl"));
});

test("secret env values are redacted from captured output", () => {
  const dir = tmpTraceDir();
  const original = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "sk-test-secret-value-123456";
  try {
    const { event } = runWithFeedback(
      [process.execPath, "-e", "console.log('key is ' + process.env.ANTHROPIC_API_KEY)"],
      { label: "secret-case", traceDir: dir }
    );
    assert.match(event.payload.stdout, /\[redacted:ANTHROPIC_API_KEY\]/);
    assert.ok(!event.payload.stdout.includes("sk-test-secret-value-123456"));
  } finally {
    if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = original;
  }
});

test("a secret straddling the truncation boundary leaves no fragment in the trace", () => {
  const dir = tmpTraceDir();
  const original = process.env.ANTHROPIC_API_KEY;
  const secret = "sk-test-straddle-secret-abcdef0123456789";
  process.env.ANTHROPIC_API_KEY = secret;
  try {
    // Pad after the secret so the 200KB tail cut lands mid-secret: redaction
    // must run on the full stream first, or the surviving suffix leaks.
    const padAfter = 200 * 1024 - Math.floor(secret.length / 2);
    const { event } = runWithFeedback(
      [
        process.execPath,
        "-e",
        `process.stdout.write("x".repeat(1000) + process.env.ANTHROPIC_API_KEY + "y".repeat(${padAfter}))`,
      ],
      { label: "straddle-case", traceDir: dir }
    );
    assert.ok(
      !event.payload.stdout.includes(secret.slice(-8)),
      "no suffix of the secret may survive truncation"
    );
  } finally {
    if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = original;
  }
});
