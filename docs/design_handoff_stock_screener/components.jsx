/* 台股選股器 — UI 元件
 * 依賴 window.TW（data.js）。所有元件最後掛到 window 供 App.jsx 使用。
 */
const { useState } = React;
const F = window.TW.fmt;

/* ---------- 示範狀態切換條（讓使用者看五種狀態）---------- */
function DemoBar({ scenario, onChange }) {
  const items = [
    ["success", "成功"],
    ["stale", "未更新"],
    ["partial", "部分成功"],
    ["failed", "更新失敗"],
    ["empty", "空清單"]
  ];
  return (
    <div className="demo-bar">
      <span className="demo-label">🎛 示範：切換資料狀態</span>
      <div className="demo-seg" role="group" aria-label="切換示範狀態">
        {items.map(([k, label]) => (
          <button key={k} aria-pressed={scenario === k} onClick={() => onChange(k)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- 頂部更新狀態列 ---------- */
function StatusBar({ scenario, snapshot }) {
  const today = snapshot.dataDate;
  const last = snapshot.lastSuccessDate;
  let tone = "ok", ico = "✅", main = "", sub = null;

  if (scenario === "stale") {
    tone = "warn"; ico = "⚠️";
    main = `今日尚未更新（沿用 ${last} 資料）`;
  } else if (scenario === "failed") {
    tone = "bad"; ico = "⛔";
    main = `今日更新失敗（顯示為上次成功資料 ${last}）`;
  } else if (scenario === "partial") {
    tone = "ok"; ico = "✅";
    main = `今日已更新 ・ 資料日期 ${today}`;
    sub = "⚠️ 董監資料沿用 2026-04 月份";
  } else {
    tone = "ok"; ico = "✅";
    main = `今日已更新 ・ 資料日期 ${today}`;
  }
  return (
    <div className="status card" data-tone={tone} role="status" aria-live="polite">
      <span className="ico" aria-hidden="true">{ico}</span>
      <div className="st-text">
        <div className="st-main">{main}</div>
        {sub && <span className="st-sub">{sub}</span>}
      </div>
    </div>
  );
}

/* ---------- 大顆 +/− 步進器 ---------- */
function Stepper({ value, min, max, unit, onChange }) {
  return (
    <div className="stepper">
      <button className="step-btn" aria-label="減少" disabled={value <= min}
              onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <div className="step-val num">{value}{unit && <span className="unit">{unit}</span>}</div>
      <button className="step-btn" aria-label="增加" disabled={value >= max}
              onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}

/* ---------- 參數區 ---------- */
function ParamPanel({ n, x, onN, onX, dataDate, fixed }) {
  return (
    <section className="params card" aria-label="篩選參數">
      <div className="params-head">
        <h2 className="serif">篩選參數</h2>
        <span className="data-date">資料日期 <b className="num">{dataDate}</b></span>
      </div>
      <div className="param-grid">
        <div className="param">
          <div className="p-name">法人連買天數 <b>N</b></div>
          <Stepper value={n} min={1} max={10} unit="天" onChange={onN} />
          <div className="p-range">可調範圍 1–10　預設 2</div>
        </div>
        <div className="param">
          <div className="p-name">董監持股門檻 <b>X</b></div>
          <Stepper value={x} min={5} max={50} unit="%" onChange={onX} />
          <div className="p-range">可調範圍 5–50　預設 15</div>
        </div>
      </div>
      <div className="fixed-params">
        <span className="fp-label">固定條件</span>
        <span className="fixed-chip">距均線 {fixed.distLow}~{fixed.distHigh}%</span>
        <span className="fixed-chip">月線 {fixed.ma20}MA</span>
        <span className="fixed-chip">季線 {fixed.ma60}MA</span>
        <span className="fixed-chip">扣抵 {fixed.holdflatDays} 個交易日</span>
      </div>
    </section>
  );
}

/* ---------- 統計列 ---------- */
function StatsRow({ summary }) {
  const items = [
    ["全部", summary.total, false],
    ["A 季線型", summary.countA, false],
    ["B 月線型", summary.countB, false],
    ["A+B 同時", summary.countAB, true]
  ];
  return (
    <div className="stats">
      {items.map(([lab, num, ab]) => (
        <div key={lab} className={"stat" + (ab ? " is-ab" : "")}>
          <div className="s-num num">{num} <span style={{ fontSize: "16px", fontWeight: 600, color: "var(--ink-2)" }}>檔</span></div>
          <div className="s-lab">{lab}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------- 分頁 ---------- */
function Tabs({ tab, onTab, summary }) {
  const items = [
    ["all", "全部", summary.total],
    ["A", "A 季線型", summary.countA],
    ["B", "B 月線型", summary.countB],
    ["AB", "A+B 同時符合", summary.countAB]
  ];
  return (
    <div className="tabs" role="tablist" aria-label="分類">
      {items.map(([k, label, c]) => (
        <button key={k} role="tab" aria-selected={tab === k} className="tab" onClick={() => onTab(k)}>
          {label}<span className="t-count num">{c}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------- 排序控制 ---------- */
function SortBar({ sort, onSort, count }) {
  const opts = [
    ["composite", "綜合排序"],
    ["streak", "連買天數"],
    ["dist", "距均線%"],
    ["net", "買超張數"],
    ["vol", "成交量"],
    ["director", "董監持股%"]
  ];
  return (
    <div className="sortbar">
      <label className="s-label" htmlFor="sortsel">排序</label>
      <select id="sortsel" className="sort-select" value={sort} onChange={e => onSort(e.target.value)}>
        {opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <span className="list-meta num">共 {count} 檔</span>
    </div>
  );
}

/* ---------- 漲跌幅 ---------- */
function Change({ r }) {
  const cls = r > 0 ? "up" : r < 0 ? "down" : "flat";
  const arrow = r > 0 ? "▲" : r < 0 ? "▼" : "—";
  return <span className={"chg num " + cls}>{arrow} {F.changePct(r)}</span>;
}

/* ---------- 均線單行（展開內）---------- */
function MaLine({ kind, sig }) {
  const isA = kind === "A";
  const name = isA ? "季線(60MA)" : "月線(20MA)";
  const val = isA ? sig.ma60 : sig.ma20;
  const dist = isA ? sig.distMa60Ratio : sig.distMa20Ratio;
  const status = window.TW.trendShort(kind, sig);
  const sign = dist >= 0 ? "+" : "";
  return (
    <div className="ma-line num">
      <span>{name} <b>{F.price(val)}</b></span>
      <span>距均線 <b>{sign}{F.pct1(dist)}%</b></span>
      <span>狀態 <b>{status === "已上彎" ? "↑ 已上彎" : "↗ 扣抵向上"}</b></span>
    </div>
  );
}

/* ---------- 原因群組 ---------- */
function ReasonGroup({ kind, sig, reasons }) {
  const isA = kind === "A";
  return (
    <div className="reason-group">
      <div className="rg-head">
        <span className={"badge " + (isA ? "a" : "b")}>{isA ? "A 季線型" : "B 月線型"}</span>
        <span className="rg-title serif">{isA ? "為什麼符合季線型" : "為什麼符合月線型"}</span>
      </div>
      <MaLine kind={kind} sig={sig} />
      <ul className="reason-list">
        {reasons.map((t, i) => (
          <li key={i}><span className="tick" aria-hidden="true">✓</span><span>{t}</span></li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- 董監持股欄（含月份較舊提示）---------- */
function DirectorCell({ sig }) {
  const stale = window.TW.isStaleDirectorMonth(sig.directorDataMonth);
  return (
    <div className="cell director m-cell">
      <span className="col-label">董監持股</span>
      <div className="c-num num">{F.pct1(sig.directorHoldingPct / 100)}%</div>
      <div className="c-sub num">
        {stale
          ? <span className="director-stale">⚠ {sig.directorDataMonth}・資料較舊</span>
          : <span>{sig.directorDataMonth}</span>}
      </div>
    </div>
  );
}

/* ---------- 單檔股票（列 / 卡片，含展開）---------- */
function StockItem({ row, tab, expanded, onToggle }) {
  const s = row.signal;
  const badge = row.tag === "A+B"
    ? <span className="badge ab">★ A+B</span>
    : row.tag === "A"
      ? <span className="badge a">A 季線型</span>
      : <span className="badge b">B 月線型</span>;

  // 依分頁決定展開時顯示哪幾組原因
  let groups = [];
  if (tab === "A") { if (row.matchA) groups = ["A"]; }
  else if (tab === "B") { if (row.matchB) groups = ["B"]; }
  else if (tab === "AB") { groups = ["A", "B"]; }
  else { if (row.matchA) groups.push("A"); if (row.matchB) groups.push("B"); }

  return (
    <article className="srow card" data-screen-label={`股票 ${s.stockId}`}>
      <div className="srow-main">
        {/* 名稱 */}
        <div className="s-name-wrap">
          <div className="s-id-name">
            <span className="s-id num">{s.stockId}</span>
            <span className="s-name serif">{s.stockName}</span>
          </div>
          <span className="s-market">{s.market === "TWSE" ? "上市" : "上櫃"}</span>
          <div className="s-badges">{badge}</div>
        </div>

        {/* 收盤 + 漲跌 */}
        <div className="cell price m-cell">
          <span className="col-label">收盤價</span>
          <div className="c-num num">{F.price(s.close)}</div>
          <Change r={s.changeRatio} />
        </div>

        {/* 連買天數 */}
        <div className="cell streak m-cell">
          <span className="col-label">法人連買</span>
          <div className="c-num num"><span className="big">連買 {s.instBuyStreak}</span> 天</div>
        </div>

        {/* 買超張數 + 成交量 */}
        <div className="cell m-cell">
          <span className="col-label">買超 / 成交量</span>
          <div className="c-num num">{F.int(s.instNetLots)} 張</div>
          <div className="c-sub num">量 {F.int(s.volumeLots)} 張</div>
        </div>

        {/* 董監持股 */}
        <DirectorCell sig={s} />

        {/* 看原因 */}
        <div className="cell action m-cell">
          <button className="reason-btn" aria-expanded={expanded}
                  onClick={onToggle}>
            {expanded ? "收合" : "看原因"} <span className="chev" aria-hidden="true">▾</span>
          </button>
        </div>
      </div>

      {expanded && (
        <div className={"reasons" + (groups.length > 1 ? " two" : "")}>
          {groups.map(k => (
            <ReasonGroup key={k} kind={k} sig={s}
                         reasons={k === "A" ? row.reasonsA : row.reasonsB} />
          ))}
        </div>
      )}
    </article>
  );
}

/* ---------- 空狀態 ---------- */
function EmptyState({ tab }) {
  const labelMap = { all: "符合條件", A: "A 季線型", B: "B 月線型", AB: "A+B 同時符合" };
  return (
    <div className="empty card">
      <div className="e-ico" aria-hidden="true">🔍</div>
      <div className="e-title serif">今日無{labelMap[tab] || "符合條件"}的股票</div>
      <div className="e-sub">可試著調低「法人連買天數 N」或「董監持股門檻 X%」，<br />放寬條件後再看看。</div>
    </div>
  );
}

/* ---------- 頁尾免責 ---------- */
function Footer() {
  return (
    <footer className="footer">
      <div className="f-title">ℹ️ 免責聲明</div>
      本工具僅為個人選股資訊整理，<b>不構成任何投資建議</b>。資料可能延遲或缺漏，
      實際交易請以官方公告與券商資訊為準，投資前請自行評估風險。
    </footer>
  );
}

Object.assign(window, {
  DemoBar, StatusBar, ParamPanel, StatsRow, Tabs, SortBar,
  StockItem, EmptyState, Footer
});
