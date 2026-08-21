const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, degrees } = require("pdf-lib");
const Anthropic = require("@anthropic-ai/sdk");
const sharp = require("sharp");

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

// ANSI E (34"x44" at 72pt/in) — the actual full sheet size of the BBD Grand
// Prairie set this app was verified against (see CLAUDE.md Section 8), versus
// the toy 200x200pt pages every other fixture in this file uses. Bluebeam
// exports are also typically flattened raster per sheet rather than live
// vector/text, so each page gets a real embedded image (via `sharp`, already
// a project dependency) instead of an empty content stream.
const ANSI_E_WIDTH = 2448;
const ANSI_E_HEIGHT = 3168;

async function makeArchitecturalPdf(pageCount, { rotate = 0 } = {}) {
  const doc = await PDFDocument.create();
  const thumbnail = await sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: 220, g: 220, b: 220 } },
  })
    .png()
    .toBuffer();
  const image = await doc.embedPng(thumbnail);
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([ANSI_E_WIDTH, ANSI_E_HEIGHT]);
    if (rotate) page.setRotation(degrees(rotate));
    page.drawImage(image, { x: 0, y: 0, width: ANSI_E_WIDTH, height: ANSI_E_HEIGHT });
  }
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

test("a full-size (ANSI E) multi-page architectural set with real raster content is sent to Claude for analysis", async () => {
  callCount = 0;
  // 23 pages to match the actual sheet count of the BBD Grand Prairie set
  // this app was manually verified against.
  const pdf = await makeArchitecturalPdf(23);
  const res = await request(app)
    .post("/upload")
    .attach("files", pdf, { filename: "bid-set.pdf", contentType: "application/pdf" });

  assert.equal(res.status, 200);
  assert.equal(res.body.analysis.status, "ok");
  assert.equal(callCount, 1);
});

test("a rotated landscape architectural sheet doesn't break the page-count guard", async () => {
  callCount = 0;
  // Bluebeam-exported floor-plan sheets are commonly landscape via a
  // /Rotate entry rather than swapped page dimensions.
  const pdf = await makeArchitecturalPdf(3, { rotate: 90 });
  const res = await request(app)
    .post("/upload")
    .attach("files", pdf, { filename: "floor-plan.pdf", contentType: "application/pdf" });

  assert.equal(res.status, 200);
  assert.equal(res.body.analysis.status, "ok");
  assert.equal(callCount, 1);
});

test("a full-size architectural set over the 100-page limit is still skipped before calling Claude", async () => {
  callCount = 0;
  const pdf = await makeArchitecturalPdf(105);
  const res = await request(app)
    .post("/upload")
    .attach("files", pdf, { filename: "huge-real-bid-set.pdf", contentType: "application/pdf" });

  assert.equal(res.status, 200);
  assert.equal(res.body.analysis.status, "skipped");
  assert.match(res.body.analysis.skippedFiles[0].reason, /105 pages/);
  assert.equal(callCount, 0, "the page-count guard must trip on real sheet size/content too, not just toy pages");
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
