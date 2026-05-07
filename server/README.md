# Subcontractor CRM API — reference server

A minimal FastAPI server that implements the contract in
`appPackage/plugins/crm-openapi.yaml`. Use it as-is for development and
demos, or replace it with your real CRM (Procore, BuilderTrend, HubSpot,
Salesforce, Airtable, custom DB) by re-implementing the same three
endpoints.

## Endpoints

| Method | Path | What it does |
|---|---|---|
| `GET`  | `/subcontractors`              | Search by trade, city, state, radius, project type. Use this BEFORE web search. |
| `GET`  | `/subcontractors/{id}`         | Fetch one sub. |
| `POST` | `/subcontractors/{id}/bid-status` | Update bid status / amount / notes. |

All requests require an `X-Api-Key` header.

## Run locally

```bash
cd server
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export CRM_API_KEY=dev-key-change-me
uvicorn main:app --reload --port 8080
```

The server seeds 12 example subs from `seed.csv` on first run and stores them
in a local `subcontractors.sqlite` file. Delete the sqlite file to re-seed.

Try it:
```bash
curl -s -H "X-Api-Key: dev-key-change-me" \
  "http://localhost:8080/subcontractors?trade=electrical&state=TX&city=Dallas" | jq
```

## Expose to Microsoft 365 Copilot

Copilot must reach the API over HTTPS on the public internet. Two easy paths:

**Tunnel (dev / demo):**
```bash
ngrok http 8080
# copy the https://<random>.ngrok.app URL
```

**Hosted:** Azure Container Apps, Azure App Service, AWS App Runner, Fly.io,
Render — anywhere that gives you HTTPS works. The container is just
`uvicorn main:app --host 0.0.0.0 --port 8080`.

## Wire the URL and API key into the agent package

1. In `appPackage/plugins/crm-openapi.yaml`, replace the
   `https://YOUR-CRM-HOST.example.com` server URL with your live one.

2. In **Teams Developer Portal** (https://dev.teams.microsoft.com) → your app
   → API key auth, register an API key with the value of `CRM_API_KEY`. You
   will get back a `reference_id` GUID.

3. In `appPackage/plugins/crm-plugin.json`, replace
   `REPLACE_WITH_VAULT_REFERENCE_ID` with that GUID.

4. Re-zip `appPackage/` and re-upload to Teams or the M365 admin center.

## Replacing this server with your real CRM

Implement the same three endpoints over your CRM's database/API and keep the
JSON shape identical to `crm-openapi.yaml`. The agents only know about the
contract in that YAML — they do not care what's behind it.
