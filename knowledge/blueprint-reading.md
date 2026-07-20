# Blueprint Reading Guide

Per-trade guide for which sheets matter and what to look for. Used in `/teach [trade]` and `/read [trade]`.

Sheet prefixes:
- **G-** General (cover, code summary, ADA, life safety)
- **C-** Civil (site, paving, grading, drainage, utilities)
- **L-** Landscape
- **A-** Architectural (plans, elevations, sections, details)
- **S-** Structural
- **M-** Mechanical (HVAC)
- **E-** Electrical
- **P-** Plumbing
- **FP-** Fire Protection (sprinklers)
- **FA-** Fire Alarm
- **T-** Telecom / low-voltage

**Specifications book (separate from drawings):** for commercial work, the spec book often controls over the drawings on materials, finishes, and quality. CSI MasterFormat divisions. Always check Division 01 (general requirements), and the relevant trade division (e.g., 05 for steel, 09 for finishes).

---

## Framing
- **A-floor plans:** dimension strings, wall thicknesses (2x4 vs 2x6), opening locations and sizes.
- **A-elevations:** plate heights, ceiling heights, gable heights, header conditions.
- **S-sheets:** beam sizes, post locations, header schedule, hold-down locations.
- **Schedules:** window/door schedule for header sizing and rough openings.
- **Watch for:** load-bearing walls (S-sheets), point loads, cantilevers, vaulted ceilings, raised heels.

## Concrete / Foundation
- **A-foundation plan:** footprint, footing locations, slab edges, thickened sections.
- **S-foundation:** footing size, rebar schedule, anchor bolt spacing, hold-down locations, slab thickness, vapor barrier callout.
- **Section details:** footing depth (frost line), slab edge, perimeter insulation, waterproofing.
- **Watch for:** stepped footings on slope, garage slab depression, post-tension callouts, special inspections required.

## Plumbing
- **A-floor plans:** fixture locations.
- **P-sheets if available:** riser diagrams, supply lines, DWV layout, vent stacks.
- **Fixture schedule:** model, finish, valve trim.
- **Section details:** water heater location, gas meter, hose bib locations.
- **Watch for:** vent through roof penetrations, sleeves through foundation, hose bib qty + frost-proof spec, water heater pan and drain location, gas line route.

## Electrical
- **E-sheets:** panel schedule, lighting plan, switch legs, device locations.
- **A-floor plans:** device locations on architectural sheets if no E-sheets.
- **Lighting schedule:** fixture types, lamp specs, manufacturer.
- **Code notes:** AFCI/GFCI requirements, smoke/CO locations.
- **Watch for:** dedicated circuits (kitchen, laundry, bath fan), exterior receptacles, low-voltage rough, structured wiring panel location, service entrance location, meter type.

## HVAC
- **M-sheets:** equipment schedule, duct layout, register/grille locations, refrigerant line routing.
- **Load calc summary (Manual J):** tonnage, CFM per room.
- **Section details:** equipment location (attic, mechanical room, exterior pad), refrigerant line route.
- **Watch for:** return air paths, fresh-air intake, condensate routing, attic access for service, refrigerant line set length, equipment pad detail.

## Roofing
- **A-roof plan:** pitch, ridges, valleys, hips, penetrations, overhangs.
- **A-elevations:** pitch confirmation, gable vs hip count, dormer count.
- **Section details:** edge condition, overhang depth, ice & water extent, ridge vent type.
- **Watch for:** cricket behind chimneys, kickout flashing at roof-wall intersections, valley count, parapet conditions, pitch transitions.

## Drywall
- **A-floor plans:** wall type tags (drywall thickness, fire rating).
- **A-reflected ceiling plans:** ceiling height changes, soffits, tray ceilings, coffers.
- **Wall types schedule:** layers, type X, MR, sound assemblies.
- **Watch for:** garage common wall (Type X required), wet area walls (MR), bulkheads/soffits, level 5 finish call-outs.

## Siding / Exterior
- **A-elevations:** siding type by elevation, trim layout, watertable, corner trim.
- **A-details:** window head, jamb, sill flashing details. Wall section.
- **Watch for:** mixed siding zones, accent panels, soffit material, fascia detail, water management details (housewrap, flashing, drip cap).

## Cabinets / Millwork
- **A-floor plans:** cabinet layout, dimensions, appliance locations.
- **A-interior elevations:** cabinet heights, crown, light rail, end panels.
- **Schedules:** cabinet schedule (style, finish, hardware), countertop schedule.
- **Watch for:** appliance panels, filler strips, scribe to wall, ceiling height conflicts with crown, end conditions.

## Tile / Wet Areas
- **A-bath/kitchen interior elevations:** tile layout, accent bands, niche locations.
- **A-details:** shower pan, curb, niche framing, bench detail.
- **Watch for:** waterproofing membrane callouts, substrate, slope to drain (1/4" per foot), accent tile premium, expansion joints.

## Flooring
- **A-floor plans:** flooring type by room (legend or schedule).
- **A-details:** transition details at material changes, threshold details.
- **Watch for:** subfloor type and condition, slope (wet rooms), height differences requiring transition strips, baseboard interaction.

---

# COMMERCIAL TRADES

---

## Structural Steel
- **G-sheets:** code summary (often shows steel design loads, code edition, occupancy).
- **S-cover sheet:** general structural notes, design loads, applicable specs (AISC 360, AISC 341 for seismic).
- **S-foundation:** anchor bolt locations, sizes, embedment, base plate sizes, hold-down details.
- **S-framing plans:** member sizes (W-sections, HSS columns, beams), bay sizing, lateral system.
- **S-elevations / sections:** steel elevations, brace frame configurations, kicker details.
- **S-schedules:** column schedule, beam schedule, base plate schedule, anchor bolt schedule.
- **S-details:** typical connections, moment connections, brace connections, beam-to-column, base plate, embed plates.
- **A-sheets cross-reference:** check for AESS callouts on architectural elevations and sections — drives premium pricing.
- **Specifications Division 05 12 00:** structural steel — fabrication tolerances, AESS category, paint/galvanizing.
- **Watch for:** AESS Category callouts (Cat 1-4), high-strength bolt grade (A325 vs A490), slip-critical bolting, weld testing requirements (UT/MT/PT), galvanizing, special inspections, third-party inspection requirements, kicker connections to existing deck (S2.02 / S2.03 type details).

## Cold-Formed Metal Framing (CFMF)
- **A-floor plans:** wall types and tags.
- **A-wall types schedule:** stud size, gauge, spacing, sheathing, finish layers.
- **S-sheets:** load-bearing CFMF if present, structural CFMF design (often delegated to manufacturer).
- **A-details:** head-of-wall, base track, deflection track, jamb framing at openings.
- **Specifications Division 05 40 00 / 09 22 16:** CFMF spec — gauge schedule, structural vs non-structural.
- **Watch for:** stud designation format (e.g., 600S162-54 = 6" stud x 1-5/8" flange x 54mil = 16ga), heavy gauge studs at jambs/openings, deflection track at top of wall (slip track), structural CFMF where loads transfer (jambs at storefront, headers, joists).

## Commercial Cladding (Nichiha / ACM / EIFS / Stucco / Adhered Stone)
- **A-elevations:** primary cladding type per area, color/finish callouts, dimensions to control coursing.
- **A-wall sections:** layering — substrate, WRB, drainage cavity, cladding.
- **A-details:** outside corner, inside corner, window head/jamb/sill, base of wall (water table), top of wall (coping), transitions between materials, expansion/control joints.
- **A-finish schedule:** material finish, texture, color, manufacturer model number.
- **Specifications Divisions 07 42 / 09 24 / 04 20:** cladding system spec.
- **Watch for:** mock-up requirement, pre-installation conference, panel layout drawings (often required submittal), color sample approval, transition flashings between dissimilar cladding, drip cap above openings, sealant joints (separate from perimeter sealant), water table cap, panel coursing dimensions, fastener spec.

## Aluminum Storefront / Curtainwall
- **A-elevations:** storefront extent, mullion locations, door locations.
- **A-floor plans:** storefront line, door swings.
- **A-window/door schedule:** storefront tag, system, glazing type (1" IGU, tempered, low-E).
- **A-details:** head, jamb, sill conditions; transitions to adjacent materials; threshold detail.
- **A-hardware schedule:** door hardware (closer, panic, lockset, ADA hardware).
- **Specifications Division 08 41 00:** aluminum storefront / 08 44 00 curtainwall.
- **Watch for:** thermal break requirement, IGU edge spacer (warm edge), tempered glass at hazardous locations (within 24" of door, low panels), spandrel panels, sunshade/shading device, ADA threshold height (1/2" max), perimeter blocking (CFMF or wood), perimeter sealant, panic hardware on egress doors, automatic operator electrical rough-in.

## Commercial Roofing (TPO / EPDM / Mod-Bit)
- **A-roof plan:** roof outline, slopes (typically 1/4" per ft min), drains, scuppers, RTU locations, parapet heights, expansion joints.
- **A-wall sections / details:** parapet detail, edge metal, coping, scupper detail, roof drain detail, RTU curb detail.
- **S-sheets:** roof structure, slopes, expansion joints in structure (transferred to roofing).
- **M-sheets:** RTU locations, weights (loads on structure), curb sizes.
- **Specifications Division 07 54 00:** TPO / EPDM / mod-bit spec.
- **Watch for:** membrane mil thickness, attachment method (mech attached / fully adhered / ballasted), tapered insulation R-value and slope direction, cover board, NDL warranty, walkway pads at servicing routes, RTU curb sizes (verify with HVAC), pipe penetration count, expansion joint locations, snow guards (climate), fall protection anchors (OSHA).

## Fire Protection (Sprinklers)
- **FP-sheets:** sprinkler system layout, hazard classifications, sprinkler head types and spacing.
- **A-reflected ceiling plans:** sprinkler head locations relative to ceiling features.
- **S-sheets:** structural support for sprinkler piping.
- **Specifications Division 21:** fire protection.
- **Watch for:** hazard class (Light / Ordinary 1 / Ordinary 2 / Extra Hazard), system type (wet / dry / pre-action), fire pump requirement (water supply pressure), FDC (fire department connection) location, riser room, backflow at service entrance, freeze protection in unheated spaces, hydraulic calculations (delegated design), submittal review by fire marshal.

## Fire Alarm
- **FA-sheets:** device locations, panel location, riser diagram, addressable vs conventional.
- **A-floor plans:** device locations on architectural sheets.
- **Specifications Division 28 31:** fire alarm.
- **Watch for:** duct smoke detectors at all HVAC units >2,000 cfm, smoke detectors in elevator lobbies and machine rooms, ADA visual notification (strobes), audible coverage analysis, manual pull stations at every exit, monitoring service tied in, annual fire inspections coordination.

## Commercial Electrical
- **E-cover:** code summary, panel summary, fault current, arc-flash analysis.
- **E-site:** site lighting, transformer location, service entrance.
- **E-floor plans:** lighting plan, power plan, systems plan.
- **E-panel schedules:** circuit-by-circuit breakdown, loads.
- **E-one-line diagram:** service entrance through distribution.
- **E-details:** typical mounting heights, equipment connections.
- **Specifications Division 26:** electrical.
- **Watch for:** service entrance utility coordination (transformer pad, primary conduits), CT cabinet, surge protective device, arc-flash labels, generator/ATS scope, emergency power requirements, EPO buttons, 277V vs 120V circuiting, RTU disconnects (NEC required at each unit), site lighting circuits and photocell, exterior receptacles with WP-IN-USE covers.

## Commercial Plumbing
- **P-floor plans:** fixture locations, supply lines, DWV, gas.
- **P-riser diagrams:** vent/waste/supply schematics.
- **P-isometrics:** waste piping (often required submittal).
- **P-fixture schedule:** fixture types, model numbers, finish, valve trim, ADA compliance.
- **P-details:** typical connections, water heater, mop sink, hose bibs, RPZ assembly.
- **Specifications Division 22:** plumbing.
- **Watch for:** RPZ backflow preventer at water service (annual testing), grease interceptor sizing (food service), trap primers at floor drains (commercial code), indirect waste from kitchen equipment, condensate drains tied to plumbing (verify), recirculation pump for hot water, expansion tank, water hammer arrestors, mop sink in janitor closet.

## Commercial HVAC
- **M-cover:** equipment schedule, ventilation summary.
- **M-floor plans:** duct layout, equipment locations, registers, returns.
- **M-roof plans:** RTU locations, refrigerant piping, condensate piping.
- **M-schedules:** equipment schedule (RTU, AHU, VAV, mini-split), grille schedule.
- **M-details:** typical curb detail, refrigerant connection, condensate trap, drain.
- **Specifications Division 23:** HVAC.
- **Watch for:** outside air per ASHRAE 62.1 (occupancy-based), economizer per climate, fresh-air intake distance from exhaust, smoke detectors in ductwork (>2,000 cfm), fire/smoke dampers at rated walls, condensate float switch, RTU service catwalk, equipment screening, sound attenuation, refrigerant line set length (multi-zone systems).

---

# CIVIL / SITEWORK SHEETS

---

## Civil Sheets (C- prefix)
- **C-cover:** general notes, code references (city / county / TxDOT), sheet index.
- **C-existing conditions / demolition:** existing utilities, structures to demo, tree removal, salvage notes.
- **C-site plan / dimensional control:** building footprint, parking layout, drives, ADA spaces, site features.
- **C-grading plan:** spot elevations, contours, cut/fill summary, finish floor elevation.
- **C-paving plan:** pavement section types (truck-rated vs car), striping, curb and gutter, ADA features.
- **C-utility plan:** storm sewer, sanitary sewer, water, gas — sizes, slopes, materials, manholes/inlets.
- **C-storm details:** pipe profiles (plan + profile views), manhole/inlet schedules, hydraulic calcs summary.
- **C-detention pond:** plan view, sections, outlet structure detail, embankment detail.
- **C-erosion control / SWPPP:** silt fence, construction entrance, inlet protection, hydromulch limits.
- **C-details:** standard details (city or TxDOT), typical pavement section, curb and gutter detail, ADA ramp detail, manhole detail.
- **C-traffic control / MOT:** if work in or near ROW.
- **Specifications Divisions 31, 32, 33:** earthwork, exterior improvements, utilities.
- **Watch for:** pavement section thickness and reinforcement (truck-rated 6"+ with rebar), lime/cement stabilization depth, aggregate base course thickness, storm pipe class (Class III RCP standard), pipe slopes (typically 0.5% min for storm), manhole depths (driver of cost), inlet types (curb / drop / area / grate), trench shoring depth limits (5 ft OSHA), TxDOT permit for ROW work (TR permit), connection to existing utilities (taps, fees), HS-20 traffic-rated grates and frames.

## Pavement Section Detail (read carefully)
A typical commercial pavement section detail shows top to bottom:
1. Top course (concrete or asphalt) — thickness, reinforcement, strength
2. Tack coat / bond breaker (asphalt only)
3. Base course (asphalt) or directly to base for concrete — thickness, gradation
4. Stabilized subgrade — type (lime / cement) — depth and percentage
5. Compacted natural subgrade — compaction spec (typically 95% standard Proctor)

Always verify all five layers in the takeoff. Skipping the lime stabilization layer is one of the most expensive misses.

## Storm Sewer Plan & Profile
- **Plan view:** pipe alignment, manhole/inlet locations, sizes labeled at each segment.
- **Profile view:** existing ground line, proposed pipe slope, pipe size, manhole/inlet rim and invert elevations.
- Read the profile to confirm:
  - Pipe size matches the plan
  - Slope is constant or correctly transitioning
  - Cover is sufficient (typically 3 ft min for vehicular loading)
  - Manhole depth = rim - invert (drives manhole cost)
  - Drops at manholes for changes in direction
  - Outfall elevation matches existing channel or detention pond design WS

## SWPPP Plan
- **C-erosion control sheet:** silt fence limits, construction entrance, inlet protection symbols.
- **Specifications Division 31 25 00:** erosion control.
- **Watch for:** stabilized construction entrance at every truck access (qty), silt fence on downhill perimeter only (typically), inlet protection at every storm structure, concrete washout area, hydromulch coverage area for final stabilization, fertilizer/seed mix specification.
