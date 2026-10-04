import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { chartRows, niceTicks, compactMoney, describeFigure } from '../src/lib/neighborhoodCharts.ts';
import { incomeNeededDataset, type AreaFigures } from '../src/lib/dataExport.ts';
import type { MarketFigure } from '../src/lib/marketFigures.ts';

// The /neighborhoods/ charts must show the same numbers as the area pages
// and the /data/ download, and must say what each cited figure covers.

const dir = fileURLToPath(new URL('../src/content/neighborhoods/', import.meta.url));
const hoods: AreaFigures[] = readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => {
  const fm = yaml.load(readFileSync(dir + f, 'utf8').split(/^---\s*$/m)[1]) as Record<string, unknown>;
  return { fm, slug: f.replace(/\.md$/, '') };
}).filter(({ fm }) => fm.draft !== true).map(({ fm, slug }) => ({
  areaType: 'neighborhood' as const, slug, name: fm.name as string, borough: fm.borough as string, figures: fm.figures as MarketFigure[],
}));
const rows = chartRows(hoods);

test('one row per published neighborhood, highest cited rent first', () => {
  assert.equal(rows.length, hoods.length);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].rent.value >= rows[i].rent.value);
});

test('calculated incomes match the /data/ income-needed download', () => {
  const ds = incomeNeededDataset(hoods);
  for (const r of rows) {
    for (const scenario of ['rent', 'coop', 'condo'] as const) {
      const d = ds.rows.find((x) => x.area_slug === r.slug && x.scenario === scenario)!;
      assert.equal(r.income[scenario], d.income_needed, `${r.slug} ${scenario}`);
    }
  }
});

test('each rent says whether it is an average or a median, and when it covers a wider zone', () => {
  for (const r of rows) {
    assert.match(r.rentQualifier, r.rent.metric === 'average-rent' ? /^avg/ : /^median/);
    assert.equal(r.rentQualifier.includes('zone'), r.rent.geo.kind !== 'neighborhood', r.slug);
  }
});

test('figure descriptions carry period, scope and source', () => {
  const f = rows.find((r) => r.coopBasis.unitScope === '1br')?.coopBasis;
  assert.ok(f, 'expected at least one one-bedroom-only sale figure in the data');
  const d = describeFigure(f);
  assert.match(d, /one-bedrooms only/);
  assert.ok(d.includes(f.period) && d.includes(f.source));
});

test('niceTicks: clean steps from zero that cover the max', () => {
  assert.deepEqual(niceTicks(470_000, 4), [0, 100_000, 200_000, 300_000, 400_000, 500_000]);
  assert.deepEqual(niceTicks(380_000, 4), [0, 100_000, 200_000, 300_000, 400_000]);
  assert.deepEqual(niceTicks(0), [0]);
  const t = niceTicks(123_456, 4);
  assert.ok(t[t.length - 1] >= 123_456 && t[0] === 0);
});

test('compactMoney', () => {
  assert.equal(compactMoney(950), '$950');
  assert.equal(compactMoney(4_400), '$4.4K');
  assert.equal(compactMoney(250_000), '$250K');
  assert.equal(compactMoney(1_250_000), '$1.3M');
  assert.equal(compactMoney(0), '$0');
});
