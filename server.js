const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const basicAuth = require("express-basic-auth");
const sharp = require("sharp");
const { Helper: DxfHelper } = require("dxf");
const { PDFDocument } = require("pdf-lib");
const Anthropic = require("@anthropic-ai/sdk");
const { generateSubcontractDocx, FINALIZE_SUBCONTRACT_TOOL } = require("./lib/subcontract");
const { makeJsonFileStore } = require("./lib/store");
const {
  computeSquareFootage,
  computeLinearFootage,
  isSelfIntersecting,
  polygonAreaPixels,
  polylineLengthPixels,
} = require("./lib/geometry");
const { computeSimilarityTransform, alignImageToTarget } = require("./lib/diff");

const SUPPORTED_QUANTITY_TYPES = ["square_footage", "linear_footage"];
const { buildCorrectionsReport } = require("./lib/report");

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");
const MANIFEST_PATH = path.join(UPLOAD_DIR, "manifest.json");
const MAX_HISTORY_BATCHES = Number(process.env.MAX_HISTORY_BATCHES) || 50;
const MAX_DISK_BYTES = Number(process.env.MAX_DISK_BYTES) || 800 * 1024 * 1024;
const CONTRACTS_DIR = path.join(UPLOAD_DIR, "contracts");
const CONTRACTS_MANIFEST_PATH = path.join(UPLOAD_DIR, "contracts.json");
const MAX_CONTRACTS = Number(process.env.MAX_CONTRACTS) || 200;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(CONTRACTS_DIR, { recursive: true });

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// Claude reads these directly; DXF gets rendered to PNG first. DWG/TIFF need manual review.
const ANALYZABLE_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const MAX_ANALYSIS_BYTES = 30 * 1024 * 1024;
const MAX_BATCH_ANALYSIS_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 100; // Claude's document API limit.

const TAKEOFF_PROMPT = `You are a construction estimator's assistant reviewing a batch of uploaded blueprint sheets and/or job-site photos, labeled by filename below. Produce one consolidated takeoff summary covering the whole batch, with these sections:

1. What this set shows (plan types, area, or scope) — reference sheets by filename where it helps.
2. Key materials and quantities visible or inferable across the sheets (rough counts/dimensions where possible).
3. Notable scope items or trades involved.
4. Assumptions and caveats — flag anything illegible, ambiguous, contradictory between sheets, or requiring field verification.

Be direct and use bullet points. This is a rough read to help move a project forward, not a certified takeoff — make that limitation clear if quantities are uncertain.`;

const COMPARE_PROMPT = `You are looking at two versions of the same construction plan sheet, already aligned to a common coordinate frame by a human-supplied reference: the first image is the "before" revision, the second is the "after" revision.

List what appears to have changed between them — additions, deletions, relocations, dimension or label changes — as specific, itemized bullets (e.g. "Partition wall appears relocated toward the west side of the grid near the top of the sheet"). Reference visible grid lines, room names, or labels where possible instead of vague positions.

This is a rough visual read to help a human spot likely scope changes faster, not a certified revision comparison. The alignment came from two manually pinned points, not automatic registration, so a shift you see near the edges of the sheet (far from the pinned points) may be alignment drift rather than a real change. State that limitation, and tell the user every item here needs to be verified against the actual sheets before it goes into a change order or contract amendment.`;

const SUBCONTRACT_AGENT_PROMPT =
  fs.readFileSync(path.join(__dirname, "prompts", "subcontract-agent.md"), "utf8") +
  "\n\n## Tool use\nOnce every required field above has been collected and confirmed with the user, call the finalize_subcontract tool with the structured data. Do not call it before then — ask clarifying questions and confirm each field first, per the workflow above.";

// --- History (manifest) persistence ---

function loadBatches() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  } catch {
    return [];
  }
}

let batches = loadBatches();
let manifestWriteChain = Promise.resolve();

function persistBatches() {
  const snapshot = JSON.stringify(batches, null, 2);
  manifestWriteChain = manifestWriteChain
    .then(() => fs.promises.writeFile(MANIFEST_PATH, snapshot))
    .catch((err) => console.error("Failed to persist manifest:", err.message));
  return manifestWriteChain;
}

function batchBytes(batch) {
  return batch.files.reduce((sum, f) => sum + f.size, 0);
}

function deleteBatchFiles(batch) {
  for (const f of batch.files) {
    fs.promises.unlink(path.join(UPLOAD_DIR, f.storedName)).catch(() => {});
  }
}

// Evicts oldest batches (deleting their stored files) once history exceeds
// MAX_HISTORY_BATCHES or MAX_DISK_BYTES, so disk usage stays bounded.
function pruneBatches() {
  let total = batches.reduce((sum, b) => sum + batchBytes(b), 0);
  while (batches.length > MAX_HISTORY_BATCHES || total > MAX_DISK_BYTES) {
    const evicted = batches.pop();
    if (!evicted) break;
    total -= batchBytes(evicted);
    deleteBatchFiles(evicted);
  }
}

function addBatch(batch) {
  batches.unshift(batch);
  pruneBatches();
  return persistBatches();
}

// --- Contract history (separate manifest) persistence ---

function loadContracts() {
  try {
    return JSON.parse(fs.readFileSync(CONTRACTS_MANIFEST_PATH, "utf8"));
  } catch {
    return [];
  }
}

let contracts = loadContracts();
let contractsWriteChain = Promise.resolve();

function persistContracts() {
  const snapshot = JSON.stringify(contracts, null, 2);
  contractsWriteChain = contractsWriteChain
    .then(() => fs.promises.writeFile(CONTRACTS_MANIFEST_PATH, snapshot))
    .catch((err) => console.error("Failed to persist contracts manifest:", err.message));
  return contractsWriteChain;
}

function addContract(contract) {
  contracts.unshift(contract);
  while (contracts.length > MAX_CONTRACTS) {
    const evicted = contracts.pop();
    fs.promises.unlink(path.join(CONTRACTS_DIR, evicted.storedName)).catch(() => {});
  }
  return persistContracts();
}

// --- File type handling ---

// --- Takeoff (measured quantities) storage ---

const MARKUP_DIR = path.join(UPLOAD_DIR, "markups");
const COMPARE_DIR = path.join(UPLOAD_DIR, "compare");
// legacy build: supports a wider browser range than the default build,
// which relies on very new JS builtins (e.g. Map.getOrInsertComputed).
const PDFJS_DIR = path.join(__dirname, "node_modules", "pdfjs-dist", "legacy", "build");
fs.mkdirSync(MARKUP_DIR, { recursive: true });
fs.mkdirSync(COMPARE_DIR, { recursive: true });

const takeoffsStore = makeJsonFileStore(path.join(UPLOAD_DIR, "data", "takeoffs.json"));
const correctionsStore = makeJsonFileStore(path.join(UPLOAD_DIR, "data", "corrections.json"));
const reviewsStore = makeJsonFileStore(path.join(UPLOAD_DIR, "data", "reviews.json"));
const comparisonsStore = makeJsonFileStore(path.join(UPLOAD_DIR, "data", "comparisons.json"));

const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".tif",
  ".tiff",
  ".dwg",
  ".dxf",
]);

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/tiff",
  "image/vnd.dwg",
  "image/x-dwg",
  "application/acad",
  "application/x-acad",
  "application/autocad_dwg",
  "application/dwg",
  "application/x-dwg",
  "application/dxf",
  "application/x-dxf",
  "image/vnd.dxf",
  "application/octet-stream",
]);

// Anthropic SDK errors stringify their whole JSON body into err.message;
// pull out just the human-readable part when the API provides one.
function cleanApiErrorMessage(err, fallback) {
  const nested = err?.error?.error?.message;
  return typeof nested === "string" ? nested : err.message || fallback;
}

// Builds a Claude content block for a file, or returns a skip reason.
async function prepareFile(file) {
  if (file.size > MAX_ANALYSIS_BYTES) {
    return { skip: "File too large for AI analysis (30 MB limit)." };
  }

  const ext = path.extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype;

  if (ANALYZABLE_IMAGE_TYPES.has(mimeType)) {
    return {
      block: {
        type: "image",
        source: {
          type: "base64",
          media_type: mimeType,
          data: fs.readFileSync(file.path).toString("base64"),
        },
      },
    };
  }

  if (ext === ".pdf") {
    const buffer = fs.readFileSync(file.path);
    try {
      const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
      if (pdf.isEncrypted) {
        return { skip: "This PDF is password-protected — remove the password and re-upload for analysis." };
      }
      const pageCount = pdf.getPageCount();
      if (pageCount > MAX_PDF_PAGES) {
        return {
          skip: `This PDF has ${pageCount} pages, over Claude's ${MAX_PDF_PAGES}-page limit — split it or export the relevant sheets separately.`,
        };
      }
    } catch (err) {
      return { skip: `Could not read this PDF (${err.message}) — it may be corrupted.` };
    }
    return {
      block: {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: buffer.toString("base64"),
        },
      },
    };
  }

  if (ext === ".dxf") {
    try {
      const dxfText = fs.readFileSync(file.path, "utf8");
      const svg = new DxfHelper(dxfText).toSVG();
      const png = await sharp(Buffer.from(svg)).png().toBuffer();
      return {
        block: {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: png.toString("base64"),
          },
        },
      };
    } catch (err) {
      return { skip: `Could not render this DXF for analysis (${err.message}).` };
    }
  }

  if (ext === ".dwg") {
    return {
      skip: "DWG is a binary CAD format we can't render yet — stored for manual review. Export to DXF or PDF for AI analysis.",
    };
  }

  return { skip: `File type ${ext || mimeType} isn't supported for AI analysis yet — view it manually.` };
}

async function analyzeBatch(files) {
  if (!anthropic) {
    return { status: "skipped", reason: "AI analysis not configured (missing ANTHROPIC_API_KEY)." };
  }

  const prepared = await Promise.all(
    files.map(async (f) => ({ file: f, ...(await prepareFile(f)) }))
  );

  const included = [];
  const skippedFiles = [];
  let budgetUsed = 0;
  for (const p of prepared) {
    if (!p.block) {
      skippedFiles.push({ originalName: p.file.originalname, reason: p.skip });
      continue;
    }
    if (budgetUsed + p.file.size > MAX_BATCH_ANALYSIS_BYTES) {
      skippedFiles.push({
        originalName: p.file.originalname,
        reason: "Batch size limit reached — upload separately for analysis.",
      });
      continue;
    }
    budgetUsed += p.file.size;
    included.push(p);
  }

  if (included.length === 0) {
    return { status: "skipped", reason: "No analyzable files in this upload.", skippedFiles };
  }

  const content = [];
  for (const p of included) {
    content.push({ type: "text", text: `Sheet: ${p.file.originalname}` });
    content.push(p.block);
  }
  let promptText = TAKEOFF_PROMPT;
  if (skippedFiles.length > 0) {
    promptText += `\n\nNote: these files were also uploaded but could not be read for analysis; mention that they are stored for manual review: ${skippedFiles
      .map((s) => s.originalName)
      .join(", ")}.`;
  }
  content.push({ type: "text", text: promptText });

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1536,
      messages: [{ role: "user", content }],
    });
    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    return { status: "ok", text, skippedFiles };
  } catch (err) {
    return { status: "error", reason: cleanApiErrorMessage(err, "AI analysis failed."), skippedFiles };
  }
}

// Advisory-only, same as analyzeBatch: describes likely changes between two aligned
// revisions, but there is no server-side verification of any change it names (unlike
// the measured area/length in the takeoff pipeline, which is computed and checked, not
// guessed) — see CLAUDE.md Section 6.5 (no unproven quantity as deliverable).
async function analyzeComparison(afterBuffer, alignedBeforeBuffer) {
  if (!anthropic) {
    return { status: "skipped", reason: "AI analysis not configured (missing ANTHROPIC_API_KEY)." };
  }
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1536,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Before revision (aligned to the after revision's frame):" },
            { type: "image", source: { type: "base64", media_type: "image/png", data: alignedBeforeBuffer.toString("base64") } },
            { type: "text", text: "After revision:" },
            { type: "image", source: { type: "base64", media_type: "image/png", data: afterBuffer.toString("base64") } },
            { type: "text", text: COMPARE_PROMPT },
          ],
        },
      ],
    });
    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    return { status: "ok", text };
  } catch (err) {
    return { status: "error", reason: cleanApiErrorMessage(err, "AI comparison failed.") };
  }
}

// --- Upload handling ---

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 80);
    cb(null, `${Date.now()}-${base}${ext.toLowerCase()}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(new Error(`File type ${ext || "(none)"} is not allowed.`));
    }
    if (file.mimetype && !ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error(`MIME type ${file.mimetype} is not allowed.`));
    }
    cb(null, true);
  },
});

// --- Auth ---
// Health check stays open so Render's health probe doesn't need credentials.
app.get("/health", (_req, res) => res.json({ ok: true }));

const { AUTH_USERNAME, AUTH_PASSWORD } = process.env;
if (AUTH_USERNAME && AUTH_PASSWORD) {
  app.use(basicAuth({ users: { [AUTH_USERNAME]: AUTH_PASSWORD }, challenge: true }));
} else if (AUTH_USERNAME || AUTH_PASSWORD) {
  throw new Error("Both AUTH_USERNAME and AUTH_PASSWORD must be set together.");
} else {
  console.warn(
    "AUTH_USERNAME/AUTH_PASSWORD not set — running without authentication. Set both before deploying publicly."
  );
}

app.use(express.static(path.join(__dirname, "public")));
// 40mb: takeoff markup proofs and (bigger) revision-comparison page pairs arrive
// as PNG data URLs, far over the 1mb default.
app.use(express.json({ limit: "40mb" }));
app.use("/vendor/pdfjs", express.static(PDFJS_DIR));

function safeStoredFilePath(baseDir, requestedName) {
  const name = path.basename(String(requestedName || ""));
  const resolved = path.join(baseDir, name);
  if (!resolved.startsWith(baseDir + path.sep)) return null;
  return resolved;
}

app.get("/uploads/:filename", (req, res) => {
  const filePath = safeStoredFilePath(UPLOAD_DIR, req.params.filename);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return res.status(404).json({ error: "File not found." });
  }
  res.sendFile(filePath);
});

app.get("/uploads/markups/:filename", (req, res) => {
  const filePath = safeStoredFilePath(MARKUP_DIR, req.params.filename);
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Markup not found." });
  }
  res.sendFile(filePath);
});

app.get("/uploads/compare/:filename", (req, res) => {
  const filePath = safeStoredFilePath(COMPARE_DIR, req.params.filename);
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Comparison image not found." });
  }
  res.sendFile(filePath);
});

// Short alias for the subcontract-drafting page.
app.get("/contract", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "contracts.html"));
});

app.post("/upload", (req, res) => {
  upload.array("files", 20)(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          error: `File too large. Max size is ${MAX_FILE_BYTES / (1024 * 1024)} MB.`,
        });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    const rawFiles = req.files || [];
    const analysis = await analyzeBatch(rawFiles);
    const batch = {
      id: `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
      createdAt: new Date().toISOString(),
      files: rawFiles.map((f) => ({
        originalName: f.originalname,
        storedName: f.filename,
        size: f.size,
        mimeType: f.mimetype,
      })),
      analysis,
    };
    await addBatch(batch);
    res.json(batch);
  });
});

function decodeDataUrlPng(dataUrl) {
  const match = /^data:image\/png;base64,(.+)$/.exec(String(dataUrl || ""));
  if (!match) return null;
  return Buffer.from(match[1], "base64");
}

function scoreConfidence({ scale, polygon, minPoints, isArea, measurePixels, canvasWidth, canvasHeight }) {
  const reasons = [];
  if (scale.pixelDistance < 40) {
    reasons.push("Calibration line was under 40px — scale may be imprecise.");
  }
  if (polygon.length < minPoints) {
    reasons.push(`${isArea ? "Boundary" : "Line"} has fewer than ${minPoints} points — not a valid shape.`);
    return { level: "invalid", reasons };
  }
  if (isArea) {
    const canvasArea = canvasWidth * canvasHeight;
    if (canvasArea > 0 && measurePixels / canvasArea < 0.005) {
      reasons.push("Traced area is under 0.5% of the visible sheet — check for a mis-click.");
    }
  } else {
    const canvasDiagonal = Math.hypot(canvasWidth, canvasHeight);
    if (canvasDiagonal > 0 && measurePixels / canvasDiagonal < 0.01) {
      reasons.push("Traced length is under 1% of the sheet diagonal — check for a mis-click.");
    }
  }
  if (reasons.length > 0) return { level: "low", reasons };
  reasons.push("Manually calibrated and traced by a human against the source sheet; no independent cross-check (e.g. OCR'd dimension match) exists yet, so this cannot be scored 'high'.");
  return { level: "medium", reasons };
}

app.post("/api/takeoffs", (req, res) => {
  const { fileName, pageNumber, quantityType, scale, polygon, markupImage, canvasWidth, canvasHeight, note } = req.body || {};

  if (!fileName || !safeStoredFilePath(UPLOAD_DIR, fileName) || !fs.existsSync(safeStoredFilePath(UPLOAD_DIR, fileName))) {
    return res.status(400).json({ error: "fileName must reference an uploaded file." });
  }
  if (!SUPPORTED_QUANTITY_TYPES.includes(quantityType)) {
    return res.status(400).json({ error: `quantityType must be one of: ${SUPPORTED_QUANTITY_TYPES.join(", ")}.` });
  }
  const isArea = quantityType === "square_footage";
  const minPoints = isArea ? 3 : 2;
  const page = pageNumber === undefined ? 1 : Number(pageNumber);
  if (!Number.isInteger(page) || page < 1) {
    return res.status(400).json({ error: "pageNumber must be a positive integer." });
  }
  if (!scale || typeof scale.pixelDistance !== "number" || scale.pixelDistance <= 0 || typeof scale.realDistance !== "number" || scale.realDistance <= 0) {
    return res.status(400).json({ error: "scale.pixelDistance and scale.realDistance must be positive numbers." });
  }
  if (!Array.isArray(polygon) || polygon.length < minPoints || !polygon.every((p) => typeof p.x === "number" && typeof p.y === "number")) {
    return res.status(400).json({ error: `polygon must be an array of at least ${minPoints} {x,y} points.` });
  }
  if (isArea) {
    if (isSelfIntersecting(polygon)) {
      return res.status(400).json({ error: "Polygon edges cross themselves — retrace the boundary without crossing lines." });
    }
    if (polygonAreaPixels(polygon) < 1e-6) {
      return res.status(400).json({ error: "Polygon has zero area (points are collinear) — not a valid boundary." });
    }
  } else if (polylineLengthPixels(polygon) < 1e-6) {
    return res.status(400).json({ error: "Line has zero length — all points coincide." });
  }
  const markupBuffer = decodeDataUrlPng(markupImage);
  if (!markupBuffer) {
    return res.status(400).json({ error: "markupImage must be a PNG data URL (visual proof is required)." });
  }

  const measured = isArea ? computeSquareFootage(polygon, scale) : computeLinearFootage(polygon, scale);
  const value = isArea ? measured.areaSqFt : measured.lengthFt;
  const measurePixels = isArea ? measured.areaPixels : measured.lengthPixels;
  const confidence = scoreConfidence({
    scale,
    polygon,
    minPoints,
    isArea,
    measurePixels,
    canvasWidth: Number(canvasWidth) || 0,
    canvasHeight: Number(canvasHeight) || 0,
  });

  const markupFileName = `${Date.now()}-${crypto.randomUUID()}.png`;
  fs.writeFileSync(path.join(MARKUP_DIR, markupFileName), markupBuffer);

  const record = takeoffsStore.append({
    fileName,
    pageNumber: page,
    quantityType,
    value: Math.round(value * 100) / 100,
    unit: isArea ? "sq ft" : "ft",
    scale,
    polygon,
    confidence: confidence.level,
    confidenceReasons: confidence.reasons,
    markupFileName,
    // markup proof is a snapshot of the canvas, so these are its intrinsic dimensions —
    // the review page needs them to reserve space and avoid reflow as each proof loads
    canvasWidth: Number(canvasWidth) || 0,
    canvasHeight: Number(canvasHeight) || 0,
    note: note || null,
  });

  res.status(201).json(record);
});

app.get("/api/takeoffs", (_req, res) => {
  res.json({ takeoffs: takeoffsStore.readAll() });
});

app.get("/api/takeoffs/:id", (req, res) => {
  const record = takeoffsStore.getById(req.params.id);
  if (!record) return res.status(404).json({ error: "Takeoff not found." });
  res.json(record);
});

app.post("/api/takeoffs/:id/corrections", (req, res) => {
  const takeoff = takeoffsStore.getById(req.params.id);
  if (!takeoff) return res.status(404).json({ error: "Takeoff not found." });

  const { correctedValue, note, who } = req.body || {};
  if (typeof correctedValue !== "number" || !Number.isFinite(correctedValue)) {
    return res.status(400).json({ error: "correctedValue must be a number." });
  }

  const record = correctionsStore.append({
    takeoffId: takeoff.id,
    quantityType: takeoff.quantityType,
    originalValue: takeoff.value,
    correctedValue,
    note: note || null,
    who: who || null,
  });

  res.status(201).json(record);
});

app.get("/api/corrections", (_req, res) => {
  res.json({ corrections: correctionsStore.readAll() });
});

app.post("/api/takeoffs/:id/review", (req, res) => {
  const takeoff = takeoffsStore.getById(req.params.id);
  if (!takeoff) return res.status(404).json({ error: "Takeoff not found." });

  const { action, who, note } = req.body || {};
  if (action !== "approved") {
    return res.status(400).json({ error: "action must be 'approved'. To override a value, POST a correction instead." });
  }

  const record = reviewsStore.append({
    takeoffId: takeoff.id,
    action,
    who: who || null,
    note: note || null,
  });

  res.status(201).json(record);
});

app.get("/api/reviews", (_req, res) => {
  res.json({ reviews: reviewsStore.readAll() });
});

app.get("/api/reports/corrections", (_req, res) => {
  const report = buildCorrectionsReport(takeoffsStore.readAll(), correctionsStore.readAll(), reviewsStore.readAll());
  res.json(report);
});

// --- Revision comparison (plan diffing) ---
//
// Smallest honest slice: no automatic image registration (that's a much harder
// problem than this app currently has tooling for), so the human pins two matching
// points on each sheet — same interaction pattern as scale calibration — and the
// server computes the exact similarity transform between them (lib/diff.js) and
// aligns the "before" sheet into the "after" sheet's frame for an onion-skin slider.
// The AI changelog, if configured, is advisory only, same as the upload-time batch
// summary — nothing here is a verified quantity or a certified revision comparison.

function readPointPair(points, label) {
  if (
    !Array.isArray(points) ||
    points.length !== 2 ||
    !points.every((p) => p && typeof p.x === "number" && typeof p.y === "number")
  ) {
    return { error: `${label} must be exactly 2 {x,y} points.` };
  }
  return { points };
}

app.post("/api/compare", async (req, res) => {
  const {
    fileNameBefore,
    pageNumberBefore,
    imageBefore,
    canvasWidthBefore,
    canvasHeightBefore,
    pointsBefore,
    fileNameAfter,
    pageNumberAfter,
    imageAfter,
    canvasWidthAfter,
    canvasHeightAfter,
    pointsAfter,
    note,
  } = req.body || {};

  for (const [fileName] of [[fileNameBefore], [fileNameAfter]]) {
    const p = fileName && safeStoredFilePath(UPLOAD_DIR, fileName);
    if (!fileName || !p || !fs.existsSync(p)) {
      return res.status(400).json({ error: "fileNameBefore and fileNameAfter must each reference an uploaded file." });
    }
  }

  const beforePoints = readPointPair(pointsBefore, "pointsBefore");
  if (beforePoints.error) return res.status(400).json({ error: beforePoints.error });
  const afterPoints = readPointPair(pointsAfter, "pointsAfter");
  if (afterPoints.error) return res.status(400).json({ error: afterPoints.error });

  const afterWidth = Number(canvasWidthAfter);
  const afterHeight = Number(canvasHeightAfter);
  if (!Number.isInteger(afterWidth) || afterWidth <= 0 || !Number.isInteger(afterHeight) || afterHeight <= 0) {
    return res.status(400).json({ error: "canvasWidthAfter and canvasHeightAfter must be positive integers." });
  }

  const beforeBuffer = decodeDataUrlPng(imageBefore);
  if (!beforeBuffer) return res.status(400).json({ error: "imageBefore must be a PNG data URL." });
  const afterBuffer = decodeDataUrlPng(imageAfter);
  if (!afterBuffer) return res.status(400).json({ error: "imageAfter must be a PNG data URL." });

  let transform;
  try {
    transform = computeSimilarityTransform(beforePoints.points, afterPoints.points);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const warnings = [];
  const scaleOff = Math.abs(transform.scale - 1);
  if (scaleOff > 0.15) {
    warnings.push(
      `Alignment scale is ${transform.scale.toFixed(2)}x — expected close to 1.0 for the same sheet at the same print scale. Check that both point pairs mark the same two physical features.`
    );
  }
  const rotationDegrees = Math.abs((transform.rotationRadians * 180) / Math.PI);
  if (rotationDegrees > 5) {
    warnings.push(
      `Alignment implies a ${rotationDegrees.toFixed(1)}° rotation between sheets — check your pins if the sheets should be right-side-up to each other.`
    );
  }

  let alignedBeforeBuffer;
  try {
    alignedBeforeBuffer = await alignImageToTarget(beforeBuffer, transform, afterWidth, afterHeight);
  } catch (err) {
    return res.status(400).json({ error: `Could not align the images: ${err.message}` });
  }

  const stamp = `${Date.now()}-${crypto.randomUUID()}`;
  const alignedBeforeFileName = `${stamp}-before-aligned.png`;
  const afterFileName = `${stamp}-after.png`;
  fs.writeFileSync(path.join(COMPARE_DIR, alignedBeforeFileName), alignedBeforeBuffer);
  fs.writeFileSync(path.join(COMPARE_DIR, afterFileName), afterBuffer);

  const aiSummary = await analyzeComparison(afterBuffer, alignedBeforeBuffer);

  const record = comparisonsStore.append({
    fileNameBefore,
    pageNumberBefore: pageNumberBefore ? Number(pageNumberBefore) : 1,
    fileNameAfter,
    pageNumberAfter: pageNumberAfter ? Number(pageNumberAfter) : 1,
    alignedBeforeFileName,
    afterFileName,
    canvasWidth: afterWidth,
    canvasHeight: afterHeight,
    transform: { scale: transform.scale, rotationRadians: transform.rotationRadians },
    warnings,
    note: note || null,
    aiSummary,
  });

  res.status(201).json(record);
});

app.get("/api/comparisons", (_req, res) => {
  res.json({ comparisons: comparisonsStore.readAll() });
});

app.get("/api/comparisons/:id", (req, res) => {
  const record = comparisonsStore.getById(req.params.id);
  if (!record) return res.status(404).json({ error: "Comparison not found." });
  res.json(record);
});

app.get("/files", (_req, res) => {
  res.json({ batches });});

app.get("/files/:batchId/:storedName", (req, res) => {
  const batch = batches.find((b) => b.id === req.params.batchId);
  const file = batch && batch.files.find((f) => f.storedName === req.params.storedName);
  if (!file) {
    return res.status(404).json({ error: "File not found." });
  }
  const safeName = file.originalName.replace(/[\r\n"]/g, "");
  res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`
  );
  res.sendFile(path.join(UPLOAD_DIR, path.basename(file.storedName)));
});

// --- Subcontract drafting ---

app.post("/contracts/chat", async (req, res) => {
  if (!anthropic) {
    return res.status(503).json({ error: "Contract drafting requires ANTHROPIC_API_KEY." });
  }
  const incoming = Array.isArray(req.body.messages) ? req.body.messages : [];
  if (incoming.length === 0) {
    return res.status(400).json({ error: "messages must be a non-empty array." });
  }
  const messages = incoming.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: [{ type: "text", text: String(m.text || "") }],
  }));

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1536,
      system: SUBCONTRACT_AGENT_PROMPT,
      tools: [FINALIZE_SUBCONTRACT_TOOL],
      messages,
    });

    const toolUse = response.content.find(
      (b) => b.type === "tool_use" && b.name === "finalize_subcontract"
    );

    if (toolUse) {
      const docxBuffer = await generateSubcontractDocx(toolUse.input);
      const id = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
      const storedName = `${id}.docx`;
      await fs.promises.writeFile(path.join(CONTRACTS_DIR, storedName), docxBuffer);
      const contract = {
        id,
        createdAt: new Date().toISOString(),
        storedName,
        subcontractorName: toolUse.input.subcontractor?.companyName || "",
        projectName: toolUse.input.project?.name || "",
        subcontractTotal: toolUse.input.subcontractTotal || "",
        fields: toolUse.input,
      };
      await addContract(contract);
      return res.json({
        done: true,
        contractId: id,
        downloadUrl: `/contracts/${id}/download`,
        fields: toolUse.input,
      });
    }

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    res.json({ done: false, reply: text });
  } catch (err) {
    res.status(502).json({ error: cleanApiErrorMessage(err, "AI request failed.") });
  }
});

app.get("/contracts", (_req, res) => {
  res.json({ contracts });
});

app.get("/contracts/:id/download", (req, res) => {
  const contract = contracts.find((c) => c.id === req.params.id);
  if (!contract) {
    return res.status(404).json({ error: "Contract not found." });
  }
  const filename = `${(contract.subcontractorName || "subcontract").replace(/[^a-zA-Z0-9_-]/g, "_")}.docx`;
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.sendFile(path.join(CONTRACTS_DIR, path.basename(contract.storedName)));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Takeoff-Demon upload server listening on port ${PORT}`);
  });
}

module.exports = app;
