#!/usr/bin/env python3
"""Fill the AMS master subcontract .docx template by literal placeholder substitution.

Usage: fill_template.py <values.json> <output.docx>

values.json is a flat {token: value} map, where each token is the bracketed
placeholder text as it appears in the template (e.g. "[PROJECT#]"), and each
value is the plain-text replacement. Two special boolean keys control the
Plans/Specifications checkboxes: "PLANS_ATTACHED" and "SPECS_ATTACHED".
"""
import json
import shutil
import sys
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

TEMPLATE = Path(__file__).parent / "AMS_Master_Subcontract_Template.docx"

# Longer/more specific tokens first so no token is a substring of another.
TOKEN_ORDER = [
    "[SCOPE PACKAGE NAME — e.g. Plumbing Package]",
    "[LIST ALL INCLUDED SCOPE ITEMS — permits, materials, install, testing, inspections, daily clean-up, coordination with AMS superintendent and other trades, etc.]",
    "[STREET, CITY, STATE, ZIP]",
    "[SUBCONTRACTOR COMPANY NAME]",
    "[CITY, STATE]",
    "[PROJECT ADDRESS]",
    "[PROJECT NAME]",
    "[PROJECT #]",
    "[PROJECT#]",
    "[COST CODE]",
    "[XXXXX.000]",
    "[e.g. Plumbing]",
    "[SPEC DATE]",
    "[$ AMOUNT]",
    "[$ TOTAL]",
    "[PM NAME]",
    "[PM PHONE]",
    "[PM EMAIL]",
    "[SCOPE]",
    "[DATE]",
    "[NAME]",
    "[PHONE]",
    "[EMAIL]",
]


def fill(values_path: str, output_path: str) -> None:
    values = json.loads(Path(values_path).read_text())

    with zipfile.ZipFile(TEMPLATE) as zin:
        document_xml = zin.read("word/document.xml").decode("utf-8")

    for token in TOKEN_ORDER:
        if token not in values:
            continue
        document_xml = document_xml.replace(token, escape(str(values[token])))

    if "PLANS_ATTACHED" in values or "SPECS_ATTACHED" in values:
        first, sep, rest = document_xml.partition("☐")
        if values.get("PLANS_ATTACHED"):
            first += "☑"
        else:
            first += "☐"
        second, sep2, rest2 = rest.partition("☐")
        if values.get("SPECS_ATTACHED"):
            second += "☑"
        else:
            second += "☐"
        document_xml = first + second + rest2

    shutil.copyfile(TEMPLATE, output_path)
    with zipfile.ZipFile(TEMPLATE) as zin:
        names = zin.namelist()
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zout, zipfile.ZipFile(TEMPLATE) as zin:
        for name in names:
            data = document_xml.encode("utf-8") if name == "word/document.xml" else zin.read(name)
            zout.writestr(name, data)

    remaining = [t for t in TOKEN_ORDER if t in document_xml]
    if remaining:
        print(f"WARNING: unfilled placeholders remain: {remaining}", file=sys.stderr)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    fill(sys.argv[1], sys.argv[2])
    print(f"Wrote {sys.argv[2]}")
