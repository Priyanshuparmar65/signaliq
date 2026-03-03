from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
import os
import math
import statistics
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="SignalIQ Predictive Engine", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FINNHUB_KEY = os.getenv("FINNHUB_API_KEY", "d6imv7hr01qm7dc84u1gd6imv7hr01qm7dc84u20")

TIMEFRAMES = {
    "1min":  {"resolution": "1",  "days": 1},
    "5min":  {"resolution": "5",  "days": 5},
    "1hour": {"resolution": "60", "days": 30},
    "1day":  {"resolution": "D",  "days": 365},
    "1week": {"resolution": "W",  "days": 730},
}

# ── INDICATORS ────────────────────────────────────────────────────────────────

def compute_rsi(closes, period=14):
    rsi = [None] * period
    for i in range(period, len(closes)):
        gains = losses = 0
        for j in range(i - period, i):
            d = closes[j+1] - closes[j]
            if d > 0: gains += d
            else: losses -= d
        ag = gains / period
        al = losses / period
        rsi.append(round(100 - 100/(1 + ag/al), 2) if al != 0 else 100)
    return rsi

def compute_ema(closes, period):
    if len(closes) < period:
        return [None] * len(closes)
    k = 2 / (period + 1)
    result = [None] * (period - 1)
    result.append(round(sum(closes[:period]) / period, 4))
    for price in closes[period:]:
        result.append(round(price * k + result[-1] * (1 - k), 4))
    return result

def compute_macd(closes):
    e12 = compute_ema(closes, 12)
    e26 = compute_ema(closes, 26)
    macd_line = [None if e12[i] is None or e26[i] is None else round(e12[i] - e26[i], 4) for i in range(len(closes))]
    valid = [v for v in macd_line if v is not None]
    sig_raw = compute_ema(valid, 9) if len(valid) >= 9 else [None]*len(valid)
    pad = len(macd_line) - len(sig_raw)
    sig = [None]*pad + sig_raw
    hist = [None if macd_line[i] is None or sig[i] is None else round(macd_line[i] - sig[i], 4) for i in range(len(macd_line))]
    return {"macd": macd_line, "signal": sig, "histogram": hist}

def compute_bollinger(closes, period=20, std_mult=2.0):
    upper, mid, lower = [], [], []
    for i in range(len(closes)):
        if i < period - 1:
            upper.append(None); mid.append(None); lower.append(None)
        else:
            sl = closes[i-period+1:i+1]
            sma = sum(sl)/period
            std = statistics.stdev(sl) if len(sl) > 1 else 0
            mid.append(round(sma, 2))
            upper.append(round(sma + std_mult*std, 2))
            lower.append(round(sma - std_mult*std, 2))
    return {"upper": upper, "middle": mid, "lower": lower}

def compute_stochastic(highs, lows, closes, k=14, d=3):
    k_vals = []
    for i in range(len(closes)):
        if i < k-1:
            k_vals.append(None)
        else:
            hh = max(highs[i-k+1:i+1])
            ll = min(lows[i-k+1:i+1])
            k_vals.append(round(100*(closes[i]-ll)/(hh-ll), 2) if hh != ll else 50)
    valid_k = [v for v in k_vals if v is not None]
    d_raw = [None]*(d-1) + [round(sum(valid_k[i-d+1:i+1])/d, 2) for i in range(d-1, len(valid_k))]
    d_vals = [None]*(len(k_vals)-len(d_raw)) + d_raw
    return {"k": k_vals, "d": d_vals}

def compute_atr(highs, lows, closes, period=14):
    tr = [highs[0]-lows[0]]
    for i in range(1, len(closes)):
        tr.append(max(highs[i]-lows[i], abs(highs[i]-closes[i-1]), abs(lows[i]-closes[i-1])))
    atr = [None]*(period-1)
    for i in range(period-1, len(tr)):
        atr.append(round(sum(tr[i-period+1:i+1])/period, 4))
    return atr

def compute_vwap(highs, lows, closes, volumes):
    tp = [(h+l+c)/3 for h,l,c in zip(highs, lows, closes)]
    ctv = cv = 0
    vwap = []
    for i in range(len(closes)):
        ctv += tp[i]*volumes[i]; cv += volumes[i]
        vwap.append(round(ctv/cv if cv else closes[i], 2))
    return vwap

def compute_sma_series(closes, period):
    result = []
    for i in range(len(closes)):
        sl = closes[max(0,i-period+1):i+1]
        result.append(round(sum(sl)/len(sl), 2))
    return result

# ── SUPPORT & RESISTANCE ──────────────────────────────────────────────────────

def find_sr(highs, lows, lookback=5):
    sup, res = [], []
    for i in range(lookback, len(highs)-lookback):
        if lows[i] == min(lows[i-lookback:i+lookback+1]):
            sup.append(round(lows[i], 2))
        if highs[i] == max(highs[i-lookback:i+lookback+1]):
            res.append(round(highs[i], 2))

    def cluster(levels, thresh=0.015):
        if not levels: return []
        levels = sorted(set(levels))
        c = [[levels[0]]]
        for lv in levels[1:]:
            if abs(lv - c[-1][-1])/c[-1][-1] < thresh:
                c[-1].append(lv)
            else:
                c.append([lv])
        return [round(sum(x)/len(x), 2) for x in c]

    return {"supports": cluster(sup)[-6:], "resistances": cluster(res)[-6:]}

# ── PATTERN RECOGNITION ───────────────────────────────────────────────────────

def detect_patterns(highs, lows, closes):
    patterns = []
    n = len(closes)
    if n < 20: return patterns

    # Double Top
    if n >= 30:
        rh = highs[-30:]
        h1 = max(rh[:15]); h2 = max(rh[15:])
        if abs(h1-h2)/h1 < 0.025:
            patterns.append({"name": "Double Top", "type": "bearish", "strength": "strong",
                              "description": "Two peaks at similar level — bearish reversal", "action": "SELL"})

    # Double Bottom
    if n >= 30:
        rl = lows[-30:]
        l1 = min(rl[:15]); l2 = min(rl[15:])
        if abs(l1-l2)/l1 < 0.025:
            patterns.append({"name": "Double Bottom", "type": "bullish", "strength": "strong",
                              "description": "Two troughs at similar level — bullish reversal", "action": "BUY"})

    # Head & Shoulders
    if n >= 30:
        h = highs[-30:]
        left, head, right = max(h[:10]), max(h[10:20]), max(h[20:])
        if head > left and head > right and abs(left-right)/left < 0.03:
            patterns.append({"name": "Head & Shoulders", "type": "bearish", "strength": "very strong",
                              "description": "Classic H&S reversal — strong sell signal", "action": "SELL"})

    # Inverse H&S
    if n >= 30:
        l = lows[-30:]
        left, head, right = min(l[:10]), min(l[10:20]), min(l[20:])
        if head < left and head < right and abs(left-right)/left < 0.03:
            patterns.append({"name": "Inverse Head & Shoulders", "type": "bullish", "strength": "very strong",
                              "description": "Classic inverse H&S — strong buy signal", "action": "BUY"})

    # Bull Flag
    if n >= 20:
        uptrend = closes[-20] < closes[-10]
        flat = abs(closes[-5]-closes[-10])/closes[-10] < 0.03
        if uptrend and flat:
            patterns.append({"name": "Bull Flag", "type": "bullish", "strength": "moderate",
                              "description": "Uptrend + consolidation — bullish continuation", "action": "BUY"})

    # Bear Flag
    if n >= 20:
        downtrend = closes[-20] > closes[-10]
        flat = abs(closes[-5]-closes[-10])/closes[-10] < 0.03
        if downtrend and flat:
            patterns.append({"name": "Bear Flag", "type": "bearish", "strength": "moderate",
                              "description": "Downtrend + consolidation — bearish continuation", "action": "SELL"})

    # Golden Cross
    if n >= 52:
        sma20 = sum(closes[-20:])/20; sma50 = sum(closes[-50:])/50
        psma20 = sum(closes[-21:-1])/20; psma50 = sum(closes[-51:-1])/50
        if psma20 < psma50 and sma20 > sma50:
            patterns.append({"name": "Golden Cross", "type": "bullish", "strength": "strong",
                              "description": "20 SMA crossed above 50 SMA — strong uptrend signal", "action": "BUY"})
        elif psma20 > psma50 and sma20 < sma50:
            patterns.append({"name": "Death Cross", "type": "bearish", "strength": "strong",
                              "description": "20 SMA crossed below 50 SMA — strong downtrend signal", "action": "SELL"})

    # Ascending Triangle
    if n >= 20:
        highs_flat = (max(highs[-20:])-min(highs[-20:]))/max(highs[-20:]) < 0.02
        lows_rising = lows[-20] < lows[-10] < lows[-1]
        if highs_flat and lows_rising:
            patterns.append({"name": "Ascending Triangle", "type": "bullish", "strength": "moderate",
                              "description": "Flat resistance + rising support — upside breakout likely", "action": "BUY"})

    # Descending Triangle
    if n >= 20:
        lows_flat = (max(lows[-20:])-min(lows[-20:]))/max(lows[-20:]) < 0.02
        highs_falling = highs[-20] > highs[-10] > highs[-1]
        if lows_flat and highs_falling:
            patterns.append({"name": "Descending Triangle", "type": "bearish", "strength": "moderate",
                              "description": "Flat support + falling resistance — downside breakdown likely", "action": "SELL"})

    return patterns

# ── TREND DETECTION ───────────────────────────────────────────────────────────

def detect_trend(closes, highs, lows):
    if len(closes) < 20:
        return {"trend": "sideways", "strength": "weak", "description": "Not enough data", "slope": 0}
    slope = (closes[-1] - closes[-20]) / closes[-20] * 100
    sma20 = sum(closes[-20:])/20
    sma50 = sum(closes[-min(50,len(closes)):])/min(50,len(closes))
    hh = highs[-1] > highs[-10] > highs[-20]
    hl = lows[-1] > lows[-10] > lows[-20]
    lh = highs[-1] < highs[-10] < highs[-20]
    ll = lows[-1] < lows[-10] < lows[-20]

    if hh and hl and closes[-1] > sma20:
        return {"trend": "uptrend", "strength": "strong" if slope > 5 else "moderate",
                "description": f"Uptrend: higher highs & higher lows (+{slope:.1f}%)", "slope": round(slope,2)}
    elif lh and ll and closes[-1] < sma20:
        return {"trend": "downtrend", "strength": "strong" if slope < -5 else "moderate",
                "description": f"Downtrend: lower highs & lower lows ({slope:.1f}%)", "slope": round(slope,2)}
    elif abs(slope) < 2:
        return {"trend": "sideways", "strength": "neutral",
                "description": f"Sideways consolidation — no clear direction ({slope:.1f}%)", "slope": round(slope,2)}
    elif slope > 0:
        return {"trend": "uptrend", "strength": "weak",
                "description": f"Weak uptrend developing (+{slope:.1f}%)", "slope": round(slope,2)}
    else:
        return {"trend": "downtrend", "strength": "weak",
                "description": f"Weak downtrend ({slope:.1f}%)", "slope": round(slope,2)}

# ── PRICE PREDICTION ──────────────────────────────────────────────────────────

def predict_prices(closes, periods=30):
    n = len(closes)
    if n < 10: return []
    lb = min(60, n)
    y = closes[-lb:]
    xm = (lb-1)/2; ym = sum(y)/lb
    num = sum((i-xm)*(y[i]-ym) for i in range(lb))
    den = sum((i-xm)**2 for i in range(lb))
    slope = num/den if den else 0
    intercept = ym - slope*xm
    momentum = (closes[-1]-closes[-min(10,n)])/closes[-min(10,n)]
    vol = statistics.stdev(closes[-min(20,n):]) if len(closes) >= 2 else 0

    preds = []
    for i in range(1, periods+1):
        base = intercept + slope*(lb+i)
        adj = base*(1 + momentum*0.1*math.exp(-i*0.05))
        nf = 1 + (hash(f"{closes[-1]}{i}") % 100 - 50)/5000
        pred = round(adj*nf, 2)
        preds.append({
            "period": i,
            "predicted": pred,
            "upper": round(pred + vol*math.sqrt(i)*0.5, 2),
            "lower": round(pred - vol*math.sqrt(i)*0.5, 2),
            "confidence": max(40, round(95 - i*1.5))
        })
    return preds

# ── TRADE SIGNAL GENERATOR ────────────────────────────────────────────────────

def generate_signals(candles, rsi, macd_data, bb):
    signals = []
    m = macd_data["macd"]; s = macd_data["signal"]; h = macd_data["histogram"]
    for i in range(1, len(candles)):
        if any(v is None for v in [rsi[i], m[i], s[i], bb["upper"][i], bb["lower"][i]]): continue
        c = candles[i]["close"]; r = rsi[i]; pr = rsi[i-1] or r
        sig = None; reason = []; strength = "weak"

        # RSI + MACD crossover
        if r < 35 and pr < 35 and m[i] and s[i] and m[i] > s[i] and m[i-1] and s[i-1] and m[i-1] < s[i-1]:
            sig = "BUY"; reason.append("RSI oversold + MACD bullish crossover"); strength = "strong"
        elif r > 65 and pr > 65 and m[i] and s[i] and m[i] < s[i] and m[i-1] and s[i-1] and m[i-1] > s[i-1]:
            sig = "SELL"; reason.append("RSI overbought + MACD bearish crossover"); strength = "strong"
        # Bollinger Band touch
        elif c <= bb["lower"][i] and r < 40:
            sig = "BUY"; reason.append("Price at lower Bollinger Band + RSI oversold"); strength = "moderate"
        elif c >= bb["upper"][i] and r > 60:
            sig = "SELL"; reason.append("Price at upper Bollinger Band + RSI overbought"); strength = "moderate"
        # MACD histogram flip
        elif h[i] and h[i-1] and h[i] > 0 and h[i-1] < 0:
            sig = "BUY"; reason.append("MACD histogram turned positive"); strength = "moderate"
        elif h[i] and h[i-1] and h[i] < 0 and h[i-1] > 0:
            sig = "SELL"; reason.append("MACD histogram turned negative"); strength = "moderate"

        if sig:
            atr = c * 0.02
            sl = round(c - atr*2, 2) if sig == "BUY" else round(c + atr*2, 2)
            tp = round(c + atr*4, 2) if sig == "BUY" else round(c - atr*4, 2)
            signals.append({
                "index": i, "date": candles[i]["date"], "type": sig,
                "price": c, "stop_loss": sl, "take_profit": tp,
                "risk_reward": "1:2", "reason": ", ".join(reason),
                "strength": strength, "rsi": r,
                "macd": round(m[i], 4) if m[i] else 0,
            })
    return signals[-50:]

# ── BACKTEST ──────────────────────────────────────────────────────────────────

def backtest(candles, signals):
    if not signals: return {"total_trades": 0, "wins": 0, "losses": 0, "win_rate": 0, "avg_return": 0, "total_return": 0, "results": []}
    results = []; wins = 0; total_ret = 0

    for sig in signals:
        idx = sig["index"]
        if idx >= len(candles)-1: continue
        entry = sig["price"]; sl = sig["stop_loss"]; tp = sig["take_profit"]; st = sig["type"]
        outcome = "open"; exit_price = None; exit_idx = None; pnl = 0

        for j in range(idx+1, min(idx+20, len(candles))):
            fh = candles[j]["high"]; fl = candles[j]["low"]
            if st == "BUY":
                if fl <= sl: outcome="loss"; exit_price=sl; exit_idx=j; pnl=round((sl-entry)/entry*100,2); break
                elif fh >= tp: outcome="win"; exit_price=tp; exit_idx=j; pnl=round((tp-entry)/entry*100,2); break
            else:
                if fh >= sl: outcome="loss"; exit_price=sl; exit_idx=j; pnl=round((entry-sl)/entry*100,2); break
                elif fl <= tp: outcome="win"; exit_price=tp; exit_idx=j; pnl=round((entry-tp)/entry*100,2); break

        if outcome == "open":
            exit_price = candles[-1]["close"]
            pnl = round((exit_price-entry)/entry*100,2) if st=="BUY" else round((entry-exit_price)/entry*100,2)
            outcome = "win" if pnl > 0 else "loss"

        if outcome == "win": wins += 1
        total_ret += pnl
        results.append({
            "entry_date": sig["date"],
            "exit_date": candles[min(exit_idx or -1, len(candles)-1)]["date"],
            "type": st, "entry_price": entry,
            "exit_price": round(exit_price, 2) if exit_price else entry,
            "pnl_pct": pnl, "outcome": outcome, "reason": sig["reason"],
        })

    total = len(results)
    return {
        "total_trades": total, "wins": wins, "losses": total-wins,
        "win_rate": round(wins/total*100,1) if total else 0,
        "avg_return": round(total_ret/total,2) if total else 0,
        "total_return": round(total_ret, 2),
        "results": results[-20:]
    }

# ── MAIN ROUTE ────────────────────────────────────────────────────────────────

@app.get("/analyze/{ticker}")
async def analyze(ticker: str, timeframe: str = "1day"):
    ticker = ticker.upper().strip()
    tf = TIMEFRAMES.get(timeframe, TIMEFRAMES["1day"])
    now = int(datetime.now().timestamp())
    from_ts = int((datetime.now() - timedelta(days=tf["days"])).timestamp())

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            cr = await client.get(f"https://finnhub.io/api/v1/stock/candle?symbol={ticker}&resolution={tf['resolution']}&from={from_ts}&to={now}&token={FINNHUB_KEY}")
            candle = cr.json()
            qr = await client.get(f"https://finnhub.io/api/v1/quote?symbol={ticker}&token={FINNHUB_KEY}")
            quote = qr.json()
            pr = await client.get(f"https://finnhub.io/api/v1/stock/profile2?symbol={ticker}&token={FINNHUB_KEY}")
            profile = pr.json()
            mr = await client.get(f"https://finnhub.io/api/v1/stock/metric?symbol={ticker}&metric=all&token={FINNHUB_KEY}")
            metrics = mr.json()
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    if not candle.get("t") or candle.get("s") == "no_data":
        raise HTTPException(status_code=404, detail=f"No candle data for '{ticker}'")

    candles = [{"date": datetime.fromtimestamp(candle["t"][i]).strftime("%Y-%m-%d %H:%M"),
                "open": round(candle["o"][i],2), "high": round(candle["h"][i],2),
                "low": round(candle["l"][i],2), "close": round(candle["c"][i],2),
                "volume": int(candle["v"][i])} for i in range(len(candle["t"]))]

    closes = [c["close"] for c in candles]
    highs  = [c["high"]  for c in candles]
    lows   = [c["low"]   for c in candles]
    vols   = [c["volume"] for c in candles]

    # Compute all indicators
    rsi   = compute_rsi(closes)
    macd  = compute_macd(closes)
    bb    = compute_bollinger(closes)
    stoch = compute_stochastic(highs, lows, closes)
    atr   = compute_atr(highs, lows, closes)
    vwap  = compute_vwap(highs, lows, closes, vols)
    sma20  = compute_sma_series(closes, 20)
    sma50  = compute_sma_series(closes, 50)
    sma200 = compute_sma_series(closes, 200)

    sr       = find_sr(highs, lows)
    patterns = detect_patterns(highs, lows, closes)
    trend    = detect_trend(closes, highs, lows)
    signals  = generate_signals(candles, rsi, macd, bb)
    bt       = backtest(candles, signals)
    preds    = {"5_periods": predict_prices(closes, 5),
                "10_periods": predict_prices(closes, 10),
                "30_periods": predict_prices(closes, 30)}

    # Overall score
    cur_rsi  = next((v for v in reversed(rsi) if v is not None), 50)
    cur_macd = next((v for v in reversed(macd["macd"]) if v is not None), 0)
    cur_sma50  = sma50[-1]; cur_sma200 = sma200[-1]
    bull_p = sum(1 for p in patterns if p["type"]=="bullish")
    bear_p = sum(1 for p in patterns if p["type"]=="bearish")

    score = 50
    score += 20 if cur_rsi < 40 else -20 if cur_rsi > 60 else 0
    score += 15 if cur_macd > 0 else -15
    score += 10 if cur_sma50 > cur_sma200 else -10
    score += 10*(bull_p - bear_p)
    score += 10 if trend["trend"]=="uptrend" else -10 if trend["trend"]=="downtrend" else 0
    score = max(0, min(100, score))

    signal     = "BUY" if score >= 60 else "SELL" if score <= 40 else "HOLD"
    confidence = min(95, max(50, score))
    price      = quote.get("c", closes[-1])
    prev_close = quote.get("pc", closes[-2] if len(closes)>1 else closes[-1])
    m = metrics.get("metric", {})

    return {
        "ticker": ticker,
        "name": profile.get("name", f"{ticker} Corp."),
        "sector": profile.get("finnhubIndustry","Equity"),
        "logo": profile.get("logo",""),
        "timeframe": timeframe,
        "price": price,
        "prev_close": prev_close,
        "change": round(price-prev_close,2),
        "change_pct": round((price-prev_close)/prev_close*100,2),
        "high52": m.get("52WeekHigh", max(highs)),
        "low52": m.get("52WeekLow", min(lows)),
        "total_candles": len(candles),
        "candles": candles,
        "indicators": {
            "rsi": rsi, "macd": macd["macd"], "macd_signal": macd["signal"],
            "macd_histogram": macd["histogram"], "bb_upper": bb["upper"],
            "bb_middle": bb["middle"], "bb_lower": bb["lower"],
            "stoch_k": stoch["k"], "stoch_d": stoch["d"],
            "atr": atr, "vwap": vwap,
            "sma20": sma20, "sma50": sma50, "sma200": sma200,
        },
        "current": {
            "rsi": cur_rsi, "macd": round(cur_macd,4),
            "sma50": cur_sma50, "sma200": cur_sma200,
            "atr": next((v for v in reversed(atr) if v is not None),0),
            "vwap": vwap[-1] if vwap else price,
        },
        "support_resistance": sr,
        "patterns": patterns,
        "trend": trend,
        "trade_signals": signals,
        "backtest": bt,
        "predictions": preds,
        "signal": signal,
        "confidence": confidence,
        "score": score,
        "bullish_patterns": bull_p,
        "bearish_patterns": bear_p,
        "fundamentals": {
            "pe": m.get("peNormalizedAnnual") or m.get("peTTM") or 20,
            "eps": m.get("epsNormalizedAnnual") or 2.0,
            "revenue_growth": m.get("revenueGrowthTTMYoy") or 10.0,
            "debt_equity": m.get("totalDebt/totalEquityAnnual") or 0.5,
            "margin": m.get("netProfitMarginTTM") or 15.0,
            "roe": m.get("roeTTM") or 0,
        }
    }

@app.get("/analyze/{ticker}/all-timeframes")
async def all_timeframes(ticker: str):
    results = {}
    for tf in ["1hour", "1day", "1week"]:
        try:
            r = await analyze(ticker, tf)
            results[tf] = {"signal": r["signal"], "confidence": r["confidence"],
                           "trend": r["trend"], "patterns": r["patterns"],
                           "win_rate": r["backtest"]["win_rate"]}
        except:
            results[tf] = {"signal": "HOLD", "confidence": 50, "error": "No data"}

    sigs = [r["signal"] for r in results.values()]
    consensus = "BUY" if sigs.count("BUY") > sigs.count("SELL") else "SELL" if sigs.count("SELL") > sigs.count("BUY") else "HOLD"
    return {"ticker": ticker.upper(), "consensus_signal": consensus, "timeframes": results}

@app.get("/")
async def root():
    return {"status": "SignalIQ Predictive Engine v2.0 running ✅"}

@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}
