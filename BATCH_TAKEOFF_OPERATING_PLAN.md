# OPERATING PLAN: BATCH TAKEOFF WORKFLOW (Option C)
**Example of OPERATING_PLAN_REQUEST.md in action**

Status: Example plan for implementation. Ground truth: current repo state from CLAUDE.md Section 8.

---

## Section 0: Constitutional Alignment

**AMS Brain Doctrines Supported:**
- **Stewardship** — knowledge of which areas were measured how gets preserved (not lost after one estimate)
- **Continuity** — future estimators inherit a record of what was done, not a blank slate
- **Decision Journaling** — every takeoff decision (scale, boundary, confidence override) is logged
- **Institutional Intelligence** — corrections and actual measurements accumulate into a dataset that improves future estimates

**Value Statement:**
- **Why it should exist:** Estimators currently spend 3+ hours manually tracing room boundaries one at a time on multi-sheet PDFs. Each traced area is stored but the workflow is serial, slow, and knowledge of "how we got this number" is buried in corrections logs nobody reviews. Batch automation reduces friction from hours to 15 minutes, queues up parallel work, and surfaces the corrections that should be feeding institutional learning.

- **Company capability it improves:** Estimate turnaround time (3 hrs → 30 min). Accuracy feedback loop visibility (corrections are logged but not surfaced; batch export makes them visible). Confidence scoring reliability (we see which estimates get corrected most, iterate the scoring logic).

- **Knowledge it preserves:** Which sheets had scale issues. Which areas were ambiguous (low confidence). Correction history per room type (a dining room correction from Job X informs the score for Job Y's dining room).

- **Decisions it improves:** Should-cost benchmarks. Labor rate overrides. When to trust AI batch summary vs. when to do manual takeoff.

**What Happens If We Do Not Build This:**
- Estimators keep doing serial single-room takeoffs, copying/pasting results into spreadsheets by hand
- Every time a new estimator touches a plan, they don't know which rooms were already measured or what confidence score they got
- Corrections are logged but never reviewed, so the same mistakes happen on future jobs
- The system produces numbers but not institutional knowledge

---

## Section 1: Objective

**One Sentence:**
Enable an estimator to upload a multi-sheet PDF, run takeoffs on multiple rooms in sequence, and export all results with proof images and confidence scores in a single CSV.

**Business Impact:**
- **Reduce estimate turnaround time** from 3 hours to 30 minutes (10x improvement for a typical 10-room job)
- **Increase confidence scoring reliability** by making correction patterns visible (corrections → scoring improvements)
- **Reduce re-work** on similar projects by making past measurements referenceable
- **Improve estimator onboarding** — new estimators see how past jobs were measured

---

## Section 2: Current State

**What Exists in the Repo:**
- ✅ Express + Multer server handles file uploads (PDFs, images, up to 100MB)
- ✅ PDF rendering to canvas in-browser (`pdfjs-dist` bundled)
- ✅ Multi-page PDF support with page picker (`?page=N`)
- ✅ Manual two-point scale calibration (proven against real plan: BBD Grand Prairie TI A-set, 0.04% delta)
- ✅ Manual room-boundary polygon tracing on canvas
- ✅ Server-side square footage computation (`lib/geometry.js`)
- ✅ Markup image generation (canvas snapshot with calibration line + polygon overlay)
- ✅ Confidence scoring with stated reasons (currently capped at "medium" — no automated cross-check)
- ✅ Persistence: takeoff results stored in JSON (`uploads/data/takeoffs.json`)
- ✅ Corrections log: `POST /api/takeoffs/:id/corrections` records {original_value, corrected_value, note, timestamp}
- ✅ API endpoints: `POST/GET /api/takeoffs`, `GET /api/takeoffs/:id`, `POST /api/takeoffs/:id/corrections`

**Proof:**
- Tested against real architectural PDF (23 sheets, 1/4"=1'-0" scale)
- Markup proof images are saved
- Confidence scoring exists (coarse, but present)

**What Is NOT Built Yet:**
- Multi-room/batch workflow UI (currently one room at a time)
- Property name entry field (user has to remember room names)
- Batch session management (no way to track "this PDF has 8 queued takeoffs")
- Export to CSV/Excel (results live in JSON; user has to export manually)
- Batch progress tracking (no visibility into "4 of 8 done")
- Batch results summary page
- Scale auto-detection (still manual 2-point calibration per sheet)

**Historical Evidence:**
- No specific AMS project cited yet, but the problem is universal: architectural takeoffs are measured one sheet at a time, estimators lose track of scale between pages, and past measurements aren't surfaced for future jobs.

**Failure Scenario:**
Estimator receives 23-sheet architectural set. Needs takeoffs on 8 rooms. Currently: opens takeoff.html, picks page 1, calibrates scale, traces Master Bed (2 min), saves, goes back, picks page 3, re-calibrates (scale was different on page 3), traces Dining (2 min), repeats 6 more times. Total: 20+ minutes of clicking + calibration. Results stored in JSON but not exported or reviewed. Next job, same rooms, similar scale → no reference to past measurements.

---

## Section 3: Target Behavior

**User View & Actions:**
1. User uploads a PDF (e.g., architectural set)
2. System extracts all pages, shows thumbnail grid
3. User sees a property list with input fields: ["Master Bedroom", "Dining", "Kitchen", "Bathroom 1", "Bathroom 2", "Living Room", "Laundry", "Hallway"]
4. User checks boxes next to properties they want to takeoff (e.g., checks 5 of 8)
5. User clicks "Start Batch Takeoff"
6. System shows a queue: "5 properties queued"
7. For each property:
   - System displays the sheet page (user can re-select if wrong)
   - User calibrates scale (2-point calibration)
   - User traces boundary (polygon on canvas)
   - System computes area, shows confidence
   - User can approve, correct, or skip
   - Result saved + markup image stored
8. User clicks "Export Results"
9. System produces CSV with columns:
   - Property Name
   - Sheet #
   - Square Footage
   - Confidence (High / Medium / Low)
   - Notes
   - Markup Image Link

**System Output:**
- CSV file (downloaded to user's device)
- All markup images stored in `uploads/markups/`
- Batch metadata stored in `uploads/data/batches.json`

**Concrete Example:**
```
Property Name   | Sheet # | Sq Ft | Confidence | Notes                    | Markup
Master Bedroom  | A101    | 245.5 | High       | Door at NW corner        | /uploads/markups/batch-123-master-bed.png
Dining Room     | A102    | 187.2 | Medium     | Unclear pocket door      | /uploads/markups/batch-123-dining.png
Kitchen         | A102    | 156.8 | High       | Clear dimensions         | /uploads/markups/batch-123-kitchen.png
Bathroom 1      | A103    | 42.1  | Medium     | Scale ambiguous          | /uploads/markups/batch-123-bath1.png
Living Room     | A101    | 312.4 | High       | 23'-6" wall confirmed    | /uploads/markups/batch-123-living.png
```

**Success Scenario (1 Year Later):**
Aaron uploads a new architectural set with similar room types. System says "You've measured similar rooms before — Master Bedroom was 245 sq ft ±10 on Project X, Dining was 187 ±15." He can accept those as starting estimates, refine if needed. The past knowledge informs present work.

---

## Section 4: Inputs, Outputs, Logic

**Inputs:**
- User uploads PDF (or multi-page image set)
- User enters property names (text field, one per row)
- User selects which properties to takeoff (checkboxes)
- For each property: scale calibration (2 points on canvas), boundary trace (polygon)
- User optionally adds notes ("unclear on south wall," etc.)

**Outputs:**
- CSV file with all results
- Directory of markup PNG images (one per takeoff)
- Batch metadata JSON (links all takeoffs to the batch, stores timestamps)

**Workflow Logic (Step by Step):**

1. **Upload & Parse**
   - User uploads PDF
   - Server extracts pages (using pdfjs-dist)
   - Generates thumbnail for each page
   - Stores file in `uploads/batches/{batchId}/`

2. **Property Queue Entry**
   - User enters property names
   - System auto-suggests based on past similar projects (future enhancement, not V1)
   - User checks which ones to takeoff

3. **Batch Session Created**
   - Server creates `uploads/data/batches/{batchId}.json`
   - Stores: {batchId, uploadDate, fileName, properties: [{name, requested: true/false, status: pending/in-progress/done, takeoffId, confidence}]}

4. **For Each Checked Property:**
   - Show page picker (user can re-select page if mistaken)
   - User calibrates scale (two-point measurement)
   - User traces boundary (polygon on canvas)
   - Server computes area (using existing `lib/geometry.js`)
   - Server scores confidence (using existing logic, but may update based on corrections history)
   - User reviews (area, confidence, notes)
   - If approved: save takeoff, create markup image, store in batch
   - If wrong: user can re-do without saving, or save + log correction

5. **Export**
   - User clicks "Export CSV"
   - Server generates CSV from batch metadata + all takeoff results
   - CSV includes markup image URLs (relative paths to `/uploads/markups/`)
   - User downloads CSV

6. **Persistence**
   - Batch JSON: `uploads/data/batches/{batchId}.json`
   - Takeoff records: each gets entry in `uploads/data/takeoffs.json` (existing)
   - Markup images: stored in `uploads/markups/` (existing)
   - Batch summary: added to manifest.json for history view

---

## Section 5: Visual Proof

**Markup Generation (Per Takeoff):**
- Canvas snapshot showing:
  - Original plan image (page background)
  - Calibration line (green, labeled with measured distance + computed distance)
  - Traced polygon (red outline, labeled with computed area "187.2 sq ft")
  - Confidence badge (e.g., "HIGH" in green, "MEDIUM" in yellow)
  - Ambiguity markers (if scale has alternate sources, highlight which was used)

**Batch Export View:**
- CSV table visible in spreadsheet (Excel, Google Sheets)
- Each row clickable to view the corresponding markup image
- Estimated time to visually verify all: < 2 minutes per property

**5-Second Verification:**
An estimator looks at a row: "Master Bedroom | 245.5 sq ft | High confidence"
Clicks the markup image, sees the green calibration line against a clear 23'-6" dimension, sees the red polygon tracing the four walls. Thinks: "Yes, that's right." Takes 5 seconds.

---

## Section 6: Edge Cases

**What Can Break This:**
1. **PDF with no dimensions** → Scale calibration fails
   - Handle: System asks user "Can you find any dimension marked on this page?" or user skips that property
   
2. **Scale changes mid-set** (common in architectural sets)
   - Handle: Scale resets on each page change; user re-calibrates (unavoidable, but caught immediately)
   
3. **Ambiguous boundaries** (e.g., pocket door, open plan)
   - Handle: Confidence score drops to "Medium" or "Low"; markup highlights the ambiguity; user can add note ("open to kitchen") and optionally correct the value
   
4. **User traces a room incorrectly** (includes hallway, misses a nook)
   - Handle: User sees the area (e.g., "312.4 sq ft" unexpectedly high), can immediately re-trace on the same page without saving
   
5. **Corrupted PDF**
   - Handle: Server detects (pdfjs-dist fails to render), shows error "PDF unreadable on pages [4, 7, 19]", user can still takeoff other pages
   
6. **User wants to correct a takeoff after export**
   - Handle: System stores takeoff ID; user can open batch results, find the room, click "Correct", enter new value + reason, log gets created

**Human Override (Critical):**
- **What happens if Aaron disagrees with the confidence score?**
  - User can override: "This should be HIGH, not MEDIUM" + explains why
  - Override is logged: `{takeoffId, originalConfidence: "MEDIUM", overriddenConfidence: "HIGH", reason: "Scale confirmed from architectural stamp", who: "Aaron", timestamp}`
  - Future confidence scoring learns from this override (not in V1, but the data structure supports it)

---

## Section 7: Code Strategy

**Memory Impact:**
- **Project Memory:** What was measured on this PDF? {batchId → [property, area, confidence, date]}
- **Correction Memory:** Every time an estimator overrides a computed value, it's logged with reason → feeds future confidence tuning
- **Decision Memory:** "We use HIGH when architectural dimensions are visible, MEDIUM when dimensions are marked but scale is ambiguous"

**Learning Impact (V1):**
- Corrections are logged but not yet used for scoring
- V2 will analyze: "Which room types get corrected most? Which scale sources are most reliable?"

**Folders & Files to Create/Modify:**

```
public/
  batch-takeoff.html         [NEW] — main batch UI, property queue, progress
  takeoff.html               [MODIFY] — add "save as part of batch" option
  
lib/
  batch-manager.js           [NEW] — manage batch sessions, queue, persistence
  export.js                  [NEW] — CSV generation
  
uploads/
  data/
    batches.json             [NEW] — batch metadata index
    batches/
      {batchId}.json         [NEW] — per-batch session data
  markups/                   [EXISTING] — where markup images go
  
tests/
  batch-takeoff.test.js      [NEW] — 4 test cases
```

**New Modules:**

| Module | Responsibility | Inputs | Outputs |
|--------|---|---|---|
| `BatchManager` | Create batch session, queue properties, track progress, persist state | {batchId, properties[], uploadDate, fileName} | {batchId, status, progress (3/8), results[]} |
| `ExportCSV` | Generate CSV from batch + takeoff results | {batch, takeoffs[]} | CSV string (buffer) |
| `BatchPersistence` | Store/load batch JSON, manage batches.json index | {batch}, {batchId} | {batch}, [batches] |

**APIs to Build:**

| Endpoint | Method | Purpose | Request | Response |
|---|---|---|---|---|
| `/api/batch` | POST | Create new batch from upload | {uploadId, properties: [{name, requested: bool}]} | {batchId, status: "queued"} |
| `/api/batch/:batchId` | GET | Get batch status & results | — | {batchId, progress: "3/8", properties: [{name, status, takeoffId, confidence}]} |
| `/api/batch/:batchId/export` | GET | Generate CSV export | — | CSV file (Content-Type: text/csv) |
| `/api/batch/:batchId/property/:propName` | POST | Save takeoff for one property in batch | {takeoffData, propertyName} | {success: true, batchProgress: "4/8"} |

**Data Model Changes:**

Existing `takeoffs.json`:
```json
{
  "id": "uuid-1",
  "fileName": "architectural-set.pdf",
  "pageNumber": 1,
  "quantityType": "square_footage",
  "value": 245.5,
  "unit": "sq ft",
  "confidence": "High",
  "...": "..."
}
```

New: Add `batchId` field:
```json
{
  "id": "uuid-1",
  "batchId": "batch-uuid-123",  [NEW]
  "propertyName": "Master Bedroom",  [NEW]
  "fileName": "architectural-set.pdf",
  "pageNumber": 1,
  "quantityType": "square_footage",
  "value": 245.5,
  "unit": "sq ft",
  "confidence": "High",
  "...": "..."
}
```

New `batches.json` (index):
```json
[
  {
    "id": "batch-uuid-123",
    "uploadDate": "2026-07-20",
    "fileName": "architectural-set.pdf",
    "uploadPath": "uploads/batches/batch-uuid-123/",
    "properties": [
      { "name": "Master Bedroom", "requested": true, "status": "done", "takeoffId": "uuid-1", "confidence": "High" },
      { "name": "Dining", "requested": true, "status": "done", "takeoffId": "uuid-2", "confidence": "Medium" }
    ]
  }
]
```

**Dependencies:**
- No new npm packages needed (pdfjs-dist, sharp already present)
- CSV generation: use built-in string manipulation (no papaparse needed)

**Tests (4 cases):**
1. Create batch from 3-property upload → verify batchId created, status is "queued"
2. Save one property takeoff → verify batch progress updates to "1/3"
3. Export batch to CSV → verify CSV has 3 rows, markup URLs are correct
4. Save + correct a takeoff → verify override is logged, batch summary shows correction

---

## Section 8: Review Flow

**Constitutional Verification:**
- ✅ Does it support AMS Brain principles? **Yes** — Stewardship (past measurements preserved), Continuity (future estimators see past work), Decision Journaling (overrides logged)
- ✅ Does it reduce risk? **Yes** — estimate turnaround risk drops; correction history becomes visible
- ✅ Does it improve capability? **Yes** — 10x faster for multi-room takeoffs
- ✅ Does it preserve knowledge? **Yes** — batch metadata + corrections feed institutional memory

**Standard Review:**
1. User uploads real architectural PDF (10+ sheets, multiple rooms)
2. User enters property names, selects 5 to takeoff
3. User completes all 5 takeoffs (can skip ambiguous ones)
4. User exports CSV
5. Estimator verifies:
   - CSV has all 5 properties, correct areas
   - Markup images are present and correct
   - Confidence scores are reasonable
   - Batch metadata shows correct timestamps

**Proof of Completion:**
- Batch folder in `uploads/batches/{batchId}/` with all markup images
- CSV file generated and downloadable
- Batch entry added to `uploads/data/batches.json`
- All takeoffs linked to batch via `batchId` field

---

## Section 9: What Ships First

**Minimum Proof:**
*The smallest possible demonstration that proves this concept works.*

**NOT:** Build entire batch system with progress tracking, queue visualization, re-do logic, etc.

**BUILD:**

1. **Single-property batch entry** (Week 1)
   - User uploads PDF
   - User enters one property name (text field)
   - System links takeoff to property name
   - User does manual takeoff (existing flow)
   - System saves with `propertyName` + `batchId`
   - Test: One takeoff can be queried by {batchId, propertyName}

2. **Basic CSV export** (Week 1)
   - User provides batchId
   - System generates CSV with rows: [propertyName, area, confidence]
   - No images, no markup links yet
   - Test: CSV is well-formed, readable in Excel

3. **Add one more property, export both** (Week 2)
   - User uploads PDF
   - User enters 2 property names
   - User does 2 manual takeoffs (existing flow, but each linked to batch)
   - System exports CSV with both rows
   - Test: CSV has 2 rows, areas are different, both are correct

**Success = "One estimator can queue 3 properties, takeoff all 3 in sequence, export a CSV, and verify the results in < 10 minutes."**

Everything else (progress bar, batch queue visualization, image exports, re-do logic) waits for V1.5 or V2.

---

## Section 10: What's Premature

**Intentionally Postponed:**
- Scale auto-detection (requires OCR or ML; V2)
- Boundary auto-detection (requires computer vision; V2)
- Multi-sheet scale inference ("if sheet 1 is 1/4", sheet 2 is probably the same" — not reliable; V3)
- Pricing integration (batches export areas, but not costs yet; V2)
- Revision comparison (comparing takeoffs across versions of same plan; V3)
- Bluebeam integration (export markups to Bluebeam; V2)
- Advanced confidence scoring (pattern analysis from corrections; V2)

**Future Seeds / Emerging Systems:**
- **Corrections Learning Engine** — feeds on batch correction data, improves confidence scoring over time
- **Similar Projects Library** — "Master Bedrooms from past jobs were 240–260 sq ft" — helps new takeoffs start with informed estimates
- **Estimating Intelligence** — batch data aggregates into should-cost benchmarks
- **Revision Comparison** — detect what changed between two versions of a plan, measure only the deltas

---

## Section 11: Knowledge Capture

**What New Knowledge Is Created:**
- Which room types appear in which architectural styles
- What square footages are typical for "Master Bedroom" (240–280 sq ft range across past jobs)
- Which scale sources are most reliable (are title blocks more reliable than marked dimensions?)
- Common measurement ambiguities (pocket doors, open plans, etc.)

**What Lessons Are Preserved:**
- "If the scale was marked on sheet 1 but not sheet 3, sheet 3 was likely 1/4"
- "Bathroom sizes are usually 40–50 sq ft; if your trace is 120 sq ft, re-check the boundary"
- "Confidence drops when pocket doors are involved"

**What Institutional Intelligence Is Added:**
- Past takeoff decisions become searchable ("show me all dining rooms we've measured")
- Correction patterns emerge ("we consistently underestimate kitchen areas when facing an open floor plan")
- The system learns which estimators are conservative vs. aggressive (future version)

**Tribal Knowledge to Capture:**
- Aaron's scale confidence rules ("title block dimensions are authoritative, graphic scale is fallback")
- Aaron's boundary rules ("include closets, exclude hallways, ask about mechanical rooms")

---

## Section 12: Wisdom Impact

**Does this create:**
- ✅ **Knowledge?** Yes — measurements + confidence scores are captured
- ✅ **Experience?** Yes — over 10 batches, we see patterns in corrections
- ✅ **Wisdom?** Not yet — that's V2 (pattern recognition on correction data)
- ✅ **Judgment?** Not yet — judgment is "given past corrections on similar rooms, what's the right estimate for this one?" (requires ML/analysis)

**Hierarchy Check:**
```
Information (raw areas, page numbers)
  ↓
Knowledge (area + confidence + scale source)
  ↓
Experience (corrections show us which confidence levels were wrong)
  ↓
Wisdom (patterns in corrections inform future scoring) ← Not yet
  ↓
Judgment (given room type + style + corrections history, predict area) ← Not yet
```

**Honest Assessment:** This feature moves us from Information to Knowledge + some Experience. Wisdom and Judgment require correction data accumulation + analysis, which is V2+.

---

## Section 13: Ownership Test

**Question: If Aaron owned this feature for 10 years, would he still be proud of it?**

**Sub-questions:**

- **Does it preserve company knowledge?** ✅ Yes — every batch is archived, corrections are logged, past measurements are referenceable
- **Does it improve employees?** ✅ Yes — new estimators learn from past batches, can see how rooms were measured
- **Does it reduce future mistakes?** ✅ Yes — correction history prevents repeating the same mis-estimates
- **Does it create lasting value?** ✅ Yes — 10 years of batches becomes an invaluable database of "what this room type measures in this region"

**Answer: YES.** This feature serves Stewardship and Continuity. It's not flashy, but it's foundational. In 10 years, Aaron would look at the batch archive and say "this is how we got here."

---

## Final Section: AMS Brain Impact Summary

| Category | Impact |
|---|---|
| **Feature Name** | Batch Takeoff Workflow |
| **Capability Added** | Multi-property takeoff queuing + CSV export |
| **Knowledge Added** | Standardized measurement record (property name + area + confidence) |
| **Memory Added** | Batch archive with all takeoffs + markups + corrections |
| **Experience Added** | Correction patterns become visible per room type |
| **Wisdom Added** | Not yet — requires correction analysis (V2) |
| **Judgment Impact** | Sets the foundation — future version can recommend areas based on past corrections |
| **Business Impact** | 10x faster multi-room estimate turnaround (3 hrs → 30 min) |
| **Constitutional Alignment** | Stewardship (knowledge preserved), Continuity (future work informed by past), Decision Journaling (every override logged) |
| **Roadmap Priority** | Phase 1 (Core Systems) — V1 Foundation layer |
| **Recommended Next Slice** | Scale auto-detection via OCR (V1.5) — removes manual calibration friction |

---

## Implementation Readiness

This plan is **ready to hand to a developer Monday morning** with:
- ✅ Clear inputs/outputs
- ✅ Concrete user workflow
- ✅ Code module list
- ✅ API specifications
- ✅ Data model changes
- ✅ Test cases
- ✅ Honest scope (minimum proof in 2 weeks)
- ✅ Constitutional alignment
- ✅ Ownership test passes

**Estimated effort:** 10–12 developer days for first shippable slice (single property entry + basic CSV export).

**First milestone:** User can upload PDF, enter 1 property, takeoff, export CSV with 1 row. Takes < 1 week.

**Second milestone:** User can queue 3 properties, takeoff all 3, export CSV with 3 rows. Takes < 2 weeks total.

