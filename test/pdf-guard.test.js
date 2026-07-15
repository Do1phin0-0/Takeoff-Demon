const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument } = require("pdf-lib");
const Anthropic = require("@anthropic-ai/sdk");

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "takeoff-pdf-guard-test-"));
process.env.UPLOAD_DIR = uploadDir;
process.env.ANTHROPIC_API_KEY = crypto.randomBytes(16).toString("hex");
delete process.env.AUTH_USERNAME;
delete process.env.AUTH_PASSWORD;

// Same technique as contracts-integration.test.js: the SDK's Messages prototype
// is shared across every `new Anthropic()` instance in this process, so patching
// it here also intercepts the client server.js builds internally.
const messagesProto = Object.getPrototypeOf(new Anthropic({ apiKey: "probe" }).messages);
let callCount = 0;
messagesProto.create = async () => {
  callCount += 1;
  return { content: [{ type: "text", text: "Takeoff summary." }] };
};

const request = require("supertest");
const app = require("../server.js");

after(() => fs.rmSync(uploadDir, { recursive: true, force: true }));

async function makePdf(pageCount) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage([200, 200]);
  return Buffer.from(await doc.save());
}

test("a normal PDF is sent to Claude for analysis", async () => {
  callCount = 0;
  const pdf = await makePdf(2);
  const res = await request(app)
    .post("/upload")
    .attach("files", pdf, { filename: "sheet.pdf", contentType: "application/pdf" });

  assert.equal(res.status, 200);
  assert.equal(res.body.analysis.status, "ok");
  assert.equal(callCount, 1);
});

test("a PDF over the 100-page limit is skipped before ever calling Claude", async () => {
  callCount = 0;
  const pdf = await makePdf(105);
  const res = await request(app)
    .post("/upload")
    .attach("files", pdf, { filename: "huge-bid-set.pdf", contentType: "application/pdf" });

  assert.equal(res.status, 200);
  assert.equal(res.body.analysis.status, "skipped");
  assert.equal(res.body.analysis.skippedFiles.length, 1);
  assert.match(res.body.analysis.skippedFiles[0].reason, /105 pages/);
  assert.match(res.body.analysis.skippedFiles[0].reason, /100-page limit/);
  assert.equal(callCount, 0, "Claude should never be called for a file we already know is too big");
});

test("a corrupted/unreadable PDF is skipped with a clear reason instead of crashing", async () => {
  callCount = 0;
  const garbage = Buffer.from("this is not actually a pdf, just bytes with a .pdf extension");
  const res = await request(app)
    .post("/upload")
    .attach("files", garbage, { filename: "corrupted.pdf", contentType: "application/pdf" });

  assert.equal(res.status, 200);
  assert.equal(res.body.analysis.status, "skipped");
  assert.match(res.body.analysis.skippedFiles[0].reason, /Could not read this PDF/);
  assert.equal(callCount, 0);
});
