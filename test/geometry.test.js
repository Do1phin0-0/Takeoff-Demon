const { test } = require("node:test");
const assert = require("node:assert/strict");
const { polygonAreaPixels, computeSquareFootage, isSelfIntersecting } = require("../lib/geometry");

test("polygonAreaPixels: axis-aligned square", () => {
  const area = polygonAreaPixels([
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 200 },
    { x: 0, y: 200 },
  ]);
  assert.equal(area, 40000);
});

test("polygonAreaPixels: rotated square gives the same area as axis-aligned", () => {
  // Same 200x200 square, points listed starting from a different corner and
  // walked in the same winding order but at 45 degrees to the axes.
  const s = 200 / Math.SQRT2;
  const area = polygonAreaPixels([
    { x: 100, y: 100 - s },
    { x: 100 + s, y: 100 },
    { x: 100, y: 100 + s },
    { x: 100 - s, y: 100 },
  ]);
  assert.ok(Math.abs(area - 40000) < 0.01, `expected ~40000, got ${area}`);
});

test("polygonAreaPixels: winding order (CW vs CCW) doesn't change the area", () => {
  const cw = [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 200 },
    { x: 0, y: 200 },
  ];
  const ccw = [...cw].reverse();
  assert.equal(polygonAreaPixels(cw), polygonAreaPixels(ccw));
});

test("polygonAreaPixels: L-shaped room (concave polygon)", () => {
  // 200x200 square with a 100x100 bite taken out of the top-right corner —
  // the shape of a real room with a closet or column bump-out.
  // Expected area = 40000 - 10000 = 30000.
  const area = polygonAreaPixels([
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 100 },
    { x: 100, y: 100 },
    { x: 100, y: 200 },
    { x: 0, y: 200 },
  ]);
  assert.equal(area, 30000);
});

test("polygonAreaPixels: triangle matches 1/2 base * height", () => {
  const area = polygonAreaPixels([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 0, y: 100 },
  ]);
  assert.equal(area, 5000);
});

test("computeSquareFootage: unit 'ft' — 200x200px square, 100px = 10ft", () => {
  const { areaSqFt } = computeSquareFootage(
    [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 200 },
      { x: 0, y: 200 },
    ],
    { pixelDistance: 100, realDistance: 10, unit: "ft" }
  );
  assert.equal(areaSqFt, 400);
});

test("computeSquareFootage: unit 'in' — calibration line measured in inches converts to feet before squaring", () => {
  // Calibration: a 48px line represents a 24-inch (2ft) dimension on the sheet.
  // feetPerPixel = 2ft / 48px = 1/24 ft/px.
  // A 240x240px square -> 10ft x 10ft = 100 sq ft.
  const { areaSqFt, feetPerPixel } = computeSquareFootage(
    [
      { x: 0, y: 0 },
      { x: 240, y: 0 },
      { x: 240, y: 240 },
      { x: 0, y: 240 },
    ],
    { pixelDistance: 48, realDistance: 24, unit: "in" }
  );
  assert.equal(feetPerPixel, 1 / 24);
  assert.equal(areaSqFt, 100);
});

test("computeSquareFootage: 'in' and equivalent 'ft' calibration produce the same area", () => {
  const polygon = [
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 150 },
    { x: 0, y: 150 },
  ];
  const viaInches = computeSquareFootage(polygon, { pixelDistance: 60, realDistance: 60, unit: "in" }); // 60px = 5ft
  const viaFeet = computeSquareFootage(polygon, { pixelDistance: 60, realDistance: 5, unit: "ft" });
  assert.equal(viaInches.areaSqFt, viaFeet.areaSqFt);
});

test("isSelfIntersecting: a simple square is not self-intersecting", () => {
  assert.equal(
    isSelfIntersecting([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 200 },
      { x: 0, y: 200 },
    ]),
    false
  );
});

test("isSelfIntersecting: an L-shaped concave room is not self-intersecting", () => {
  assert.equal(
    isSelfIntersecting([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 200 },
      { x: 0, y: 200 },
    ]),
    false
  );
});

test("isSelfIntersecting: a triangle can never self-intersect", () => {
  assert.equal(
    isSelfIntersecting([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ]),
    false
  );
});

test("isSelfIntersecting: a bowtie quad (crossed edges) is detected", () => {
  // Points ordered so edge 0->1 crosses edge 2->3.
  assert.equal(
    isSelfIntersecting([
      { x: 0, y: 0 },
      { x: 200, y: 200 },
      { x: 200, y: 0 },
      { x: 0, y: 200 },
    ]),
    true
  );
});

test("isSelfIntersecting: a non-adjacent-edge crossing in a hexagon is detected", () => {
  // Edge 0-1 ((0,0)-(100,100)) crosses edge 3-4 ((50,100)-(150,0)) at (75,75);
  // neither edge shares a vertex with the other.
  assert.equal(
    isSelfIntersecting([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 200, y: 150 },
      { x: 50, y: 100 },
      { x: 150, y: 0 },
      { x: -50, y: 150 },
    ]),
    true
  );
});

test("polygonAreaPixels: a bowtie silently returns the wrong (difference, not sum) area — why the guard exists", () => {
  // Two 100x100 triangles overlapping at a point; shoelace on the crossed
  // ordering gives the difference of the lobes, not 100x100=10000 or the sum.
  const area = polygonAreaPixels([
    { x: 0, y: 0 },
    { x: 200, y: 200 },
    { x: 200, y: 0 },
    { x: 0, y: 200 },
  ]);
  assert.notEqual(area, 40000); // NOT the honest square footage of the traced outline
});

test("computeSquareFootage: L-shaped room with an 'in' calibration", () => {
  // Calibration: 100px = 4ft (48in). feetPerPixel = 0.04 ft/px.
  // L-shape from the concave test above (30000 px^2) -> 30000 * 0.04^2 = 48 sq ft.
  const { areaSqFt } = computeSquareFootage(
    [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 200 },
      { x: 0, y: 200 },
    ],
    { pixelDistance: 100, realDistance: 48, unit: "in" }
  );
  assert.equal(areaSqFt, 48);
});
