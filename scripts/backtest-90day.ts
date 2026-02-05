const OANDA_API_KEY = process.env.OANDA_API_KEY

if (!OANDA_API_KEY) {
  console.error("[v0] Error: OANDA_API_KEY environment variable not set")
  process.exit(1)
}

const isForexMarketOpen = (timestamp) => {
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

const fetchOandaCandles = async (symbol, granularity, count) => {
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
    .filter((c) => c.complete && isForexMarketOpen(c.time))
    .map((c) => ({
      time: new Date(c.time),
      open: Number.parseFloat(c.mid.o),
      high: Number.parseFloat(c.mid.h),
      low: Number.parseFloat(c.mid.l),
      close: Number.parseFloat(c.mid.c),
      volume: c.volume || 0,
    }))
    .reverse()
}

const calculateEMA = (candles, period) => {
  if (candles.length < period) return candles[candles.length - 1]?.close || 0

  let ema = candles[0].close
  const multiplier = 2 / (period + 1)

  for (let i = 1; i < candles.length; i++) {
    ema = candles[i].close * multiplier + ema * (1 - multiplier)
  }
  return ema
}

const calculateADX = (candles, period = 14) => {
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

const determineBias = (candles, ema) => {
  if (candles.length === 0) return "NEUTRAL"
  const currentPrice = candles[candles.length - 1].close
  const previousPrice = candles.length > 1 ? candles[candles.length - 2].close : currentPrice

  if (currentPrice > ema && previousPrice > ema) return "LONG"
  if (currentPrice < ema && previousPrice < ema) return "SHORT"
  return "NEUTRAL"
}

const calculateATR = (candles, period = 14) => {
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

const evaluateEntry = (dailyBias, h4Bias, h1Bias, m15Bias, m5Bias, adx1h, currentPrice, atr) => {
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

  let setupTier = null
  if (maxScore >= 8 && adx1h >= 25) {
    setupTier = "A+"
  } else if (maxScore >= 6 && adx1h >= 20) {
    setupTier = "A"
  } else if (maxScore >= 5 && adx1h >= 18) {
    setupTier = "A"
  }

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

const runBacktest = async () => {
  console.log("[v0] Starting 90-day backtest for XAU_USD and XAG_USD...")
  console.log("[v0] Fetching 90 days of historical data...\n")

  const results = {
    XAU_USD: { trades: 0, wins: 0, losses: 0, profit: 0, tradeDetails: [] },
    XAG_USD: { trades: 0, wins: 0, losses: 0, profit: 0, tradeDetails: [] },
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

      const entry = evaluateEntry(dailyBias, h4Bias, h1Bias, m15Bias, m5Bias, adx1h, currentPrice, atr)
      if (!entry) continue

      console.log(
        `[v0] ${symbol} ${h1[i].time.toISOString()} | TIER: ${entry.setupTier} | SCORE: ${entry.alignmentScore} | ADX: ${entry.adx.toFixed(1)} | ${entry.direction}`,
      )

      let exitPrice = entry.takeProfit
      let result = "WIN"
      let pnl = Math.abs(entry.takeProfit - entry.entry)

      if (i + 1 < minLength) {
        const nextPrice = h1[i + 1].close
        if (
          (entry.direction === "LONG" && nextPrice < entry.stopLoss) ||
          (entry.direction === "SHORT" && nextPrice > entry.stopLoss)
        ) {
          exitPrice = entry.stopLoss
          result = "LOSS"
          pnl = -Math.abs(entry.stopLoss - entry.entry)
        } else if (
          (entry.direction === "LONG" && nextPrice > entry.takeProfit) ||
          (entry.direction === "SHORT" && nextPrice < entry.takeProfit)
        ) {
          exitPrice = entry.takeProfit
          result = "WIN"
          pnl = Math.abs(entry.takeProfit - entry.entry)
        }
      }

      results[symbol].trades++
      if (result === "WIN") results[symbol].wins++
      else results[symbol].losses++
      results[symbol].profit += pnl
      results[symbol].tradeDetails.push({
        date: h1[i].time.toISOString().split("T")[0],
        direction: entry.direction,
        entry: entry.entry.toFixed(2),
        exit: exitPrice.toFixed(2),
        pnl: pnl.toFixed(2),
        result,
        setupTier: entry.setupTier,
        alignmentScore: entry.alignmentScore,
      })
    }
  }

  console.log("\n" + "=".repeat(120))
  console.log("90-DAY BACKTEST RESULTS")
  console.log("=".repeat(120))
  console.log("Symbol\t\tTrades\tWins\tLosses\tWin%\t\tProfit\t\tAvg/Trade\tA+\tA")
  console.log("-".repeat(120))

  for (const symbol of ["XAU_USD", "XAG_USD"]) {
    const r = results[symbol]
    const winPercent = r.trades > 0 ? ((r.wins / r.trades) * 100).toFixed(1) : "0.0"
    const avgTrade = r.trades > 0 ? (r.profit / r.trades).toFixed(2) : "0.00"
    const aplusTrades = r.tradeDetails.filter((t) => t.setupTier === "A+").length
    const aTrades = r.tradeDetails.filter((t) => t.setupTier === "A").length
    console.log(
      `${symbol}\t\t${r.trades}\t${r.wins}\t${r.losses}\t${winPercent}%\t\t${r.profit.toFixed(2)}\t\t${avgTrade}\t\t${aplusTrades}\t${aTrades}`,
    )
  }

  console.log("=".repeat(120))
  console.log("\n[v0] Backtest complete!")
}

runBacktest().catch(console.error)
