function polygonAreaPixels(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const { x: x1, y: y1 } = points[i];
    const { x: x2, y: y2 } = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

// Coordinates can arrive as non-integer floats (canvas events scaled by
// devicePixelRatio), so collinearity is tested against a tolerance rather
// than exact zero to avoid missing a genuinely collinear point to rounding.
const ORIENTATION_EPSILON = 1e-9;

// Orientation of ordered triplet (p, q, r): 0 = collinear, 1 = clockwise, 2 = counterclockwise.
function orientation(p, q, r) {
  const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  if (Math.abs(val) < ORIENTATION_EPSILON) return 0;
  return val > 0 ? 1 : 2;
}

// True if q lies on segment p-r, given p, q, r are already known to be collinear.
function onSegment(p, q, r) {
  return (
    Math.min(p.x, r.x) <= q.x && q.x <= Math.max(p.x, r.x) &&
    Math.min(p.y, r.y) <= q.y && q.y <= Math.max(p.y, r.y)
  );
}

function segmentsIntersect(p1, p2, p3, p4) {
  const o1 = orientation(p1, p2, p3);
  const o2 = orientation(p1, p2, p4);
  const o3 = orientation(p3, p4, p1);
  const o4 = orientation(p3, p4, p2);

  if (o1 !== o2 && o3 !== o4) return true;

  if (o1 === 0 && onSegment(p1, p3, p2)) return true;
  if (o2 === 0 && onSegment(p1, p4, p2)) return true;
  if (o3 === 0 && onSegment(p3, p1, p4)) return true;
  if (o4 === 0 && onSegment(p3, p2, p4)) return true;

  return false;
}

// A polygon that crosses itself (a "bowtie") makes the shoelace formula silently
// return the wrong area (the difference of the two lobes, not their sum) instead
// of erroring — this catches that before it ever reaches computeSquareFootage.
function isSelfIntersecting(points) {
  const n = points.length;
  if (n < 4) return false; // a triangle's edges can never cross
  for (let i = 0; i < n; i++) {
    const a1 = points[i];
    const a2 = points[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      const sharesVertex = j === i + 1 || (i === 0 && j === n - 1);
      if (sharesVertex) continue;
      const b1 = points[j];
      const b2 = points[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

function computeSquareFootage(polygon, scale) {
  const feetPerUnit = scale.unit === "in" ? 1 / 12 : 1;
  const realDistanceFeet = scale.realDistance * feetPerUnit;
  const feetPerPixel = realDistanceFeet / scale.pixelDistance;
  const areaPixels = polygonAreaPixels(polygon);
  const areaSqFt = areaPixels * feetPerPixel * feetPerPixel;
  return { areaSqFt, feetPerPixel, areaPixels };
}

module.exports = { polygonAreaPixels, computeSquareFootage, isSelfIntersecting };
