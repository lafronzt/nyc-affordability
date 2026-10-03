import { calcNycRptt, calcNysTransferTax } from '../calc.ts';

/* ============================================================
   NYC sale net proceeds (pure, DOM-free)
   ============================================================
   Moved verbatim from src/scripts/sell.ts so /rent-vs-buy/ can price the
   buyer's eventual sale with the same waterfall /sell/ shows. Seller pays
   broker, NYC RPTT, NYS transfer tax, attorney and title/misc; co-op
   sellers also pay the flip tax and the building's transfer fee.
   ============================================================ */

export interface SaleInputs {
  propertyType: 'condo' | 'coop';
  salePrice: number;
  mortgageBalance: number;
  purchasePrice: number;
  capImprovements: number;
  brokerPct: number;
  attorneyFee: number;
  titleMiscFee: number;
  flipTaxPct: number;
  coopTransferFee: number;
  capGainsEnabled: boolean;
  filingStatus: 'single' | 'mfj';
  fedLtcgPct: number;
  nyCombinedPct: number;
}

export interface SaleWaterfall {
  salePrice: number;
  mortgageBalance: number;
  brokerFee: number;
  rptt: number;
  nysTax: number;
  flipTax: number;
  coopFee: number;
  attorneyFee: number;
  titleMiscFee: number;
  sellingCosts: number;
  netBeforeTax: number;
  amountRealized: number;
  adjustedBasis: number;
  exclusion: number;
  taxableGain: number;
  capGainsTax: number;
  netProceeds: number;
  isCoop: boolean;
}

export function calculateSale(inp: SaleInputs): SaleWaterfall {
  const isCoop = inp.propertyType === 'coop';
  const brokerFee = inp.salePrice * (inp.brokerPct || 0) / 100;
  const rptt = calcNycRptt(inp.salePrice);
  const nysTax = calcNysTransferTax(inp.salePrice);
  const flipTax = isCoop ? inp.salePrice * (inp.flipTaxPct || 0) / 100 : 0;
  const coopFee = isCoop ? (inp.coopTransferFee || 0) : 0;
  const sellingCosts = brokerFee + rptt + nysTax + flipTax + coopFee + inp.attorneyFee + inp.titleMiscFee;
  const netBeforeTax = inp.salePrice - inp.mortgageBalance - sellingCosts;

  const amountRealized = inp.salePrice - sellingCosts;
  const adjustedBasis = inp.purchasePrice + inp.capImprovements;
  const rawGain = Math.max(0, amountRealized - adjustedBasis);
  const exclusion = inp.filingStatus === 'mfj' ? 500000 : 250000;
  const taxableGain = inp.capGainsEnabled ? Math.max(0, rawGain - exclusion) : 0;
  const combinedRate = ((inp.fedLtcgPct || 0) + (inp.nyCombinedPct || 0)) / 100;
  const capGainsTax = inp.capGainsEnabled ? taxableGain * combinedRate : 0;

  const netProceeds = netBeforeTax - capGainsTax;

  return {
    salePrice: inp.salePrice,
    mortgageBalance: inp.mortgageBalance,
    brokerFee,
    rptt,
    nysTax,
    flipTax,
    coopFee,
    attorneyFee: inp.attorneyFee,
    titleMiscFee: inp.titleMiscFee,
    sellingCosts,
    netBeforeTax,
    amountRealized,
    adjustedBasis,
    exclusion,
    taxableGain,
    capGainsTax,
    netProceeds,
    isCoop,
  };
}
