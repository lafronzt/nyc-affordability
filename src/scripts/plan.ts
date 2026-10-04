/* ============================================================
   /plan/: render My NYC Plan from what's saved in this browser
   ============================================================
   All numbers and sentences come from src/lib/plan.ts (tested in
   test/plan.test.ts); this file reads localStorage, fills the page with
   textContent, and re-renders when another tab saves. It never writes.
   ============================================================ */

import { snapshot, type StorageLike } from '../lib/profileStore.ts';
import { buildPlan, type PathPlan } from '../lib/plan.ts';

const money = (n: number) => (isFinite(n) ? '$' + Math.round(n).toLocaleString('en-US') : '-');

function storage(): StorageLike | null {
  try { return window.localStorage; } catch { return null; }
}

function setText(el: Element | null, text: string) {
  if (el) el.textContent = text;
}

function renderPath(p: PathPlan) {
  const card = document.getElementById(`path-${p.path}`);
  if (!card) return;
  const f = (name: string) => card.querySelector(`[data-f="${name}"]`);
  const rent = p.path === 'rent';
  setText(f('max'), money(p.ceiling.max));
  setText(f('max-label'), rent ? '/mo max rent' : ' max price');
  const limit = f('limit');
  if (limit) {
    limit.textContent = p.ceiling.limit === 'income' ? 'Limited by income' : 'Limited by cash';
    limit.className = `limit ${p.ceiling.limit === 'income' ? 'is-income' : 'is-cash'}`;
  }
  setText(f('why'), p.why);
  setText(f('other'), p.other ?? '');
  setText(f('lift'), p.lift ?? '');
  const list = f('steps');
  if (list) {
    const items = p.steps.map((s) => {
      const li = document.createElement('li');
      const gain = document.createElement('span');
      gain.className = 'gain';
      gain.textContent = `+${money(s.delta)}${rent ? '/mo' : ''}`;
      const then = s.capped ? `, then ${p.ceiling.limit === 'income' ? 'cash' : 'income'} is the limit` : '';
      li.append(`${s.label}: `, gain, ` (to ${money(s.after)}${rent ? '/mo' : ''}${then})`);
      return li;
    });
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'none';
      li.textContent = 'None of the usual single changes move this one much.';
      items.push(li);
    }
    list.replaceChildren(...items);
  }
}

function render() {
  const s = storage();
  const plan = buildPlan(s ? snapshot(s) : {});
  const m = plan.model;
  (document.getElementById('sample-note') as HTMLElement).hidden = m.profile !== 'sample';
  setText(document.getElementById('p-income'), money(m.base.annualIncome) + '/yr');
  setText(document.getElementById('p-debts'), money(m.base.otherDebts) + '/mo');
  setText(document.getElementById('p-cash'), money(plan.cash));
  const dflt = (['rent', 'coop', 'condo'] as const).filter((k) => m.assumptions[k] === 'default').map((k) => (k === 'coop' ? 'co-op' : k));
  const note = document.getElementById('defaults-note') as HTMLElement;
  note.hidden = !dflt.length;
  // Name the default rate as the example, since it changes weekly.
  const rateFrom = m.assumptions.coop === 'default' ? m.asmp.coop : m.assumptions.condo === 'default' ? m.asmp.condo : null;
  note.textContent = dflt.length
    ? `You haven't saved ${dflt.length === 3 ? 'any calculator assumptions' : `${dflt.join(' or ')} assumptions`}, so ${dflt.length === 1 ? 'that path uses' : 'those paths use'} the site defaults${rateFrom ? `, including today's ${rateFrom.mortgageRate}% mortgage rate` : ''}.`
    : '';
  plan.paths.forEach(renderPath);
}

render();
window.addEventListener('storage', render);
