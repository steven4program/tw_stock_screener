/* 台股選股器 — 資料與篩選引擎
 * 內含 sample-snapshot.json 的真實示意資料，並實作 runFilter(rows,{n,x})。
 * N（法人連買天數）與 X（董監持股門檻%）為可調參數，會即時改變入選結果與原因句。
 */
(function () {
  const SNAPSHOT = {
    dataDate: "2026-06-09",
    generatedAt: "2026-06-09T14:05:00+08:00",
    directorDataMonthLatest: "2026-04",
    // 上次成功資料日期（用於「未更新 / 失敗」狀態沿用）
    lastSuccessDate: "2026-06-06",
  };

  // 固定參數（只顯示、不可調）
  const FIXED = {
    distLow: 0,
    distHigh: 10,   // 距均線 0~10%
    ma20: 20,       // 月線
    ma60: 60,       // 季線
    holdflatDays: 5 // 扣抵 5 個交易日
  };

  // 每列：tag 為快照預設候選結構；matchA/matchB 代表「距離+均線趨勢」結構條件。
  // N/X 只會「收緊」(讓不符的退出)，不會新增候選。符合產品語意。
  const ROWS = [
    {
      base: { A: true, B: true },
      signal: {
        stockId: "9914", stockName: "美利達", market: "TWSE",
        close: 168.5, changeRatio: 0.0241, volumeLots: 4120,
        instNetLots: 2150, instBuyStreak: 8,
        directorHoldingPct: 24.8, directorDataMonth: "2026-04",
        ma20: 159.2, ma20Prev: 157.8, ma20Holdflat5d: 161.0,
        ma60: 154.6, ma60Prev: 153.9, ma60Holdflat5d: 156.2,
        distMa20Ratio: 0.0584, distMa60Ratio: 0.0900
      }
    },
    {
      base: { A: true, B: true },
      signal: {
        stockId: "9921", stockName: "巨大", market: "TWSE",
        close: 285.5, changeRatio: 0.0179, volumeLots: 3180,
        instNetLots: 1850, instBuyStreak: 5,
        directorHoldingPct: 17.1, directorDataMonth: "2026-04",
        ma20: 270.0, ma20Prev: 268.4, ma20Holdflat5d: 272.5,
        ma60: 262.0, ma60Prev: 261.2, ma60Holdflat5d: 264.8,
        distMa20Ratio: 0.0574, distMa60Ratio: 0.0897
      }
    },
    {
      base: { A: true, B: false },
      signal: {
        stockId: "6488", stockName: "環球晶", market: "TPEx",
        close: 512.0, changeRatio: 0.0254, volumeLots: 1240,
        instNetLots: 640, instBuyStreak: 3,
        directorHoldingPct: 46.96, directorDataMonth: "2026-04",
        ma20: 455.0, ma20Prev: 452.0, ma20Holdflat5d: 470.0,
        ma60: 498.0, ma60Prev: 496.5, ma60Holdflat5d: 503.0,
        distMa20Ratio: 0.1253, distMa60Ratio: 0.0281
      }
    },
    {
      base: { A: false, B: true },
      signal: {
        stockId: "1707", stockName: "葡萄王", market: "TWSE",
        close: 142.0, changeRatio: -0.0035, volumeLots: 380,
        instNetLots: 95, instBuyStreak: 2,
        directorHoldingPct: 22.5, directorDataMonth: "2026-03",
        ma20: 138.5, ma20Prev: 137.9, ma20Holdflat5d: 139.8,
        ma60: 151.0, ma60Prev: 151.6, ma60Holdflat5d: 150.2,
        distMa20Ratio: 0.0253, distMa60Ratio: -0.0596
      }
    },
    {
      base: { A: true, B: false },
      signal: {
        stockId: "8473", stockName: "山林水", market: "TPEx",
        close: 75.8, changeRatio: 0.0093, volumeLots: 210,
        instNetLots: 48, instBuyStreak: 2,
        directorHoldingPct: 31.2, directorDataMonth: "2026-04",
        ma20: 71.0, ma20Prev: 71.4, ma20Holdflat5d: 72.6,
        ma60: 74.2, ma60Prev: 74.0, ma60Holdflat5d: 74.9,
        distMa20Ratio: 0.0676, distMa60Ratio: 0.0216
      }
    }
  ];

  // ---- 格式化工具 ----
  const fmt = {
    // 整數加千分位
    int(n) { return Math.round(n).toLocaleString("en-US"); },
    // 價格：小數依大小，保留 1~2 位
    price(n) {
      const d = n >= 100 ? 1 : 2;
      return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
    },
    pct1(r) { return (r * 100).toFixed(1); },
    pct2(r) { return (r * 100).toFixed(2); },
    // 漲跌幅帶正負號
    changePct(r) {
      const v = (r * 100).toFixed(2);
      return (r > 0 ? "+" : "") + v + "%";
    }
  };

  // 月份是否較舊（非最新董監資料月份）
  function isStaleDirectorMonth(month) {
    return month !== SNAPSHOT.directorDataMonthLatest;
  }

  // 均線趨勢敘述
  function trendText(kind, sig) {
    if (kind === "A") {
      const up = sig.ma60 > sig.ma60Prev;
      return up ? "季線已上彎" : "季線 5 個交易日內扣抵向上";
    } else {
      const up = sig.ma20 > sig.ma20Prev;
      return up ? "月線已上彎" : "月線 5 個交易日內扣抵向上";
    }
  }
  function trendShort(kind, sig) {
    if (kind === "A") return sig.ma60 > sig.ma60Prev ? "已上彎" : "扣抵向上";
    return sig.ma20 > sig.ma20Prev ? "已上彎" : "扣抵向上";
  }

  // 產生「為什麼入選」原因（依當前 n,x 套入門檻文字）
  function reasonsFor(kind, sig, n, x) {
    const dir = fmt.pct1(sig.directorHoldingPct / 100);
    if (kind === "A") {
      return [
        `三大法人連買 ${sig.instBuyStreak} 天（門檻 ≥ ${n} 天）`,
        `董監持股 ${dir}%，達門檻 ${x}%`,
        `股價在季線上方 ${fmt.pct1(sig.distMa60Ratio)}%（位於 0~10% 區間）`,
        trendText("A", sig)
      ];
    }
    return [
      `三大法人連買 ${sig.instBuyStreak} 天（門檻 ≥ ${n} 天）`,
      `董監持股 ${dir}%，達門檻 ${x}%`,
      `股價在月線上方 ${fmt.pct1(sig.distMa20Ratio)}%（位於 0~10% 區間）`,
      trendText("B", sig)
    ];
  }

  // 主篩選：N=連買天數門檻、X=董監持股門檻%
  function runFilter(rows, { n, x }) {
    const out = [];
    for (const r of rows) {
      const s = r.signal;
      const streakOk = s.instBuyStreak >= n;
      const dirOk = s.directorHoldingPct >= x;
      const qualA = r.base.A && streakOk && dirOk;
      const qualB = r.base.B && streakOk && dirOk;
      if (!qualA && !qualB) continue;
      const tag = qualA && qualB ? "A+B" : qualA ? "A" : "B";
      out.push({
        tag, matchA: qualA, matchB: qualB,
        signal: s,
        reasonsA: qualA ? reasonsFor("A", s, n, x) : [],
        reasonsB: qualB ? reasonsFor("B", s, n, x) : []
      });
    }
    const summary = {
      total: out.length,
      countA: out.filter(r => r.matchA).length,
      countB: out.filter(r => r.matchB).length,
      countAB: out.filter(r => r.matchA && r.matchB).length
    };
    return { rows: out, summary };
  }

  // 排序
  function sortRows(rows, sortKey) {
    const arr = rows.slice();
    const rank = t => (t === "A+B" ? 0 : t === "A" ? 1 : 2);
    const cmp = {
      composite: (a, b) =>
        rank(a.tag) - rank(b.tag) ||
        b.signal.instBuyStreak - a.signal.instBuyStreak ||
        b.signal.instNetLots - a.signal.instNetLots,
      streak: (a, b) => b.signal.instBuyStreak - a.signal.instBuyStreak,
      dist: (a, b) => distFor(a) - distFor(b),
      net: (a, b) => b.signal.instNetLots - a.signal.instNetLots,
      vol: (a, b) => b.signal.volumeLots - a.signal.volumeLots,
      director: (a, b) => b.signal.directorHoldingPct - a.signal.directorHoldingPct
    };
    arr.sort(cmp[sortKey] || cmp.composite);
    return arr;
  }
  // 距均線%：A 用季線、B 用月線、A+B 取兩者較小（較貼近）
  function distFor(r) {
    const s = r.signal;
    if (r.matchA && r.matchB) return Math.min(Math.abs(s.distMa60Ratio), Math.abs(s.distMa20Ratio));
    if (r.matchA) return Math.abs(s.distMa60Ratio);
    return Math.abs(s.distMa20Ratio);
  }

  window.TW = {
    SNAPSHOT, FIXED, ROWS, fmt,
    runFilter, sortRows,
    reasonsFor, trendText, trendShort, isStaleDirectorMonth
  };
})();
