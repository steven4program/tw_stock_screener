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

  // t187ap11 lists ALL insiders (經理人、大股東、財務/會計主管 etc.), not only directors.
  // Rules to match MOPS 全體董監持股合計:
  //   1. Keep only 董事/監察人 本人 rows (title contains 董事 or 監察人, excludes 法人代表人).
  //   2. Dedupe by 姓名: a corporate director holding multiple seats repeats its full
  //      holding on each row — count that entity only once (keep max shares).
  const isDirectorOrSupervisor = (title: string) =>
    (title.includes('董事') || title.includes('監察人')) && !title.includes('法人代表');

  const filtered = records
    .filter((r) => String(r[kId]).trim() === stockId)
    .filter((r) => isDirectorOrSupervisor(r[kTitle]));

  // Dedupe by name, keeping max currentShares (repeated rows for same entity are identical
  // in practice, but we take max to be safe).
  const byName = new Map<string, { title: string; name: string; currentShares: number }>();
  for (const r of filtered) {
    const name = r[kName];
    const shares = Number(String(r[kShares]).replace(/,/g, '')) || 0;
    const existing = byName.get(name);
    if (!existing || shares > existing.currentShares) {
      byName.set(name, { title: r[kTitle], name, currentShares: shares });
    }
  }

  return Array.from(byName.values());
}
