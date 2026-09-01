const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp");

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "takeoff-compare-test-"));
process.env.UPLOAD_DIR = uploadDir;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.AUTH_USERNAME;
delete process.env.AUTH_PASSWORD;

const request = require("supertest");
const app = require("../server.js");

after(() => fs.rmSync(uploadDir, { recursive: true, force: true }));

async function uploadOneFile() {
  const res = await request(app)
    .post("/upload")
    .attach("files", Buffer.from("fake png bytes"), { filename: "sheet.png", contentType: "image/png" });
  return res.body.files[0].storedName;
}

async function pngDataUrl(width, height, squareLeft, squareTop, squareSize, color) {
  const square = await sharp({ create: { width: squareSize, height: squareSize, channels: 3, background: color } })
    .png()
    .toBuffer();
  const buf = await sharp({ create: { width, height, channels: 3, background: "#ffffff" } })
    .composite([{ input: square, left: squareLeft, top: squareTop }])
    .png()
    .toBuffer();
  return `data:image/png;base64,${buf.toString("base64")}`;
}

async function comparePayload(overrides = {}) {
  const fileNameBefore = await uploadOneFile();
  const fileNameAfter = await uploadOneFile();
  return {
    fileNameBefore,
    imageBefore: await pngDataUrl(200, 150, 20, 20, 40, "#ff0000"),
    canvasWidthBefore: 200,
    canvasHeightBefore: 150,
    pointsBefore: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    fileNameAfter,
    imageAfter: await pngDataUrl(250, 200, 50, 30, 40, "#ff0000"),
    canvasWidthAfter: 250,
    canvasHeightAfter: 200,
    pointsAfter: [{ x: 30, y: 10 }, { x: 130, y: 10 }],
    note: "test comparison",
    ...overrides,
  };
}

test("POST /api/compare aligns the before image into the after frame and persists both", async () => {
  const payload = await comparePayload();
  const res = await request(app).post("/api/compare").send(payload);
  assert.equal(res.status, 201);
  assert.equal(res.body.canvasWidth, 250);
  assert.equal(res.body.canvasHeight, 200);
  assert.ok(res.body.alignedBeforeFileName);
  assert.ok(res.body.afterFileName);
  assert.ok(Math.abs(res.body.transform.scale - 1) < 1e-6);
  assert.deepEqual(res.body.warnings, []);
  assert.equal(res.body.aiSummary.status, "skipped");

  const alignedRes = await request(app).get(`/uploads/compare/${res.body.alignedBeforeFileName}`);
  assert.equal(alignedRes.status, 200);
  const meta = await sharp(alignedRes.body).metadata();
  assert.equal(meta.width, 250);
  assert.equal(meta.height, 200);

  const afterRes = await request(app).get(`/uploads/compare/${res.body.afterFileName}`);
  assert.equal(afterRes.status, 200);

  const listed = await request(app).get("/api/comparisons");
  assert.ok(listed.body.comparisons.some((c) => c.id === res.body.id));

  const single = await request(app).get(`/api/comparisons/${res.body.id}`);
  assert.equal(single.status, 200);
  assert.equal(single.body.note, "test comparison");
});

test("POST /api/compare flags an implausible alignment scale instead of silently accepting it", async () => {
  const payload = await comparePayload({
    pointsBefore: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    pointsAfter: [{ x: 0, y: 0 }, { x: 250, y: 0 }], // 2.5x scale between two pins on "the same sheet"
  });
  const res = await request(app).post("/api/compare").send(payload);
  assert.equal(res.status, 201);
  assert.ok(res.body.warnings.some((w) => w.includes("Alignment scale")));
});

test("POST /api/compare rejects when a point pair has fewer than 2 points", async () => {
  const payload = await comparePayload({ pointsBefore: [{ x: 0, y: 0 }] });
  const res = await request(app).post("/api/compare").send(payload);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /pointsBefore/);
});

test("POST /api/compare rejects two identical points on the same image", async () => {
  const payload = await comparePayload({ pointsBefore: [{ x: 5, y: 5 }, { x: 5, y: 5 }] });
  const res = await request(app).post("/api/compare").send(payload);
  assert.equal(res.status, 400);
});

test("POST /api/compare rejects a fileName that was never uploaded", async () => {
  const payload = await comparePayload({ fileNameBefore: "not-a-real-file.png" });
  const res = await request(app).post("/api/compare").send(payload);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /fileNameBefore/);
});

test("POST /api/compare rejects a non-PNG-data-URL image", async () => {
  const payload = await comparePayload({ imageAfter: "not a data url" });
  const res = await request(app).post("/api/compare").send(payload);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /imageAfter/);
});

test("GET /api/comparisons/:id returns 404 for an unknown id", async () => {
  const res = await request(app).get("/api/comparisons/does-not-exist");
  assert.equal(res.status, 404);
});
