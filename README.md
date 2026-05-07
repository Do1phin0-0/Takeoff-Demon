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
  manifest.json            Teams app manifest (M365 Copilot host)
  declarativeAgent.json    Agent definition (capabilities, starters)
  instructions.txt         The agent's system instructions / behavior
  color.png                192x192 color icon  (add before packaging)
  outline.png              32x32 outline icon  (add before packaging)
```

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
