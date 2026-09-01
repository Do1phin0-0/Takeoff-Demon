// Drywall/framing material takeoff for a straight interior partition run.
// Quantities only — no unit costs, no labor, no margin. Deliberately kept
// separate from anything that produces a price: see CLAUDE.md Section 6.5/6.6.
//
// Stated assumptions (change these before trusting the output on a real job):
// - Studs at 16" o.c., one top track + one bottom track run
// - Standard 4'x8' (32 sq ft) drywall sheets, applied to BOTH sides of the run
// - Waste factors: 10% framing, 15% drywall, 5% coatings (typical estimator allowance)
// - Screws/mud ratios (1 box per 10 sheets, 1 gal mud per 4 sheets) are rule-of-thumb,
//   not measured
// - Primer/paint coverage assumed at 350 sq ft/gallon; primer 1 coat, paint 2 coats
// - Does NOT net out door/window openings — the app has no opening-tracking yet,
//   so this overstates material on any wall with openings

const WASTE_FACTORS = {
  framing: 1.1,
  drywall: 1.15,
  coatings: 1.05,
};

const STUD_SPACING_FEET = 16 / 12;
const SHEET_COVERAGE_SQFT = 4 * 8;
const PAINT_COVERAGE_SQFT_PER_GAL = 350;

function computeWallTakeoff(linearFeet, wallHeightFeet = 10) {
  const singleSideAreaSqFt = linearFeet * wallHeightFeet;
  const totalSurfaceAreaSqFt = singleSideAreaSqFt * 2;

  const trackingChannelFeet = linearFeet * 2;
  const studCount = Math.ceil(linearFeet / STUD_SPACING_FEET) + 1;
  const studLinearFeet = studCount * wallHeightFeet;
  const grossFramingFeet = (trackingChannelFeet + studLinearFeet) * WASTE_FACTORS.framing;

  const rawSheets = totalSurfaceAreaSqFt / SHEET_COVERAGE_SQFT;
  const drywallSheets = Math.ceil(rawSheets * WASTE_FACTORS.drywall);
  const screwBoxes = Math.ceil(drywallSheets / 10);
  const mudGallons = Math.ceil(drywallSheets / 4);

  const primerGallons = Math.ceil((totalSurfaceAreaSqFt / PAINT_COVERAGE_SQFT_PER_GAL) * WASTE_FACTORS.coatings);
  const paintGallons = Math.ceil(((totalSurfaceAreaSqFt * 2) / PAINT_COVERAGE_SQFT_PER_GAL) * WASTE_FACTORS.coatings);

  return {
    metrics: {
      linearFeet: round1(linearFeet),
      wallHeightFeet,
      totalSurfaceAreaSqFt: round1(totalSurfaceAreaSqFt),
    },
    billOfMaterials: {
      studCount,
      trackingChannelFeet: round1(trackingChannelFeet),
      grossFramingFeet: round1(grossFramingFeet),
      drywallSheets,
      screwBoxes,
      mudGallons,
      primerGallons,
      paintGallons,
    },
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

module.exports = { computeWallTakeoff };
