import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  rocToIso,
  parseStockDayDates,
  parseTwsePrices,
  parseTwseInst,
  parseTpexPrices,
  parseTpexInst,
} from '../marketdata';

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
}

const miindex = loadFixture('twse-miindex.json');
const t86 = loadFixture('twse-t86.json');
const tpexPrice = loadFixture('tpex-price.json');
const tpexInsti = loadFixture('tpex-insti.json');
const stockDay = loadFixture('twse-stockday-2330.json');

const DATE = '2026-06-05';

describe('rocToIso', () => {
  it('115/06/09 → 2026-06-09', () => expect(rocToIso('115/06/09')).toBe('2026-06-09'));
  it('114/12/31 → 2025-12-31', () => expect(rocToIso('114/12/31')).toBe('2025-12-31'));
});

describe('parseStockDayDates', () => {
  it('returns ascending ISO dates from STOCK_DAY 2330', () => {
    const dates = parseStockDayDates(stockDay);
    expect(dates.length).toBeGreaterThan(0);
    expect(dates).toContain('2026-06-09');
    // ascending
    expect([...dates].sort()).toEqual(dates);
    expect(dates[dates.length - 1]).toBe('2026-06-09');
  });
});

describe('parseTwsePrices', () => {
  const rows = parseTwsePrices(miindex, DATE);
  it('parses many rows (whole-market)', () => {
    expect(rows.length).toBeGreaterThan(800);
  });
  it('skips no-trade rows (close "--")', () => {
    // 00625K had close "--" in fixture → must be absent
    expect(rows.find((r) => r.stockId === '00625K')).toBeUndefined();
  });
  it('2330 close/open/high/low/volumeLots correct', () => {
    const r = rows.find((x) => x.stockId === '2330')!;
    expect(r).toBeDefined();
    expect(r.tradeDate).toBe(DATE);
    expect(r.close).toBe(2365);
    expect(r.open).toBe(2395);
    expect(r.high).toBe(2405);
    expect(r.low).toBe(2350);
    // 成交股數 43,403,895 / 1000
    expect(r.volumeLots).toBeCloseTo(43403.895, 3);
  });
});

describe('parseTwseInst', () => {
  const rows = parseTwseInst(t86, DATE);
  it('parses many rows', () => {
    expect(rows.length).toBeGreaterThan(800);
  });
  it('2330 net = 三大法人買賣超股數 / 1000', () => {
    const r = rows.find((x) => x.stockId === '2330')!;
    expect(r).toBeDefined();
    expect(r.tradeDate).toBe(DATE);
    expect(r.netLots).toBeCloseTo(-14422.343, 3);
  });
});

describe('parseTpexPrices', () => {
  const rows = parseTpexPrices(tpexPrice, DATE);
  it('parses ~887 four-digit rows', () => {
    expect(rows.length).toBeGreaterThan(500);
  });
  it('only 4-digit codes', () => {
    expect(rows.every((r) => /^\d{4}$/.test(r.stockId))).toBe(true);
  });
  it('6488 (環球晶) close/volume correct', () => {
    const r = rows.find((x) => x.stockId === '6488')!;
    expect(r).toBeDefined();
    expect(r.tradeDate).toBe(DATE);
    expect(r.close).toBe(811);
    expect(r.volumeLots).toBeCloseTo(2776.146, 3);
  });
});

describe('parseTpexInst', () => {
  const rows = parseTpexInst(tpexInsti, DATE);
  it('parses ~809 four-digit rows', () => {
    expect(rows.length).toBeGreaterThan(500);
  });
  it('only 4-digit codes', () => {
    expect(rows.every((r) => /^\d{4}$/.test(r.stockId))).toBe(true);
  });
  it('6488 net = 三大法人買賣超股數合計 / 1000', () => {
    const r = rows.find((x) => x.stockId === '6488')!;
    expect(r).toBeDefined();
    expect(r.tradeDate).toBe(DATE);
    expect(r.netLots).toBeCloseTo(-429.068, 3);
  });
});
