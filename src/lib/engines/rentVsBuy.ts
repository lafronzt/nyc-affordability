import { calculateCoop } from './coop.ts';
import { calculateCondo } from './condo.ts';
import { coopInputsFromDefaults, condoInputsFromDefaults } from './defaults.ts';
import { calculateSale } from './sale.ts';
import { ASSUMPTIONS as A } from '../../data/assumptions.ts';

/* ============================================================
   NYC rent vs buy (pure, DOM-free)
   ============================================================
   Two people with the same money. One buys a co-op or condo; the other
   keeps renting and invests the cash the buyer spent at closing. Each
   month, whoever has the cheaper housing bill invests the difference.
   At the end of each year we ask: if the buyer sold now (paying the NYC
   seller costs /sell/ shows), who has more?

   Purchase cash and the monthly mortgage come from the shared co-op/condo
   engines at the chosen price; the sale comes from the shared sale engine.
   Everything else is a plain monthly projection.

   Deliberately left out (the page says so): income taxes in both
   directions (mortgage-interest and property-tax deductions, tax on
   investment gains, capital gains on the sale), refinancing, assessments,
   and the co-op move-in deposit coming back.
   ============================================================ */

export type PropertyType = 'coop' | 'condo';

export interface RentVsBuyInputs {
  propertyType: PropertyType;
  price: number;
  downPaymentPct: number;
  mortgageRate: number;
  loanTermYears: number;
  /** Co-op maintenance or condo common charges, today. */
  buildingCharges: number;
  /** Condo only; co-op maintenance already includes the building's tax. */
  condoPropertyTax: number;
  condoInsurance: number;
  monthlyRent: number;
  rentersInsurance: number;
  years: number;
  rentGrowthPct: number;
  homeAppreciationPct: number;
  ownerCostGrowthPct: number;
  /** In-unit repairs per year, % of the home's current value. */
  ownerUpkeepPct: number;
  investmentReturnPct: number;
  sellBrokerPct: number;
  sellAttorneyFee: number;
  sellTitleMiscFee: number;
  sellFlipTaxPct: number;
  sellCoopTransferFee: number;
}

export function defaultRentVsBuyInputs(type: PropertyType, overrides: Partial<RentVsBuyInputs> = {}): RentVsBuyInputs {
  const coop = type === 'coop';
  return {
    propertyType: type,
    price: 0,
    downPaymentPct: coop ? A.coopDownPaymentPct.value : A.condoDownPaymentPct.value,
    mortgageRate: A.mortgageRatePct.value,
    loanTermYears: A.loanTermYears.value,
    buildingCharges: coop ? A.coopMaintenanceMo.value : A.condoCommonChargesMo.value,
    condoPropertyTax: A.condoPropertyTaxMo.value,
    condoInsurance: A.condoInsuranceMo.value,
    monthlyRent: 0,
    rentersInsurance: A.rentersInsuranceMo.value,
    years: 10,
    rentGrowthPct: A.rentGrowthPct.value,
    homeAppreciationPct: A.homeAppreciationPct.value,
    ownerCostGrowthPct: A.ownerCostGrowthPct.value,
    ownerUpkeepPct: A.ownerUpkeepPct.value,
    investmentReturnPct: A.investmentReturnPct.value,
    sellBrokerPct: A.sellBrokerPct.value,
    sellAttorneyFee: A.sellAttorneyFee.value,
    sellTitleMiscFee: A.sellTitleMiscFee.value,
    sellFlipTaxPct: A.sellCoopFlipTaxPct.value,
    sellCoopTransferFee: A.sellCoopTransferFee.value,
    ...overrides,
  };
}

export interface Purchase {
  downPayment: number;
  /** Closing costs including mansion tax (and mortgage recording tax for condos). */
  closingCosts: number;
  /** Cash out the door at closing. The renter invests this instead. */
  upfront: number;
  loanAmount: number;
  /** Principal + interest. */
  monthlyPI: number;
  /** Starts at the engine's PMI; drops off once the balance reaches 78% of the price. */
  monthlyPmi: number;
}

/** What it takes to close, from the shared co-op/condo engine (reserves aren't spent, so they're excluded). */
export function purchaseFor(p: RentVsBuyInputs): Purchase {
  const common = { mortgageRate: p.mortgageRate, loanTerm: p.loanTermYears, dpPct: p.downPaymentPct, targetOverride: p.price };
  if (p.propertyType === 'coop') {
    const r = calculateCoop(coopInputsFromDefaults({ ...common, maint: p.buildingCharges }));
    return { downPayment: r.downPmt, closingCosts: r.totalAtClose - r.downPmt, upfront: r.totalAtClose, loanAmount: r.loanAmt, monthlyPI: r.moMtg, monthlyPmi: r.moPmi };
  }
  const r = calculateCondo(condoInputsFromDefaults({ ...common, commonCharges: p.buildingCharges, propTaxes: p.condoPropertyTax, hoInsurance: p.condoInsurance }));
  return { downPayment: r.downPmt, closingCosts: r.cc.total, upfront: r.totalAtClose, loanAmount: r.loanAmt, monthlyPI: r.moMtg, monthlyPmi: r.moPmi };
}

export interface YearRow {
  year: number;
  homeValue: number;
  loanBalance: number;
  /** Seller costs if sold at the end of this year. */
  sellingCosts: number;
  /** Cash from the sale after paying off the loan and seller costs. */
  saleProceeds: number;
  /** The buyer's side investments (months when owning was cheaper than renting). */
  buyerInvestments: number;
  buyerNetWorth: number;
  renterNetWorth: number;
  /** Buyer minus renter. Positive = buying is ahead. */
  advantage: number;
  /** Totals paid so far, including the upfront cash for the buyer. */
  buyerPaid: number;
  renterPaid: number;
  /** Housing bill in the last month of the year. */
  ownerMonthly: number;
  renterMonthly: number;
}

export interface RentVsBuyResult {
  purchase: Purchase;
  /** Housing bill in month 1, each side. */
  ownerMonthlyNow: number;
  renterMonthlyNow: number;
  rows: YearRow[];
  /** First year-end at which the buyer is ahead, or null if never within the horizon. */
  breakEvenYear: number | null;
  /** Buyer is ahead at the horizon. */
  buyingWins: boolean;
}

const yearsElapsed = (m: number) => Math.floor((m - 1) / 12); // month 1..12 -> 0
const monthlyFromAnnual = (pct: number) => Math.pow(1 + pct / 100, 1 / 12) - 1;

export function compareRentVsBuy(p: RentVsBuyInputs): RentVsBuyResult {
  const purchase = purchaseFor(p);
  const isCoop = p.propertyType === 'coop';
  const r = p.mortgageRate / 100 / 12;
  const n = p.loanTermYears * 12;
  const invest = monthlyFromAnnual(p.investmentReturnPct);
  const appreciate = monthlyFromAnnual(p.homeAppreciationPct);
  const pmiOffAt = p.price * 0.78;
  const ownerFixed = p.buildingCharges + (isCoop ? 0 : p.condoPropertyTax + p.condoInsurance);
  const months = Math.max(1, Math.round(p.years)) * 12;

  let balance = purchase.loanAmount;
  let value = p.price;
  let renterPortfolio = purchase.upfront;
  let buyerPortfolio = 0;
  let buyerPaid = purchase.upfront;
  let renterPaid = 0;
  let ownerMonthly = 0;
  let renterMonthly = 0;
  let ownerMonthlyNow = 0;
  let renterMonthlyNow = 0;
  const rows: YearRow[] = [];

  for (let m = 1; m <= months; m++) {
    const y = yearsElapsed(m);
    // Mortgage payment, while there's a loan.
    let pi = 0;
    if (balance > 0 && m <= n) {
      const interest = balance * r;
      pi = Math.min(purchase.monthlyPI, balance + interest);
      balance = Math.max(0, balance - (pi - interest));
    }
    const pmi = balance > pmiOffAt ? purchase.monthlyPmi : 0;
    const upkeep = value * (p.ownerUpkeepPct / 100) / 12;
    ownerMonthly = pi + pmi + ownerFixed * Math.pow(1 + p.ownerCostGrowthPct / 100, y) + upkeep;
    renterMonthly = (p.monthlyRent + p.rentersInsurance) * Math.pow(1 + p.rentGrowthPct / 100, y);
    if (m === 1) { ownerMonthlyNow = ownerMonthly; renterMonthlyNow = renterMonthly; }

    renterPortfolio *= 1 + invest;
    buyerPortfolio *= 1 + invest;
    const diff = ownerMonthly - renterMonthly;
    if (diff > 0) renterPortfolio += diff; else buyerPortfolio -= diff;
    buyerPaid += ownerMonthly;
    renterPaid += renterMonthly;
    value *= 1 + appreciate;

    if (m % 12 === 0) {
      const sale = calculateSale({
        propertyType: p.propertyType, salePrice: value, mortgageBalance: balance, purchasePrice: p.price, capImprovements: 0,
        brokerPct: p.sellBrokerPct, attorneyFee: p.sellAttorneyFee, titleMiscFee: p.sellTitleMiscFee,
        flipTaxPct: p.sellFlipTaxPct, coopTransferFee: p.sellCoopTransferFee,
        capGainsEnabled: false, filingStatus: 'single', fedLtcgPct: 0, nyCombinedPct: 0,
      });
      const buyerNetWorth = sale.netProceeds + buyerPortfolio;
      rows.push({
        year: m / 12, homeValue: value, loanBalance: balance, sellingCosts: sale.sellingCosts, saleProceeds: sale.netProceeds,
        buyerInvestments: buyerPortfolio, buyerNetWorth, renterNetWorth: renterPortfolio,
        advantage: buyerNetWorth - renterPortfolio, buyerPaid, renterPaid, ownerMonthly, renterMonthly,
      });
    }
  }

  const ahead = rows.find((row) => row.advantage >= 0);
  return {
    purchase, ownerMonthlyNow, renterMonthlyNow, rows,
    breakEvenYear: ahead ? ahead.year : null,
    buyingWins: rows[rows.length - 1].advantage >= 0,
  };
}

/**
 * The starting rent at which renting and buying come out even at the
 * horizon. Above it, buying wins; below it, renting does. null if there's
 * no tie between $0 and $100,000/month (e.g. buying wins even at $0 rent).
 */
export function breakEvenRent(p: RentVsBuyInputs): number | null {
  const adv = (rent: number) => {
    const rows = compareRentVsBuy({ ...p, monthlyRent: rent }).rows;
    return rows[rows.length - 1].advantage;
  };
  let lo = 0;
  let hi = 100000;
  if (adv(lo) >= 0 || adv(hi) < 0) return null;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (adv(mid) >= 0) hi = mid; else lo = mid;
  }
  return hi;
}
