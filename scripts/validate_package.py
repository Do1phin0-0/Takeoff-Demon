"""
Pre-flight validation for the Copilot Agent Maker upload zip.

Catches the issues that cause the most common upload failures: bad GUIDs,
missing icons, schema-version drift, oversized fields, dangling file
references, and placeholder values that should have been replaced.

Run via build.sh or directly: `python3 scripts/validate_package.py`.
"""
from __future__ import annotations

import json
import re
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PKG = ROOT / "appPackage"

GUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+$")
EMPTY_GUID = "00000000-0000-0000-0000-000000000000"

errors: list[str] = []
warnings: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


def png_dimensions(path: Path) -> tuple[int, int] | None:
    data = path.read_bytes()
    if not data.startswith(b"\x89PNG\r\n\x1a\n") or data[12:16] != b"IHDR":
        return None
    w, h = struct.unpack(">II", data[16:24])
    return w, h


def check_manifest() -> dict:
    path = PKG / "manifest.json"
    m = json.loads(path.read_text())

    if not GUID_RE.match(m.get("id", "")):
        err(f"manifest.id must be a GUID, got {m.get('id')!r}")
    if not SEMVER_RE.match(m.get("version", "")):
        err(f"manifest.version must be semver (x.y.z), got {m.get('version')!r}")
    if len(m.get("name", {}).get("short", "")) > 30:
        err("manifest.name.short exceeds 30 chars")
    if len(m.get("description", {}).get("short", "")) > 80:
        err("manifest.description.short exceeds 80 chars")
    if len(m.get("description", {}).get("full", "")) > 4000:
        err("manifest.description.full exceeds 4000 chars")
    if not re.match(r"^#[0-9A-Fa-f]{6}$", m.get("accentColor", "")):
        err(f"manifest.accentColor must be #RRGGBB, got {m.get('accentColor')!r}")

    icons = m.get("icons", {})
    color = PKG / icons.get("color", "")
    outline = PKG / icons.get("outline", "")
    if not color.is_file():
        err(f"icons.color file missing: {color}")
    else:
        dims = png_dimensions(color)
        if dims != (192, 192):
            err(f"icons.color must be 192x192 PNG, got {dims}")
    if not outline.is_file():
        err(f"icons.outline file missing: {outline}")
    else:
        dims = png_dimensions(outline)
        if dims != (32, 32):
            err(f"icons.outline must be 32x32 PNG, got {dims}")

    return m


def check_declarative_agent(rel_path: str, agent_id: str) -> None:
    path = PKG / rel_path
    if not path.is_file():
        err(f"declarativeAgent file missing: {rel_path}")
        return
    a = json.loads(path.read_text())

    if not a.get("$schema", "").startswith("https://developer.microsoft.com/json-schemas/copilot/declarative-agent/"):
        err(f"{rel_path}: $schema is not a declarative-agent schema URL")
    if a.get("version") not in {"v1.0", "v1.1", "v1.2", "v1.3", "v1.4"}:
        warn(f"{rel_path}: unexpected version {a.get('version')!r}")
    if not 1 <= len(a.get("name", "")) <= 100:
        err(f"{rel_path}: name must be 1-100 chars")
    if not 1 <= len(a.get("description", "")) <= 1000:
        err(f"{rel_path}: description must be 1-1000 chars")

    instr = a.get("instructions", "")
    m = re.fullmatch(r"\$\[file\('(?P<f>[^']+)'\)\]", instr)
    if m:
        instr_path = PKG / m.group("f")
        if not instr_path.is_file():
            err(f"{rel_path}: instructions file ref not found: {m.group('f')}")
        elif len(instr_path.read_text()) > 8000:
            err(f"{rel_path}: instructions file exceeds 8000 chars (Copilot limit)")
    elif len(instr) > 8000:
        err(f"{rel_path}: inline instructions exceed 8000 chars")

    starters = a.get("conversation_starters", [])
    if len(starters) > 6:
        err(f"{rel_path}: max 6 conversation_starters, got {len(starters)}")
    for s in starters:
        if len(s.get("title", "")) > 50:
            err(f"{rel_path}: starter title >50 chars: {s.get('title')!r}")
        if len(s.get("text", "")) > 1000:
            err(f"{rel_path}: starter text >1000 chars")

    for action in a.get("actions", []):
        f = PKG / action.get("file", "")
        if not f.is_file():
            err(f"{rel_path}: action file ref not found: {action.get('file')}")


def check_plugin() -> None:
    path = PKG / "plugins" / "crm-plugin.json"
    if not path.is_file():
        err("plugin manifest missing: plugins/crm-plugin.json")
        return
    p = json.loads(path.read_text())

    ns = p.get("namespace", "")
    if not re.fullmatch(r"[a-z0-9]{1,16}", ns):
        err(f"plugin.namespace must be lowercase alphanumeric, max 16 chars, got {ns!r}")
    if len(p.get("name_for_human", "")) > 20:
        err("plugin.name_for_human >20 chars")
    if len(p.get("description_for_human", "")) > 100:
        err("plugin.description_for_human >100 chars")

    fns = p.get("functions", [])
    if len(fns) > 10:
        err(f"plugin: max 10 functions, got {len(fns)}")
    for fn in fns:
        if not re.fullmatch(r"[a-zA-Z0-9_]+", fn.get("name", "")):
            err(f"plugin function name invalid: {fn.get('name')!r}")
        if len(fn.get("description", "")) > 8000:
            err(f"plugin function {fn.get('name')!r} description >8000 chars")

    for r in p.get("runtimes", []):
        auth = r.get("auth", {})
        if auth.get("type") == "ApiKeyPluginVault":
            ref = auth.get("reference_id", "")
            if not GUID_RE.match(ref):
                err(f"plugin auth.reference_id must be a GUID, got {ref!r}")
            elif ref == EMPTY_GUID:
                warn("plugin auth.reference_id is the empty GUID placeholder — "
                     "register your API key in Teams Developer Portal and replace it before uploading")
        spec = r.get("spec", {}).get("url", "")
        if spec and not (PKG / spec).is_file():
            err(f"plugin spec.url not found in package: {spec}")


def check_openapi() -> None:
    path = PKG / "plugins" / "crm-openapi.yaml"
    if not path.is_file():
        err("openapi spec missing: plugins/crm-openapi.yaml")
        return
    text = path.read_text()
    if "YOUR-CRM-HOST.example.com" in text:
        warn("openapi spec still has the placeholder server URL — replace before uploading")
    if "openapi: 3.0" not in text:
        err("openapi spec must declare OpenAPI 3.0.x (3.1 is not supported by M365 plugins)")


def main() -> int:
    m = check_manifest()
    for entry in m.get("copilotAgents", {}).get("declarativeAgents", []):
        check_declarative_agent(entry["file"], entry["id"])
    check_plugin()
    check_openapi()

    if warnings:
        print("WARNINGS:")
        for w in warnings:
            print(f"  - {w}")
    if errors:
        print("ERRORS:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print(f"OK — package is valid ({len(warnings)} warnings).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
