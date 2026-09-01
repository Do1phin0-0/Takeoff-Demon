const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "takeoff-reflexion-test-"));
process.env.UPLOAD_DIR = uploadDir;
process.env.ANTHROPIC_API_KEY = crypto.randomBytes(16).toString("hex");
delete process.env.AUTH_USERNAME;
delete process.env.AUTH_PASSWORD;

// Same shared-prototype technique as contracts-integration.test.js: responses
// are served from a queue so each test scripts an exact call sequence.
const messagesProto = Object.getPrototypeOf(new Anthropic({ apiKey: "probe" }).messages);
let responseQueue = [];
let callCount = 0;
let lastParams;
messagesProto.create = async (params) => {
  callCount += 1;
  lastParams = params;
  if (responseQueue.length === 0) throw new Error("test response queue is empty");
  return responseQueue.shift();
};

const request = require("supertest");
const app = require("../server.js");
const { runWithReflexion, HARD_MAX_REFLECTIONS } = require("../agent/reflexion");

after(() => fs.rmSync(uploadDir, { recursive: true, force: true }));

const VALID_SUMMARY = [
  "1. What this set shows: one uploaded plan image (plan.png) representing a small tenant-improvement floor area.",
  "2. Key materials and quantities: no measurable quantities are visible at this resolution.",
  "3. Notable scope items or trades: general construction only; nothing trade-specific is identifiable.",
  "4. Assumptions and caveats: the sheet is low-resolution; every statement above requires field verification.",
].join("\n");

function textResponse(text) {
  return { content: [{ type: "text", text }] };
}

// Critic unit coverage lives in test/critic.test.js; this file covers the
// reflexion loop itself and its end-to-end wiring through /upload.

// --- Reflexion loop (pure, injected fakes) ---

test("reflexion returns immediately when the initial output passes, never calling reflect", async () => {
  let reflectCalls = 0;
  const result = await runWithReflexion({
    initial: "good",
    critique: () => [],
    reflect: async () => {
      reflectCalls += 1;
      return "unused";
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.repaired, false);
  assert.equal(result.attempts, 0);
  assert.equal(reflectCalls, 0);
});

test("reflexion repairs on the first attempt and reports repaired:true", async () => {
  const result = await runWithReflexion({
    initial: "bad",
    critique: (out) => (out === "good" ? [] : [{ code: "bad", message: "output is bad" }]),
    reflect: async () => "good",
  });
  assert.equal(result.ok, true);
  assert.equal(result.repaired, true);
  assert.equal(result.attempts, 1);
  assert.equal(result.output, "good");
});

test("reflexion terminates at the hard cap of 2 even when asked for more", async () => {
  let reflectCalls = 0;
  const events = [];
  const result = await runWithReflexion({
    initial: "bad",
    critique: () => [{ code: "always", message: "never passes" }],
    reflect: async () => {
      reflectCalls += 1;
      return "still bad";
    },
    maxReflections: 99,
    onEvent: (type) => events.push(type),
  });
  assert.equal(HARD_MAX_REFLECTIONS, 2);
  assert.equal(reflectCalls, 2, "the hard cap must clamp caller-supplied limits");
  assert.equal(result.ok, false);
  assert.equal(result.exhausted, true);
  assert.ok(events.includes("reflexion_exhausted"));
});

test("a throwing reflect ends the loop as exhausted with the error preserved", async () => {
  const result = await runWithReflexion({
    initial: "bad",
    critique: () => [{ code: "bad", message: "output is bad" }],
    reflect: async () => {
      throw new Error("upstream down");
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.exhausted, true);
  assert.equal(result.reflectError.message, "upstream down");
  assert.equal(result.output, "bad", "the last output survives a reflect failure");
});

// --- Integration: analyzeBatch self-repair through /upload ---

test("an invalid AI summary is repaired through one reflection call", async () => {
  callCount = 0;
  responseQueue = [textResponse("looks good"), textResponse(VALID_SUMMARY)];

  const res = await request(app)
    .post("/upload")
    .attach("files", Buffer.from("fake png bytes"), { filename: "plan.png", contentType: "image/png" });

  assert.equal(res.status, 200);
  assert.equal(res.body.analysis.status, "ok");
  assert.equal(res.body.analysis.text, VALID_SUMMARY);
  assert.equal(res.body.analysis.repaired, true);
  assert.equal(res.body.analysis.criticIssues, undefined);
  assert.equal(callCount, 2, "one summary call + one reflection call");
});

test("a summary that never passes is returned flagged with criticIssues after exactly 2 reflections", async () => {
  callCount = 0;
  responseQueue = [textResponse("junk"), textResponse("more junk"), textResponse("final junk")];

  const res = await request(app)
    .post("/upload")
    .attach("files", Buffer.from("fake png bytes"), { filename: "plan.png", contentType: "image/png" });

  assert.equal(res.status, 200);
  assert.equal(res.body.analysis.status, "ok");
  assert.equal(res.body.analysis.text, "final junk");
  assert.ok(Array.isArray(res.body.analysis.criticIssues) && res.body.analysis.criticIssues.length > 0);
  assert.equal(res.body.analysis.repaired, undefined);
  assert.equal(callCount, 3, "1 initial + hard cap of 2 reflections, then stop");
});

test("an empty first summary is replayed as a placeholder, never an empty assistant text block", async () => {
  callCount = 0;
  responseQueue = [textResponse(""), textResponse(VALID_SUMMARY)];

  const res = await request(app)
    .post("/upload")
    .attach("files", Buffer.from("fake png bytes"), { filename: "plan.png", contentType: "image/png" });

  assert.equal(res.status, 200);
  assert.equal(res.body.analysis.repaired, true);
  // The reflection request's assistant turn must carry the placeholder — the
  // API rejects text blocks shorter than 1 character.
  const assistantTurn = lastParams.messages.find((m) => m.role === "assistant");
  assert.equal(assistantTurn.content[0].text, "(no summary was produced)");
});
