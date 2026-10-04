/* Weekly: pull Freddie Mac's PMMS 30-year rate. If there's a newer survey
   week than the site's default, update the registry and the calculators'
   rate inputs, run the tests, and write a report for the pull request.
   Usage: node --experimental-strip-types scripts/data-updates/update-pmms.ts <report.md> */
import { readFileSync, writeFileSync } from 'node:fs';
import { parsePmmsCsv, setInputValue } from '../../src/lib/sourceParsers.ts';
import { ASSUMPTIONS } from '../../src/data/assumptions.ts';
import { fetchText, setOutput, findMentions, runTests } from './shared.ts';

const PMMS_CSV = 'https://www.freddiemac.com/pmms/docs/PMMS_history.csv';
const ASSUMPTIONS_FILE = 'src/data/assumptions.ts';
// Every <input> that defaults to the mortgage rate.
const RATE_INPUTS = [
  { file: 'src/pages/coop/index.astro', id: 'mtg-rate' },
  { file: 'src/pages/condo/index.astro', id: 'mtg-rate' },
  { file: 'src/pages/compare/index.astro', id: 'a-coop-rate' },
  { file: 'src/pages/compare/index.astro', id: 'a-condo-rate' },
];

const reportPath = process.argv[2] ?? 'pmms-report.md';
const cur = ASSUMPTIONS.mortgageRatePct;
const week = parsePmmsCsv(await fetchText(PMMS_CSV, 'PMMS_SOURCE_FILE'));
console.log(`PMMS latest: ${week.rate30}% (week of ${week.date}); site: ${cur.value}% (${cur.effectiveDate})`);

if (!cur.effectiveDate || week.date <= cur.effectiveDate) {
  setOutput('changed', 'false');
  process.exit(0);
}

const today = new Date().toISOString().slice(0, 10);
const rate = String(week.rate30);

// 1. The registry entry.
let src = readFileSync(ASSUMPTIONS_FILE, 'utf8');
const start = src.indexOf('  mortgageRatePct: {');
const end = src.indexOf('\n  },', start);
if (start < 0 || end < 0) throw new Error('mortgageRatePct entry not found');
let block = src.slice(start, end);
const before = block;
block = block
  .replace(/value: [\d.]+,/, `value: ${rate},`)
  .replace(/effectiveDate: '[^']*',/, `effectiveDate: '${week.date}',`)
  .replace(/lastVerified: '[^']*',/, `lastVerified: '${today}',`)
  .replace(/notes: '[^']*',/, `notes: 'Freddie Mac PMMS 30-year fixed average for the week of ${week.date}: conventional, conforming, 20% down, excellent credit. Jumbo loans and lender overlays can differ materially. Updated by the weekly PMMS job.',`);
if (block === before) throw new Error('mortgageRatePct entry did not change');
src = src.slice(0, start) + block + src.slice(end);
writeFileSync(ASSUMPTIONS_FILE, src);

// 2. The calculators' inputs.
const inputsChanged: string[] = [];
for (const { file, id } of RATE_INPUTS) {
  const r = setInputValue(readFileSync(file, 'utf8'), id, rate);
  if (r.changed) { writeFileSync(file, r.src); inputsChanged.push(`${file} #${id}`); }
}

// 3. What a person still has to check: prose that quotes the old rate, and failing tests.
const oldRate = `${cur.value}%`;
const mentions = findMentions(oldRate, [ASSUMPTIONS_FILE]);
const tests = runTests();

const report = `Automated weekly check of the [Freddie Mac PMMS](https://www.freddiemac.com/pmms) found a newer survey week.

| | Site default | PMMS latest |
|---|---|---|
| 30-year fixed | ${cur.value}% (week of ${cur.effectiveDate}) | **${rate}%** (week of ${week.date}) |

Source file: ${PMMS_CSV}

## Changed automatically
- \`${ASSUMPTIONS_FILE}\`: \`mortgageRatePct\` value, effectiveDate, lastVerified (${today}), notes.
${inputsChanged.map((s) => `- \`${s}\` default value`).join('\n') || '- (no calculator inputs needed changing)'}

## Needs a person before merging
${tests.fail === 0 ? `- Tests: **${tests.pass} passed, 0 failed.**` : `- Tests: **${tests.fail} failing** (${tests.pass} passing). Two kinds are expected on every rate change: engine golden tests that pin results at the default rate (each message shows the expected and actual value), and guide worked examples that quote figures computed at the old rate (\`test/guideExamples.test.ts\` lists the exact text each should now say). Update both, then rerun \`npm test\`:\n\n\`\`\`\n${tests.failures}\n\`\`\``}
- Text that still quotes the old rate (${oldRate}) — update or confirm each:
${mentions.length ? mentions.map((m) => `  - \`${m.replace(/`/g, "'")}\``).join('\n') : '  - none found'}

This PR was opened by \`.github/workflows/data-update-pmms.yml\`. It never merges itself; nothing reaches the site until someone reviews and merges it.
`;
writeFileSync(reportPath, report);
setOutput('changed', 'true');
setOutput('week', week.date);
setOutput('rate', rate);
setOutput('tests_failing', String(tests.fail));
