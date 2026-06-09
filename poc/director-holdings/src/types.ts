export interface DirectorRow {
  title: string;          // 職稱：董事長 / 董事 / 監察人 …
  name: string;           // 姓名
  currentShares: number;  // 目前持股（股）
}

export interface DirectorHoldingResult {
  stockId: string;
  stockName: string;
  market: 'TWSE' | 'TPEx';
  dataMonth: string;          // 'YYYY-MM'
  directorHoldingPct: number; // 全體董監持股 %
  method: 'shares' | 'ratio'; // 來源彙總方式
}
