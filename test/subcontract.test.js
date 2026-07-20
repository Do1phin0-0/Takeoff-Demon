const { test } = require("node:test");
const assert = require("node:assert/strict");
const JSZip = require("jszip");
const { generateSubcontractDocx } = require("../lib/subcontract");

const fields = {
  subcontractor: {
    companyName: "Lone Star Plumbing LLC",
    address: "400 Main St, Houston, TX 77002",
    contactName: "Dana Reyes",
    phone: "713-555-0199",
    email: "dana@lonestarplumbing.com",
  },
  project: {
    number: "2",
    name: "Westside Retail Center",
    address: "900 Westheimer Rd, Houston, TX 77006",
    cityState: "Houston, TX",
    pmName: "Marcus Webb",
    pmPhone: "281-555-0100",
    pmEmail: "mwebb@ams-tx.com",
  },
  subcontractDate: "2026-07-15",
  retentionRatePercent: 10,
  plansAttached: true,
  specsAttached: false,
  specDate: "2026-06-01",
  scopeName: "Plumbing",
  scopeItems: [
    { packageName: "Plumbing Package", costCode: "15100", codeDescription: "Plumbing", amount: "$145,000.00" },
  ],
  scopeInclusions: "Permits, materials, install, testing/inspections, daily clean-up.",
  subcontractTotal: "$145,000.00",
};

test("generateSubcontractDocx fills every placeholder with no leftovers", async () => {
  const buffer = await generateSubcontractDocx(fields);
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml").async("string");

  assert.equal(xml.match(/\[[A-Z][^[\]]*\]/g), null, "no bracket placeholders should remain");
  assert.match(xml, /Lone Star Plumbing LLC/);
  assert.match(xml, /2-SC-15100/);
  assert.match(xml, /Westside Retail Center/);
});

test("generateSubcontractDocx sets checkboxes independently", async () => {
  const buffer = await generateSubcontractDocx(fields);
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml").async("string");

  assert.equal(xml.match(/Plans Attached[^☐☒]*([☐☒])/)[1], "☒");
  assert.equal(xml.match(/Specifications Attached[^☐☒]*([☐☒])/)[1], "☐");
});
