// web/lib/__tests__/signals.test.ts
import { describe, it, expect } from 'vitest';
import { sma, holdflat } from '../signals';

describe('sma（時間升冪，視窗取結尾）', () => {
  const closes = [1, 2, 3, 4, 5]; // 最後一筆＝今日

  it('視窗 3、offset 0 = 最後三筆 (3+4+5)/3 = 4', () => {
    expect(sma(closes, 3, 0)).toBeCloseTo(4, 9);
  });

  it('視窗 3、offset 1 = 結尾往前一格 (2+3+4)/3 = 3', () => {
    expect(sma(closes, 3, 1)).toBeCloseTo(3, 9);
  });

  it('視窗超過資料長度回 null', () => {
    expect(sma(closes, 6, 0)).toBeNull();
  });

  it('視窗剛好等於長度可算、但 offset 1 不足回 null', () => {
    expect(sma(closes, 5, 0)).toBeCloseTo(3, 9);
    expect(sma(closes, 5, 1)).toBeNull();
  });
});

describe('holdflat（假設未來 5 日收盤＝今日收盤）', () => {
  it('視窗 20：取最後 15 筆 + 5×今日，再除以 20', () => {
    const flat = Array(25).fill(10);
    expect(holdflat(flat, 20, 5)).toBeCloseTo(10, 9);
  });

  it('今日收盤高於過去 → holdflat 高於過去段平均', () => {
    const closes = [...Array(19).fill(10), 40]; // 20 筆，最後一筆＝40
    // (10×15 + 5×40)/20 = (150+200)/20 = 17.5
    expect(holdflat(closes, 20, 5)).toBeCloseTo(17.5, 9);
  });

  it('資料不足視窗回 null', () => {
    expect(holdflat([1, 2, 3], 20, 5)).toBeNull();
  });
});
