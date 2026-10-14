/* Put the data-update PR's number into the changelog entry the update
   script added with `pr: null` (see changelog.ts). Called by open-pr.sh.
   Usage: node --experimental-strip-types scripts/data-updates/fill-pr.ts <pr-number> */
import { readFileSync, writeFileSync } from 'node:fs';
import { fillPr, PR_PLACEHOLDER } from './changelog.ts';

const FILE = 'src/data/siteChanges.ts';
const pr = Number(process.argv[2]);
if (!Number.isInteger(pr) || pr <= 0) throw new Error(`fill-pr: not a PR number: ${process.argv[2]}`);
const src = readFileSync(FILE, 'utf8');
if (!src.includes(PR_PLACEHOLDER)) {
  console.log('fill-pr: no changelog entry waiting for a PR number');
} else {
  writeFileSync(FILE, fillPr(src, pr));
  console.log(`fill-pr: changelog entry now links PR #${pr}`);
}
