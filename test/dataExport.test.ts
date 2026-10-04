import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import {
  csvCell, toCsv, manifest, incomeBasis, marketFiguresDataset, incomeNeededDataset,
  affordabilityIndexDataset, amiDataset, assumptionsDataset, DATA_LICENSE, type AreaFigures, type Dataset,
} from '../src/lib/dataExport.ts';
import { ASSUMPTIONS } from '../src/data/assumptions.ts';
import { AFFORDABILITY_INDEX } from '../src/data/affordabilityIndex.ts';
import { BOROUGH_HUBS } from '../src/data/boroughs.ts';
import { AMI_BASE, AMI_SOURCE_URL } from '../src/lib/amiTable.ts';
import { requiredIncomeForRent, requiredIncomeForPrice } from '../src/lib/afford.ts';
import type { MarketFigure } from '../src/lib/marketFigures.ts';

// /data/ downloads: built from the same files as the pages, every cited row
// fully sourced, calculated rows traceable to the figure they start from.

const dir = fileURLToPath(new URL('../src/content/neighborhoods/', import.meta.url));
const hoods: AreaFigures[] = readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => {
  const fm = yaml.load(readFileSync(dir + f, 'utf8').split(/^---\s*$/m)[1]) as Record<string, unknown>;
  return { fm, slug: f.replace(/\.md$/, '') };
}).filter(({ fm }) => fm.draft !== true).map(({ fm, slug }) => ({
  areaType: 'neighborhood', slug, name: fm.name as string, borough: fm.borough as string, figures: fm.figures as MarketFigure[],
}));
const areas: AreaFigures[] = [
  ...BOROUGH_HUBS.map((h) => ({ areaType: 'borough' as const, slug: h.slug, name: h.name, borough: h.slug, figures: h.figures })),
  ...hoods,
];
const datasets: Dataset[] = [
  marketFiguresDataset(areas),
  incomeNeededDataset(areas),
  affordabilityIndexDataset(AFFORDABILITY_INDEX),
  amiDataset(AMI_BASE, AMI_SOURCE_URL, 2026),
  assumptionsDataset(ASSUMPTIONS),
];

test('csvCell quotes commas, quotes and newlines, and blanks nulls', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell(1234.5), '1234.5');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell('a, b'), '"a, b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('two\nlines'), '"two\nlines"');
});

test('every row has every declared column, and nothing undeclared', () => {
  for (const d of datasets) {
    const keys = d.columns.map((c) => c.key).sort();
    assert.ok(d.rows.length > 0, `${d.id} is empty`);
    for (const r of d.rows) assert.deepEqual(Object.keys(r).sort(), keys, `${d.id} row has different fields`);
    assert.equal(new Set(keys).size, keys.length, `${d.id} repeats a column`);
  }
});

test('CSV has a header plus one line per row', () => {
  for (const d of datasets) {
    const csv = toCsv(d);
    assert.ok(csv.startsWith(d.columns.map((c) => c.key).join(',') + '\r\n'));
    // Quoted cells could hold newlines; none of ours do, so line count = rows + header.
    assert.equal(csv.trimEnd().split('\r\n').length, d.rows.length + 1, d.id);
  }
});

test('every cited value names its source, URL and period; untracked values stay blank', () => {
  for (const d of datasets.filter((x) => x.kind === 'cited')) {
    for (const r of d.rows) {
      if (r.status === 'not-yet-tracked') {
        assert.equal(r.value, null, `${d.id}: untracked metric must not carry a value`);
        continue;
      }
      const value = r.value ?? r.ami_100_pct;
      assert.ok(typeof value === 'number' && value > 0, `${d.id}: missing value`);
      assert.ok(String(r.source ?? '').trim(), `${d.id}: missing source`);
      assert.match(String(r.source_url), /^https:\/\//, `${d.id}: missing source URL`);
      assert.ok(String(r.period ?? r.as_of ?? r.year ?? '').match(/\b20\d\d\b/), `${d.id}: missing a dated period`);
    }
  }
});

test('market figures: one row per figure on every published area page', () => {
  const ds = datasets[0];
  assert.equal(ds.rows.length, areas.reduce((n, a) => n + a.figures.length, 0));
});

test('income needed matches what the area pages show', () => {
  const rows = datasets[1].rows;
  // Queens uses the co-op median for co-op income, not the blended median (PR #79).
  const queens = BOROUGH_HUBS.find((h) => h.slug === 'queens')!;
  const qCoop = rows.find((r) => r.area_slug === 'queens' && r.scenario === 'coop')!;
  assert.equal(qCoop.based_on_property_scope, 'coop');
  assert.equal(qCoop.income_needed, Math.round(requiredIncomeForPrice({ targetPrice: incomeBasis(queens.figures).coop!.value, propertyType: 'coop' }).annualIncomeNeeded));
  assert.equal(rows.some((r) => r.area_slug === 'queens' && r.scenario === 'rent'), false, 'Queens rent is not yet tracked');
  for (const r of rows.filter((x) => x.scenario === 'rent')) {
    assert.equal(r.income_needed, Math.round(requiredIncomeForRent({ targetRent: r.based_on_value as number }).annualIncomeNeeded));
  }
  for (const r of rows) {
    assert.equal(r.kind, 'calculated');
    assert.match(String(r.based_on_source_url), /^https:\/\//, 'calculated row must trace to a cited figure');
  }
});

test('assumptions: one row per registry entry, with its basis', () => {
  const ds = datasets[4];
  assert.equal(ds.rows.length, Object.keys(ASSUMPTIONS).length);
  assert.ok(ds.rows.every((r) => ['law', 'official-data', 'market-survey', 'convention', 'illustrative'].includes(r.basis as string)));
});

test('manifest lists a JSON and CSV per dataset under CC0', () => {
  const m = manifest(datasets, '2026-10-04');
  assert.equal(m.license.id, 'CC0-1.0');
  assert.equal(DATA_LICENSE.id, 'CC0-1.0');
  assert.equal(m.datasets.length, datasets.length);
  for (const d of m.datasets) assert.deepEqual(d.files, { json: `/data/${d.id}.json`, csv: `/data/${d.id}.csv` });
});
