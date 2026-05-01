# Takeoff Demon — Claude Projects Setup Guide

How to set up the agent on **claude.ai Projects**. No character limit issues, no manifest schema, no upload script — just paste, upload, and use.

**Coverage:** residential, commercial (structural steel, CFMF, Nichiha/ACM/EIFS/stucco, storefront, TPO/EPDM roofing, commercial MEP, fireproofing), and civil/sitework (paving, storm sewer, utilities, detention ponds, fencing, SWPPP). Agent detects the project type from the plans before pricing.

---

## What you need

- A claude.ai account with **Claude Pro** ($20/mo) or **Team** plan. Projects are not available on the Free plan.
- The files in this repo (download the branch or clone it).

---

## Files used in this setup

| File | Purpose | Where it goes in Claude |
|---|---|---|
| `claude-system-prompt.md` | The system prompt — all rules, procedures, commands, output formats. | Paste into **Custom instructions** |
| `knowledge/price-list.md` | Built-in unit prices. | Upload to **Project knowledge** |
| `knowledge/trade-scopes.md` | Trade Includes / Excludes / Easily Missed for sub-bid review. | Upload to **Project knowledge** |
| `knowledge/easily-missed.md` | Master checklist applied to every estimate. | Upload to **Project knowledge** |
| `knowledge/blueprint-reading.md` | Per-trade guide for reading plans. | Upload to **Project knowledge** |
| `knowledge/production-rates.md` | Labor-hours per unit for should-cost benchmarking. | Upload to **Project knowledge** |

---

## Step-by-step setup

### 1. Create the Project

1. Go to **https://claude.ai**
2. Click **Projects** in the left sidebar.
3. Click **Create project** (or **New project**).
4. Name it: **Takeoff Demon**
5. Description: *Construction takeoff and cost estimation agent. Reads plans, runs takeoffs by trade, builds estimates, and reviews sub bids with a hard verdict.*

### 2. Paste the system prompt

1. In the project, find **Custom instructions** (sometimes labeled "Project instructions" or behind a "Set custom instructions" button).
2. Open `claude-system-prompt.md` from the repo in any text editor.
3. Copy the **entire contents** of that file.
4. Paste into the Custom instructions field.
5. Save.

### 3. Upload the knowledge files

1. Find **Project knowledge** (or "Knowledge" — section that lets you upload files).
2. Upload all five files from the `knowledge/` folder:
   - `price-list.md`
   - `trade-scopes.md`
   - `easily-missed.md`
   - `blueprint-reading.md`
   - `production-rates.md`
3. Wait for them to finish processing (Claude indexes them).

### 4. Test it

Open a new chat in the project and run these in order:

| # | Type | Expected response |
|---|---|---|
| 1 | `/takeoff` | Asks if you're using manual quantities or a plan-based description. |
| 2 | `/scope plumbing` | Pulls from trade-scopes.md. Three sections: Includes / Excludes / Easily Missed. |
| 3 | `/teach framing` | Six-step walkthrough: sheets to pull, measurements, formulas, waste, common mistakes, sanity check. References blueprint-reading.md. |
| 4 | `/should-cost roofing — 30 sq gable, 6:12, architectural shingles` | Quantity table with waste shown as a formula, labor hours from production-rates.md, total $. Confidence rating. |
| 4b | `/should-cost steel — 25 tons of W/HSS commercial frame, 1-story` | Should-cost using commercial steel rates ($4.50/lb erected midpoint), separate labor at $95/hr ironworker. Lists special inspections / weld testing as GC scope. |
| 4c | `/takeoff` then describe a civil-only project (e.g., truck parking lot, storm sewer) | Agent declares **Civil / Sitework** project type, uses CIVIL section of price-list.md, includes lime stabilization / RCP / manholes / SWPPP. Does NOT mix in residential pricing. |
| 5 | After running an estimate, type `/easily-missed` | List of items not yet covered, organized by category. References easily-missed.md. |
| 6 | `/compare-sub electrical` and paste a fake bid | Side-by-side table, scope gaps, double-counts, **HARD VERDICT** tag, recommended action. |

If everything works, you're done. If anything fails, see Troubleshooting below.

---

## Customizing the agent

All tuning is done by editing the markdown files and re-uploading them.

### Update the price list
Edit `knowledge/price-list.md`. Replace any prices with your local supplier numbers. Re-upload to Project knowledge (delete the old version first).

### Update production rates with your actual numbers
Edit `knowledge/production-rates.md`. If you have past jobs that show "we frame at 14 LH per 100 sf, not 16," put your number there.

### Add items the agent missed
Edit `knowledge/easily-missed.md`. Anything that's bitten you on a job, add to the master checklist.

### Change waste factors, tax rate, labor %
Edit `claude-system-prompt.md` (the `## Default Waste Factors` and `## Default Calculation Factors` sections). Re-paste into Custom instructions.

### Tune trade scope (most important for sub-bid reviews)
Edit `knowledge/trade-scopes.md`. Add anything specific to how you contract — this is what `/compare-sub` uses to find scope gaps.

---

## Workflow on a real job

1. **Receive plans.** Open the Takeoff Demon project.
2. **Run `/takeoff`** for the full priced estimate. Review assumptions and risks.
3. **Run `/easily-missed`** to gap-check.
4. **Send RFPs to subs** using `/scope [trade]` outputs as your scope letters.
5. **When sub bids come back**, run `/compare-sub [trade]` and paste each one. Read the verdict.
6. **Negotiate or sign** based on verdict and recommended action.
7. **For unfamiliar trades**, run `/teach [trade]` first to understand what you're looking at.

---

## Command cheat sheet

**Takeoffs & Estimates**
- `/takeoff` — full estimator pass
- `/framing` `/concrete` `/drywall` `/roofing` `/siding` `/openings` `/sitework` `/insulation` — trade-only
- `/summary` — Cost Summary table only
- `/export` — Excel/CSV format

**Sub-Bid Review**
- `/compare-sub [trade]` — paste sub's bid, get verdict
- `/should-cost [trade]` — your benchmark
- `/scope [trade]` — Includes / Excludes / Easily Missed

**Learning**
- `/teach [trade]` — how to do the takeoff yourself
- `/read [trade]` — which sheets matter

**Quality Checks**
- `/verify` — re-run math/units/waste/tax
- `/risks` — constructability concerns
- `/assumptions` — list every assumption
- `/easily-missed` — gap-check current estimate

**Pricing**
- `/pricing-refresh` — pull current pricing (asks ZIP)
- `/update-price [item] [new $]`
- `/add-item [trade] [desc] [qty] [unit] [$]`
- `/remove-item [name]`

**Overrides**
- `/override-labor [%]`
- `/override-op [%]`
- `/override-tax [%]`
- `/override-laborrate [$/hr]`
- `/general-conditions [on|off]`

---

## Troubleshooting

**Claude doesn't know about a file you uploaded**
- Open the project, confirm the file is in Project knowledge and finished processing (no spinner).
- Try: "Read price-list.md and confirm you have access." If Claude says no, re-upload.

**Agent gives a lump sum instead of a line-item table**
- Type: "Re-run that with the full line-item table per Operating Rule 11."

**Agent guesses a price**
- Remind it of Final Rule 1: items not in price-list.md must be flagged `PRICE NEEDED — manual entry required`.

**Sub-bid comparison feels off**
- Production rates are industry averages. Tune to your market: edit `production-rates.md` and re-upload.
- Run `/pricing-refresh` first with your ZIP so should-cost uses current local pricing.

**Math errors**
- Type `/verify` to force a re-check.
- Paste the affected line and ask for the formula.

**Custom instructions field has a length limit**
- claude.ai Project custom instructions handle the full system prompt without issue. If you ever hit a limit, move more content from the prompt into knowledge files (e.g., move the trade-specific takeoff procedures into a new knowledge file).

---

## Sharing

Claude Projects can be shared with team members on the **Team** plan. On Pro, the project is yours alone. To share with another contractor, they'd need to set up their own project from the same files in this repo.

---

## Editing tips

- All five knowledge files are plain markdown. Edit in any text editor.
- After editing, re-upload to claude.ai (delete old version, upload new).
- Commit changes to this repo so you have version history of your tuning.
