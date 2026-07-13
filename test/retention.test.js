const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "takeoff-retention-test-"));
process.env.UPLOAD_DIR = uploadDir;
process.env.MAX_HISTORY_BATCHES = "2";
delete process.env.MAX_DISK_BYTES;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.AUTH_USERNAME;
delete process.env.AUTH_PASSWORD;

const request = require("supertest");
const app = require("../server.js");

after(() => fs.rmSync(uploadDir, { recursive: true, force: true }));

function uploadFile(name, contents) {
  return request(app)
    .post("/upload")
    .attach("files", Buffer.from(contents), { filename: name, contentType: "image/png" });
}

test("oldest batch is evicted and its stored file deleted once history exceeds MAX_HISTORY_BATCHES", async () => {
  const first = await uploadFile("one.png", "one");
  await uploadFile("two.png", "two");
  await uploadFile("three.png", "three");

  const filesRes = await request(app).get("/files");
  assert.equal(filesRes.body.batches.length, 2);
  assert.ok(!filesRes.body.batches.some((b) => b.id === first.body.id));

  const evictedPath = path.join(uploadDir, first.body.files[0].storedName);
  assert.equal(fs.existsSync(evictedPath), false);
});

test("GET /files/:batchId/:storedName serves the original file content", async () => {
  const uploaded = await uploadFile("sheet.png", "hello blueprint");
  const { id, files } = uploaded.body;

  const res = await request(app).get(`/files/${id}/${files[0].storedName}`);
  assert.equal(res.status, 200);
  assert.equal(Buffer.from(res.body).toString(), "hello blueprint");
});

test("GET /files/:batchId/:storedName 404s for an unknown batch or file", async () => {
  const res = await request(app).get("/files/nope/nope.png");
  assert.equal(res.status, 404);
});
