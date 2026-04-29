# Takeoff Demon — Setup Guide

Construction takeoff and cost-estimation agent for Microsoft Copilot. This guide walks you through installing, testing, and customizing the agent.

---

## 1. What's in this repo

| File | Purpose |
|---|---|
| `manifest.json` | The Copilot agent definition. Single file. Holds the system prompt, built-in price list, operating rules, trade scopes, commands, and conversation starters. |
| `SETUP.md` | This guide. |
| `README.md` | Short project description. |

The agent runs entirely off `manifest.json`. Edit that file to change behavior.

---

## 2. What this agent does

- **Quantity takeoffs** for residential trades (framing, concrete, roofing, drywall, MEP, finishes, sitework, etc.).
- **Itemized cost estimates** with assumptions, labor, overhead, tax, risks, and a confidence rating.
- **Sub-bid review** — paste a sub's bid, get a side-by-side vs. your should-cost number, scope-gap detection, and a hard verdict (GOOD BID / HIGH BUT FAIR / PADDED / UNDER-SCOPED / OPAQUE).
- **Teach mode** — walks you through *how to do* a takeoff yourself: which sheets to pull, what to measure, the formulas, common mistakes.
- **Easily Missed checklist** — runs against every priced estimate so the soft costs and wedge items don't slip through.
- **Transparent waste math** — every waste calculation shows the formula.

---

## 3. Install in Microsoft Copilot

The agent is a **declarative agent / plugin manifest** built on the v2.1 plugin schema (`https://developer.microsoft.com/json-schemas/copilot/plugin/v2.1/schema.json`).

### Option A — Copilot Studio (recommended for owner-operator use)

1. Go to **https://copilotstudio.microsoft.com**
2. Sign in with your Microsoft 365 account.
3. **Create** → **New agent**.
4. Choose **Skip to configure** (don't use the wizard).
5. Name the agent: `Construction Takeoff Estimator`.
6. Open the **Instructions** field and paste the content of the `instructions` value from `manifest.json` (everything between the quotes). If the field has a character limit, see Troubleshooting below.
7. Open **Conversation starters** and add the six starters from `manifest.json`.
8. **Save**, then **Test** in the right-hand pane.
9. When ready: **Publish** → **Make available to me / my org**.

### Option B — Microsoft 365 Agents Toolkit (VS Code)

1. Install **Microsoft 365 Agents Toolkit** in VS Code.
2. Create a new declarative agent project.
3. Replace the generated manifest with `manifest.json` from this repo.
4. Sign in with your M365 dev account.
5. **Provision** → **Deploy** → **Publish to your tenant**.

### Option C — Direct upload (if your tenant supports it)

1. In Microsoft 365 Admin Center → Integrated Apps.
2. Upload `manifest.json` (may need to be wrapped in a Teams app package — see Microsoft docs).

---

## 4. First-time test (do this before relying on it)

Run these in order. Each should produce the response described.

| Test | What to type | What you should see |
|---|---|---|
| 1 | `/takeoff` | Agent asks whether you're using manual quantities or a plan-based description. |
| 2 | `/scope plumbing` | Three-section breakdown: Includes / Excludes / Easily Missed for plumbing. |
| 3 | `/teach framing` | Six-step walkthrough: sheets to pull, measurements, formulas, waste, common mistakes, sanity check. |
| 4 | `/should-cost roofing — 30 sq gable, 6:12, architectural shingles` | Quantity table with waste shown as a formula, labor hours, total $. Confidence rating. |
| 5 | `/easily-missed` (after running an estimate) | List of items not yet covered, organized by category. |
| 6 | `/compare-sub electrical` then paste a fake bid | Side-by-side table, scope gaps, double-counts, **HARD VERDICT** tag, recommended action. |

If any of these fail, see Troubleshooting.

---

## 5. Customizing the agent

Everything is in `manifest.json`. The main sections of the `instructions` field you'll want to tune:

### 5a. Built-in price list
Search for `## Built-In Price List`. Update unit prices to match your suppliers. Format must stay the same:
```
- Item name with size: $X.XX/unit
```

### 5b. Default waste factors
Search for `## Default Waste Factors`. Adjust % per trade.

### 5c. Default calculation factors
Search for `## Default Calculation Factors`.
- Labor: 40% of materials (flat, used by `/takeoff` for speed)
- Overhead & Profit: 15%
- Sales Tax: 8.25% (Texas)

Override at runtime with `/override-labor`, `/override-op`, `/override-tax`.

### 5d. Production rates (used by `/should-cost` and `/compare-sub`)
Search for `## Production Rates for Should-Cost`. These are industry averages. If you have crew data from past jobs, replace the ranges. Format is labor-hours per unit.

Default loaded labor rate is **$65/hr**. Change with `/override-laborrate` at runtime, or edit the line in the manifest.

### 5e. Soft costs & general conditions
Search for `## Soft Costs & General Conditions`. Update permit %, insurance %, dumpster price, port-a-john rate, etc., to your local market.

### 5f. Trade scope reference (most important for sub-bid review)
Search for `## Trade Scope Reference`. Each trade has Includes / Excludes / Easily Missed. Add anything specific to how you contract with your subs — this is what the agent uses to find scope gaps in their bids.

### 5g. Easily Missed master checklist
Search for `## Easily Missed Master Checklist`. Add items you've gotten burned on. The agent runs this against every priced estimate.

After any edit, re-validate:
```bash
python3 -c "import json; json.load(open('manifest.json')); print('OK')"
```

Then re-upload to Copilot.

---

## 6. Command cheat sheet

**Takeoffs & Estimates**
- `/takeoff` — full estimator pass
- `/framing` `/concrete` `/drywall` `/roofing` `/siding` `/openings` `/sitework` `/insulation` — trade-only
- `/summary` — Cost Summary table only
- `/export` — Excel/CSV format

**Sub-Bid Review**
- `/compare-sub [trade]` — paste sub's bid, get verdict
- `/should-cost [trade]` — your benchmark for that trade
- `/scope [trade]` — Includes / Excludes / Easily Missed

**Learning**
- `/teach [trade]` — how to do the takeoff yourself
- `/read [trade]` — which sheets matter and what to look for

**Quality Checks**
- `/verify` — re-run math/units/waste/tax checks
- `/risks` — constructability concerns
- `/assumptions` — list every assumption used
- `/easily-missed` — gap-check the current estimate

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

## 7. Workflow — using it on a real job

1. **Receive plans.** Open with the agent.
2. **Run `/takeoff`** for the full priced estimate. Review the assumptions and risks sections.
3. **Run `/easily-missed`** to gap-check.
4. **Send RFPs to subs** using the relevant `/scope [trade]` outputs as your scope letter.
5. **When sub bids come back**, run `/compare-sub [trade]` and paste each one. Read the verdict.
6. **Negotiate or sign** based on the verdict and recommended action.
7. **For unfamiliar trades**, run `/teach [trade]` first to understand what you're looking at before reviewing the bid.

---

## 8. Troubleshooting

**Copilot rejects the manifest on upload**
- Validate JSON: `python3 -c "import json; json.load(open('manifest.json'))"`
- Check schema URL is reachable and matches your tenant's supported version.
- The `instructions` field is long (~30k chars). If your Copilot configuration has a smaller limit, split the content: keep core rules + commands in `instructions`, and move the price list, trade scope reference, and easily-missed checklist to a knowledge file the agent can reference.

**Agent gives a lump sum instead of a line-item table**
- It violated a rule. Type: `Re-run that with the full line-item table per Operating Rule 10.`
- If it keeps doing it, the `description_for_model` field may be getting truncated by your Copilot configuration. Consider tightening it.

**Agent guesses a price instead of flagging PRICE NEEDED**
- Same as above. Remind it of Final Rule 1.

**Sub-bid comparison feels off**
- The Production Rates are industry averages. They may not match your market. Override the loaded labor rate (`/override-laborrate`) or edit the rates in the manifest.
- For pricing accuracy, run `/pricing-refresh` with a ZIP code first so the should-cost uses current local pricing.

**Math errors in the estimate**
- Type `/verify` to force a re-check.
- If errors persist, paste the affected line and ask for the formula.

---

## 9. Editing tips

- Always keep `manifest.json` valid JSON. Test before pushing.
- Real newlines inside the `instructions` string must stay as `\n` escape sequences.
- Inch marks inside strings need escaping: `0.5\"` not `0.5"`.
- After every edit, re-upload the full manifest to Copilot — it does not hot-reload.

---

## 10. Version control

This agent is tracked on branch `claude/general-assistance-09Yly`. Commit changes as you tune the price list, scope reference, and easily-missed checklist — those are the highest-leverage tuning surfaces.
