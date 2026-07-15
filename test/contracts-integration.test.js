const { test, after, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const JSZip = require("jszip");
const Anthropic = require("@anthropic-ai/sdk");

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "takeoff-contracts-integration-test-"));
process.env.UPLOAD_DIR = uploadDir;
process.env.ANTHROPIC_API_KEY = require("crypto").randomBytes(16).toString("hex");
delete process.env.AUTH_USERNAME;
delete process.env.AUTH_PASSWORD;

// The SDK's Messages prototype is shared across every `new Anthropic()` instance
// in this process, so patching it here also intercepts the client server.js builds
// internally — lets us drive the real /contracts/chat handler against a scripted
// response instead of the network, with no API key required.
const messagesProto = Object.getPrototypeOf(new Anthropic({ apiKey: "probe" }).messages);
let nextResponse;
let lastCallArgs;
messagesProto.create = async (params) => {
  lastCallArgs = params;
  return nextResponse;
};

const request = require("supertest");
const app = require("../server.js");

after(() => fs.rmSync(uploadDir, { recursive: true, force: true }));

const sampleFields = {
  subcontractor: {
    companyName: "Lone Star Plumbing LLC",
    address: "400 Main St, Houston, TX 77002",
    contactName: "Dana Reyes",
    phone: "713-555-0199",
    email: "dana@lonestarplumbing.com",
  },
  project: {
    number: "2",
    name: "Westside Retail Center",
    address: "900 Westheimer Rd, Houston, TX 77006",
    cityState: "Houston, TX",
    pmName: "Marcus Webb",
    pmPhone: "281-555-0100",
    pmEmail: "mwebb@ams-tx.com",
  },
  subcontractDate: "2026-07-15",
  retentionRatePercent: 10,
  plansAttached: true,
  specsAttached: false,
  specDate: "2026-06-01",
  scopeName: "Plumbing",
  scopeItems: [
    { packageName: "Plumbing Package", costCode: "15100", codeDescription: "Plumbing", amount: "$145,000.00" },
  ],
  scopeInclusions: "Permits, materials, install, testing/inspections, daily clean-up.",
  subcontractTotal: "$145,000.00",
};

test("mid-conversation: server relays Claude's text reply and doesn't generate a contract yet", async () => {
  nextResponse = {
    content: [{ type: "text", text: "What's the subcontractor's company name and address?" }],
  };

  const res = await request(app)
    .post("/contracts/chat")
    .send({ messages: [{ role: "user", text: "I need a plumbing subcontract for project 2" }] });

  assert.equal(res.status, 200);
  assert.equal(res.body.done, false);
  assert.equal(res.body.reply, "What's the subcontractor's company name and address?");

  // Verify the request we actually sent Claude carries the real AMS prompt and tool.
  assert.match(lastCallArgs.system, /AMS Construction/);
  assert.match(lastCallArgs.system, /finalize_subcontract/);
  assert.equal(lastCallArgs.tools[0].name, "finalize_subcontract");
  assert.equal(lastCallArgs.messages[0].role, "user");
  assert.equal(lastCallArgs.messages[0].content[0].text, "I need a plumbing subcontract for project 2");
});

test("tool call: server generates a real docx, persists it, and serves it back", async () => {
  nextResponse = {
    content: [
      { type: "tool_use", id: "toolu_01abc", name: "finalize_subcontract", input: sampleFields },
    ],
  };

  const res = await request(app)
    .post("/contracts/chat")
    .send({
      messages: [
        { role: "user", text: "I need a plumbing subcontract for project 2" },
        { role: "assistant", text: "What's the subcontractor's company name and address?" },
        { role: "user", text: "Lone Star Plumbing, 400 Main St Houston TX, total $145,000" },
      ],
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.done, true);
  assert.ok(res.body.contractId);
  assert.equal(res.body.downloadUrl, `/contracts/${res.body.contractId}/download`);
  assert.equal(res.body.fields.subcontractor.companyName, "Lone Star Plumbing LLC");

  // It should show up in history.
  const listRes = await request(app).get("/contracts");
  const listed = listRes.body.contracts.find((c) => c.id === res.body.contractId);
  assert.ok(listed, "generated contract should appear in GET /contracts");
  assert.equal(listed.subcontractorName, "Lone Star Plumbing LLC");
  assert.equal(listed.projectName, "Westside Retail Center");

  // And the actual downloaded file should be a real, correctly filled docx.
  // .buffer(true) forces supertest to return raw bytes in res.body — this docx
  // MIME type isn't in its default binary-type allowlist, so without it the
  // response lands in res.text instead.
  const downloadRes = await request(app).get(res.body.downloadUrl).buffer(true).parse((response, cb) => {
    const chunks = [];
    response.on("data", (chunk) => chunks.push(chunk));
    response.on("end", () => cb(null, Buffer.concat(chunks)));
  });
  assert.equal(downloadRes.status, 200);
  assert.equal(
    downloadRes.headers["content-type"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  const zip = await JSZip.loadAsync(downloadRes.body);
  const xml = await zip.file("word/document.xml").async("string");
  assert.match(xml, /Lone Star Plumbing LLC/);
  assert.match(xml, /2-SC-15100/);
  assert.equal(xml.match(/\[[A-Z][^[\]]*\]/g), null, "no unfilled placeholders should remain");
});

test("API error from Claude surfaces as a 502, not a crash", async () => {
  messagesProto.create = async () => {
    throw new Error("simulated upstream failure");
  };

  const res = await request(app)
    .post("/contracts/chat")
    .send({ messages: [{ role: "user", text: "hello" }] });

  assert.equal(res.status, 502);
  assert.match(res.body.error, /simulated upstream failure/);
});

test("a structured Anthropic API error surfaces its human-readable message, not the raw JSON body", async () => {
  // Mirrors the real shape Anthropic's SDK throws (see APIError in the SDK source):
  // a top-level error with a nested .error.message, which err.message would
  // otherwise stringify wholesale (e.g. `400 {"type":"error","error":{...}}`).
  messagesProto.create = async () => {
    const err = new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Could not process PDF"}}');
    err.error = { type: "error", error: { type: "invalid_request_error", message: "Could not process PDF" } };
    throw err;
  };

  const res = await request(app)
    .post("/contracts/chat")
    .send({ messages: [{ role: "user", text: "hello" }] });

  assert.equal(res.status, 502);
  assert.equal(res.body.error, "Could not process PDF");
});
