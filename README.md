# Takeoff Demon — Subcontractor Finder

A Microsoft 365 Copilot **declarative agent** that finds qualified construction subcontractors by trade and location, then exports a clean, structured Excel bid list.

## What it does

Given a trade (electrical, plumbing, HVAC, framing, etc.) and a project location, the agent:

1. Asks any clarifying questions it needs (radius, commercial vs. residential, project size).
2. Runs targeted web searches against state licensing boards, BBB, and trade directories.
3. Verifies each candidate has at least a company name + phone or email before listing it.
4. Generates a `.xlsx` workbook with one sheet per trade and a filterable table covering:
   Company, Contact, Phone, Email, Website, Trade, License #, License State, Service Area, Source, Bid Status, Bid Amount, Notes.
5. Drops in a data-validation dropdown on **Bid Status** so you can run the bid process directly in the sheet.

## Repo layout

```
appPackage/
  manifest.json            Teams app manifest — registers all 7 agents + plugin
  declarativeAgent.json    Generalist agent (multi-trade bid lists)
  instructions.txt         Generalist instructions
  agents/
    electrical.json        + electrical.instructions.txt
    plumbing.json          + plumbing.instructions.txt
    hvac.json              + hvac.instructions.txt
    framing.json           + framing.instructions.txt
    concrete.json          + concrete.instructions.txt
    roofing.json           + roofing.instructions.txt
  plugins/
    crm-plugin.json        API plugin manifest (referenced by every agent)
    crm-openapi.yaml       OpenAPI 3.0 spec for the CRM backend
  color.png                192x192 color icon  (add before packaging)
  outline.png              32x32 outline icon  (add before packaging)

server/                    Reference FastAPI implementation of the CRM API
  main.py
  seed.csv
  requirements.txt
  README.md
```

## CRM-first search

Every agent has a connected action that searches the user's subcontractor
roster **before** falling back to web search. Three operations are exposed:

| Operation | When the agent calls it |
|---|---|
| `searchSubcontractors` | First step of every find-subs flow. Filters by trade, city, state, radius, project type. |
| `getSubcontractor`     | Pull full details for one sub the user named. |
| `updateBidStatus`      | When the user says "mark all as Bid Sent", "ABC Co. is awarded at $42,500", etc. |

The contract lives in `appPackage/plugins/crm-openapi.yaml`. To plug in your
own CRM (Procore, BuilderTrend, HubSpot, Airtable, your own DB), implement
those three endpoints and point the OpenAPI `servers[0].url` at your host.
The reference server in `server/` is fully runnable with seeded data — see
`server/README.md` for run instructions and the steps to register the API
key in Teams Developer Portal.

## Agents shipped in this package

| Agent | When to pick it | Trade-specific Excel column(s) |
|---|---|---|
| Subcontractor Finder | Multi-trade bid lists, or when you don't know the trade yet | — |
| Electrical | Power, low-voltage, controls | Voltage Class |
| Plumbing | Plumbing, gas, medical-gas, backflow | Backflow / Med-Gas Cert |
| HVAC | Mechanical, controls, refrigeration | System Types + EPA 608 |
| Framing | Wood + light-gauge metal stud | System Type + Crew Size |
| Concrete | Flatwork, structural, tilt-up | Scope Capabilities + Equipment |
| Roofing | Low-slope, steep-slope, metal | System Types + Manufacturer Certs |

Each specialist knows its own state license boards (CSLB / TDLR / ROC / CILB / etc.) and trade-specific verification rules.

## Capabilities used

- **WebSearch** — built-in M365 Copilot capability for live web lookups.
- **CodeInterpreter** — runs Python (`openpyxl`) to generate the `.xlsx`.

No custom API plugin or hosted backend is required.

## Build & deploy

1. Add `color.png` (192x192) and `outline.png` (32x32, transparent) to `appPackage/`.
2. Replace the `id` GUID in `manifest.json` if you want a fresh app identity.
3. Zip the `appPackage/` directory contents (not the folder itself):
   ```
   cd appPackage && zip ../subcontractor-finder.zip *
   ```
4. Upload to your tenant via the **Microsoft 365 Admin Center → Integrated apps**, or sideload through **Teams → Apps → Manage your apps → Upload an app**.
5. Open Microsoft 365 Copilot, select **Subcontractor Finder** from the agents list, and try a conversation starter.

## Local validation

Validate the manifest against the official schema before packaging:

```
npx @microsoft/teams-manifest validate appPackage/manifest.json
```

## Customizing

- Edit `instructions.txt` to change tone, default result count, or required columns.
- Edit `declarativeAgent.json` to adjust conversation starters or the agent's name/description.
- The Excel schema lives in `instructions.txt` under **Excel output schema** — change it there and the agent will follow the new format on the next run.
