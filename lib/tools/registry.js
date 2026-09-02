// Tool Registry — loads and validates tool definitions from data/toolsets/*.json.
//
// Scope note: this is the schema/registry layer only. Every seed tool maps to a
// quantityType the server already computes (square_footage / linear_footage) —
// no new geometry, no count tool, no symbol rendering. Adding a tool here does
// not put it in the takeoff.html tool chest; that's a separate, later slice.

const fs = require("fs");
const path = require("path");

const SUPPORTED_QUANTITY_TYPES = ["square_footage", "linear_footage"];
const LINE_STYLES = ["solid", "dashed", "dotted", "custom"];
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function isHexColor(v) {
  return typeof v === "string" && HEX_COLOR_RE.test(v);
}

// Validates one tool definition. Returns { ok, issues } — never throws, so one
// malformed file in data/toolsets/ can be reported and skipped instead of
// crashing the registry (and the server) at boot.
function validateToolDefinition(tool) {
  const issues = [];
  const req = (cond, msg) => { if (!cond) issues.push(msg); };

  req(tool && typeof tool === "object", "tool must be an object");
  if (!tool || typeof tool !== "object") return { ok: false, issues };

  req(typeof tool.id === "string" && /^[a-z0-9][a-z0-9-]*$/.test(tool.id), "id must be a lowercase-kebab-case string");
  req(typeof tool.name === "string" && tool.name.trim().length > 0, "name is required");
  req(typeof tool.csiDivision === "string" && /^\d{2}$/.test(tool.csiDivision), "csiDivision must be a 2-digit CSI division code, e.g. \"03\"");
  req(typeof tool.csiDivisionName === "string" && tool.csiDivisionName.trim().length > 0, "csiDivisionName is required");
  req(typeof tool.category === "string" && tool.category.trim().length > 0, "category is required");
  req(tool.subcategory === undefined || typeof tool.subcategory === "string", "subcategory must be a string if present");
  req(typeof tool.description === "string" && tool.description.trim().length > 0, "description is required");
  req(SUPPORTED_QUANTITY_TYPES.includes(tool.quantityType), `quantityType must be one of: ${SUPPORTED_QUANTITY_TYPES.join(", ")}`);
  req(typeof tool.unit === "string" && tool.unit.trim().length > 0, "unit is required");

  const style = tool.style || {};
  req(isHexColor(style.strokeColor), "style.strokeColor must be a hex color");
  req(style.fillColor === null || isHexColor(style.fillColor), "style.fillColor must be a hex color or null (unfilled)");
  req(typeof style.opacity === "number" && style.opacity >= 0 && style.opacity <= 1, "style.opacity must be a number between 0 and 1");
  req(LINE_STYLES.includes(style.lineStyle), `style.lineStyle must be one of: ${LINE_STYLES.join(", ")}`);
  req(typeof style.lineWeight === "number" && style.lineWeight > 0, "style.lineWeight must be a positive number");
  req(style.hatchPattern === undefined || style.hatchPattern === null || typeof style.hatchPattern === "string", "style.hatchPattern must be a string if present");

  return { ok: issues.length === 0, issues };
}

// Loads every *.json file in dir, validates each tool inside, and returns the
// valid ones plus a list of load errors (bad file or failed-validation tools)
// rather than throwing — a bad toolset file should not take the server down.
function loadToolsetsFromDir(dir) {
  const tools = [];
  const errors = [];
  const seenIds = new Set();

  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  } catch (err) {
    return { tools, errors: [`Could not read toolsets directory ${dir}: ${err.message}`] };
  }

  for (const file of files) {
    const filePath = path.join(dir, file);
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (err) {
      errors.push(`${file}: invalid JSON — ${err.message}`);
      continue;
    }
    const list = Array.isArray(parsed) ? parsed : parsed.tools;
    if (!Array.isArray(list)) {
      errors.push(`${file}: expected a top-level array or {"tools": [...]}`);
      continue;
    }
    for (const [i, tool] of list.entries()) {
      const { ok, issues } = validateToolDefinition(tool);
      if (!ok) {
        errors.push(`${file}[${i}] (${tool && tool.id ? tool.id : "unknown id"}): ${issues.join("; ")}`);
        continue;
      }
      if (seenIds.has(tool.id)) {
        errors.push(`${file}[${i}]: duplicate tool id "${tool.id}"`);
        continue;
      }
      seenIds.add(tool.id);
      tools.push(tool);
    }
  }

  return { tools, errors };
}

function createToolRegistry(dir) {
  const { tools, errors } = loadToolsetsFromDir(dir);
  if (errors.length > 0) {
    console.error(`Tool registry: ${errors.length} issue(s) loading toolsets from ${dir}:\n  ${errors.join("\n  ")}`);
  }

  const byId = new Map(tools.map((t) => [t.id, t]));

  function listTools() {
    return tools.slice();
  }

  function getTool(id) {
    return byId.get(id) || null;
  }

  function listDivisions() {
    const divisions = new Map();
    for (const t of tools) {
      if (!divisions.has(t.csiDivision)) {
        divisions.set(t.csiDivision, { csiDivision: t.csiDivision, csiDivisionName: t.csiDivisionName, tools: [] });
      }
      divisions.get(t.csiDivision).tools.push(t);
    }
    return Array.from(divisions.values()).sort((a, b) => a.csiDivision.localeCompare(b.csiDivision));
  }

  return { listTools, getTool, listDivisions, loadErrors: errors };
}

module.exports = { createToolRegistry, validateToolDefinition, loadToolsetsFromDir, SUPPORTED_QUANTITY_TYPES };
