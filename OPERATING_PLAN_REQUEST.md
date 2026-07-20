# Operating Plan Request — For Use With Claude Agent Sessions

Use this prompt to request a structured operating plan from any Claude agent session working on Takeoff-Demon. This ensures consistent, shippable output and prevents scope creep disguised as planning.

---

## PROMPT TEXT (copy/paste this)

I'm building a construction takeoff automation system. I have two operating guides:

1. **AMS_Brain_Master_Prompt.md** — my standing rules for how to think and talk about this project
2. **CLAUDE.md** — the current state of the repository and what's built vs. aspirational

I need you to produce an **Operating Plan** for the next slice of work. Here's what it must include:

### Section 1: Objective
What specific problem does this slice solve? State it in one sentence a GC would understand.

### Section 2: Current State
- What exists in the repo right now that we build on top of?
- What proof does it have (tested against real plans, or theoretical)?
- What is explicitly NOT built yet that this slice needs?

### Section 3: Target Behavior
- What does the user see/do?
- What does the system produce?
- Show one concrete example (e.g., "user uploads a 23-sheet PDF, system shows a page picker, user selects 3 rooms, system runs takeoffs for each")

### Section 4: Inputs, Outputs, Logic
- **Inputs:** What data/files/user actions trigger this?
- **Outputs:** What file(s) or UI result does the user get?
- **Logic:** The actual workflow — don't skip steps, show every decision point

### Section 5: Visual Proof
- How does a human verify the output is correct?
- What markup, image, or evidence gets generated?
- Can an estimator check it in five seconds?

### Section 6: Edge Cases
- What breaks this? (corrupted PDFs, missing scale, ambiguous boundaries, etc.)
- How does the system handle each? (fail gracefully, ask user, flag uncertainty)

### Section 7: Code Strategy
- **Folders & files** to create or modify
- **New modules** needed (name, responsibility, inputs/outputs)
- **APIs** to build (endpoint, method, request/response)
- **Data model** changes (schema, persistence)
- **Dependencies** (new npm packages, Python, etc.)
- **Tests** needed (3–5 concrete test cases)

### Section 8: Review Flow
- How does a human (me) verify this is done right?
- What repo change proves it works?
- What should I test against?

### Section 9: What Ships First
- The smallest real, checkable result — not the whole feature
- What gets built this week, what waits
- What success looks like (one user action → one verifiable output)

### Section 10: What's Premature
- What ideas should wait until V2?
- What dependencies aren't ready yet?
- What can't be proven without more correction data?

---

## CONTEXT FOR THE AGENT

Before producing the plan, load these files from the repo:
- `CLAUDE.md` (especially Sections 6, 8, 9)
- `AMS_Brain_Master_Prompt.md` (for operating voice and principles)

Then ground your plan in:
- What's actually built (not aspirational)
- One provable next step
- Honest assessment of what's blocking

Do not produce:
- Vision statements, phase diagrams, or long-term architecture (that already exists in the repo)
- Documents that describe planning instead of planning something shippable
- Scope growth without tied evidence (no "we should also add X because the future")

---

## HOW TO USE THIS

1. **Copy the prompt text above** (Section: PROMPT TEXT)
2. **Open your Claude agent session** (Project, chat, or workspace)
3. **Paste the prompt**
4. **Wait for the output** — it should be 3,000–4,000 words, structured, and immediately actionable
5. **Bring the output back here** — I'll review it, challenge it if needed, and we build from it

---

## WHAT SUCCESS LOOKS LIKE

You'll get back a plan where:
- Every section can be handed to a developer and turned into code
- You can point to specific files and say "this is what we're building"
- The first shippable slice is < 2 weeks of work
- Visual proof is explicit (not "the system knows it's right")
- What waits is named, not hidden
