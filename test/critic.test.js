const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  critiqueTakeoffSummary,
  critiqueContractPayload,
  critiqueTakeoffGeometry,
} = require("../lib/critic");

// Pure unit coverage of lib/critic.js — no server, no env, no mocks. The
// reflexion loop and route wiring that consume these critics are covered in
// test/reflexion.test.js and the contracts/takeoffs integration tests.

const VALID_SUMMARY = [
  "1. What this set shows: one uploaded plan image (plan.png) representing a small tenant-improvement floor area.",
  "2. Key materials and quantities: no measurable quantities are visible at this resolution.",
  "3. Notable scope items or trades: general construction only; nothing trade-specific is identifiable.",
  "4. Assumptions and caveats: the sheet is low-resolution; every statement above requires field verification.",
].join("\n");

// --- Takeoff summary critic ---

test("summary critic passes a compliant four-section summary", () => {
  const { ok, issues } = critiqueTakeoffSummary(VALID_SUMMARY);
  assert.equal(ok, true, JSON.stringify(issues));
});

test("summary critic rejects empty, short, and section-less output", () => {
  assert.equal(critiqueTakeoffSummary("").ok, false);
  assert.equal(critiqueTakeoffSummary("looks good").ok, false);

  const noSection4 = VALID_SUMMARY.split("\n").slice(0, 3).join("\n") + "\npadding ".repeat(20);
  const result = critiqueTakeoffSummary(noSection4);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === "missing_section_4"));
});

test("summary critic requires every skipped file to be mentioned", () => {
  const result = critiqueTakeoffSummary(VALID_SUMMARY, {
    skippedFiles: [{ originalName: "site-photos.dwg" }],
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === "skipped_file_unmentioned"));

  const mentioning = critiqueTakeoffSummary(VALID_SUMMARY + "\nsite-photos.dwg is stored for manual review.", {
    skippedFiles: [{ originalName: "site-photos.dwg" }],
  });
  assert.equal(mentioning.ok, true);
});

// --- Contract payload critic ---

const validContract = {
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

test("contract critic passes a complete payload and rejects each malformed class", () => {
  assert.equal(critiqueContractPayload(validContract).ok, true);
  assert.equal(critiqueContractPayload(null).ok, false);

  const noCompany = critiqueContractPayload({
    ...validContract,
    subcontractor: { ...validContract.subcontractor, companyName: "" },
  });
  assert.ok(noCompany.issues.some((i) => i.code === "subcontractor.companyName"));

  const emptyScope = critiqueContractPayload({ ...validContract, scopeItems: [] });
  assert.ok(emptyScope.issues.some((i) => i.code === "scopeItems"));

  const nonArrayScope = critiqueContractPayload({ ...validContract, scopeItems: "not-an-array" });
  assert.ok(nonArrayScope.issues.some((i) => i.code === "scopeItems"));

  const badTotal = critiqueContractPayload({ ...validContract, subcontractTotal: "a lot" });
  assert.ok(badTotal.issues.some((i) => i.code === "subcontractTotal"));

  const badRetention = critiqueContractPayload({ ...validContract, retentionRatePercent: 900 });
  assert.ok(badRetention.issues.some((i) => i.code === "retentionRatePercent"));
});

test("contract critic reports every missing project field, not just the first", () => {
  const bare = critiqueContractPayload({ ...validContract, project: {} });
  assert.equal(bare.ok, false);
  for (const key of ["number", "name", "address", "cityState", "pmName", "pmPhone", "pmEmail"]) {
    assert.ok(
      bare.issues.some((i) => i.code === `project.${key}`),
      `expected an issue for project.${key}`
    );
  }
});

// --- Geometry critic ---

test("geometry critic flags a non-finite calibration instead of skipping it", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 200 },
    { x: 0, y: 200 },
  ];
  // JSON's 1e999 parses to Infinity; typeof and > 0 both pass it, so the
  // critic must flag — not skip — a non-finite scale.
  const infScale = critiqueTakeoffGeometry({
    polygon: square,
    scale: { pixelDistance: 100, realDistance: Infinity, unit: "ft" },
  });
  assert.ok(infScale.issues.some((i) => i.code === "non_finite_scale"));

  const nanScale = critiqueTakeoffGeometry({
    polygon: square,
    scale: { pixelDistance: NaN, realDistance: 10, unit: "ft" },
  });
  assert.ok(nanScale.issues.some((i) => i.code === "non_finite_scale"));
});

test("geometry critic catches non-finite points, off-canvas points, and implausible scale", () => {
  const scale = { pixelDistance: 100, realDistance: 10, unit: "ft" };
  const square = [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 200 },
    { x: 0, y: 200 },
  ];
  assert.equal(
    critiqueTakeoffGeometry({ polygon: square, scale, canvasWidth: 1000, canvasHeight: 1000 }).ok,
    true
  );

  const withInfinity = [{ x: Infinity, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }];
  assert.ok(
    critiqueTakeoffGeometry({ polygon: withInfinity, scale }).issues.some((i) => i.code === "non_finite_point")
  );

  const offCanvas = [{ x: 5000, y: 5000 }, { x: 200, y: 0 }, { x: 200, y: 200 }];
  assert.ok(
    critiqueTakeoffGeometry({ polygon: offCanvas, scale, canvasWidth: 1000, canvasHeight: 1000 }).issues.some(
      (i) => i.code === "point_off_canvas"
    )
  );

  const absurdScale = { pixelDistance: 1, realDistance: 100, unit: "ft" };
  assert.ok(
    critiqueTakeoffGeometry({ polygon: square, scale: absurdScale }).issues.some(
      (i) => i.code === "implausible_scale"
    )
  );
});

test("geometry critic never throws on garbage input", () => {
  assert.equal(critiqueTakeoffGeometry({}).ok, true);
  assert.equal(critiqueTakeoffGeometry({ polygon: "not-an-array", scale: null }).ok, true);
  assert.ok(critiqueTakeoffGeometry({ polygon: [null, undefined, { x: 1 }] }).issues.length > 0);
});
