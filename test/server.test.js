const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "takeoff-test-"));
process.env.UPLOAD_DIR = uploadDir;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.AUTH_USERNAME;
delete process.env.AUTH_PASSWORD;

const request = require("supertest");
const app = require("../server.js");

after(() => fs.rmSync(uploadDir, { recursive: true, force: true }));

test("GET /health returns ok", async () => {
  const res = await request(app).get("/health");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
});

test("POST /upload rejects disallowed file types", async () => {
  const res = await request(app)
    .post("/upload")
    .attach("files", Buffer.from("not a real executable"), "malware.exe");
  assert.equal(res.status, 400);
  assert.match(res.body.error, /not allowed/);
});

test("POST /upload skips AI analysis without ANTHROPIC_API_KEY, and the batch shows up in /files", async () => {
  const uploadRes = await request(app)
    .post("/upload")
    .attach("files", Buffer.from("fake png bytes"), {
      filename: "plan.png",
      contentType: "image/png",
    });
  assert.equal(uploadRes.status, 200);
  assert.equal(uploadRes.body.analysis.status, "skipped");
  assert.match(uploadRes.body.analysis.reason, /ANTHROPIC_API_KEY/);
  assert.equal(uploadRes.body.files.length, 1);
  assert.equal(uploadRes.body.files[0].originalName, "plan.png");

  const filesRes = await request(app).get("/files");
  assert.equal(filesRes.status, 200);
  const found = filesRes.body.batches.find((b) => b.id === uploadRes.body.id);
  assert.ok(found, "uploaded batch should appear in history");
});
