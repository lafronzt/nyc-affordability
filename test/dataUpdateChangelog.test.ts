import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SITE_CHANGES, changeId, type SiteChange } from '../src/data/siteChanges.ts';
import {
  rateChangeEntry, amiChangeEntry, serializeChange, insertChange, fillPr, PR_PLACEHOLDER, longDate, pct,
} from '../scripts/data-updates/changelog.ts';

// The scheduled data updates (scripts/data-updates/) add their own entry to
// the public changelog. These check the generated entry against the one
// written by hand for the first automated update, and that inserting it
// leaves src/data/siteChanges.ts valid.

const SRC = readFileSync(new URL('../src/data/siteChanges.ts', import.meta.url), 'utf8');

/** Import a modified siteChanges.ts (it has no imports, so it loads from anywhere). */
async function load(src: string): Promise<SiteChange[]> {
  const dir = mkdtempSync(join(tmpdir(), 'site-changes-'));
  try {
    writeFileSync(join(dir, 'siteChanges.ts'), src);
    return (await import(join(dir, 'siteChanges.ts'))).SITE_CHANGES;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const HAND_WRITTEN = SITE_CHANGES.find((c) => c.pr === 93)!;

test('rate entry reproduces the hand-written 6.95% → 7.28% entry', () => {
  const e = rateChangeEntry({ oldRate: 6.95, newRate: 7.28, surveyDate: '2026-10-01', date: '2026-10-04' })!;
  assert.equal(e.title, HAND_WRITTEN.title);
  assert.equal(e.summary, HAND_WRITTEN.summary);
  assert.deepEqual(e.affects, HAND_WRITTEN.affects);
  assert.equal(e.kind, 'data');
  assert.equal(e.date, '2026-10-04');
  assert.equal(e.pr, null);
  assert.equal(e.logHeading, undefined, 'change-log.md entries are written by the person who finishes the PR');
});

test('rate entry: two decimals, direction of the change, none when only the week moved', () => {
  const up = rateChangeEntry({ oldRate: 7.28, newRate: 7.4, surveyDate: '2026-10-08', date: '2026-10-09' })!;
  assert.equal(up.title, 'Default mortgage rate 7.28% → 7.40%');
  assert.match(up.summary, /at 7\.40% as of October 8, 2026\./);
  assert.match(up.summary, /Higher rates lower what income supports\.$/);
  const down = rateChangeEntry({ oldRate: 7.4, newRate: 6.5, surveyDate: '2026-11-05', date: '2026-11-06' })!;
  assert.equal(down.title, 'Default mortgage rate 7.40% → 6.50%');
  assert.match(down.summary, /Lower rates raise what income supports\.$/);
  assert.equal(rateChangeEntry({ oldRate: 7.4, newRate: 7.4, surveyDate: '2026-10-15', date: '2026-10-16' }), null);
  assert.equal(longDate('2026-01-02'), 'January 2, 2026');
  assert.equal(pct(7), '7.00%');
});

const BASE_2026 = { 1: 118800, 2: 135700, 3: 152700, 4: 169600, 5: 183200, 6: 196800, 7: 210400, 8: 223900 };
const BASE_2027 = { 1: 121000, 2: 138300, 3: 155600, 4: 172800, 5: 186700, 6: 200500, 7: 214300, 8: 228100 };

test('AMI entry: new year, revised chart, and no change', () => {
  const e = amiChangeEntry({ oldYear: 2026, newYear: 2027, oldBase: BASE_2026, newBase: BASE_2027, date: '2027-05-03' })!;
  assert.equal(e.title, 'AMI figures updated to HPD\'s 2027 chart');
  assert.equal(e.summary, 'HPD published its 2027 New York City Area AMI chart. 100% AMI for 3 people: $152,700 → $155,600; for 4 people: $169,600 → $172,800. AMI percentages, income bands, and max rents per band moved with it.');
  assert.equal(e.kind, 'data');
  assert.equal(e.pr, null);
  // Same pages as the October 3 AMI correction, plus the /data/ download.
  const correction = SITE_CHANGES.find((c) => c.pr === 84)!;
  for (const p of correction.affects) assert.ok(e.affects.includes(p), p);

  const revised = amiChangeEntry({ oldYear: 2026, newYear: 2026, oldBase: BASE_2026, newBase: { ...BASE_2026, 4: 170000 }, date: '2026-11-03' })!;
  assert.equal(revised.title, 'AMI figures updated to HPD\'s revised 2026 chart');
  assert.match(revised.summary, /^HPD revised its 2026 .* 3 people: \$152,700 \(unchanged\); for 4 people: \$169,600 → \$170,000\./);
  assert.equal(amiChangeEntry({ oldYear: 2026, newYear: 2026, oldBase: BASE_2026, newBase: { ...BASE_2026 }, date: '2026-11-03' }), null);
});

test('inserted entries load back unchanged, newest first, and pass the changelog checks', async () => {
  const rate = rateChangeEntry({ oldRate: 7.28, newRate: 7.4, surveyDate: '2026-10-08', date: '2099-01-01' })!;
  const ami = amiChangeEntry({ oldYear: 2026, newYear: 2027, oldBase: BASE_2026, newBase: BASE_2027, date: '2099-01-02' })!;
  const src = insertChange(insertChange(SRC, rate), ami);
  const loaded = await load(src);
  assert.equal(loaded.length, SITE_CHANGES.length + 2);
  assert.deepEqual(loaded[0], ami);
  assert.deepEqual(loaded[1], rate);
  assert.deepEqual(loaded.slice(2), SITE_CHANGES);
  for (let i = 1; i < loaded.length; i++) assert.ok(loaded[i - 1].date >= loaded[i].date, loaded[i].title);
  // Every page an automated entry names is already named by a hand-written one (siteChanges.test.ts checks those resolve).
  const known = new Set(SITE_CHANGES.flatMap((c) => c.affects));
  for (const p of [...rate.affects, ...ami.affects]) assert.ok(known.has(p), p);
  const ids = loaded.map(changeId);
  assert.equal(new Set(ids).size, ids.length);
  // Only the new lines differ from the committed file.
  assert.equal(src.replace(serializeChange(ami), '').replace(serializeChange(rate), ''), SRC);
});

test('quotes and backslashes survive serialization', async () => {
  const e: SiteChange = { date: '2099-01-01', kind: 'data', title: 'HPD\'s chart \\ test', summary: 'It\'s "quoted".', affects: ['/data/'], pr: 7, logHeading: '2099-01-01: Data: it\'s' };
  assert.deepEqual((await load(insertChange(SRC, e)))[0], e);
});

test('fillPr links the PR and leaves other entries alone', async () => {
  // A minimal file, so this holds while a data-update branch has its own entry pending.
  const old: SiteChange = { date: '2026-01-01', kind: 'data', title: 'Older', summary: 'Older entry.', affects: ['/data/'], pr: null };
  const base = insertChange('export const SITE_CHANGES: SiteChange[] = [\n];\n', old).replace(` ${PR_PLACEHOLDER}`, '');
  const e = rateChangeEntry({ oldRate: 7.28, newRate: 7.4, surveyDate: '2026-10-08', date: '2026-10-09' })!;
  const src = insertChange(base, e);
  assert.ok(src.includes(`pr: null, ${PR_PLACEHOLDER}`));
  const filled = fillPr(src, 112);
  assert.ok(!filled.includes(PR_PLACEHOLDER));
  assert.deepEqual(await load(filled), [{ ...e, pr: 112 }, old]);
  assert.equal(fillPr(base, 112), base, 'no placeholder, no change');
});
