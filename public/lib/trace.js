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

const COMPASS = ["EAST", "NORTH-EAST", "NORTH", "NORTH-WEST", "WEST", "SOUTH-WEST", "SOUTH", "SOUTH-EAST"];

// Canvas/SVG y grows downward, so dy is inverted before the angle is taken —
// otherwise "up the sheet" would read as south instead of north.
export function getCardinalDirection(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) return "STATIONARY";
  let angleDeg = (Math.atan2(-dy, dx) * 180) / Math.PI;
  if (angleDeg < 0) angleDeg += 360;
  return COMPASS[Math.round(angleDeg / 45) % 8];
}

// Interior angle in degrees at vertex p2, between segments p1-p2 and p2-p3.
// Purely descriptive — a non-90 result isn't flagged as wrong, since not
// every traced boundary is rectilinear.
export function calculateCornerAngle(p1, p2, p3) {
  const bax = p1.x - p2.x;
  const bay = p1.y - p2.y;
  const bcx = p3.x - p2.x;
  const bcy = p3.y - p2.y;
  const magBA = Math.hypot(bax, bay);
  const magBC = Math.hypot(bcx, bcy);
  if (magBA === 0 || magBC === 0) return 0;
  const cosTheta = Math.max(-1, Math.min(1, (bax * bcx + bay * bcy) / (magBA * magBC)));
  return round1((Math.acos(cosTheta) * 180) / Math.PI);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
