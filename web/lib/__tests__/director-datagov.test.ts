import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDirectorRowsByStock, rocMonthToIso } from '../director/datagov';
import { aggregateByShares } from '../director/aggregate';

const listed = readFileSync(new URL('../../../poc/director-holdings/fixtures/datagov-listed.csv', import.meta.url), 'utf8');
const otc = readFileSync(new URL('../../../poc/director-holdings/fixtures/datagov-otc.csv', import.meta.url), 'utf8');

describe('parseDirectorRowsByStock 對齊 MOPS', () => {
  it('2330 全體董監持股 = 6.52%（與 POC/MOPS 一致）', () => {
    const rows = parseDirectorRowsByStock(listed).get('2330')!;
    expect(rows.reduce((s, r) => s + r.currentShares, 0)).toBe(1_690_761_830);
    expect(aggregateByShares(rows, 25_932_370_067)).toBeCloseTo(6.52, 1);
  });
  it('6488 全體董監持股 = 46.96%（法人董事去重、排除法人代表/經理人）', () => {
    const rows = parseDirectorRowsByStock(otc).get('6488')!;
    expect(rows.reduce((s, r) => s + r.currentShares, 0)).toBe(224_521_516);
    expect(aggregateByShares(rows, 478_113_725)).toBeCloseTo(46.96, 1);
  });
});

describe('rocMonthToIso', () => {
  it('11504 → 2026-04', () => { expect(rocMonthToIso('11504')).toBe('2026-04'); });
});
