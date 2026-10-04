/* ============================================================
   Saved data in this browser: registry, scenarios, export/import
   ============================================================
   Everything the site saves lives in this browser's localStorage under
   the keys in STORAGE_KEYS. Nothing here talks to a network: export is a
   file the browser downloads, import is a file the person picks, and both
   happen on the device.

   - STORAGE_KEYS is the single list of what the site may store. The
     privacy page's table and /my-data/ render from it, and
     test/profileStore.test.ts fails if any `nyc_*` key used in src/ is
     missing from it.
   - Scenarios are named snapshots of every saved key, so a person can keep
     "Brooklyn condo, 20% down" and "Queens co-op" side by side and switch.
   - Import only ever writes keys from STORAGE_KEYS, as strings that parse
     as JSON; anything else in the file is skipped and reported.

   Pure apart from the Storage-like object passed in, so the tests run it
   against an in-memory store.
   ============================================================ */

export interface KeyInfo {
  key: string;
  label: string;
  /** The page that writes it, for "Open" links. */
  href: string;
  purpose: string;
  /** Holds income, debts or balances. Shown as such on /my-data/ and privacy. */
  personal: boolean;
}

export const STORAGE_KEYS: KeyInfo[] = [
  { key: 'nyc_shared_profile', label: 'Shared profile', href: '/coop/', purpose: 'Income, other debts, and account balances shared across every tool so you don\'t re-enter them', personal: true },
  { key: 'nyc_shared_assumptions_rent', label: 'Rent assumptions', href: '/rent/', purpose: 'Rent calculator assumptions (income multiplier, insurance, reserve buffer)', personal: false },
  { key: 'nyc_shared_assumptions_coop', label: 'Co-op assumptions', href: '/coop/', purpose: 'Co-op assumptions (mortgage rate, down payment %, maintenance, DTI limit, reserve months)', personal: false },
  { key: 'nyc_shared_assumptions_condo', label: 'Condo assumptions', href: '/condo/', purpose: 'Condo assumptions (mortgage rate, down payment %, common charges, taxes, DTI limit)', personal: false },
  { key: 'nyc_coop_inputs', label: 'Co-op calculator', href: '/coop/', purpose: 'Full set of co-op calculator inputs', personal: true },
  { key: 'nyc_condo_inputs', label: 'Condo calculator', href: '/condo/', purpose: 'Full set of condo calculator inputs', personal: true },
  { key: 'nyc_rent_inputs', label: 'Rent calculator', href: '/rent/', purpose: 'Full set of rent calculator inputs', personal: true },
  { key: 'nyc_affordable_inputs', label: 'Affordable Housing Finder', href: '/affordable/', purpose: 'Household size, income, and unit-size inputs for AMI eligibility', personal: true },
  { key: 'nyc_reality_check_inputs', label: 'Housing Reality Check', href: '/reality-check/', purpose: 'Liquid savings and household size for the Reality Check, kept apart from the shared profile so its one-number simplification never overwrites a fuller account breakdown', personal: true },
  { key: 'nyc_required_salary_inputs', label: 'Required Salary', href: '/required-salary/', purpose: 'Monthly expenses, savings goal, filing status, and benefit elections', personal: true },
  { key: 'nyc_afford_more_inputs', label: 'How Do I Afford More?', href: '/afford-more/', purpose: 'Income, debts, cash and investments, and the target price', personal: true },
  { key: 'nyc_savings_planner_inputs', label: 'Savings planner', href: '/savings-planner/', purpose: 'Target price, current savings, monthly contribution, and income', personal: true },
  { key: 'nyc_rent_vs_buy_inputs', label: 'Rent vs buy', href: '/rent-vs-buy/', purpose: 'Price, rent, and the growth and return assumptions', personal: false },
  { key: 'nyc_rate_sensitivity_inputs', label: 'Rate sensitivity', href: '/rate-sensitivity/', purpose: 'Income, debts, cash, and the rate and charges being tested', personal: true },
  { key: 'nyc_cost_to_move_inputs', label: 'Cost to move', href: '/cost-to-move/', purpose: 'Rent or price, moving costs, and overlap days', personal: false },
];

export const SCENARIOS_KEY = 'nyc_scenarios';
export const SCENARIOS_INFO: KeyInfo = {
  key: SCENARIOS_KEY, label: 'Saved scenarios', href: '/my-data/',
  purpose: 'Named snapshots of the keys above, saved from Your Saved Data', personal: true,
};
export const MAX_SCENARIOS = 20;
export const MAX_NAME = 60;
export const MAX_IMPORT_BYTES = 512 * 1024;
export const EXPORT_FORMAT = 'nyc-affordability-saved-data';

const KNOWN = new Set(STORAGE_KEYS.map((k) => k.key));

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type Snapshot = Record<string, string>;

export interface Scenario {
  id: string;
  name: string;
  savedAt: string;
  data: Snapshot;
}

const isJson = (s: unknown): s is string => {
  if (typeof s !== 'string') return false;
  try { JSON.parse(s); return true; } catch { return false; }
};

/** Every known key currently saved in this browser. */
export function snapshot(storage: StorageLike): Snapshot {
  const out: Snapshot = {};
  for (const { key } of STORAGE_KEYS) {
    const v = storage.getItem(key);
    if (v !== null && isJson(v)) out[key] = v;
  }
  return out;
}

export function savedKeys(storage: StorageLike): KeyInfo[] {
  const s = snapshot(storage);
  return STORAGE_KEYS.filter((k) => k.key in s);
}

// ---- Scenarios ----

export function listScenarios(storage: StorageLike): Scenario[] {
  const raw = storage.getItem(SCENARIOS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { scenarios?: unknown };
    return cleanScenarios(parsed.scenarios);
  } catch {
    return [];
  }
}

function cleanScenarios(list: unknown): Scenario[] {
  if (!Array.isArray(list)) return [];
  const out: Scenario[] = [];
  for (const s of list) {
    if (!s || typeof s !== 'object') continue;
    const { id, name, savedAt, data } = s as Record<string, unknown>;
    if (typeof name !== 'string' || !name.trim() || !data || typeof data !== 'object') continue;
    const clean: Snapshot = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) if (KNOWN.has(k) && isJson(v)) clean[k] = v;
    out.push({
      id: typeof id === 'string' && id ? id : newId(out.length),
      name: name.trim().slice(0, MAX_NAME),
      savedAt: typeof savedAt === 'string' ? savedAt : '',
      data: clean,
    });
  }
  return out.slice(0, MAX_SCENARIOS);
}

function writeScenarios(storage: StorageLike, list: Scenario[]) {
  if (list.length) storage.setItem(SCENARIOS_KEY, JSON.stringify({ version: 1, scenarios: list }));
  else storage.removeItem(SCENARIOS_KEY);
}

let counter = 0;
function newId(salt = 0): string {
  counter += 1;
  return `s${Date.now().toString(36)}${(counter + salt).toString(36)}`;
}

export type SaveResult = { ok: true; scenario: Scenario; replaced: boolean } | { ok: false; reason: 'empty-name' | 'nothing-saved' | 'limit' };

/** Save everything currently stored as a named scenario. Same name (any case) replaces. */
export function saveScenario(storage: StorageLike, name: string, now = new Date()): SaveResult {
  const clean = name.trim().slice(0, MAX_NAME);
  if (!clean) return { ok: false, reason: 'empty-name' };
  const data = snapshot(storage);
  if (!Object.keys(data).length) return { ok: false, reason: 'nothing-saved' };
  const list = listScenarios(storage);
  const i = list.findIndex((s) => s.name.toLowerCase() === clean.toLowerCase());
  if (i < 0 && list.length >= MAX_SCENARIOS) return { ok: false, reason: 'limit' };
  const scenario: Scenario = { id: i >= 0 ? list[i].id : newId(), name: clean, savedAt: now.toISOString(), data };
  if (i >= 0) list[i] = scenario; else list.push(scenario);
  writeScenarios(storage, list);
  return { ok: true, scenario, replaced: i >= 0 };
}

/** Replace everything currently saved with a scenario's snapshot. */
export function loadScenario(storage: StorageLike, id: string): boolean {
  const s = listScenarios(storage).find((x) => x.id === id);
  if (!s) return false;
  clearCurrent(storage);
  for (const [k, v] of Object.entries(s.data)) storage.setItem(k, v);
  return true;
}

export function renameScenario(storage: StorageLike, id: string, name: string): boolean {
  const clean = name.trim().slice(0, MAX_NAME);
  const list = listScenarios(storage);
  const s = list.find((x) => x.id === id);
  if (!s || !clean || list.some((x) => x.id !== id && x.name.toLowerCase() === clean.toLowerCase())) return false;
  s.name = clean;
  writeScenarios(storage, list);
  return true;
}

export function deleteScenario(storage: StorageLike, id: string): boolean {
  const list = listScenarios(storage);
  const next = list.filter((s) => s.id !== id);
  if (next.length === list.length) return false;
  writeScenarios(storage, next);
  return true;
}

// ---- Reset ----

/** Remove every saved calculator key (scenarios stay). */
export function clearCurrent(storage: StorageLike) {
  for (const { key } of STORAGE_KEYS) storage.removeItem(key);
}

/** Remove everything this site stores, scenarios included. */
export function resetAll(storage: StorageLike) {
  clearCurrent(storage);
  storage.removeItem(SCENARIOS_KEY);
}

// ---- Export / import ----

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: 2;
  exported: string;
  current: Snapshot;
  scenarios: Scenario[];
}

export function exportData(storage: StorageLike, now = new Date()): ExportFile {
  return { format: EXPORT_FORMAT, version: 2, exported: now.toISOString(), current: snapshot(storage), scenarios: listScenarios(storage) };
}

export interface ParsedImport {
  kind: 'export' | 'legacy-coop';
  current: Snapshot;
  scenarios: Scenario[];
  /** Keys in the file that aren't ours, or whose value wasn't valid JSON. */
  skipped: string[];
}

export type ImportResult = { ok: true; data: ParsedImport } | { ok: false; error: string };

function cleanSnapshot(obj: unknown, skipped: string[], stringify = false): Snapshot {
  const out: Snapshot = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const value = stringify && v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
    if (KNOWN.has(k) && isJson(value)) out[k] = value;
    else skipped.push(k);
  }
  return out;
}

/**
 * Parse an imported file: this site's export, or the "Download my saved data"
 * file from the retired co-op domain (its values are objects, not strings).
 */
export function parseImport(text: string): ImportResult {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, error: 'That file is too large to be a saved-data export.' };
  let obj: Record<string, unknown>;
  try { obj = JSON.parse(text); } catch { return { ok: false, error: 'That file isn\'t valid JSON.' }; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: 'That file isn\'t a saved-data export.' };
  const skipped: string[] = [];
  if (obj.format === EXPORT_FORMAT) {
    const current = cleanSnapshot(obj.current, skipped);
    const scenarios = cleanScenarios(obj.scenarios);
    if (!Object.keys(current).length && !scenarios.length) return { ok: false, error: 'That export doesn\'t contain any saved data.' };
    return { ok: true, data: { kind: 'export', current, scenarios, skipped } };
  }
  if ('nyc_coop_inputs' in obj || 'nyc_shared_profile' in obj) {
    const legacy = { nyc_coop_inputs: obj.nyc_coop_inputs, nyc_shared_profile: obj.nyc_shared_profile };
    const current = cleanSnapshot(legacy, skipped, true);
    for (const k of Object.keys(obj)) if (!['nyc_coop_inputs', 'nyc_shared_profile', 'exported', 'from'].includes(k)) skipped.push(k);
    if (!Object.keys(current).length) return { ok: false, error: 'That file doesn\'t contain any saved data.' };
    return { ok: true, data: { kind: 'legacy-coop', current, scenarios: [], skipped } };
  }
  return { ok: false, error: 'That file isn\'t a saved-data export from this site.' };
}

/**
 * Apply a parsed import. 'replace' clears what's saved first; 'merge' only
 * overwrites the keys the file has. Imported scenarios are added; a name
 * that's already taken gets " (imported)", then " (imported 2)", and so on. Never exceeds MAX_SCENARIOS.
 */
export function applyImport(storage: StorageLike, data: ParsedImport, mode: 'replace' | 'merge'): { keys: number; scenarios: number } {
  if (mode === 'replace') clearCurrent(storage);
  for (const [k, v] of Object.entries(data.current)) storage.setItem(k, v);
  const list = listScenarios(storage);
  let added = 0;
  for (const s of data.scenarios) {
    if (list.length >= MAX_SCENARIOS) break;
    const taken = (n: string) => list.some((x) => x.name.toLowerCase() === n.toLowerCase());
    let name = s.name;
    for (let n = 1; taken(name); n++) {
      const suffix = n === 1 ? ' (imported)' : ` (imported ${n})`;
      name = `${s.name.slice(0, MAX_NAME - suffix.length)}${suffix}`;
    }
    list.push({ ...s, id: newId(list.length), name });
    added++;
  }
  if (added) writeScenarios(storage, list);
  return { keys: Object.keys(data.current).length, scenarios: added };
}
