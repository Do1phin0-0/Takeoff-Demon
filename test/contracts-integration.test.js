const { test, after, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const JSZip = require("jszip");
const Anthropic = require("@anthropic-ai/sdk");

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "takeoff-contracts-integration-test-"));
process.env.UPLOAD_DIR = uploadDir;
process.env.ANTHROPIC_API_KEY = require("crypto").randomBytes(16).toString("hex");
delete process.env.AUTH_USERNAME;
delete process.env.AUTH_PASSWORD;

// The SDK's Messages prototype is shared across every `new Anthropic()` instance
// in this process, so patching it here also intercepts the client server.js builds
// internally — lets us drive the real /contracts/chat handler against a scripted
// response instead of the network, with no API key required.
const messagesProto = Object.getPrototypeOf(new Anthropic({ apiKey: "probe" }).messages);
let nextResponse;
let lastCallArgs;
messagesProto.create = async (params) => {
  lastCallArgs = params;
  return nextResponse;
};

const request = require("supertest");
const app = require("../server.js");

after(() => fs.rmSync(uploadDir, { recursive: true, force: true }));

const sampleFields = {
  subcontractor: {
    companyName: "Lone Star Plumbing LLC",
    address: "400 Main St, Houston, TX 77002",
    contactName: "Dana Reyes",
    phone: "713-555-0199",
    email: "dana@lonestarplumbing.com",
  },
  project: {
    number: "2",
    name: "Westside Retail Center",
    address: "900 Westheimer Rd, Houston, TX 77006",
    cityState: "Houston, TX",
    pmName: "Marcus Webb",
    pmPhone: "281-555-0100",
    pmEmail: "mwebb@ams-tx.com",
  },
  subcontractDate: "2026-07-15",
  retentionRatePercent: 10,
  plansAttached: true,
  specsAttached: false,
  specDate: "2026-06-01",
  scopeName: "Plumbing",
  scopeItems: [
    { packageName: "Plumbing Package", costCode: "15100", codeDescription: "Plumbing", amount: "$145,000.00" },
  ],
  scopeInclusions: "Permits, materials, install, testing/inspections, daily clean-up.",
  subcontractTotal: "$145,000.00",
};

test("mid-conversation: server relays Claude's text reply and doesn't generate a contract yet", async () => {
  nextResponse = {
    content: [{ type: "text", text: "What's the subcontractor's company name and address?" }],
  };

  const res = await request(app)
    .post("/contracts/chat")
    .send({ messages: [{ role: "user", text: "I need a plumbing subcontract for project 2" }] });

  assert.equal(res.status, 200);
  assert.equal(res.body.done, false);
  assert.equal(res.body.reply, "What's the subcontractor's company name and address?");

  // Verify the request we actually sent Claude carries the real AMS prompt and
  // tool. system is a cache-control block array; its text is the assembled prompt.
  assert.equal(lastCallArgs.system[0].cache_control.type, "ephemeral");
  assert.match(lastCallArgs.system[0].text, /AMS Construction/);
  assert.match(lastCallArgs.system[0].text, /finalize_subcontract/);
  assert.equal(lastCallArgs.tools[0].name, "finalize_subcontract");
  // One tool_use per turn, guaranteed — the reflection's single tool_result
  // depends on it.
  assert.equal(lastCallArgs.tool_choice.disable_parallel_tool_use, true);
  assert.ok(lastCallArgs.max_tokens >= 4096, "payload + adaptive thinking need more than 1536");
  assert.equal(lastCallArgs.messages[0].role, "user");
  assert.equal(lastCallArgs.messages[0].content[0].text, "I need a plumbing subcontract for project 2");
});

test("tool call: server generates a real docx, persists it, and serves it back", async () => {
  nextResponse = {
    content: [
      { type: "tool_use", id: "toolu_01abc", name: "finalize_subcontract", input: sampleFields },
    ],
  };

  const res = await request(app)
    .post("/contracts/chat")
    .send({
      messages: [
        { role: "user", text: "I need a plumbing subcontract for project 2" },
        { role: "assistant", text: "What's the subcontractor's company name and address?" },
        { role: "user", text: "Lone Star Plumbing, 400 Main St Houston TX, total $145,000" },
      ],
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.done, true);
  assert.ok(res.body.contractId);
  assert.equal(res.body.downloadUrl, `/contracts/${res.body.contractId}/download`);
  assert.equal(res.body.fields.subcontractor.companyName, "Lone Star Plumbing LLC");

  // It should show up in history.
  const listRes = await request(app).get("/contracts");
  const listed = listRes.body.contracts.find((c) => c.id === res.body.contractId);
  assert.ok(listed, "generated contract should appear in GET /contracts");
  assert.equal(listed.subcontractorName, "Lone Star Plumbing LLC");
  assert.equal(listed.projectName, "Westside Retail Center");

  // And the actual downloaded file should be a real, correctly filled docx.
  // .buffer(true) forces supertest to return raw bytes in res.body — this docx
  // MIME type isn't in its default binary-type allowlist, so without it the
  // response lands in res.text instead.
  const downloadRes = await request(app).get(res.body.downloadUrl).buffer(true).parse((response, cb) => {
    const chunks = [];
    response.on("data", (chunk) => chunks.push(chunk));
    response.on("end", () => cb(null, Buffer.concat(chunks)));
  });
  assert.equal(downloadRes.status, 200);
  assert.equal(
    downloadRes.headers["content-type"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  const zip = await JSZip.loadAsync(downloadRes.body);
  const xml = await zip.file("word/document.xml").async("string");
  assert.match(xml, /Lone Star Plumbing LLC/);
  assert.match(xml, /2-SC-15100/);
  assert.equal(xml.match(/\[[A-Z][^[\]]*\]/g), null, "no unfilled placeholders should remain");
});

test("API error from Claude surfaces as a 502, not a crash", async () => {
  messagesProto.create = async () => {
    throw new Error("simulated upstream failure");
  };

  const res = await request(app)
    .post("/contracts/chat")
    .send({ messages: [{ role: "user", text: "hello" }] });

  assert.equal(res.status, 502);
  assert.match(res.body.error, /simulated upstream failure/);
});

test("a structured Anthropic API error surfaces its human-readable message, not the raw JSON body", async () => {
  // Mirrors the real shape Anthropic's SDK throws (see APIError in the SDK source):
  // a top-level error with a nested .error.message, which err.message would
  // otherwise stringify wholesale (e.g. `400 {"type":"error","error":{...}}`).
  messagesProto.create = async () => {
    const err = new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Could not process PDF"}}');
    err.error = { type: "error", error: { type: "invalid_request_error", message: "Could not process PDF" } };
    throw err;
  };

  const res = await request(app)
    .post("/contracts/chat")
    .send({ messages: [{ role: "user", text: "hello" }] });

  assert.equal(res.status, 502);
  assert.equal(res.body.error, "Could not process PDF");
});

test("a persistently invalid tool payload exhausts reflexion at 2 attempts and returns 422, never reaching docx", async () => {
  // The critic now intercepts a broken payload BEFORE docx compilation; a
  // model that keeps returning it gets exactly 2 reflection chances (each an
  // is_error tool_result), then a 422 with the issues — hard cap enforced.
  const brokenFields = { ...sampleFields, scopeItems: "not-an-array" };
  let calls = 0;
  let sawErrorToolResult = false;
  messagesProto.create = async (params) => {
    calls += 1;
    const last = params.messages[params.messages.length - 1];
    if (Array.isArray(last.content) && last.content.some((b) => b.type === "tool_result" && b.is_error)) {
      sawErrorToolResult = true;
    }
    return {
      content: [
        { type: "tool_use", id: `toolu_bad_${calls}`, name: "finalize_subcontract", input: brokenFields },
      ],
    };
  };

  const res = await request(app)
    .post("/contracts/chat")
    .send({ messages: [{ role: "user", text: "finalize it" }] });

  assert.equal(res.status, 422);
  assert.equal(calls, 3, "1 initial call + exactly 2 reflection attempts");
  assert.ok(sawErrorToolResult, "reflection must use the is_error tool_result protocol");
  assert.ok(res.body.issues.some((m) => /scopeItems/.test(m)));
  assert.equal(res.body.fields.subcontractor.companyName, "Lone Star Plumbing LLC");
});

test("reflexion repairs an invalid tool payload on the first retry and generates the contract", async () => {
  let calls = 0;
  messagesProto.create = async () => {
    calls += 1;
    const input = calls === 1 ? { ...sampleFields, subcontractTotal: "" } : sampleFields;
    return {
      content: [{ type: "tool_use", id: `toolu_fix_${calls}`, name: "finalize_subcontract", input }],
    };
  };

  const res = await request(app)
    .post("/contracts/chat")
    .send({ messages: [{ role: "user", text: "finalize it" }] });

  assert.equal(res.status, 200);
  assert.equal(res.body.done, true);
  assert.equal(calls, 2, "one reflection call repaired the payload");
  assert.equal(res.body.fields.subcontractTotal, "$145,000.00");
});

test("a text-only reflection response becomes a normal done:false reply (model asking for missing info)", async () => {
  let calls = 0;
  messagesProto.create = async () => {
    calls += 1;
    if (calls === 1) {
      return {
        content: [
          {
            type: "tool_use",
            id: "toolu_ask",
            name: "finalize_subcontract",
            input: { ...sampleFields, subcontractor: { ...sampleFields.subcontractor, email: "" } },
          },
        ],
      };
    }
    return { content: [{ type: "text", text: "What is the subcontractor's email address?" }] };
  };

  const res = await request(app)
    .post("/contracts/chat")
    .send({ messages: [{ role: "user", text: "finalize it" }] });

  assert.equal(res.status, 200);
  assert.equal(res.body.done, false);
  assert.equal(res.body.reply, "What is the subcontractor's email address?");
  assert.equal(calls, 2);
});

test("a max_tokens-truncated response returns 502 instead of a cut-off fragment as a reply", async () => {
  messagesProto.create = async () => ({
    stop_reason: "max_tokens",
    content: [{ type: "text", text: "Here is the subcontract you asked f" }],
  });

  const res = await request(app)
    .post("/contracts/chat")
    .send({ messages: [{ role: "user", text: "finalize it" }] });

  assert.equal(res.status, 502);
  assert.match(res.body.error, /cut off/);
});

test("an API failure during reflection reports as 502 upstream error, not model incorrigibility", async () => {
  let calls = 0;
  messagesProto.create = async () => {
    calls += 1;
    if (calls === 1) {
      return {
        content: [
          {
            type: "tool_use",
            id: "toolu_flaky",
            name: "finalize_subcontract",
            input: { ...sampleFields, subcontractTotal: "" },
          },
        ],
      };
    }
    throw new Error("simulated overloaded_error");
  };

  const res = await request(app)
    .post("/contracts/chat")
    .send({ messages: [{ role: "user", text: "finalize it" }] });

  assert.equal(res.status, 502);
  assert.match(res.body.error, /simulated overloaded_error/);
  assert.equal(calls, 2, "the loop stops on the first reflect failure");
});

test("a docx-generation failure after a critic-valid tool call returns 500 with the collected fields, not 502", async () => {
  // Payload passes the critic; the local .docx write fails instead — a local
  // failure that must not wear upstream semantics or discard the fields.
  messagesProto.create = async () => ({
    content: [
      { type: "tool_use", id: "toolu_02def", name: "finalize_subcontract", input: sampleFields },
    ],
  });
  const realWriteFile = fs.promises.writeFile;
  fs.promises.writeFile = async (p, ...args) => {
    if (String(p).endsWith(".docx")) {
      const e = new Error("ENOSPC: no space left on device, write");
      e.code = "ENOSPC";
      throw e;
    }
    return realWriteFile(p, ...args);
  };
  try {
    const res = await request(app)
      .post("/contracts/chat")
      .send({ messages: [{ role: "user", text: "finalize it" }] });

    assert.equal(res.status, 500);
    assert.match(res.body.error, /generating or saving the document failed/);
    assert.ok(!res.body.error.includes("ENOSPC"), "raw fs error must not leak to the client");
    assert.equal(res.body.fields.subcontractor.companyName, "Lone Star Plumbing LLC");
  } finally {
    fs.promises.writeFile = realWriteFile;
  }
});
