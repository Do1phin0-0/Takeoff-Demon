"""
Strip the CRM plugin from a staged appPackage copy so the agents can be
uploaded with no backend (web search + Excel only).

Usage: python3 scripts/strip_plugin.py <staging_dir>
"""
import json
import shutil
import sys
from pathlib import Path

stage = Path(sys.argv[1])

# 1. Drop the plugins folder.
shutil.rmtree(stage / "plugins", ignore_errors=True)

# 2. Remove the `actions` block from every declarative agent JSON.
agents = [stage / "declarativeAgent.json"] + sorted((stage / "agents").glob("*.json"))
for p in agents:
    d = json.loads(p.read_text())
    d.pop("actions", None)
    p.write_text(json.dumps(d, indent=2) + "\n")

# 3. Tell each instructions file to skip the CRM-first step.
notice = (
    "# (Lite mode)\n"
    "This build has no CRM action wired in. Skip any CRM step in the "
    "instructions below; rely on WebSearch + CodeInterpreter only. The user "
    "cannot ask you to update bid status — tell them they need the full "
    "build with the CRM plugin to do that.\n\n"
)
for p in [stage / "instructions.txt", *sorted((stage / "agents").glob("*.instructions.txt"))]:
    p.write_text(notice + p.read_text())

print(f"stripped CRM plugin from {stage}")
