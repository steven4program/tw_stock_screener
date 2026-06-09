/* 台股選股器 — 主程式 */
const { useState, useEffect, useMemo } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "skin": "soft",
  "titleFont": "serif",
  "accent": "#1d4ed8"
}/*EDITMODE-END*/;

function applyTheme(t) {
  const root = document.documentElement;
  root.setAttribute("data-skin", t.skin);
  root.style.setProperty("--accent", t.accent);
  // 主色深一階供文字使用
  root.style.setProperty("--accent-ink", t.accent);
  root.style.setProperty("--badge-ab-bg", t.accent);
  root.style.setProperty("--badge-ab-bd", t.accent);
  root.style.setProperty(
    "--font-serif",
    t.titleFont === "sans"
      ? '"Noto Sans TC", system-ui, sans-serif'
      : '"Noto Serif TC", "Songti TC", serif'
  );
  root.style.setProperty("--serif-weight", t.titleFont === "sans" ? "800" : "700");
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  useEffect(() => { applyTheme(t); }, [t.skin, t.titleFont, t.accent]);

  const [scenario, setScenario] = useState("success");
  const [n, setN] = useState(2);
  const [x, setX] = useState(15);
  const [tab, setTab] = useState("all");
  const [sort, setSort] = useState("composite");
  const [open, setOpen] = useState({});   // 展開的股票 id

  const { ROWS, runFilter, sortRows, SNAPSHOT, FIXED } = window.TW;

  // 顯示用資料日期：未更新 / 失敗 → 沿用上次成功
  const shownDate = (scenario === "stale" || scenario === "failed")
    ? SNAPSHOT.lastSuccessDate : SNAPSHOT.dataDate;

  const { rows, summary } = useMemo(() => runFilter(ROWS, { n, x }), [n, x]);

  // 分頁過濾
  const tabRows = useMemo(() => {
    let r = rows;
    if (tab === "A") r = rows.filter(x => x.matchA);
    else if (tab === "B") r = rows.filter(x => x.matchB);
    else if (tab === "AB") r = rows.filter(x => x.matchA && x.matchB);
    return sortRows(r, sort);
  }, [rows, tab, sort]);

  // 空清單示範：強制清空
  const forceEmpty = scenario === "empty";
  const listRows = forceEmpty ? [] : tabRows;

  const toggle = id => setOpen(o => ({ ...o, [id]: !o[id] }));

  return (
    <div className="app">
      <DemoBar scenario={scenario} onChange={setScenario} />

      <div className="app-title">
        <h1 className="serif">台股選股器</h1>
        <span className="sub">每日收盤後・上市＋上櫃技術選股</span>
      </div>

      <StatusBar scenario={scenario} snapshot={{ ...SNAPSHOT, dataDate: shownDate }} />

      <ParamPanel n={n} x={x} onN={setN} onX={setX} dataDate={shownDate} fixed={FIXED} />

      <StatsRow summary={forceEmpty ? { total: 0, countA: 0, countB: 0, countAB: 0 } : summary} />

      <Tabs tab={tab} onTab={setTab}
            summary={forceEmpty ? { total: 0, countA: 0, countB: 0, countAB: 0 } : summary} />

      <SortBar sort={sort} onSort={setSort} count={listRows.length} />

      <div className="list-head">
        <span>代號 / 名稱</span>
        <span>收盤價 / 漲跌</span>
        <span>法人連買</span>
        <span>買超 / 成交量</span>
        <span>董監持股</span>
        <span></span>
      </div>

      {listRows.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="list">
          {listRows.map(row => (
            <StockItem key={row.signal.stockId} row={row} tab={tab}
                       expanded={!!open[row.signal.stockId]}
                       onToggle={() => toggle(row.signal.stockId)} />
          ))}
        </div>
      )}

      <Footer />

      <TweaksPanel>
        <TweakSection label="版面風格" />
        <TweakSelect label="風格" value={t.skin}
          options={[
            { value: "soft", label: "柔卡 App（淺灰圓角）" },
            { value: "paper", label: "報紙財經（暖白硬邊）" },
            { value: "bold", label: "大字高對比" }
          ]}
          onChange={v => setTweak("skin", v)} />
        <TweakSection label="字體與主色" />
        <TweakRadio label="標題字體" value={t.titleFont}
          options={[{ value: "serif", label: "宋體" }, { value: "sans", label: "黑體" }]}
          onChange={v => setTweak("titleFont", v)} />
        <TweakColor label="介面主色" value={t.accent}
          options={["#1d4ed8", "#1b3a6b", "#0f766e", "#b45309"]}
          onChange={v => setTweak("accent", v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
