import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parseMopsTotalDirectorShares,
  parseMopsDataMonth,
  mopsRatioPct,
} from '../src/sources/mops';

const html2330 = readFileSync(new URL('../fixtures/mops-2330-2026-04.html', import.meta.url), 'utf8');
const html6488 = readFileSync(new URL('../fixtures/mops-6488-2026-04.html', import.meta.url), 'utf8');

describe('parseMopsTotalDirectorShares', () => {
  it('從 2330 MOPS 明細頁取「全體董監持股合計」股數', () => {
    expect(parseMopsTotalDirectorShares(html2330)).toBe(1_690_761_830);
  });

  it('從 6488(上櫃) MOPS 明細頁取「全體董監持股合計」股數', () => {
    expect(parseMopsTotalDirectorShares(html6488)).toBe(224_521_516);
  });

  it('遇到錯誤頁/查無資料頁應 throw（避免假成功）', () => {
    const errPage =
      '<html><body>因為安全性考量，您所執行的頁面無法呈現。</body></html>';
    expect(() => parseMopsTotalDirectorShares(errPage)).toThrow();
  });
});

describe('parseMopsDataMonth', () => {
  it('取資料年月（民國 YYYMM）以保證比對同期', () => {
    expect(parseMopsDataMonth(html2330)).toBe('11504');
    expect(parseMopsDataMonth(html6488)).toBe('11504');
  });
});

describe('mopsRatioPct', () => {
  it('2330 全體董監持股比率落在 (0,100]', () => {
    const pct = mopsRatioPct(html2330, 25_932_370_067);
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThanOrEqual(100);
    expect(pct).toBeCloseTo(6.52, 2);
  });
});
