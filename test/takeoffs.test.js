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

test("POST /api/takeoffs persists the markup's canvas dimensions so the review page can reserve space", async () => {
  const fileName = await uploadOneFile();
  const res = await saveTakeoff(fileName);
  assert.equal(res.status, 201);
  assert.equal(res.body.canvasWidth, 1000);
  assert.equal(res.body.canvasHeight, 1000);

  const listed = await request(app).get("/api/takeoffs");
  const saved = listed.body.takeoffs.find((t) => t.id === res.body.id);
  assert.equal(saved.canvasWidth, 1000);
  assert.equal(saved.canvasHeight, 1000);
});

test("POST /api/takeoffs rejects a polygon with fewer than 3 points", async () => {
  const fileName = await uploadOneFile();
  const res = await saveTakeoff(fileName, { polygon: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
  assert.equal(res.status, 400);
});

test("POST /api/takeoffs rejects a non-finite coordinate smuggled in as 1e999", async () => {
  const fileName = await uploadOneFile();
  // JSON has no NaN, but 1e999 parses to Infinity — typeof still says
  // "number", so only the geometry critic catches it.
  const raw = JSON.stringify({
    fileName,
    quantityType: "square_footage",
    scale: { pixelDistance: 100, realDistance: 10, unit: "ft" },
    polygon: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 1, y: 200 }],
    markupImage: TINY_PNG_DATA_URL,
    canvasWidth: 1000,
    canvasHeight: 1000,
  }).replace('"x":1,', '"x":1e999,');
  const res = await request(app).post("/api/takeoffs").type("json").send(raw);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /non-finite/);
});

test("POST /api/takeoffs rejects points far outside the sheet canvas", async () => {
  const fileName = await uploadOneFile();
  const res = await saveTakeoff(fileName, {
    polygon: [{ x: 5000, y: 5000 }, { x: 200, y: 0 }, { x: 200, y: 200 }],
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /outside/);
});

test("POST /api/takeoffs rejects a physically implausible calibration", async () => {
  const fileName = await uploadOneFile();
  const res = await saveTakeoff(fileName, {
    scale: { pixelDistance: 1, realDistance: 100, unit: "ft" },
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /implausible/i);
});

test("POST /api/takeoffs dedupes a double-clicked point instead of rejecting the trace", async () => {
  const fileName = await uploadOneFile();
  // Double-clicking a vertex is CAD muscle memory; the zero-length edge is
  // numerically harmless and must not cost the user their whole trace.
  const line = await saveTakeoff(fileName, {
    quantityType: "linear_footage",
    polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }],
  });
  assert.equal(line.status, 201);
  assert.equal(line.body.value, 20); // 200px at 10ft/100px
  assert.equal(line.body.polygon.length, 3, "the duplicate point is dropped from the stored trace");

  // The area case previously failed as a bogus "edges cross themselves".
  const area = await saveTakeoff(fileName, {
    polygon: [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 200 },
      { x: 0, y: 200 },
    ],
  });
  assert.equal(area.status, 201);
  assert.equal(area.body.value, 400);
});

test("POST /api/takeoffs rejects a non-finite calibration smuggled in as 1e999", async () => {
  const fileName = await uploadOneFile();
  const raw = JSON.stringify({
    fileName,
    quantityType: "square_footage",
    scale: { pixelDistance: 100, realDistance: 1, unit: "ft" },
    polygon: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 100, y: 200 }],
    markupImage: TINY_PNG_DATA_URL,
    canvasWidth: 1000,
    canvasHeight: 1000,
  }).replace('"realDistance":1,', '"realDistance":1e999,');
  const res = await request(app).post("/api/takeoffs").type("json").send(raw);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /finite positive/);
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

// ---- Count takeoffs ----

async function saveCount(fileName, markers, overrides = {}) {
  return saveTakeoff(fileName, { quantityType: "count", scale: undefined, polygon: markers, ...overrides });
}

test("POST /api/takeoffs count: value is the number of markers, no scale required", async () => {
  const fileName = await uploadOneFile();
  const res = await saveCount(fileName, [{ x: 10, y: 10 }, { x: 50, y: 60 }, { x: 300, y: 400 }]);
  assert.equal(res.status, 201);
  assert.equal(res.body.quantityType, "count");
  assert.equal(res.body.value, 3);
  assert.equal(res.body.unit, "EA");
  assert.equal(res.body.scale, null);
  assert.equal(res.body.manualCount, 3);
  assert.equal(res.body.matchedCount, 0);
  assert.equal(res.body.confidence, "medium");
});

test("POST /api/takeoffs count: any template-matched marker caps confidence at low and is recorded", async () => {
  const fileName = await uploadOneFile();
  const res = await saveCount(fileName, [
    { x: 10, y: 10, source: "manual" },
    { x: 50, y: 60, source: "matched" },
    { x: 90, y: 60, source: "matched" },
  ]);
  assert.equal(res.status, 201);
  assert.equal(res.body.value, 3);
  assert.equal(res.body.matchedCount, 2);
  assert.equal(res.body.manualCount, 1);
  assert.equal(res.body.confidence, "low");
  assert.match(res.body.confidenceReasons[0], /2 of 3 markers were proposed by template matching/);
  assert.deepEqual(res.body.polygon.map((m) => m.source), ["manual", "matched", "matched"]);
});

test("POST /api/takeoffs count: a client-supplied value is ignored and same-pixel markers count once", async () => {
  const fileName = await uploadOneFile();
  const res = await saveCount(fileName, [{ x: 10, y: 10 }, { x: 10, y: 10 }, { x: 20, y: 20 }], { value: 99 });
  assert.equal(res.status, 201);
  assert.equal(res.body.value, 2);
});

test("POST /api/takeoffs count: rejects empty, off-sheet, non-finite and bad-source markers", async () => {
  const fileName = await uploadOneFile();
  assert.equal((await saveCount(fileName, [])).status, 400);
  assert.equal((await saveCount(fileName, [{ x: 5000, y: 10 }])).status, 400);
  assert.equal((await saveCount(fileName, [{ x: "1", y: 10 }])).status, 400);
  assert.equal((await saveCount(fileName, [{ x: 1, y: 10, source: "ai" }])).status, 400);
  assert.equal((await saveCount(fileName, [{ x: 1, y: 10 }], { markupImage: "nope" })).status, 400);
});

test("POST /api/takeoffs count: a scale is optional but validated when sent", async () => {
  const fileName = await uploadOneFile();
  const ok = await saveCount(fileName, [{ x: 1, y: 1 }], { scale: { pixelDistance: 100, realDistance: 10, unit: "ft" } });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.scale.pixelDistance, 100);
  const bad = await saveCount(fileName, [{ x: 1, y: 1 }], { scale: { pixelDistance: -1, realDistance: 10, unit: "ft" } });
  assert.equal(bad.status, 400);
});

test("POST /api/takeoffs count: toolId must be a count tool, and area/length still require a scale", async () => {
  const fileName = await uploadOneFile();
  const door = await saveCount(fileName, [{ x: 1, y: 1 }, { x: 9, y: 9 }], { toolId: "door-single-swing" });
  assert.equal(door.status, 201);
  assert.equal(door.body.toolId, "door-single-swing");
  const wrong = await saveCount(fileName, [{ x: 1, y: 1 }], { toolId: "elec-conduit-run" });
  assert.equal(wrong.status, 400);
  const noScale = await saveTakeoff(fileName, { scale: undefined });
  assert.equal(noScale.status, 400);

  const summary = await request(app).get("/api/markups-summary");
  const openings = summary.body.divisions.find((d) => d.csiDivision === "08");
  const doors = openings.groups.find((g) => g.key === "door-single-swing");
  assert.equal(doors.totals.EA, 2);
});

test("count takeoffs can be corrected through the existing corrections log", async () => {
  const fileName = await uploadOneFile();
  const saved = await saveCount(fileName, [{ x: 1, y: 1 }, { x: 9, y: 9 }]);
  const res = await request(app).post(`/api/takeoffs/${saved.body.id}/corrections`).send({ correctedValue: 3, note: "missed one behind a column" });
  assert.equal(res.status, 201);
  assert.equal(res.body.originalValue, 2);
  assert.equal(res.body.quantityType, "count");
});
