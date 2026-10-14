/* Public changelog entries for the scheduled data updates. Each update adds
   one entry to SITE_CHANGES (src/data/siteChanges.ts), modeled on the hand-
   written 6.95% → 7.28% entry, so /methodology/changelog/ records the change
   in the same PR that makes it.
   - `pr` is unknown when the update script runs. The entry is written with
     PR_PLACEHOLDER, and open-pr.sh swaps in the number once the PR exists.
   - `date` is the day the job ran; the report asks the reviewer to move it
     to the merge day if the PR waits.
   - No `logHeading`: change-log.md records hand edits and how they were
     validated, which only the person finishing the PR can write. Pure: no
     file or network access, so test/dataUpdateChangelog.test.ts covers it. */
import type { SiteChange } from '../../src/data/siteChanges.ts';

/** Written as `pr: null, <this>`; open-pr.sh replaces the pair with `pr: <number>,`. */
export const PR_PLACEHOLDER = '// data-update: PR number';

/** Pages that compute at the default mortgage rate (same as the 7.28% entry). */
export const RATE_AFFECTS = ['/coop/', '/condo/', '/compare/', '/buy/', '/income/', '/neighborhoods/', '/affordability-index/'];
/** Pages that show AMI percentages, bands, or the AMI table. */
export const AMI_AFFECTS = ['/affordable/', '/reality-check/', '/data/', '/guides/nyc-ami-housing-connect-explained/'];

/** 2026-10-01 → "October 1, 2026". */
export function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}
/** Rates as Freddie Mac and the guides' tables print them: 7.4 → "7.40%". */
export const pct = (n: number) => `${n.toFixed(2)}%`;
const usd = (n: number) => `$${n.toLocaleString('en-US')}`;

/** Entry for a new default mortgage rate, or null when the rate didn't move (only the survey week did). */
export function rateChangeEntry(o: { oldRate: number; newRate: number; surveyDate: string; date: string }): SiteChange | null {
  if (o.newRate === o.oldRate) return null;
  const up = o.newRate > o.oldRate;
  return {
    date: o.date,
    kind: 'data',
    title: `Default mortgage rate ${pct(o.oldRate)} → ${pct(o.newRate)}`,
    summary: `Freddie Mac's weekly survey put the 30-year fixed at ${pct(o.newRate)} as of ${longDate(o.surveyDate)}. Every calculator and pre-built page now starts from that rate, and guide worked examples were recomputed at it. ${up ? 'Higher rates lower what income supports.' : 'Lower rates raise what income supports.'}`,
    affects: RATE_AFFECTS,
    pr: null,
  };
}

/** Entry for a new or revised HPD AMI chart, or null when nothing changed. */
export function amiChangeEntry(o: {
  oldYear: number; newYear: number;
  oldBase: Record<number, number>; newBase: Record<number, number>;
  date: string;
}): SiteChange | null {
  const sizes = [1, 2, 3, 4, 5, 6, 7, 8];
  if (o.newYear === o.oldYear && sizes.every((s) => o.oldBase[s] === o.newBase[s])) return null;
  const sameYear = o.newYear === o.oldYear;
  const move = (s: number) => o.oldBase[s] === o.newBase[s] ? `${usd(o.newBase[s])} (unchanged)` : `${usd(o.oldBase[s])} → ${usd(o.newBase[s])}`;
  return {
    date: o.date,
    kind: 'data',
    title: sameYear ? `AMI figures updated to HPD's revised ${o.newYear} chart` : `AMI figures updated to HPD's ${o.newYear} chart`,
    summary: `${sameYear ? `HPD revised its ${o.newYear}` : `HPD published its ${o.newYear}`} New York City Area AMI chart. 100% AMI for 3 people: ${move(3)}; for 4 people: ${move(4)}. AMI percentages, income bands, and max rents per band moved with it.`,
    affects: AMI_AFFECTS,
    pr: null,
  };
}

const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** One SITE_CHANGES element in the file's own style. */
export function serializeChange(c: SiteChange): string {
  const lines = [
    `    date: ${quote(c.date)},`,
    `    kind: ${quote(c.kind)},`,
    `    title: ${quote(c.title)},`,
    `    summary: ${quote(c.summary)},`,
    `    affects: [${c.affects.map(quote).join(', ')}],`,
    c.pr === null ? `    pr: null, ${PR_PLACEHOLDER}` : `    pr: ${c.pr},`,
  ];
  if (c.logHeading) lines.push(`    logHeading: ${quote(c.logHeading)},`);
  return `  {\n${lines.join('\n')}\n  },\n`;
}

const ARRAY_START = 'export const SITE_CHANGES: SiteChange[] = [\n';

/** siteChanges.ts source with `c` added as the newest entry. */
export function insertChange(src: string, c: SiteChange): string {
  const i = src.indexOf(ARRAY_START);
  if (i < 0) throw new Error('SITE_CHANGES array not found in src/data/siteChanges.ts');
  const at = i + ARRAY_START.length;
  return src.slice(0, at) + serializeChange(c) + src.slice(at);
}

/** Replace the placeholder with the PR number (mirrors the sed in open-pr.sh). */
export function fillPr(src: string, pr: number): string {
  return src.replaceAll(`pr: null, ${PR_PLACEHOLDER}`, `pr: ${pr},`);
}
