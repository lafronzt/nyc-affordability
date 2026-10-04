import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACS_AREAS, rentBurden, renterShare, isWide } from '../src/data/censusAcs.ts';
import { parseAcsTable } from '../src/lib/sourceParsers.ts';

// Every number in src/data/censusAcs.ts must match the Census files it
// came from (fixture: verbatim lines from the 2024 ACS 1-year summary
// files). On a new release, swap the fixture and this lists what changed.

const fixture = readFileSync(new URL('./fixtures/acs-2024-nyc.txt', import.meta.url), 'utf8');
const blocks = Object.fromEntries(fixture.split(/\n\n+/).filter((b) => b.startsWith('acsdt1y')).map((b) => {
  const [name, ...rest] = b.split('\n');
  return [name.match(/-(b\d+)\.dat/)![1].toUpperCase(), rest.join('\n')];
}));
const ids = ACS_AREAS.map((a) => a.geoId);
const t = (table: string) => parseAcsTable(blocks[table], ids);

test('fixture has all five tables and all six geographies', () => {
  for (const table of ['B19013', 'B25064', 'B25070', 'B25119', 'B25003']) {
    assert.ok(blocks[table], table);
    assert.equal(t(table).size, 6, table);
  }
});

test('every estimate and margin matches the Census files', () => {
  const diffs: string[] = [];
  const eq = (area: string, what: string, got: number, want: number) => { if (got !== want) diffs.push(`${area} ${what}: data file ${got}, Census ${want}`); };
  for (const a of ACS_AREAS) {
    const inc = t('B19013').get(a.geoId)!, rent = t('B25064').get(a.geoId)!, ten = t('B25119').get(a.geoId)!;
    const occ = t('B25003').get(a.geoId)!, b = t('B25070').get(a.geoId)!;
    eq(a.name, 'median income', a.medianHouseholdIncome.value, inc.B19013_E001); eq(a.name, 'median income MOE', a.medianHouseholdIncome.moe, inc.B19013_M001);
    eq(a.name, 'gross rent', a.medianGrossRent.value, rent.B25064_E001); eq(a.name, 'gross rent MOE', a.medianGrossRent.moe, rent.B25064_M001);
    eq(a.name, 'owner income', a.ownerMedianIncome.value, ten.B25119_E002); eq(a.name, 'owner income MOE', a.ownerMedianIncome.moe, ten.B25119_M002);
    eq(a.name, 'renter income', a.renterMedianIncome.value, ten.B25119_E003); eq(a.name, 'renter income MOE', a.renterMedianIncome.moe, ten.B25119_M003);
    eq(a.name, 'households', a.households.total, occ.B25003_E001); eq(a.name, 'owners', a.households.owner, occ.B25003_E002); eq(a.name, 'renters', a.households.renter, occ.B25003_E003);
    eq(a.name, 'B25070 total', a.rentShare.total, b.B25070_E001);
    eq(a.name, '30-34.9%', a.rentShare.pct30to35, b.B25070_E007); eq(a.name, '35-39.9%', a.rentShare.pct35to40, b.B25070_E008);
    eq(a.name, '40-49.9%', a.rentShare.pct40to50, b.B25070_E009); eq(a.name, '50%+', a.rentShare.pct50plus, b.B25070_E010);
    eq(a.name, 'not computed', a.rentShare.notComputed, b.B25070_E011);
  }
  assert.deepEqual(diffs, []);
});

test('rent burden excludes households the Census could not compute', () => {
  const nyc = ACS_AREAS.find((a) => a.slug === 'nyc')!;
  const { atLeast30, atLeast50 } = rentBurden(nyc);
  // (189,126 + 124,482 + 178,136 + 622,867) / (2,275,300 - 114,150)
  assert.equal(atLeast30.toFixed(4), (1114611 / 2161150).toFixed(4));
  assert.equal(atLeast50.toFixed(4), (622867 / 2161150).toFixed(4));
  assert.ok(atLeast50 < atLeast30 && atLeast30 < 1);
});

test('renter share and wide-margin flag', () => {
  const nyc = ACS_AREAS.find((a) => a.slug === 'nyc')!;
  assert.equal(renterShare(nyc).toFixed(3), '0.673');
  const si = ACS_AREAS.find((a) => a.slug === 'staten-island')!;
  assert.equal(isWide(si.renterMedianIncome), true, '$64,678 ± $13,013');
  assert.equal(isWide(nyc.medianHouseholdIncome), false);
});

test('parser rejects a file without a GEO_ID column', () => {
  assert.throws(() => parseAcsTable('NAME|X\nfoo|1', ['foo']));
});

test('income comparison wording', async () => {
  const { relativeTo } = await import('../src/data/censusAcs.ts');
  assert.equal(relativeTo(81_228, 81_228), 'about the same as');
  assert.equal(relativeTo(50_000, 81_228), 'about 62% of');
  assert.equal(relativeTo(150_000, 81_228), 'about 1.8 times');
  assert.equal(relativeTo(162_456, 81_228), 'about 2 times');
});

test('/data/ census rows: 8 per area, cited estimates keep their margins', async () => {
  const { censusDataset } = await import('../src/lib/dataExport.ts');
  const ds = censusDataset(ACS_AREAS);
  assert.equal(ds.rows.length, ACS_AREAS.length * 8);
  const nycIncome = ds.rows.find((r) => r.area_slug === 'nyc' && r.measure === 'median_household_income')!;
  assert.deepEqual([nycIncome.kind, nycIncome.value, nycIncome.moe], ['cited', 81228, 908]);
  for (const r of ds.rows.filter((x) => x.kind === 'calculated')) assert.ok(r.method && Number(r.value) > 0 && Number(r.value) < 1);
});
