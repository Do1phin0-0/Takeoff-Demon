# Takeoff-Demon
This agent is a construction-focused assistant designed to simplify blueprint reading and project estimation. It helps interpret plans, break down what you’re looking at, and identify exactly what’s needed to move a project forward. Whether it’s understanding layouts, materials, or scope, uploaded blueprints and job-site photos get an automatic AI-generated takeoff summary.

## Running locally

```
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # optional; omit to run upload-only, no AI analysis
export AUTH_USERNAME=someone           # optional; omit to run without auth (dev only)
export AUTH_PASSWORD=somepassword      # required together with AUTH_USERNAME
npm run dev
```

Then open http://localhost:3000 and upload one or more files. All files in a single upload are analyzed together as one batch (e.g. multiple sheets of the same plan set), producing one consolidated takeoff summary rather than a separate summary per file.

Format support for AI analysis:
- **PDF, PNG, JPG, WebP** — read directly by Claude.
- **DXF** — rendered to an image first, then read by Claude.
- **DWG, TIFF** — stored for manual review only; not yet analyzed (DWG is a binary CAD format without a straightforward open-source renderer, and TIFF isn't a format Claude's vision API accepts).

Without `ANTHROPIC_API_KEY` set, uploads still work but analysis is marked as skipped.

Without `AUTH_USERNAME`/`AUTH_PASSWORD` set, the app runs with no authentication — fine for local dev, but set both before deploying anywhere public (HTTP Basic Auth gates every route except `/health`, which Render's health check needs to reach unauthenticated).

Upload history (metadata + analysis) is persisted to `uploads/manifest.json` and served from `GET /files`, so past takeoffs survive a server restart as long as the `uploads/` disk persists. Each file also links to `GET /files/:batchId/:storedName` to view/download the original.

Disk usage is bounded: once history exceeds `MAX_HISTORY_BATCHES` (default 50) or `MAX_DISK_BYTES` (default 800 MB), the oldest batches are evicted — including deleting their stored files — so a long-running deployment doesn't fill Render's disk. Override either via env var if you need a different retention window.
