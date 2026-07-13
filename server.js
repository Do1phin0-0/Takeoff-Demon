const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const basicAuth = require("express-basic-auth");
const sharp = require("sharp");
const { Helper: DxfHelper } = require("dxf");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");
const MANIFEST_PATH = path.join(UPLOAD_DIR, "manifest.json");
const MAX_HISTORY_BATCHES = 50;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

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

const TAKEOFF_PROMPT = `You are a construction estimator's assistant reviewing a batch of uploaded blueprint sheets and/or job-site photos, labeled by filename below. Produce one consolidated takeoff summary covering the whole batch, with these sections:

1. What this set shows (plan types, area, or scope) — reference sheets by filename where it helps.
2. Key materials and quantities visible or inferable across the sheets (rough counts/dimensions where possible).
3. Notable scope items or trades involved.
4. Assumptions and caveats — flag anything illegible, ambiguous, contradictory between sheets, or requiring field verification.

Be direct and use bullet points. This is a rough read to help move a project forward, not a certified takeoff — make that limitation clear if quantities are uncertain.`;

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

function addBatch(batch) {
  batches.unshift(batch);
  batches = batches.slice(0, MAX_HISTORY_BATCHES);
  return persistBatches();
}

// --- File type handling ---

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
    return {
      block: {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: fs.readFileSync(file.path).toString("base64"),
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
    return { status: "error", reason: err.message || "AI analysis failed.", skippedFiles };
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

app.get("/files", (_req, res) => {
  res.json({ batches });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Takeoff-Demon upload server listening on port ${PORT}`);
  });
}

module.exports = app;
