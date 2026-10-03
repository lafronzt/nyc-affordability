import { calculateSale as compute, type SaleInputs as Inputs, type SaleWaterfall as Waterfall } from '../lib/engines/sale';
import { fmtMoney } from '../lib/format';
import { wireShareButton } from '../lib/share';

/* ============================================================
   NYC Sale Net Proceeds Calculator
   ============================================================ */

function $(id: string) { return document.getElementById(id); }
function $input(id: string) { return document.getElementById(id) as HTMLInputElement | null; }
function $select(id: string) { return document.getElementById(id) as HTMLSelectElement | null; }

function num(id: string): number {
  const el = $input(id);
  if (!el) return 0;
  const v = parseFloat(el.value);
  return isFinite(v) ? Math.max(0, v) : 0;
}

function setText(id: string, text: string) {
  const el = $(id);
  if (el) el.textContent = text;
}

/** fmtMoney renders negatives as "$-500"; the site convention is "($500)". */
function fmtSigned(n: number): string {
  return n < 0 ? '(' + fmtMoney(Math.abs(n)) + ')' : fmtMoney(n);
}

function readInputs(): Inputs {
  return {
    propertyType: ($select('property-type')?.value as 'condo' | 'coop') || 'condo',
    salePrice: num('sale-price'),
    mortgageBalance: num('mortgage-balance'),
    purchasePrice: num('purchase-price'),
    capImprovements: num('cap-improvements'),
    brokerPct: num('broker-pct'),
    attorneyFee: num('attorney-fee'),
    titleMiscFee: num('title-misc-fee'),
    flipTaxPct: num('flip-tax-pct'),
    coopTransferFee: num('coop-transfer-fee'),
    capGainsEnabled: !!$input('cap-gains-enabled')?.checked,
    filingStatus: ($select('filing-status')?.value as 'single' | 'mfj') || 'single',
    fedLtcgPct: num('fed-ltcg-pct'),
    nyCombinedPct: num('ny-combined-pct'),
  };
}

let lastWaterfall: Waterfall | null = null;

function render() {
  const inp = readInputs();
  const w = compute(inp);
  lastWaterfall = w;

  // Toggle co-op-only fields/rows
  const coopFieldsEl = $('coop-fields');
  if (coopFieldsEl) coopFieldsEl.hidden = !w.isCoop;
  const flipTaxRow = $('fliptax-row');
  if (flipTaxRow) flipTaxRow.hidden = !w.isCoop;
  const coopFeeRow = $('coopfee-row');
  if (coopFeeRow) coopFeeRow.hidden = !w.isCoop;

  // Toggle capital gains detail fields/rows
  const capGainsFieldsEl = $('cap-gains-fields');
  if (capGainsFieldsEl) capGainsFieldsEl.hidden = !inp.capGainsEnabled;
  const capGainsRow = $('capgains-row');
  if (capGainsRow) capGainsRow.hidden = !inp.capGainsEnabled;

  // Auto-calculated transfer tax display (Card 3)
  setText('rptt-display', fmtMoney(w.rptt));
  setText('nys-transfer-display', fmtMoney(w.nysTax));

  // Waterfall
  setText('s-price', fmtMoney(w.salePrice));
  setText('s-mortgage', '(' + fmtMoney(w.mortgageBalance) + ')');
  setText('s-broker', '(' + fmtMoney(w.brokerFee) + ')');
  setText('s-rptt', '(' + fmtMoney(w.rptt) + ')');
  setText('s-nys', '(' + fmtMoney(w.nysTax) + ')');
  setText('s-fliptax', '(' + fmtMoney(w.flipTax) + ')');
  setText('s-coopfee', '(' + fmtMoney(w.coopFee) + ')');
  setText('s-attorney', '(' + fmtMoney(w.attorneyFee) + ')');
  setText('s-titlemisc', '(' + fmtMoney(w.titleMiscFee) + ')');
  setText('s-subtotal', fmtSigned(w.netBeforeTax));
  setText('s-gain', '(' + fmtMoney(w.capGainsTax) + ')');
  setText('s-taxable-gain', fmtMoney(w.taxableGain));
  setText('s-exclusion', fmtMoney(w.exclusion));

  // Hero
  const heroEl = $('hero-net');
  if (heroEl) {
    heroEl.textContent = fmtSigned(w.netProceeds);
    heroEl.classList.toggle('zero', w.netProceeds < 0);
  }
  const warnEl = $('hero-warn');
  if (warnEl) {
    if (w.netProceeds < 0) {
      warnEl.textContent = 'Estimated proceeds are negative; you would need to bring cash to closing to cover the shortfall.';
      warnEl.style.display = 'block';
    } else {
      warnEl.style.display = 'none';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const fieldIds = [
    'property-type', 'sale-price', 'mortgage-balance', 'purchase-price', 'cap-improvements',
    'broker-pct', 'attorney-fee', 'title-misc-fee', 'flip-tax-pct', 'coop-transfer-fee',
    'cap-gains-enabled', 'filing-status', 'fed-ltcg-pct', 'ny-combined-pct',
  ];
  fieldIds.forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });

  // Collapsible input cards
  for (let i = 1; i <= 4; i++) {
    const titleEl = $(`card-title-${i}`);
    const bodyEl = $(`card-body-${i}`);
    if (!titleEl || !bodyEl) continue;
    titleEl.addEventListener('click', () => {
      const isOpen = !bodyEl.classList.contains('collapsed');
      if (isOpen) {
        bodyEl.classList.add('collapsed');
        titleEl.setAttribute('aria-expanded', 'false');
        titleEl.querySelector('.card-chev')?.classList.add('open');
      } else {
        bodyEl.classList.remove('collapsed');
        titleEl.setAttribute('aria-expanded', 'true');
        titleEl.querySelector('.card-chev')?.classList.remove('open');
      }
    });
  }

  // "How this works" collapsible
  const howBtn = $('how-btn');
  const howBody = $('how-body');
  if (howBtn && howBody) {
    howBtn.addEventListener('click', () => {
      howBtn.classList.toggle('open');
      howBody.classList.toggle('open');
    });
  }

  // Share result
  wireShareButton('sell-share', () => {
    const w = lastWaterfall;
    const text = w
      ? `My NYC sale net proceeds estimate: ${fmtSigned(w.netProceeds)}`
      : 'My NYC sale net proceeds estimate';
    return { title: 'My NYC Sale Net Proceeds', text, url: 'https://www.nyc-affordability.com/sell/' };
  });

  render();
});
