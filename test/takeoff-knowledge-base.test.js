const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "takeoff-knowledge-test-"));
process.env.UPLOAD_DIR = uploadDir;
process.env.ANTHROPIC_API_KEY = require("crypto").randomBytes(16).toString("hex");
delete process.env.AUTH_USERNAME;
delete process.env.AUTH_PASSWORD;

// See test/contracts-integration.test.js for why patching the shared Messages
// prototype intercepts the client server.js builds internally.
const messagesProto = Object.getPrototypeOf(new Anthropic({ apiKey: "probe" }).messages);
let lastCallArgs;
messagesProto.create = async (params) => {
  lastCallArgs = params;
  return { content: [{ type: "text", text: "Summary." }] };
};

const request = require("supertest");
const app = require("../server.js");

after(() => fs.rmSync(uploadDir, { recursive: true, force: true }));

const KNOWLEDGE_FILE_MARKERS = {
  "blueprint-reading.md": "Blueprint Reading Guide",
  "easily-missed.md": "Easily Missed Master Checklist",
  "price-list.md": "Built-In Price List",
  "production-rates.md": "Production Rates for Should-Cost",
  "trade-scopes.md": "Trade Scope Reference",
};

test("POST /upload sends a system prompt carrying content from all five knowledge/ files, cached", async () => {
  const res = await request(app)
    .post("/upload")
    .attach("files", Buffer.from("fake png bytes"), {
      filename: "plan.png",
      contentType: "image/png",
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.analysis.status, "ok");

  assert.ok(Array.isArray(lastCallArgs.system), "system prompt should be sent as a block array");
  const [knowledgeBlock, taskBlock] = lastCallArgs.system;

  for (const [file, marker] of Object.entries(KNOWLEDGE_FILE_MARKERS)) {
    assert.match(knowledgeBlock.text, new RegExp(marker), `knowledge block should include content from ${file}`);
  }
  assert.deepEqual(knowledgeBlock.cache_control, { type: "ephemeral" });

  assert.match(taskBlock.text, /construction estimator/i);
  assert.equal(taskBlock.cache_control, undefined, "only the knowledge block should carry a cache breakpoint");
});
