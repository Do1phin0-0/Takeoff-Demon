const { test } = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const { computeSimilarityTransform, alignImageToTarget } = require("../lib/diff");

function applyTransform(t, p) {
  return { x: t.a * p.x + t.b * p.y + t.odx, y: t.c * p.x + t.d * p.y + t.ody };
}

function approxEqual(actual, expected, tolerance = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

test("computeSimilarityTransform: identity when both point pairs are identical", () => {
  const t = computeSimilarityTransform(
    [{ x: 10, y: 10 }, { x: 50, y: 10 }],
    [{ x: 10, y: 10 }, { x: 50, y: 10 }]
  );
  approxEqual(t.scale, 1);
  approxEqual(t.rotationRadians, 0);
  const p = applyTransform(t, { x: 30, y: 30 });
  approxEqual(p.x, 30);
  approxEqual(p.y, 30);
});

test("computeSimilarityTransform: pure translation", () => {
  const t = computeSimilarityTransform(
    [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    [{ x: 20, y: 40 }, { x: 120, y: 40 }]
  );
  approxEqual(t.scale, 1);
  approxEqual(t.rotationRadians, 0);
  const p = applyTransform(t, { x: 50, y: 50 });
  approxEqual(p.x, 70);
  approxEqual(p.y, 90);
});

test("computeSimilarityTransform: pure uniform scale (2x)", () => {
  const t = computeSimilarityTransform(
    [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    [{ x: 0, y: 0 }, { x: 20, y: 0 }]
  );
  approxEqual(t.scale, 2);
  const p = applyTransform(t, { x: 10, y: 10 });
  approxEqual(p.x, 20);
  approxEqual(p.y, 20);
});

test("computeSimilarityTransform: 90-degree rotation about the first pin", () => {
  // src vector points +x, dst vector points +y -> 90deg rotation, pin held at (5,5)->(5,5)
  const t = computeSimilarityTransform(
    [{ x: 5, y: 5 }, { x: 15, y: 5 }],
    [{ x: 5, y: 5 }, { x: 5, y: 15 }]
  );
  approxEqual(t.scale, 1);
  approxEqual(t.rotationRadians, Math.PI / 2);
  // a point 3 units further along +x from the pin should land 3 units further along +y
  const p = applyTransform(t, { x: 8, y: 5 });
  approxEqual(p.x, 5, 1e-9);
  approxEqual(p.y, 8, 1e-9);
});

test("computeSimilarityTransform: both pinned points map exactly onto their targets", () => {
  const src = [{ x: 12, y: 87 }, { x: 340, y: 55 }];
  const dst = [{ x: 100, y: 100 }, { x: 410, y: 40 }];
  const t = computeSimilarityTransform(src, dst);
  const p1 = applyTransform(t, src[0]);
  const p2 = applyTransform(t, src[1]);
  approxEqual(p1.x, dst[0].x);
  approxEqual(p1.y, dst[0].y);
  approxEqual(p2.x, dst[1].x);
  approxEqual(p2.y, dst[1].y);
});

test("computeSimilarityTransform: rejects two identical points on the source image", () => {
  assert.throws(() => {
    computeSimilarityTransform(
      [{ x: 5, y: 5 }, { x: 5, y: 5 }],
      [{ x: 0, y: 0 }, { x: 10, y: 0 }]
    );
  });
});

test("computeSimilarityTransform: rejects a point-pair count other than 2", () => {
  assert.throws(() => computeSimilarityTransform([{ x: 0, y: 0 }], [{ x: 0, y: 0 }]));
});

async function redSquareOnWhite(canvasWidth, canvasHeight, squareLeft, squareTop, squareSize) {
  const square = await sharp({
    create: { width: squareSize, height: squareSize, channels: 3, background: "#ff0000" },
  }).png().toBuffer();
  return sharp({ create: { width: canvasWidth, height: canvasHeight, channels: 3, background: "#ffffff" } })
    .composite([{ input: square, left: squareLeft, top: squareTop }])
    .png()
    .toBuffer();
}

async function pixelAt(buffer, x, y) {
  const { data, info } = await sharp(buffer).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

test("alignImageToTarget: translation-only transform moves content to the expected pixel and matches target canvas size", async () => {
  // "before" image: red 40x40 square at (20,20) on a 200x150 canvas
  const before = await redSquareOnWhite(200, 150, 20, 20, 40);
  const t = computeSimilarityTransform(
    [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    [{ x: 30, y: 10 }, { x: 130, y: 10 }] // pure +30,+10 translation
  );
  const aligned = await alignImageToTarget(before, t, 250, 200);
  const meta = await sharp(aligned).metadata();
  assert.equal(meta.width, 250);
  assert.equal(meta.height, 200);

  // the square's original top-left corner (20,20) should now sit at (50,30)
  const inside = await pixelAt(aligned, 55, 35);
  assert.deepEqual(inside.slice(0, 3), [255, 0, 0]);
  // just outside the moved square's original footprint stays background/transparent
  const outside = await pixelAt(aligned, 5, 5);
  assert.notDeepEqual(outside.slice(0, 3), [255, 0, 0]);
});

test("alignImageToTarget: pads a smaller source up to a larger target canvas", async () => {
  const before = await redSquareOnWhite(100, 80, 10, 10, 20);
  const identity = computeSimilarityTransform(
    [{ x: 0, y: 0 }, { x: 50, y: 0 }],
    [{ x: 0, y: 0 }, { x: 50, y: 0 }]
  );
  const aligned = await alignImageToTarget(before, identity, 300, 250);
  const meta = await sharp(aligned).metadata();
  assert.equal(meta.width, 300);
  assert.equal(meta.height, 250);
});

test("alignImageToTarget: crops a larger source down to a smaller target canvas", async () => {
  const before = await redSquareOnWhite(400, 400, 10, 10, 20);
  const identity = computeSimilarityTransform(
    [{ x: 0, y: 0 }, { x: 50, y: 0 }],
    [{ x: 0, y: 0 }, { x: 50, y: 0 }]
  );
  const aligned = await alignImageToTarget(before, identity, 150, 120);
  const meta = await sharp(aligned).metadata();
  assert.equal(meta.width, 150);
  assert.equal(meta.height, 120);
});
