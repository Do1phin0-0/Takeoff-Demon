const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const TEMPLATE_PATH = path.join(__dirname, "..", "templates", "AMS_Master_Subcontract_Template.docx");

// Anthropic tool schema for the subcontract-drafting agent. The agent calls this
// once it has walked the user through every field in prompts/subcontract-agent.md.
const FINALIZE_SUBCONTRACT_TOOL = {
  name: "finalize_subcontract",
  description:
    "Generate the final AMS subcontract document once every field has been collected and confirmed with the user.",
  input_schema: {
    type: "object",
    properties: {
      subcontractor: {
        type: "object",
        properties: {
          companyName: { type: "string" },
          address: { type: "string", description: "Street, City, State, ZIP" },
          contactName: { type: "string" },
          phone: { type: "string" },
          email: { type: "string" },
        },
        required: ["companyName", "address", "contactName", "phone", "email"],
      },
      project: {
        type: "object",
        properties: {
          number: { type: "string" },
          name: { type: "string" },
          address: { type: "string" },
          cityState: { type: "string", description: "City, State for the scope narrative sentence" },
          pmName: { type: "string" },
          pmPhone: { type: "string" },
          pmEmail: { type: "string" },
        },
        required: ["number", "name", "address", "cityState", "pmName", "pmPhone", "pmEmail"],
      },
      subcontractDate: { type: "string" },
      retentionRatePercent: { type: "number", description: "Defaults to 10 unless the user overrides it" },
      plansAttached: { type: "boolean" },
      specsAttached: { type: "boolean" },
      specDate: { type: "string" },
      scopeName: { type: "string", description: "e.g. Plumbing — fills the scope narrative sentence" },
      scopeItems: {
        type: "array",
        description: "One entry per cost code covered by this subcontract",
        items: {
          type: "object",
          properties: {
            packageName: { type: "string", description: "e.g. Plumbing Package" },
            costCode: { type: "string", description: "e.g. 15100" },
            codeDescription: { type: "string", description: "e.g. Plumbing" },
            amount: { type: "string", description: "e.g. $45,000.00" },
          },
          required: ["packageName", "costCode", "codeDescription", "amount"],
        },
        minItems: 1,
      },
      scopeInclusions: {
        type: "string",
        description: "The 'includes but not limited to' list as a single narrative string",
      },
      subcontractTotal: { type: "string", description: "e.g. $45,000.00" },
      notes: { type: "string" },
    },
    required: [
      "subcontractor",
      "project",
      "subcontractDate",
      "plansAttached",
      "specsAttached",
      "specDate",
      "scopeName",
      "scopeItems",
      "scopeInclusions",
      "subcontractTotal",
    ],
  },
};

function join(items, key) {
  return items.map((i) => i[key]).join(", ");
}

// Maps literal bracket tokens in the docx text to their replacement values.
// The template's placeholders are simple, self-contained [TOKEN] text runs
// (verified against the source .docx), so plain string substitution is safe
// and avoids pulling in a full templating engine for one document.
function buildTokenMap(fields) {
  return {
    "[PROJECT#]": fields.project.number,
    "[PROJECT #]": fields.project.number,
    "[COST CODE]": join(fields.scopeItems, "costCode"),
    "[DATE]": fields.subcontractDate,
    "[SUBCONTRACTOR COMPANY NAME]": fields.subcontractor.companyName,
    "[STREET, CITY, STATE, ZIP]": fields.subcontractor.address,
    "[NAME]": fields.subcontractor.contactName,
    "[PHONE]": fields.subcontractor.phone,
    "[EMAIL]": fields.subcontractor.email,
    "[PROJECT NAME]": fields.project.name,
    "[PROJECT ADDRESS]": fields.project.address,
    "[PM NAME]": fields.project.pmName,
    "[PM PHONE]": fields.project.pmPhone,
    "[PM EMAIL]": fields.project.pmEmail,
    "[SCOPE PACKAGE NAME — e.g. Plumbing Package]": join(fields.scopeItems, "packageName"),
    "[XXXXX.000]": fields.scopeItems.map((i) => `${i.costCode}.000`).join(", "),
    "[e.g. Plumbing]": join(fields.scopeItems, "codeDescription"),
    "[$ AMOUNT]": join(fields.scopeItems, "amount"),
    "[SCOPE]": fields.scopeName,
    "[CITY, STATE]": fields.project.cityState,
    "[SPEC DATE]": fields.specDate,
    "[LIST ALL INCLUDED SCOPE ITEMS — permits, materials, install, testing, inspections, daily clean-up, coordination with AMS superintendent and other trades, etc.]":
      fields.scopeInclusions,
    "[$ TOTAL]": fields.subcontractTotal,
  };
}

function escapeXml(value) {
  return String(value ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

async function generateSubcontractDocx(fields) {
  const templateBuffer = fs.readFileSync(TEMPLATE_PATH);
  const zip = await JSZip.loadAsync(templateBuffer);
  let xml = await zip.file("word/document.xml").async("string");

  for (const [token, value] of Object.entries(buildTokenMap(fields))) {
    xml = xml.split(token).join(escapeXml(value));
  }

  xml = xml.replace(/(Plans Attached[^☐☒]*)☐/, fields.plansAttached ? "$1☒" : "$1☐");
  xml = xml.replace(/(Specifications Attached[^☐☒]*)☐/, fields.specsAttached ? "$1☒" : "$1☐");

  const retentionRate = fields.retentionRatePercent ?? 10;
  xml = xml.replace("10.00 %", `${retentionRate.toFixed(2)} %`);

  zip.file("word/document.xml", xml);
  return zip.generateAsync({ type: "nodebuffer" });
}

module.exports = { generateSubcontractDocx, FINALIZE_SUBCONTRACT_TOOL };
