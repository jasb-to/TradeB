const OANDA_API_KEY = process.env.OANDA_API_KEY

if (!OANDA_API_KEY) {
  console.error("[v0] Error: OANDA_API_KEY environment variable not set")
  process.exit(1)
}

interface Candle {
  time: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const isForexMarketOpen = (timestamp: Date): boolean => {
  const date = new Date(timestamp)
  const ukTime = new Date(date.toLocaleString("en-US", { timeZone: "Europe/London" }))
  const day = ukTime.getDay()
  const hours = ukTime.getHours()
  const minutes = ukTime.getMinutes()
  const timeInMinutes = hours * 60 + minutes

  if (day === 6) return false
  if (day === 0) return timeInMinutes >= 23 * 60
  if (day === 5) return timeInMinutes < 22 * 60 + 15

  const inMaintenanceWindow = timeInMinutes >= 22 * 60 + 15 && timeInMinutes < 23 * 60
  return !inMaintenanceWindow
}

const fetchOandaCandles = async (symbol: string, granularity: string, count: number): Promise<Candle[]> => {
  const baseUrl = "https://api-fxtrade.oanda.com"
  const url = `${baseUrl}/v3/instruments/${symbol}/candles?granularity=${granularity}&count=${count}&price=M`

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${OANDA_API_KEY}`,
      "Content-Type": "application/json",
    },
  })

  if (!response.ok) {
    console.error(`[v0] OANDA error: ${response.status}`)
    return []
  }

  const data = await response.json()
  return (data.candles || [])
    .filter((c: any) => c.complete && isForexMarketOpen(new Date(c.time)))
    .map((c: any) => ({
      time: new Date(c.time),
      open: Number.parseFloat(c.mid.o),
      high: Number.parseFloat(c.mid.h),
      low: Number.parseFloat(c.mid.l),
      close: Number.parseFloat(c.mid.c),
      volume: c.volume || 0,
    }))
    .reverse()
}

const calculateEMA = (candles: Candle[], period: number): number => {
  if (candles.length < period) return candles[candles.length - 1]?.close || 0

  let ema = candles[0].close
  const multiplier = 2 / (period + 1)

  for (let i = 1; i < candles.length; i++) {
    ema = candles[i].close * multiplier + ema * (1 - multiplier)
  }
  return ema
}

const calculateADX = (candles: Candle[], period: number = 14): number => {
  if (candles.length < period) return 20

  let trSum = 0
  let upSum = 0
  let downSum = 0

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high
    const low = candles[i].low
    const prevClose = candles[i - 1].close

    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose))
    const upMove = high > candles[i - 1].high ? high - candles[i - 1].high : 0
    const downMove = low < candles[i - 1].low ? candles[i - 1].low - low : 0

    trSum += tr
    if (upMove > downMove) upSum += upMove
    if (downMove > upMove) downSum += downMove
  }

  const atr = trSum / Math.min(period, candles.length - 1)
  if (atr === 0) return 20

  const di_plus = (upSum / Math.min(period, candles.length - 1) / atr) * 100
  const di_minus = (downSum / Math.min(period, candles.length - 1) / atr) * 100
  const di_diff = Math.abs(di_plus - di_minus)
  const di_sum = di_plus + di_minus

  return di_sum > 0 ? (di_diff / di_sum) * 100 : 20
}

const determineBias = (candles: Candle[], ema: number): "LONG" | "SHORT" | "NEUTRAL" => {
  if (candles.length === 0) return "NEUTRAL"
  const currentPrice = candles[candles.length - 1].close
  const previousPrice = candles.length > 1 ? candles[candles.length - 2].close : currentPrice

  if (currentPrice > ema && previousPrice > ema) return "LONG"
  if (currentPrice < ema && previousPrice < ema) return "SHORT"
  return "NEUTRAL"
}

const calculateATR = (candles: Candle[], period: number = 14): number => {
  if (candles.length < period) return 10

  let trSum = 0
  for (let i = Math.max(0, candles.length - period); i < candles.length; i++) {
    const high = candles[i].high
    const low = candles[i].low
    const tr =
      i > 0
        ? Math.max(high - low, Math.abs(high - candles[i - 1].close), Math.abs(low - candles[i - 1].close))
        : high - low
    trSum += tr
  }
  return trSum / period
}

// AGGRESSIVE: Extended session filter (04:00-20:00 UTC) - 1 hour earlier start, 1 hour later end
const isSilverSessionAllowedAggressive = (timestamp: Date): boolean => {
  const date = new Date(timestamp)
  const utcHours = date.getUTCHours()
  const utcMinutes = date.getUTCMinutes()
  
  // AGGRESSIVE: Extended session: 04:00-20:00 UTC (adds 1 more hour each side vs MODERATE)
  const timeInMinutes = utcHours * 60 + utcMinutes
  const aggressiveStartMinutes = 4 * 60 // 04:00 UTC
  const aggressiveEndMinutes = 20 * 60 // 20:00 UTC
  
  return timeInMinutes >= aggressiveStartMinutes && timeInMinutes < aggressiveEndMinutes
}

// AGGRESSIVE: Ultra-relaxed volatility filter (ATR ≥ 0.14 vs 0.15) - 5% reduction
const isSilverVolatilityAdequateAggressive = (atr: number): boolean => {
  return atr >= 0.14 // AGGRESSIVE: minimum ATR ≥ 0.14 (5% reduction from 0.15)
}

// AGGRESSIVE: Ultra-flexible MTF alignment (ANY timeframe + momentum confirmation)
const isSilverMTFAlignedAggressive = (
  dailyBias: string, 
  h4Bias: string, 
  h1Bias: string
): boolean => {
  // AGGRESSIVE: ANY timeframe alignment + momentum confirmation
  const anyAlignment = dailyBias !== "NEUTRAL" || h4Bias !== "NEUTRAL" || h1Bias !== "NEUTRAL"
  const momentumConfirmation = h1Bias !== "NEUTRAL" // 1H momentum drives the trade
  
  return anyAlignment && momentumConfirmation
}

// AGGRESSIVE: Get aligned direction from strongest signal
const getAlignedDirectionAggressive = (
  dailyBias: string, 
  h4Bias: string, 
  h1Bias: string
): string => {
  // AGGRESSIVE: Priority: 1H > 4H > Daily (momentum-driven)
  if (h1Bias !== "NEUTRAL") return h1Bias
  if (h4Bias !== "NEUTRAL") return h4Bias
  if (dailyBias !== "NEUTRAL") return dailyBias
  return "NONE"
}

// AGGRESSIVE: Evaluate Silver signal with 5% loosened parameters
const evaluateSilverEntryAggressive = (
  dailyBias: string, 
  h4Bias: string, 
  h1Bias: string, 
  adx1h: number, 
  currentPrice: number, 
  atr: number, 
  symbol: string
): any => {
  // AGGRESSIVE: Extended session filter (04:00-20:00 UTC)
  if (!isSilverSessionAllowedAggressive(new Date())) {
    return null
  }
  
  // AGGRESSIVE: Ultra-relaxed volatility filter (ATR ≥ 0.14)
  if (!isSilverVolatilityAdequateAggressive(atr)) {
    return null
  }
  
  // AGGRESSIVE: Ultra-flexible MTF alignment
  const hasAnyAlignment = isSilverMTFAlignedAggressive(dailyBias, h4Bias, h1Bias)
  const hasMomentumConfirmation = h1Bias !== "NEUTRAL"
  
  const mtfAligned = hasAnyAlignment && hasMomentumConfirmation
  const alignedDirection = getAlignedDirectionAggressive(dailyBias, h4Bias, h1Bias)
  
  if (!mtfAligned) {
    return null
  }
  
  // AGGRESSIVE: Lower ADX threshold (≥ 15.2 vs 16) - 5% reduction
  const isAPlusSetup = adx1h >= 20.9 && atr >= 0.14 // 5% reduction from 22
  const isASetup = adx1h >= 15.2 && atr >= 0.14 // 5% reduction from 16
  
  if (!isAPlusSetup && !isASetup) {
    return null
  }
  
  // Calculate Silver-specific entry parameters
  const atrPoints = atr
  const entryPrice = currentPrice
  const stopLoss = alignedDirection === "LONG" 
    ? currentPrice - atrPoints * 1.5 
    : currentPrice + atrPoints * 1.5
  
  const tp1 = alignedDirection === "LONG" 
    ? currentPrice + atrPoints * 2.0  // AGGRESSIVE: Maintain TP1
    : currentPrice - atrPoints * 2.0
  
  const tp2 = alignedDirection === "LONG" 
    ? currentPrice + atrPoints * 3.0  // AGGRESSIVE: Maintain TP2
    : currentPrice - atrPoints * 3.0

  const rr = Math.abs(tp1 - entryPrice) / Math.abs(entryPrice - stopLoss)
  
  if (rr < 1.0) return null
  
  return {
    direction: alignedDirection,
    entry: entryPrice,
    stopLoss,
    takeProfit1: tp1,
    takeProfit2: tp2,
    atr,
    setupTier: isAPlusSetup ? "A+" : "A",
    alignmentScore: 6,
    adx: adx1h,
    strategyType: "AGGRESSIVE",
  }
}

interface BacktestResults {
  trades: number
  wins: number
  losses: number
  profit: number
  tradeDetails: any[]
  tierBreakdown: { A: number; APlus: number; B: number }
  tp1Hits: number
  tp2Hits: number
  slHits: number
}

const runAggressiveBacktest = async (): Promise<BacktestResults> => {
  console.log("[v0] Starting AGGRESSIVE SILVER Backtest for XAG_USD...")
  console.log("[v0] Phase 2: AGGRESSIVE APPROACH (5% Loosened)")
  console.log("[v0] - Extended Session: 04:00-20:00 UTC (1hr earlier/later)")
  console.log("[v0] - Ultra-Relaxed Volatility: ATR ≥ 0.14 (5% reduction)")
  console.log("[v0] - Ultra-Flexible Alignment: ANY + momentum confirmation")
  console.log("[v0] - Lower ADX: ≥ 15.2 (5% reduction)")
  console.log("[v0] - TP1/TP2 Analysis: Tracking exit levels")
  console.log("[v0] Fetching 180 days of historical data...\n")

  const results: BacktestResults = {
    trades: 0,
    wins: 0,
    losses: 0,
    profit: 0,
    tradeDetails: [],
    tierBreakdown: { A: 0, APlus: 0, B: 0 },
    tp1Hits: 0,
    tp2Hits: 0,
    slHits: 0,
  }

  console.log(`[v0] Backtesting XAG_USD...`)

  const [daily, h4, h1, m15, m5] = await Promise.all([
    fetchOandaCandles("XAG_USD", "D", 180),
    fetchOandaCandles("XAG_USD", "H4", 180),
    fetchOandaCandles("XAG_USD", "H1", 180),
    fetchOandaCandles("XAG_USD", "M15", 180),
    fetchOandaCandles("XAG_USD", "M5", 180),
  ])

  if (daily.length === 0) {
    console.log(`[v0] Failed to fetch candles for XAG_USD`)
    return results
  }

  const minLength = Math.min(daily.length, h4.length, h1.length, m15.length, m5.length)
  console.log(`[v0] Got ${minLength} candles for XAG_USD`)

  for (let i = 20; i < minLength; i++) {
    const ema20Daily = calculateEMA(daily.slice(0, i + 1), 20)
    const ema20H4 = calculateEMA(h4.slice(0, i + 1), 20)
    const ema20H1 = calculateEMA(h1.slice(0, i + 1), 20)
    const ema20M15 = calculateEMA(m15.slice(0, i + 1), 20)
    const ema20M5 = calculateEMA(m5.slice(0, i + 1), 20)

    const dailyBias = determineBias(daily.slice(0, i + 1), ema20Daily)
    const h4Bias = determineBias(h4.slice(0, i + 1), ema20H4)
    const h1Bias = determineBias(h1.slice(0, i + 1), ema20H1)
    const m15Bias = determineBias(m15.slice(0, i + 1), ema20M15)
    const m5Bias = determineBias(m5.slice(0, i + 1), ema20M5)

    const adx1h = calculateADX(h1.slice(0, i + 1))
    const currentPrice = h1[i].close
    const atr = calculateATR(h1.slice(0, i + 1))

    let entry: any = null
    
    // SILVER: Use AGGRESSIVE strategy (5% loosened)
    entry = evaluateSilverEntryAggressive(dailyBias, h4Bias, h1Bias, adx1h, currentPrice, atr, "XAG_USD")

    if (!entry) continue

    console.log(
      `[v0] XAG_USD ${h1[i].time.toISOString()} | TIER: ${entry.setupTier} | SCORE: ${entry.alignmentScore} | ADX: ${entry.adx.toFixed(1)} | ${entry.direction} | ${entry.strategyType}`,
    )

    let exitPrice = entry.takeProfit
    let result = "WIN"
    let pnl = Math.abs(entry.takeProfit - entry.entry)
    let exitType = "TP2"

    if (i + 1 < minLength) {
      const nextPrice = h1[i + 1].close
      
      // Check for SL hit first
      if (
        (entry.direction === "LONG" && nextPrice < entry.stopLoss) ||
        (entry.direction === "SHORT" && nextPrice > entry.stopLoss)
      ) {
        exitPrice = entry.stopLoss
        result = "LOSS"
        pnl = -Math.abs(entry.stopLoss - entry.entry)
        exitType = "SL"
      }
      // Check for TP1 hit
      else if (
        (entry.direction === "LONG" && nextPrice >= entry.takeProfit1) ||
        (entry.direction === "SHORT" && nextPrice <= entry.takeProfit1)
      ) {
        exitPrice = entry.takeProfit1
        result = "WIN"
        pnl = Math.abs(entry.takeProfit1 - entry.entry)
        exitType = "TP1"
      }
      // Check for TP2 hit
      else if (
        (entry.direction === "LONG" && nextPrice >= entry.takeProfit2) ||
        (entry.direction === "SHORT" && nextPrice <= entry.takeProfit2)
      ) {
        exitPrice = entry.takeProfit2
        result = "WIN"
        pnl = Math.abs(entry.takeProfit2 - entry.entry)
        exitType = "TP2"
      }
    }

    results.trades++
    if (result === "WIN") results.wins++
    else results.losses++
    results.profit += pnl
    
    // Track exit types
    if (exitType === "TP1") results.tp1Hits++
    else if (exitType === "TP2") results.tp2Hits++
    else if (exitType === "SL") results.slHits++
    
    // Track tier breakdown
    if (entry.setupTier === "A+") {
      results.tierBreakdown.APlus++
    } else if (entry.setupTier === "A") {
      results.tierBreakdown.A++
    } else if (entry.setupTier === "B") {
      results.tierBreakdown.B++
    }
    
    results.tradeDetails.push({
      date: h1[i].time.toISOString().split("T")[0],
      direction: entry.direction,
      entry: entry.entry.toFixed(2),
      exit: exitPrice.toFixed(2),
      pnl: pnl.toFixed(2),
      result,
      setupTier: entry.setupTier,
      alignmentScore: entry.alignmentScore,
      strategyType: entry.strategyType,
      exitType,
    })
  }

  return results
}

const runAggressiveSilverBacktest = async (): Promise<void> => {
  console.log("=".repeat(160))
  console.log("AGGRESSIVE SILVER BACKTEST - 180 DAYS - 5% LOOSENED")
  console.log("=".repeat(160))
  
  const results = await runAggressiveBacktest()
  
  console.log("\n" + "=".repeat(140))
  console.log("AGGRESSIVE SILVER BACKTEST RESULTS")
  console.log("=".repeat(140))
  console.log("Symbol\t\tTrades\tWins\tLosses\tWin%\t\tProfit\t\tAvg/Trade\tA+\tA\tB\tTP1\tTP2\tSL")
  console.log("-".repeat(140))

  const r = results
  const winPercent = r.trades > 0 ? ((r.wins / r.trades) * 100).toFixed(1) : "0.0"
  const avgTrade = r.trades > 0 ? (r.profit / r.trades).toFixed(2) : "0.00"
  const aplusTrades = r.tierBreakdown.APlus
  const aTrades = r.tierBreakdown.A
  const bTrades = r.tierBreakdown.B
  console.log(
    `XAG_USD\t\t${r.trades}\t${r.wins}\t${r.losses}\t${winPercent}%\t\t${r.profit.toFixed(2)}\t\t${avgTrade}\t\t${aplusTrades}\t${aTrades}\t${bTrades}\t${r.tp1Hits}\t${r.tp2Hits}\t${r.slHits}`,
  )

  console.log("=".repeat(140))
  
  // Detailed tier analysis
  console.log("\nTIER BREAKDOWN ANALYSIS:")
  console.log("-".repeat(60))
  if (r.trades > 0) {
    console.log(`\nXAG_USD:`)
    console.log(`  A+ Trades: ${r.tierBreakdown.APlus} (${((r.tierBreakdown.APlus / r.trades) * 100).toFixed(1)}%)`)
    console.log(`  A Trades:   ${r.tierBreakdown.A} (${((r.tierBreakdown.A / r.trades) * 100).toFixed(1)}%)`)
    console.log(`  B Trades:   ${r.tierBreakdown.B} (${((r.tierBreakdown.B / r.trades) * 100).toFixed(1)}%)`)
    
    console.log(`\nExit Analysis for XAG_USD:`)
    console.log(`  TP1 Hits:   ${r.tp1Hits} (${((r.tp1Hits / r.trades) * 100).toFixed(1)}%)`)
    console.log(`  TP2 Hits:   ${r.tp2Hits} (${((r.tp2Hits / r.trades) * 100).toFixed(1)}%)`)
    console.log(`  SL Hits:    ${r.slHits} (${((r.slHits / r.trades) * 100).toFixed(1)}%)`)
  }
  
  console.log("\n[v0] Aggressive Silver backtest complete!")
}

runAggressiveSilverBacktest().catch(console.error)