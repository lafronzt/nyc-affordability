import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASSUMPTIONS as A } from '../src/data/assumptions.ts';

// Market-survey defaults pinned to the survey they cite, so a value and its
// source can't drift apart (the citation is what /methodology/sources/ and
// /data/assumptions show next to the number).

test('renter\'s insurance default is ValuePenguin\'s NYC average (updated Sep 25, 2026)', () => {
  // ValuePenguin, "Average Cost of Renters Insurance": New York, NY $18/mo,
  // for $30K personal property, $100K liability, $500 deductible.
  const r = A.rentersInsuranceMo;
  assert.equal(r.value, 18);
  assert.equal(r.basis, 'market-survey');
  assert.equal(r.sourceUrl, 'https://www.valuepenguin.com/average-cost-renters-insurance');
  assert.equal(r.effectiveDate, '2026-09-25');
  assert.ok(r.lastVerified, 'record when the figure was checked');
  assert.ok(r.inputs?.some((i) => i.page === 'compare'), '/compare/ has its own renters insurance input');
});
