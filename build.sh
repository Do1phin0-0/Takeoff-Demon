#!/usr/bin/env bash
# Builds the Copilot Agent Maker upload zip from appPackage/.
#
# Usage:
#   ./build.sh           # full build with CRM plugin (requires you to host the API)
#   ./build.sh lite      # strips the CRM plugin so the agents work with no backend
#                        # (web search + Excel only). Best for first-time upload.
#
# Output: dist/subcontractor-finder.zip
set -euo pipefail

cd "$(dirname "$0")"
MODE="${1:-full}"
mkdir -p dist
OUT="$PWD/dist/subcontractor-finder.zip"
STAGE="$PWD/dist/_stage"

echo "Validating package..."
python3 scripts/validate_package.py

echo "Staging in $MODE mode..."
rm -rf "$STAGE"
cp -r appPackage "$STAGE"

if [ "$MODE" = "lite" ]; then
  python3 scripts/strip_plugin.py "$STAGE"
fi

echo "Zipping -> $OUT"
rm -f "$OUT"
( cd "$STAGE" && zip -qr "$OUT" . )
rm -rf "$STAGE"

echo "Done."
printf 'Upload %s in:\n' "$OUT"
printf '  - Microsoft 365 Copilot \xe2\x86\x92 Agent Builder \xe2\x86\x92 Import\n'
printf '  - or Teams \xe2\x86\x92 Apps \xe2\x86\x92 Manage your apps \xe2\x86\x92 Upload an app\n'
