# Setup Guide — Subcontractor Finder for Microsoft 365 Copilot

This is the step-by-step manual. If you've never deployed a Copilot agent
before, follow Path A first — you'll have working agents in Copilot in about
10 minutes. Once that's running, come back for Path B to connect your CRM.

---

## What you're building (in plain English)

You're putting **7 agents** inside Microsoft 365 Copilot:

- **Subcontractor Finder** — multi-trade. Pulls a bid list across several
  trades at once.
- **Electrical** / **Plumbing** / **HVAC** / **Framing** / **Concrete** /
  **Roofing** — one specialist per trade. Each knows the relevant state
  license boards, certifications, and search heuristics for that trade.

When you ask one of them "find 10 commercial electricians in Dallas", it
searches the web, verifies what it can, and hands you an `.xlsx` bid sheet
with phone, email, license #, and a Bid Status dropdown.

In **Path B** you also connect a small database of your existing
subcontractors so the agents look there first before searching the web — and
can update bid status from inside Copilot.

---

## Before you start (one-time prerequisites)

You need:

1. **A Microsoft 365 account** with Copilot licensed (Microsoft 365 Copilot,
   Copilot for Microsoft 365, or a tenant that has the Copilot Agent
   Builder enabled). If you don't see "Agents" in your Copilot left rail,
   you don't have the license yet — talk to your tenant admin.

2. **Permission to upload custom apps in Teams**. Most tenants allow this
   for end users; some lock it to admins. If your IT admin manages this,
   ask them to upload the zip you'll build below, OR ask them to enable
   "Allow users to upload custom apps" in Teams admin center.

3. **Python 3** installed locally (used by the build script). Check by
   running `python3 --version` in a terminal. If missing, install from
   https://www.python.org/downloads/.

4. **The `zip` command** (built into macOS and Linux). On Windows, install
   **Git for Windows** (https://git-scm.com/download/win) and use Git Bash,
   or use WSL (Windows Subsystem for Linux).

5. **This repo cloned to your computer.** If you haven't yet:
   ```
   git clone https://github.com/Do1phin0-0/Takeoff-Demon.git
   cd Takeoff-Demon
   ```

That's all you need for Path A. Path B has more (we'll cover those then).

---

## Path A — Quick start: upload to Copilot in 10 minutes

This skips the CRM. You get all 7 agents with web search and Excel export.
Bid status will live in the Excel file only (not synced to a database). This
is the right starting point for everyone.

### A1. Build the upload zip

Open a terminal in the project folder and run:

```
./build.sh lite
```

What this does:
- Validates everything is shaped correctly.
- Strips out the CRM plugin (the `lite` flag).
- Produces `dist/subcontractor-finder.zip`.

You should see `OK — package is valid` and `Done.` at the end. If you get
errors, see **Troubleshooting** below.

> **Windows note:** if `./build.sh lite` doesn't work, open Git Bash, `cd` to
> the folder, and run `bash build.sh lite`.

### A2. Upload to Copilot

You have three ways to install it. Pick the easiest one available to you.

**Option 1 — Microsoft 365 Copilot Agent Builder (easiest):**
1. Go to https://m365.cloud.microsoft and click **Copilot** in the left rail.
2. Click **Agents** (or **Build an agent**).
3. Click **Import** (sometimes labeled "Upload" or "Import package").
4. Select `dist/subcontractor-finder.zip`.
5. Wait for "Import successful." All 7 agents appear in your agent list.

**Option 2 — Teams sideload (works if your tenant allows custom apps):**
1. Open Microsoft Teams.
2. Click **Apps** in the left rail → **Manage your apps** at the bottom.
3. Click **Upload an app** → **Upload a custom app**.
4. Select `dist/subcontractor-finder.zip`.
5. Click **Add**. The agents will then show up inside Copilot too.

**Option 3 — Tenant-wide via admin center (for IT admins):**
1. Go to https://admin.microsoft.com → **Settings** → **Integrated apps**
   → **Upload custom apps**.
2. Choose **Upload manifest file (.zip)**.
3. Select `dist/subcontractor-finder.zip` and follow the wizard.
4. Assign to all users or a security group.

### A3. Try it

1. Open Copilot.
2. In the **Agents** list, click **Subcontractor Finder** (or any specialist
   like **HVAC**).
3. Click one of the suggested starters, or type something like:
   ```
   Find 10 licensed commercial electricians within 50 miles of Dallas, TX
   for an office TI. Export to Excel.
   ```
4. The agent will ask any clarifying questions, then search the web and
   produce a `.xlsx` file you can download.

If that worked, **you're done with Path A**. You can stop here and come back
to Path B whenever you want CRM integration.

---

## Path B — Full setup: connect your subcontractor list

This adds your saved roster as the first place the agents look. You'll:

1. Stand up a small web service that exposes your contacts.
2. Register an API key with Microsoft.
3. Update two placeholders in the package.
4. Re-build and re-upload.

There's a working reference server in `server/` you can use as-is for
testing — it stores 12 example subs in a local SQLite file. Replace it with
your real CRM later.

### B1. Get your contacts into the reference server

Open `server/seed.csv` and replace the rows with your real subcontractors.
The columns are:

```
id, company, contact_name, phone, email, website, trade, specialty,
license_number, license_state, service_area_city, service_area_state,
service_radius_miles, project_types, bid_status, bid_amount, notes,
last_used_date
```

- `id` — anything unique, e.g. `sub-001`, `sub-002`.
- `trade` — must be one of: `electrical`, `plumbing`, `hvac`, `framing`,
  `concrete`, `roofing` (lowercase).
- `project_types` — semicolon-separated, e.g. `commercial;multi_family`.
- `bid_status` — `Not Contacted` is a fine default.
- Leave any field blank if you don't have it.

> **Easiest way to edit:** open `seed.csv` in Excel, edit the rows, **Save
> As → CSV (Comma delimited)**, and overwrite the file.

### B2. Run the server locally

In a new terminal:

```
cd server
python3 -m venv .venv
source .venv/bin/activate           # Windows Git Bash: source .venv/Scripts/activate
pip install -r requirements.txt
export CRM_API_KEY=pick-a-strong-secret-here
uvicorn main:app --host 0.0.0.0 --port 8080
```

The server now answers requests on http://localhost:8080. Leave that
terminal open — closing it stops the server.

Test it from another terminal:
```
curl -s -H "X-Api-Key: pick-a-strong-secret-here" \
  "http://localhost:8080/subcontractors?trade=electrical" | head
```
You should see JSON with your subs.

### B3. Make the server reachable from Copilot

Copilot lives in Microsoft's cloud — it can't call `localhost`. Two options:

**For testing — use a tunnel:**
1. Install **ngrok** from https://ngrok.com/download (free account).
2. In a new terminal: `ngrok http 8080`
3. Copy the `https://<random>.ngrok.app` URL it prints. Keep that terminal
   open while you're testing.

**For production — host it somewhere with HTTPS:** Azure App Service,
Azure Container Apps, AWS App Runner, Render, Fly.io, etc. The container
just needs to run `uvicorn main:app --host 0.0.0.0 --port 8080` and have
`CRM_API_KEY` set in the environment.

Whichever you pick, you now have a public HTTPS URL like
`https://abc123.ngrok.app` or `https://my-crm.azurewebsites.net`.

### B4. Register your API key with Microsoft

The plugin uses Microsoft's secret vault, which means the API key never
goes inside the zip. You register it once in the Teams Developer Portal.

1. Go to https://dev.teams.microsoft.com.
2. Click **Tools** in the left rail → **API key**.
3. Click **Add API key**.
4. Name: `Subcontractor CRM`.
5. **Domain**: paste the **host** part of your URL (e.g. `abc123.ngrok.app`
   or `my-crm.azurewebsites.net` — no `https://`, no trailing slash).
6. **API key value**: the same secret you used for `CRM_API_KEY`.
7. Click **Save**.
8. Copy the **Reference ID** (a GUID like
   `a1b2c3d4-1234-5678-9abc-def012345678`). You'll paste this into the
   package next.

### B5. Wire your URL and key reference into the package

You need to replace **two** placeholders.

**Placeholder 1 — your server URL.** Open
`appPackage/plugins/crm-openapi.yaml`. Find this line near the top:

```yaml
servers:
  - url: https://YOUR-CRM-HOST.example.com
```

Change it to your URL (full URL, including `https://`):
```yaml
servers:
  - url: https://abc123.ngrok.app
```

**Placeholder 2 — your reference ID.** Open
`appPackage/plugins/crm-plugin.json`. Find this block:

```json
"auth": {
  "type": "ApiKeyPluginVault",
  "reference_id": "00000000-0000-0000-0000-000000000000"
}
```

Replace the GUID with the Reference ID you copied in B4.

Save both files.

### B6. Re-build (full mode this time) and re-upload

```
./build.sh
```

Note: **no `lite` argument**. This produces the full build with the CRM
plugin included. The validator will print only one warning ("placeholder
server URL") if you forgot step B5 — fix it and re-run.

Re-upload `dist/subcontractor-finder.zip` using whichever Option you used
in step A2 (most importers will ask "Replace existing?" — say yes).

### B7. Try it

Open Copilot → **Subcontractor Finder — Electrical** (for example) and ask:

```
Find electricians in Dallas, TX.
```

The agent should:
1. Call your CRM first and return any matching subs you have on file.
2. Tell you how many came from the CRM vs. the web.
3. Mark CRM rows with `Source = CRM` in the spreadsheet.

Then try a status update:
```
Mark Lone Star Electric as Bid Sent and add a note that I asked for a
revised number on the panelboards.
```

The agent should call `updateBidStatus`, change the row in your database,
and re-export the workbook. Refresh the server's data file or query the
API — the change is persisted.

If you see "Sorry, I can't reach the CRM right now," see **Troubleshooting**.

---

## Daily use — example conversations

Once it's installed, you don't need this guide anymore. A few example
prompts to try:

- `Find 10 plumbing subs in Phoenix for a 120-unit multi-family. Need
  ROC L-37 holders.`
- `Build a bid list for framing, drywall, and HVAC in Denver. One Excel
  file, one tab per trade.`
- `Re-export my last list with Bid Status set to Bid Sent for everyone.`
- `Mark Sonoran Plumbing as Awarded at $89,400 and add today's date.`
- `Find roofing subs in Atlanta with GAF Master Select certification only.`

The agent will ask any missing details (like your radius or project type)
in one short message before searching. Answer in the same chat.

---

## Troubleshooting

**`./build.sh: Permission denied`**
Run `chmod +x build.sh` once, then try again.

**`./build.sh` says `python3: command not found`**
Install Python 3 from https://www.python.org/downloads/ and re-open the
terminal.

**Validator errors with `icons.color file missing`**
You're missing `appPackage/color.png` or `appPackage/outline.png`. They
ship in the repo — make sure you didn't delete them. If they're truly gone,
re-clone the repo or copy them from a recent commit.

**Validator warns "openapi spec still has the placeholder server URL"**
You're in the middle of Path B and haven't done step B5 yet. That's
expected — finish B5 and re-run.

**Teams says "We couldn't install this app"**
Your tenant probably blocks custom app uploads. Ask your IT admin to use
**Option 3** in step A2 (admin center) or to enable user uploads.

**Copilot doesn't show the new agents after upload**
Refresh the page. If still missing, wait 5–10 minutes — the M365 catalog
sometimes lags. If it never appears, check the import status in the agent
manager and look for an error message.

**Agent says "Sorry, I can't reach the CRM right now" (Path B)**
Check, in order:
1. Is your server running? (the terminal where you ran `uvicorn` should
   still be open).
2. Is your tunnel running? (the terminal where you ran `ngrok`).
3. Did you paste the correct URL into `crm-openapi.yaml` AND re-build AND
   re-upload?
4. Did you paste the correct Reference ID into `crm-plugin.json`?
5. Does the API key in Teams Developer Portal match what your server
   expects (the `CRM_API_KEY` env var)?

**Agent invents subcontractors that don't exist**
Tell it explicitly: "Only include subs you can verify on the state
licensing board. If you can't verify a license, don't include the row."
The agent's instructions already say this, but for borderline cases a
direct reminder helps.

**I want to add a new trade specialist (e.g. drywall)**
1. Copy `appPackage/agents/framing.json` to `appPackage/agents/drywall.json`
   and edit the name, description, conversation_starters, and
   `instructions` file path.
2. Copy `framing.instructions.txt` to `drywall.instructions.txt` and
   rewrite the trade-specific sections.
3. Add a new entry to `manifest.json` under
   `copilotAgents.declarativeAgents`.
4. Re-build and re-upload.

---

## Where things live (so you can edit them yourself)

| What you want to change | File |
|---|---|
| The generalist agent's behavior | `appPackage/instructions.txt` |
| A specialist's behavior | `appPackage/agents/<trade>.instructions.txt` |
| Conversation starters | each agent's `*.json` file |
| Excel column layout | the **Excel output schema** section in the relevant `instructions.txt` |
| Which trades exist | `appPackage/manifest.json` (the `declarativeAgents` list) |
| The CRM API contract | `appPackage/plugins/crm-openapi.yaml` |
| Your sub list (reference server) | `server/seed.csv` |
| Icons | `appPackage/color.png` (192×192) and `outline.png` (32×32) |

After any edit: `./build.sh` (or `./build.sh lite`) and re-upload.
