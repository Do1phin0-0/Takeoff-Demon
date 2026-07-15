const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "takeoff-contracts-validation-test-"));
process.env.UPLOAD_DIR = uploadDir;
process.env.ANTHROPIC_API_KEY = "test-mode-placeholder-not-a-real-key";
delete process.env.AUTH_USERNAME;
delete process.env.AUTH_PASSWORD;

const request = require("supertest");
const app = require("../server.js");

after(() => fs.rmSync(uploadDir, { recursive: true, force: true }));

test("POST /contracts/chat validates messages before ever calling the model", async () => {
  const res = await request(app).post("/contracts/chat").send({ messages: [] });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /messages/);
});
