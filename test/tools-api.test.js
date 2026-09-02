const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "takeoff-tools-test-"));
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

test("GET /api/tools returns divisions grouping the shipped toolsets with no load errors", async () => {
  const res = await request(app).get("/api/tools");
  assert.equal(res.status, 200);
  assert.equal(res.body.loadErrors.length, 0);
  assert.ok(res.body.divisions.length >= 3);
  const concrete = res.body.divisions.find((d) => d.csiDivision === "03");
  assert.ok(concrete);
  assert.ok(concrete.tools.some((t) => t.id === "conc-slab-on-grade"));
});

test("POST /api/takeoffs accepts a matching toolId and stores it on the record", async () => {
  const fileName = await uploadOneFile();
  const res = await request(app)
    .post("/api/takeoffs")
    .send({
      fileName,
      quantityType: "square_footage",
      toolId: "fin-flooring-area",
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
  assert.equal(res.status, 201);
  assert.equal(res.body.toolId, "fin-flooring-area");
});

test("POST /api/takeoffs rejects an unknown toolId", async () => {
  const fileName = await uploadOneFile();
  const res = await request(app)
    .post("/api/takeoffs")
    .send({
      fileName,
      quantityType: "square_footage",
      toolId: "not-a-real-tool",
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
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Unknown toolId/);
});

test("POST /api/takeoffs rejects a toolId whose quantityType doesn't match the request", async () => {
  const fileName = await uploadOneFile();
  const res = await request(app)
    .post("/api/takeoffs")
    .send({
      fileName,
      quantityType: "square_footage",
      toolId: "elec-conduit-run", // this tool is linear_footage
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
  assert.equal(res.status, 400);
  assert.match(res.body.error, /not square_footage/);
});

test("GET /api/markups-summary groups a toolId'd takeoff under its tool and division, and untagged ones as Unclassified", async () => {
  const fileName = await uploadOneFile();
  await request(app)
    .post("/api/takeoffs")
    .send({
      fileName,
      quantityType: "linear_footage",
      toolId: "elec-conduit-run",
      scale: { pixelDistance: 100, realDistance: 10, unit: "ft" },
      polygon: [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
      ],
      markupImage: TINY_PNG_DATA_URL,
      canvasWidth: 1000,
      canvasHeight: 1000,
    });
  await request(app)
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

  const res = await request(app).get("/api/markups-summary");
  assert.equal(res.status, 200);
  const electrical = res.body.divisions.find((d) => d.csiDivision === "26");
  assert.ok(electrical);
  const conduitGroup = electrical.groups.find((g) => g.key === "elec-conduit-run");
  assert.ok(conduitGroup);
  assert.equal(conduitGroup.count, 1);
  // 100px = 10ft -> 10ft/100px; a 200px straight run -> 20ft
  assert.equal(conduitGroup.totals.LF, 20);

  const unclassified = res.body.divisions.find((d) => d.csiDivision === null);
  assert.ok(unclassified);
  assert.ok(unclassified.groups.some((g) => g.key === "unclassified" && g.count >= 1));
});
