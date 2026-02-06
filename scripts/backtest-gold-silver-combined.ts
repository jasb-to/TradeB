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

// ORIGINAL GOLD STRATEGY (UNTOUCHED)
const evaluateGoldEntry = (
  dailyBias: string, 
  h4Bias: string, 
  h1Bias: string, 
  m15Bias: string, 
  m5Bias: string, 
  adx1h: number, 
  currentPrice: number, 
  atr: number
): any => {
  const weights = { daily: 2, h4: 2, h1: 2, m15: 1, m5: 1 }
  let longScore = 0
  let shortScore = 0

  if (dailyBias === "LONG") longScore += weights.daily
  else if (dailyBias === "SHORT") shortScore += weights.daily

  if (h4Bias === "LONG") longScore += weights.h4
  else if (h4Bias === "SHORT") shortScore += weights.h4

  if (h1Bias === "LONG") longScore += weights.h1
  else if (h1Bias === "SHORT") shortScore += weights.h1

  if (m15Bias === "LONG") longScore += weights.m15
  else if (m15Bias === "SHORT") shortScore += weights.m15

  if (m5Bias === "LONG") longScore += weights.m5
  else if (m5Bias === "SHORT") shortScore += weights.m5

  const maxScore = Math.max(longScore, shortScore)
  const direction = longScore > shortScore ? "LONG" : "SHORT"

  // ORIGINAL GOLD: Use updated setup tier logic with Tier B support
  const setupTier = determineSetupTier(maxScore, adx1h, dailyBias, h4Bias, h1Bias, "XAU_USD")

  if (setupTier === null || !h1Bias || h1Bias === "NEUTRAL") return null

  const stopLoss = direction === "LONG" ? currentPrice - atr * 1.5 : currentPrice + atr * 1.5
  const takeProfit = direction === "LONG" ? currentPrice + atr * 2.5 : currentPrice - atr * 2.5
  const rr = Math.abs(takeProfit - currentPrice) / Math.abs(currentPrice - stopLoss)

  if (rr < 1.0) return null

  return {
    direction,
    entry: currentPrice,
    stopLoss,
    takeProfit,
    atr,
    setupTier,
    alignmentScore: maxScore,
    adx: adx1h,
  }
}

// MODERATE SILVER STRATEGY
const evaluateSilverEntryModerate = (
  dailyBias: string, 
  h4Bias: string, 
  h1Bias: string, 
  adx1h: number, 
  currentPrice: number, 
  atr: number, 
  symbol: string
): any => {
  // MODERATE: Extended session filter (05:00-19:00 UTC)
  if (!isSilverSessionAllowedExtended(new Date())) {
    return null
  }
  
  // MODERATE: Relaxed volatility filter (ATR ≥ 0.15 vs 0.25)
  if (!isSilverVolatilityAdequateModerate(atr)) {
    return null
  }
  
  // MODERATE: Flexible MTF alignment (ANY ONE + 1H confirmation)
  const hasAnyAlignment = isSilverMTFAlignedModerate(dailyBias, h4Bias, h1Bias)
  const has1HConfirmation = h1Bias !== "NEUTRAL"
  
  const mtfAligned = hasAnyAlignment && has1HConfirmation
  const alignedDirection = getAlignedDirectionModerate(dailyBias, h4Bias, h1Bias)
  
  if (!mtfAligned) {
    return null
  }
  
  // MODERATE: Lower ADX threshold (≥ 16 vs 18)
  const isAPlusSetup = adx1h >= 22 && atr >= 0.15
  const isASetup = adx1h >= 16 && atr >= 0.15 // MODERATE: ADX ≥ 16
  
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
    ? currentPrice + atrPoints * 2.0  // MODERATE: Tighter TP1
    : currentPrice - atrPoints * 2.0
  
  const tp2 = alignedDirection === "LONG" 
    ? currentPrice + atrPoints * 3.0
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
    strategyType: "MODERATE",
  }
}

// SUPPORTING FUNCTIONS FOR SILVER

// MODERATE: Extended session filter (05:00-19:00 UTC)
const isSilverSessionAllowedExtended = (timestamp: Date): boolean => {
  const date = new Date(timestamp)
  const utcHours = date.getUTCHours()
  const utcMinutes = date.getUTCMinutes()
  
  // Extended session: 05:00-19:00 UTC (adds 2 hours each side)
  const timeInMinutes = utcHours * 60 + utcMinutes
  const extendedStartMinutes = 5 * 60 // 05:00 UTC
  const extendedEndMinutes = 19 * 60 // 19:00 UTC
  
  return timeInMinutes >= extendedStartMinutes && timeInMinutes < extendedEndMinutes
}

// MODERATE: Relaxed volatility filter (ATR ≥ 0.15 vs 0.25)
const isSilverVolatilityAdequateModerate = (atr: number): boolean => {
  return atr >= 0.15 // MODERATE: minimum ATR ≥ 0.15
}

// MODERATE: Flexible MTF alignment (ANY ONE + 1H confirmation)
const isSilverMTFAlignedModerate = (
  dailyBias: string, 
  h4Bias: string, 
  h1Bias: string
): boolean => {
  const dailyPlusFourH = dailyBias !== "NEUTRAL" && h4Bias !== "NEUTRAL" && dailyBias === h4Bias
  const fourHPlus1H = h4Bias !== "NEUTRAL" && h1Bias !== "NEUTRAL" && h4Bias === h1Bias
  const dailyPlus1H = dailyBias !== "NEUTRAL" && h1Bias !== "NEUTRAL" && dailyBias === h1Bias
  
  return dailyPlusFourH || fourHPlus1H || dailyPlus1H
}

// MODERATE: Get aligned direction from any timeframe
const getAlignedDirectionModerate = (
  dailyBias: string, 
  h4Bias: string, 
  h1Bias: string
): string => {
  // Priority: 1H > 4H > Daily (faster timeframes more relevant for Silver)
  if (h1Bias !== "NEUTRAL") return h1Bias
  if (h4Bias !== "NEUTRAL") return h4Bias
  if (dailyBias !== "NEUTRAL") return dailyBias
  return "NONE"
}

// ORIGINAL GOLD: Updated setup tier logic with Tier B support
const determineSetupTier = (
  score: number, 
  adx: number, 
  dailyBias: string, 
  h4Bias: string, 
  h1Bias: string, 
  symbol: string
): "A+" | "A" | "B" | null => {
  const isSilver = symbol === "XAG_USD"
  
  // Check if this is Silver (more volatile) vs Gold
  if (isSilver) {
    // Silver-specific thresholds (more lenient due to higher volatility)
    // A+ Setup: Perfect alignment + strong ADX
    if (score >= 7.5 && adx >= 21 && dailyBias === h4Bias && h4Bias === h1Bias && dailyBias !== "NEUTRAL") return "A+"
    
    // A Setup: Good alignment + moderate ADX
    if (score >= 5.5 && adx >= 17 && dailyBias === h4Bias && h4Bias === h1Bias && dailyBias !== "NEUTRAL") return "A"
    
    // B Setup: 1H momentum + minimum ADX (Silver: lower ADX requirement)
    if (score >= 4 && adx >= 16 && h1Bias !== "NEUTRAL") return "B"
  } else {
    // Gold-specific thresholds (ORIGINAL - untouched)
    // A+ Setup: Perfect alignment + strong ADX (loosened by 1%)
    if (score >= 7.5 && adx >= 23.5 && dailyBias === h4Bias && h4Bias === h1Bias && dailyBias !== "NEUTRAL") return "A+"
    
    // A Setup: Good alignment + moderate ADX (loosened by 1%)
    if (score >= 5.5 && adx >= 19 && dailyBias === h4Bias && h4Bias === h1Bias && dailyBias !== "NEUTRAL") return "A"
    
    // B Setup: 1H momentum + minimum ADX (NO HTF alignment required)
    if (score >= 4 && adx >= 18 && h1Bias !== "NEUTRAL") return "B"
  }

  return null
}

interface BacktestResults {
  XAU_USD: {
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
  XAG_USD: {
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
}

const runBacktest = async (): Promise<BacktestResults> => {
  console.log("[v0] Starting COMBINED GOLD & SILVER Backtest...")
  console.log("[v0] Gold Strategy: ORIGINAL (untouched)")
  console.log("[v0] Silver Strategy: MODERATE APPROACH")
  console.log("[v0] Fetching 90 days of historical data...\n")

  const results: BacktestResults = {
    XAU_USD: { trades: 0, wins: 0, losses: 0, profit: 0, tradeDetails: [], tierBreakdown: { A: 0, APlus: 0, B: 0 }, tp1Hits: 0, tp2Hits: 0, slHits: 0 },
    XAG_USD: { trades: 0, wins: 0, losses: 0, profit: 0, tradeDetails: [], tierBreakdown: { A: 0, APlus: 0, B: 0 }, tp1Hits: 0, tp2Hits: 0, slHits: 0 },
  }

  for (const symbol of ["XAU_USD", "XAG_USD"]) {
    console.log(`[v0] Backtesting ${symbol}...`)

    const [daily, h4, h1, m15, m5] = await Promise.all([
      fetchOandaCandles(symbol, "D", 90),
      fetchOandaCandles(symbol, "H4", 90),
      fetchOandaCandles(symbol, "H1", 90),
      fetchOandaCandles(symbol, "M15", 90),
      fetchOandaCandles(symbol, "M5", 90),
    ])

    if (daily.length === 0) {
      console.log(`[v0] Failed to fetch candles for ${symbol}`)
      continue
    }

    const minLength = Math.min(daily.length, h4.length, h1.length, m15.length, m5.length)
    console.log(`[v0] Got ${minLength} candles for ${symbol}`)

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
      
      // USE APPROPRIATE STRATEGY BASED ON SYMBOL
      if (symbol === "XAG_USD") {
        // SILVER: Use MODERATE strategy
        entry = evaluateSilverEntryModerate(dailyBias, h4Bias, h1Bias, adx1h, currentPrice, atr, symbol)
      } else {
        // GOLD: Use ORIGINAL strategy (untouched)
        entry = evaluateGoldEntry(dailyBias, h4Bias, h1Bias, m15Bias, m5Bias, adx1h, currentPrice, atr)
      }

      if (!entry) continue

      console.log(
        `[v0] ${symbol} ${h1[i].time.toISOString()} | TIER: ${entry.setupTier} | SCORE: ${entry.alignmentScore} | ADX: ${entry.adx.toFixed(1)} | ${entry.direction} | ${entry.strategyType || "GOLD"}`,
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

      results[symbol as keyof BacktestResults].trades++
      if (result === "WIN") results[symbol as keyof BacktestResults].wins++
      else results[symbol as keyof BacktestResults].losses++
      results[symbol as keyof BacktestResults].profit += pnl
      
      // Track exit types
      if (exitType === "TP1") results[symbol as keyof BacktestResults].tp1Hits++
      else if (exitType === "TP2") results[symbol as keyof BacktestResults].tp2Hits++
      else if (exitType === "SL") results[symbol as keyof BacktestResults].slHits++
      
      // Track tier breakdown
      if (entry.setupTier === "A+") {
        results[symbol as keyof BacktestResults].tierBreakdown.APlus++
      } else if (entry.setupTier === "A") {
        results[symbol as keyof BacktestResults].tierBreakdown.A++
      } else if (entry.setupTier === "B") {
        results[symbol as keyof BacktestResults].tierBreakdown.B++
      }
      
      results[symbol as keyof BacktestResults].tradeDetails.push({
        date: h1[i].time.toISOString().split("T")[0],
        direction: entry.direction,
        entry: entry.entry.toFixed(2),
        exit: exitPrice.toFixed(2),
        pnl: pnl.toFixed(2),
        result,
        setupTier: entry.setupTier,
        alignmentScore: entry.alignmentScore,
        strategyType: entry.strategyType || "GOLD",
        exitType,
      })
    }
  }

  return results
}

const runCombinedBacktest = async (): Promise<void> => {
  console.log("=".repeat(160))
  console.log("COMBINED GOLD & SILVER BACKTEST - ORIGINAL GOLD + MODERATE SILVER")
  console.log("=".repeat(160))
  
  const results = await runBacktest()
  
  console.log("\n" + "=".repeat(140))
  console.log("BACKTEST RESULTS")
  console.log("=".repeat(140))
  console.log("Symbol\t\tTrades\tWins\tLosses\tWin%\t\tProfit\t\tAvg/Trade\tA+\tA\tB\tTP1\tTP2\tSL")
  console.log("-".repeat(140))

  for (const symbol of ["XAU_USD", "XAG_USD"]) {
    const r = results[symbol as keyof BacktestResults]
    const winPercent = r.trades > 0 ? ((r.wins / r.trades) * 100).toFixed(1) : "0.0"
    const avgTrade = r.trades > 0 ? (r.profit / r.trades).toFixed(2) : "0.00"
    const aplusTrades = r.tierBreakdown.APlus
    const aTrades = r.tierBreakdown.A
    const bTrades = r.tierBreakdown.B
    console.log(
      `${symbol}\t\t${r.trades}\t${r.wins}\t${r.losses}\t${winPercent}%\t\t${r.profit.toFixed(2)}\t\t${avgTrade}\t\t${aplusTrades}\t${aTrades}\t${bTrades}\t${r.tp1Hits}\t${r.tp2Hits}\t${r.slHits}`,
    )
  }

  console.log("=".repeat(140))
  
  // Detailed tier analysis
  console.log("\nTIER BREAKDOWN ANALYSIS:")
  console.log("-".repeat(60))
  for (const symbol of ["XAU_USD", "XAG_USD"]) {
    const r = results[symbol as keyof BacktestResults]
    if (r.trades > 0) {
      console.log(`\n${symbol}:`)
      console.log(`  A+ Trades: ${r.tierBreakdown.APlus} (${((r.tierBreakdown.APlus / r.trades) * 100).toFixed(1)}%)`)
      console.log(`  A Trades:   ${r.tierBreakdown.A} (${((r.tierBreakdown.A / r.trades) * 100).toFixed(1)}%)`)
      console.log(`  B Trades:   ${r.tierBreakdown.B} (${((r.tierBreakdown.B / r.trades) * 100).toFixed(1)}%)`)
      
      console.log(`\nExit Analysis for ${symbol}:`)
      console.log(`  TP1 Hits:   ${r.tp1Hits} (${((r.tp1Hits / r.trades) * 100).toFixed(1)}%)`)
      console.log(`  TP2 Hits:   ${r.tp2Hits} (${((r.tp2Hits / r.trades) * 100).toFixed(1)}%)`)
      console.log(`  SL Hits:    ${r.slHits} (${((r.slHits / r.trades) * 100).toFixed(1)}%)`)
    }
  }
  
  console.log("\n[v0] Combined Gold & Silver backtest complete!")
}

runCombinedBacktest().catch(console.error)