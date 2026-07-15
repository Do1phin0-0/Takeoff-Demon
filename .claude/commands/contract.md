---
description: Draft an AMS Construction subcontract, field-by-field, on AMS's standard paper
---

# `/contract [project]`

Draft an AMS Construction subcontract, field-by-field, matching AMS's standard paper. You are not a lawyer — you draft using AMS's standard paper; you do not give legal advice.

Supporting files for this command live in `.claude/commands/contract_assets/`:
- `AMS_Master_Subcontract_Template.docx` — the master Word template
- `fill_template.py` — fills the template's placeholders and produces a finished `.docx`

**Step 1 — identify the project.** Ask which project this is for (project #, name, address, and AMS PM's name/phone/email) unless the user has already given you this in the current conversation — don't re-ask for details you already have.

**Step 2 — cost code.** Match the described scope to the closest code below. If more than one applies (e.g. a glazing package touching storefronts, hardware, and glass), list all applicable codes rather than forcing one. If nothing matches closely, ask for the correct code rather than guessing.

| Cost Code | Trade / Description |
|---|---|
| 3000 | Concrete |
| 6180 | Structural Trusses (Material Contract) |
| 6400 | Millwork Package |
| 8000 | Door Package (General) |
| 8410 | Aluminum Entrances & Storefronts |
| 8710 | Door Hardware |
| 8800 | Glazing |
| 9600 | Floor Finishes |
| 10000 | Restroom Accessories Package |
| 10300 | Fire Extinguishers & FEC |
| 13854 | Fire Alarm / Smoke Alarm |
| 15100 | Plumbing |
| 15700 | HVAC System |
| 16100 | Electrical |

This list grows over time. If the user gives you a new trade + cost code pairing, add a row to this table (edit this file, `.claude/commands/contract.md`) so it's available on future runs — do this without asking for confirmation, it's just data entry.

**Step 3 — subcontract number and date.** Format: `[Project #]-SC-[Cost Code]`. Example: Project 2, Plumbing → `2-SC-15100`. If this is a second subcontract for the same trade/cost code on the same project, ask the user whether a prior one already exists on this code; if so, append `-1`, `-2`, etc. Date defaults to today unless the user specifies otherwise.

**Step 4 — walk the remaining fields.** For the fields below, ask what's needed. Fields marked (LOCKED) are standing AMS policy — before drafting, confirm them as a single batch ("Standard AMS terms apply — NET30, 10% retention, PM-approval change orders, invoices to ap@ams-tx.com. Say the word if any of these need to be different for this deal") rather than asking about each one individually. Flag it if the user wants to override a LOCKED field, since it affects risk exposure company-wide.

1. Subcontractor info — company name, address, contact name, phone, email
2. Retention Rate — default 10% (LOCKED unless overridden for a specific deal)
3. Plans/Specs Attached — mark based on what's actually being transmitted, and get the spec date
4. Scope of Work — package name, cost code, code description, dollar amount
5. Scope narrative — one-line summary + "includes but not limited to" list (permits, materials, install, testing/inspections, daily clean-up, coordination with AMS super and other trades)
6. Change order clause — standard language, PM approval required (LOCKED)
7. Payment terms — NET30 (LOCKED)
8. Invoice routing — ap@ams-tx.com, cc AMS PM (LOCKED)
9. Amount of Subcontract — total dollar figure

**Standard Terms & Conditions** (attach unchanged unless a principal authorizes an exception): Paid-When-Paid, 48-hour cure period before termination, asymmetric termination rights (Contractor: convenience or cause; Subcontractor: mutual agreement or Contractor's uncured default), binding AAA arbitration in Houston TX, indemnification (Subcontractor covers claims from their own work except AMS's own negligence), insurance minimums ($1,000,000/$2,000,000 GL, TX Workers' Comp, $1,000,000 combined single limit Auto), Texas governing law, independent contractor status, Force Majeure, Entire Agreement. These are baked into the master template already — no field-filling needed for this section.

**Known gaps, intentionally excluded per AMS decision:** no warranty clause, no lien waiver requirement, no retainage release procedure, no plans/specs exhibit sheet-number referencing. Don't add these unless explicitly asked for that specific deal.

**Step 5 — signatures.** Always leave both the AMS PM's signature line and the Subcontractor's signature line blank for physical/wet signature — never fill these in as text. Just confirm both parties are accounted for.

**Step 6 — generate the file.** Once every field is collected:
1. Flag anything unusual (out-of-range dollar amount, missing insurance info, an unfamiliar cost code) before finalizing — ask the user to confirm or correct before proceeding.
2. Build a JSON values file mapping every placeholder token to its value (see the header comment in `fill_template.py` for the exact token list and the `PLANS_ATTACHED` / `SPECS_ATTACHED` boolean keys), write it to a scratch path, and run:
   `python3 .claude/commands/contract_assets/fill_template.py <values.json> <output.docx>`
   Name the output file `[Subcontract#].docx` (e.g. `2-SC-15100.docx`).
3. If the script warns about unfilled placeholders, fix the values file and rerun before delivering anything.
4. Deliver the finished `.docx` to the user as a file (not pasted text).
