import { parse } from 'csv-parse/sync';
import type { DirectorRow } from './aggregate';

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
const isDirectorOrSupervisor = (title: string) =>
  (title.includes('董事') || title.includes('監察人')) && !title.includes('法人代表');

/** 解析整月明細 → 每檔 stockId 的董監本人列（已過濾經理人/法人代表、依姓名去重取最大持股）。 */
export function parseDirectorRowsByStock(csv: string): Map<string, DirectorRow[]> {
  const records: Record<string, string>[] = parse(csv, {
    columns: true, skip_empty_lines: true, relax_column_count: true, bom: true, trim: true,
  });
  const out = new Map<string, DirectorRow[]>();
  if (records.length === 0) return out;
  const keys = Object.keys(records[0]);
  const kId = findKey(keys, COL.stockId);
  const kTitle = findKey(keys, COL.title);
  const kName = findKey(keys, COL.name);
  const kShares = findKey(keys, COL.shares);

  const dedupe = new Map<string, Map<string, DirectorRow>>(); // stockId -> name -> row
  for (const r of records) {
    const title = r[kTitle];
    if (!isDirectorOrSupervisor(title)) continue;
    const id = String(r[kId]).trim();
    const name = r[kName];
    const shares = Number(String(r[kShares]).replace(/,/g, '')) || 0;
    const byName = dedupe.get(id) ?? new Map<string, DirectorRow>();
    const prev = byName.get(name);
    if (!prev || shares > prev.currentShares) byName.set(name, { title, name, currentShares: shares });
    dedupe.set(id, byName);
  }
  for (const [id, byName] of dedupe) out.set(id, [...byName.values()]);
  return out;
}

/** data.gov 資料年月（民國 YYYMM，如 '11504'）→ 'YYYY-MM'。 */
export function rocMonthToIso(rocYYYMM: string): string {
  const s = String(rocYYYMM).trim();
  const year = Number(s.slice(0, 3)) + 1911;
  const month = s.slice(3, 5);
  return `${year}-${month}`;
}
