import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INCOME_AMOUNTS, SALARY_AMOUNTS, RENT_PRICES, BUY_PRICES } from '../src/data/priceGrids.ts';
import { incomePageFor, nearest } from '../src/lib/relatedPages.ts';

// The numeric landing-page grids generate URLs (/income/<n>/, /salary/<n>/,
// /rent/<n>/, /buy/<n>/). Published URLs must never disappear, so the
// pre-Phase-3 grids are pinned here: amounts can be added, never removed.

const PUBLISHED = {
  income: [50000, 60000, 75000, 80000, 90000, 100000, 120000, 125000, 150000, 175000, 200000, 225000, 250000, 300000, 350000, 400000, 500000],
  rent: [2000, 2500, 3000, 3500, 4000, 4500, 5000, 6000, 7500],
  buy: [300000, 400000, 500000, 600000, 750000, 800000, 900000, 1000000, 1100000, 1250000, 1500000, 2000000, 3000000],
};

const grids = { INCOME_AMOUNTS, SALARY_AMOUNTS, RENT_PRICES, BUY_PRICES } as Record<string, readonly number[]>;

for (const [name, grid] of Object.entries(grids)) {
  test(`${name}: positive whole numbers, strictly ascending, no duplicates`, () => {
    for (let i = 0; i < grid.length; i++) {
      assert.ok(Number.isInteger(grid[i]) && grid[i] > 0, `${name}[${i}] = ${grid[i]}`);
      if (i > 0) assert.ok(grid[i] > grid[i - 1], `${name} not ascending at ${grid[i]}`);
    }
  });
}

test('every published URL still exists (grids only grow)', () => {
  for (const n of PUBLISHED.income) {
    assert.ok(INCOME_AMOUNTS.includes(n as never), `/income/${n}/ removed`);
    assert.ok(SALARY_AMOUNTS.includes(n as never), `/salary/${n}/ removed`);
  }
  for (const n of PUBLISHED.rent) assert.ok(RENT_PRICES.includes(n as never), `/rent/${n}/ removed`);
  for (const n of PUBLISHED.buy) assert.ok(BUY_PRICES.includes(n as never), `/buy/${n}/ removed`);
});

test('every income page has a salary page', () => {
  for (const n of INCOME_AMOUNTS) assert.ok(SALARY_AMOUNTS.includes(n as never), `no /salary/${n}/`);
});

test('a salary page links to an income page that exists', () => {
  for (const n of SALARY_AMOUNTS) assert.ok(INCOME_AMOUNTS.includes(incomePageFor(n, INCOME_AMOUNTS) as never), `/salary/${n}/`);
  assert.equal(incomePageFor(100000, INCOME_AMOUNTS), 100000);
  assert.equal(incomePageFor(35000, INCOME_AMOUNTS), 50000);
  assert.equal(nearest(1700, RENT_PRICES), 1500);
});
