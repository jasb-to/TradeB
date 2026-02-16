import https from "https"

// ═══════════════════════════════════════════════════════════════════
// 6-MONTH BACKTEST: STRICT vs BALANCED_BREAKOUT
// Real OANDA data | XAU_USD + GBP_JPY | Aug 2025 - Feb 2026
// ═══════════════════════════════════════════════════════════════════

const OANDA_KEY = process.env.OANDA_API_KEY
const SYMBOLS = ["XAU_USD", "GBP_JPY"]
const SERVERS = ["api-fxtrade.oanda.com", "api-fxpractice.oanda.com"]

function fetchOANDAFromServer(hostname, instrument, granularity, count) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname,
      path: `/v3/instruments/${instrument}/candles?granularity=${granularity}&count=${count}&price=M`,
      method: "GET",
      headers: {
        Authorization: `Bearer ${OANDA_KEY}`,
        "Content-Type": "application/json",
        "Accept-Datetime-Format": "RFC3339",
      },
    }
    https.request(opts, (res) => {
      let d = ""
      res.on("data", (c) => (d += c))
      res.on("end", () => {
        try {
          const r = JSON.parse(d)
          if (r.candles) resolve(r.candles)
          else reject(new Error(`OANDA ${hostname}: ${d.substring(0, 200)}`))
        } catch (e) { reject(e) }
      })
    }).on("error", reject).end()
  })
}

async function fetchOANDA(instrument, granularity, count) {
  for (const server of SERVERS) {
    try {
      const result = await fetchOANDAFromServer(server, instrument, granularity, count)
      console.log(`  OK: ${server} returned ${result.length} candles for ${instrument} ${granularity}`)
      return result
    } catch (e) {
      console.log(`  FAIL: ${server} - ${e.message.substring(0, 100)}`)
    }
  }
  console.error(`  All servers failed for ${instrument} ${granularity}`)
  return []
}

function parseCandles(raw) {
  return raw.filter(c => c.complete !== false && c.mid).map(c => ({
    time: c.time,
    open: parseFloat(c.mid.o),
    high: parseFloat(c.mid.h),
    low: parseFloat(c.mid.l),
    close: parseFloat(c.mid.c),
    volume: c.volume || 0,
  }))
}

// ─── TECHNICAL INDICATORS ───────────────────────────────────────
function ema(values, period) {
  const k = 2 / (period + 1)
  const result = [values[0]]
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k))
  }
  return result
}

function rsi(closes, period = 14) {
  const results = new Array(closes.length).fill(50)
  if (closes.length < period + 1) return results
  let avgGain = 0, avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    if (d > 0) avgGain += d; else avgLoss -= d
  }
  avgGain /= period; avgLoss /= period
  results[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period
    results[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return results
}

function adx(candles, period = 14) {
  const results = new Array(candles.length).fill(20)
  if (candles.length < period * 2) return results
  const trueRanges = [], plusDM = [], minusDM = []
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close
    trueRanges.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)))
    const up = candles[i].high - candles[i - 1].high
    const down = candles[i - 1].low - candles[i].low
    plusDM.push(up > down && up > 0 ? up : 0)
    minusDM.push(down > up && down > 0 ? down : 0)
  }
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period
  let pdi = plusDM.slice(0, period).reduce((a, b) => a + b, 0) / period
  let mdi = minusDM.slice(0, period).reduce((a, b) => a + b, 0) / period
  let adxVal = 20
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period
    pdi = (pdi * (period - 1) + plusDM[i]) / period
    mdi = (mdi * (period - 1) + minusDM[i]) / period
    const pdiN = atr > 0 ? (pdi / atr) * 100 : 0
    const mdiN = atr > 0 ? (mdi / atr) * 100 : 0
    const dx = pdiN + mdiN > 0 ? (Math.abs(pdiN - mdiN) / (pdiN + mdiN)) * 100 : 0
    adxVal = (adxVal * (period - 1) + dx) / period
    results[i + 1] = adxVal
  }
  return results
}

function atr(candles, period = 14) {
  const results = new Array(candles.length).fill(0)
  if (candles.length < 2) return results
  const trs = []
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)))
  }
  let avg = trs.slice(0, period).reduce((a, b) => a + b, 0) / period
  results[period] = avg
  for (let i = period; i < trs.length; i++) {
    avg = (avg * (period - 1) + trs[i]) / period
    results[i + 1] = avg
  }
  return results
}

function vwap(candles) {
  const results = new Array(candles.length).fill(0)
  let cumVP = 0, cumVol = 0
  for (let i = 0; i < candles.length; i++) {
    const tp = (candles[i].high + candles[i].low + candles[i].close) / 3
    const vol = candles[i].volume || 1
    cumVP += tp * vol; cumVol += vol
    results[i] = cumVP / cumVol
  }
  return results
}

// ─── STRICT MODE EVALUATION ─────────────────────────────────────
function evaluateStrict(candles1h, ema20_1h, ema50_1h, rsi1h, adx1h, vwap1h, atr1h, dailyBias, h4Bias, i) {
  const close = candles1h[i].close
  // Determine 1H bias
  const h1Bias = close > ema20_1h[i] && ema20_1h[i] > ema50_1h[i] && rsi1h[i] > 50 ? "LONG"
    : close < ema20_1h[i] && ema20_1h[i] < ema50_1h[i] && rsi1h[i] < 50 ? "SHORT" : "NEUTRAL"
  
  // STRICT requires Daily + 4H + 1H alignment
  if (dailyBias === "NEUTRAL" || h4Bias === "NEUTRAL" || h1Bias === "NEUTRAL") return null
  if (dailyBias !== h4Bias || h4Bias !== h1Bias) return null
  
  const direction = dailyBias
  // ADX check
  if (adx1h[i] < 19) return null
  // VWAP check
  if (direction === "LONG" && close <= vwap1h[i]) return null
  if (direction === "SHORT" && close >= vwap1h[i]) return null

  // Score
  let score = 5.5 // Base for all aligned
  if (adx1h[i] >= 25) score += 1.5
  else if (adx1h[i] >= 20) score += 1
  if (adx1h[i] >= 23.5) score += 0.5

  const tier = score >= 7.5 ? "A+" : score >= 5.5 ? "A" : score >= 5 ? "B" : null
  if (!tier) return null

  return { direction, tier, score, sl: atr1h[i] * 1.5, atr: atr1h[i] }
}

// ─── BALANCED MODE EVALUATION ───────────────────────────────────
function evaluateBalanced(candles1h, ema20_1h, ema50_1h, rsi1h, adx1h, vwap1h, atr1h, dailyBias, ema20_4h, ema50_4h, i) {
  const close = candles1h[i].close

  // 4H trend (HARD GATE)
  const trend4h = ema20_4h > ema50_4h ? "LONG" : ema20_4h < ema50_4h ? "SHORT" : "NEUTRAL"
  if (trend4h === "NEUTRAL") return null

  // 1H Breakout: close breaks 20-bar high/low
  if (i < 20) return null
  const lookback = candles1h.slice(i - 20, i)
  const high20 = Math.max(...lookback.map(c => c.high))
  const low20 = Math.min(...lookback.map(c => c.low))

  let direction = null
  if (trend4h === "LONG" && close > high20) direction = "LONG"
  if (trend4h === "SHORT" && close < low20) direction = "SHORT"
  if (!direction) return null

  // ADX >= 20
  if (adx1h[i] < 20) return null

  // ATR filter
  const atrThreshold = close > 1000 ? 5.0 : 0.15
  if (atr1h[i] < atrThreshold) return null

  // VWAP confirmation
  if (direction === "LONG" && close <= vwap1h[i]) return null
  if (direction === "SHORT" && close >= vwap1h[i]) return null

  // Scoring (daily is weight only, not blocking)
  let score = 5
  if (dailyBias === direction) score += 1
  if (adx1h[i] >= 30) score += 2
  else if (adx1h[i] >= 25) score += 1.5
  else score += 1

  const tier = score >= 8 ? "A+" : score >= 6.5 ? "A" : "B"
  return { direction, tier, score, sl: atr1h[i] * 1.5, atr: atr1h[i] }
}

// ─── TRADE SIMULATOR ────────────────────────────────────────────
function simulateTrades(candles1h, signals, mode) {
  const trades = []
  let inTrade = false
  let cooldown = 0

  for (const sig of signals) {
    if (cooldown > 0) { cooldown--; continue }
    if (inTrade) continue

    const entryIdx = sig.idx
    const entryPrice = candles1h[entryIdx].close
    const riskAmount = sig.sl
    const direction = sig.direction
    const tier = sig.tier

    // TP1 at 1.5R for BALANCED, 1.0R for STRICT
    const tp1Distance = mode === "BALANCED" ? riskAmount * 1.5 : riskAmount * 1.0
    const tp1 = direction === "LONG" ? entryPrice + tp1Distance : entryPrice - tp1Distance

    // TP2 at 3R (A/A+ only)
    const tp2Distance = riskAmount * 3.0
    const tp2 = direction === "LONG" ? entryPrice + tp2Distance : entryPrice - tp2Distance

    const sl = direction === "LONG" ? entryPrice - riskAmount : entryPrice + riskAmount

    inTrade = true
    let exitPrice = null, exitReason = null, exitIdx = null
    let tp1Hit = false
    let currentSL = sl

    // Max hold: 500 bars (~21 days on 1H)
    for (let j = entryIdx + 1; j < Math.min(entryIdx + 500, candles1h.length); j++) {
      const bar = candles1h[j]

      if (direction === "LONG") {
        // Check SL
        if (bar.low <= currentSL) {
          exitPrice = currentSL; exitReason = tp1Hit ? "BE_STOP" : "SL"; exitIdx = j; break
        }
        // Check TP1
        if (!tp1Hit && bar.high >= tp1) {
          tp1Hit = true
          if (tier === "B") {
            exitPrice = tp1; exitReason = "TP1_HARD"; exitIdx = j; break
          }
          currentSL = entryPrice // Move to breakeven
        }
        // Check TP2 (A/A+ only)
        if (tp1Hit && bar.high >= tp2) {
          exitPrice = tp2; exitReason = "TP2"; exitIdx = j; break
        }
      } else {
        if (bar.high >= currentSL) {
          exitPrice = currentSL; exitReason = tp1Hit ? "BE_STOP" : "SL"; exitIdx = j; break
        }
        if (!tp1Hit && bar.low <= tp1) {
          tp1Hit = true
          if (tier === "B") {
            exitPrice = tp1; exitReason = "TP1_HARD"; exitIdx = j; break
          }
          currentSL = entryPrice
        }
        if (tp1Hit && bar.low <= tp2) {
          exitPrice = tp2; exitReason = "TP2"; exitIdx = j; break
        }
      }
    }

    if (exitPrice !== null) {
      const pnlRaw = direction === "LONG" ? exitPrice - entryPrice : entryPrice - exitPrice
      const rMultiple = riskAmount > 0 ? pnlRaw / riskAmount : 0
      const holdBars = exitIdx - entryIdx
      const holdHours = holdBars // 1H candles = 1 hour each

      trades.push({
        entryTime: candles1h[entryIdx].time,
        exitTime: candles1h[exitIdx].time,
        direction, tier, score: sig.score,
        entryPrice, exitPrice, exitReason,
        rMultiple: Math.round(rMultiple * 100) / 100,
        holdHours,
      })
      cooldown = 3 // Cooldown 3 bars after trade
    }
    inTrade = false
  }
  return trades
}

// ─── METRICS CALCULATOR ─────────────────────────────────────────
function calcMetrics(trades, label) {
  const wins = trades.filter(t => t.rMultiple > 0)
  const losses = trades.filter(t => t.rMultiple <= 0)
  const totalR = trades.reduce((s, t) => s + t.rMultiple, 0)
  const avgR = trades.length > 0 ? totalR / trades.length : 0
  const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0
  const avgWinR = wins.length > 0 ? wins.reduce((s, t) => s + t.rMultiple, 0) / wins.length : 0
  const avgLossR = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.rMultiple, 0) / losses.length) : 0
  const expectancy = trades.length > 0 ? (winRate / 100) * avgWinR - ((100 - winRate) / 100) * avgLossR : 0
  const weeks = 26
  const tradesPerWeek = trades.length / weeks
  const avgHold = trades.length > 0 ? trades.reduce((s, t) => s + t.holdHours, 0) / trades.length : 0
  const over24h = trades.filter(t => t.holdHours > 24).length
  const pctOver24h = trades.length > 0 ? (over24h / trades.length) * 100 : 0

  // Max drawdown in R
  let peak = 0, dd = 0, maxDD = 0
  let cumR = 0
  for (const t of trades) {
    cumR += t.rMultiple
    if (cumR > peak) peak = cumR
    dd = peak - cumR
    if (dd > maxDD) maxDD = dd
  }

  // Longest losing streak
  let streak = 0, maxStreak = 0
  for (const t of trades) {
    if (t.rMultiple <= 0) { streak++; if (streak > maxStreak) maxStreak = streak }
    else streak = 0
  }

  // Tier breakdown
  const tiers = {}
  for (const t of trades) {
    if (!tiers[t.tier]) tiers[t.tier] = { trades: 0, wins: 0, totalR: 0 }
    tiers[t.tier].trades++
    if (t.rMultiple > 0) tiers[t.tier].wins++
    tiers[t.tier].totalR += t.rMultiple
  }

  return {
    label, totalTrades: trades.length, tradesPerWeek: Math.round(tradesPerWeek * 10) / 10,
    winRate: Math.round(winRate * 10) / 10, avgR: Math.round(avgR * 100) / 100,
    expectancy: Math.round(expectancy * 100) / 100, maxDrawdownR: Math.round(maxDD * 10) / 10,
    longestLosingStreak: maxStreak, avgHoldHours: Math.round(avgHold),
    pctOver24h: Math.round(pctOver24h), netR: Math.round(totalR * 10) / 10,
    tiers,
  }
}

// ─── MAIN ───────────────────────────────────────────────────────
async function main() {
  if (!OANDA_KEY) {
    console.error("OANDA_API_KEY not set")
    return
  }

  console.log("========================================")
  console.log("  6-MONTH BACKTEST: STRICT vs BALANCED")
  console.log("  Real OANDA Data | XAU_USD + GBP_JPY")
  console.log("========================================\n")

  const allResults = []

  for (const symbol of SYMBOLS) {
    console.log(`\n--- ${symbol} ---`)
    console.log("Fetching 1H data (5000 candles = ~208 days)...")
    const raw1h = await fetchOANDA(symbol, "H1", 5000)
    const candles1h = parseCandles(raw1h)
    console.log(`  1H: ${candles1h.length} candles`)

    console.log("Fetching 4H data (1500 candles = ~250 days)...")
    const raw4h = await fetchOANDA(symbol, "H4", 1500)
    const candles4h = parseCandles(raw4h)
    console.log(`  4H: ${candles4h.length} candles`)

    console.log("Fetching Daily data (200 candles)...")
    const rawD = await fetchOANDA(symbol, "D", 200)
    const candlesD = parseCandles(rawD)
    console.log(`  Daily: ${candlesD.length} candles`)

    if (candles1h.length < 100 || candles4h.length < 50 || candlesD.length < 30) {
      console.error(`  Insufficient data for ${symbol}, skipping`)
      continue
    }

    // Calculate indicators
    const closes1h = candles1h.map(c => c.close)
    const ema20_1h = ema(closes1h, 20)
    const ema50_1h = ema(closes1h, 50)
    const rsi1h = rsi(closes1h, 14)
    const adx1h = adx(candles1h, 14)
    const atr1h = atr(candles1h, 14)
    const vwap1h = vwap(candles1h)

    const closesD = candlesD.map(c => c.close)
    const ema20D = ema(closesD, 20)
    const ema50D = ema(closesD, 50)
    const rsiD = rsi(closesD, 14)

    const closes4h = candles4h.map(c => c.close)
    const ema20_4h = ema(closes4h, 20)
    const ema50_4h = ema(closes4h, 50)
    const rsi4h = rsi(closes4h, 14)

    // Map 4H and Daily bars to 1H timestamps
    function findNearestIdx(targetTime, candles) {
      const t = new Date(targetTime).getTime()
      let best = 0
      for (let i = 0; i < candles.length; i++) {
        if (new Date(candles[i].time).getTime() <= t) best = i
      }
      return best
    }

    // Generate signals for STRICT
    console.log("Evaluating STRICT mode...")
    const strictSignals = []
    for (let i = 50; i < candles1h.length; i++) {
      const dIdx = findNearestIdx(candles1h[i].time, candlesD)
      const h4Idx = findNearestIdx(candles1h[i].time, candles4h)
      
      const dClose = candlesD[dIdx]?.close || 0
      const dailyBias = dClose > ema20D[dIdx] && ema20D[dIdx] > ema50D[dIdx] && rsiD[dIdx] > 50 ? "LONG"
        : dClose < ema20D[dIdx] && ema20D[dIdx] < ema50D[dIdx] && rsiD[dIdx] < 50 ? "SHORT" : "NEUTRAL"

      const h4Close = candles4h[h4Idx]?.close || 0
      const h4Bias = h4Close > ema20_4h[h4Idx] && ema20_4h[h4Idx] > ema50_4h[h4Idx] && rsi4h[h4Idx] > 50 ? "LONG"
        : h4Close < ema20_4h[h4Idx] && ema20_4h[h4Idx] < ema50_4h[h4Idx] && rsi4h[h4Idx] < 50 ? "SHORT" : "NEUTRAL"

      const result = evaluateStrict(candles1h, ema20_1h, ema50_1h, rsi1h, adx1h, vwap1h, atr1h, dailyBias, h4Bias, i)
      if (result) strictSignals.push({ ...result, idx: i })
    }
    console.log(`  STRICT signals: ${strictSignals.length}`)

    // Generate signals for BALANCED
    console.log("Evaluating BALANCED mode...")
    const balancedSignals = []
    for (let i = 50; i < candles1h.length; i++) {
      const dIdx = findNearestIdx(candles1h[i].time, candlesD)
      const h4Idx = findNearestIdx(candles1h[i].time, candles4h)

      const dClose = candlesD[dIdx]?.close || 0
      const dailyBias = dClose > ema20D[dIdx] && ema20D[dIdx] > ema50D[dIdx] && rsiD[dIdx] > 50 ? "LONG"
        : dClose < ema20D[dIdx] && ema20D[dIdx] < ema50D[dIdx] && rsiD[dIdx] < 50 ? "SHORT" : "NEUTRAL"

      const result = evaluateBalanced(candles1h, ema20_1h, ema50_1h, rsi1h, adx1h, vwap1h, atr1h, dailyBias, ema20_4h[h4Idx], ema50_4h[h4Idx], i)
      if (result) balancedSignals.push({ ...result, idx: i })
    }
    console.log(`  BALANCED signals: ${balancedSignals.length}`)

    // Simulate trades
    const strictTrades = simulateTrades(candles1h, strictSignals, "STRICT")
    const balancedTrades = simulateTrades(candles1h, balancedSignals, "BALANCED")

    const strictMetrics = calcMetrics(strictTrades, `${symbol} STRICT`)
    const balancedMetrics = calcMetrics(balancedTrades, `${symbol} BALANCED`)

    allResults.push(strictMetrics, balancedMetrics)

    // Print comparison table
    console.log(`\n=== ${symbol} COMPARISON ===`)
    console.log("Metric                | STRICT        | BALANCED")
    console.log("-".repeat(60))
    console.log(`Total Trades           | ${String(strictMetrics.totalTrades).padEnd(14)}| ${balancedMetrics.totalTrades}`)
    console.log(`Trades/Week            | ${String(strictMetrics.tradesPerWeek).padEnd(14)}| ${balancedMetrics.tradesPerWeek}`)
    console.log(`Win Rate               | ${String(strictMetrics.winRate + "%").padEnd(14)}| ${balancedMetrics.winRate}%`)
    console.log(`Avg R Multiple         | ${String(strictMetrics.avgR).padEnd(14)}| ${balancedMetrics.avgR}`)
    console.log(`Expectancy             | ${String(strictMetrics.expectancy + "R").padEnd(14)}| ${balancedMetrics.expectancy}R`)
    console.log(`Max Drawdown           | ${String(strictMetrics.maxDrawdownR + "R").padEnd(14)}| ${balancedMetrics.maxDrawdownR}R`)
    console.log(`Longest Losing Streak  | ${String(strictMetrics.longestLosingStreak).padEnd(14)}| ${balancedMetrics.longestLosingStreak}`)
    console.log(`Avg Hold Time (hrs)    | ${String(strictMetrics.avgHoldHours).padEnd(14)}| ${balancedMetrics.avgHoldHours}`)
    console.log(`% Trades > 24h         | ${String(strictMetrics.pctOver24h + "%").padEnd(14)}| ${balancedMetrics.pctOver24h}%`)
    console.log(`Net R (6 months)       | ${String(strictMetrics.netR + "R").padEnd(14)}| ${balancedMetrics.netR}R`)

    // Tier breakdown
    for (const mode of [strictMetrics, balancedMetrics]) {
      console.log(`\n  ${mode.label} Tier Breakdown:`)
      for (const [tier, data] of Object.entries(mode.tiers)) {
        const wr = data.trades > 0 ? Math.round((data.wins / data.trades) * 100) : 0
        console.log(`    ${tier}: ${data.trades} trades, ${wr}% win rate, ${Math.round(data.totalR * 10) / 10}R net`)
      }
    }

    // Trade log (first 10 for each)
    console.log(`\n  BALANCED Trade Log (first 15):`)
    balancedTrades.slice(0, 15).forEach((t, i) => {
      console.log(`    ${i + 1}. ${t.entryTime.substring(0, 16)} ${t.direction} ${t.tier} -> ${t.exitReason} ${t.rMultiple}R (${t.holdHours}h)`)
    })
  }

  // Final summary
  console.log("\n\n========================================")
  console.log("  FINAL SUMMARY: STRICT vs BALANCED")
  console.log("========================================\n")

  console.log(JSON.stringify(allResults, null, 2))

  // Success criteria check
  console.log("\n--- SUCCESS CRITERIA CHECK ---")
  for (const r of allResults) {
    if (r.label.includes("BALANCED")) {
      const pass = r.totalTrades >= 24 && r.totalTrades <= 48 // 4-8/month * 6 months
        && r.expectancy > 0.3
        && r.maxDrawdownR < 10
        && r.avgHoldHours >= 18
        && r.pctOver24h >= 30
      console.log(`${r.label}: ${pass ? "PASS" : "FAIL"}`)
      console.log(`  Trades: ${r.totalTrades} (need 24-48) ${r.totalTrades >= 24 && r.totalTrades <= 48 ? "OK" : "FAIL"}`)
      console.log(`  Expectancy: ${r.expectancy}R (need >0.3R) ${r.expectancy > 0.3 ? "OK" : "FAIL"}`)
      console.log(`  Max DD: ${r.maxDrawdownR}R (need <10R) ${r.maxDrawdownR < 10 ? "OK" : "FAIL"}`)
      console.log(`  Avg Hold: ${r.avgHoldHours}h (need >=18h) ${r.avgHoldHours >= 18 ? "OK" : "FAIL"}`)
      console.log(`  % >24h: ${r.pctOver24h}% (need >=30%) ${r.pctOver24h >= 30 ? "OK" : "FAIL"}`)
    }
  }
}

main().catch(console.error)
