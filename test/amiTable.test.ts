import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AMI_BASE, AMI_SOURCE_URL, amiPercent, getBandClass } from '../src/lib/amiTable.ts';

// The 100% AMI row of NYC HPD's "2026 New York City Area AMI" chart, which
// HPD and Housing Connect use for eligibility (HUD-derived, as HPD publishes
// it). An earlier table used lower figures that matched neither HPD's chart
// nor its 120% column, so a household HPD puts at 98% AMI showed as 120%.
// When HPD publishes a new year, update the table, this test, and the guides.
const HPD_2026_100PCT: Record<number, number> = {
  1: 118_800, 2: 135_700, 3: 152_700, 4: 169_600,
  5: 183_200, 6: 196_800, 7: 210_400, 8: 223_900,
};

test('AMI table matches HPD 2026 100% AMI by household size', () => {
  assert.deepEqual(AMI_BASE, HPD_2026_100PCT);
  assert.match(AMI_SOURCE_URL, /nyc\.gov\/site\/hpd\/.*area-median-income/);
});

test('other bands on the HPD chart are the 100% row scaled', () => {
  // Spot checks against HPD's printed 80% and 120% columns.
  assert.equal(Math.round(AMI_BASE[3] * 0.8), 122_160);
  assert.equal(Math.round(AMI_BASE[4] * 1.2), 203_520);
  assert.equal(Math.round(AMI_BASE[1] * 0.6), 71_280);
});

test('a 3-person household at $150,000 is about 98% AMI (Moderate)', () => {
  const pct = amiPercent(150_000, 3);
  assert.equal(pct.toFixed(1), '98.2');
  assert.equal(getBandClass(pct).short, 'MOD');
});
