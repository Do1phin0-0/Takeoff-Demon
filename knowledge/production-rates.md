# Production Rates for Should-Cost

Industry-average labor-hours per unit. Used by `/should-cost` and `/compare-sub` to build a defensible labor benchmark. **These are averages — tune to your local market once you have data from past jobs.** Override the loaded labor rate with `/override-laborrate`.

**Default loaded labor rate: $65/hr** (includes burden — taxes, insurance, basic overhead).

Format: `LH = labor-hours per crew member`. Productivity assumes a competent crew on a clean, accessible site.

---

## Sitework
- Excavation (machine + 1 laborer): 50–80 cy/hr machine
- Hand grading / fine grade: 200–300 sf/LH
- Backfill and compaction: 30–50 cy/hr crew of 2

## Concrete / Foundation
- Layout and forms (slab edge): 30–50 lf/LH
- Rebar placement: 100–150 lb/LH
- Concrete placement (pump or wheelbarrow): 8–12 cy/hr crew of 4
- Concrete finish (slab): 100–150 sf/LH
- Strip forms: 50–80 lf/LH

## Framing
- Wall framing: 12–18 LH per 100 sf of floor (single story, simple)
- Wall framing: 18–24 LH per 100 sf (2-story or complex)
- Floor framing (joists): 8–12 LH per 100 sf
- Roof framing (cut and stack): 14–20 LH per 100 sf of roof
- Roof framing (truss set, crane): 4–6 LH per 100 sf
- Sheathing (wall or roof): 4–6 sheets/LH
- Subfloor (T&G plywood): 5–7 sheets/LH
- House wrap: 200–300 sf/LH

## Roofing
- Asphalt shingle install: 1–1.5 LH per square (architectural)
- 3-tab shingles: 0.75–1 LH per square
- Metal standing seam: 3–5 LH per square
- Underlayment: 0.3 LH per square
- Ice & water shield: 0.5 LH per square
- Drip edge: 50–80 lf/LH
- Ridge vent: 30–50 lf/LH
- Tear-off (existing): 1.5–2.5 LH per square

## Exterior / Siding
- Vinyl siding: 80–120 sf/LH
- Hardie board: 60–80 sf/LH (heavier, more cuts)
- Brick veneer: 30–50 sf/LH (mason crew)
- Window install (vinyl, new construction): 1–1.5 LH each
- Exterior door install: 1.5–2.5 LH each
- Sliding door install: 2.5–3.5 LH each
- Garage door install: 4–6 LH each

## Insulation
- Batt insulation (2x4 wall): 100–150 sf/LH
- Batt insulation (2x6 wall): 80–120 sf/LH
- Blown attic: 200–300 sf/LH (with blower, crew of 2)
- Spray foam open cell: 80–120 sf/LH (crew of 2)
- Spray foam closed cell: 60–100 sf/LH (crew of 2)

## Drywall
- Hang drywall: 4–6 sheets/LH (8 ft ceilings)
- Hang drywall: 3–5 sheets/LH (high ceilings)
- Tape and mud (level 4): 50–80 sf/LH
- Sand: 100–150 sf/LH
- Texture spray (knockdown): 200–300 sf/LH
- Prime coat: 100–150 sf/LH

## Painting
- Roll interior wall (per coat): 100–150 sf/LH
- Cut-in (per coat): 50–80 lf/LH
- Trim and doors: 8–12 doors/LH (per coat)
- Exterior siding (per coat): 80–120 sf/LH
- Spray application: 200–400 sf/LH (varies widely)

## Plumbing
- DWV rough per fixture: 1.5–2.5 LH (residential)
- Supply rough per fixture: 1–1.5 LH
- Fixture set per fixture: 1–2 LH (toilet, sink, faucet)
- Tub/shower set: 2–4 LH
- Water heater install: 3–5 LH
- Hose bib install: 0.5–1 LH each
- Gas line per fixture: 1–2 LH

## Electrical
- Rough wire per device: 0.5–1 LH (outlet, switch)
- Rough wire per circuit: 6–10 LH (avg 30 lf run, panel termination)
- Panel install (200A): 8–12 LH
- Service entrance: 6–10 LH
- Device trim per device: 0.25–0.5 LH
- Fixture install (basic): 0.5–1 LH each
- Recessed can install: 0.75–1.25 LH each

## HVAC
- Equipment set (split system): 8–12 LH per ton
- Duct rough (residential): 16–24 LH per ton
- Refrigerant line set + commissioning: 4–8 LH per system
- Register/grille install: 0.25–0.5 LH each
- Thermostat install: 1–1.5 LH
- Bath fan install (new): 1.5–2.5 LH each
- Range hood install: 2–3 LH

## Cabinets / Millwork
- Cabinet install (basic): 1–1.5 LH per lf
- Cabinet install (custom, scribe-fit): 2–3 LH per lf
- Countertop install (laminate): 1 LH per lf
- Countertop install (stone, by fabricator): own crew
- Vanity install: 1.5–2.5 LH each

## Tile
- Tile floor (12x12 or larger): 25–35 sf/LH
- Tile floor (small format / mosaic): 12–20 sf/LH
- Tile wall (subway, simple): 20–30 sf/LH
- Shower pan with curb: 6–10 LH each
- Niche: 2–4 LH each
- Waterproofing (Schluter/RedGard): 50–80 sf/LH

## Flooring
- LVP click-lock: 80–120 sf/LH
- Hardwood (nail-down): 50–80 sf/LH
- Carpet install: 100–150 sf/LH (with stretcher)
- Floor leveling (self-leveling): 80–120 sf/LH

## Trim & Doors
- Baseboard install: 30–40 lf/LH
- Crown molding: 15–20 lf/LH (single piece) / 8–12 lf/LH (built-up)
- Door casing: 0.75–1 LH per opening (one side)
- Interior door hang (pre-hung): 0.75–1.5 LH each
- Interior door hardware: 0.25–0.5 LH each

---

## How to Use in /should-cost

1. Take quantity from takeoff.
2. Multiply by labor-hours-per-unit from this list (use the middle of the range).
3. Multiply by loaded labor rate ($65/hr default).
4. Add material cost (from price-list.md).
5. Compare to sub bid in `/compare-sub`.

**Example — drywall hang for 80 sheets:**
- 80 sheets ÷ 5 sheets/LH = 16 LH
- 16 LH × $65/hr = $1,040 labor
- Materials (80 × $15.50) = $1,240
- Should-cost subtotal: $2,280
