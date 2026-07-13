# Takeoff-Demon
This agent is a construction-focused assistant designed to simplify blueprint reading and project estimation. It helps interpret plans, break down what you’re looking at, and identify exactly what’s needed to move a project forward. Whether it’s understanding layouts, materials, or scope, uploaded blueprints and job-site photos get an automatic AI-generated takeoff summary.

## Running locally

```
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # optional; omit to run upload-only, no AI analysis
npm run dev
```

Then open http://localhost:3000 and upload a PDF, PNG, JPG, or WebP under 30 MB to get a takeoff summary. TIFF, DWG, and DXF files are stored but not yet analyzed.

Without `ANTHROPIC_API_KEY` set, uploads still work but each file's analysis is marked as skipped.
