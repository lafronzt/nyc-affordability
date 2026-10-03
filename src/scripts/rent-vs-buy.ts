import {
  defaultRentVsBuyInputs,
  compareRentVsBuy,
  breakEvenRent,
  type RentVsBuyInputs,
  type RentVsBuyResult,
  type PropertyType,
} from '../lib/engines/rentVsBuy';

/* ============================================================
   Rent vs buy page script
   ============================================================
   Math: ../lib/engines/rentVsBuy.ts (tested in test/rentVsBuy.test.ts).
   Input precedence: URL query > this page's saved inputs (only with
   "Save inputs" on) > the example below. Nothing here is personal
   (no income, balances, or debts), so the share link carries the whole
   scenario.
   ============================================================ */

const LS_KEY = 'nyc_rent_vs_buy_inputs';
const $ = (id: string) => document.getElementById(id);
const $in = (id: string) => document.getElementById(id) as HTMLInputElement;
const money = (n: number) => (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
const paren = (n: number) => (n < 0 ? `(${money(-n)})` : money(n));
const num = (v: string | null | undefined) => {
  const n = Number(v);
  return v !== null && v !== undefined && v !== '' && isFinite(n) ? n : null;
};
const typeFrom = (v: unknown): PropertyType => (v === 'coop' ? 'coop' : 'condo');
const yrs = (n: number) => `${n} year${n === 1 ? '' : 's'}`;

// A plain one-bedroom-ish example: a $700K condo against $4,000/mo rent.
const EXAMPLE = { price: 700_000, monthlyRent: 4_000 };

const FIELDS: [string, keyof RentVsBuyInputs, string][] = [
  ['rb-price', 'price', 'price'], ['rb-rent', 'monthlyRent', 'rent'], ['rb-dp', 'downPaymentPct', 'dp'], ['rb-rate', 'mortgageRate', 'rate'],
  ['rb-charges', 'buildingCharges', 'charges'], ['rb-tax', 'condoPropertyTax', 'tax'], ['rb-ins', 'condoInsurance', 'ins'],
  ['rb-years', 'years', 'years'], ['rb-rentgrowth', 'rentGrowthPct', 'rg'], ['rb-appreciation', 'homeAppreciationPct', 'hpa'],
  ['rb-costgrowth', 'ownerCostGrowthPct', 'cg'], ['rb-upkeep', 'ownerUpkeepPct', 'upkeep'], ['rb-return', 'investmentReturnPct', 'ret'],
  ['rb-rentins', 'rentersInsurance', 'ri'], ['rb-broker', 'sellBrokerPct', 'broker'], ['rb-flip', 'sellFlipTaxPct', 'flip'],
];
const NEGATIVE_OK = new Set<keyof RentVsBuyInputs>(['rentGrowthPct', 'homeAppreciationPct', 'ownerCostGrowthPct', 'investmentReturnPct']);

function initialState(): { state: RentVsBuyInputs; saved: boolean } {
  const params = new URLSearchParams(location.search);
  if ([...params.keys()].length) {
    const s = defaultRentVsBuyInputs(typeFrom(params.get('type')), EXAMPLE);
    for (const [, f, k] of FIELDS) {
      const v = num(params.get(k));
      if (v !== null) (s as unknown as Record<string, number>)[f] = v;
    }
    return { state: clampYears(s), saved: false };
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      return { state: clampYears({ ...defaultRentVsBuyInputs(typeFrom(d.propertyType), EXAMPLE), ...d }), saved: true };
    }
  } catch { /* storage blocked */ }
  return { state: defaultRentVsBuyInputs('condo', EXAMPLE), saved: false };
}

function clampYears(s: RentVsBuyInputs): RentVsBuyInputs {
  s.years = Math.min(30, Math.max(1, Math.round(s.years) || 10));
  return s;
}

let { state, saved } = initialState();

function syncType() {
  const coop = state.propertyType === 'coop';
  document.body.classList.toggle('type-coop', coop);
  document.body.classList.toggle('type-condo', !coop);
  $('rb-charges-label')!.textContent = coop ? 'Monthly maintenance' : 'Monthly common charges';
  $('rb-costgrowth-label')!.textContent = coop ? 'Maintenance increases' : 'Common charge, tax & insurance increases';
}

function writeFields() {
  for (const [id, k] of FIELDS) $in(id).value = String(state[k] ?? '');
  (document.querySelector(`input[name="rb-type"][value="${state.propertyType}"]`) as HTMLInputElement).checked = true;
  syncType();
}

function readFields() {
  for (const [id, k] of FIELDS) {
    const v = num($in(id).value);
    (state as unknown as Record<string, number>)[k] = v === null ? 0 : NEGATIVE_OK.has(k) ? v : Math.max(0, v);
  }
  clampYears(state);
}

function renderAnswer(r: RentVsBuyResult, be30: number | null, beRent: number | null) {
  const last = r.rows[r.rows.length - 1];
  const n = state.years;
  const gap = Math.abs(last.advantage);
  $('rb-years-out')!.textContent = yrs(n);
  $('rb-verdict-label')!.textContent = `After ${yrs(n)}, better off`;
  $('rb-verdict')!.textContent = gap < 500 ? 'About even' : r.buyingWins ? 'Buying' : 'Renting';
  const lead = gap < 500
    ? `After ${yrs(n)} the two paths finish within $500 of each other.`
    : r.buyingWins
      ? `After ${yrs(n)}, buying leaves you about <strong>${money(gap)}</strong> ahead of renting and investing the difference${r.breakEvenYear !== null && r.breakEvenYear < n ? `. Buying pulls ahead in <strong>year ${r.breakEvenYear}</strong>` : ''}.`
      : `After ${yrs(n)}, renting and investing the difference leaves you about <strong>${money(gap)}</strong> ahead of buying.`
        + (be30 !== null ? ` At these assumptions buying catches up in <strong>year ${be30}</strong>, so it pays off only if you'd stay that long.` : ' At these assumptions buying doesn\'t catch up within 30 years.');
  const rentLine = beRent === null ? ''
    : ` Over ${yrs(n)}, buying wins if a comparable apartment rents for more than <strong>${money(beRent)}/mo</strong> (you entered ${money(state.monthlyRent)}).`;
  $('rb-headline')!.innerHTML = lead + rentLine;
  $('rb-own-mo')!.textContent = money(r.ownerMonthlyNow) + '/mo';
  $('rb-rent-mo')!.textContent = money(r.renterMonthlyNow) + '/mo';
  $('rb-upfront')!.textContent = money(r.purchase.upfront);
  $('rb-be-rent')!.textContent = beRent === null ? '—' : money(beRent) + '/mo';
}

function renderBreakdown(r: RentVsBuyResult) {
  const last = r.rows[r.rows.length - 1];
  const n = state.years;
  $('rb-bd-years')!.textContent = yrs(n);
  const dash = '<td class="num">&mdash;</td>';
  const cell = (v: number) => `<td class="num${v < 0 ? ' neg' : ''}">${paren(v)}</td>`;
  const row = (label: string, sub: string, buy: string, rent: string, cls = '') =>
    `<tr${cls ? ` class="${cls}"` : ''}><th scope="row">${label}${sub ? `<span class="sub">${sub}</span>` : ''}</th>${buy}${rent}</tr>`;
  const coop = state.propertyType === 'coop';
  $('rb-breakdown')!.innerHTML = [
    row('Cash at closing', `Down payment ${money(r.purchase.downPayment)} + closing costs ${money(r.purchase.closingCosts)}. The renter invests this instead.`, cell(r.purchase.upfront), dash),
    row('Housing bills paid', coop ? 'Mortgage, PMI, maintenance, repairs vs. rent and renter\'s insurance' : 'Mortgage, PMI, common charges, tax, insurance, repairs vs. rent and renter\'s insurance', cell(last.buyerPaid - r.purchase.upfront), cell(last.renterPaid)),
    row(`Home sold for (year ${n})`, `${state.homeAppreciationPct}%/yr from ${money(state.price)}`, cell(last.homeValue), dash),
    row('Loan paid off at sale', '', cell(-last.loanBalance), dash),
    row('Selling costs', coop ? 'Broker, NYC + NYS transfer tax, flip tax, transfer fee, attorney, title' : 'Broker, NYC + NYS transfer tax, attorney, title', cell(-last.sellingCosts), dash),
    row('Investments', 'Cash not spent on housing, invested at ' + state.investmentReturnPct + '%/yr', cell(last.buyerInvestments), cell(last.renterNetWorth)),
    row('Net worth from this decision', '', cell(last.buyerNetWorth), cell(last.renterNetWorth), 'total'),
  ].join('');
}

// ---- chart ----
const NS = 'http://www.w3.org/2000/svg';
const BUY = '#eb6834';
const RENT = '#2a78d6';

function niceStep(span: number) {
  const raw = span / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
}
const short$ = (v: number) => {
  if (v === 0) return '$0';
  const a = Math.abs(v), sign = v < 0 ? '−' : '';
  return a >= 1e6 ? `${sign}$${(a / 1e6).toFixed(a % 1e6 === 0 ? 0 : 1)}M` : `${sign}$${Math.round(a / 1000)}K`;
};

function renderChart(r: RentVsBuyResult) {
  const svg = $('rb-chart') as unknown as SVGSVGElement;
  const wrap = $('rb-chart-wrap')!;
  const W = wrap.clientWidth || 800;
  const H = svg.clientHeight || 300;
  const pad = { l: 60, r: 64, t: 12, b: 26 };
  const rows = r.rows;
  const n = rows.length;
  const buy = rows.map((x) => x.buyerNetWorth);
  const rent = rows.map((x) => x.renterNetWorth);
  const lo = Math.min(0, ...buy, ...rent);
  const hi = Math.max(...buy, ...rent, 1);
  const step = niceStep((hi - lo) * 1.05);
  const bottom = Math.floor(lo / step) * step;
  const top = Math.ceil((hi * 1.05) / step) * step;
  // Year 1 at the left edge; a single year still gets a visible point.
  const x = (i: number) => pad.l + (n === 1 ? 0.5 : i / (n - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - bottom) / (top - bottom)) * (H - pad.t - pad.b);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = '';
  const el = (tag: string, attrs: Record<string, string | number>, text?: string) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    if (text !== undefined) e.textContent = text;
    svg.appendChild(e);
    return e;
  };
  for (let v = bottom; v <= top + 1; v += step) {
    el('line', { class: v === 0 && bottom < 0 ? 'zero' : 'grid', x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v) });
    el('text', { class: 'axis-label', x: pad.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, short$(v));
  }
  const tickEvery = n > 20 ? 5 : n > 10 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const year = rows[i].year;
    if (year % tickEvery !== 0) continue;
    el('text', { class: 'axis-label', x: x(i), y: H - 6, 'text-anchor': n === 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' }, `Yr ${year}`);
  }
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  el('path', { class: 'series s-rent', d: path(rent) });
  el('path', { class: 'series s-buy', d: path(buy) });
  if (n === 1) {
    el('circle', { class: 'dot', cx: x(0), cy: y(rent[0]), r: 4, fill: RENT });
    el('circle', { class: 'dot', cx: x(0), cy: y(buy[0]), r: 4, fill: BUY });
  }

  // Direct labels at the right end, nudged apart if they collide.
  const ends = [{ v: buy[n - 1], text: 'Buy' }, { v: rent[n - 1], text: 'Rent' }].sort((a, b) => b.v - a.v);
  let lastY = -Infinity;
  for (const e of ends) {
    let ly = y(e.v) + 4;
    if (ly - lastY < 14) ly = lastY + 14;
    lastY = ly;
    el('text', { class: 'direct-label', x: W - pad.r + 8, y: ly }, e.text);
  }
  if (r.breakEvenYear !== null && r.breakEvenYear > 1) {
    const i = r.breakEvenYear - 1;
    el('circle', { class: 'dot', cx: x(i), cy: y(buy[i]), r: 5, fill: BUY });
  }

  const cross = el('line', { class: 'crosshair', y1: pad.t, y2: H - pad.b, x1: 0, x2: 0, visibility: 'hidden' });
  const tip = $('rb-tooltip')!;
  const show = (i: number) => {
    i = Math.max(0, Math.min(n - 1, i));
    cross.setAttribute('x1', String(x(i)));
    cross.setAttribute('x2', String(x(i)));
    cross.setAttribute('visibility', 'visible');
    const line = (label: string, color: string, v: number) => `<div class="tt-row"><span><i class="sw" style="background:${color}"></i>${label}</span><b>${money(v)}</b></div>`;
    const d = buy[i] - rent[i];
    tip.innerHTML = `<div class="tt-date">End of year ${rows[i].year}</div>${line('Buy', BUY, buy[i])}${line('Rent', RENT, rent[i])}<div class="tt-row"><span>${d >= 0 ? 'Buying ahead by' : 'Renting ahead by'}</span><b>${money(Math.abs(d))}</b></div>`;
    tip.hidden = false;
    const left = x(i) + 12 + 200 > W ? x(i) - 12 - 200 : x(i) + 12;
    tip.style.left = `${Math.max(0, left)}px`;
    tip.style.top = `${pad.t}px`;
  };
  const hide = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); };
  const toIndex = (clientX: number) => {
    const b = svg.getBoundingClientRect();
    return n === 1 ? 0 : Math.round(((clientX - b.left) * (W / b.width) - pad.l) / (W - pad.l - pad.r) * (n - 1));
  };
  svg.onpointermove = (e) => show(toIndex(e.clientX));
  svg.onpointerleave = hide;
  svg.setAttribute('tabindex', '0');
  let kb = 0;
  svg.onkeydown = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      kb = Math.max(0, Math.min(n - 1, kb + (e.key === 'ArrowRight' ? 1 : -1)));
      show(kb);
      e.preventDefault();
    }
  };
  svg.onblur = hide;

  const be = r.breakEvenYear === null ? 'Buying stays behind for the whole stay.'
    : r.breakEvenYear === 1 ? 'Buying is ahead from the first year.'
      : `Buying pulls ahead in year ${r.breakEvenYear}.`;
  $('rb-chart-desc')!.textContent = `If you sold at the end of year 1, buying would leave you ${money(buy[0])} against ${money(rent[0])} for renting; by year ${rows[n - 1].year}, ${money(buy[n - 1])} against ${money(rent[n - 1])}. ${be} The early gap is mostly transaction costs: closing costs on the way in and broker plus transfer taxes on the way out. Use the arrow keys on the chart to step through years.`;
  $('rb-table')!.innerHTML = rows.map((x) => `<tr><td>${x.year}</td><td class="num">${money(x.homeValue)}</td><td class="num">${money(x.loanBalance)}</td><td class="num">${money(x.saleProceeds)}</td><td class="num">${money(x.buyerNetWorth)}</td><td class="num">${money(x.renterNetWorth)}</td><td class="num${x.advantage < 0 ? ' neg' : ''}">${paren(x.advantage)}</td></tr>`).join('');
}

function render() {
  const r = compareRentVsBuy(state);
  const be30 = state.years === 30 ? r.breakEvenYear : compareRentVsBuy({ ...state, years: 30 }).breakEvenYear;
  renderAnswer(r, be30, breakEvenRent(state));
  renderBreakdown(r);
  renderChart(r);
}

function persist() {
  if (!$in('save-toggle-cb').checked) return;
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* storage blocked */ }
}

function scenarioLink() {
  const p = new URLSearchParams({ type: state.propertyType });
  for (const [, f, k] of FIELDS) p.set(k, String(state[f]));
  return `${location.origin}${location.pathname}?${p}`;
}

document.addEventListener('DOMContentLoaded', () => {
  writeFields();
  $in('save-toggle-cb').checked = saved;
  render();
  const onChange = () => { readFields(); render(); persist(); };
  for (const [id] of FIELDS) $in(id).addEventListener('input', onChange);
  document.querySelectorAll<HTMLInputElement>('input[name="rb-type"]').forEach((el) => el.addEventListener('change', () => {
    readFields();
    const d = defaultRentVsBuyInputs(typeFrom(el.value));
    state = { ...state, propertyType: d.propertyType, downPaymentPct: d.downPaymentPct, buildingCharges: d.buildingCharges };
    writeFields();
    render();
    persist();
  }));
  $in('save-toggle-cb').addEventListener('change', (e) => {
    if ((e.target as HTMLInputElement).checked) persist();
    else { try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ } }
  });
  const btn = $('rb-share') as HTMLButtonElement;
  btn.addEventListener('click', async () => {
    const url = scenarioLink();
    const label = btn.textContent;
    try { await navigator.clipboard.writeText(url); btn.textContent = 'Link copied'; } catch { window.prompt('Copy this link:', url); }
    setTimeout(() => { btn.textContent = label; }, 2000);
  });
  $('rb-print')!.addEventListener('click', () => window.print());
  let t: number | undefined;
  window.addEventListener('resize', () => { clearTimeout(t); t = window.setTimeout(render, 150); });
});
