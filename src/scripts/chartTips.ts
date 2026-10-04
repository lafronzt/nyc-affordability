/* One tooltip for every chart mark carrying data-tip="Value|line|line".
   Hover and keyboard focus show the same readout. The tooltip only repeats
   what the table view already shows; it never gates a value. Text goes in
   with textContent, never innerHTML. */
const tip = document.createElement('div');
tip.className = 'chart-tip';
tip.setAttribute('role', 'tooltip');
tip.hidden = true;
document.body.append(tip);

let current: HTMLElement | null = null;

function fill(el: HTMLElement) {
  const [value, ...rest] = (el.dataset.tip ?? '').split('|');
  const strong = document.createElement('strong');
  strong.textContent = value;
  tip.replaceChildren(strong, ...rest.map((line) => {
    const span = document.createElement('span');
    span.textContent = line;
    return span;
  }));
}

function place(x: number, y: number) {
  const pad = 12;
  const { width, height } = tip.getBoundingClientRect();
  const left = Math.min(Math.max(8, x + pad), window.innerWidth - width - 8);
  const top = y + pad + height > window.innerHeight - 8 ? y - height - pad : y + pad;
  tip.style.left = `${left}px`;
  tip.style.top = `${Math.max(8, top)}px`;
}

function show(el: HTMLElement, x: number, y: number) {
  if (current !== el) { current?.classList.remove('is-active'); current = el; el.classList.add('is-active'); fill(el); }
  tip.hidden = false;
  place(x, y);
}

function hide() {
  current?.classList.remove('is-active');
  current = null;
  tip.hidden = true;
}

document.addEventListener('pointermove', (e) => {
  const el = (e.target as Element | null)?.closest<HTMLElement>('[data-tip]');
  if (el) show(el, e.clientX, e.clientY);
  else if (current && document.activeElement !== current) hide();
});
document.addEventListener('pointerleave', hide);
document.addEventListener('focusin', (e) => {
  const el = (e.target as Element | null)?.closest<HTMLElement>('[data-tip]');
  if (!el) return;
  const r = el.getBoundingClientRect();
  show(el, r.left + r.width / 2, r.bottom - 4);
});
document.addEventListener('focusout', hide);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
window.addEventListener('scroll', () => { if (current && document.activeElement !== current) hide(); }, { passive: true });
