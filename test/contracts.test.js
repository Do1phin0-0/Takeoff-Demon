const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "takeoff-contracts-test-"));
process.env.UPLOAD_DIR = uploadDir;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.AUTH_USERNAME;
delete process.env.AUTH_PASSWORD;

const request = require("supertest");
const app = require("../server.js");

after(() => fs.rmSync(uploadDir, { recursive: true, force: true }));

test("POST /contracts/chat 503s without ANTHROPIC_API_KEY", async () => {
  const res = await request(app)
    .post("/contracts/chat")
    .send({ messages: [{ role: "user", text: "I need a new subcontract" }] });
  assert.equal(res.status, 503);
  assert.match(res.body.error, /ANTHROPIC_API_KEY/);
});

test("POST /contracts/chat 503s for an empty messages array too, since there's no key configured", async () => {
  const res = await request(app).post("/contracts/chat").send({ messages: [] });
  assert.equal(res.status, 503);
});

test("GET /contracts returns an empty list before anything is drafted", async () => {
  const res = await request(app).get("/contracts");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.contracts, []);
});

test("GET /contracts/:id/download 404s for an unknown contract", async () => {
  const res = await request(app).get("/contracts/nope/download");
  assert.equal(res.status, 404);
});
