const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "takeoff-error-test-"));
process.env.UPLOAD_DIR = uploadDir;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.AUTH_USERNAME;
delete process.env.AUTH_PASSWORD;

const request = require("supertest");
const app = require("../server.js");

after(() => fs.rmSync(uploadDir, { recursive: true, force: true }));

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG.toString("base64")}`;

async function uploadOneFile() {
  const res = await request(app)
    .post("/upload")
    .attach("files", Buffer.from("fake png bytes"), { filename: "plan.png", contentType: "image/png" });
  return res.body.files[0].storedName;
}

test("unknown routes return JSON 404, not Express's default HTML error page", async () => {
  const res = await request(app).get("/this-route-does-not-exist");
  assert.equal(res.status, 404);
  assert.match(res.headers["content-type"], /json/);
  assert.equal(res.body.error, "Not found.");
});

test("GET /files/:batchId/:storedName returns JSON 404 if the manifest entry outlives its file on disk", async () => {
  const storedName = await uploadOneFile();
  const filesRes = await request(app).get("/files");
  const batch = filesRes.body.batches.find((b) => b.files.some((f) => f.storedName === storedName));

  // Simulate the file having been removed from disk out-of-band while the
  // in-memory/manifest record still references it.
  fs.unlinkSync(path.join(uploadDir, storedName));

  const res = await request(app).get(`/files/${batch.id}/${storedName}`);
  assert.equal(res.status, 404);
  assert.match(res.headers["content-type"], /json/);
  assert.equal(res.body.error, "File is recorded but missing from disk.");
});

test("POST /api/takeoffs returns a JSON 507 (not an uncaught exception) when the markup proof can't be written to disk", async () => {
  const fileName = await uploadOneFile();

  // Simulate a full/unwritable disk without actually filling one: point the
  // markups directory at a path that can't be written to.
  const markupDir = path.join(uploadDir, "markups");
  fs.rmSync(markupDir, { recursive: true, force: true });
  fs.writeFileSync(markupDir, ""); // a file where a directory is expected -> ENOTDIR on write

  const res = await request(app)
    .post("/api/takeoffs")
    .send({
      fileName,
      quantityType: "square_footage",
      scale: { pixelDistance: 100, realDistance: 10, unit: "ft" },
      polygon: [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 200, y: 200 },
        { x: 0, y: 200 },
      ],
      markupImage: TINY_PNG_DATA_URL,
      canvasWidth: 1000,
      canvasHeight: 1000,
    });

  assert.equal(res.status, 507);
  assert.match(res.headers["content-type"], /json/);
  assert.ok(res.body.error);

  // Restore so any later tests in the same process/dir aren't affected.
  fs.rmSync(markupDir, { force: true });
  fs.mkdirSync(markupDir, { recursive: true });
});
