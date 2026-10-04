# Data sources evaluated (2026-10-04)

What's out there that could make the site more useful, checked against the site's rules: every cited figure needs a value, a period, a source and a link to a **stable, dated** publication (no live dashboards or listing feeds), and it must be reachable to verify.

## Added now

### U.S. Census Bureau, American Community Survey 2024 1-year (in the Census PR)
- **What:** median household income; renter vs owner median income; median gross rent (what all renter households actually pay, rent-stabilized included); renters paying 30%+ and 50%+ of income; renter share. For NYC and all five boroughs, each with its 90% margin of error.
- **Where it shows:** a "Who lives in …" card on the borough hubs; "What New Yorkers actually earn and pay" on `/affordability-index/`; "How $X compares" on every `/income/<amount>/` page; `/data/census-acs-2024.{json,csv}`.
- **Why it's useful:** the site says what income you *need*. This says what New Yorkers *have*, and it shows how far the rent neighbors pay ($1,811 median citywide) sits below what a new lease asks.
- **Access:** the Census API now requires a key, but the table-based summary files at `www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/1YRData/` need none. A test fixture keeps the exact source lines; `test/censusAcs.test.ts` checks every value.
- **Refresh:** yearly. The 2025 1-year files returned 401 today (not public yet or moved). When they publish, swap the fixture and the test lists every changed value. This could become a fourth scheduled check.

## Worth adding, needs a decision

### Bronx and Staten Island borough hubs (Census)
The Census figures cover both boroughs. They have no hub today because no stable source publishes their market rents or sale prices. A hub built on Census figures alone would pass the quality gate (at least 2 figures no sibling shares), with market rent and sale price shown as "Not yet tracked". **Recommended next PR.**

### Redfin Data Center: borough median sale price, condo/co-op
- `redfin-public-data.s3…/county_market_tracker.tsv000.gz`: monthly, by county and property type, including a "Condo/Co-op" breakout. May 2026: Manhattan $1,417,875 (653 sales), Brooklyn $792,500 (260), Queens $395,000 (258), Bronx $237,500 (70), Staten Island $420,000 (**9 sales**, too few to cite).
- **For:** the only borough-level condo/co-op sale price I found that's reachable and covers the Bronx; it'd fill the hubs' empty sale cards.
- **Against:**
  - The file is overwritten in place, so the URL isn't a stable snapshot. We'd have to record the month and archive the value, and Redfin may revise it.
  - It mixes condos and co-ops.
  - Redfin's terms ask for attribution and a link.
- **Decision for you:** whether a monthly aggregate from a data file counts as a "stable, dated source" under the neighborhood rule.

### Zillow Research: ZORI (asking rent) and ZHVI (home value) by county
- `files.zillowstatic.com/research/public_csvs/...`: monthly, by county (borough), with a condo/co-op tier for ZHVI.
- **Against:** these are smoothed indexes that Zillow revises, and ZHVI is a modeled typical value, not a sale price. Usable only if labeled as an index ("Zillow's typical asking-rent index"), never as a median. Lower priority than Redfin.

## Not reachable from here, but worth a manual pull

- **HUD Fair Market Rents FY2026 (NY metro, by bedroom count).** Official rent benchmarks for vouchers; would sharpen `/affordable/` and the Section 8 glossary entry. huduser.gov answers automated requests with a 202 challenge, so someone needs to download it by hand.
- **NYC Housing and Vacancy Survey (2023).** Vacancy rate and the rent-stabilized share; the official city survey. The old HPD page returns 404. Find the current page or PDF.
- **StreetEasy market reports and Baruch/Zicklin quarterly PDFs.** These are the Affordability Index's own sources. StreetEasy blocks automated requests, and the Baruch PDF's server sends an incomplete certificate chain. A newer report downloaded by hand is the only way to add an index snapshot.
- **NYC DOF tax rates (FY2027 class 2 rate)** for the condo property-tax default. The DOF site is reachable, so this one is worth a look.

## Ruled out

- **PropertyShark market trends:** a live dashboard (the number changes under the same URL), and blocked here.
- **Manhattan-only figures** (Brick Underground, broker Q2 reports) as citywide stand-ins: the index is citywide, so a borough figure would mislabel it.
