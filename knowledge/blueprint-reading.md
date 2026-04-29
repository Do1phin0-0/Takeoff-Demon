# Blueprint Reading Guide

Per-trade guide for which sheets matter and what to look for. Used in `/teach [trade]` and `/read [trade]`.

Sheet prefixes:
- **A-** Architectural (plans, elevations, sections, details)
- **S-** Structural
- **M-** Mechanical (HVAC)
- **E-** Electrical
- **P-** Plumbing

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
