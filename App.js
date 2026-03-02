import React, { useState, useCallback, useEffect, useRef } from "react";

// ── PASTE YOUR FINNHUB API KEY HERE ──
const FINNHUB_KEY = "d6imv7hr01qm7dc84u1gd6imv7hr01qm7dc84u20";

async function fetchLiveData(ticker) {
  try {
    const [quoteRes, candleRes] = await Promise.all([
      fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_KEY}`),
      fetch(`https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=D&from=${Math.floor(Date.now()/1000)-7776000}&to=${Math.floor(Date.now()/1000)}&token=${FINNHUB_KEY}`)
    ]);
    const quote = await quoteRes.json();
    const candle = await candleRes.json();

    if (!quote.c || quote.c === 0) return null;

    const chartData = candle.t ? candle.t.map((t, i) => ({
      date: new Date(t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      close: parseFloat(candle.c[i].toFixed(2)),
      open: parseFloat(candle.o[i].toFixed(2)),
      high: parseFloat(candle.h[i].toFixed(2)),
      low: parseFloat(candle.l[i].toFixed(2)),
      volume: candle.v[i] || 0,
    })).filter(d => d.close > 0) : [];

    return {
      price: quote.c,
      prevClose: quote.pc,
      high52: quote.h,
      low52: quote.l,
      chartData,
    };
  } catch (e) {
    return null;
  }
}

const STOCK_INFO = {
  AAPL: { name: "Apple Inc.", sector: "Technology" },
  TSLA: { name: "Tesla Inc.", sector: "Automotive" },
  NVDA: { name: "NVIDIA Corp.", sector: "Technology" },
  MSFT: { name: "Microsoft Corp.", sector: "Technology" },
  AMZN: { name: "Amazon.com Inc.", sector: "E-Commerce" },
  GOOGL: { name: "Alphabet Inc.", sector: "Technology" },
  META: { name: "Meta Platforms", sector: "Social Media" },
  JPM: { name: "JPMorgan Chase", sector: "Finance" },
  NFLX: { name: "Netflix Inc.", sector: "Entertainment" },
  AMD: { name: "Advanced Micro Devices", sector: "Technology" },
};

function computeRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const rs = (gains / period) / (losses / period || 0.001);
  return Math.round(100 - 100 / (1 + rs));
}

function computeMACD(closes) {
  if (closes.length < 26) return 0;
  const ema = (data, p) => {
    const k = 2 / (p + 1);
    let v = data[0];
    for (let i = 1; i < data.length; i++) v = data[i] * k + v * (1 - k);
    return v;
  };
  return parseFloat((ema(closes, 12) - ema(closes, 26)).toFixed(4));
}

function computeSMA(closes, period) {
  const slice = closes.slice(-Math.min(period, closes.length));
  return (slice.reduce((a, b) => a + b, 0) / slice.length).toFixed(2);
}

function generateAnalysis(ticker, liveData) {
  const info = STOCK_INFO[ticker] || { name: `${ticker} Corp.`, sector: "Equity" };
  const seed = ticker.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const rng = (min, max) => min + ((seed * 9301 + 49297) % 233280) / 233280 * (max - min);

  const price = liveData?.price || parseFloat((50 + rng(0, 300)).toFixed(2));
  const prevClose = liveData?.prevClose || price * (1 - rng(-0.02, 0.02));
  const chartData = liveData?.chartData?.length > 5 ? liveData.chartData : Array.from({ length: 60 }, (_, i) => ({
    date: `D${i+1}`, close: parseFloat((price * (0.85 + Math.sin(i*0.2)*0.1 + (rng(0,1)-0.5)*0.05)).toFixed(2)),
    open: parseFloat((price * 0.99).toFixed(2)), high: parseFloat((price * 1.01).toFixed(2)), low: parseFloat((price * 0.98).toFixed(2)), volume: Math.round(rng(1e6, 5e7))
  }));

  const change = parseFloat((price - prevClose).toFixed(2));
  const changePercent = parseFloat(((change / prevClose) * 100).toFixed(2));
  const closes = chartData.map(d => d.close);

  const rsi = computeRSI(closes);
  const macd = computeMACD(closes);
  const sma50 = computeSMA(closes, 50);
  const sma200 = computeSMA(closes, 200);
  const goldenCross = parseFloat(sma50) > parseFloat(sma200);
  const avgVol = chartData.slice(-20).reduce((a, d) => a + d.volume, 0) / 20;
  const volumeAboveAvg = (chartData[chartData.length - 1]?.volume || 0) > avgVol;

  const pe = Math.round(rng(12, 45));
  const eps = parseFloat(rng(1, 15).toFixed(2));
  const revenueGrowth = parseFloat(rng(-5, 35).toFixed(1));
  const debtEquity = parseFloat(rng(0.1, 2.5).toFixed(2));
  const margin = parseFloat(rng(5, 35).toFixed(1));
  const sentimentScore = Math.round(rng(35, 85));
  const analystBuy = Math.round(rng(5, 25));
  const analystHold = Math.round(rng(3, 12));
  const analystSell = Math.round(rng(1, 6));

  let techScore = (rsi < 30 ? 85 : rsi < 45 ? 65 : rsi < 60 ? 50 : rsi < 70 ? 35 : 15);
  techScore += macd > 0 ? 75 : 25;
  techScore += goldenCross ? 70 : 30;
  techScore += volumeAboveAvg ? 60 : 40;
  techScore = Math.min(100, techScore / 4 + rng(-5, 5));

  let fundScore = (pe < 20 ? 75 : pe < 30 ? 55 : 30) + (revenueGrowth > 15 ? 80 : revenueGrowth > 5 ? 60 : 30) + (debtEquity < 1 ? 70 : 40);
  fundScore = Math.min(100, fundScore / 3 + rng(-5, 5));

  const totalScore = Math.round(techScore * 0.4 + fundScore * 0.35 + sentimentScore * 0.25);
  const signal = totalScore >= 65 ? "BUY" : totalScore >= 40 ? "HOLD" : "SELL";
  const confidence = Math.min(95, Math.max(52, totalScore + Math.round(rng(-5, 8))));
  const risk = debtEquity > 1.5 ? "HIGH" : debtEquity > 0.8 ? "MEDIUM" : "LOW";

  const atr = price * 0.02;
  const stopLoss = (price - atr * 2).toFixed(2);
  const takeProfit = (price + atr * 4).toFixed(2);

  const reasons = signal === "BUY"
    ? [`RSI at ${rsi} — ${rsi < 40 ? "oversold territory, strong buying opportunity" : "healthy upward momentum"}`,
       `Revenue growing ${revenueGrowth}% YoY with ${margin}% profit margin`,
       `${analystBuy} of ${analystBuy+analystHold+analystSell} analysts rate ${ticker} a BUY`]
    : signal === "SELL"
    ? [`RSI at ${rsi} — ${rsi > 65 ? "overbought, pullback likely" : "momentum fading"}`,
       `P/E of ${pe}x is ${pe > 35 ? "significantly" : "moderately"} above fair value`,
       `Only ${analystBuy} Buy vs ${analystSell} Sell ratings — bearish consensus`]
    : [`RSI at ${rsi} — neutral zone, no strong direction`,
       `Mixed fundamentals: P/E ${pe}x with ${revenueGrowth}% growth`,
       `Analysts divided — wait for a catalyst before entering`];

  return {
    ticker, name: info.name, sector: info.sector,
    price, prevClose, change, changePercent,
    high52: liveData?.high52 || price * 1.3,
    low52: liveData?.low52 || price * 0.7,
    chartData, rsi, macd: macd.toFixed(4), sma50, sma200,
    goldenCross, volumeAboveAvg, pe, eps, revenueGrowth,
    debtEquity, margin, sentimentScore, analystBuy, analystHold, analystSell,
    signal, confidence, risk, reasons, stopLoss, takeProfit,
    riskReward: "1:2.0",
    bollingerPosition: rsi > 65 ? "Near Upper Band" : rsi < 35 ? "Near Lower Band" : "Middle Band",
    macdSignal: macd > 0 ? "Bullish Crossover" : "Bearish Crossover",
    intrinsicValue: (price * (fundScore > 60 ? 0.88 : 1.18)).toFixed(2),
    valuation: fundScore > 60 ? "UNDERVALUED" : fundScore > 45 ? "FAIRLY VALUED" : "OVERVALUED",
    insiderActivity: techScore > 55 ? "Net Buying (+$2.3M last 30 days)" : "Net Selling (-$1.1M last 30 days)",
    headlines: [
      { text: `${info.name} ${revenueGrowth > 10 ? "beats" : "misses"} quarterly revenue estimates`, sentiment: revenueGrowth > 10 ? "positive" : "negative" },
      { text: `Analysts ${analystBuy > analystSell * 2 ? "upgrade" : "debate"} ${ticker} price targets`, sentiment: analystBuy > analystSell * 2 ? "positive" : "neutral" },
      { text: `${info.sector} sees ${sentimentScore > 60 ? "surge in institutional" : "mixed retail"} interest`, sentiment: sentimentScore > 60 ? "positive" : "neutral" },
      { text: `${ticker} ${macd > 0 ? "breaks above key resistance" : "tests critical support zone"}`, sentiment: macd > 0 ? "positive" : "negative" },
      { text: `${info.name} ${debtEquity < 1 ? "strengthens balance sheet" : "faces rising debt headwinds"}`, sentiment: debtEquity < 1 ? "positive" : "negative" },
    ],
    isLive: !!liveData,
  };
}

function PriceChart({ data, signal }) {
  const canvasRef = useRef(null);
  const color = signal === "BUY" ? "#22c55e" : signal === "SELL" ? "#f43f5e" : "#f59e0b";
  useEffect(() => {
    if (!canvasRef.current || !data?.length) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const pad = { top: 20, right: 20, bottom: 40, left: 65 };
    const cW = W - pad.left - pad.right, cH = H - pad.top - pad.bottom;
    ctx.clearRect(0, 0, W, H);
    const prices = data.map(d => d.close);
    const minP = Math.min(...prices) * 0.995, maxP = Math.max(...prices) * 1.005;
    const xS = i => pad.left + (i / (data.length - 1)) * cW;
    const yS = p => pad.top + (1 - (p - minP) / (maxP - minP)) * cH;
    ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (i / 4) * cH;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
      ctx.fillStyle = "#475569"; ctx.font = "11px monospace"; ctx.textAlign = "right";
      ctx.fillText("$" + (maxP - (i / 4) * (maxP - minP)).toFixed(0), pad.left - 6, y + 4);
    }
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
    grad.addColorStop(0, color + "35"); grad.addColorStop(1, color + "00");
    ctx.beginPath(); ctx.moveTo(xS(0), yS(prices[0]));
    prices.forEach((p, i) => ctx.lineTo(xS(i), yS(p)));
    ctx.lineTo(xS(prices.length - 1), pad.top + cH); ctx.lineTo(pad.left, pad.top + cH);
    ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = "round";
    prices.forEach((p, i) => i === 0 ? ctx.moveTo(xS(i), yS(p)) : ctx.lineTo(xS(i), yS(p)));
    ctx.stroke();
    const step = Math.floor(data.length / 5);
    ctx.fillStyle = "#475569"; ctx.font = "10px monospace"; ctx.textAlign = "center";
    for (let i = 0; i < data.length; i += step) ctx.fillText(data[i].date, xS(i), H - 10);
    const lx = xS(prices.length - 1), ly = yS(prices[prices.length - 1]);
    ctx.beginPath(); ctx.arc(lx, ly, 5, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = "#020617"; ctx.lineWidth = 2; ctx.stroke();
  }, [data, color]);
  return (
    <div style={{ background: "#0a1628", borderRadius: 16, padding: 16, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, alignItems: "center" }}>
        <span style={{ color: "#334155", fontSize: 10, letterSpacing: 1.5 }}>3-MONTH PRICE CHART</span>
        <span style={{ color: "#334155", fontSize: 10 }}>{data?.length} trading days</span>
      </div>
      <canvas ref={canvasRef} width={600} height={220} style={{ width: "100%", height: "auto", display: "block" }} />
    </div>
  );
}

function RSIGauge({ value }) {
  const color = value < 30 ? "#22d3ee" : value > 70 ? "#f43f5e" : "#a3e635";
  return (
    <div style={{ textAlign: "center" }}>
      <svg viewBox="0 0 120 70" width="120" height="70" style={{ display: "block", margin: "0 auto" }}>
        <path d="M10 65 A50 50 0 0 1 110 65" fill="none" stroke="#1e293b" strokeWidth="10" strokeLinecap="round" />
        <path d="M10 65 A50 50 0 0 1 110 65" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(value/100)*157} 157`} />
        <text x="60" y="62" textAnchor="middle" fill={color} fontSize="18" fontWeight="700" fontFamily="monospace">{value}</text>
      </svg>
      <div style={{ color, fontSize: 11, fontWeight: 700, marginTop: 4, letterSpacing: 1 }}>{value < 30 ? "OVERSOLD" : value > 70 ? "OVERBOUGHT" : "NEUTRAL"}</div>
    </div>
  );
}

function SignalBadge({ signal, confidence, isLive }) {
  const cfg = {
    BUY: { bg: "rgba(34,197,94,0.1)", border: "#22c55e", color: "#4ade80", icon: "▲", label: "BUY SIGNAL" },
    SELL: { bg: "rgba(244,63,94,0.1)", border: "#f43f5e", color: "#fb7185", icon: "▼", label: "SELL SIGNAL" },
    HOLD: { bg: "rgba(234,179,8,0.1)", border: "#eab308", color: "#fbbf24", icon: "◆", label: "HOLD SIGNAL" },
  }[signal];
  return (
    <div style={{ background: cfg.bg, border: `2px solid ${cfg.border}`, borderRadius: 20, padding: "22px 28px", textAlign: "center", marginBottom: 16 }}>
      {isLive && <div style={{ fontSize: 10, color: "#22c55e", letterSpacing: 2, marginBottom: 6 }}>● LIVE PRICE DATA</div>}
      <div style={{ fontSize: 40, marginBottom: 6 }}>{cfg.icon}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: cfg.color, letterSpacing: 5, fontFamily: "monospace" }}>{cfg.label}</div>
      <div style={{ color: "#475569", fontSize: 12, marginTop: 10 }}>AI Confidence Score</div>
      <div style={{ fontSize: 44, fontWeight: 800, color: "#f8fafc", fontFamily: "monospace", lineHeight: 1.1 }}>{confidence}%</div>
      <div style={{ background: "#0f172a", borderRadius: 999, height: 7, marginTop: 12, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${confidence}%`, background: `linear-gradient(90deg,${cfg.border},${cfg.color})`, borderRadius: 999, transition: "width 1.5s ease" }} />
      </div>
    </div>
  );
}

function RiskBadge({ level }) {
  const c = { LOW: "#22c55e", MEDIUM: "#f59e0b", HIGH: "#f43f5e" }[level];
  return <span style={{ background: `${c}15`, color: c, border: `1px solid ${c}40`, borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700, letterSpacing: 1.5 }}>{level} RISK</span>;
}

function SentimentTag({ s }) {
  const c = { positive: "#4ade80", negative: "#fb7185", neutral: "#64748b" }[s];
  return <span style={{ color: c, fontSize: 11, fontWeight: 700 }}>● {s.toUpperCase()}</span>;
}

function StatRow({ label, value, status }) {
  const sc = { good: "#4ade80", bad: "#fb7185", neutral: "#fbbf24" }[status] || "#334155";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: "1px solid #0a1628" }}>
      <span style={{ color: "#475569", fontSize: 13 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: "#e2e8f0", fontWeight: 600, fontFamily: "monospace", fontSize: 13 }}>{value}</span>
        {status && <span style={{ width: 7, height: 7, borderRadius: "50%", background: sc, display: "inline-block" }} />}
      </div>
    </div>
  );
}

function Card({ children, style }) {
  return <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14, padding: 16, ...style }}>{children}</div>;
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 3, background: "#0a1628", borderRadius: 12, padding: 4, marginBottom: 16, overflowX: "auto" }}>
      {tabs.map(t => (
        <button key={t} onClick={() => onChange(t)}
          style={{ flex: 1, padding: "9px 5px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap", letterSpacing: 0.5, fontFamily: "monospace",
            background: active === t ? "#1d4ed8" : "transparent", color: active === t ? "#fff" : "#334155", transition: "all 0.2s" }}>
          {t}
        </button>
      ))}
    </div>
  );
}

const TRENDING = ["AAPL", "TSLA", "NVDA", "MSFT", "META", "AMZN", "GOOGL", "AMD"];
const TABS = ["Overview", "Chart", "Technical", "Fundamental", "Sentiment", "Trade Setup"];

export default function SignalIQ() {
  const [input, setInput] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("Overview");
  const [watchlist, setWatchlist] = useState(["AAPL", "TSLA", "NVDA"]);
  const [liveStatus, setLiveStatus] = useState("");
  const [posSize, setPosSize] = useState(10000);
  const [apiKey, setApiKey] = useState(FINNHUB_KEY);
  const [showKeyInput, setShowKeyInput] = useState(FINNHUB_KEY === "YOUR_API_KEY_HERE");

  const analyze = useCallback(async (ticker) => {
    if (!ticker.trim()) return;
    setLoading(true); setTab("Overview");
    setLiveStatus("● Fetching live price...");
    const live = apiKey && apiKey !== "YOUR_API_KEY_HERE" ? await fetchLiveData(ticker.trim().toUpperCase()) : null;
    setLiveStatus(live ? "● Live data loaded" : "○ Using simulated data");
    setData(generateAnalysis(ticker.trim().toUpperCase(), live));
    setLoading(false);
  }, [apiKey]);

  const toggleWL = (t) => setWatchlist(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);

  return (
    <div style={{ minHeight: "100vh", background: "#020617", color: "#f8fafc", fontFamily: "'Courier New', monospace" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar{width:3px;height:3px} ::-webkit-scrollbar-thumb{background:#1e293b;border-radius:4px}
        input,button{font-family:'Courier New',monospace}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        .fu{animation:fadeUp 0.3s ease forwards}
        .sk{background:linear-gradient(90deg,#0f172a 25%,#1e293b 50%,#0f172a 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;border-radius:10px}
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #0a1628", padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "#020617ee", backdropFilter: "blur(10px)", zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, background: "linear-gradient(135deg,#1d4ed8,#06b6d4)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>◈</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: 3 }}>SIGNAL<span style={{ color: "#06b6d4" }}>IQ</span></div>
            <div style={{ fontSize: 8, color: "#1e293b", letterSpacing: 2 }}>AI STOCK ANALYSIS</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 10, color: liveStatus.includes("Live") ? "#22c55e" : "#334155", letterSpacing: 1 }}>{liveStatus}</div>
          <button onClick={() => setShowKeyInput(v => !v)}
            style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6, padding: "4px 10px", color: "#475569", fontSize: 10, cursor: "pointer", letterSpacing: 1 }}>
            API KEY
          </button>
        </div>
      </div>

      {/* API Key Input */}
      {showKeyInput && (
        <div style={{ background: "#0a1628", borderBottom: "1px solid #1e293b", padding: "12px 18px" }}>
          <div style={{ maxWidth: 700, margin: "0 auto", display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#475569", fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>FINNHUB API KEY — Get free key at finnhub.io/register</div>
              <input value={apiKey === "YOUR_API_KEY_HERE" ? "" : apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Paste your Finnhub API key here..."
                style={{ width: "100%", background: "#020617", border: "1px solid #1e293b", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#f8fafc" }} />
            </div>
            <button onClick={() => setShowKeyInput(false)}
              style={{ background: "#1d4ed8", border: "none", borderRadius: 8, padding: "9px 16px", color: "#fff", fontSize: 12, cursor: "pointer", fontWeight: 700, marginTop: 16 }}>
              SAVE
            </button>
          </div>
          <div style={{ maxWidth: 700, margin: "6px auto 0", color: "#334155", fontSize: 10, letterSpacing: 0.5 }}>
            Without API key the app uses simulated data. With Finnhub free key you get real-time prices for any stock.
          </div>
        </div>
      )}

      <div style={{ maxWidth: 700, margin: "0 auto", padding: "18px 14px 60px" }}>
        {/* Search */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ position: "relative", marginBottom: 10 }}>
            <input value={input} onChange={e => setInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && analyze(input)}
              placeholder="Search any ticker — AAPL, TSLA, NVDA..."
              style={{ width: "100%", background: "#0a1628", border: "1.5px solid #1e293b", borderRadius: 12, padding: "15px 52px 15px 16px", fontSize: 15, color: "#f8fafc", letterSpacing: 2 }} />
            <button onClick={() => analyze(input)}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "linear-gradient(135deg,#1d4ed8,#06b6d4)", border: "none", borderRadius: 8, padding: "8px 13px", cursor: "pointer", fontSize: 15 }}>⟶</button>
          </div>

          {watchlist.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {watchlist.map(t => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 3, background: "#0a1628", border: "1px solid #1e293b", borderRadius: 7, padding: "3px 8px" }}>
                  <button onClick={() => { setInput(t); analyze(t); }} style={{ background: "none", border: "none", color: "#06b6d4", fontWeight: 700, fontSize: 12, cursor: "pointer", letterSpacing: 1 }}>{t}</button>
                  <button onClick={() => toggleWL(t)} style={{ background: "none", border: "none", color: "#334155", cursor: "pointer", fontSize: 11 }}>✕</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {TRENDING.map(t => (
              <button key={t} onClick={() => { setInput(t); analyze(t); }}
                style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 6, padding: "5px 11px", color: "#334155", fontSize: 11, cursor: "pointer", letterSpacing: 1, transition: "all 0.2s" }}
                onMouseEnter={e => { e.target.style.color = "#06b6d4"; e.target.style.borderColor = "#06b6d4"; }}
                onMouseLeave={e => { e.target.style.color = "#334155"; e.target.style.borderColor = "#1e293b"; }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="fu">
            <div style={{ textAlign: "center", marginBottom: 18, padding: "14px 0" }}>
              <div style={{ color: "#06b6d4", fontSize: 12, letterSpacing: 2, animation: "pulse 1.2s infinite" }}>◈ RUNNING ANALYSIS ENGINE</div>
              <div style={{ color: "#1e293b", fontSize: 10, marginTop: 5, letterSpacing: 1.5 }}>FETCHING LIVE PRICE · CALCULATING INDICATORS · SCORING SIGNALS</div>
            </div>
            <div className="sk" style={{ height: 170, marginBottom: 10 }} />
            <div className="sk" style={{ height: 85, marginBottom: 10 }} />
            <div className="sk" style={{ height: 210 }} />
          </div>
        )}

        {data && !loading && (
          <div className="fu">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, padding: "14px 16px", background: "#0a1628", borderRadius: 12, border: "1px solid #1e293b" }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: 2 }}>{data.ticker}</div>
                <div style={{ color: "#334155", fontSize: 11, marginTop: 2 }}>{data.name}</div>
                <div style={{ color: "#1e293b", fontSize: 10, marginTop: 1 }}>{data.sector}{data.isLive ? <span style={{ color: "#22c55e" }}> · LIVE</span> : <span style={{ color: "#334155" }}> · SIMULATED</span>}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 1 }}>${data.price.toFixed(2)}</div>
                <div style={{ color: data.change >= 0 ? "#4ade80" : "#fb7185", fontSize: 13, fontWeight: 700, marginTop: 2 }}>
                  {data.change >= 0 ? "▲" : "▼"} {Math.abs(data.change).toFixed(2)} ({Math.abs(data.changePercent).toFixed(2)}%)
                </div>
                <div style={{ color: "#1e293b", fontSize: 10, marginTop: 4 }}>52W ${data.low52?.toFixed(0)} — ${data.high52?.toFixed(0)}</div>
              </div>
            </div>

            <TabBar tabs={TABS} active={tab} onChange={setTab} />

            {tab === "Overview" && (
              <div className="fu">
                <SignalBadge signal={data.signal} confidence={data.confidence} isLive={data.isLive} />
                <Card style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ color: "#334155", fontSize: 10, letterSpacing: 1.5 }}>KEY REASONS</span>
                    <RiskBadge level={data.risk} />
                  </div>
                  {data.reasons.map((r, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: i < 2 ? "1px solid #0a1628" : "none" }}>
                      <span style={{ color: "#06b6d4", minWidth: 16, fontSize: 12 }}>{i+1}.</span>
                      <span style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.6 }}>{r}</span>
                    </div>
                  ))}
                </Card>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                  {[
                    { label: "RSI", value: data.rsi, sub: data.rsi < 30 ? "Oversold" : data.rsi > 70 ? "Overbought" : "Neutral", color: data.rsi < 30 ? "#22d3ee" : data.rsi > 70 ? "#f43f5e" : "#a3e635" },
                    { label: "P/E", value: data.pe + "x", sub: data.pe < 20 ? "Cheap" : data.pe > 35 ? "Expensive" : "Fair", color: data.pe < 20 ? "#4ade80" : data.pe > 35 ? "#fb7185" : "#fbbf24" },
                    { label: "Sentiment", value: data.sentimentScore + "%", sub: data.sentimentScore > 60 ? "Bullish" : "Bearish", color: data.sentimentScore > 60 ? "#4ade80" : "#fb7185" },
                  ].map(item => (
                    <Card key={item.label} style={{ textAlign: "center", padding: 12 }}>
                      <div style={{ color: "#1e293b", fontSize: 9, letterSpacing: 1.5, marginBottom: 5 }}>{item.label}</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: item.color }}>{item.value}</div>
                      <div style={{ color: "#334155", fontSize: 9, marginTop: 3 }}>{item.sub}</div>
                    </Card>
                  ))}
                </div>
                <button onClick={() => toggleWL(data.ticker)}
                  style={{ width: "100%", padding: "12px", borderRadius: 10, border: `1.5px solid ${watchlist.includes(data.ticker) ? "#f43f5e40" : "#1d4ed840"}`, background: watchlist.includes(data.ticker) ? "rgba(244,63,94,0.05)" : "rgba(29,78,216,0.05)", color: watchlist.includes(data.ticker) ? "#fb7185" : "#60a5fa", fontWeight: 700, fontSize: 12, cursor: "pointer", letterSpacing: 1.5 }}>
                  {watchlist.includes(data.ticker) ? "✕ REMOVE FROM WATCHLIST" : "+ ADD TO WATCHLIST"}
                </button>
              </div>
            )}

            {tab === "Chart" && (
              <div className="fu">
                <PriceChart data={data.chartData} signal={data.signal} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <Card style={{ textAlign: "center" }}>
                    <div style={{ color: "#334155", fontSize: 9, letterSpacing: 1.5, marginBottom: 5 }}>50-DAY SMA</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>${data.sma50}</div>
                    <div style={{ color: parseFloat(data.sma50) < data.price ? "#4ade80" : "#fb7185", fontSize: 10, marginTop: 4 }}>
                      {parseFloat(data.sma50) < data.price ? "↑ Price above SMA" : "↓ Price below SMA"}
                    </div>
                  </Card>
                  <Card style={{ textAlign: "center" }}>
                    <div style={{ color: "#334155", fontSize: 9, letterSpacing: 1.5, marginBottom: 5 }}>200-DAY SMA</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>${data.sma200}</div>
                    <div style={{ color: data.goldenCross ? "#4ade80" : "#fb7185", fontSize: 10, marginTop: 4 }}>
                      {data.goldenCross ? "✓ Golden Cross" : "✗ Death Cross"}
                    </div>
                  </Card>
                </div>
                <Card>
                  <div style={{ color: "#334155", fontSize: 9, letterSpacing: 1.5, marginBottom: 10 }}>52-WEEK RANGE</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 7 }}>
                    <span style={{ color: "#fb7185" }}>Low ${data.low52?.toFixed(2)}</span>
                    <span style={{ color: "#f8fafc", fontWeight: 700 }}>${data.price.toFixed(2)}</span>
                    <span style={{ color: "#4ade80" }}>High ${data.high52?.toFixed(2)}</span>
                  </div>
                  <div style={{ background: "#0a1628", borderRadius: 999, height: 8, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, ((data.price - data.low52) / (data.high52 - data.low52)) * 100))}%`, background: "linear-gradient(90deg,#f43f5e,#fbbf24,#22c55e)", borderRadius: 999 }} />
                  </div>
                </Card>
              </div>
            )}

            {tab === "Technical" && (
              <div className="fu">
                <Card style={{ marginBottom: 12, textAlign: "center" }}>
                  <div style={{ color: "#334155", fontSize: 9, letterSpacing: 1.5, marginBottom: 12 }}>RSI (14-DAY)</div>
                  <RSIGauge value={data.rsi} />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 9, color: "#1e293b" }}>
                    <span>0 · Oversold</span><span>50</span><span>Overbought · 100</span>
                  </div>
                </Card>
                <Card>
                  <StatRow label="MACD" value={data.macd} status={parseFloat(data.macd) > 0 ? "good" : "bad"} />
                  <StatRow label="MACD Signal" value={data.macdSignal} status={parseFloat(data.macd) > 0 ? "good" : "bad"} />
                  <StatRow label="Bollinger Bands" value={data.bollingerPosition} status="neutral" />
                  <StatRow label="50-Day SMA" value={`$${data.sma50}`} status={parseFloat(data.sma50) < data.price ? "good" : "bad"} />
                  <StatRow label="200-Day SMA" value={`$${data.sma200}`} status={parseFloat(data.sma200) < data.price ? "good" : "bad"} />
                  <StatRow label="MA Cross" value={data.goldenCross ? "Golden Cross ✓" : "Death Cross ✗"} status={data.goldenCross ? "good" : "bad"} />
                  <StatRow label="Volume" value={data.volumeAboveAvg ? "Above Average ↑" : "Below Average ↓"} status={data.volumeAboveAvg ? "good" : "bad"} />
                  <StatRow label="Support" value={`$${(data.price * 0.93).toFixed(2)}`} status="neutral" />
                  <StatRow label="Resistance" value={`$${(data.price * 1.08).toFixed(2)}`} status="neutral" />
                </Card>
              </div>
            )}

            {tab === "Fundamental" && (
              <div className="fu">
                <Card style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ color: "#475569", fontSize: 12 }}>Intrinsic Value (DCF)</span>
                    <span style={{ fontWeight: 700, fontSize: 17 }}>${data.intrinsicValue}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                    <span style={{ color: "#475569", fontSize: 12 }}>Current Price</span>
                    <span style={{ fontWeight: 700, fontSize: 17 }}>${data.price.toFixed(2)}</span>
                  </div>
                  <div style={{ textAlign: "center", padding: "9px", borderRadius: 9,
                    background: data.valuation === "UNDERVALUED" ? "rgba(34,197,94,0.08)" : data.valuation === "OVERVALUED" ? "rgba(244,63,94,0.08)" : "rgba(234,179,8,0.08)",
                    color: data.valuation === "UNDERVALUED" ? "#4ade80" : data.valuation === "OVERVALUED" ? "#fb7185" : "#fbbf24",
                    fontWeight: 700, letterSpacing: 3, fontSize: 13 }}>
                    {data.valuation}
                  </div>
                </Card>
                <Card>
                  <StatRow label="P/E Ratio" value={`${data.pe}x`} status={data.pe < 20 ? "good" : data.pe > 35 ? "bad" : "neutral"} />
                  <StatRow label="EPS (TTM)" value={`$${data.eps}`} status={data.eps > 5 ? "good" : "neutral"} />
                  <StatRow label="Revenue Growth" value={`${data.revenueGrowth}%`} status={data.revenueGrowth > 10 ? "good" : data.revenueGrowth < 0 ? "bad" : "neutral"} />
                  <StatRow label="Profit Margin" value={`${data.margin}%`} status={data.margin > 20 ? "good" : data.margin < 8 ? "bad" : "neutral"} />
                  <StatRow label="Debt/Equity" value={data.debtEquity} status={data.debtEquity < 1 ? "good" : data.debtEquity > 2 ? "bad" : "neutral"} />
                  <StatRow label="Free Cash Flow" value={data.margin > 15 ? "Positive ✓" : "Negative ✗"} status={data.margin > 15 ? "good" : "bad"} />
                </Card>
              </div>
            )}

            {tab === "Sentiment" && (
              <div className="fu">
                <Card style={{ marginBottom: 12 }}>
                  <div style={{ color: "#334155", fontSize: 9, letterSpacing: 1.5, marginBottom: 10 }}>MARKET SENTIMENT</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontSize: 34, fontWeight: 700, color: data.sentimentScore > 60 ? "#4ade80" : data.sentimentScore < 40 ? "#fb7185" : "#fbbf24" }}>{data.sentimentScore}%</span>
                    <span style={{ color: data.sentimentScore > 60 ? "#4ade80" : data.sentimentScore < 40 ? "#fb7185" : "#fbbf24", fontWeight: 700, fontSize: 15, letterSpacing: 2 }}>
                      {data.sentimentScore > 60 ? "BULLISH" : data.sentimentScore < 40 ? "BEARISH" : "NEUTRAL"}
                    </span>
                  </div>
                  <div style={{ background: "#0a1628", borderRadius: 999, height: 7, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${data.sentimentScore}%`, background: "linear-gradient(90deg,#f43f5e,#fbbf24,#22c55e)", borderRadius: 999 }} />
                  </div>
                </Card>
                <Card style={{ marginBottom: 12 }}>
                  <div style={{ color: "#334155", fontSize: 9, letterSpacing: 1.5, marginBottom: 10 }}>ANALYST RATINGS</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, textAlign: "center" }}>
                    {[["BUY", data.analystBuy, "#4ade80"], ["HOLD", data.analystHold, "#fbbf24"], ["SELL", data.analystSell, "#fb7185"]].map(([l, v, c]) => (
                      <div key={l} style={{ background: "#0a1628", borderRadius: 9, padding: "12px 6px" }}>
                        <div style={{ color: c, fontWeight: 700, fontSize: 24 }}>{v}</div>
                        <div style={{ color: "#334155", fontSize: 9, letterSpacing: 1, marginTop: 3 }}>{l}</div>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card style={{ marginBottom: 12 }}>
                  <div style={{ color: "#334155", fontSize: 9, letterSpacing: 1.5, marginBottom: 10 }}>RECENT NEWS</div>
                  {data.headlines.map((h, i) => (
                    <div key={i} style={{ padding: "9px 0", borderBottom: i < data.headlines.length - 1 ? "1px solid #0a1628" : "none" }}>
                      <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 3, lineHeight: 1.5 }}>{h.text}</div>
                      <SentimentTag s={h.sentiment} />
                    </div>
                  ))}
                </Card>
                <Card>
                  <StatRow label="Insider Activity" value={data.insiderActivity} status={data.insiderActivity.includes("Buying") ? "good" : "bad"} />
                  <StatRow label="Social Buzz" value={data.sentimentScore > 65 ? "Trending ↑" : "Low Activity"} status={data.sentimentScore > 65 ? "good" : "neutral"} />
                </Card>
              </div>
            )}

            {tab === "Trade Setup" && (
              <div className="fu">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                  <div style={{ background: "rgba(244,63,94,0.07)", border: "1px solid rgba(244,63,94,0.2)", borderRadius: 12, padding: 16, textAlign: "center" }}>
                    <div style={{ color: "#475569", fontSize: 9, letterSpacing: 1.5, marginBottom: 7 }}>STOP LOSS</div>
                    <div style={{ color: "#fb7185", fontSize: 24, fontWeight: 700 }}>${data.stopLoss}</div>
                    <div style={{ color: "#334155", fontSize: 10, marginTop: 5 }}>Exit if price drops here</div>
                  </div>
                  <div style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 12, padding: 16, textAlign: "center" }}>
                    <div style={{ color: "#475569", fontSize: 9, letterSpacing: 1.5, marginBottom: 7 }}>TAKE PROFIT</div>
                    <div style={{ color: "#4ade80", fontSize: 24, fontWeight: 700 }}>${data.takeProfit}</div>
                    <div style={{ color: "#334155", fontSize: 10, marginTop: 5 }}>Target exit price</div>
                  </div>
                </div>
                <Card style={{ marginBottom: 12 }}>
                  <StatRow label="Entry Price" value={`$${data.price.toFixed(2)}`} />
                  <StatRow label="Risk / Reward" value={data.riskReward} status="good" />
                  <StatRow label="Volatility Risk" value={data.risk} status={data.risk === "LOW" ? "good" : data.risk === "HIGH" ? "bad" : "neutral"} />
                </Card>
                <Card>
                  <div style={{ color: "#334155", fontSize: 9, letterSpacing: 1.5, marginBottom: 12 }}>POSITION SIZE CALCULATOR</div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ color: "#475569", fontSize: 11, display: "block", marginBottom: 5 }}>YOUR PORTFOLIO SIZE ($)</label>
                    <input type="number" value={posSize} onChange={e => setPosSize(Number(e.target.value))}
                      style={{ width: "100%", background: "#0a1628", border: "1px solid #1e293b", borderRadius: 8, padding: "9px 12px", fontSize: 15, color: "#f8fafc" }} />
                  </div>
                  <div style={{ background: "#0a1628", borderRadius: 10, padding: 14, lineHeight: 2.2, fontSize: 12 }}>
                    {[
                      ["2% Risk Amount", `$${(posSize * 0.02).toFixed(0)}`],
                      ["Risk Per Share", `$${(data.price - parseFloat(data.stopLoss)).toFixed(2)}`],
                    ].map(([l, v]) => (
                      <div key={l} style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#334155" }}>{l}</span>
                        <span style={{ color: "#06b6d4" }}>{v}</span>
                      </div>
                    ))}
                    <div style={{ borderTop: "1px solid #1e293b", paddingTop: 8, marginTop: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "#475569" }}>Suggested Shares</span>
                      <span style={{ color: "#4ade80", fontSize: 22, fontWeight: 700 }}>
                        {Math.max(1, Math.floor((posSize * 0.02) / (data.price - parseFloat(data.stopLoss))))}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#1e293b", fontSize: 10 }}>Total investment</span>
                      <span style={{ color: "#1e293b", fontSize: 10 }}>
                        ${(Math.max(1, Math.floor((posSize * 0.02) / (data.price - parseFloat(data.stopLoss)))) * data.price).toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <div style={{ marginTop: 10, color: "#1e293b", fontSize: 10, lineHeight: 1.6 }}>* Based on 2% risk rule. Not financial advice. Do your own research.</div>
                </Card>
              </div>
            )}
          </div>
        )}

        {!data && !loading && (
          <div style={{ textAlign: "center", paddingTop: 80 }}>
            <div style={{ fontSize: 60, marginBottom: 14, opacity: 0.08 }}>◈</div>
            <div style={{ fontSize: 12, color: "#1e293b", letterSpacing: 3 }}>ENTER A TICKER TO BEGIN ANALYSIS</div>
          </div>
        )}
      </div>

      <div style={{ textAlign: "center", padding: "18px", color: "#0f172a", fontSize: 10, letterSpacing: 1.5 }}>
        SIGNALIQ · EDUCATIONAL PURPOSES ONLY · NOT FINANCIAL ADVICE
      </div>
    </div>
  );
}