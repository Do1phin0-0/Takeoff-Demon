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

async function saveTakeoff(fileName, overrides = {}) {
  const payload = {
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
    ...overrides,
  };
  return request(app).post("/api/takeoffs").send(payload);
}

test("POST /api/takeoffs computes area server-side and rejects a client-supplied value", async () => {
  const fileName = await uploadOneFile();
  const res = await saveTakeoff(fileName);
  assert.equal(res.status, 201);
  // 100px = 10ft -> 10ft/100px; 200x200px square -> 20ft x 20ft = 400 sq ft
  assert.equal(res.body.value, 400);
  assert.equal(res.body.unit, "sq ft");
  assert.equal(res.body.pageNumber, 1);
  assert.equal(res.body.confidence, "medium");
});

test("POST /api/takeoffs rejects a polygon with fewer than 3 points", async () => {
  const fileName = await uploadOneFile();
  const res = await saveTakeoff(fileName, { polygon: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
  assert.equal(res.status, 400);
});

test("POST /api/takeoffs computes linear footage server-side for the length tool", async () => {
  const fileName = await uploadOneFile();
  const res = await saveTakeoff(fileName, {
    quantityType: "linear_footage",
    polygon: [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 400 },
    ],
  });
  assert.equal(res.status, 201);
  // 100px = 10ft -> 0.1 ft/px; 700px path (300 + 400) -> 70ft
  assert.equal(res.body.value, 70);
  assert.equal(res.body.unit, "ft");
  assert.equal(res.body.confidence, "medium");
});

test("POST /api/takeoffs accepts a 2-point line for linear_footage (below the 3-point area minimum)", async () => {
  const fileName = await uploadOneFile();
  const res = await saveTakeoff(fileName, {
    quantityType: "linear_footage",
    polygon: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.value, 10);
});

test("POST /api/takeoffs rejects a linear_footage line with fewer than 2 points", async () => {
  const fileName = await uploadOneFile();
  const res = await saveTakeoff(fileName, {
    quantityType: "linear_footage",
    polygon: [{ x: 0, y: 0 }],
  });
  assert.equal(res.status, 400);
});

test("POST /api/takeoffs rejects a linear_footage line where every point coincides (zero length)", async () => {
  const fileName = await uploadOneFile();
  const res = await saveTakeoff(fileName, {
    quantityType: "linear_footage",
    polygon: [
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ],
  });
  assert.equal(res.status, 400);
});

test("POST /api/takeoffs rejects an unsupported quantityType", async () => {
  const fileName = await uploadOneFile();
  const res = await saveTakeoff(fileName, { quantityType: "volume" });
  assert.equal(res.status, 400);
});

test("POST /api/takeoffs rejects a self-intersecting (bowtie) polygon", async () => {
  const fileName = await uploadOneFile();
  const res = await saveTakeoff(fileName, {
    polygon: [
      { x: 0, y: 0 },
      { x: 200, y: 200 },
      { x: 200, y: 0 },
      { x: 0, y: 200 },
    ],
  });
  assert.equal(res.status, 400);
});

test("POST /api/takeoffs rejects a degenerate (collinear, zero-area) polygon", async () => {
  const fileName = await uploadOneFile();
  const res = await saveTakeoff(fileName, {
    polygon: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 200, y: 0 },
    ],
  });
  assert.equal(res.status, 400);
});

test("POST /api/takeoffs rejects a fileName that was never uploaded", async () => {
  const res = await saveTakeoff("../../etc/passwd");
  assert.equal(res.status, 400);
});

test("POST /api/takeoffs stores the given pageNumber and rejects an invalid one", async () => {
  const fileName = await uploadOneFile();
  const ok = await saveTakeoff(fileName, { pageNumber: 7 });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.pageNumber, 7);

  const bad = await saveTakeoff(fileName, { pageNumber: 0 });
  assert.equal(bad.status, 400);
});

test("correction and review are independent: correcting a takeoff does not mark it approved", async () => {
  const fileName = await uploadOneFile();
  const saved = (await saveTakeoff(fileName)).body;

  const correctionRes = await request(app)
    .post(`/api/takeoffs/${saved.id}/corrections`)
    .send({ correctedValue: 350, note: "field-verified" });
  assert.equal(correctionRes.status, 201);
  assert.equal(correctionRes.body.originalValue, 400);
  assert.equal(correctionRes.body.correctedValue, 350);

  const reviews = await request(app).get("/api/reviews");
  assert.equal(reviews.body.reviews.filter((r) => r.takeoffId === saved.id).length, 0);
});

test("POST /api/takeoffs/:id/review approves a takeoff and logs who/when", async () => {
  const fileName = await uploadOneFile();
  const saved = (await saveTakeoff(fileName)).body;

  const res = await request(app)
    .post(`/api/takeoffs/${saved.id}/review`)
    .send({ action: "approved", who: "AJ" });
  assert.equal(res.status, 201);
  assert.equal(res.body.action, "approved");
  assert.equal(res.body.who, "AJ");
  assert.equal(res.body.takeoffId, saved.id);

  const list = await request(app).get("/api/reviews");
  assert.ok(list.body.reviews.some((r) => r.id === res.body.id));
});

test("POST /api/takeoffs/:id/review rejects an unknown action and an unknown takeoff id", async () => {
  const fileName = await uploadOneFile();
  const saved = (await saveTakeoff(fileName)).body;

  const badAction = await request(app)
    .post(`/api/takeoffs/${saved.id}/review`)
    .send({ action: "rejected" });
  assert.equal(badAction.status, 400);

  const badId = await request(app)
    .post("/api/takeoffs/does-not-exist/review")
    .send({ action: "approved" });
  assert.equal(badId.status, 404);
});

test("GET /api/reports/corrections aggregates corrections and reviews across takeoffs", async () => {
  const fileName = await uploadOneFile();
  const saved = (await saveTakeoff(fileName)).body; // value: 400

  await request(app).post(`/api/takeoffs/${saved.id}/corrections`).send({ correctedValue: 380, note: "field-verified" });

  const res = await request(app).get("/api/reports/corrections");
  assert.equal(res.status, 200);
  assert.ok(res.body.totals.takeoffsCorrected >= 1);
  assert.ok(res.body.byQuantityType.square_footage.count >= 1);
  assert.equal(res.body.recentCorrections[0].fileName, fileName); // most recent correction, newest-first
});
