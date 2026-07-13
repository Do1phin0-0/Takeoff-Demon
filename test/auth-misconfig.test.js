const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "takeoff-auth-misconfig-test-"));
process.env.UPLOAD_DIR = uploadDir;
process.env.AUTH_USERNAME = "demo";
delete process.env.AUTH_PASSWORD;
delete process.env.ANTHROPIC_API_KEY;

after(() => fs.rmSync(uploadDir, { recursive: true, force: true }));

test("server refuses to start with only AUTH_USERNAME set", () => {
  assert.throws(
    () => require("../server.js"),
    /AUTH_USERNAME and AUTH_PASSWORD must be set together/
  );
});
