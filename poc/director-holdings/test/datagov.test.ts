import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDirectorRows } from '../src/sources/datagov';
import { aggregateByShares } from '../src/aggregate';

const csv = readFileSync(new URL('../fixtures/datagov-listed.csv', import.meta.url), 'utf8');
const otcCsv = readFileSync(new URL('../fixtures/datagov-otc.csv', import.meta.url), 'utf8');

describe('parseDirectorRows', () => {
  it('擷取指定公司的董監列，且 currentShares 為非負數', () => {
    const rows = parseDirectorRows(csv, '2330');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(typeof r.title).toBe('string');
      expect(r.currentShares).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('parseDirectorRows 只計董監本人並去重 (對齊 MOPS 全體董監持股合計)', () => {
  it('2330 修正後 = 1,690,761,830 股 ≈ 6.52%', () => {
    const rows = parseDirectorRows(csv, '2330');
    const shares = rows.reduce((s, r) => s + r.currentShares, 0);
    expect(shares).toBe(1_690_761_830);
    expect(aggregateByShares(rows, 25_932_370_067)).toBeCloseTo(6.52, 1);
  });

  it('6488 修正後 = 224,521,516 股 ≈ 46.96%（排除法人代表人/經理人、法人董事去重）', () => {
    const rows = parseDirectorRows(otcCsv, '6488');
    const shares = rows.reduce((s, r) => s + r.currentShares, 0);
    expect(shares).toBe(224_521_516);
    expect(aggregateByShares(rows, 478_113_725)).toBeCloseTo(46.96, 1);
  });

  it('排除法人代表人與非董監內部人，且法人董事只計一次', () => {
    const rows = parseDirectorRows(otcCsv, '6488');
    expect(rows.every((r) => !r.title.includes('法人代表'))).toBe(true);
    expect(rows.every((r) => r.title.includes('董事') || r.title.includes('監察人'))).toBe(true);
    expect(rows.filter((r) => r.name.includes('中美矽晶')).length).toBe(1);
  });
});
