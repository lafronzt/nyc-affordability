import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renterMoveCost, buyerMoveCost, defaultRenterMoveInputs, defaultBuyerMoveInputs, type MoveCost } from '../src/lib/engines/moveCost.ts';
import { calculateRent, rentSnapshot } from '../src/lib/engines/rent.ts';
import { rentInputsFromDefaults } from '../src/lib/engines/defaults.ts';
import { cashNeeded, defaultSavingsInputs } from '../src/lib/engines/savings.ts';
import { ASSUMPTIONS as A } from '../src/data/assumptions.ts';

// Cost to move: the housing lines must match the shared engines (so the
// page agrees with /rent/, /coop/, /condo/, and the savings planner), and
// every dollar must land in exactly one bucket.

const near = (a: number, b: number, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `expected ${b}, got ${a}`);
const line = (c: MoveCost, id: string) => c.lines.find((l) => l.id === id)?.amount ?? 0;
const buckets = (c: MoveCost) => {
  near(c.spent + c.equity + c.refundable + c.held, c.cashNeeded);
  near(c.housing + c.moving, c.cashNeeded);
  near(c.lines.reduce((s, l) => s + l.amount, 0), c.cashNeeded);
};

test('renter: lease-signing cash equals the /rent/ engine at the same rent', () => {
  const c = renterMoveCost(defaultRenterMoveInputs({ rent: 3_500, movers: 0, supplies: 0 }));
  const inp = rentInputsFromDefaults();
  const s = rentSnapshot(3_500, inp, calculateRent(inp));
  near(c.housing, s.totalAtSigning);
  near(line(c, 'security'), 3_500);
  near(line(c, 'application'), 20);
  assert.equal(line(c, 'broker'), 0); // FARE Act default
  buckets(c);
});

test('renter: security deposit is the only refundable line; tenant-hired broker and guarantor add up', () => {
  const c = renterMoveCost(defaultRenterMoveInputs({ rent: 3_500, brokerType: 'pct_annual', brokerFeePct: 15, guarantorFeePct: 70 }));
  near(c.refundable, 3_500);
  near(line(c, 'broker'), 3_500 * 12 * 0.15);
  near(line(c, 'guarantor'), 2_450);
  assert.equal(c.held, 0);
  assert.equal(c.equity, 0);
  buckets(c);
});

test('overlap is prorated by 30-day month; moving lines are the visitor\'s numbers', () => {
  const c = renterMoveCost(defaultRenterMoveInputs({ rent: 3_000, overlapDays: 15, currentMonthlyHousing: 2_400, leaseBreakFee: 2_400, furnishing: 1_000 }));
  near(line(c, 'overlap'), 1_200);
  near(c.moving, A.moversCost.value + A.movingSupplies.value + 1_200 + 2_400 + 1_000);
  buckets(c);
});

test('buyer: co-op and condo cash match the savings planner\'s cash target (plus utilities and the move)', () => {
  for (const type of ['coop', 'condo'] as const) {
    const c = buyerMoveCost(defaultBuyerMoveInputs(type, { price: 600_000 }));
    const need = cashNeeded(defaultSavingsInputs(type, { targetPrice: 600_000 }));
    near(c.housing - line(c, 'utilities'), need.total);
    near(c.equity, need.downPayment);
    buckets(c);
  }
});

test('buyer: co-op reserves are held, not spent; the move-in deposit comes back; condos pay MRT', () => {
  const coop = buyerMoveCost(defaultBuyerMoveInputs('coop', { price: 600_000 }));
  near(coop.held, 52_528, 1); // the co-op reserves guide's worked example
  near(coop.refundable, A.coopMoveInDeposit.value);
  assert.equal(line(coop, 'mrt'), 0);
  const condo = buyerMoveCost(defaultBuyerMoveInputs('condo', { price: 600_000 }));
  assert.equal(condo.held, 0);
  assert.ok(line(condo, 'mrt') > 0);
});

test('mansion tax appears at $1M', () => {
  assert.equal(line(buyerMoveCost(defaultBuyerMoveInputs('condo', { price: 999_000 })), 'mansion'), 0);
  near(line(buyerMoveCost(defaultBuyerMoveInputs('condo', { price: 1_000_000 })), 'mansion'), 10_000);
});

test('zero-amount lines are dropped', () => {
  const c = renterMoveCost(defaultRenterMoveInputs({ rent: 2_000 }));
  assert.ok(c.lines.every((l) => l.amount > 0));
  assert.ok(!c.lines.some((l) => l.id === 'guarantor' || l.id === 'overlap'));
});

test('renters default to no building move-in fee; co-op and condo buyers still pay one', () => {
  // RPL §238-a(1)(a) (HSTPA 2019) bars a landlord from charging any fee at
  // the start of a tenancy beyond the capped background/credit check. A
  // move-in fee is a co-op or condo board charge, so it defaults to $0 for
  // renters (enter it only when renting a unit in a co-op or condo building)
  // and stays in the co-op and condo closing costs.
  assert.equal(A.rentBuildingFee.value, 0);
  assert.equal(A.rentBuildingFee.basis, 'law');
  const renter = renterMoveCost(defaultRenterMoveInputs({ rent: 3_500 }));
  assert.equal(line(renter, 'building'), 0);
  const coop = buyerMoveCost(defaultBuyerMoveInputs('coop', { price: 700_000 }));
  assert.equal(line(coop, 'coop-deposit'), A.coopMoveInDeposit.value);
  assert.ok(A.coopMoveInDeposit.value > 0);
});
