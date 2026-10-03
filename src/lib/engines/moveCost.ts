import { calculateRent, rentSnapshot, type RentInputs } from './rent.ts';
import { calculateCoop } from './coop.ts';
import { calculateCondo } from './condo.ts';
import { rentInputsFromDefaults, coopInputsFromDefaults, condoInputsFromDefaults } from './defaults.ts';
import { ASSUMPTIONS as A } from '../../data/assumptions.ts';

/* ============================================================
   Cost to move (pure, DOM-free)
   ============================================================
   "What does it actually cost to move into this apartment?" for a renter
   or a buyer, as one itemized list. The housing side comes from the shared
   engines (rentSnapshot for a lease signing, calculateCoop/calculateCondo
   for a purchase), so the numbers match /rent/, /coop/, and /condo/. The
   moving side (movers, supplies, overlapping rent, breaking a lease,
   furniture) is plain addition of what the visitor enters.

   Every line says whether the money is spent, turns into equity (the down
   payment), comes back later (security deposit, a co-op's move-in
   deposit), or just has to stay in your account (a co-op board's
   post-closing reserves).
   ============================================================ */

export type MoveMode = 'rent' | 'coop' | 'condo';
export type LineKind = 'spent' | 'equity' | 'refundable' | 'held';
export type LineGroup = 'housing' | 'moving';

export interface MoveLine {
  id: string;
  label: string;
  amount: number;
  kind: LineKind;
  group: LineGroup;
  note?: string;
}

export interface MovingInputs {
  movers: number;
  supplies: number;
  /** Days you pay for both the old and new place. */
  overlapDays: number;
  /** What you pay now per month (rent, or your current carrying costs). */
  currentMonthlyHousing: number;
  leaseBreakFee: number;
  furnishing: number;
}

export interface RenterMoveInputs extends MovingInputs {
  rent: number;
  /** Broker fee when you hire your own broker (FARE Act: a landlord's broker is paid by the landlord). */
  brokerType: 'none' | 'pct_annual' | 'months' | 'flat';
  brokerFeePct: number;
  brokerFeeMonths: number;
  brokerFlat: number;
  /** Institutional guarantor fee as % of one month's rent; 0 = not using one. */
  guarantorFeePct: number;
  petFee: number;
  buildingFee: number;
  utilitySetup: number;
  securityDepositMonths: number;
  applicationFee: number;
}

export interface BuyerMoveInputs extends MovingInputs {
  propertyType: 'coop' | 'condo';
  price: number;
  downPaymentPct: number;
  mortgageRate: number;
  /** Co-op maintenance or condo common charges (used for co-op reserves and condo working capital). */
  buildingCharges: number;
  /** Co-op post-closing reserves, months. */
  reserveMonths: number;
  utilitySetup: number;
}

export function defaultMovingInputs(overrides: Partial<MovingInputs> = {}): MovingInputs {
  return {
    movers: A.moversCost.value,
    supplies: A.movingSupplies.value,
    overlapDays: 0,
    currentMonthlyHousing: 0,
    leaseBreakFee: 0,
    furnishing: 0,
    ...overrides,
  };
}

export function defaultRenterMoveInputs(overrides: Partial<RenterMoveInputs> = {}): RenterMoveInputs {
  const r = rentInputsFromDefaults();
  return {
    ...defaultMovingInputs(),
    rent: 0,
    brokerType: 'none',
    brokerFeePct: r.brokerFeePct,
    brokerFeeMonths: r.brokerFeeMonths,
    brokerFlat: r.brokerFlat,
    guarantorFeePct: 0,
    petFee: 0,
    buildingFee: r.buildingFee,
    utilitySetup: r.utilitySetup,
    securityDepositMonths: r.secDepositMonths,
    applicationFee: r.appFee,
    ...overrides,
  };
}

export function defaultBuyerMoveInputs(type: 'coop' | 'condo', overrides: Partial<BuyerMoveInputs> = {}): BuyerMoveInputs {
  const coop = type === 'coop';
  return {
    ...defaultMovingInputs(),
    propertyType: type,
    price: 0,
    downPaymentPct: coop ? A.coopDownPaymentPct.value : A.condoDownPaymentPct.value,
    mortgageRate: A.mortgageRatePct.value,
    buildingCharges: coop ? A.coopMaintenanceMo.value : A.condoCommonChargesMo.value,
    reserveMonths: A.coopReserveMonths.value,
    utilitySetup: A.rentUtilitySetup.value,
    ...overrides,
  };
}

export interface MoveCost {
  lines: MoveLine[];
  /** Everything you need in hand: spent + refundable + held. */
  cashNeeded: number;
  /** Gone for good. */
  spent: number;
  /** Down payment: leaves your account but becomes home equity. */
  equity: number;
  /** Comes back later (deposits). */
  refundable: number;
  /** Has to stay in your account but isn't spent (co-op reserves). */
  held: number;
  /** Cash needed for the housing itself vs. the move. */
  housing: number;
  moving: number;
}

function movingLines(m: MovingInputs): MoveLine[] {
  const overlap = (m.overlapDays / 30) * m.currentMonthlyHousing;
  return [
    { id: 'movers', label: 'Movers', amount: m.movers, kind: 'spent', group: 'moving', note: 'Licensed NYC movers; buildings usually require their certificate of insurance.' },
    { id: 'supplies', label: 'Boxes and supplies', amount: m.supplies, kind: 'spent', group: 'moving' },
    { id: 'overlap', label: `Overlap: ${m.overlapDays} day${m.overlapDays === 1 ? '' : 's'} paying for both places`, amount: overlap, kind: 'spent', group: 'moving' },
    { id: 'lease-break', label: 'Breaking your current lease', amount: m.leaseBreakFee, kind: 'spent', group: 'moving' },
    { id: 'furnishing', label: 'Furniture and setup', amount: m.furnishing, kind: 'spent', group: 'moving' },
  ];
}

function total(lines: MoveLine[]): MoveCost {
  const kept = lines.filter((l) => l.amount > 0);
  const sum = (f: (l: MoveLine) => boolean) => kept.filter(f).reduce((s, l) => s + l.amount, 0);
  return {
    lines: kept,
    cashNeeded: sum(() => true),
    spent: sum((l) => l.kind === 'spent'),
    equity: sum((l) => l.kind === 'equity'),
    refundable: sum((l) => l.kind === 'refundable'),
    held: sum((l) => l.kind === 'held'),
    housing: sum((l) => l.group === 'housing'),
    moving: sum((l) => l.group === 'moving'),
  };
}

/** Lease signing via the /rent/ engine, plus the move. */
export function renterMoveCost(p: RenterMoveInputs): MoveCost {
  const inp: RentInputs = rentInputsFromDefaults({
    brokerType: p.brokerType, brokerFeePct: p.brokerFeePct, brokerFeeMonths: p.brokerFeeMonths, brokerFlat: p.brokerFlat,
    petFee: p.petFee, buildingFee: p.buildingFee, utilitySetup: p.utilitySetup,
    secDepositMonths: p.securityDepositMonths, appFee: p.applicationFee,
  });
  const s = rentSnapshot(p.rent, inp, calculateRent(inp));
  const lines: MoveLine[] = [
    { id: 'first-month', label: 'First month\'s rent', amount: s.firstMonth, kind: 'spent', group: 'housing', note: 'Spent, but it\'s rent you\'d pay anyway.' },
    { id: 'security', label: 'Security deposit', amount: s.secDeposit, kind: 'refundable', group: 'housing', note: 'Capped at one month\'s rent; returned (less lawful deductions) within 14 days of moving out.' },
    { id: 'application', label: 'Application / background check', amount: p.applicationFee, kind: 'spent', group: 'housing', note: 'Capped at $20.' },
    { id: 'broker', label: 'Broker fee (a broker you hired)', amount: s.brokerFee, kind: 'spent', group: 'housing', note: 'Under the FARE Act, the landlord pays a broker the landlord hired.' },
    { id: 'guarantor', label: 'Guarantor company fee', amount: p.rent * p.guarantorFeePct / 100, kind: 'spent', group: 'housing', note: 'Paid to the guarantor company, per lease year.' },
    { id: 'pet', label: 'Pet fee', amount: p.petFee, kind: 'spent', group: 'housing' },
    { id: 'building', label: 'Building move-in fees', amount: p.buildingFee, kind: 'spent', group: 'housing', note: 'Elevator reservation, move-in deposit, keys.' },
    { id: 'utilities', label: 'Utility setup', amount: p.utilitySetup, kind: 'spent', group: 'housing' },
    ...movingLines(p),
  ];
  return total(lines);
}

/** Closing via the /coop/ or /condo/ engine, plus the move. */
export function buyerMoveCost(p: BuyerMoveInputs): MoveCost {
  const common = { mortgageRate: p.mortgageRate, dpPct: p.downPaymentPct, targetOverride: p.price };
  const lines: MoveLine[] = [];
  if (p.propertyType === 'coop') {
    const c = coopInputsFromDefaults({ ...common, maint: p.buildingCharges, reserveMo: p.reserveMonths });
    const r = calculateCoop(c);
    const moveIn = c.fcMoveIn;
    lines.push(
      { id: 'down-payment', label: `Down payment (${p.downPaymentPct}%)`, amount: r.downPmt, kind: 'equity', group: 'housing', note: 'Becomes equity, not an expense.' },
      { id: 'closing', label: 'Closing costs', amount: r.fixedCC - moveIn + r.varCC, kind: 'spent', group: 'housing', note: 'Attorneys, board application, lien search, loan fees.' },
      { id: 'mansion', label: 'Mansion tax', amount: r.mansion, kind: 'spent', group: 'housing', note: '1%+ of the price at $1M and up.' },
      { id: 'coop-deposit', label: 'Building move-in deposit', amount: moveIn, kind: 'refundable', group: 'housing', note: 'Returned if the move does no damage.' },
      { id: 'reserves', label: `Board reserves (${p.reserveMonths} months)`, amount: r.maintRes + r.mtgRes, kind: 'held', group: 'housing', note: 'Must still be in your accounts after closing. Not spent.' },
    );
  } else {
    const c = condoInputsFromDefaults({ ...common, commonCharges: p.buildingCharges });
    const r = calculateCondo(c);
    lines.push(
      { id: 'down-payment', label: `Down payment (${p.downPaymentPct}%)`, amount: r.downPmt, kind: 'equity', group: 'housing', note: 'Becomes equity, not an expense.' },
      { id: 'closing', label: 'Closing costs and title insurance', amount: r.cc.fixed + r.cc.title, kind: 'spent', group: 'housing', note: 'Attorney, lender, appraisal, recording, building fees, title.' },
      { id: 'mrt', label: 'Mortgage recording tax', amount: r.cc.mrt, kind: 'spent', group: 'housing', note: 'On the loan amount.' },
      { id: 'mansion', label: 'Mansion tax', amount: r.cc.mansion, kind: 'spent', group: 'housing', note: '1%+ of the price at $1M and up.' },
    );
  }
  lines.push(
    { id: 'utilities', label: 'Utility setup', amount: p.utilitySetup, kind: 'spent', group: 'housing' },
    ...movingLines(p),
  );
  return total(lines);
}
