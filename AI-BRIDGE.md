# 🤝 COOPERATIVE AI DEVELOPMENT LEDGER

## 📌 MASTER ARCHITECTURAL ALIGNMENT
*   **Target Objective:** Build a real-world, high-accuracy structural estimating tool to translate linear blueprint traces into professional CSI Division 09 cost takeoffs.
*   **Core Architectural Mandate:** Strictly prevent fictional data generation or parallel asset duplication. No invented rates, placeholder values, or arbitrary markups are allowed.

## 🛠️ ENVIRONMENT & CONSTRAINTS REGISTRY
*   **Active Rules Policy:** Adhere strictly to local repository rules outlined in `CLAUDE.md` (specifically Section 6.5 "No unproven quantity as deliverable" and Section 6.6 "No false certainty").
*   **Authorized Pricing Authority:** Every cost calculation, material unit price, labor rate, or market adjustment factor MUST be explicitly queried and ingested from the local file: `knowledge/price-list.md`
*   **Functional Deliverable Scope:** Quantities Only, No Dollars (Unless explicitly mapping data directly from the verified `price-list.md` dataset).

## 📊 ACTIVE LIFECYCLE DEVELOPMENT LOG
*   [2026-08-20] **Claimed by Google session, NOT verified in this repo:** vector calculations (`getCardinalDirection`, `calculateCornerAngle`) said to be implemented in `public/lib/trace.js` with passing unit tests. As of this entry, `public/lib/trace.js` does not exist in this repository (checked working tree and full branch history) and neither function appears anywhere in the codebase. Do not treat this as built until the actual file is committed here and its tests run against this repo's suite.
*   [2026-08-20] Merged PR #10 into `main`: full-screen tracing toggle + a linear-footage (`linear_footage`) quantity type alongside the existing square-footage tool, sharing the same calibration/trace/markup/confidence pipeline. 66/66 tests passing. See `CLAUDE.md` Section 8 for the current authoritative build baseline.
*   [2026-08-20] Current Goal: Refactor estimation engines to output real-world physical quantities or dynamic, sourced prices tied directly to the authorized local pricing file.

## 🔁 WORKFLOW INTEGRATION PROCESS

This ledger is a **manually-relayed sync doc, not a live channel** — there is no automated link between Claude Code and Google's tools. You are the transport layer. Two rules keep it honest:

1.  **Before asking either tool for new functions or files**, paste the latest status/file paths from your local environment into that tool's chat window first, and update this file's Development Log with whatever that session actually did — not what it says it did. If a claimed feature isn't in the repo, log it as *claimed, not verified* (see the entry above) until it's actually committed and tested here.
2.  **When switching to Claude Code**, either run `cat AI-BRIDGE.md` yourself and paste the output in, or tell Claude directly: "Read the updated instructions in AI-BRIDGE.md before writing code." Do the same in reverse for Google — the ledger only works if both sides read it before acting, not after.

**Ground rule for both tools:** `CLAUDE.md` Section 8 ("Repo Reality") is the authoritative build-state baseline for this repository. If this ledger and `CLAUDE.md` Section 8 ever disagree about what's built, `CLAUDE.md` Section 8 wins — this file is a coordination log, not a second source of truth.
