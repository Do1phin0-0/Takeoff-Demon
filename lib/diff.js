const sharp = require("sharp");

// Revision-comparison alignment: the two uploads are almost never pixel-registered
// (different plot margins, a shifted title block, a fraction of a degree of scan skew),
// so pixel subtraction on raw uploads produces noise, not a real diff. Instead the user
// pins two matching points on each sheet (the same interaction pattern as scale
// calibration in takeoff.html) and this computes the similarity transform (uniform
// scale + rotation + translation) that maps the "before" sheet onto the "after" sheet's
// coordinate frame, so the two can be overlaid/slid against each other honestly.
//
// This deliberately does NOT attempt automatic image registration (feature matching,
// homography) — that's a different, much harder problem, and pretending 2 manual pins
// plus this transform is "automatic alignment" would be exactly the false-certainty
// CLAUDE.md guards against. The transform is exact for the two pinned points; anything
// off that line is only as good as the pins.

// Given exactly 2 point pairs (srcPoints in the "before" image, dstPoints in the "after"
// image, same physical features in the same order), returns the similarity transform
// as a sharp affine matrix plus output-space offset: {a, b, c, d, odx, ody} such that
// for every point (x, y) in the source image,
//   X = a*x + b*y + odx
//   Y = c*x + d*y + ody
// lands on the corresponding point in the destination image's coordinate frame.
function computeSimilarityTransform(srcPoints, dstPoints) {
  if (srcPoints.length !== 2 || dstPoints.length !== 2) {
    throw new Error("computeSimilarityTransform requires exactly 2 point pairs.");
  }
  const [s1, s2] = srcPoints;
  const [d1, d2] = dstPoints;

  const svx = s2.x - s1.x;
  const svy = s2.y - s1.y;
  const dvx = d2.x - d1.x;
  const dvy = d2.y - d1.y;

  const srcLen = Math.hypot(svx, svy);
  if (srcLen < 1e-9) {
    throw new Error("The two points on the source image are the same point — pick two distinct features.");
  }

  const scale = Math.hypot(dvx, dvy) / srcLen;
  const srcAngle = Math.atan2(svy, svx);
  const dstAngle = Math.atan2(dvy, dvx);
  const theta = dstAngle - srcAngle;

  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const a = scale * cos;
  const b = -scale * sin;
  const c = scale * sin;
  const d = scale * cos;

  // Solve for the translation that sends s1 exactly onto d1 under this rotation+scale.
  const odx = d1.x - (a * s1.x + b * s1.y);
  const ody = d1.y - (c * s1.x + d * s1.y);

  return { a, b, c, d, odx, ody, scale, rotationRadians: theta };
}

// Applies the transform to `imageBuffer` (a PNG buffer) and pads/crops the result to
// exactly targetWidth x targetHeight, anchored at (0,0), so it lines up pixel-for-pixel
// with the "after" image's own canvas for overlay/slider display.
async function alignImageToTarget(imageBuffer, transform, targetWidth, targetHeight) {
  const { a, b, c, d, odx, ody } = transform;

  // Each stage is materialized to its own buffer rather than chained in one sharp
  // pipeline — chaining affine -> extend -> extract in a single pipeline (even with
  // a .clone() metadata probe in between) produces "extract_area: bad extract area"
  // from libvips despite the intermediate sizes being correct; re-loading a fresh
  // sharp() per stage avoids whatever pipeline state that leaves stale.
  const affined = await sharp(imageBuffer)
    .affine(
      [
        [a, b],
        [c, d],
      ],
      { odx, ody, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    )
    .png()
    .toBuffer();

  const { width, height } = await sharp(affined).metadata();

  // Pad first (so both dimensions are guaranteed >= target), then crop to exactly
  // target — handles the case where one dimension needs padding and the other needs
  // cropping in the same image, which a single extend-or-extract branch cannot.
  const extended = await sharp(affined)
    .extend({
      top: 0,
      left: 0,
      right: Math.max(0, targetWidth - width),
      bottom: Math.max(0, targetHeight - height),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return sharp(extended)
    .extract({ left: 0, top: 0, width: targetWidth, height: targetHeight })
    .png()
    .toBuffer();
}

module.exports = { computeSimilarityTransform, alignImageToTarget };
