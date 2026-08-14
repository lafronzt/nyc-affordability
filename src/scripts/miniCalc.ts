/* ============================================================
   Client-side "run your own number" widget wiring for the income/
   rent-price/buy-price landing pages. Recomputes the page's own
   result-value fields live as the visitor edits the input, reusing
   the same build-time engine (src/lib/afford.ts) — those functions
   have no DOM/Node dependency, so they import cleanly here too.
   One widget per page in this pass; ids below are page-scoped, not
   deduplicated for multiple instances.
   ============================================================ */
import { maxAffordableRent, maxAffordablePrice, requiredIncomeForPrice, requiredIncomeForRent } from '../lib/afford';
import { fmtMoney } from '../lib/format';

type Mode = 'income' | 'buy-price' | 'rent-price';

function setText(id: string, value: number) {
  const el = document.getElementById(id);
  if (el) el.textContent = fmtMoney(value);
}

export function wireMiniCalc() {
  const input = document.getElementById('mini-calc-input') as HTMLInputElement | null;
  if (!input) return;
  const mode = input.dataset.mode as Mode | undefined;
  if (!mode) return;

  input.addEventListener('input', () => {
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < 0) return;

    if (mode === 'income') {
      setText('result-rent', maxAffordableRent({ annualIncome: value }).maxRent);
      setText('result-coop', maxAffordablePrice({ annualIncome: value, propertyType: 'coop' }).maxPrice);
      setText('result-condo', maxAffordablePrice({ annualIncome: value, propertyType: 'condo' }).maxPrice);
    } else if (mode === 'buy-price') {
      setText('result-coop-income', requiredIncomeForPrice({ targetPrice: value, propertyType: 'coop' }).annualIncomeNeeded);
      setText('result-condo-income', requiredIncomeForPrice({ targetPrice: value, propertyType: 'condo' }).annualIncomeNeeded);
    } else if (mode === 'rent-price') {
      setText('result-standard-income', requiredIncomeForRent({ targetRent: value }).annualIncomeNeeded);
      setText('result-guarantor-income', requiredIncomeForRent({ targetRent: value, incomeMultiplier: 80 }).annualIncomeNeeded);
    }
  });
}
