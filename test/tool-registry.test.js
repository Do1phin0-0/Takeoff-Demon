const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createToolRegistry, validateToolDefinition, loadToolsetsFromDir } = require("../lib/tools/registry");

const VALID_TOOL = {
  id: "test-tool",
  name: "Test Tool",
  csiDivision: "09",
  csiDivisionName: "Finishes",
  category: "Flooring",
  description: "A tool used only by this test.",
  quantityType: "square_footage",
  unit: "SF",
  style: {
    strokeColor: "#112233",
    fillColor: "#ffffff",
    opacity: 0.5,
    lineStyle: "solid",
    lineWeight: 2,
  },
};

function tmpDirWith(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "toolset-test-"));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), typeof content === "string" ? content : JSON.stringify(content));
  }
  return dir;
}

test("validateToolDefinition accepts a well-formed tool", () => {
  const { ok, issues } = validateToolDefinition(VALID_TOOL);
  assert.equal(ok, true);
  assert.deepEqual(issues, []);
});

test("validateToolDefinition rejects an unsupported quantityType", () => {
  const { ok, issues } = validateToolDefinition({ ...VALID_TOOL, quantityType: "count" });
  assert.equal(ok, false);
  assert.ok(issues.some((i) => i.includes("quantityType")));
});

test("validateToolDefinition rejects a bad hex color", () => {
  const { ok, issues } = validateToolDefinition({ ...VALID_TOOL, style: { ...VALID_TOOL.style, strokeColor: "blue" } });
  assert.equal(ok, false);
  assert.ok(issues.some((i) => i.includes("strokeColor")));
});

test("validateToolDefinition allows fillColor: null for an unfilled tool", () => {
  const { ok } = validateToolDefinition({ ...VALID_TOOL, style: { ...VALID_TOOL.style, fillColor: null } });
  assert.equal(ok, true);
});

test("loadToolsetsFromDir loads a valid file and reports a duplicate id across files", () => {
  const dir = tmpDirWith({
    "a.json": { tools: [VALID_TOOL] },
    "b.json": { tools: [VALID_TOOL] },
  });
  const { tools, errors } = loadToolsetsFromDir(dir);
  assert.equal(tools.length, 1);
  assert.ok(errors.some((e) => e.includes("duplicate tool id")));
});

test("loadToolsetsFromDir reports invalid JSON without throwing", () => {
  const dir = tmpDirWith({ "broken.json": "{ not json" });
  const { tools, errors } = loadToolsetsFromDir(dir);
  assert.equal(tools.length, 0);
  assert.ok(errors.some((e) => e.includes("invalid JSON")));
});

test("createToolRegistry exposes listTools/getTool/listDivisions", () => {
  const dir = tmpDirWith({ "a.json": { tools: [VALID_TOOL] } });
  const registry = createToolRegistry(dir);
  assert.equal(registry.listTools().length, 1);
  assert.equal(registry.getTool("test-tool").name, "Test Tool");
  assert.equal(registry.getTool("nope"), null);
  const divisions = registry.listDivisions();
  assert.equal(divisions.length, 1);
  assert.equal(divisions[0].csiDivision, "09");
  assert.equal(divisions[0].tools.length, 1);
});

test("the repo's shipped data/toolsets load with zero errors", () => {
  const registry = createToolRegistry(path.join(__dirname, "..", "data", "toolsets"));
  assert.deepEqual(registry.loadErrors, []);
  assert.ok(registry.listTools().length > 0);
  for (const tool of registry.listTools()) {
    const { ok, issues } = validateToolDefinition(tool);
    assert.equal(ok, true, `${tool.id}: ${issues.join("; ")}`);
  }
});
