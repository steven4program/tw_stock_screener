// web/lib/__tests__/format.test.ts
import { describe, it, expect } from 'vitest';
import { fmt, trendShort, isStaleDirectorMonth } from '../format';

describe('fmt', () => {
  it('int adds thousands separators', () => {
    expect(fmt.int(4120)).toBe('4,120');
    expect(fmt.int(48.6)).toBe('49');
  });
  it('price: 1 decimal at >=100, 2 decimals below', () => {
    expect(fmt.price(168.5)).toBe('168.5');
    expect(fmt.price(75.8)).toBe('75.80');
  });
  it('pct1 multiplies ratio by 100, 1 decimal', () => {
    expect(fmt.pct1(0.09)).toBe('9.0');
    expect(fmt.pct1(-0.0596)).toBe('-6.0');
  });
  it('changePct signs the value, 2 decimals', () => {
    expect(fmt.changePct(0.0241)).toBe('+2.41%');
    expect(fmt.changePct(0)).toBe('0.00%');
    expect(fmt.changePct(-0.0035)).toBe('-0.35%');
  });
});

describe('trendShort', () => {
  const base = { ma20: null, ma20Prev: null, ma60: null, ma60Prev: null };
  it('A: 已上彎 when ma60 > ma60Prev else 扣抵向上', () => {
    expect(trendShort('A', { ...base, ma60: 154.6, ma60Prev: 153.9 })).toBe('已上彎');
    expect(trendShort('A', { ...base, ma60: 74.2, ma60Prev: 74.4 })).toBe('扣抵向上');
  });
  it('B: keys off ma20', () => {
    expect(trendShort('B', { ...base, ma20: 159.2, ma20Prev: 157.8 })).toBe('已上彎');
  });
});

describe('isStaleDirectorMonth', () => {
  it('true only when older than latest', () => {
    expect(isStaleDirectorMonth('2026-03', '2026-04')).toBe(true);
    expect(isStaleDirectorMonth('2026-04', '2026-04')).toBe(false);
    expect(isStaleDirectorMonth(null, '2026-04')).toBe(false);
  });
});
