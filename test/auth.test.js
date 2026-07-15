const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "takeoff-auth-test-"));
// Generated at run time, not a literal, so this never looks like a checked-in credential.
const testUsername = `test-${crypto.randomBytes(4).toString("hex")}`;
const testPassword = crypto.randomBytes(16).toString("hex");
process.env.UPLOAD_DIR = uploadDir;
process.env.AUTH_USERNAME = testUsername;
process.env.AUTH_PASSWORD = testPassword;
delete process.env.ANTHROPIC_API_KEY;

const request = require("supertest");
const app = require("../server.js");

after(() => fs.rmSync(uploadDir, { recursive: true, force: true }));

test("protected routes reject requests without credentials", async () => {
  const res = await request(app).get("/files");
  assert.equal(res.status, 401);
});

test("protected routes accept correct Basic Auth credentials", async () => {
  const res = await request(app).get("/files").auth(testUsername, testPassword);
  assert.equal(res.status, 200);
});

test("/health stays open even when auth is configured", async () => {
  const res = await request(app).get("/health");
  assert.equal(res.status, 200);
});
