// Reflexion loop: re-run a generation against a deterministic critic until it
// passes or a hard attempt cap is hit. Dependency-injected and pure — the
// caller supplies the initial output, the critique function, and the reflect
// function (which is where any AI call lives), so the loop itself is
// deterministic to test and makes no network/fs calls.
//
// Unlike run-feedback.js (which spawns processes and must stay out of the
// deployed server), this module is safe to require from server.js: it holds
// no capabilities of its own beyond calling what it is handed.

// Hard cap, clamped here rather than trusted to callers: a runaway reflection
// loop is a runaway API bill, and no call site gets to raise it.
const HARD_MAX_REFLECTIONS = 2;

async function runWithReflexion({ initial, critique, reflect, maxReflections = HARD_MAX_REFLECTIONS, onEvent = () => {} }) {
  if (typeof critique !== "function" || typeof reflect !== "function") {
    throw new Error("runWithReflexion requires critique and reflect functions.");
  }
  const cap = Math.max(0, Math.min(Number(maxReflections) || 0, HARD_MAX_REFLECTIONS));

  const emit = (type, payload) => {
    try {
      onEvent(type, payload);
    } catch {
      // Event sinks (tracing) are best-effort by contract; never fail the loop.
    }
  };

  let output = initial;
  let issues = critique(output) || [];
  emit("critic_result", { attempt: 0, ok: issues.length === 0, issueCount: issues.length, issues });

  let attempts = 0;
  while (issues.length > 0 && attempts < cap) {
    attempts += 1;
    emit("reflexion_attempt", { attempt: attempts, issues });
    try {
      output = await reflect(output, issues, attempts);
    } catch (err) {
      emit("reflexion_error", { attempt: attempts, reason: err.message });
      return { ok: false, output, issues, attempts, repaired: false, exhausted: true, reflectError: err };
    }
    issues = critique(output) || [];
    emit("critic_result", { attempt: attempts, ok: issues.length === 0, issueCount: issues.length, issues });
  }

  const ok = issues.length === 0;
  emit(ok ? (attempts > 0 ? "reflexion_repaired" : "reflexion_clean") : "reflexion_exhausted", {
    attempts,
    issueCount: issues.length,
  });
  return { ok, output, issues, attempts, repaired: ok && attempts > 0, exhausted: !ok };
}

module.exports = { runWithReflexion, HARD_MAX_REFLECTIONS };
