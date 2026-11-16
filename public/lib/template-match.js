// "Find similar" for the count tool: classic normalized cross-correlation
// template matching. Pure functions over typed arrays — no DOM, no canvas —
// so the browser imports this as a native ES module and `node --test` imports
// the same file.
//
// What this is NOT: a trained symbol detector. It finds regions that look
// pixel-for-pixel like the one box the user drew, at the same size, in the 8
// axis-aligned orientations (4 rotations x mirror — how a door swing actually
// repeats on a plan). It will miss the same symbol drawn at another scale or
// an arbitrary angle, or with a dimension line through it, and it can hit
// look-alike linework. Every hit is therefore a PROPOSAL the user reviews —
// the takeoff UI marks matched markers differently from hand-placed ones and
// the server scores a count that kept any of them as low confidence.

export function toGray(rgba, width, height) {
  const gray = new Float32Array(width * height);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
    gray[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
  }
  return gray;
}

// Box-average downsample by an integer factor. Trailing pixels that don't
// fill a whole block are dropped.
export function downsample(gray, width, height, factor) {
  if (factor <= 1) return { data: gray, width, height };
  const w = Math.floor(width / factor);
  const h = Math.floor(height / factor);
  const out = new Float32Array(w * h);
  const norm = 1 / (factor * factor);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dy = 0; dy < factor; dy++) {
        const row = (y * factor + dy) * width + x * factor;
        for (let dx = 0; dx < factor; dx++) sum += gray[row + dx];
      }
      out[y * w + x] = sum * norm;
    }
  }
  return { data: out, width: w, height: h };
}

export function crop(gray, width, box) {
  const out = new Float32Array(box.w * box.h);
  for (let y = 0; y < box.h; y++) {
    for (let x = 0; x < box.w; x++) out[y * box.w + x] = gray[(box.y + y) * width + box.x + x];
  }
  return { data: out, width: box.w, height: box.h };
}

function rotate90(t) {
  const out = new Float32Array(t.data.length);
  const w = t.height;
  const h = t.width;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) out[y * w + x] = t.data[(t.height - 1 - x) * t.width + y];
  }
  return { data: out, width: w, height: h };
}

function mirror(t) {
  const out = new Float32Array(t.data.length);
  for (let y = 0; y < t.height; y++) {
    for (let x = 0; x < t.width; x++) out[y * t.width + x] = t.data[y * t.width + (t.width - 1 - x)];
  }
  return { data: out, width: t.width, height: t.height };
}

function sameTemplate(a, b) {
  if (a.width !== b.width || a.height !== b.height) return false;
  for (let i = 0; i < a.data.length; i++) if (Math.abs(a.data[i] - b.data[i]) > 1e-3) return false;
  return true;
}

// The 4 rotations x mirror of a template, with exact duplicates removed (a
// symmetric symbol would otherwise be scanned 8 times for the same hits).
export function orientations(template) {
  const out = [];
  let t = template;
  for (let r = 0; r < 4; r++) {
    for (const candidate of [t, mirror(t)]) {
      if (!out.some((o) => sameTemplate(o, candidate))) out.push(candidate);
    }
    t = rotate90(t);
  }
  return out;
}

// Zero-mean, unit-norm copy of a template, or null if it has no contrast
// (a blank box correlates with nothing meaningfully).
function normalizeTemplate(t) {
  const n = t.data.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += t.data[i];
  mean /= n;
  let ss = 0;
  for (let i = 0; i < n; i++) ss += (t.data[i] - mean) ** 2;
  const std = Math.sqrt(ss / n);
  if (std < 2) return null;
  const data = new Float32Array(n);
  const inv = 1 / Math.sqrt(ss);
  for (let i = 0; i < n; i++) data[i] = (t.data[i] - mean) * inv;
  return { data, width: t.width, height: t.height, std };
}

function integralImages(gray, width, height) {
  const W = width + 1;
  const sum = new Float64Array(W * (height + 1));
  const sq = new Float64Array(W * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    let rowSq = 0;
    for (let x = 0; x < width; x++) {
      const v = gray[y * width + x];
      rowSum += v;
      rowSq += v * v;
      sum[(y + 1) * W + x + 1] = sum[y * W + x + 1] + rowSum;
      sq[(y + 1) * W + x + 1] = sq[y * W + x + 1] + rowSq;
    }
  }
  return { sum, sq, W };
}

// Normalized cross-correlation of one template over an image. Returns every
// window scoring >= threshold as {x, y, w, h, score} (top-left, image coords).
// Windows with far less contrast than the template (blank paper — most of a
// plan sheet) are skipped before the per-pixel correlation runs.
export function matchTemplate(image, template, threshold, integrals) {
  const t = normalizeTemplate(template);
  if (!t) return [];
  const { data: img, width: iw, height: ih } = image;
  const { width: tw, height: th } = t;
  if (tw > iw || th > ih) return [];
  const { sum, sq, W } = integrals || integralImages(img, iw, ih);
  const n = tw * th;
  const minStd = t.std * 0.4;
  const hits = [];
  for (let y = 0; y <= ih - th; y++) {
    for (let x = 0; x <= iw - tw; x++) {
      const a = y * W + x;
      const b = (y + th) * W + x;
      const s = sum[b + tw] - sum[b] - sum[a + tw] + sum[a];
      const q = sq[b + tw] - sq[b] - sq[a + tw] + sq[a];
      const variance = q / n - (s / n) ** 2;
      if (variance < minStd * minStd) continue;
      let dot = 0;
      for (let ty = 0; ty < th; ty++) {
        const irow = (y + ty) * iw + x;
        const trow = ty * tw;
        for (let tx = 0; tx < tw; tx++) dot += img[irow + tx] * t.data[trow + tx];
      }
      // sum(t) = 0, so the window mean drops out of the numerator.
      const score = dot / Math.sqrt(variance * n);
      if (score >= threshold) hits.push({ x, y, w: tw, h: th, score });
    }
  }
  return hits;
}

function iou(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

// Greedy non-maximum suppression: keep the best-scoring box, drop any box
// overlapping a kept one by >= iouThreshold.
export function nonMaxSuppression(hits, iouThreshold = 0.3) {
  const sorted = hits.slice().sort((a, b) => b.score - a.score);
  const kept = [];
  for (const h of sorted) {
    if (!kept.some((k) => iou(k, h) >= iouThreshold)) kept.push(h);
  }
  return kept;
}

export const MAX_MATCHES = 500;
const TARGET_TEMPLATE_PX = 14; // short side of the template after downsampling
const MIN_SELECTION_PX = 8;

// Top-level entry: given the sheet's RGBA pixels and the box the user drew
// around ONE symbol, return every look-alike as full-resolution
// {x, y, w, h, cx, cy, score}. The user's own box comes back as a hit (it
// matches itself) — it is instance #1, not a duplicate.
//
// Throws on a selection that is too small or blank. Returns
// { matches, truncated } — truncated means the threshold let through more
// than MAX_MATCHES candidates, which is noise, not a count.
export function findSimilar({ rgba, width, height, box, threshold = 0.7 }) {
  const b = {
    x: Math.max(0, Math.round(box.x)),
    y: Math.max(0, Math.round(box.y)),
    w: Math.round(box.w),
    h: Math.round(box.h),
  };
  b.w = Math.min(b.w, width - b.x);
  b.h = Math.min(b.h, height - b.y);
  if (b.w < MIN_SELECTION_PX || b.h < MIN_SELECTION_PX) {
    throw new Error("Selection is too small — drag a box tightly around one whole symbol.");
  }
  const factor = Math.max(1, Math.min(8, Math.floor(Math.min(b.w, b.h) / TARGET_TEMPLATE_PX)));
  const gray = toGray(rgba, width, height);
  const image = downsample(gray, width, height, factor);
  // Downsample the template from the same block grid as the image so the
  // user's own symbol correlates at ~1.0 with itself.
  const tb = {
    x: Math.ceil(b.x / factor),
    y: Math.ceil(b.y / factor),
    w: 0,
    h: 0,
  };
  tb.w = Math.floor((b.x + b.w) / factor) - tb.x;
  tb.h = Math.floor((b.y + b.h) / factor) - tb.y;
  if (tb.w < 3 || tb.h < 3) {
    throw new Error("Selection is too small — drag a box tightly around one whole symbol.");
  }
  const template = crop(image.data, image.width, tb);
  if (!normalizeTemplate(template)) {
    throw new Error("Selection is blank — drag a box around a symbol, not empty sheet.");
  }
  const integrals = integralImages(image.data, image.width, image.height);
  let hits = [];
  for (const variant of orientations(template)) {
    hits = hits.concat(matchTemplate(image, variant, threshold, integrals));
  }
  const kept = nonMaxSuppression(hits);
  const truncated = kept.length > MAX_MATCHES;
  const matches = kept.slice(0, MAX_MATCHES).map((h) => ({
    x: h.x * factor,
    y: h.y * factor,
    w: h.w * factor,
    h: h.h * factor,
    cx: (h.x + h.w / 2) * factor,
    cy: (h.y + h.h / 2) * factor,
    score: Math.round(h.score * 1000) / 1000,
  }));
  return { matches, truncated, factor };
}
