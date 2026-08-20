const { test } = require("node:test");
const assert = require("node:assert/strict");
const { computeWallTakeoff } = require("../lib/material-takeoff");

test("computeWallTakeoff: 40ft run, 10ft wall height — hand-verified bill of materials", () => {
  const result = computeWallTakeoff(40, 10);
  assert.equal(result.metrics.linearFeet, 40);
  assert.equal(result.metrics.totalSurfaceAreaSqFt, 800); // 40*10*2
  assert.equal(result.billOfMaterials.studCount, 31); // ceil(40 / (16/12)) + 1
  assert.equal(result.billOfMaterials.trackingChannelFeet, 80); // 40*2
  assert.equal(result.billOfMaterials.grossFramingFeet, 429); // (80 + 31*10) * 1.10
  assert.equal(result.billOfMaterials.drywallSheets, 29); // ceil((800/32) * 1.15) = ceil(28.75)
  assert.equal(result.billOfMaterials.screwBoxes, 3); // ceil(29/10)
  assert.equal(result.billOfMaterials.mudGallons, 8); // ceil(29/4)
  assert.equal(result.billOfMaterials.primerGallons, 3); // ceil((800/350)*1.05) = ceil(2.4)
  assert.equal(result.billOfMaterials.paintGallons, 5); // ceil((1600/350)*1.05) = ceil(4.8)
});

test("computeWallTakeoff: doubling the run roughly doubles sheet count and framing", () => {
  const base = computeWallTakeoff(100, 10);
  const doubled = computeWallTakeoff(200, 10);
  assert.ok(doubled.billOfMaterials.drywallSheets > base.billOfMaterials.drywallSheets * 1.9);
  assert.ok(doubled.billOfMaterials.grossFramingFeet > base.billOfMaterials.grossFramingFeet * 1.9);
});

test("computeWallTakeoff: zero-length run produces zero quantities, not NaN/negative", () => {
  const result = computeWallTakeoff(0, 10);
  assert.equal(result.metrics.totalSurfaceAreaSqFt, 0);
  assert.equal(result.billOfMaterials.drywallSheets, 0);
  assert.equal(result.billOfMaterials.mudGallons, 0);
  assert.equal(result.billOfMaterials.studCount, 1); // ceil(0) + 1 — a single stud at the start
});

test("computeWallTakeoff: no cost fields are present anywhere in the output", () => {
  const result = computeWallTakeoff(40, 10);
  const serialized = JSON.stringify(result).toLowerCase();
  assert.ok(!serialized.includes("cost"));
  assert.ok(!serialized.includes("price"));
  assert.ok(!serialized.includes("usd"));
  assert.ok(!serialized.includes("margin"));
});

test("computeWallTakeoff: default wall height is 10ft when not specified", () => {
  const withDefault = computeWallTakeoff(40);
  const explicit = computeWallTakeoff(40, 10);
  assert.deepEqual(withDefault, explicit);
});
