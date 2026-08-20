// Pure path-measurement helpers for the takeoff HUD. No DOM, no canvas —
// unit-testable with `node --test` and importable as a native ES module from
// the browser. This does not replace the server's independent area check in
// lib/geometry.js; it only backs the live client-side readout while tracing.

export function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// Walks an ordered list of points and returns each segment's real-world
// length plus the running total, converted via feetPerPixel. Needs at least
// two points to produce a segment.
export function processPath(points, feetPerPixel) {
  if (!points || points.length < 2) return [];
  const segments = [];
  let accumulatedPixels = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    const segmentPixels = distance(from, to);
    accumulatedPixels += segmentPixels;
    segments.push({
      segmentIndex: i + 1,
      from,
      to,
      segmentFeet: round2(segmentPixels * feetPerPixel),
      totalFeet: round2(accumulatedPixels * feetPerPixel),
    });
  }
  return segments;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
