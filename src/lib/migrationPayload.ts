/* ============================================================
   Legacy-domain migration: what may travel in the URL
   ============================================================
   Visitors to the retired nyc-co-op-affordability.com are moved to
   www.nyc-affordability.com/coop/. Browsers keep localStorage per origin,
   so the old page hands the co-op calculator's saved settings over in a
   `#migrate-local-storage=` URL fragment.

   A URL is the wrong place for personal finances: it lands in the address
   bar and browser history, and any script on the page can read it. So only
   an ALLOWLIST of calculator settings may travel. Income, debts, account
   balances, the shared profile, and any key not listed here are dropped,
   both where the link is built (functions/[[path]].js, which keeps its own
   copy of this list; test/migrationPayload.test.ts checks they match) and
   where it's read (src/scripts/coop.ts), so an old link can't smuggle them
   in either.
   ============================================================ */

/** Co-op calculator settings that are safe in a URL: rates, terms, fees, limits. */
export const SAFE_COOP_INPUT_KEYS = [
  'mtgRate', 'loanTerm', 'dpPct', 'reserveMo', 'maxDti', 'monthlyMaint',
  'fcAtty', 'fcBankAtty', 'fcCoop', 'fcMoveIn', 'fcOther', 'varPct',
] as const;

export const COOP_INPUTS_KEY = 'nyc_coop_inputs';

/** Keep only allowlisted, numeric settings from a stored `nyc_coop_inputs` value. */
export function safeCoopInputs(stored: unknown): Record<string, number> | null {
  let obj: unknown = stored;
  if (typeof stored === 'string') {
    try { obj = JSON.parse(stored); } catch { return null; }
  }
  const inputs = (obj as { inputs?: Record<string, unknown> } | null)?.inputs;
  if (!inputs || typeof inputs !== 'object') return null;
  const out: Record<string, number> = {};
  for (const k of SAFE_COOP_INPUT_KEYS) {
    const v = inputs[k];
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    if (Number.isFinite(n)) out[k] = n;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Sanitize a decoded migration payload ({ storageKey: storedString }).
 * Returns the only entry allowed through: the co-op settings, re-serialized
 * as `{ inputs: {...} }` with no accounts, income or debts.
 */
export function sanitizeMigrationPayload(payload: unknown): Record<string, string> {
  if (!payload || typeof payload !== 'object') return {};
  const safe = safeCoopInputs((payload as Record<string, unknown>)[COOP_INPUTS_KEY]);
  return safe ? { [COOP_INPUTS_KEY]: JSON.stringify({ inputs: safe }) } : {};
}
