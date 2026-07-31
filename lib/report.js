// Reads the corrections and reviews logs across all takeoffs and produces
// aggregate numbers. This is a report, not a learning system — see
// CLAUDE.md Section 6.4 (no imaginary intelligence) and Section 13
// (corrections log is the only honest V1 memory). It does not change how
// any takeoff is scored or computed; it only makes the existing logs
// readable in aggregate instead of write-only.

function buildCorrectionsReport(takeoffs, corrections, reviews) {
  const takeoffById = new Map(takeoffs.map((t) => [t.id, t]));

  const correctedIds = new Set(corrections.map((c) => c.takeoffId));
  const approvedIds = new Set(
    reviews.filter((r) => r.action === "approved").map((r) => r.takeoffId)
  );
  const reviewedIds = new Set([...correctedIds, ...approvedIds]);

  const byQuantityType = {};
  let deltaSum = 0;
  let percentDeltaSum = 0;
  let percentDeltaCount = 0;

  for (const c of corrections) {
    const type = c.quantityType || "unknown";
    if (!byQuantityType[type]) {
      byQuantityType[type] = { count: 0, avgAbsoluteDelta: 0, avgPercentDelta: null };
    }
    const bucket = byQuantityType[type];
    const delta = Math.abs(c.correctedValue - c.originalValue);
    bucket.count += 1;
    bucket._deltaSum = (bucket._deltaSum || 0) + delta;
    deltaSum += delta;

    if (c.originalValue) {
      const percentDelta = (delta / Math.abs(c.originalValue)) * 100;
      bucket._percentDeltaSum = (bucket._percentDeltaSum || 0) + percentDelta;
      bucket._percentDeltaCount = (bucket._percentDeltaCount || 0) + 1;
      percentDeltaSum += percentDelta;
      percentDeltaCount += 1;
    }
  }

  for (const bucket of Object.values(byQuantityType)) {
    bucket.avgAbsoluteDelta = round2(bucket._deltaSum / bucket.count);
    bucket.avgPercentDelta = bucket._percentDeltaCount
      ? round2(bucket._percentDeltaSum / bucket._percentDeltaCount)
      : null;
    delete bucket._deltaSum;
    delete bucket._percentDeltaSum;
    delete bucket._percentDeltaCount;
  }

  const approvedThenCorrected = [];
  for (const takeoffId of approvedIds) {
    const approval = reviews
      .filter((r) => r.takeoffId === takeoffId && r.action === "approved")
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
    const laterCorrections = corrections
      .filter((c) => c.takeoffId === takeoffId && new Date(c.createdAt) > new Date(approval.createdAt))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    if (laterCorrections.length === 0) continue;
    const takeoff = takeoffById.get(takeoffId);
    for (const correction of laterCorrections) {
      approvedThenCorrected.push({
        takeoffId,
        fileName: takeoff ? takeoff.fileName : null,
        pageNumber: takeoff ? takeoff.pageNumber : null,
        approvedAt: approval.createdAt,
        approvedBy: approval.who,
        correctedAt: correction.createdAt,
        originalValue: correction.originalValue,
        correctedValue: correction.correctedValue,
        note: correction.note,
      });
    }
  }

  const recentCorrections = corrections
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10)
    .map((c) => ({
      ...c,
      fileName: takeoffById.get(c.takeoffId) ? takeoffById.get(c.takeoffId).fileName : null,
      pageNumber: takeoffById.get(c.takeoffId) ? takeoffById.get(c.takeoffId).pageNumber : null,
    }));

  return {
    totals: {
      takeoffs: takeoffs.length,
      corrections: corrections.length,
      approvals: reviews.filter((r) => r.action === "approved").length,
      takeoffsCorrected: correctedIds.size,
      takeoffsApproved: approvedIds.size,
      takeoffsReviewed: reviewedIds.size,
      takeoffsUnreviewed: takeoffs.length - reviewedIds.size,
    },
    rates: {
      correctionRate: rate(correctedIds.size, takeoffs.length),
      approvalRate: rate(approvedIds.size, takeoffs.length),
      reviewRate: rate(reviewedIds.size, takeoffs.length),
    },
    deltas: {
      avgAbsoluteDelta: corrections.length ? round2(deltaSum / corrections.length) : null,
      avgPercentDelta: percentDeltaCount ? round2(percentDeltaSum / percentDeltaCount) : null,
    },
    byQuantityType,
    approvedThenCorrected,
    recentCorrections,
  };
}

function rate(count, total) {
  return total ? round2((count / total) * 100) : 0;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { buildCorrectionsReport };
