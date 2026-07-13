const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const UPLOAD_DIR = path.join(__dirname, "uploads");

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// Claude can only read these formats directly; DWG/DXF/TIFF need manual review.
const ANALYZABLE_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const ANALYZABLE_PDF_TYPE = "application/pdf";
const MAX_ANALYSIS_BYTES = 30 * 1024 * 1024;

const TAKEOFF_PROMPT = `You are a construction estimator's assistant reviewing an uploaded blueprint or job-site photo. Produce a concise takeoff summary with these sections:

1. What this document/photo shows (plan type, area, or scope).
2. Key materials and quantities visible or inferable (rough counts/dimensions where possible).
3. Notable scope items or trades involved.
4. Assumptions and caveats — flag anything illegible, ambiguous, or requiring field verification.

Be direct and use bullet points. This is a rough read to help move a project forward, not a certified takeoff — make that limitation clear if quantities are uncertain.`;

async function analyzeFile(file) {
  if (!anthropic) {
    return { status: "skipped", reason: "AI analysis not configured (missing ANTHROPIC_API_KEY)." };
  }
  if (file.size > MAX_ANALYSIS_BYTES) {
    return { status: "skipped", reason: "File too large for AI analysis (30 MB limit)." };
  }

  const ext = path.extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype;
  let contentBlock;
  if (ANALYZABLE_IMAGE_TYPES.has(mimeType)) {
    contentBlock = {
      type: "image",
      source: {
        type: "base64",
        media_type: mimeType,
        data: fs.readFileSync(file.path).toString("base64"),
      },
    };
  } else if (ext === ".pdf") {
    contentBlock = {
      type: "document",
      source: {
        type: "base64",
        media_type: ANALYZABLE_PDF_TYPE,
        data: fs.readFileSync(file.path).toString("base64"),
      },
    };
  } else {
    return { status: "skipped", reason: `File type ${ext || mimeType} isn't supported for AI analysis yet — view it manually.` };
  }

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [contentBlock, { type: "text", text: TAKEOFF_PROMPT }],
        },
      ],
    });
    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    return { status: "ok", text };
  } catch (err) {
    return { status: "error", reason: err.message || "AI analysis failed." };
  }
}

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

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
    const files = await Promise.all(
      (req.files || []).map(async (f) => ({
        originalName: f.originalname,
        storedName: f.filename,
        size: f.size,
        mimeType: f.mimetype,
        analysis: await analyzeFile(f),
      }))
    );
    res.json({ uploaded: files });
  });
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Takeoff-Demon upload server listening on port ${PORT}`);
});
