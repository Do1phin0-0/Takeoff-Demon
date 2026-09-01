// Deterministic verification critics for AI outputs and takeoff requests.
// Every critic returns { ok, issues: [{ code, message }] } and never throws on
// malformed input — a critic that crashes on the garbage it exists to catch
// would be worse than no critic. No AI calls here: these are the fixed,
// testable contracts the reflexion loop repairs against.

const MIN_SUMMARY_CHARS = 200;

// The batch summary's contract comes from TAKEOFF_PROMPT in server.js: four
// numbered sections, with #4 being assumptions/caveats, and every file that
// was stored for manual review mentioned by name. Structural checks only —
// demanding specific numeric metrics in free text about arbitrary photo/plan
// batches would force hallucination, not rigor.
function critiqueTakeoffSummary(text, { skippedFiles = [] } = {}) {
  const issues = [];
  const s = typeof text === "string" ? text : "";

  if (s.trim().length === 0) {
    return { ok: false, issues: [{ code: "empty", message: "Summary is empty." }] };
  }
  if (s.trim().length < MIN_SUMMARY_CHARS) {
    issues.push({
      code: "too_short",
      message: `Summary is under ${MIN_SUMMARY_CHARS} characters — it cannot cover all four required sections.`,
    });
  }

  for (let n = 1; n <= 4; n++) {
    // Section markers survive markdown styling: "1.", "**1.", "## 1)", etc.
    // `n` here is this loop's own counter (always 1-4), never external input
    // (AI output, request body, etc.) — there's no untrusted data reaching
    // this RegExp constructor to escape, and digits have no regex-special
    // meaning to escape regardless.
    const marker = new RegExp(`(?:^|\\n)\\s*(?:#{1,4}\\s*)?(?:\\*\\*\\s*)?${n}[.)]`);
    if (!marker.test(s)) {
      issues.push({
        code: `missing_section_${n}`,
        message: `Required section ${n} of the summary format is missing.`,
      });
    }
  }

  if (!/assumption|caveat|verif|uncertain/i.test(s)) {
    issues.push({
      code: "no_caveats",
      message: "Summary states no assumptions, caveats, or verification needs — an unqualified read is not acceptable.",
    });
  }

  for (const f of skippedFiles) {
    const name = f && f.originalName;
    if (name && !s.includes(name)) {
      issues.push({
        code: "skipped_file_unmentioned",
        message: `File "${name}" was stored for manual review but the summary does not mention it.`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

// --- Contract payload critic ---
// Mirrors FINALIZE_SUBCONTRACT_TOOL.input_schema in lib/subcontract.js —
// the API does not enforce tool schemas server-side, so this is the gate
// between the model's tool call and docx compilation.

const MONEY_PATTERN = /\$\s*\d[\d,]*(\.\d{2})?/;

function missingString(obj, key) {
  return typeof obj[key] !== "string" || obj[key].trim().length === 0;
}

function critiqueContractPayload(fields) {
  const issues = [];
  const add = (code, message) => issues.push({ code, message });

  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    return { ok: false, issues: [{ code: "not_object", message: "Contract payload must be an object." }] };
  }

  const sub = fields.subcontractor;
  if (!sub || typeof sub !== "object") {
    add("subcontractor", "subcontractor object is missing.");
  } else {
    for (const key of ["companyName", "address", "contactName", "phone", "email"]) {
      if (missingString(sub, key)) add(`subcontractor.${key}`, `subcontractor.${key} is missing or empty.`);
    }
  }

  const proj = fields.project;
  if (!proj || typeof proj !== "object") {
    add("project", "project object is missing.");
  } else {
    for (const key of ["number", "name", "address", "cityState", "pmName", "pmPhone", "pmEmail"]) {
      if (missingString(proj, key)) add(`project.${key}`, `project.${key} is missing or empty.`);
    }
  }

  for (const key of ["subcontractDate", "specDate", "scopeName", "scopeInclusions"]) {
    if (missingString(fields, key)) add(key, `${key} is missing or empty.`);
  }
  for (const key of ["plansAttached", "specsAttached"]) {
    if (typeof fields[key] !== "boolean") add(key, `${key} must be true or false.`);
  }

  if (!Array.isArray(fields.scopeItems) || fields.scopeItems.length === 0) {
    add("scopeItems", "scopeItems must be a non-empty array of cost-code entries.");
  } else {
    fields.scopeItems.forEach((item, i) => {
      if (!item || typeof item !== "object") {
        add(`scopeItems[${i}]`, `scopeItems[${i}] must be an object.`);
        return;
      }
      for (const key of ["packageName", "costCode", "codeDescription", "amount"]) {
        if (missingString(item, key)) add(`scopeItems[${i}].${key}`, `scopeItems[${i}].${key} is missing or empty.`);
      }
      if (typeof item.amount === "string" && item.amount.trim() && !MONEY_PATTERN.test(item.amount)) {
        add(`scopeItems[${i}].amount`, `scopeItems[${i}].amount "${item.amount}" is not a dollar amount (e.g. $45,000.00).`);
      }
    });
  }

  if (missingString(fields, "subcontractTotal")) {
    add("subcontractTotal", "subcontractTotal is missing or empty.");
  } else if (!MONEY_PATTERN.test(fields.subcontractTotal)) {
    add("subcontractTotal", `subcontractTotal "${fields.subcontractTotal}" is not a dollar amount (e.g. $145,000.00).`);
  }

  if (fields.retentionRatePercent !== undefined) {
    const r = fields.retentionRatePercent;
    if (typeof r !== "number" || !Number.isFinite(r) || r < 0 || r > 100) {
      add("retentionRatePercent", "retentionRatePercent must be a number between 0 and 100.");
    }
  }

  return { ok: issues.length === 0, issues };
}

// --- Geometry critic ---
// Anomaly classes the takeoff route's existing checks miss. The route keeps
// its established checks (self-intersection, degeneracy, point-count) and
// their exact messages; this adds what typeof-based validation lets through.

// A calibration outside this range means feet-per-pixel is physically
// implausible for a plan sheet: tighter than ~1/80" per pixel or coarser
// than ~10 ft per pixel is a mis-entered dimension, not a real scale.
const MIN_FEET_PER_PIXEL = 0.001;
const MAX_FEET_PER_PIXEL = 10;
const CANVAS_TOLERANCE_PX = 2;

function critiqueTakeoffGeometry({ polygon, scale, canvasWidth = 0, canvasHeight = 0 } = {}) {
  const issues = [];
  const points = Array.isArray(polygon) ? polygon : [];

  points.forEach((p, i) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      issues.push({
        code: "non_finite_point",
        message: `Point ${i + 1} has a non-finite coordinate — retrace the shape.`,
      });
    }
  });

  const w = Number(canvasWidth);
  const h = Number(canvasHeight);
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    points.forEach((p, i) => {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return; // already reported
      if (
        p.x < -CANVAS_TOLERANCE_PX ||
        p.y < -CANVAS_TOLERANCE_PX ||
        p.x > w + CANVAS_TOLERANCE_PX ||
        p.y > h + CANVAS_TOLERANCE_PX
      ) {
        issues.push({
          code: "point_off_canvas",
          message: `Point ${i + 1} (${p.x}, ${p.y}) lies outside the ${w}x${h} sheet — retrace the shape.`,
        });
      }
    });
  }

  // Consecutive duplicate points (double-clicks) are NOT flagged here: a
  // zero-length edge changes neither area nor length, double-clicking is CAD
  // muscle memory, and the route dedupes them before validation.

  if (scale) {
    const pd = scale.pixelDistance;
    const rd = scale.realDistance;
    if (!Number.isFinite(pd) || !Number.isFinite(rd) || pd <= 0 || rd <= 0) {
      // Flag, never skip: JSON's 1e999 parses to Infinity, passes typeof and
      // > 0 checks, and would otherwise flow into the quantity math to
      // produce a persisted takeoff whose value serializes as null.
      issues.push({
        code: "non_finite_scale",
        message: "Calibration distances must be finite positive numbers — re-enter the reference dimension.",
      });
    } else {
      const feetPerUnit = scale.unit === "in" ? 1 / 12 : 1;
      const feetPerPixel = (rd * feetPerUnit) / pd;
      if (feetPerPixel < MIN_FEET_PER_PIXEL || feetPerPixel > MAX_FEET_PER_PIXEL) {
        issues.push({
          code: "implausible_scale",
          message: `Calibration works out to ${feetPerPixel.toPrecision(3)} ft/pixel — implausible for a plan sheet; re-check the reference dimension.`,
        });
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

module.exports = {
  critiqueTakeoffSummary,
  critiqueContractPayload,
  critiqueTakeoffGeometry,
};
