import { describe, it, expect } from 'vitest';
import { normalizePrice, normalizeInstitutional, normalizeStockInfo } from '../finmind-normalize';

describe('normalizePrice', () => {
  it('株數轉張、欄位對應', () => {
    const rows = [{ date: '2026-06-06', stock_id: '2330', open: 1000, max: 1010, min: 990, close: 1005, Trading_Volume: 25_000_000 }];
    const out = normalizePrice(rows);
    expect(out[0]).toEqual({ stockId: '2330', tradeDate: '2026-06-06', open: 1000, high: 1010, low: 990, close: 1005, volumeLots: 25000 });
  });
});

describe('normalizeInstitutional（long → 每檔每日合計買超張）', () => {
  it('同檔多法人列加總 (買-賣)/1000', () => {
    const rows = [
      { date: '2026-06-06', stock_id: '2330', name: 'Foreign_Investor', buy: 5_000_000, sell: 1_000_000 },
      { date: '2026-06-06', stock_id: '2330', name: 'Investment_Trust', buy: 2_000_000, sell: 0 },
      { date: '2026-06-06', stock_id: '2330', name: 'Dealer_self', buy: 0, sell: 1_000_000 },
    ];
    const out = normalizeInstitutional(rows);
    expect(out).toEqual([{ stockId: '2330', tradeDate: '2026-06-06', netLots: 5000 }]);
  });
});

describe('normalizeStockInfo', () => {
  it('type→market、取名稱（去重，TWSE/TPEx 以外略過）', () => {
    const rows = [
      { stock_id: '2330', stock_name: '台積電', type: 'twse' },
      { stock_id: '6488', stock_name: '環球晶', type: 'tpex' },
      { stock_id: '0050', stock_name: '元大台灣50', type: 'twse' },
    ];
    const m = normalizeStockInfo(rows);
    expect(m.get('2330')).toEqual({ stockName: '台積電', market: 'TWSE' });
    expect(m.get('6488')).toEqual({ stockName: '環球晶', market: 'TPEx' });
  });
});
