const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const tracePromise = import(pathToFileURL(path.join(__dirname, "../public/lib/trace.js")));

test("distance: horizontal segment", async () => {
  const { distance } = await tracePromise;
  assert.equal(distance({ x: 0, y: 0 }, { x: 3, y: 0 }), 3);
});

test("distance: 3-4-5 triangle", async () => {
  const { distance } = await tracePromise;
  assert.equal(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test("processPath: empty and single-point input produce no segments", async () => {
  const { processPath } = await tracePromise;
  assert.deepEqual(processPath([], 1), []);
  assert.deepEqual(processPath([{ x: 0, y: 0 }], 1), []);
});

test("processPath: accumulates length across segments and converts via feetPerPixel", async () => {
  const { processPath } = await tracePromise;
  const points = [
    { x: 0, y: 0 },
    { x: 10, y: 0 }, // +10px
    { x: 10, y: 10 }, // +10px
  ];
  const segments = processPath(points, 0.5); // 0.5 ft per pixel
  assert.equal(segments.length, 2);
  assert.equal(segments[0].segmentFeet, 5);
  assert.equal(segments[0].totalFeet, 5);
  assert.equal(segments[1].segmentFeet, 5);
  assert.equal(segments[1].totalFeet, 10);
  assert.equal(segments[0].segmentIndex, 1);
  assert.equal(segments[1].segmentIndex, 2);
});

test("processPath: matches a manual distance sum on an irregular path", async () => {
  const { processPath, distance } = await tracePromise;
  const points = [
    { x: 5, y: 5 },
    { x: 40, y: 12 },
    { x: 18, y: 60 },
    { x: 90, y: 75 },
  ];
  const feetPerPixel = 0.083333;
  const segments = processPath(points, feetPerPixel);
  let expectedTotal = 0;
  for (let i = 0; i < points.length - 1; i++) {
    expectedTotal += distance(points[i], points[i + 1]) * feetPerPixel;
  }
  const lastTotal = segments[segments.length - 1].totalFeet;
  assert.ok(Math.abs(lastTotal - expectedTotal) < 0.01);
});
