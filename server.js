const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const UPLOAD_DIR = path.join(__dirname, "uploads");

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

// Extensions Claude Vision can directly analyze
const IMAGE_EXTENSIONS = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
]);

const SYSTEM_PROMPT = `You are an expert construction estimator and blueprint analyst with decades of field experience. When given construction blueprints, drawings, or site photos, you perform a thorough takeoff and project analysis.

For each document or image provided, analyze and report:

1. **Project Overview** — Describe the project type, scope, and key features visible in the drawings.

2. **Quantity Takeoff** — List all measurable quantities: linear feet of walls/framing, square footage of floors/roofing/ceilings, number of doors/windows/fixtures, cubic yards of concrete, etc. Be as specific as the drawings allow.

3. **Material List** — Enumerate major materials needed (lumber species and dimensions, concrete mix, steel gauge, roofing type, etc.) with estimated quantities.

4. **Labor Scope** — Identify the trades required and describe the scope of work for each (e.g., framing, MEP rough-in, finish carpentry).

5. **Notable Details & Specifications** — Call out any special details, unusual conditions, or spec requirements visible in the drawings.

6. **Potential Issues / RFIs** — Flag anything ambiguous, missing, or that warrants clarification before bidding.

7. **Rough Cost Range** — Provide a ballpark cost range based on current regional construction costs (note assumptions).

If the image is not a blueprint or construction document, describe what you see and explain why a construction takeoff cannot be performed.

Be concise but thorough. Use bullet points and tables where they add clarity.`;

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
app.use(express.json());

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

app.post("/analyze", async (req, res) => {
  const { files, notes } = req.body;

  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: "No files specified for analysis." });
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const contentBlocks = [];
    const skipped = [];

    for (const storedName of files) {
      // Prevent path traversal
      const safeName = path.basename(storedName);
      const filePath = path.join(UPLOAD_DIR, safeName);

      if (!fs.existsSync(filePath)) {
        send({ warning: `File not found: ${safeName}` });
        continue;
      }

      const ext = path.extname(safeName).toLowerCase();

      if (ext === ".pdf") {
        const data = fs.readFileSync(filePath).toString("base64");
        contentBlocks.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data },
        });
        contentBlocks.push({
          type: "text",
          text: `(Above document: ${safeName})`,
        });
      } else if (IMAGE_EXTENSIONS.has(ext)) {
        const data = fs.readFileSync(filePath).toString("base64");
        contentBlocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: IMAGE_EXTENSIONS.get(ext),
            data,
          },
        });
        contentBlocks.push({
          type: "text",
          text: `(Above image: ${safeName})`,
        });
      } else {
        // TIFF, DWG, DXF — not directly supported by vision API
        skipped.push(safeName);
      }
    }

    if (skipped.length > 0) {
      send({
        text: `**Note:** The following file(s) cannot be analyzed directly because they use formats not supported by the vision API (TIFF, DWG, DXF). Please convert them to PDF or PNG first:\n${skipped.map((s) => `- ${s}`).join("\n")}\n\n`,
      });
    }

    if (contentBlocks.length === 0) {
      send({ error: "No supported files to analyze (PDF, PNG, JPG, WebP only)." });
      res.write("data: [DONE]\n\n");
      return res.end();
    }

    if (notes && notes.trim()) {
      contentBlocks.push({
        type: "text",
        text: `\n\nAdditional notes from the user:\n${notes.trim()}`,
      });
    }

    contentBlocks.push({
      type: "text",
      text: "Please perform a full construction takeoff and analysis of the above document(s).",
    });

    const client = new Anthropic();

    const stream = await client.messages.stream({
      model: "claude-opus-4-8",
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: contentBlocks }],
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        send({ text: event.delta.text });
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("Analysis error:", err);
    send({ error: err.message || "Analysis failed." });
    res.write("data: [DONE]\n\n");
    res.end();
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Takeoff-Demon upload server listening on port ${PORT}`);
});
