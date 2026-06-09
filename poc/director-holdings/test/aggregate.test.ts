import { describe, it, expect } from 'vitest';
import { aggregateByShares, aggregateByRatios } from '../src/aggregate';

describe('aggregateByShares', () => {
  it('18M 董監持股 / 100M 發行股數 = 18.0%', () => {
    const rows = [
      { title: '董事長', name: 'A', currentShares: 10_000_000 },
      { title: '董事', name: 'B', currentShares: 5_000_000 },
      { title: '監察人', name: 'C', currentShares: 3_000_000 },
    ];
    expect(aggregateByShares(rows, 100_000_000)).toBeCloseTo(18.0, 6);
  });

  it('發行股數 <= 0 應丟出錯誤', () => {
    expect(() => aggregateByShares([], 0)).toThrow();
  });
});

describe('aggregateByRatios', () => {
  it('來源直接提供每位董監比率時，加總得全體比率', () => {
    expect(aggregateByRatios([10, 5, 3.2])).toBeCloseTo(18.2, 6);
  });
});
