const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "takeoff-contracts-validation-test-"));
process.env.UPLOAD_DIR = uploadDir;
// Generated at run time (not a literal) — just needs to be truthy so the
// Anthropic client constructs; the test never sends a real request.
process.env.ANTHROPIC_API_KEY = crypto.randomBytes(16).toString("hex");
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
