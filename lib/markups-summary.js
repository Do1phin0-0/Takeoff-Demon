// Markups List summary — aggregates existing takeoff records by tool/category/
// CSI division. Reads two stores that already exist (takeoffs, tools registry);
// writes nothing and computes nothing new about geometry (Section 6.4 — this
// is a read-only rollup, not a scoring or learning system).
//
// Every takeoff saved before the registry existed (and any saved without
// selecting a tool, since the takeoff UI does not yet offer that choice) has
// no toolId. Those group under "Unclassified" rather than being dropped or
// guessed at — an honest gap beats a silent one.

function buildMarkupsSummary(takeoffs, registry) {
  const groups = new Map();

  function getGroup(key, label, csiDivision, csiDivisionName) {
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label,
        csiDivision: csiDivision || null,
        csiDivisionName: csiDivisionName || null,
        count: 0,
        totals: {},
      });
    }
    return groups.get(key);
  }

  for (const t of takeoffs) {
    const tool = t.toolId ? registry.getTool(t.toolId) : null;
    const group = tool
      ? getGroup(tool.id, tool.name, tool.csiDivision, tool.csiDivisionName)
      : getGroup("unclassified", "Unclassified");

    group.count += 1;
    // Prefer the tool's declared unit (e.g. "LF") over the takeoff's stored
    // unit, which is the geometry engine's generic "ft"/"sq ft" — the tool's
    // unit is what a markups-list column header should read.
    const unit = (tool && tool.unit) || t.unit || "unit";
    group.totals[unit] = Math.round(((group.totals[unit] || 0) + (Number(t.value) || 0)) * 100) / 100;
  }

  const byDivision = new Map();
  for (const g of groups.values()) {
    const divKey = g.csiDivision || "unclassified";
    if (!byDivision.has(divKey)) {
      byDivision.set(divKey, {
        csiDivision: g.csiDivision,
        csiDivisionName: g.csiDivisionName || "Unclassified",
        groups: [],
      });
    }
    byDivision.get(divKey).groups.push(g);
  }

  return {
    generatedAt: new Date().toISOString(),
    divisions: Array.from(byDivision.values()).sort((a, b) =>
      (a.csiDivision || "zz").localeCompare(b.csiDivision || "zz")
    ),
  };
}

module.exports = { buildMarkupsSummary };
