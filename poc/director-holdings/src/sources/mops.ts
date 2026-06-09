import * as cheerio from 'cheerio';

/**
 * MOPS（公開資訊觀測站，新版 mopsov.twse.com.tw）「董監事持股餘額明細資料」頁。
 *
 * 取得方式：
 *   POST https://mopsov.twse.com.tw/mops/web/ajax_stapap1
 *   body: co_id=<代號>&year=<民國年>&month=<MM>&step=1&firstin=1
 *
 * 頁面在明細列之後附有官方彙總表，含一列：
 *   「全體董監持股合計 | <股數> | … 」
 * 此股數即「全體董監事」去重後的官方持股合計（僅董事＋監察人，
 * 不含總經理/副總、財會主管等非董監內部人，亦不重複計入法人代表人）。
 * MOPS 並未直接給「比率(%)」，故比率由本檔 mopsRatioPct() 以已發行股數換算。
 */

/** 去除字串中的逗號千分位後轉數字；非有效數字回傳 NaN。 */
function toNum(s: string): number {
  const n = Number(s.replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : NaN;
}

/**
 * 取「全體董監持股合計」股數。
 * 找不到該列即 throw —— 同時擋下 MOPS 錯誤頁/查無資料頁，避免假成功。
 */
export function parseMopsTotalDirectorShares(html: string): number {
  const $ = cheerio.load(html);
  let shares = NaN;
  $('tr').each((_, tr) => {
    const cells = $(tr)
      .find('td,th')
      .map((_, c) => $(c).text().replace(/\s+/g, '').trim())
      .get();
    const idx = cells.findIndex((c) => c.includes('全體董監持股合計'));
    if (idx >= 0) {
      // 合計股數在標籤的下一個非空欄位
      for (let i = idx + 1; i < cells.length; i++) {
        if (cells[i] !== '') {
          shares = toNum(cells[i]);
          break;
        }
      }
    }
  });
  if (!(shares >= 0)) {
    throw new Error('MOPS 回應找不到「全體董監持股合計」股數（可能為錯誤頁/查無資料）');
  }
  return shares;
}

/** 取資料年月（民國 YYYMM，如 11504），用於確保跨來源比對同一期。找不到即 throw。 */
export function parseMopsDataMonth(html: string): string {
  const m = html.match(/資料年月[:：]\s*(\d{5,6})/);
  if (!m) {
    throw new Error('MOPS 回應找不到資料年月（可能為錯誤頁/查無資料）');
  }
  return m[1];
}

/**
 * 全體董監持股比率(%) = 全體董監持股合計 ÷ 已發行股數 × 100。
 * MOPS 本身不提供比率，故需傳入已發行股數（上市取 TWSE、上櫃取 TPEx）。
 */
export function mopsRatioPct(html: string, issuedShares: number): number {
  if (!(issuedShares > 0)) throw new Error('issuedShares must be > 0');
  return (parseMopsTotalDirectorShares(html) / issuedShares) * 100;
}
