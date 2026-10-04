/* Monthly: compare NYC HPD's published AMI chart with src/lib/amiTable.ts.
   If HPD has published a new year or changed figures, update the table,
   run the tests, and write a report for the pull request.
   Usage: node --experimental-strip-types scripts/data-updates/check-hpd-ami.ts <report.md> */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseHpdAmiPage } from '../../src/lib/sourceParsers.ts';
import { AMI_BASE, AMI_YEAR, AMI_SOURCE_URL } from '../../src/lib/amiTable.ts';
import { fetchText, setOutput, findMentions, runTests } from './shared.ts';

const TABLE_FILE = 'src/lib/amiTable.ts';
const reportPath = process.argv[2] ?? 'ami-report.md';
const hpd = parseHpdAmiPage(await fetchText(AMI_SOURCE_URL, 'AMI_SOURCE_FILE'));
const sizes = [1, 2, 3, 4, 5, 6, 7, 8];
const same = hpd.year === AMI_YEAR && sizes.every((s) => hpd.base[s] === AMI_BASE[s]);
console.log(`HPD: ${hpd.year} ${JSON.stringify(hpd.base)}; site: ${AMI_YEAR} ${JSON.stringify(AMI_BASE)}`);
if (same) {
  setOutput('changed', 'false');
  process.exit(0);
}

let src = readFileSync(TABLE_FILE, 'utf8');
for (const s of sizes) src = src.replace(new RegExp(`(\\n  ${s}: )\\d+,`), `$1${hpd.base[s]},`);
src = src.replace(/export const AMI_YEAR = \d{4};/, `export const AMI_YEAR = ${hpd.year};`);
writeFileSync(TABLE_FILE, src);

const fmt = (n: number) => `$${n.toLocaleString('en-US')}`;
const rows = sizes.map((s) => `| ${s} | ${fmt(AMI_BASE[s])} | **${fmt(hpd.base[s])}** |`).join('\n');
const mentions = sizes.flatMap((s) => findMentions(fmt(AMI_BASE[s]), [TABLE_FILE]));
const tests = runTests();

writeFileSync(reportPath, `Automated monthly check of [NYC HPD's AMI chart](${AMI_SOURCE_URL}) found figures that differ from the site's table.

| Household | Site (${AMI_YEAR}) | HPD (${hpd.year}) |
|---|---|---|
${rows}

## Changed automatically
- \`${TABLE_FILE}\`: \`AMI_BASE\`${hpd.year !== AMI_YEAR ? ` and \`AMI_YEAR\` (${AMI_YEAR} → ${hpd.year})` : ''}.

## Needs a person before merging
- Tests: **${tests.fail} failing** (${tests.pass} passing). \`test/amiTable.test.ts\` pins HPD's chart on purpose, so it fails until someone checks the new figures against HPD's page and updates the pinned values. Other failures:

\`\`\`
${tests.failures}
\`\`\`
- Text that quotes the old figures — update each (guides, glossary, \`/affordable/\` copy, \`src/data/sourceTables.ts\` vintage and last-verified date):
${mentions.length ? mentions.map((m) => `  - \`${m.replace(/`/g, "'")}\``).join('\n') : '  - none found'}
- If the year changed, rename \`ami-${AMI_YEAR}\` references (the \`/data/ami-${hpd.year}\` download follows \`AMI_YEAR\` automatically).

This PR was opened by \`.github/workflows/data-check-ami.yml\`. It never merges itself.
`);
setOutput('changed', 'true');
setOutput('year', String(hpd.year));
setOutput('tests_failing', String(tests.fail));
