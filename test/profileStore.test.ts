import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STORAGE_KEYS, SCENARIOS_KEY, MAX_SCENARIOS, MAX_IMPORT_BYTES, EXPORT_FORMAT,
  snapshot, savedKeys, listScenarios, saveScenario, loadScenario, renameScenario, deleteScenario,
  clearCurrent, resetAll, exportData, parseImport, applyImport, type StorageLike,
} from '../src/lib/profileStore.ts';

// Saved data on /my-data/: scenarios, export/import, reset. Runs against an
// in-memory store; the page script only wires these to window.localStorage.

class MemoryStorage implements StorageLike {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
}

const coopInputs = JSON.stringify({ mtgRate: '6.95', dpPct: '20' });
const profile = JSON.stringify({ annualIncome: 145000, monthlyDebts: 400 });

function seeded() {
  const s = new MemoryStorage();
  s.setItem('nyc_coop_inputs', coopInputs);
  s.setItem('nyc_shared_profile', profile);
  s.setItem('someone_elses_key', '"x"');
  s.setItem('nyc_rent_inputs', 'not json');
  return s;
}

test('every nyc_* key used in src/ is registered (so it shows on /my-data/ and the privacy page)', () => {
  const root = fileURLToPath(new URL('../src/', import.meta.url));
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|astro|js|mjs)$/.test(n) ? [p] : [];
  });
  const used = new Set<string>();
  for (const f of walk(root)) for (const m of readFileSync(f, 'utf8').matchAll(/['"`](nyc_[a-z_]+)/g)) used.add(m[1]);
  const registered = new Set([...STORAGE_KEYS.map((k) => k.key), SCENARIOS_KEY]);
  const missing = [...used].filter((k) => !registered.has(k));
  assert.deepEqual(missing, [], `register these in STORAGE_KEYS: ${missing.join(', ')}`);
  assert.ok(used.size >= 15, `only found ${used.size} keys; did the scan break?`);
});

test('registry: unique keys, local Open links, every entry described', () => {
  const keys = STORAGE_KEYS.map((k) => k.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of STORAGE_KEYS) {
    assert.match(k.href, /^\/[a-z-]*\/?$/);
    assert.ok(k.label && k.purpose.length > 10, k.key);
  }
});

test('snapshot keeps only known keys with JSON values', () => {
  const s = seeded();
  assert.deepEqual(snapshot(s), { nyc_shared_profile: profile, nyc_coop_inputs: coopInputs });
  assert.deepEqual(savedKeys(s).map((k) => k.key), ['nyc_shared_profile', 'nyc_coop_inputs']);
});

test('save, load, rename, delete', () => {
  const s = seeded();
  const a = saveScenario(s, '  Queens co-op  ', new Date('2026-10-04T12:00:00Z'));
  assert.ok(a.ok);
  assert.equal(a.scenario.name, 'Queens co-op');
  assert.equal(a.scenario.savedAt, '2026-10-04T12:00:00.000Z');

  // Change what's saved, then load the scenario back.
  s.setItem('nyc_coop_inputs', JSON.stringify({ mtgRate: '7.5' }));
  s.setItem('nyc_condo_inputs', JSON.stringify({ price: 900000 }));
  assert.ok(loadScenario(s, a.scenario.id));
  assert.equal(s.getItem('nyc_coop_inputs'), coopInputs);
  assert.equal(s.getItem('nyc_condo_inputs'), null, 'keys not in the scenario are cleared');
  assert.equal(s.getItem('someone_elses_key'), '"x"', 'other sites\' keys are untouched');

  assert.ok(renameScenario(s, a.scenario.id, 'Astoria co-op'));
  assert.equal(listScenarios(s)[0].name, 'Astoria co-op');
  assert.ok(deleteScenario(s, a.scenario.id));
  assert.deepEqual(listScenarios(s), []);
  assert.equal(s.getItem(SCENARIOS_KEY), null);
  assert.equal(loadScenario(s, 'nope'), false);
});

test('same name (any case) replaces; rename refuses a taken name', () => {
  const s = seeded();
  const a = saveScenario(s, 'Plan A');
  saveScenario(s, 'Plan B');
  const again = saveScenario(s, 'plan a');
  assert.ok(a.ok && again.ok);
  assert.equal(again.replaced, true);
  assert.equal(again.scenario.id, a.scenario.id);
  assert.equal(listScenarios(s).length, 2);
  assert.equal(renameScenario(s, a.scenario.id, 'PLAN B'), false);
});

test('save refuses an empty name, an empty browser, and more than the limit', () => {
  assert.deepEqual(saveScenario(seeded(), '   '), { ok: false, reason: 'empty-name' });
  assert.deepEqual(saveScenario(new MemoryStorage(), 'x'), { ok: false, reason: 'nothing-saved' });
  const s = seeded();
  for (let i = 0; i < MAX_SCENARIOS; i++) assert.ok(saveScenario(s, `S${i}`).ok);
  assert.deepEqual(saveScenario(s, 'one more'), { ok: false, reason: 'limit' });
  assert.ok(saveScenario(s, 'S3').ok, 'replacing still works at the limit');
});

test('clearCurrent keeps scenarios; resetAll removes everything this site stores, and only that', () => {
  const s = seeded();
  saveScenario(s, 'Keep me');
  clearCurrent(s);
  assert.deepEqual(snapshot(s), {});
  assert.equal(listScenarios(s).length, 1);
  resetAll(s);
  assert.equal(s.getItem(SCENARIOS_KEY), null);
  assert.equal(s.getItem('someone_elses_key'), '"x"');
});

test('export then import round-trips current data and scenarios', () => {
  const s = seeded();
  saveScenario(s, 'Queens co-op');
  const file = JSON.stringify(exportData(s, new Date('2026-10-04T00:00:00Z')));
  const parsed = parseImport(file);
  assert.ok(parsed.ok);
  assert.equal(parsed.data.kind, 'export');
  assert.deepEqual(parsed.data.skipped, []);

  const t = new MemoryStorage();
  t.setItem('nyc_condo_inputs', JSON.stringify({ price: 1 }));
  assert.deepEqual(applyImport(t, parsed.data, 'replace'), { keys: 2, scenarios: 1 });
  assert.deepEqual(snapshot(t), snapshot(s));
  assert.equal(listScenarios(t)[0].name, 'Queens co-op');
});

test('merge keeps keys the file lacks; colliding scenario names get " (imported)", then a number', () => {
  const s = seeded();
  saveScenario(s, 'Plan');
  const parsed = parseImport(JSON.stringify(exportData(s)));
  assert.ok(parsed.ok);
  const t = new MemoryStorage();
  t.setItem('nyc_condo_inputs', JSON.stringify({ price: 1 }));
  saveScenario(t, 'Plan');
  applyImport(t, parsed.data, 'merge');
  applyImport(t, parsed.data, 'merge');
  assert.ok(t.getItem('nyc_condo_inputs'));
  assert.deepEqual(listScenarios(t).map((x) => x.name), ['Plan', 'Plan (imported)', 'Plan (imported 2)']);
  assert.equal(new Set(listScenarios(t).map((x) => x.id)).size, 3);
});

test('import never exceeds the scenario limit', () => {
  const s = seeded();
  for (let i = 0; i < MAX_SCENARIOS; i++) saveScenario(s, `S${i}`);
  const parsed = parseImport(JSON.stringify(exportData(s)));
  assert.ok(parsed.ok);
  const t = seeded();
  saveScenario(t, 'Mine');
  assert.equal(applyImport(t, parsed.data, 'merge').scenarios, MAX_SCENARIOS - 1);
  assert.equal(listScenarios(t).length, MAX_SCENARIOS);
});

test('imports the "Download my saved data" file from the retired co-op domain', () => {
  const legacy = JSON.stringify({
    exported: '2026-10-01T00:00:00Z', from: 'nyc-co-op-affordability.com',
    nyc_coop_inputs: { mtgRate: '6.95' }, nyc_shared_profile: { annualIncome: 120000 }, extra: 1,
  });
  const parsed = parseImport(legacy);
  assert.ok(parsed.ok);
  assert.equal(parsed.data.kind, 'legacy-coop');
  assert.deepEqual(JSON.parse(parsed.data.current.nyc_coop_inputs), { mtgRate: '6.95' });
  assert.deepEqual(parsed.data.skipped, ['extra']);
});

test('import skips unknown keys and non-JSON values, and rejects files that aren\'t ours', () => {
  const parsed = parseImport(JSON.stringify({
    format: EXPORT_FORMAT, version: 2, exported: '',
    current: { nyc_coop_inputs: coopInputs, evil_key: '"x"', nyc_rent_inputs: 'not json' },
    scenarios: [{ id: 'a', name: 'X', savedAt: '', data: { nyc_coop_inputs: coopInputs, evil_key: '"y"' } }, { name: '' }, 'junk'],
  }));
  assert.ok(parsed.ok);
  assert.deepEqual(Object.keys(parsed.data.current), ['nyc_coop_inputs']);
  assert.deepEqual(parsed.data.skipped, ['evil_key', 'nyc_rent_inputs']);
  assert.equal(parsed.data.scenarios.length, 1);
  assert.deepEqual(Object.keys(parsed.data.scenarios[0].data), ['nyc_coop_inputs']);

  for (const bad of ['not json', '[]', 'null', '{"hello":1}', JSON.stringify({ format: EXPORT_FORMAT, current: { evil: '1' } })]) {
    assert.equal(parseImport(bad).ok, false, bad);
  }
  assert.equal(parseImport(' '.repeat(MAX_IMPORT_BYTES + 1)).ok, false, 'size cap');
});

test('a corrupted scenarios entry reads as no scenarios instead of throwing', () => {
  const s = new MemoryStorage();
  s.setItem(SCENARIOS_KEY, '{broken');
  assert.deepEqual(listScenarios(s), []);
});
