// Backtest script for platinum trading strategy
// Run with: npx ts-node scripts/backtest.ts

interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface Trade {
  entryTime: Date
  exitTime: Date | null
  direction: "LONG" | "SHORT"
  entryPrice: number
  exitPrice: number | null
  size: number
  pnl: number | null
  reason: string
}

interface BacktestResult {
  startingBalance: number
  finalBalance: number
  totalTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number
  maxDrawdown: number
  maxDrawdownPercent: number
  totalPnL: number
  returnPercent: number
  trades: Trade[]
}

// Fetch historical candles from OANDA
async function fetchOandaCandles(granularity: string, count: number, from?: string): Promise<Candle[]> {
  const apiKey = process.env.OANDA_API_KEY
  const baseUrl = "https://api-fxtrade.oanda.com"

  let url = `${baseUrl}/v3/instruments/XPT_USD/candles?granularity=${granularity}&count=${count}&price=M`
  if (from) {
    url = `${baseUrl}/v3/instruments/XPT_USD/candles?granularity=${granularity}&from=${from}&price=M`
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(`OANDA fetch failed: ${response.status}`)
  }

  const data = await response.json()

  return data.candles
    .filter((c: any) => c.complete)
    .map((c: any) => ({
      time: new Date(c.time).getTime(),
      open: Number.parseFloat(c.mid.o),
      high: Number.parseFloat(c.mid.h),
      low: Number.parseFloat(c.mid.l),
      close: Number.parseFloat(c.mid.c),
      volume: c.volume || 0,
    }))
}

// Calculate EMA
function calculateEMA(candles: Candle[], period: number): number[] {
  const ema: number[] = []
  const multiplier = 2 / (period + 1)

  // Start with SMA for first value
  let sum = 0
  for (let i = 0; i < Math.min(period, candles.length); i++) {
    sum += candles[i].close
  }
  ema[period - 1] = sum / period

  // Calculate EMA for rest
  for (let i = period; i < candles.length; i++) {
    ema[i] = (candles[i].close - ema[i - 1]) * multiplier + ema[i - 1]
  }

  return ema
}

// Calculate RSI
function calculateRSI(candles: Candle[], period = 14): number[] {
  const rsi: number[] = []
  const gains: number[] = []
  const losses: number[] = []

  for (let i = 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close
    gains.push(change > 0 ? change : 0)
    losses.push(change < 0 ? -change : 0)
  }

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period

  for (let i = period; i < candles.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i - 1]) / period
    avgLoss = (avgLoss * (period - 1) + losses[i - 1]) / period

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    rsi[i] = 100 - 100 / (1 + rs)
  }

  return rsi
}

// Calculate ADX
function calculateADX(candles: Candle[], period = 14): number[] {
  const adx: number[] = []
  const tr: number[] = []
  const plusDM: number[] = []
  const minusDM: number[] = []

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high
    const low = candles[i].low
    const prevHigh = candles[i - 1].high
    const prevLow = candles[i - 1].low
    const prevClose = candles[i - 1].close

    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)))

    const upMove = high - prevHigh
    const downMove = prevLow - low

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0)
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0)
  }

  // Smoothed values
  let smoothedTR = tr.slice(0, period).reduce((a, b) => a + b, 0)
  let smoothedPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0)
  let smoothedMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0)

  const dx: number[] = []

  for (let i = period; i < candles.length; i++) {
    smoothedTR = smoothedTR - smoothedTR / period + tr[i - 1]
    smoothedPlusDM = smoothedPlusDM - smoothedPlusDM / period + plusDM[i - 1]
    smoothedMinusDM = smoothedMinusDM - smoothedMinusDM / period + minusDM[i - 1]

    const plusDI = (smoothedPlusDM / smoothedTR) * 100
    const minusDI = (smoothedMinusDM / smoothedTR) * 100
    const diDiff = Math.abs(plusDI - minusDI)
    const diSum = plusDI + minusDI

    dx.push(diSum === 0 ? 0 : (diDiff / diSum) * 100)
  }

  // Calculate ADX as smoothed DX
  let adxValue = dx.slice(0, period).reduce((a, b) => a + b, 0) / period

  for (let i = period; i < dx.length; i++) {
    adxValue = (adxValue * (period - 1) + dx[i]) / period
    adx[i + period] = adxValue
  }

  return adx
}

// Calculate StochRSI
function calculateStochRSI(candles: Candle[], rsiPeriod = 14, stochPeriod = 14): number[] {
  const rsi = calculateRSI(candles, rsiPeriod)
  const stochRSI: number[] = []

  for (let i = stochPeriod + rsiPeriod; i < candles.length; i++) {
    const rsiSlice = rsi.slice(i - stochPeriod, i + 1).filter((v) => v !== undefined)
    if (rsiSlice.length < stochPeriod) continue

    const minRSI = Math.min(...rsiSlice)
    const maxRSI = Math.max(...rsiSlice)
    const currentRSI = rsi[i]

    if (currentRSI !== undefined && maxRSI !== minRSI) {
      stochRSI[i] = ((currentRSI - minRSI) / (maxRSI - minRSI)) * 100
    }
  }

  return stochRSI
}

// Determine bias for a timeframe
function getBias(candles: Candle[], index: number): "LONG" | "SHORT" | "NEUTRAL" {
  if (index < 50) return "NEUTRAL"

  const ema20 = calculateEMA(candles.slice(0, index + 1), 20)
  const ema50 = calculateEMA(candles.slice(0, index + 1), 50)
  const rsi = calculateRSI(candles.slice(0, index + 1), 14)

  const price = candles[index].close
  const currentEMA20 = ema20[ema20.length - 1]
  const currentEMA50 = ema50[ema50.length - 1]
  const currentRSI = rsi[rsi.length - 1]

  let bullishScore = 0
  let bearishScore = 0

  // Price vs EMAs
  if (price > currentEMA20) bullishScore++
  else bearishScore++

  if (price > currentEMA50) bullishScore++
  else bearishScore++

  // EMA alignment
  if (currentEMA20 > currentEMA50) bullishScore++
  else bearishScore++

  // RSI
  if (currentRSI > 50) bullishScore++
  else if (currentRSI < 50) bearishScore++

  if (bullishScore >= 3) return "LONG"
  if (bearishScore >= 3) return "SHORT"
  return "NEUTRAL"
}

// Check for entry signal
function checkEntry(
  h4Candles: Candle[],
  h1Candles: Candle[],
  m15Candles: Candle[],
  m5Candles: Candle[],
  h4Index: number,
  h1Index: number,
  m15Index: number,
  m5Index: number,
): { signal: "LONG" | "SHORT" | null; confidence: number; reason: string } {
  // Get biases
  const h4Bias = getBias(h4Candles, h4Index)
  const h1Bias = getBias(h1Candles, h1Index)
  const m15Bias = getBias(m15Candles, m15Index)
  const m5Bias = getBias(m5Candles, m5Index)

  const biases = [h4Bias, h1Bias, m15Bias, m5Bias]
  const longCount = biases.filter((b) => b === "LONG").length
  const shortCount = biases.filter((b) => b === "SHORT").length

  // Need 3+ aligned for entry
  if (longCount < 3 && shortCount < 3) {
    return { signal: null, confidence: 0, reason: "Insufficient TF alignment" }
  }

  // Calculate indicators on entry timeframe (M15)
  const adx = calculateADX(m15Candles.slice(0, m15Index + 1), 14)
  const rsi = calculateRSI(m15Candles.slice(0, m15Index + 1), 14)
  const stochRSI = calculateStochRSI(m15Candles.slice(0, m15Index + 1), 14, 14)

  const currentADX = adx[adx.length - 1] || 0
  const currentRSI = rsi[rsi.length - 1] || 50
  const currentStochRSI = stochRSI[stochRSI.length - 1] || 50

  // Check LONG entry
  if (longCount >= 3 && shortCount === 0) {
    // Need ADX > 20 for trend
    if (currentADX < 20) {
      return { signal: null, confidence: 0, reason: "ADX too low for LONG" }
    }

    // RSI not overbought
    if (currentRSI > 75) {
      return { signal: null, confidence: 0, reason: "RSI overbought" }
    }

    // StochRSI recovering from oversold (pullback entry)
    if (currentStochRSI > 20 && currentStochRSI < 60) {
      const confidence = Math.min(90, 60 + longCount * 5 + (currentADX > 23 ? 10 : 0))
      return { signal: "LONG", confidence, reason: `${longCount}/4 TF LONG, StochRSI pullback entry` }
    }

    // Breakout entry (StochRSI high but momentum strong)
    if (currentStochRSI >= 60 && currentADX > 23) {
      const confidence = Math.min(85, 55 + longCount * 5 + (currentADX > 30 ? 10 : 0))
      return { signal: "LONG", confidence, reason: `${longCount}/4 TF LONG, breakout momentum` }
    }
  }

  // Check SHORT entry
  if (shortCount >= 3 && longCount === 0) {
    if (currentADX < 20) {
      return { signal: null, confidence: 0, reason: "ADX too low for SHORT" }
    }

    if (currentRSI < 25) {
      return { signal: null, confidence: 0, reason: "RSI oversold" }
    }

    // StochRSI turning down from overbought
    if (currentStochRSI < 80 && currentStochRSI > 40) {
      const confidence = Math.min(90, 60 + shortCount * 5 + (currentADX > 23 ? 10 : 0))
      return { signal: "SHORT", confidence, reason: `${shortCount}/4 TF SHORT, StochRSI pullback entry` }
    }

    if (currentStochRSI <= 40 && currentADX > 23) {
      const confidence = Math.min(85, 55 + shortCount * 5 + (currentADX > 30 ? 10 : 0))
      return { signal: "SHORT", confidence, reason: `${shortCount}/4 TF SHORT, breakdown momentum` }
    }
  }

  return { signal: null, confidence: 0, reason: "No valid setup" }
}

// Check for exit
function checkExit(candles: Candle[], index: number, trade: Trade): { shouldExit: boolean; reason: string } {
  const price = candles[index].close
  const entryPrice = trade.entryPrice

  // Calculate ATR for stop
  let atrSum = 0
  for (let i = Math.max(1, index - 14); i <= index; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1]?.close || candles[i].high),
      Math.abs(candles[i].low - candles[i - 1]?.close || candles[i].low),
    )
    atrSum += tr
  }
  const atr = atrSum / 14

  if (trade.direction === "LONG") {
    // Stop loss: 2 ATR below entry
    const stopLoss = entryPrice - atr * 2
    if (price < stopLoss) {
      return { shouldExit: true, reason: "Stop loss hit" }
    }

    // Take profit: 3 ATR above entry (1.5 R:R)
    const takeProfit = entryPrice + atr * 3
    if (price > takeProfit) {
      return { shouldExit: true, reason: "Take profit hit" }
    }

    // Trailing stop after 2 ATR profit
    if (price > entryPrice + atr * 2) {
      const trailingStop = price - atr * 1.5
      if (candles[index].low < trailingStop) {
        return { shouldExit: true, reason: "Trailing stop hit" }
      }
    }
  } else {
    // SHORT
    const stopLoss = entryPrice + atr * 2
    if (price > stopLoss) {
      return { shouldExit: true, reason: "Stop loss hit" }
    }

    const takeProfit = entryPrice - atr * 3
    if (price < takeProfit) {
      return { shouldExit: true, reason: "Take profit hit" }
    }

    if (price < entryPrice - atr * 2) {
      const trailingStop = price + atr * 1.5
      if (candles[index].high > trailingStop) {
        return { shouldExit: true, reason: "Trailing stop hit" }
      }
    }
  }

  return { shouldExit: false, reason: "" }
}

// Main backtest function
async function runBacktest(): Promise<BacktestResult> {
  console.log("Starting backtest...")
  console.log("Fetching 3 months of historical data from OANDA...\n")

  // Fetch data for all timeframes (3 months = ~90 days)
  // H4: 6 candles/day * 90 days = 540
  // H1: 24 candles/day * 90 days = 2160 (max 5000)
  // M15: 96 candles/day * 90 days = 8640 (need multiple fetches, use 2000)
  // M5: too many, use 2000 most recent

  const [h4Candles, h1Candles, m15Candles, m5Candles] = await Promise.all([
    fetchOandaCandles("H4", 540),
    fetchOandaCandles("H1", 2160),
    fetchOandaCandles("M15", 2000),
    fetchOandaCandles("M5", 2000),
  ])

  console.log(
    `Loaded: H4=${h4Candles.length}, H1=${h1Candles.length}, M15=${m15Candles.length}, M5=${m5Candles.length} candles`,
  )

  // Starting balance in GBP
  let balance = 200
  const startingBalance = balance
  let maxBalance = balance
  let maxDrawdown = 0

  const trades: Trade[] = []
  let currentTrade: Trade | null = null

  // Risk per trade: 2% of balance
  const riskPercent = 0.02

  // Iterate through M15 candles (entry timeframe)
  // Start after warmup period (50 candles)
  const startIndex = 100

  console.log("\nRunning backtest simulation...\n")

  for (let i = startIndex; i < m15Candles.length; i++) {
    const m15Time = m15Candles[i].time

    // Find corresponding indices for other timeframes
    const h4Index = h4Candles.findIndex((c) => c.time >= m15Time) - 1
    const h1Index = h1Candles.findIndex((c) => c.time >= m15Time) - 1
    const m5Index = m5Candles.findIndex((c) => c.time >= m15Time) - 1

    if (h4Index < 50 || h1Index < 50 || m5Index < 50) continue

    // If in a trade, check for exit
    if (currentTrade) {
      const exitCheck = checkExit(m15Candles, i, currentTrade)

      if (exitCheck.shouldExit) {
        const exitPrice = m15Candles[i].close
        const priceDiff =
          currentTrade.direction === "LONG" ? exitPrice - currentTrade.entryPrice : currentTrade.entryPrice - exitPrice

        // Calculate PnL (simplified - assume 0.01 lot per £1 of risk)
        const pipValue = 0.1 // Simplified pip value for XPT_USD
        const pnl = priceDiff * currentTrade.size * pipValue

        currentTrade.exitTime = new Date(m15Time)
        currentTrade.exitPrice = exitPrice
        currentTrade.pnl = pnl
        currentTrade.reason = exitCheck.reason

        balance += pnl
        trades.push({ ...currentTrade })

        console.log(
          `CLOSED ${currentTrade.direction}: Entry=${currentTrade.entryPrice.toFixed(2)}, Exit=${exitPrice.toFixed(2)}, PnL=£${pnl.toFixed(2)}, Balance=£${balance.toFixed(2)} (${exitCheck.reason})`,
        )

        currentTrade = null

        // Track max drawdown
        if (balance > maxBalance) {
          maxBalance = balance
        }
        const drawdown = maxBalance - balance
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown
        }
      }
    }

    // If not in a trade, check for entry
    if (!currentTrade) {
      const entryCheck = checkEntry(h4Candles, h1Candles, m15Candles, m5Candles, h4Index, h1Index, i, m5Index)

      if (entryCheck.signal && entryCheck.confidence >= 65) {
        const entryPrice = m15Candles[i].close
        const riskAmount = balance * riskPercent
        const size = riskAmount / 10 // Simplified position sizing

        currentTrade = {
          entryTime: new Date(m15Time),
          exitTime: null,
          direction: entryCheck.signal,
          entryPrice,
          exitPrice: null,
          size,
          pnl: null,
          reason: entryCheck.reason,
        }

        console.log(
          `OPENED ${entryCheck.signal}: Price=${entryPrice.toFixed(2)}, Size=${size.toFixed(2)}, Confidence=${entryCheck.confidence}% (${entryCheck.reason})`,
        )
      }
    }
  }

  // Close any open trade at end
  if (currentTrade) {
    const lastCandle = m15Candles[m15Candles.length - 1]
    const exitPrice = lastCandle.close
    const priceDiff =
      currentTrade.direction === "LONG" ? exitPrice - currentTrade.entryPrice : currentTrade.entryPrice - exitPrice
    const pnl = priceDiff * currentTrade.size * 0.1

    currentTrade.exitTime = new Date(lastCandle.time)
    currentTrade.exitPrice = exitPrice
    currentTrade.pnl = pnl
    currentTrade.reason = "End of backtest"

    balance += pnl
    trades.push({ ...currentTrade })
  }

  // Calculate results
  const winningTrades = trades.filter((t) => (t.pnl || 0) > 0).length
  const losingTrades = trades.filter((t) => (t.pnl || 0) < 0).length
  const totalPnL = balance - startingBalance

  return {
    startingBalance,
    finalBalance: balance,
    totalTrades: trades.length,
    winningTrades,
    losingTrades,
    winRate: trades.length > 0 ? (winningTrades / trades.length) * 100 : 0,
    maxDrawdown,
    maxDrawdownPercent: (maxDrawdown / maxBalance) * 100,
    totalPnL,
    returnPercent: (totalPnL / startingBalance) * 100,
    trades,
  }
}

// Run the backtest
runBacktest()
  .then((result) => {
    console.log("\n" + "=".repeat(60))
    console.log("BACKTEST RESULTS - 3 MONTH PERIOD")
    console.log("=".repeat(60))
    console.log(`Starting Balance:    £${result.startingBalance.toFixed(2)}`)
    console.log(`Final Balance:       £${result.finalBalance.toFixed(2)}`)
    console.log(`Total P&L:           £${result.totalPnL.toFixed(2)} (${result.returnPercent.toFixed(1)}%)`)
    console.log("-".repeat(60))
    console.log(`Total Trades:        ${result.totalTrades}`)
    console.log(`Winning Trades:      ${result.winningTrades}`)
    console.log(`Losing Trades:       ${result.losingTrades}`)
    console.log(`Win Rate:            ${result.winRate.toFixed(1)}%`)
    console.log("-".repeat(60))
    console.log(`Max Drawdown:        £${result.maxDrawdown.toFixed(2)} (${result.maxDrawdownPercent.toFixed(1)}%)`)
    console.log("=".repeat(60))

    if (result.trades.length > 0) {
      console.log("\nTRADE LOG:")
      console.log("-".repeat(60))
      result.trades.forEach((t, i) => {
        const pnlStr = t.pnl !== null ? `£${t.pnl.toFixed(2)}` : "Open"
        console.log(
          `${i + 1}. ${t.direction} @ ${t.entryPrice.toFixed(2)} -> ${t.exitPrice?.toFixed(2) || "Open"} | ${pnlStr} | ${t.reason}`,
        )
      })
    }
  })
  .catch((err) => {
    console.error("Backtest failed:", err)
  })
