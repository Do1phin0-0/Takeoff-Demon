const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const { makeJsonFileStore } = require("./lib/store");
const { computeSquareFootage } = require("./lib/geometry");

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const UPLOAD_DIR = path.join(__dirname, "uploads");
const MARKUP_DIR = path.join(UPLOAD_DIR, "markups");
const PDFJS_DIR = path.join(__dirname, "node_modules", "pdfjs-dist", "build");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(MARKUP_DIR, { recursive: true });

const takeoffsStore = makeJsonFileStore(path.join(UPLOAD_DIR, "data", "takeoffs.json"));
const correctionsStore = makeJsonFileStore(path.join(UPLOAD_DIR, "data", "corrections.json"));

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

app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public")));
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

app.post("/upload", (req, res) => {
  upload.array("files", 20)(req, res, (err) => {
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
    const files = (req.files || []).map((f) => ({
      originalName: f.originalname,
      storedName: f.filename,
      size: f.size,
      mimeType: f.mimetype,
    }));
    res.json({ uploaded: files });
  });
});

function decodeDataUrlPng(dataUrl) {
  const match = /^data:image\/png;base64,(.+)$/.exec(String(dataUrl || ""));
  if (!match) return null;
  return Buffer.from(match[1], "base64");
}

function scoreConfidence({ scale, polygon, areaPixels, canvasWidth, canvasHeight }) {
  const reasons = [];
  if (scale.pixelDistance < 40) {
    reasons.push("Calibration line was under 40px — scale may be imprecise.");
  }
  if (polygon.length < 3) {
    reasons.push("Boundary has fewer than 3 points — not a valid shape.");
    return { level: "invalid", reasons };
  }
  const canvasArea = canvasWidth * canvasHeight;
  if (canvasArea > 0 && areaPixels / canvasArea < 0.005) {
    reasons.push("Traced area is under 0.5% of the visible sheet — check for a mis-click.");
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
  if (quantityType !== "square_footage") {
    return res.status(400).json({ error: "Only quantityType 'square_footage' is supported in V1." });
  }
  const page = pageNumber === undefined ? 1 : Number(pageNumber);
  if (!Number.isInteger(page) || page < 1) {
    return res.status(400).json({ error: "pageNumber must be a positive integer." });
  }
  if (!scale || typeof scale.pixelDistance !== "number" || scale.pixelDistance <= 0 || typeof scale.realDistance !== "number" || scale.realDistance <= 0) {
    return res.status(400).json({ error: "scale.pixelDistance and scale.realDistance must be positive numbers." });
  }
  if (!Array.isArray(polygon) || polygon.length < 3 || !polygon.every((p) => typeof p.x === "number" && typeof p.y === "number")) {
    return res.status(400).json({ error: "polygon must be an array of at least 3 {x,y} points." });
  }
  const markupBuffer = decodeDataUrlPng(markupImage);
  if (!markupBuffer) {
    return res.status(400).json({ error: "markupImage must be a PNG data URL (visual proof is required)." });
  }

  const { areaSqFt, areaPixels } = computeSquareFootage(polygon, scale);
  const confidence = scoreConfidence({
    scale,
    polygon,
    areaPixels,
    canvasWidth: Number(canvasWidth) || 0,
    canvasHeight: Number(canvasHeight) || 0,
  });

  const markupFileName = `${Date.now()}-${crypto.randomUUID()}.png`;
  fs.writeFileSync(path.join(MARKUP_DIR, markupFileName), markupBuffer);

  const record = takeoffsStore.append({
    fileName,
    pageNumber: page,
    quantityType,
    value: Math.round(areaSqFt * 100) / 100,
    unit: "sq ft",
    scale,
    polygon,
    confidence: confidence.level,
    confidenceReasons: confidence.reasons,
    markupFileName,
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

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Takeoff-Demon upload server listening on port ${PORT}`);
});
