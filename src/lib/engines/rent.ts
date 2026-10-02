/* ============================================================
   Rent affordability engine (pure, DOM-free)
   ============================================================
   The math behind /rent/, moved here verbatim from src/scripts/rent.ts so
   the calculator, /compare/, and /reality-check/ all run the same code.
   calculateRent() gives the max rent and which constraint binds (move-in
   cash, reserve buffer, the income multiple, or optional DTI screening);
   rentSnapshot() gives the cash and monthly picture at a chosen rent.
   ============================================================ */

export interface RentAccount {
  name: string;
  balance: number;
  liquidity: number;
  [key: string]: unknown;
}

export interface RentInputs {
  accounts: RentAccount[];
  annualIncome: number;
  otherDebts: number;
  incomeMult: number;
  dtiEnabled: boolean;
  dtiPct: number;
  guarantorEnabled: boolean;
  guarantorMult: number;
  secDepositMonths: number;
  appFee: number;
  buildingFee: number;
  utilitySetup: number;
  petFee: number;
  brokerType: string;
  brokerFeePct: number;
  brokerFeeMonths: number;
  brokerFlat: number;
  rentersInsurance: number;
  reserveMonths: number;
}

export interface RentResult {
  weightedAssets: number;
  maxRent: number;
  maxRent_cash: number;
  maxRent_income: number;
  maxRent_mult: number;
  maxRent_dti: number;
  binding: string;
  fixedMovein: number;
  fixedReserve: number;
  bMult: number;
  bFixed: number;
}

export interface RentSnapshot {
  firstMonth: number;
  secDeposit: number;
  brokerFee: number;
  totalAtSigning: number;
  reserveBuffer: number;
  totalCashNeeded: number;
  moveInSurplus: number;
  reserveSurplus: number;
  moInc: number;
  monthlyTotal: number;
  rentBurden: number;
  totalDTI: number;
}

/* ── broker fee computation ── */
export function computeBrokerFee(rent: number, inp: RentInputs): number {
  switch (inp.brokerType) {
    case 'pct_annual': return rent * 12 * inp.brokerFeePct / 100;
    case 'months': return rent * inp.brokerFeeMonths;
    case 'flat': return inp.brokerFlat;
    default: return 0;
  }
}

export function brokerMult(inp: RentInputs): number {
  switch (inp.brokerType) {
    case 'pct_annual': return 12 * inp.brokerFeePct / 100;
    case 'months': return inp.brokerFeeMonths;
    default: return 0;
  }
}

export function brokerFixed(inp: RentInputs): number {
  return inp.brokerType === 'flat' ? inp.brokerFlat : 0;
}

/* ── core calculation ── */
export function calculateRent(inp: RentInputs): RentResult {
  let weightedAssets = 0;
  inp.accounts.forEach(a => {
    const weighted = a.balance * a.liquidity / 100;
    weightedAssets += weighted;
  });

  const moInc = inp.annualIncome / 12;
  const bMult = brokerMult(inp);
  const bFixed = brokerFixed(inp);

  const fixedMovein = inp.appFee + inp.buildingFee + inp.utilitySetup + inp.petFee + bFixed;
  const fixedReserve = inp.reserveMonths * (inp.rentersInsurance + inp.otherDebts);

  // Move-in and reserve buffer use liquidity-weighted account values.
  const moveinCoeff = 1 + inp.secDepositMonths + bMult;
  const maxRent_movein = moveinCoeff > 0
    ? Math.max(0, (weightedAssets - fixedMovein) / moveinCoeff)
    : Infinity;
  const maxRent_reserve = inp.reserveMonths > 0
    ? Math.max(0, (weightedAssets - fixedReserve) / inp.reserveMonths)
    : Infinity;
  const maxRent_cash = Math.min(maxRent_movein, maxRent_reserve);

  const maxRent_mult = inp.annualIncome / inp.incomeMult;
  const maxRent_dti = inp.dtiEnabled
    ? Math.max(0, moInc * inp.dtiPct / 100 - inp.rentersInsurance - inp.otherDebts)
    : Infinity;
  const maxRent_income = Math.max(0, Math.min(maxRent_mult, maxRent_dti));

  const maxRent = Math.min(maxRent_income, maxRent_cash);

  let binding: string;
  if (maxRent_cash <= maxRent_income) {
    binding = 'Cash / Move-In';
  } else if (inp.dtiEnabled && isFinite(maxRent_dti) && maxRent_dti <= maxRent_mult) {
    binding = 'Income (Rent-Burden)';
  } else {
    binding = `Income (${inp.incomeMult}× rule)`;
  }

  return {
    weightedAssets,
    maxRent, maxRent_cash, maxRent_income, maxRent_mult, maxRent_dti,
    binding, fixedMovein, fixedReserve, bMult, bFixed,
  };
}

/* ── snapshot at a given target rent ── */
export function rentSnapshot(tgt: number, inp: RentInputs, calc: RentResult): RentSnapshot {
  const firstMonth = tgt;
  const secDeposit = tgt * inp.secDepositMonths;
  const brokerFee = computeBrokerFee(tgt, inp);
  const totalAtSigning = tgt + secDeposit + brokerFee + inp.appFee + inp.buildingFee + inp.utilitySetup + inp.petFee;
  const reserveBuffer = inp.reserveMonths * (tgt + inp.rentersInsurance + inp.otherDebts);
  const totalCashNeeded = totalAtSigning + reserveBuffer;
  const moveInSurplus = calc.weightedAssets - totalAtSigning;
  const reserveSurplus = calc.weightedAssets - totalCashNeeded;
  const moInc = inp.annualIncome / 12;
  const monthlyTotal = tgt + inp.rentersInsurance + inp.otherDebts;
  const rentBurden = moInc > 0 ? tgt / moInc * 100 : 0;
  const totalDTI = moInc > 0 ? monthlyTotal / moInc * 100 : 0;
  return {
    firstMonth, secDeposit, brokerFee, totalAtSigning, reserveBuffer, totalCashNeeded,
    moveInSurplus, reserveSurplus, moInc, monthlyTotal, rentBurden, totalDTI,
  };
}
