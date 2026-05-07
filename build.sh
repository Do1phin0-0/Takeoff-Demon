#!/usr/bin/env bash
# Builds the Copilot Agent Maker upload zip from appPackage/.
# Output: dist/subcontractor-finder.zip
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p dist
OUT="$PWD/dist/subcontractor-finder.zip"

echo "Validating package..."
python3 scripts/validate_package.py

echo "Zipping appPackage/ -> $OUT"
rm -f "$OUT"
( cd appPackage && zip -qr "$OUT" \
    manifest.json \
    declarativeAgent.json \
    instructions.txt \
    color.png \
    outline.png \
    agents \
    plugins )

echo "Done."
printf 'Upload %s in:\n' "$OUT"
printf '  - Microsoft 365 Copilot \xe2\x86\x92 Agent Builder \xe2\x86\x92 Import\n'
printf '  - or Teams \xe2\x86\x92 Apps \xe2\x86\x92 Manage your apps \xe2\x86\x92 Upload an app\n'
