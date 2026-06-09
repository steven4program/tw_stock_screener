import { parse } from 'csv-parse/sync';
import type { DirectorRow } from '../types';

// 各欄位的候選名稱（依 Task 4 實測表頭調整）
const COL = {
  stockId: ['公司代號', '代號'],
  title: ['職稱'],
  name: ['姓名'],
  shares: ['目前持股', '持股（股數）', '持股(股數)', '目前持股(股)'],
};

function findKey(keys: string[], aliases: string[]): string {
  const k = keys.find((key) => aliases.includes(key.trim()));
  if (!k) throw new Error(`找不到欄位，候選名稱：${aliases.join('/')}；實際表頭：${keys.join(',')}`);
  return k;
}

export function parseDirectorRows(csv: string, stockId: string): DirectorRow[] {
  // 用正式 CSV parser：正確處理千分位引號欄位（如 "10,000,000"）、BOM、不定欄數
  const records: Record<string, string>[] = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
    trim: true,
  });
  if (records.length === 0) return [];
  const keys = Object.keys(records[0]);
  const kId = findKey(keys, COL.stockId);
  const kTitle = findKey(keys, COL.title);
  const kName = findKey(keys, COL.name);
  const kShares = findKey(keys, COL.shares);

  return records
    .filter((r) => String(r[kId]).trim() === stockId)
    .map((r) => ({
      title: r[kTitle],
      name: r[kName],
      currentShares: Number(String(r[kShares]).replace(/,/g, '')) || 0,
    }));
}
