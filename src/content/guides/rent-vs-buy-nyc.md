---
title: "Rent vs Buy in NYC: How to Actually Run the Comparison"
metaDescription: "Rent or buy in NYC? It turns on price-to-rent, closing costs both ways, what your down payment would earn, and how long you stay. A worked example."
intro: "\"Rent is throwing money away\" skips the interest, the building charges, the closing costs on the way in, and the broker and transfer taxes on the way out. \"Renting is always cheaper\" skips that the owner keeps the equity. The honest comparison is two people with the same money, one who buys and one who rents and invests the difference, checked at the moment the buyer would sell."
updated: "2026-10-04"
category: "buying"
sources:
  - label: "NYC Department of Finance: Real Property Transfer Tax (RPTT)"
    url: "https://www.nyc.gov/site/finance/property/property-real-property-transfer-tax-rptt.page"
  - label: "NYS Department of Taxation and Finance: Real Estate Transfer Tax"
    url: "https://www.tax.ny.gov/bus/transfer/rptidx.htm"
  - label: "NYC Department of Consumer and Worker Protection: Broker Fees FAQ (FARE Act)"
    url: "https://www.nyc.gov/site/dca/about/FAQ-Broker-Fees.page"
  - label: "IRS Tax Topic 701: Sale of Your Home"
    url: "https://www.irs.gov/taxtopics/tc701"
  - label: "Consumer Financial Protection Bureau: What Fees or Charges Are Paid When Closing on a Mortgage?"
    url: "https://www.consumerfinance.gov/ask-cfpb/what-are-closing-costs-en-1845/"
relatedGuides:
  - how-much-down-payment-nyc-apartment
  - nyc-closing-costs-for-buyers
  - nyc-seller-closing-costs-explained
  - coop-vs-condo-nyc-costs
  - how-mortgage-rates-affect-nyc-affordability
relatedTerms:
  - nyc-real-property-transfer-tax
  - nys-transfer-tax
  - fare-act
  - flip-tax
cta:
  heading: "Run it with your rent and your price"
  body: "The rent vs buy calculator uses the same closing-cost, mortgage, and sale math as the rest of the site and shows the break-even year and the break-even rent for how long you'd stay."
  label: "Open the Rent vs Buy Calculator"
  href: "/rent-vs-buy/"
---

## Start with price-to-rent, then stop trusting it

The quickest screen is the **price-to-rent ratio**: purchase price divided by a year of rent for a comparable apartment (same size, same neighborhood). A $700,000 apartment that would rent for $4,000 a month has a ratio of 700,000 ÷ 48,000 = **14.6**. Lower means renting is expensive relative to buying; higher means the reverse.

It's a useful first look and a bad final answer. It ignores the mortgage rate, the building's monthly charges, property tax, and the transaction costs on both ends. In NYC, those are the parts that decide the question.

## Compare monthly costs honestly

The owner's monthly bill is more than the mortgage. For a condo it's principal and interest, [common charges](/guides/condo-common-charges-explained/), property tax, and insurance. A co-op's maintenance already folds in the building's tax. Both owners also pay for repairs inside the unit; the site's [/rent-vs-buy/](/rent-vs-buy/) calculator uses an illustrative 0.5% of the home's value a year for that. The renter pays rent and renter's insurance.

One thing makes the owner's bill look worse than it is: part of each mortgage payment is principal, which comes back to you when you sell. That's why comparing monthly bills alone gets the answer wrong. You have to follow the money to the end.

## Closing costs hit the buyer twice

Buying in NYC is expensive on the way in. Lenders and title companies charge fees, and the CFPB notes that buyers generally pay the costs of the transaction, often including title insurance and government taxes. NYC adds the mortgage recording tax on condo loans and the mansion tax at $1 million and up. See [closing costs for buyers](/guides/nyc-closing-costs-for-buyers/).

It's expensive on the way out, too. The seller pays NYC's real property transfer tax, which the Department of Finance sets at 1% of the price at $500,000 or less and 1.425% above that. New York State adds its own transfer tax of $2 per $500 of consideration (0.4%). Then there's the broker's commission (the site assumes 5%, a convention, not a rule) and, at most co-ops, a [flip tax](/glossary/flip-tax/). See [seller closing costs](/guides/nyc-seller-closing-costs-explained/).

The renter's transaction costs are lighter now. Since June 11, 2025, the FARE Act bars brokers who represent landlords from charging their fee to tenants, according to the city's Department of Consumer and Worker Protection. A renter who hires their own broker still pays them. See the [FARE Act guide](/guides/fare-act-broker-fees-explained/).

## Your down payment has a day job

The cash a buyer spends at closing is cash the renter keeps and invests. Every month the renter's bill is lower, the renter can invest the difference too. If owning ever gets cheaper than renting (rents rise, the mortgage stays fixed), the buyer invests the gap instead. The site's calculator assumes a 5% annual return on that money. It's an illustrative placeholder, not a forecast; use what you'd actually earn.

## Time is the main variable

Buying front-loads the costs and back-loads the rewards: equity from principal paydown, appreciation (if any), and a sale. Every extra year spreads those entry and exit costs thinner. So the real output isn't "rent or buy," it's "buy if you'll stay at least *this* long." The calculator calls that the break-even year.

<!-- Editors: the figures in this section are recomputed from the rent vs buy engine by test/guideExamples.test.ts. If you change a default (rate, growth, return, carrying costs, seller costs) or this example, `npm test` lists every number to update. -->

## Worked example

This is the [/rent-vs-buy/](/rent-vs-buy/) calculator's own starting example: a $700,000 condo with 20% down against a comparable apartment renting for $4,000 a month, held 10 years. It uses the site's defaults: a 7.28% mortgage rate (the Freddie Mac 30-year average as of October 1, 2026), plus illustrative 3% yearly growth in rents, home prices, and building costs and a 5% return on invested cash.

- **Cash at closing:** $140,000 down plus $26,240 in closing costs = **$166,240**. The renter invests this instead.
- **Month one:** the owner pays **$6,448** (mortgage, common charges, tax, insurance, and in-unit repairs). The renter pays **$4,018** (rent plus insurance) and invests the gap.
- **Year 10, if the owner sells:** the condo is worth **$940,741**. After paying off the **$483,668** loan balance and **$67,706** in seller costs, the owner walks away with **$389,368**.
- **The renter's portfolio:** **$617,883**.

Renting comes out ahead by **$228,514**. At these settings, buying doesn't catch up within 30 years. Over 10 years, buying wins only if the comparable rent is above about **$5,310** a month, a price-to-rent ratio of about **11.0**. Stay 5 years and the break-even rent rises to about **$6,060**; stay 15 and it falls to about **$5,000**.

Switch it to a $700,000 co-op with the calculator's illustrative $1,200 monthly maintenance and the result nearly flips. With no mortgage recording tax and lower monthly charges, the break-even rent over 10 years is about **$4,160**, and at $4,000 rent buying pulls ahead in **year 13** if you stay that long. The flip tax at sale doesn't erase that. The same apartment, owned two different ways, gives two different answers.

## What the comparison leaves out

The calculator skips income taxes in both directions: the mortgage-interest and property-tax deductions, tax on the renter's investment gains, and tax on the home sale. On that last one, the IRS lets you exclude up to $250,000 of gain on the sale of your main home ($500,000 for a joint return) if you qualify. It also skips refinancing, [special assessments](/glossary/special-assessment/), and the value of being able to move without selling anything. Weigh those yourself.

If you're leaning toward buying, the next questions are cash and income. See [how much down payment you need](/guides/how-much-down-payment-nyc-apartment/) and [what income it takes](/guides/income-needed-to-buy-nyc-apartment/).
