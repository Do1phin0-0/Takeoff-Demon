const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const modPromise = import(pathToFileURL(path.join(__dirname, "../public/lib/template-match.js")));

// A white RGBA sheet with helpers to stamp black shapes on it.
function makeSheet(width, height) {
  const rgba = new Uint8ClampedArray(width * height * 4).fill(255);
  const set = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
  };
  return { rgba, width, height, set };
}

// An asymmetric "door swing"-like glyph inside a size x size cell: a thick
// leaf down the left edge, a thick sill along the bottom, and a diagonal.
// `orient` 0-3 rotates it by 90° steps; `flip` mirrors it first.
function stampGlyph(sheet, ox, oy, size, orient = 0, flip = false) {
  const cell = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const on = x < 3 || y >= size - 3 || (Math.abs(x - y) <= 1 && x > size / 2);
      if (on) cell.push([x, y]);
    }
  }
  for (let [x, y] of cell) {
    if (flip) x = size - 1 - x;
    for (let r = 0; r < orient; r++) [x, y] = [size - 1 - y, x];
    sheet.set(ox + x, oy + y);
  }
}

function centersNear(matches, expected, tol) {
  return expected.every(([ex, ey]) => matches.some((m) => Math.abs(m.cx - ex) <= tol && Math.abs(m.cy - ey) <= tol));
}

test("findSimilar: finds every copy of the boxed symbol, including the box itself", async () => {
  const { findSimilar } = await modPromise;
  const sheet = makeSheet(400, 300);
  const spots = [[40, 40], [200, 60], [320, 200], [80, 220]];
  for (const [x, y] of spots) stampGlyph(sheet, x, y, 28);
  const { matches, truncated } = findSimilar({ ...sheet, box: { x: 38, y: 38, w: 32, h: 32 }, threshold: 0.7 });
  assert.equal(truncated, false);
  assert.equal(matches.length, 4);
  assert.ok(centersNear(matches, spots.map(([x, y]) => [x + 14, y + 14]), 4));
});

test("findSimilar: finds rotated and mirrored copies (how door swings repeat on a plan)", async () => {
  const { findSimilar } = await modPromise;
  const sheet = makeSheet(400, 300);
  stampGlyph(sheet, 40, 40, 28, 0, false);
  stampGlyph(sheet, 200, 60, 28, 1, false);
  stampGlyph(sheet, 320, 200, 28, 2, true);
  stampGlyph(sheet, 80, 220, 28, 3, false);
  const { matches } = findSimilar({ ...sheet, box: { x: 38, y: 38, w: 32, h: 32 }, threshold: 0.7 });
  assert.equal(matches.length, 4);
});

test("findSimilar: does not count unrelated linework or blank sheet", async () => {
  const { findSimilar } = await modPromise;
  const sheet = makeSheet(400, 300);
  stampGlyph(sheet, 40, 40, 28);
  stampGlyph(sheet, 300, 40, 28);
  // Distractors: a long wall line, a filled square, a hollow box.
  for (let x = 20; x < 380; x++) for (let t = 0; t < 3; t++) sheet.set(x, 150 + t);
  for (let y = 200; y < 228; y++) for (let x = 200; x < 228; x++) sheet.set(x, y);
  for (let i = 0; i < 28; i++) {
    sheet.set(120 + i, 240); sheet.set(120 + i, 267); sheet.set(120, 240 + i); sheet.set(147, 240 + i);
  }
  const { matches } = findSimilar({ ...sheet, box: { x: 38, y: 38, w: 32, h: 32 }, threshold: 0.7 });
  assert.equal(matches.length, 2);
});

test("findSimilar: KNOWN LIMITS — a copy at another size is not recognized, and a look-alike fragment can false-hit", async () => {
  const { findSimilar } = await modPromise;
  const sheet = makeSheet(400, 300);
  stampGlyph(sheet, 40, 40, 28);
  stampGlyph(sheet, 200, 100, 56); // same symbol at 2x, centered at (228, 128)
  const box = { x: 38, y: 38, w: 32, h: 32 };
  const loose = findSimilar({ ...sheet, box, threshold: 0.7 }).matches;
  // The 2x copy is never recognized as the symbol...
  assert.ok(!loose.some((m) => Math.abs(m.cx - 228) <= 8 && Math.abs(m.cy - 128) <= 8));
  // ...but its bottom-left corner (leaf + sill at the same stroke weight)
  // looks enough like the small symbol to score ~0.87: a false positive.
  // This is why every hit is a proposal a human must check, and why a count
  // that keeps any matched marker is scored low confidence server-side.
  assert.equal(loose.length, 2);
  const strict = findSimilar({ ...sheet, box, threshold: 0.9 }).matches;
  assert.equal(strict.length, 1);
});

test("findSimilar: rejects a blank or too-small selection instead of returning noise", async () => {
  const { findSimilar } = await modPromise;
  const sheet = makeSheet(200, 200);
  stampGlyph(sheet, 40, 40, 28);
  assert.throws(() => findSimilar({ ...sheet, box: { x: 120, y: 120, w: 40, h: 40 } }), /blank/);
  assert.throws(() => findSimilar({ ...sheet, box: { x: 40, y: 40, w: 4, h: 4 } }), /too small/);
});

test("findSimilar: large symbols are matched on a downsampled sheet and mapped back to full-res coordinates", async () => {
  const { findSimilar } = await modPromise;
  const sheet = makeSheet(900, 600);
  const spots = [[60, 60], [500, 100], [700, 400]];
  for (const [x, y] of spots) stampGlyph(sheet, x, y, 84);
  const { matches, factor } = findSimilar({ ...sheet, box: { x: 56, y: 56, w: 92, h: 92 }, threshold: 0.7 });
  assert.ok(factor > 1);
  assert.equal(matches.length, 3);
  assert.ok(centersNear(matches, spots.map(([x, y]) => [x + 42, y + 42]), 2 * factor));
});

test("nonMaxSuppression keeps the best of overlapping boxes and all disjoint ones", async () => {
  const { nonMaxSuppression } = await modPromise;
  const kept = nonMaxSuppression([
    { x: 0, y: 0, w: 10, h: 10, score: 0.8 },
    { x: 1, y: 1, w: 10, h: 10, score: 0.9 },
    { x: 50, y: 50, w: 10, h: 10, score: 0.75 },
  ]);
  assert.equal(kept.length, 2);
  assert.equal(kept[0].score, 0.9);
});

test("orientations dedupes a symmetric template", async () => {
  const { orientations } = await modPromise;
  const symmetric = { data: new Float32Array([1, 1, 1, 1]), width: 2, height: 2 };
  assert.equal(orientations(symmetric).length, 1);
  const asymmetric = { data: new Float32Array([1, 0, 0, 0, 0, 0]), width: 3, height: 2 };
  assert.equal(orientations(asymmetric).length, 8);
});
