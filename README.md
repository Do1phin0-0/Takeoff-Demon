# Takeoff-Demon
This agent is a construction-focused assistant designed to simplify blueprint reading and project estimation. It helps interpret plans, break down what you’re looking at, and identify exactly what’s needed to move a project forward. Whether it’s understanding layouts, materials, or scope, uploaded blueprints and job-site photos get an automatic AI-generated takeoff summary. It also drafts AMS subcontracts through a guided chat, producing a filled `.docx` from the AMS master template.

## Running locally

```
npm install
export ANTHROPIC_API_KEY=<your-anthropic-api-key>   # optional; omit to run upload-only, no AI analysis
export AUTH_USERNAME=<pick-a-username>       # optional; omit to run without auth (dev only)
export AUTH_PASSWORD=<pick-a-password>       # required together with AUTH_USERNAME
npm run dev
```

Then open http://localhost:3000 and upload one or more files. All files in a single upload are analyzed together as one batch (e.g. multiple sheets of the same plan set), producing one consolidated takeoff summary rather than a separate summary per file.

Format support for AI analysis:
- **PDF, PNG, JPG, WebP** — read directly by Claude. PDFs over 100 pages (Claude's document limit), password-protected, or corrupted PDFs are skipped with a clear reason instead of being sent and failing.
- **DXF** — rendered to an image first, then read by Claude.
- **DWG, TIFF** — stored for manual review only; not yet analyzed (DWG is a binary CAD format without a straightforward open-source renderer, and TIFF isn't a format Claude's vision API accepts).

Without `ANTHROPIC_API_KEY` set, uploads still work but analysis is marked as skipped.

Without `AUTH_USERNAME`/`AUTH_PASSWORD` set, the app runs with no authentication — fine for local dev, but set both before deploying anywhere public (HTTP Basic Auth gates every route except `/health`, which Render's health check needs to reach unauthenticated).

Upload history (metadata + analysis) is persisted to `uploads/manifest.json` and served from `GET /files`, so past takeoffs survive a server restart as long as the `uploads/` disk persists. Each file also links to `GET /files/:batchId/:storedName` to view/download the original.

Disk usage is bounded: once history exceeds `MAX_HISTORY_BATCHES` (default 50) or `MAX_DISK_BYTES` (default 800 MB), the oldest batches are evicted — including deleting their stored files — so a long-running deployment doesn't fill Render's disk. Override either via env var if you need a different retention window.

## Subcontract drafting

Open http://localhost:3000/contracts.html for a chat that walks through drafting an AMS subcontract, following `prompts/subcontract-agent.md` (AMS's actual field-by-field workflow and standard terms). Once every required field is collected, the assistant hands off structured data to a tool call that fills `templates/AMS_Master_Subcontract_Template.docx` and returns the finished document — no prose-parsing involved.

This feature requires `ANTHROPIC_API_KEY`; without it, `POST /contracts/chat` returns 503 rather than silently degrading, since a chat with no model behind it can't do anything useful. Generated contracts are listed at `GET /contracts` and persisted to `uploads/contracts.json` (metadata) plus `uploads/contracts/*.docx` (the documents), capped at `MAX_CONTRACTS` (default 200, oldest evicted first — override via env var).

To change the drafting workflow, cost codes, or standard terms, edit `prompts/subcontract-agent.md` directly — no code changes needed. To change the document layout itself, edit `templates/AMS_Master_Subcontract_Template.docx` in Word, keeping the bracketed `[TOKEN]` placeholders intact (see `lib/subcontract.js` for the exact token list).

## Manual takeoff (measured quantities with proof)

The AI batch summary above is advisory — a rough read with no scale verification or markup evidence. For a **measured** quantity, use the manual takeoff flow: next to any uploaded PDF/image, click "Start takeoff", pick the sheet page, calibrate scale against a known dimension, and trace a boundary. The server independently recomputes square footage (`lib/geometry.js`), saves a markup image as visual proof, and attaches an explicit confidence score with reasons (`/takeoff.html?file=...&page=N`).

Every saved takeoff can be corrected; corrections are logged (`/api/takeoffs`, `/api/corrections`) as the seed of a future learning system. Verified against a real 23-sheet architectural set (printed 1/4" = 1'-0" scale, 0.03% delta vs independent computation).

Not yet built: OCR/automatic scale detection, sheet classification, quantity types beyond square footage, DWG/DXF takeoff, revision comparison, pricing. See CLAUDE.md for the build order — one proven quantity type before the next.
npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"
