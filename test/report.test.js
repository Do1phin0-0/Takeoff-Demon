const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildCorrectionsReport } = require("../lib/report");

function takeoff(id, overrides = {}) {
  return { id, fileName: `${id}.pdf`, pageNumber: 1, quantityType: "square_footage", ...overrides };
}

test("buildCorrectionsReport: no data yields zeroed totals, not NaN or division-by-zero garbage", () => {
  const report = buildCorrectionsReport([], [], []);
  assert.deepEqual(report.totals, {
    takeoffs: 0,
    corrections: 0,
    approvals: 0,
    takeoffsCorrected: 0,
    takeoffsApproved: 0,
    takeoffsReviewed: 0,
    takeoffsUnreviewed: 0,
  });
  assert.deepEqual(report.rates, { correctionRate: 0, approvalRate: 0, reviewRate: 0 });
  assert.equal(report.deltas.avgAbsoluteDelta, null);
  assert.equal(report.deltas.avgPercentDelta, null);
  assert.deepEqual(report.approvedThenCorrected, []);
});

test("buildCorrectionsReport: counts corrected, approved, and unreviewed takeoffs separately", () => {
  const takeoffs = [takeoff("a"), takeoff("b"), takeoff("c")];
  const corrections = [
    { takeoffId: "a", quantityType: "square_footage", originalValue: 100, correctedValue: 110, createdAt: "2026-01-01T00:00:00Z" },
  ];
  const reviews = [
    { takeoffId: "b", action: "approved", who: "AJ", createdAt: "2026-01-01T00:00:00Z" },
  ];
  const report = buildCorrectionsReport(takeoffs, corrections, reviews);
  assert.equal(report.totals.takeoffs, 3);
  assert.equal(report.totals.takeoffsCorrected, 1);
  assert.equal(report.totals.takeoffsApproved, 1);
  assert.equal(report.totals.takeoffsReviewed, 2);
  assert.equal(report.totals.takeoffsUnreviewed, 1); // takeoff "c"
  assert.equal(report.rates.correctionRate, 33.33);
});

test("buildCorrectionsReport: computes average absolute and percent delta across corrections", () => {
  const takeoffs = [takeoff("a"), takeoff("b")];
  const corrections = [
    { takeoffId: "a", quantityType: "square_footage", originalValue: 100, correctedValue: 110, createdAt: "2026-01-01T00:00:00Z" },
    { takeoffId: "b", quantityType: "square_footage", originalValue: 200, correctedValue: 180, createdAt: "2026-01-02T00:00:00Z" },
  ];
  const report = buildCorrectionsReport(takeoffs, corrections, []);
  // deltas: |10|, |20| -> avg 15
  assert.equal(report.deltas.avgAbsoluteDelta, 15);
  // percent deltas: 10/100*100=10, 20/200*100=10 -> avg 10
  assert.equal(report.deltas.avgPercentDelta, 10);
  assert.equal(report.byQuantityType.square_footage.count, 2);
  assert.equal(report.byQuantityType.square_footage.avgAbsoluteDelta, 15);
  assert.equal(report.byQuantityType.square_footage.avgPercentDelta, 10);
});

test("buildCorrectionsReport: flags a takeoff that was approved and then later corrected anyway", () => {
  const takeoffs = [takeoff("a")];
  const reviews = [{ takeoffId: "a", action: "approved", who: "AJ", createdAt: "2026-01-01T00:00:00Z" }];
  const corrections = [
    { takeoffId: "a", quantityType: "square_footage", originalValue: 100, correctedValue: 90, createdAt: "2026-01-02T00:00:00Z" },
  ];
  const report = buildCorrectionsReport(takeoffs, corrections, reviews);
  assert.equal(report.approvedThenCorrected.length, 1);
  assert.equal(report.approvedThenCorrected[0].takeoffId, "a");
  assert.equal(report.approvedThenCorrected[0].correctedValue, 90);
});

test("buildCorrectionsReport: does NOT flag the normal order — corrected, then later approved", () => {
  const takeoffs = [takeoff("a")];
  const corrections = [
    { takeoffId: "a", quantityType: "square_footage", originalValue: 100, correctedValue: 90, createdAt: "2026-01-01T00:00:00Z" },
  ];
  const reviews = [{ takeoffId: "a", action: "approved", who: "AJ", createdAt: "2026-01-02T00:00:00Z" }];
  const report = buildCorrectionsReport(takeoffs, corrections, reviews);
  assert.deepEqual(report.approvedThenCorrected, []);
});

test("buildCorrectionsReport: recentCorrections is newest-first and capped at 10, enriched with takeoff context", () => {
  const takeoffs = [takeoff("a", { fileName: "planA.pdf", pageNumber: 3 })];
  const corrections = Array.from({ length: 12 }, (_, i) => ({
    takeoffId: "a",
    quantityType: "square_footage",
    originalValue: 100,
    correctedValue: 100 + i,
    createdAt: new Date(2026, 0, i + 1).toISOString(),
  }));
  const report = buildCorrectionsReport(takeoffs, corrections, []);
  assert.equal(report.recentCorrections.length, 10);
  assert.equal(report.recentCorrections[0].correctedValue, 111); // most recent (i=11) first
  assert.equal(report.recentCorrections[0].fileName, "planA.pdf");
  assert.equal(report.recentCorrections[0].pageNumber, 3);
});

test("buildCorrectionsReport: a correction with originalValue 0 doesn't pollute percent delta with Infinity/NaN", () => {
  const takeoffs = [takeoff("a")];
  const corrections = [
    { takeoffId: "a", quantityType: "square_footage", originalValue: 0, correctedValue: 50, createdAt: "2026-01-01T00:00:00Z" },
  ];
  const report = buildCorrectionsReport(takeoffs, corrections, []);
  assert.equal(report.deltas.avgAbsoluteDelta, 50);
  assert.equal(report.deltas.avgPercentDelta, null);
  assert.equal(Number.isFinite(report.byQuantityType.square_footage.avgAbsoluteDelta), true);
});
