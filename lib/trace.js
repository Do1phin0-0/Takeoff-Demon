const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Append-only JSONL reasoning/event traces, one file per session.
// Deliberately NOT makeJsonFileStore: that pattern rewrites the whole file on
// every append, which is fine for tens of takeoff records but wrong for an
// event stream. One JSON line per event keeps appends O(1) and lets a partial
// final line (crash mid-write) corrupt at most one event, not the whole log.
const DEFAULT_TRACE_DIR = path.join(__dirname, "..", "uploads", "data", "traces");
// Retention: traces live on the same bounded disk as uploads but sit outside
// the server's batch eviction, so each new session prunes the oldest files.
const MAX_TRACE_FILES = Number(process.env.MAX_TRACE_FILES) || 30;
const MAX_TRACE_BYTES = Number(process.env.MAX_TRACE_BYTES) || 50 * 1024 * 1024;

// Best-effort: pruning must never prevent a session from opening.
function pruneTraceDir(dir) {
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => {
        const filePath = path.join(dir, f);
        const stat = fs.statSync(filePath);
        return { filePath, mtimeMs: stat.mtimeMs, size: stat.size };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    let total = 0;
    files.forEach((f, i) => {
      total += f.size;
      if (i >= MAX_TRACE_FILES || total > MAX_TRACE_BYTES) {
        try {
          fs.unlinkSync(f.filePath);
        } catch {}
      }
    });
  } catch {}
}

function createTraceSession({ dir = DEFAULT_TRACE_DIR, sessionId, phase = null } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  pruneTraceDir(dir);
  // Sanitize rather than trust: ISO-timestamp ids contain colons (invalid on
  // NTFS), and path separators must never reach the filename.
  const rawId = sessionId || `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const id = String(rawId).replace(/[^A-Za-z0-9._-]/g, "-");
  const filePath = path.join(dir, `${id}.jsonl`);
  // Reusing a sessionId appends to its existing file, so the counter must
  // resume where the file left off or (sessionId, seq) stops being unique.
  let seq = 0;
  if (fs.existsSync(filePath)) {
    const prior = readTrace(filePath);
    if (prior.length > 0) {
      const last = prior[prior.length - 1].seq;
      seq = Number.isFinite(last) ? last + 1 : prior.length;
    }
    // A crash mid-append can leave a torn final line with no trailing newline;
    // terminate it now, or the first new event would concatenate onto it and
    // both would be lost to readTrace instead of just the torn fragment.
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      if (raw.length > 0 && !raw.endsWith("\n")) fs.appendFileSync(filePath, "\n");
    } catch {}
  }

  function record(type, payload = {}) {
    const event = {
      ts: new Date().toISOString(),
      sessionId: id,
      seq: seq++,
      phase,
      type,
      payload,
    };
    fs.appendFileSync(filePath, JSON.stringify(event) + "\n");
    return event;
  }

  return { sessionId: id, filePath, record };
}

// Reads a trace file back as parsed events, skipping a torn final line.
function readTrace(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }
  const events = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // torn write — ignore the partial line rather than failing the whole read
    }
  }
  return events;
}

module.exports = { createTraceSession, readTrace, DEFAULT_TRACE_DIR };
