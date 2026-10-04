/* ============================================================
   Parsers for the scheduled data-update jobs (.github/workflows/data-*.yml)
   ============================================================
   Pure functions, so they're tested against saved copies of the real
   source formats (test/sourceParsers.test.ts). The jobs only ever open a
   pull request: a person reviews every change before it reaches the site.
   Each parser throws when the source doesn't look the way we expect,
   rather than guessing, so a format change fails the job loudly.
   ============================================================ */

export interface PmmsWeek {
  /** Survey week, ISO YYYY-MM-DD. */
  date: string;
  /** 30-year fixed average, percent. */
  rate30: number;
}

/** Freddie Mac PMMS_history.csv: `date,pmms30,...` with M/D/YYYY dates. Returns the latest week with a 30-year rate. */
export function parsePmmsCsv(csv: string): PmmsWeek {
  const lines = csv.trim().split(/\r?\n/);
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const di = header.indexOf('date');
  const ri = header.indexOf('pmms30');
  if (di < 0 || ri < 0) throw new Error(`PMMS CSV header changed: ${lines[0]}`);
  for (let i = lines.length - 1; i > 0; i--) {
    const cells = lines[i].split(',');
    const rate = Number(cells[ri]);
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((cells[di] ?? '').trim());
    if (!m || !cells[ri]?.trim() || !Number.isFinite(rate)) continue;
    if (rate <= 0 || rate > 25) throw new Error(`PMMS 30-year rate out of range: ${rate}`);
    const date = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    return { date, rate30: rate };
  }
  throw new Error('No PMMS row with a 30-year rate');
}

export interface HpdAmi {
  year: number;
  /** 100% AMI by household size 1-8. */
  base: Record<number, number>;
}

const text = (html: string) => html
  .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ');

/**
 * NYC HPD's Area Median Income page: "The 2026 AMI for the New York City
 * region is ..." and a chart whose header row runs "FAMILY SIZE 20% 30% ...
 * 100% ..." followed by one row per household size.
 */
export function parseHpdAmiPage(html: string): HpdAmi {
  const t = text(html);
  const y = /The (\d{4}) AMI for the New York City region/i.exec(t);
  if (!y) throw new Error('HPD AMI page: year sentence not found');
  // The chart's header row: "FAMILY SIZE 20% 30% ... 175%". (The instructions
  // above it also say "family size", so match the header with its columns.)
  const headerMatch = /FAMILY SIZE((?:\s+\d+%)+)/i.exec(t);
  if (!headerMatch) throw new Error('HPD AMI page: chart header not found');
  const after = t.slice(headerMatch.index);
  const cols = headerMatch[1].trim().split(/\s+/);
  const col100 = cols.indexOf('100%');
  if (col100 < 0) throw new Error('HPD AMI page: no 100% column');
  const body = after.slice(headerMatch[0].length);
  const base: Record<number, number> = {};
  for (let size = 1; size <= 8; size++) {
    const row = new RegExp(`\\s${size}((?:\\s+\\$[\\d,]+){${cols.length}})`).exec(body);
    if (!row) throw new Error(`HPD AMI page: row for household size ${size} not found`);
    const values = row[1].trim().split(/\s+/).map((v) => Number(v.replace(/[$,]/g, '')));
    base[size] = values[col100];
  }
  // Sanity: household sizes rise, and 1-person is about 70% of 4-person.
  for (let s = 2; s <= 8; s++) if (!(base[s] > base[s - 1])) throw new Error('HPD AMI page: values not increasing by household size');
  const ratio = base[1] / base[4];
  if (ratio < 0.65 || ratio > 0.75) throw new Error(`HPD AMI page: unexpected 1- to 4-person ratio ${ratio.toFixed(3)}`);
  return { year: Number(y[1]), base };
}

/** Set the `value` attribute of the <input> with this id, leaving the rest of the tag alone. */
export function setInputValue(src: string, id: string, value: string): { src: string; changed: boolean } {
  const re = new RegExp(`(<input\\b[^>]*\\bid="${id}"[^>]*>)`);
  const m = re.exec(src);
  if (!m) return { src, changed: false };
  const tag = m[1];
  if (!/\bvalue="[^"]*"/.test(tag)) throw new Error(`<input id="${id}"> has no value attribute`);
  const next = tag.replace(/\bvalue="[^"]*"/, `value="${value}"`);
  return { src: src.replace(tag, next), changed: next !== tag };
}
