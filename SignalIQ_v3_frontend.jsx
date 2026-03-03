import React, { useState, useCallback, useRef, useEffect } from "react";

// ── CONFIG — change this to your Render URL after deploying ──────────────────
const API_BASE = "https://signaliq-backend.onrender.com";

// ── CANDLESTICK CHART WITH SIGNALS ───────────────────────────────────────────
function CandlestickChart({ candles, indicators, signals, predictions, sr }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !candles?.length) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const pad = { top: 30, right: 80, bottom: 60, left: 70 };
    const cW = W - pad.left - pad.right;
    const cH = H - pad.top - pad.bottom;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, W, H);

    // Show last N candles for performance
    const maxCandles = 120;
    const displayCandles = candles.slice(-maxCandles);
    const displayOffset = candles.length - displayCandles.length;

    const allPrices = displayCandles.flatMap(c => [c.high, c.low]);
    const pMin = Math.min(...allPrices) * 0.998;
    const pMax = Math.max(...allPrices) * 1.002;

    // Add prediction range
    const preds30 = predictions?.["30_periods"] || [];
    if (preds30.length) {
      const predMax = Math.max(...preds30.map(p => p.upper));
      const predMin = Math.min(...preds30.map(p => p.lower));
      if (predMax > pMax) preds30.maxP = predMax * 1.002;
      if (predMin < pMin) preds30.minP = predMin * 0.998;
    }
    const finalMax = Math.max(pMax, preds30.maxP || 0);
    const finalMin = Math.min(pMin, preds30.minP || Infinity) === Infinity ? pMin : Math.min(pMin, preds30.minP || pMin);

    const totalBars = displayCandles.length + preds30.length;
    const barW = Math.max(2, Math.floor(cW / totalBars) - 1);

    const xScale = i => pad.left + (i / totalBars) * cW;
    const yScale = p => pad.top + (1 - (p - finalMin) / (finalMax - finalMin)) * cH;

    // ── Grid
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 6; i++) {
      const y = pad.top + (i / 6) * cH;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
      const val = finalMax - (i / 6) * (finalMax - finalMin);
      ctx.fillStyle = "#334155"; ctx.font = "10px monospace"; ctx.textAlign = "right";
      ctx.fillText("$" + val.toFixed(0), pad.left - 4, y + 4);
    }

    // ── Bollinger Bands
    if (indicators?.bb_upper && indicators?.bb_lower) {
      const bbUpper = indicators.bb_upper.slice(-maxCandles);
      const bbLower = indicators.bb_lower.slice(-maxCandles);
      const bbMid = indicators.bb_middle.slice(-maxCandles);

      ctx.beginPath();
      bbUpper.forEach((v, i) => { if (v !== null) { i === 0 ? ctx.moveTo(xScale(i) + barW/2, yScale(v)) : ctx.lineTo(xScale(i) + barW/2, yScale(v)); }});
      ctx.strokeStyle = "#1e40af40"; ctx.lineWidth = 1; ctx.stroke();

      ctx.beginPath();
      bbLower.forEach((v, i) => { if (v !== null) { i === 0 ? ctx.moveTo(xScale(i) + barW/2, yScale(v)) : ctx.lineTo(xScale(i) + barW/2, yScale(v)); }});
      ctx.strokeStyle = "#1e40af40"; ctx.lineWidth = 1; ctx.stroke();

      ctx.beginPath();
      bbMid.forEach((v, i) => { if (v !== null) { i === 0 ? ctx.moveTo(xScale(i) + barW/2, yScale(v)) : ctx.lineTo(xScale(i) + barW/2, yScale(v)); }});
      ctx.strokeStyle = "#1e40af25"; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── SMA Lines
    const smaConfigs = [
      { key: "sma20", color: "#f59e0b" },
      { key: "sma50", color: "#06b6d4" },
      { key: "sma200", color: "#a855f7" },
    ];
    smaConfigs.forEach(({ key, color }) => {
      if (!indicators?.[key]) return;
      const vals = indicators[key].slice(-maxCandles);
      ctx.beginPath(); ctx.strokeStyle = color + "90"; ctx.lineWidth = 1.5; ctx.setLineDash([]);
      vals.forEach((v, i) => { if (v !== null) { i === 0 ? ctx.moveTo(xScale(i) + barW/2, yScale(v)) : ctx.lineTo(xScale(i) + barW/2, yScale(v)); }});
      ctx.stroke();
    });

    // ── VWAP
    if (indicators?.vwap) {
      const vals = indicators.vwap.slice(-maxCandles);
      ctx.beginPath(); ctx.strokeStyle = "#4ade8060"; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
      vals.forEach((v, i) => { if (v !== null) { i === 0 ? ctx.moveTo(xScale(i) + barW/2, yScale(v)) : ctx.lineTo(xScale(i) + barW/2, yScale(v)); }});
      ctx.stroke(); ctx.setLineDash([]);
    }

    // ── Support & Resistance lines
    if (sr?.supports) {
      sr.supports.forEach(level => {
        ctx.beginPath(); ctx.strokeStyle = "#22c55e30"; ctx.lineWidth = 1; ctx.setLineDash([6, 3]);
        ctx.moveTo(pad.left, yScale(level)); ctx.lineTo(W - pad.right, yScale(level)); ctx.stroke();
        ctx.fillStyle = "#22c55e60"; ctx.font = "9px monospace"; ctx.textAlign = "left";
        ctx.fillText("S " + level.toFixed(0), W - pad.right + 2, yScale(level) + 3);
      });
    }
    if (sr?.resistances) {
      sr.resistances.forEach(level => {
        ctx.beginPath(); ctx.strokeStyle = "#f43f5e30"; ctx.lineWidth = 1; ctx.setLineDash([6, 3]);
        ctx.moveTo(pad.left, yScale(level)); ctx.lineTo(W - pad.right, yScale(level)); ctx.stroke();
        ctx.fillStyle = "#f43f5e60"; ctx.font = "9px monospace"; ctx.textAlign = "left";
        ctx.fillText("R " + level.toFixed(0), W - pad.right + 2, yScale(level) + 3);
      });
    }
    ctx.setLineDash([]);

    // ── Candlesticks
    displayCandles.forEach((c, i) => {
      const x = xScale(i);
      const isGreen = c.close >= c.open;
      const color = isGreen ? "#22c55e" : "#f43f5e";
      const bodyTop = yScale(Math.max(c.open, c.close));
      const bodyBot = yScale(Math.min(c.open, c.close));
      const bodyH = Math.max(1, bodyBot - bodyTop);

      // Wick
      ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + barW/2, yScale(c.high));
      ctx.lineTo(x + barW/2, yScale(c.low));
      ctx.stroke();

      // Body
      ctx.fillStyle = color;
      ctx.fillRect(x, bodyTop, barW, bodyH);
    });

    // ── Prediction candles
    if (preds30.length) {
      const gradStart = xScale(displayCandles.length);
      const grad = ctx.createLinearGradient(gradStart, 0, gradStart + preds30.length * (cW / totalBars), 0);
      grad.addColorStop(0, "#06b6d420");
      grad.addColorStop(1, "#06b6d405");

      // Prediction band
      ctx.beginPath();
      preds30.forEach((p, i) => {
        const x = xScale(displayCandles.length + i);
        if (i === 0) ctx.moveTo(x + barW/2, yScale(p.upper));
        else ctx.lineTo(x + barW/2, yScale(p.upper));
      });
      [...preds30].reverse().forEach((p, i) => {
        const x = xScale(displayCandles.length + preds30.length - 1 - i);
        ctx.lineTo(x + barW/2, yScale(p.lower));
      });
      ctx.closePath(); ctx.fillStyle = "#06b6d415"; ctx.fill();

      // Prediction line
      ctx.beginPath(); ctx.strokeStyle = "#06b6d480"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]);
      preds30.forEach((p, i) => {
        const x = xScale(displayCandles.length + i);
        if (i === 0) ctx.moveTo(x + barW/2, yScale(p.predicted));
        else ctx.lineTo(x + barW/2, yScale(p.predicted));
      });
      ctx.stroke(); ctx.setLineDash([]);

      // "PREDICTION" label
      ctx.fillStyle = "#06b6d460"; ctx.font = "bold 9px monospace";
      ctx.fillText("◈ PREDICTION", xScale(displayCandles.length) + 4, pad.top + 14);
    }

    // ── Trade Signals (BUY/SELL markers)
    if (signals?.length) {
      signals.forEach(sig => {
        const adjustedIdx = sig.index - displayOffset;
        if (adjustedIdx < 0 || adjustedIdx >= displayCandles.length) return;
        const x = xScale(adjustedIdx);
        const c = displayCandles[adjustedIdx];
        const isBuy = sig.type === "BUY";
        const color = isBuy ? "#22c55e" : "#f43f5e";
        const arrowY = isBuy ? yScale(c.low) + 14 : yScale(c.high) - 14;

        // Arrow
        ctx.fillStyle = color;
        ctx.beginPath();
        if (isBuy) {
          ctx.moveTo(x + barW/2, arrowY - 10);
          ctx.lineTo(x + barW/2 + 6, arrowY);
          ctx.lineTo(x + barW/2 - 6, arrowY);
        } else {
          ctx.moveTo(x + barW/2, arrowY + 10);
          ctx.lineTo(x + barW/2 + 6, arrowY);
          ctx.lineTo(x + barW/2 - 6, arrowY);
        }
        ctx.closePath(); ctx.fill();

        // Stop loss line
        ctx.strokeStyle = "#f43f5e40"; ctx.lineWidth = 0.8; ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.moveTo(x, yScale(sig.stop_loss));
        ctx.lineTo(x + Math.min(30, cW - x + pad.left), yScale(sig.stop_loss));
        ctx.stroke();

        // Take profit line
        ctx.strokeStyle = "#22c55e40"; ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x, yScale(sig.take_profit));
        ctx.lineTo(x + Math.min(30, cW - x + pad.left), yScale(sig.take_profit));
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }

    // ── X-axis dates
    const step = Math.max(1, Math.floor(displayCandles.length / 6));
    ctx.fillStyle = "#334155"; ctx.font = "9px monospace"; ctx.textAlign = "center";
    for (let i = 0; i < displayCandles.length; i += step) {
      const x = xScale(i) + barW/2;
      ctx.fillText(displayCandles[i].date.slice(5, 10), x, H - 10);
    }

    // ── Legend
    const legend = [
      { label: "SMA20", color: "#f59e0b" },
      { label: "SMA50", color: "#06b6d4" },
      { label: "SMA200", color: "#a855f7" },
      { label: "VWAP", color: "#4ade80" },
      { label: "BB", color: "#1e40af" },
      { label: "BUY ▲", color: "#22c55e" },
      { label: "SELL ▼", color: "#f43f5e" },
    ];
    legend.forEach((l, i) => {
      ctx.fillStyle = l.color; ctx.font = "9px monospace"; ctx.textAlign = "left";
      ctx.fillText(l.label, pad.left + i * 68, pad.top - 8);
    });

  }, [candles, indicators, signals, predictions, sr]);

  return (
    <canvas ref={canvasRef} width={900} height={420}
      style={{ width: "100%", height: "auto", display: "block", borderRadius: 12 }} />
  );
}

// ── RSI CHART ─────────────────────────────────────────────────────────────────
function RSIChart({ rsiValues, candles }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current || !rsiValues?.length) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const pad = { top: 10, right: 80, bottom: 20, left: 70 };
    const cW = W - pad.left - pad.right, cH = H - pad.top - pad.bottom;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#020617"; ctx.fillRect(0, 0, W, H);

    const maxC = 120;
    const vals = rsiValues.slice(-maxC).filter(v => v !== null);
    if (!vals.length) return;

    const xScale = i => pad.left + (i / (vals.length - 1)) * cW;
    const yScale = v => pad.top + (1 - v/100) * cH;

    // Grid lines at 30, 50, 70
    [30, 50, 70].forEach(level => {
      ctx.strokeStyle = level === 50 ? "#1e293b" : level === 30 ? "#22c55e20" : "#f43f5e20";
      ctx.lineWidth = 1; ctx.setLineDash(level === 50 ? [4,4] : []);
      ctx.beginPath(); ctx.moveTo(pad.left, yScale(level)); ctx.lineTo(W-pad.right, yScale(level)); ctx.stroke();
      ctx.fillStyle = level === 30 ? "#22c55e60" : level === 70 ? "#f43f5e60" : "#334155";
      ctx.font = "9px monospace"; ctx.textAlign = "right";
      ctx.fillText(level, pad.left - 4, yScale(level) + 3);
    });
    ctx.setLineDash([]);

    // Overbought fill
    const grad70 = ctx.createLinearGradient(0, yScale(100), 0, yScale(70));
    grad70.addColorStop(0, "#f43f5e20"); grad70.addColorStop(1, "#f43f5e00");
    ctx.fillStyle = grad70;
    ctx.fillRect(pad.left, pad.top, cW, yScale(70) - pad.top);

    // Oversold fill
    const grad30 = ctx.createLinearGradient(0, yScale(30), 0, yScale(0));
    grad30.addColorStop(0, "#22c55e00"); grad30.addColorStop(1, "#22c55e20");
    ctx.fillStyle = grad30;
    ctx.fillRect(pad.left, yScale(30), cW, pad.top + cH - yScale(30));

    // RSI line
    ctx.beginPath(); ctx.lineWidth = 1.5; ctx.lineJoin = "round";
    vals.forEach((v, i) => {
      const color = v > 70 ? "#f43f5e" : v < 30 ? "#22d3ee" : "#a3e635";
      if (i === 0) { ctx.moveTo(xScale(i), yScale(v)); ctx.strokeStyle = color; }
      else { ctx.lineTo(xScale(i), yScale(v)); }
    });
    ctx.stroke();

    ctx.fillStyle = "#475569"; ctx.font = "9px monospace"; ctx.textAlign = "left";
    ctx.fillText(`RSI(14): ${vals[vals.length-1]?.toFixed(1)}`, pad.left + 4, pad.top + 12);
  }, [rsiValues]);

  return <canvas ref={canvasRef} width={900} height={100} style={{ width: "100%", height: "auto", display: "block", borderRadius: 8 }} />;
}

// ── MACD CHART ────────────────────────────────────────────────────────────────
function MACDChart({ macdData }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current || !macdData) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const pad = { top: 10, right: 80, bottom: 20, left: 70 };
    const cW = W - pad.left - pad.right, cH = H - pad.top - pad.bottom;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#020617"; ctx.fillRect(0, 0, W, H);

    const maxC = 120;
    const hist = macdData.histogram.slice(-maxC);
    const macd = macdData.macd.slice(-maxC);
    const sig  = macdData.signal.slice(-maxC);
    const validHist = hist.filter(v => v !== null);
    if (!validHist.length) return;

    const minV = Math.min(...validHist) * 1.2;
    const maxV = Math.max(...validHist) * 1.2;
    const xScale = i => pad.left + (i / (hist.length - 1)) * cW;
    const yScale = v => pad.top + (1 - (v - minV) / (maxV - minV)) * cH;
    const zero = yScale(0);

    // Zero line
    ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.left, zero); ctx.lineTo(W-pad.right, zero); ctx.stroke();

    // Histogram bars
    const barW = Math.max(1, Math.floor(cW / hist.length) - 1);
    hist.forEach((v, i) => {
      if (v === null) return;
      ctx.fillStyle = v >= 0 ? "#22c55e60" : "#f43f5e60";
      const top = v >= 0 ? yScale(v) : zero;
      const h = Math.abs(yScale(v) - zero);
      ctx.fillRect(xScale(i), top, barW, h);
    });

    // MACD & Signal lines
    ctx.beginPath(); ctx.strokeStyle = "#60a5fa"; ctx.lineWidth = 1.5;
    macd.forEach((v, i) => { if (v !== null) { i === 0 ? ctx.moveTo(xScale(i), yScale(v)) : ctx.lineTo(xScale(i), yScale(v)); }});
    ctx.stroke();

    ctx.beginPath(); ctx.strokeStyle = "#f97316"; ctx.lineWidth = 1.5;
    sig.forEach((v, i) => { if (v !== null) { i === 0 ? ctx.moveTo(xScale(i), yScale(v)) : ctx.lineTo(xScale(i), yScale(v)); }});
    ctx.stroke();

    ctx.fillStyle = "#475569"; ctx.font = "9px monospace"; ctx.textAlign = "left";
    ctx.fillText(`MACD  ▪ Signal`, pad.left + 4, pad.top + 12);
    ctx.fillStyle = "#60a5fa"; ctx.fillText("MACD", pad.left + 4, pad.top + 12);
    ctx.fillStyle = "#f97316"; ctx.fillText("Signal", pad.left + 48, pad.top + 12);
  }, [macdData]);

  return <canvas ref={canvasRef} width={900} height={100} style={{ width: "100%", height: "auto", display: "block", borderRadius: 8 }} />;
}

// ── HELPER COMPONENTS ─────────────────────────────────────────────────────────
function Card({ children, style }) {
  return <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14, padding: 16, ...style }}>{children}</div>;
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 3, background: "#0a1628", borderRadius: 12, padding: 4, marginBottom: 16, overflowX: "auto" }}>
      {tabs.map(t => (
        <button key={t} onClick={() => onChange(t)}
          style={{ flex: 1, padding: "9px 6px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap", letterSpacing: 0.5, fontFamily: "monospace",
            background: active === t ? "#1d4ed8" : "transparent", color: active === t ? "#fff" : "#334155", transition: "all 0.2s" }}>
          {t}
        </button>
      ))}
    </div>
  );
}

function StatRow({ label, value, status }) {
  const sc = { good: "#4ade80", bad: "#fb7185", neutral: "#fbbf24" }[status] || "#334155";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #0a1628" }}>
      <span style={{ color: "#475569", fontSize: 12 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: "#e2e8f0", fontWeight: 700, fontFamily: "monospace", fontSize: 12 }}>{value}</span>
        {status && <span style={{ width: 7, height: 7, borderRadius: "50%", background: sc, display: "inline-block" }} />}
      </div>
    </div>
  );
}

function PatternCard({ pattern }) {
  const colors = { bullish: { bg: "rgba(34,197,94,0.08)", border: "#22c55e30", color: "#4ade80" }, bearish: { bg: "rgba(244,63,94,0.08)", border: "#f43f5e30", color: "#fb7185" } };
  const c = colors[pattern.type] || colors.bullish;
  return (
    <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ color: c.color, fontWeight: 700, fontSize: 13 }}>{pattern.name}</span>
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{ background: c.color + "20", color: c.color, fontSize: 10, padding: "2px 8px", borderRadius: 4, fontWeight: 700 }}>{pattern.strength.toUpperCase()}</span>
          <span style={{ background: pattern.action === "BUY" ? "#22c55e20" : "#f43f5e20", color: pattern.action === "BUY" ? "#4ade80" : "#fb7185", fontSize: 10, padding: "2px 8px", borderRadius: 4, fontWeight: 700 }}>{pattern.action}</span>
        </div>
      </div>
      <div style={{ color: "#64748b", fontSize: 11 }}>{pattern.description}</div>
    </div>
  );
}

function SignalBadge({ signal, confidence, isLive }) {
  const cfg = {
    BUY:  { bg: "rgba(34,197,94,0.1)",  border: "#22c55e", color: "#4ade80",  icon: "▲", label: "BUY SIGNAL" },
    SELL: { bg: "rgba(244,63,94,0.1)",  border: "#f43f5e", color: "#fb7185",  icon: "▼", label: "SELL SIGNAL" },
    HOLD: { bg: "rgba(234,179,8,0.1)",  border: "#eab308", color: "#fbbf24",  icon: "◆", label: "HOLD SIGNAL" },
  }[signal] || { bg: "#0f172a", border: "#334155", color: "#94a3b8", icon: "?", label: "ANALYZING" };
  return (
    <div style={{ background: cfg.bg, border: `2px solid ${cfg.border}`, borderRadius: 18, padding: "20px 28px", textAlign: "center", marginBottom: 16 }}>
      {isLive && <div style={{ fontSize: 10, color: "#22c55e", letterSpacing: 2, marginBottom: 6 }}>● LIVE DATA</div>}
      <div style={{ fontSize: 36, marginBottom: 4 }}>{cfg.icon}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color: cfg.color, letterSpacing: 5, fontFamily: "monospace" }}>{cfg.label}</div>
      <div style={{ color: "#475569", fontSize: 12, marginTop: 8 }}>AI Confidence Score</div>
      <div style={{ fontSize: 42, fontWeight: 800, color: "#f8fafc", fontFamily: "monospace", lineHeight: 1.1 }}>{confidence}%</div>
      <div style={{ background: "#0a1628", borderRadius: 999, height: 6, marginTop: 12, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${confidence}%`, background: `linear-gradient(90deg,${cfg.border},${cfg.color})`, borderRadius: 999, transition: "width 1.5s ease" }} />
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
const TRENDING = ["AAPL", "TSLA", "NVDA", "MSFT", "META", "AMZN", "GOOGL", "AMD"];
const TABS = ["Overview", "Chart", "Signals", "Patterns", "Backtest", "Predict", "Fundamentals"];
const TIMEFRAMES = ["1min", "5min", "1hour", "1day", "1week"];

export default function SignalIQ() {
  const [input, setInput] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("Overview");
  const [timeframe, setTimeframe] = useState("1day");
  const [watchlist, setWatchlist] = useState(["AAPL", "TSLA", "NVDA"]);
  const [error, setError] = useState("");
  const [posSize, setPosSize] = useState(10000);

  const analyze = useCallback(async (ticker, tf) => {
    if (!ticker.trim()) return;
    setLoading(true); setError(""); setTab("Overview");
    try {
      const res = await fetch(`${API_BASE}/analyze/${ticker.trim().toUpperCase()}?timeframe=${tf || timeframe}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Analysis failed");
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e.message || "Could not connect to backend. Make sure your Render service is running.");
    }
    setLoading(false);
  }, [timeframe]);

  const toggleWL = (t) => setWatchlist(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);

  const trendColor = data?.trend?.trend === "uptrend" ? "#4ade80" : data?.trend?.trend === "downtrend" ? "#fb7185" : "#fbbf24";

  return (
    <div style={{ minHeight: "100vh", background: "#020617", color: "#f8fafc", fontFamily: "monospace" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar{width:3px;height:3px} ::-webkit-scrollbar-thumb{background:#1e293b;border-radius:4px}
        input,button{font-family:monospace}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        .fu{animation:fadeUp 0.3s ease forwards}
        .sk{background:linear-gradient(90deg,#0f172a 25%,#1e293b 50%,#0f172a 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;border-radius:10px}
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #0a1628", padding: "12px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "#020617ee", backdropFilter: "blur(10px)", zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, background: "linear-gradient(135deg,#1d4ed8,#06b6d4)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>◈</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 3 }}>SIGNAL<span style={{ color: "#06b6d4" }}>IQ</span></div>
            <div style={{ fontSize: 8, color: "#1e293b", letterSpacing: 2 }}>PREDICTIVE ENGINE v2.0</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {TIMEFRAMES.map(tf => (
            <button key={tf} onClick={() => { setTimeframe(tf); if (data) analyze(data.ticker, tf); }}
              style={{ background: timeframe === tf ? "#1d4ed8" : "#0a1628", border: `1px solid ${timeframe === tf ? "#1d4ed8" : "#1e293b"}`, borderRadius: 6, padding: "4px 8px", color: timeframe === tf ? "#fff" : "#334155", fontSize: 10, cursor: "pointer", letterSpacing: 0.5 }}>
              {tf}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "16px 14px 60px" }}>

        {/* Search */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ position: "relative", marginBottom: 10 }}>
            <input value={input} onChange={e => setInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && analyze(input)}
              placeholder="Enter any stock ticker — AAPL, TSLA, NVDA, MSFT..."
              style={{ width: "100%", background: "#0a1628", border: "1.5px solid #1e293b", borderRadius: 12, padding: "14px 50px 14px 16px", fontSize: 15, color: "#f8fafc", letterSpacing: 2 }} />
            <button onClick={() => analyze(input)}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "linear-gradient(135deg,#1d4ed8,#06b6d4)", border: "none", borderRadius: 8, padding: "8px 13px", cursor: "pointer", fontSize: 15 }}>⟶</button>
          </div>
          {error && <div style={{ color: "#fb7185", fontSize: 12, marginBottom: 8, padding: "8px 12px", background: "rgba(244,63,94,0.08)", borderRadius: 8, border: "1px solid rgba(244,63,94,0.2)" }}>⚠ {error}</div>}

          {watchlist.length > 0 && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
              {watchlist.map(t => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 3, background: "#0a1628", border: "1px solid #1e293b", borderRadius: 6, padding: "3px 8px" }}>
                  <button onClick={() => { setInput(t); analyze(t); }} style={{ background: "none", border: "none", color: "#06b6d4", fontWeight: 700, fontSize: 11, cursor: "pointer", letterSpacing: 1 }}>{t}</button>
                  <button onClick={() => toggleWL(t)} style={{ background: "none", border: "none", color: "#334155", cursor: "pointer", fontSize: 10 }}>✕</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {TRENDING.map(t => (
              <button key={t} onClick={() => { setInput(t); analyze(t); }}
                style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 6, padding: "4px 10px", color: "#334155", fontSize: 11, cursor: "pointer", letterSpacing: 1, transition: "all 0.2s" }}
                onMouseEnter={e => { e.target.style.color="#06b6d4"; e.target.style.borderColor="#06b6d4"; }}
                onMouseLeave={e => { e.target.style.color="#334155"; e.target.style.borderColor="#1e293b"; }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="fu">
            <div style={{ textAlign: "center", marginBottom: 16, padding: "12px 0" }}>
              <div style={{ color: "#06b6d4", fontSize: 12, letterSpacing: 2, animation: "pulse 1.2s infinite" }}>◈ RUNNING PREDICTIVE ENGINE</div>
              <div style={{ color: "#1e293b", fontSize: 10, marginTop: 4, letterSpacing: 1 }}>FETCHING ALL CANDLES · COMPUTING INDICATORS · DETECTING PATTERNS · BACKTESTING · PREDICTING</div>
            </div>
            <div className="sk" style={{ height: 420, marginBottom: 8 }} />
            <div className="sk" style={{ height: 100, marginBottom: 8 }} />
            <div className="sk" style={{ height: 100 }} />
          </div>
        )}

        {/* Results */}
        {data && !loading && (
          <div className="fu">
            {/* Stock Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, padding: "12px 16px", background: "#0a1628", borderRadius: 12, border: "1px solid #1e293b" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {data.logo && <img src={data.logo} alt="" style={{ width: 24, height: 24, borderRadius: 4, objectFit: "contain" }} />}
                  <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2 }}>{data.ticker}</div>
                  <span style={{ background: "#1e293b", borderRadius: 4, padding: "2px 8px", fontSize: 10, color: "#475569" }}>{timeframe}</span>
                </div>
                <div style={{ color: "#334155", fontSize: 11, marginTop: 2 }}>{data.name} · {data.sector}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <span style={{ color: trendColor, fontSize: 10, background: trendColor + "15", padding: "2px 8px", borderRadius: 4 }}>
                    {data.trend?.trend?.toUpperCase()} · {data.trend?.strength}
                  </span>
                  <span style={{ color: "#475569", fontSize: 10, background: "#1e293b", padding: "2px 8px", borderRadius: 4 }}>
                    {data.total_candles} candles
                  </span>
                  <span style={{ color: "#22c55e", fontSize: 10, background: "#22c55e15", padding: "2px 8px", borderRadius: 4 }}>
                    {data.backtest?.win_rate}% win rate
                  </span>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 24, fontWeight: 700 }}>${data.price?.toFixed(2)}</div>
                <div style={{ color: data.change >= 0 ? "#4ade80" : "#fb7185", fontSize: 13, fontWeight: 700, marginTop: 2 }}>
                  {data.change >= 0 ? "▲" : "▼"} {Math.abs(data.change).toFixed(2)} ({Math.abs(data.change_pct).toFixed(2)}%)
                </div>
                <div style={{ color: "#1e293b", fontSize: 10, marginTop: 3 }}>52W ${data.low52?.toFixed(0)} — ${data.high52?.toFixed(0)}</div>
              </div>
            </div>

            <TabBar tabs={TABS} active={tab} onChange={setTab} />

            {/* OVERVIEW */}
            {tab === "Overview" && (
              <div className="fu">
                <SignalBadge signal={data.signal} confidence={data.confidence} isLive={true} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  <Card>
                    <div style={{ color: "#334155", fontSize: 9, letterSpacing: 1.5, marginBottom: 10 }}>TREND ANALYSIS</div>
                    <div style={{ color: trendColor, fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{data.trend?.trend?.toUpperCase()}</div>
                    <div style={{ color: "#475569", fontSize: 12, lineHeight: 1.5 }}>{data.trend?.description}</div>
                  </Card>
                  <Card>
                    <div style={{ color: "#334155", fontSize: 9, letterSpacing: 1.5, marginBottom: 10 }}>BACKTEST SUMMARY</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {[
                        ["Win Rate", `${data.backtest?.win_rate}%`, data.backtest?.win_rate > 55 ? "good" : "bad"],
                        ["Total Trades", data.backtest?.total_trades, "neutral"],
                        ["Avg Return", `${data.backtest?.avg_return}%`, data.backtest?.avg_return > 0 ? "good" : "bad"],
                        ["Total Return", `${data.backtest?.total_return}%`, data.backtest?.total_return > 0 ? "good" : "bad"],
                      ].map(([l, v, s]) => (
                        <div key={l} style={{ background: "#0a1628", borderRadius: 8, padding: "8px 10px" }}>
                          <div style={{ color: "#334155", fontSize: 9 }}>{l}</div>
                          <div style={{ color: { good: "#4ade80", bad: "#fb7185", neutral: "#f8fafc" }[s], fontWeight: 700, fontSize: 14, marginTop: 2 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
                <Card style={{ marginBottom: 14 }}>
                  <div style={{ color: "#334155", fontSize: 9, letterSpacing: 1.5, marginBottom: 10 }}>CURRENT INDICATORS</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {[
                      { label: "RSI", value: data.current?.rsi, color: data.current?.rsi < 30 ? "#22d3ee" : data.current?.rsi > 70 ? "#f43f5e" : "#a3e635" },
                      { label: "MACD", value: data.current?.macd, color: data.current?.macd > 0 ? "#4ade80" : "#fb7185" },
                      { label: "ATR", value: data.current?.atr?.toFixed(2), color: "#f8fafc" },
                      { label: "SMA50", value: `$${data.current?.sma50}`, color: data.current?.sma50 < data.price ? "#4ade80" : "#fb7185" },
                      { label: "SMA200", value: `$${data.current?.sma200}`, color: data.current?.sma200 < data.price ? "#4ade80" : "#fb7185" },
                      { label: "VWAP", value: `$${data.current?.vwap}`, color: data.current?.vwap < data.price ? "#4ade80" : "#fb7185" },
                    ].map(item => (
                      <div key={item.label} style={{ background: "#0a1628", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                        <div style={{ color: "#334155", fontSize: 9, letterSpacing: 1 }}>{item.label}</div>
                        <div style={{ color: item.color, fontWeight: 700, fontSize: 14, marginTop: 2 }}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                </Card>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  <Card>
                    <div style={{ color: "#334155", fontSize: 9, letterSpacing: 1.5, marginBottom: 8 }}>SUPPORT LEVELS</div>
                    {data.support_resistance?.supports?.map((s, i) => (
                      <div key={i} style={{ color: "#4ade80", fontFamily: "monospace", fontSize: 13, padding: "4px 0", borderBottom: "1px solid #0a1628" }}>
                        S{i+1}: ${s}
                      </div>
                    ))}
                  </Card>
                  <Card>
                    <div style={{ color: "#334155", fontSize: 9, letterSpacing: 1.5, marginBottom: 8 }}>RESISTANCE LEVELS</div>
                    {data.support_resistance?.resistances?.map((r, i) => (
                      <div key={i} style={{ color: "#fb7185", fontFamily: "monospace", fontSize: 13, padding: "4px 0", borderBottom: "1px solid #0a1628" }}>
                        R{i+1}: ${r}
                      </div>
                    ))}
                  </Card>
                </div>
                <button onClick={() => toggleWL(data.ticker)}
                  style={{ width: "100%", padding: "11px", borderRadius: 10, border: `1.5px solid ${watchlist.includes(data.ticker) ? "#f43f5e40" : "#1d4ed840"}`, background: watchlist.includes(data.ticker) ? "rgba(244,63,94,0.05)" : "rgba(29,78,216,0.05)", color: watchlist.includes(data.ticker) ? "#fb7185" : "#60a5fa", fontWeight: 700, fontSize: 12, cursor: "pointer", letterSpacing: 1.5 }}>
                  {watchlist.includes(data.ticker) ? "✕ REMOVE FROM WATCHLIST" : "+ ADD TO WATCHLIST"}
                </button>
              </div>
            )}

            {/* CHART */}
            {tab === "Chart" && (
              <div className="fu">
                <Card style={{ marginBottom: 8, padding: 10 }}>
                  <div style={{ color: "#334155", fontSize: 9, letterSpacing: 1.5, marginBottom: 8 }}>
                    CANDLESTICK CHART — {data.total_candles} CANDLES · BUY ▲ SELL ▼ · PREDICTION →
                  </div>
                  <CandlestickChart
                    candles={data.candles}
                    indicators={data.indicators}
                    signals={data.trade_signals}
                    predictions={data.predictions}
                    sr={data.support_resistance}
                  />
                </Card>
                <Card style={{ marginBottom: 8, padding: 10 }}>
                  <RSIChart rsiValues={data.indicators?.rsi} candles={data.candles} />
                </Card>
                <Card style={{ padding: 10 }}>
                  <MACDChart macdData={{ macd: data.indicators?.macd, signal: data.indicators?.macd_signal, histogram: data.indicators?.macd_histogram }} />
                </Card>
              </div>
            )}

            {/* SIGNALS */}
            {tab === "Signals" && (
              <div className="fu">
                <Card style={{ marginBottom: 14 }}>
                  <div style={{ color: "#334155", fontSize: 9, letterSpacing: 1.5, marginBottom: 12 }}>
                    TRADE SIGNALS — LAST {data.trade_signals?.length} SIGNALS ON CHART
                  </div>
                  {data.trade_signals?.slice(-15).reverse().map((sig, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #0a1628" }}>
                      <div>
                        <span style={{ color: sig.type === "BUY" ? "#4ade80" : "#fb7185", fontWeight: 700, fontSize: 13, marginRight: 8 }}>{sig.type === "BUY" ? "▲" : "▼"} {sig.type}</span>
                        <span style={{ color: "#334155", fontSize: 10 }}>{sig.date}</span>
                        <div style={{ color: "#475569", fontSize: 11, marginTop: 2 }}>{sig.reason}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: "#f8fafc", fontWeight: 700, fontFamily: "monospace" }}>${sig.price}</div>
                        <div style={{ color: "#fb7185", fontSize: 10 }}>SL ${sig.stop_loss}</div>
                        <div style={{ color: "#4ade80", fontSize: 10 }}>TP ${sig.take_profit}</div>
                      </div>
                    </div>
                  ))}
                </Card>
              </div>
            )}

            {/* PATTERNS */}
            {tab === "Patterns" && (
              <div className="fu">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  <Card style={{ textAlign: "center" }}>
                    <div style={{ color: "#4ade80", fontSize: 28, fontWeight: 700 }}>{data.bullish_patterns}</div>
                    <div style={{ color: "#334155", fontSize: 10, marginTop: 4 }}>BULLISH PATTERNS</div>
                  </Card>
                  <Card style={{ textAlign: "center" }}>
                    <div style={{ color: "#fb7185", fontSize: 28, fontWeight: 700 }}>{data.bearish_patterns}</div>
                    <div style={{ color: "#334155", fontSize: 10, marginTop: 4 }}>BEARISH PATTERNS</div>
                  </Card>
                </div>
                {data.patterns?.length > 0
                  ? data.patterns.map((p, i) => <PatternCard key={i} pattern={p} />)
                  : <Card><div style={{ color: "#334155", textAlign: "center", padding: "20px 0", fontSize: 13 }}>No strong patterns detected on this timeframe</div></Card>
                }
              </div>
            )}

            {/* BACKTEST */}
            {tab === "Backtest" && (
              <div className="fu">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 14 }}>
                  {[
                    ["Total Trades", data.backtest?.total_trades, "neutral"],
                    ["Win Rate", `${data.backtest?.win_rate}%`, data.backtest?.win_rate > 55 ? "good" : "bad"],
                    ["Avg Return", `${data.backtest?.avg_return}%`, data.backtest?.avg_return > 0 ? "good" : "bad"],
                    ["Total Return", `${data.backtest?.total_return}%`, data.backtest?.total_return > 0 ? "good" : "bad"],
                  ].map(([l, v, s]) => (
                    <Card key={l} style={{ textAlign: "center" }}>
                      <div style={{ color: "#334155", fontSize: 9, letterSpacing: 1.5, marginBottom: 6 }}>{l}</div>
                      <div style={{ color: { good: "#4ade80", bad: "#fb7185", neutral: "#f8fafc" }[s], fontSize: 24, fontWeight: 700 }}>{v}</div>
                    </Card>
                  ))}
                </div>
                <Card>
                  <div style={{ color: "#334155", fontSize: 9, letterSpacing: 1.5, marginBottom: 12 }}>LAST 20 TRADES</div>
                  {data.backtest?.results?.slice().reverse().map((r, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid #0a1628" }}>
                      <div>
                        <span style={{ color: r.type === "BUY" ? "#4ade80" : "#fb7185", fontWeight: 700, fontSize: 12, marginRight: 8 }}>{r.type}</span>
                        <span style={{ color: "#334155", fontSize: 10 }}>{r.entry_date?.slice(0,10)}</span>
                        <div style={{ color: "#475569", fontSize: 10, marginTop: 1 }}>{r.reason}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: r.outcome === "win" ? "#4ade80" : "#fb7185", fontWeight: 700, fontSize: 14 }}>
                          {r.pnl_pct > 0 ? "+" : ""}{r.pnl_pct}%
                        </div>
                        <div style={{ color: "#334155", fontSize: 10 }}>{r.outcome.toUpperCase()}</div>
                      </div>
                    </div>
                  ))}
                </Card>
              </div>
            )}

            {/* PREDICTIONS */}
            {tab === "Predict" && (
              <div className="fu">
                <Card style={{ marginBottom: 14, textAlign: "center", background: "rgba(6,182,212,0.05)", border: "1px solid rgba(6,182,212,0.2)" }}>
                  <div style={{ color: "#06b6d4", fontSize: 10, letterSpacing: 2, marginBottom: 6 }}>◈ AI PRICE PREDICTION</div>
                  <div style={{ color: "#475569", fontSize: 12, lineHeight: 1.6 }}>
                    Based on linear regression + momentum analysis across all {data.total_candles} candles
                  </div>
                </Card>

                {[["5_periods", "5"], ["10_periods", "10"], ["30_periods", "30"]].map(([key, label]) => (
                  <Card key={key} style={{ marginBottom: 12 }}>
                    <div style={{ color: "#334155", fontSize: 9, letterSpacing: 1.5, marginBottom: 10 }}>NEXT {label} CANDLES PREDICTION</div>
                    {data.predictions?.[key]?.slice(0, 5).map((p, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < 4 ? "1px solid #0a1628" : "none" }}>
                        <span style={{ color: "#475569", fontSize: 12 }}>Period +{p.period}</span>
                        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                          <span style={{ color: "#fb7185", fontSize: 11 }}>↓${p.lower}</span>
                          <span style={{ color: "#f8fafc", fontWeight: 700, fontFamily: "monospace", fontSize: 14 }}>${p.predicted}</span>
                          <span style={{ color: "#4ade80", fontSize: 11 }}>↑${p.upper}</span>
                          <span style={{ color: "#334155", fontSize: 10 }}>{p.confidence}% conf</span>
                        </div>
                      </div>
                    ))}
                  </Card>
                ))}
              </div>
            )}

            {/* FUNDAMENTALS */}
            {tab === "Fundamentals" && (
              <div className="fu">
                <Card>
                  <StatRow label="P/E Ratio" value={`${data.fundamentals?.pe?.toFixed(1)}x`} status={data.fundamentals?.pe < 20 ? "good" : data.fundamentals?.pe > 35 ? "bad" : "neutral"} />
                  <StatRow label="EPS" value={`$${data.fundamentals?.eps?.toFixed(2)}`} status={data.fundamentals?.eps > 5 ? "good" : "neutral"} />
                  <StatRow label="Revenue Growth" value={`${data.fundamentals?.revenue_growth?.toFixed(1)}%`} status={data.fundamentals?.revenue_growth > 10 ? "good" : data.fundamentals?.revenue_growth < 0 ? "bad" : "neutral"} />
                  <StatRow label="Net Margin" value={`${data.fundamentals?.margin?.toFixed(1)}%`} status={data.fundamentals?.margin > 20 ? "good" : data.fundamentals?.margin < 8 ? "bad" : "neutral"} />
                  <StatRow label="Debt/Equity" value={data.fundamentals?.debt_equity?.toFixed(2)} status={data.fundamentals?.debt_equity < 1 ? "good" : data.fundamentals?.debt_equity > 2 ? "bad" : "neutral"} />
                  <StatRow label="ROE" value={`${data.fundamentals?.roe?.toFixed(1)}%`} status={data.fundamentals?.roe > 15 ? "good" : "neutral"} />
                  <StatRow label="52W High" value={`$${data.high52?.toFixed(2)}`} status="neutral" />
                  <StatRow label="52W Low" value={`$${data.low52?.toFixed(2)}`} status="neutral" />
                </Card>

                <Card style={{ marginTop: 12 }}>
                  <div style={{ color: "#334155", fontSize: 9, letterSpacing: 1.5, marginBottom: 12 }}>POSITION SIZE CALCULATOR</div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ color: "#475569", fontSize: 11, display: "block", marginBottom: 4 }}>PORTFOLIO SIZE ($)</label>
                    <input type="number" value={posSize} onChange={e => setPosSize(Number(e.target.value))}
                      style={{ width: "100%", background: "#0a1628", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 12px", fontSize: 14, color: "#f8fafc" }} />
                  </div>
                  <div style={{ background: "#0a1628", borderRadius: 10, padding: 14, lineHeight: 2.2, fontSize: 12 }}>
                    {[["2% Risk Amount", `$${(posSize*0.02).toFixed(0)}`],
                      ["Entry Price", `$${data.price?.toFixed(2)}`],
                      ["Stop Loss", `$${data.trade_signals?.[data.trade_signals.length-1]?.stop_loss || (data.price*0.96).toFixed(2)}`]
                    ].map(([l,v]) => (
                      <div key={l} style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#334155" }}>{l}</span>
                        <span style={{ color: "#06b6d4" }}>{v}</span>
                      </div>
                    ))}
                    <div style={{ borderTop: "1px solid #1e293b", paddingTop: 8, marginTop: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "#475569" }}>Suggested Shares</span>
                      <span style={{ color: "#4ade80", fontSize: 22, fontWeight: 700 }}>
                        {Math.max(1, Math.floor((posSize*0.02) / (data.price*0.04)))}
                      </span>
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {!data && !loading && (
          <div style={{ textAlign: "center", paddingTop: 80 }}>
            <div style={{ fontSize: 56, marginBottom: 14, opacity: 0.06 }}>◈</div>
            <div style={{ fontSize: 12, color: "#1e293b", letterSpacing: 3 }}>ENTER A TICKER TO BEGIN FULL ANALYSIS</div>
            <div style={{ fontSize: 10, color: "#0f172a", marginTop: 6, letterSpacing: 2 }}>ALL CANDLES · ALL INDICATORS · PATTERNS · BACKTEST · PREDICTIONS</div>
          </div>
        )}
      </div>
    </div>
  );
}
