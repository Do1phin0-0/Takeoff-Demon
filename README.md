# Takeoff-Demon
This agent is a construction-focused assistant designed to simplify blueprint reading and project estimation. It helps interpret plans, break down what you’re looking at, and identify exactly what’s needed to move a project forward. Whether it’s understanding layouts, materials, or scope, .

## Current status

- Upload PDF/image/CAD plans (`/upload`).
- For PDF and image uploads, run a manual takeoff: calibrate scale against a known dimension, trace a room boundary, and get a square-footage quantity backed by a markup image and a confidence score (`/takeoff.html?file=...`).
- Every saved takeoff can be corrected; corrections are logged (`/api/takeoffs`, `/api/corrections`) as the seed of a future learning system.
- Not yet built: OCR/automatic scale detection, sheet classification, DWG/DXF preview, other quantity types (drywall, duct, conduit, etc.), pricing, and anything beyond this V1 slice. See the project roadmap for the intended build order — walls/flooring before MEP, one working quantity type before the next.
