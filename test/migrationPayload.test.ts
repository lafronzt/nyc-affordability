import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { sanitizeMigrationPayload, safeCoopInputs, SAFE_COOP_INPUT_KEYS, COOP_INPUTS_KEY } from '../src/lib/migrationPayload.ts';

// Phase 5a: the legacy-domain hand-off must never put income, debts or
// account balances in a URL. Checked at both ends: the Worker page that
// builds the link (run in a sandbox below) and the sanitizer coop.ts applies
// when it reads one.

const SAVED_COOP = {
  accounts: [{ name: 'Checking', balance: 15000, liquidity: 100 }, { name: 'Brokerage', balance: 70000, liquidity: 80 }],
  inputs: { annualIncome: 185000, otherDebts: 650, mtgRate: 7.1, loanTerm: 30, dpPct: 25, reserveMo: 12, maxDti: 28, monthlyMaint: 1450, fcAtty: 2500, fcBankAtty: 1000, fcCoop: 750, fcMoveIn: 1000, fcOther: 800, varPct: 1, targetOverride: '750000', surprise: 'x' },
};
const SAVED_PROFILE = { accounts: SAVED_COOP.accounts, annualIncome: 185000, otherDebts: 650 };
const SAFE_EXPECTED = { mtgRate: 7.1, loanTerm: 30, dpPct: 25, reserveMo: 12, maxDti: 28, monthlyMaint: 1450, fcAtty: 2500, fcBankAtty: 1000, fcCoop: 750, fcMoveIn: 1000, fcOther: 800, varPct: 1 };
const PERSONAL = /annualIncome|otherDebts|balance|accounts|185000|15000|70000|nyc_shared_profile|targetOverride/;

test('sanitizer keeps only the allowlisted calculator settings', () => {
  const out = sanitizeMigrationPayload({ [COOP_INPUTS_KEY]: JSON.stringify(SAVED_COOP), nyc_shared_profile: JSON.stringify(SAVED_PROFILE), other: 'x' });
  assert.deepEqual(Object.keys(out), [COOP_INPUTS_KEY]);
  assert.deepEqual(JSON.parse(out[COOP_INPUTS_KEY]), { inputs: SAFE_EXPECTED });
  assert.doesNotMatch(JSON.stringify(out), PERSONAL);
});

test('sanitizer drops non-numeric values and empty payloads', () => {
  assert.deepEqual(safeCoopInputs({ inputs: { mtgRate: '6.5', dpPct: 'abc', loanTerm: '' } }), { mtgRate: 6.5 });
  assert.equal(safeCoopInputs('not json'), null);
  assert.deepEqual(sanitizeMigrationPayload({ nyc_shared_profile: JSON.stringify(SAVED_PROFILE) }), {});
  assert.deepEqual(sanitizeMigrationPayload(null), {});
});

// ---- The Worker's legacy-domain page, run in a sandbox ----

const worker = (await import(new URL('../functions/%5B%5Bpath%5D%5D.js', import.meta.url).href)).default;

async function runLegacyPage(storage: Record<string, string>) {
  const res: Response = await worker.fetch(new Request('https://nyc-co-op-affordability.com/', { headers: { accept: 'text/html' } }), {});
  const html = await res.text();
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1];
  const els: Record<string, any> = {};
  const el = (id: string) => (els[id] ??= { id, hidden: id === 'personal', textContent: '', href: '', children: [] as any[], appendChild(c: any) { this.children.push(c); }, addEventListener() {} });
  let replaced: string | null = null;
  const ctx = vm.createContext({
    localStorage: { getItem: (k: string) => (k in storage ? storage[k] : null) },
    location: { hostname: 'nyc-co-op-affordability.com', replace: (u: string) => { replaced = u; } },
    document: { getElementById: el, createElement: () => ({ textContent: '' }), body: { appendChild() {} } },
    TextEncoder, URL, btoa: (s: string) => Buffer.from(s, 'binary').toString('base64'), JSON, Object, Array, Number, String, Math, isFinite,
  });
  vm.runInContext(script, ctx);
  return { html, replaced: replaced as string | null, els };
}
const fragmentPayload = (url: string) => {
  const m = /#migrate-local-storage=(.*)$/.exec(url);
  return m ? JSON.parse(Buffer.from(decodeURIComponent(m[1]), 'base64').toString('utf8')) : null;
};

test('Worker page and sanitizer share the same allowlist', async () => {
  const { html } = await runLegacyPage({});
  const m = /var SAFE = (\[[^\]]*\]);/.exec(html);
  assert.ok(m, 'allowlist not found in the page');
  assert.deepEqual(JSON.parse(m[1]), [...SAFE_COOP_INPUT_KEYS]);
});

test('settings only: redirects at once, with only the safe settings in the link', async () => {
  const { replaced } = await runLegacyPage({ [COOP_INPUTS_KEY]: JSON.stringify({ inputs: { mtgRate: 7.1, dpPct: 25 } }) });
  assert.ok(replaced?.startsWith('https://www.nyc-affordability.com/coop/#migrate-local-storage='));
  assert.deepEqual(fragmentPayload(replaced!), { [COOP_INPUTS_KEY]: JSON.stringify({ inputs: { mtgRate: 7.1, dpPct: 25 } }) });
});

test('personal data: no redirect, values shown on the page, and the link carries none of them', async () => {
  const { replaced, els } = await runLegacyPage({ [COOP_INPUTS_KEY]: JSON.stringify(SAVED_COOP), nyc_shared_profile: JSON.stringify(SAVED_PROFILE) });
  assert.equal(replaced, null, 'must not auto-redirect when personal data exists');
  assert.equal(els.personal.hidden, false);
  const shown = els.saved.children.map((c: any) => c.textContent);
  assert.deepEqual(shown, ['Annual income: $185,000', 'Monthly debt payments: $650', 'Checking: $15,000', 'Brokerage: $70,000']);
  const link = els.continue.href as string;
  const payload = fragmentPayload(link);
  assert.deepEqual(JSON.parse(payload[COOP_INPUTS_KEY]), { inputs: SAFE_EXPECTED });
  assert.doesNotMatch(decodeURIComponent(link) + JSON.stringify(payload), PERSONAL);
});

test('nothing saved: redirects with a clean URL', async () => {
  const { replaced } = await runLegacyPage({});
  assert.equal(replaced, 'https://www.nyc-affordability.com/coop/');
});
