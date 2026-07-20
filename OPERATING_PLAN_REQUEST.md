# Operating Plan Request — For Use With Claude Agent Sessions

Use this prompt to request a structured operating plan from any Claude agent session working on Takeoff-Demon. This ensures consistent, shippable output and prevents scope creep disguised as planning.

---

## PROMPT TEXT (copy/paste this)

I'm building a construction takeoff automation system. I have two operating guides:

1. **AMS_Brain_Master_Prompt.md** — my standing rules for how to think and talk about this project
2. **CLAUDE.md** — the current state of the repository and what's built vs. aspirational

I need you to produce an **Operating Plan** for the next slice of work. Here's what it must include:

### Section 0: Constitutional Alignment
**Before any feature is specified.**

- What AMS Brain doctrine does this support? (Stewardship / Continuity / Decision Journaling / Institutional Intelligence / Multiplication / Professional Credibility / Ownership)
- **Value Statement:** Why should this feature exist? What company capability does it improve? What business problem does it solve? What knowledge does it preserve? What decision does it improve?
- **What Happens If We Do Not Build This?** (Give a concrete negative outcome)

Example: *Without batch takeoff automation, estimators spend 3 hours manually tracing every room. Knowledge of which areas were measured how gets lost. Future estimates on similar projects restart from zero.*

### Section 1: Objective
What specific problem does this slice solve? State it in one sentence a GC would understand.

**Add: Business Impact** — What measurable company outcome improves?
- Examples: Increase estimate accuracy by X%, reduce procurement delays, improve PM onboarding, reduce subcontractor risk

### Section 2: Current State
- What exists in the repo right now that we build on top of?
- What proof does it have (tested against real plans, or theoretical)?
- What is explicitly NOT built yet that this slice needs?

**Add: Historical Evidence**
- What problem from AMS history caused this feature to exist?
- Which projects exposed the need?

**Add: Example** — Show one real or realistic scenario where the current state fails

### Section 3: Target Behavior
- What does the user see/do?
- What does the system produce?
- Show one concrete example (e.g., "user uploads a 23-sheet PDF, system shows a page picker, user selects 3 rooms, system runs takeoffs for each")

**Add: Success Scenario** — What does success look like 1 year later? How would you describe this feature as successful?

### Section 4: Inputs, Outputs, Logic
- **Inputs:** What data/files/user actions trigger this?
- **Outputs:** What file(s) or UI result does the user get?
- **Logic:** The actual workflow — don't skip steps, show every decision point

**Add: Confidence Logic**
- How does the system determine confidence?
- What lowers confidence?
- What raises confidence?

**AMS Brain Rule:** Every meaningful output must include: Confidence | Evidence | Risk | Recommendation

### Section 5: Visual Proof
**Keep exactly as stated — this is non-negotiable.**

How does a human verify the output is correct?
- What markup, image, or evidence gets generated?
- Can an estimator check it in five seconds?

*Construction AI lives or dies here.*

### Section 6: Edge Cases
**Keep existing questions. Add: Human Override**
- What breaks this? (corrupted PDFs, missing scale, ambiguous boundaries, etc.)
- How does the system handle each? (fail gracefully, ask user, flag uncertainty)
- **What happens if Aaron disagrees?** (Because we already decided: Corrections / Decisions / Overrides must create learning.)

### Section 7: Code Strategy
**Add: Memory Impact**
- What memory does this create? (Project Memory / Vendor Memory / Decision Memory / Experience Memory?)
- **Learning Impact:** How does this improve itself?

*This prevents dead-end features.*

- **Folders & files** to create or modify
- **New modules** needed (name, responsibility, inputs/outputs)
- **APIs** to build (endpoint, method, request/response)
- **Data model** changes (schema, persistence)
- **Dependencies** (new npm packages, Python, etc.)
- **Tests** needed (3–5 concrete test cases)

### Section 8: Review Flow
**Add: Constitutional Verification**
- Does it support AMS Brain principles?
- Does it reduce risk?
- Does it improve capability?
- Does it preserve knowledge?

**Standard Review:** How does a human (me) verify this is done right? What repo change proves it works? What should I test against?

### Section 9: What Ships First
**Add: Minimum Proof**
- What is the smallest possible demonstration that proves this concept works?

This is HUGE. 

Example:
- Instead of: Build entire takeoff system
- Build: Detect one wall. Measure one wall. Verify one wall.

### Section 10: What's Premature
**Keep existing questions. Add: Future Seeds**
- What ideas were intentionally postponed?
- What future systems might emerge from this?
- What AMS Brain Seeds should reference this?

### Section 11: Knowledge Capture (NEW)
This is an AMS Brain addition.

- What new knowledge is created?
- What lessons are preserved?
- What institutional intelligence is added?
- What tribal knowledge should be captured?

### Section 12: Wisdom Impact (NEW)
**Questions:**
- Does this create Knowledge? Experience? Wisdom? Judgment?

**Remember our hierarchy:**
- Information
- ↓
- Knowledge
- ↓
- Experience
- ↓
- Wisdom
- ↓
- Judgment
- ↓
- Decision
- ↓
- Outcome
- ↓
- Lesson
- ↓
- Institutional Intelligence

### Section 13: Ownership Test (NEW)
**This may be the most AMS-Brain-specific section.**

**Question:**
- If Aaron owned this feature for 10 years, would he still be proud of it?

**Sub-questions:**
- Does it preserve company knowledge?
- Does it improve employees?
- Does it reduce future mistakes?
- Does it create lasting value?

---

## FINAL SECTION: AMS Brain Impact Summary

Every feature ends with:

- **Feature Name**
- **Capability Added**
- **Knowledge Added**
- **Memory Added**
- **Experience Added**
- **Wisdom Added**
- **Judgment Impact**
- **Business Impact**
- **Constitutional Alignment**
- **Roadmap Priority**
- **Recommended Next Slice**

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
4. **Wait for the output** — it should be 4,000–5,000 words, structured, and immediately actionable
5. **Bring the output back here** — I'll review it, challenge it if needed, and we build from it

---

## WHAT SUCCESS LOOKS LIKE

You'll get back a plan where:
- Every section can be handed to a developer and turned into code
- You can point to specific files and say "this is what we're building"
- The first shippable slice is < 2 weeks of work
- Visual proof is explicit (not "the system knows it's right")
- What waits is named, not hidden
- Constitutional alignment is clear (why this feature protects AMS Brain's core doctrine)
- The Ownership Test passes — you'd still be proud of it in 10 years
