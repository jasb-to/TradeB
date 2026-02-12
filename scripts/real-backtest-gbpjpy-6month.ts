import https from "https"

// Fetch OANDA historical data
async function fetchOANDAData(instrument, from, to, granularity) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api-fxpractice.oanda.com",
      path: `/v3/instruments/${instrument}/candles?from=${from}&to=${to}&granularity=${granularity}&price=BA`,
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.OANDA_TOKEN}`,
        "Content-Type": "application/json",
      },
    }

    https
      .request(options, (res) => {
        let data = ""
        res.on("data", (chunk) => {
          data += chunk
        })
        res.on("end", () => {
          try {
            const response = JSON.parse(data)
            resolve(response.candles || [])
          } catch (e) {
            reject(e)
          }
        })
      })
      .on("error", reject)
      .end()
  })
}

// Calculate technical indicators
function calculateIndicators(bars) {
  const results = []

  for (let i = 0; i < bars.length; i++) {
    const closes = bars.slice(Math.max(0, i - 20), i + 1).map((b) => b.ask.c)

    // RSI (14)
    let gains = 0,
      losses = 0
    for (let j = 1; j < closes.length; j++) {
      const change = closes[j] - closes[j - 1]
      if (change > 0) gains += change
      else losses -= change
    }
    const avgGain = gains / 14
    const avgLoss = losses / 14
    const rsi = 100 - 100 / (1 + avgGain / (avgLoss || 1))

    // ADX (simplified)
    const high = Math.max(...bars.slice(Math.max(0, i - 13), i + 1).map((b) => b.ask.h))
    const low = Math.min(...bars.slice(Math.max(0, i - 13), i + 1).map((b) => b.ask.l))
    const range = high - low
    const adx = i < 13 ? 50 : Math.min(100, 20 + (range / bars[i].ask.c) * 200)

    // MACD
    const ema12 = i < 11 ? closes[i] : closes[i] * 0.15 + (results[i - 1]?.macd || closes[i]) * 0.85
    const ema26 = i < 25 ? closes[i] : closes[i] * 0.075 + (results[i - 1]?.macd || closes[i]) * 0.925
    const macd = ema12 - ema26
    const macdSignal = i < 8 ? macd : (macd * 0.2 + (results[i - 1]?.macdSignal || macd) * 0.8)

    results.push({ rsi, adx, macd, macdSignal })
  }

  return results
}

// Generate entry signals
function generateSignals(bars, indicators) {
  const signals = []

  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i]
    const prev = bars[i - 1]
    const ind = indicators[i]
    const prevInd = indicators[i - 1]

    let score = 0

    if (bar.ask.c > bar.ask.o && ind.rsi > 50) score += 2
    if (bar.ask.c < bar.ask.o && ind.rsi < 50) score += 2
    if (ind.adx > 23.5) score += 1.5
    if (ind.adx > 21) score += 1
    if (prevInd.macd < prevInd.macdSignal && ind.macd > ind.macdSignal && ind.rsi > 50) score += 1.5
    if (prevInd.macd > prevInd.macdSignal && ind.macd < ind.macdSignal && ind.rsi < 50) score += 1.5

    const direction = ind.rsi > 50 ? "BUY" : "SELL"

    let tier = "NO_TRADE"
    if (score >= 7) tier = "A+"
    else if (score >= 6) tier = "A"
    else if (score >= 5) tier = "B"

    if (tier !== "NO_TRADE") {
      signals.push({ time: bar.time, direction, score, tier })
    }
  }

  return signals
}

// Simulate trades
function simulateTrades(bars, signals) {
  const trades = []
  const barMap = new Map(bars.map((b, i) => [b.time, i]))

  for (const signal of signals) {
    const entryIdx = barMap.get(signal.time)
    if (entryIdx === undefined) continue

    const entryPrice = bars[entryIdx].ask.c
    const pipValue = 0.0001
    const riskPips = 50
    const tp1Pips = 100
    const tp2Pips = 200

    const trade = {
      entryTime: signal.time,
      entryPrice,
      direction: signal.direction,
      tier: signal.tier,
      tp1: signal.direction === "BUY" ? entryPrice + tp1Pips * pipValue : entryPrice - tp1Pips * pipValue,
      tp2: signal.direction === "BUY" ? entryPrice + tp2Pips * pipValue : entryPrice - tp2Pips * pipValue,
      sl: signal.direction === "BUY" ? entryPrice - riskPips * pipValue : entryPrice + riskPips * pipValue,
    }

    for (let i = entryIdx + 1; i < Math.min(entryIdx + 500, bars.length); i++) {
      const bar = bars[i]
      const bid = bar.bid.c

      if (signal.direction === "BUY") {
        if (bid >= trade.tp2) {
          trade.exitTime = bar.time
          trade.exitPrice = trade.tp2
          trade.exitReason = "TP2"
          break
        } else if (bid <= trade.sl) {
          trade.exitTime = bar.time
          trade.exitPrice = trade.sl
          trade.exitReason = "SL"
          break
        }
      } else {
        if (bid <= trade.tp2) {
          trade.exitTime = bar.time
          trade.exitPrice = trade.tp2
          trade.exitReason = "TP2"
          break
        } else if (bid >= trade.sl) {
          trade.exitTime = bar.time
          trade.exitPrice = trade.sl
          trade.exitReason = "SL"
          break
        }
      }
    }

    if (trade.exitPrice) {
      trade.pnl = signal.direction === "BUY" ? (trade.exitPrice - entryPrice) / pipValue : (entryPrice - trade.exitPrice) / pipValue
      trades.push(trade)
    }
  }

  return trades
}

// Main backtest
async function runBacktest() {
  console.log("Starting 6-month GBP/JPY real data backtest...")

  try {
    const from = "2023-08-01T00:00:00Z"
    const to = "2024-02-01T00:00:00Z"

    console.log(`Fetching OANDA historical data for GBP_JPY from ${from} to ${to}...`)
    const bars = await fetchOANDAData("GBP_JPY", from, to, "H1")

    if (!bars || bars.length === 0) {
      console.error("No data returned from OANDA")
      return
    }

    console.log(`Loaded ${bars.length} bars`)
    console.log("Calculating indicators...")
    const indicators = calculateIndicators(bars)

    console.log("Generating entry signals...")
    const signals = generateSignals(bars, indicators)
    console.log(`Found ${signals.length} entry signals`)

    console.log("Simulating trades...")
    const trades = simulateTrades(bars, signals)
    console.log(`Completed ${trades.length} trades`)

    const wins = trades.filter((t) => t.pnl > 0).length
    const losses = trades.filter((t) => t.pnl <= 0).length
    const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0
    const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0)
    const avgWin = wins > 0 ? trades.filter((t) => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0) / wins : 0
    const avgLoss = losses > 0 ? Math.abs(trades.filter((t) => t.pnl <= 0).reduce((sum, t) => sum + t.pnl, 0) / losses) : 0
    const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0

    const tierStats = { "A+": { trades: 0, wins: 0 }, A: { trades: 0, wins: 0 }, B: { trades: 0, wins: 0 } }
    for (const trade of trades) {
      if (trade.tier in tierStats) {
        tierStats[trade.tier].trades++
        if (trade.pnl > 0) tierStats[trade.tier].wins++
      }
    }

    console.log("\n=== 6-MONTH GBPJPY BACKTEST RESULTS ===")
    console.log(`Total Trades: ${trades.length}`)
    console.log(`Wins: ${wins} | Losses: ${losses}`)
    console.log(`Win Rate: ${winRate.toFixed(2)}%`)
    console.log(`Total PnL: ${totalPnL.toFixed(0)} pips`)
    console.log(`Avg Win: ${avgWin.toFixed(1)} pips | Avg Loss: ${avgLoss.toFixed(1)} pips`)
    console.log(`Profit Factor: ${profitFactor.toFixed(2)}`)
    console.log(`\nTier Breakdown:`)
    console.log(`A+: ${tierStats["A+"].trades} trades, ${tierStats["A+"].wins} wins (${((tierStats["A+"].wins / Math.max(1, tierStats["A+"].trades)) * 100).toFixed(1)}%)`)
    console.log(`A: ${tierStats.A.trades} trades, ${tierStats.A.wins} wins (${((tierStats.A.wins / Math.max(1, tierStats.A.trades)) * 100).toFixed(1)}%)`)
    console.log(`B: ${tierStats.B.trades} trades, ${tierStats.B.wins} wins (${((tierStats.B.wins / Math.max(1, tierStats.B.trades)) * 100).toFixed(1)}%)`)
  } catch (error) {
    console.error("Backtest error:", error)
  }
}

runBacktest()
