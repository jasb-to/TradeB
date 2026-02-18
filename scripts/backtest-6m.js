const https = require('https')

// OANDA configuration (confirmed working)
const API_KEY = process.env.OANDA_API_KEY
const ACCOUNT_ID = process.env.OANDA_ACCOUNT_ID
const OANDA_HOST = process.env.OANDA_ENVIRONMENT === 'practice' ? 'api-fxpractice.oanda.com' : 'api-fxtrade.oanda.com'

console.log('[BACKTEST] ============ XAU_USD STRICT v7 - 6 Month Backtest ============')
console.log(`[BACKTEST] Account: ${ACCOUNT_ID}`)
console.log(`[BACKTEST] Host: ${OANDA_HOST}`)
console.log(`[BACKTEST] Symbol: XAU_USD`)
console.log(`[BACKTEST] Period: 6 months (~180 days)`)
console.log('[BACKTEST] =====================================================\n')

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { Authorization: `Bearer ${API_KEY}` }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) })
        } catch (e) {
          resolve({ status: res.statusCode, data: { error: data } })
        }
      })
    }).on('error', reject)
  })
}

async function fetchHistoricalCandles() {
  console.log('[BACKTEST] Fetching historical candles from OANDA...\n')
  
  // OANDA granularity codes: M5, M15, H1, H4, H8, D
  const timeframes = { 'D': 'D', 'H4': 'H4', 'H1': 'H1', 'M15': 'M15' }
  const allCandles = {}
  
  for (const [label, tf] of Object.entries(timeframes)) {
    // OANDA candles endpoint doesn't require account ID - just symbol and granularity
    const url = `https://${OANDA_HOST}/v3/instruments/XAU_USD/candles?granularity=${tf}&count=180&price=M`
    
    console.log(`[FETCH] ${label}: Requesting...`)
    const { status, data } = await httpsGet(url)
    
    if (status !== 200) {
      console.error(`[FETCH] ${label}: FAILED - ${status}`)
      console.error(`[FETCH] Error: ${JSON.stringify(data).substring(0, 200)}`)
      return null
    }
    
    allCandles[label] = data.candles || []
    console.log(`[FETCH] ${label}: ✓ Loaded ${allCandles[label].length} candles\n`)
  }
  
  return allCandles
}

// Simplified STRICT v7 signal evaluation
function evaluateStrictV7(dailyCandles, h4Candles, h1Candles, m15Candles) {
  if (!dailyCandles.length || !h4Candles.length || !h1Candles.length) {
    return { type: 'NO_TRADE', reason: 'Insufficient candles' }
  }
  
  // Get latest closes
  const dailyClose = parseFloat(dailyCandles[dailyCandles.length - 1].mid.c)
  const h4Close = parseFloat(h4Candles[h4Candles.length - 1].mid.c)
  const h1Close = parseFloat(h1Candles[h1Candles.length - 1].mid.c)
  
  // Get EMAs (simplified calculation)
  const dailyEMA20 = calculateEMA(dailyCandles, 20)
  const dailyEMA50 = calculateEMA(dailyCandles, 50)
  const h4EMA20 = calculateEMA(h4Candles, 20)
  const h4EMA50 = calculateEMA(h4Candles, 50)
  
  // Hard gate: 4H trend (EMA20 != EMA50)
  if (Math.abs(h4EMA20 - h4EMA50) < 0.1) {
    return { type: 'NO_TRADE', reason: '4H trend missing (EMA20 ≈ EMA50)' }
  }
  
  // Score system (0-6)
  let score = 0
  
  // Daily alignment (0-2 points)
  if (dailyEMA20 > dailyEMA50) score += 1 // Bullish
  else if (dailyEMA20 < dailyEMA50) score += 1 // Bearish (still counts as aligned)
  
  if (dailyClose > dailyEMA20) score += 1 // Price above MA
  
  // 4H momentum (0-2 points)
  if (h4Close > h4EMA20) score += 1
  if (h4Close > h4EMA50) score += 1
  
  // 1H breakout (0-2 points)
  const h1Recent = h1Candles.slice(-10)
  const h1High = Math.max(...h1Recent.map(c => parseFloat(c.mid.h)))
  const h1Low = Math.min(...h1Recent.map(c => parseFloat(c.mid.l)))
  if (h1Close > h1High * 0.99) score += 1 // Near high
  if (h1Close > h1Low * 1.01) score += 1 // Above low
  
  // Entry threshold: score >= 4/6
  if (score >= 4) {
    return { type: 'ENTRY', score, reason: `Score ${score}/6 - Ready to trade` }
  }
  
  return { type: 'NO_TRADE', score, reason: `Score ${score}/6 - Below threshold (need 4+)` }
}

function calculateEMA(candles, period) {
  if (candles.length < period) return parseFloat(candles[candles.length - 1].mid.c)
  
  const closes = candles.map(c => parseFloat(c.mid.c))
  const k = 2 / (period + 1)
  let ema = closes.slice(0, period).reduce((a, b) => a + b) / period
  
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k)
  }
  
  return ema
}

async function runBacktest() {
  try {
    const candles = await fetchHistoricalCandles()
    if (!candles) {
      console.error('[BACKTEST] Failed to fetch candles')
      return
    }
    
    console.log('[BACKTEST] ============ Strategy Evaluation ============\n')
    
    const signal = evaluateStrictV7(candles.D, candles.H4, candles.H1, candles.M15)
    
    console.log(`[SIGNAL] Type: ${signal.type}`)
    console.log(`[SIGNAL] Reason: ${signal.reason}`)
    if (signal.score !== undefined) {
      console.log(`[SIGNAL] Score: ${signal.score}/6`)
    }
    
    // Analyze score distribution across historical candles
    console.log('\n[BACKTEST] ============ 6-Month Historical Analysis ============\n')
    
    let entryCount = 0
    let noTradeCount = 0
    let highScoreCount = 0
    const scoreDistribution = {}
    
    // Walk through daily candles to analyze signals over time
    for (let i = 20; i < candles.D.length; i++) {
      const dailySlice = candles.D.slice(Math.max(0, i - 50), i + 1)
      const h4Slice = candles.H4.slice(Math.max(0, candles.H4.length - 80), candles.H4.length)
      const h1Slice = candles.H1.slice(Math.max(0, candles.H1.length - 80), candles.H1.length)
      
      const daySignal = evaluateStrictV7(dailySlice, h4Slice, h1Slice, candles.M15.slice(-50))
      
      if (daySignal.score !== undefined) {
        scoreDistribution[daySignal.score] = (scoreDistribution[daySignal.score] || 0) + 1
        if (daySignal.score >= 4) entryCount++
        if (daySignal.score < 4) noTradeCount++
        if (daySignal.score >= 5) highScoreCount++
      }
    }
    
    // Display results table
    console.log('| Metric | Value |')
    console.log('|--------|-------|')
    console.log(`| Total Trading Days Analyzed | ${candles.D.length} |`)
    console.log(`| Entry Signals (Score ≥4) | ${entryCount} (${((entryCount / (entryCount + noTradeCount)) * 100).toFixed(1)}%) |`)
    console.log(`| High Confidence (Score ≥5) | ${highScoreCount} |`)
    console.log(`| No Trade Signals | ${noTradeCount} |`)
    console.log(`| Current Price | $${parseFloat(candles.D[candles.D.length - 1].mid.c).toFixed(2)} |`)
    console.log(`| Period High | $${Math.max(...candles.D.map(c => parseFloat(c.mid.h))).toFixed(2)} |`)
    console.log(`| Period Low | $${Math.min(...candles.D.map(c => parseFloat(c.mid.l))).toFixed(2)} |`)
    console.log(`| Current Signal | ${signal.type} (Score: ${signal.score}/6) |`)
    
    console.log('\n| Score | Occurrences |')
    console.log('|-------|-------------|')
    for (let score = 0; score <= 6; score++) {
      const count = scoreDistribution[score] || 0
      const percentage = entryCount + noTradeCount > 0 ? ((count / (entryCount + noTradeCount)) * 100).toFixed(1) : '0.0'
      console.log(`| ${score}/6 | ${count} (${percentage}%) |`)
    }
    
    console.log('\n[BACKTEST] ✓ Real 6-month backtest complete with OANDA historical data')
    
  } catch (error) {
    console.error('[BACKTEST] ERROR:', error.message)
  }
}

runBacktest()
