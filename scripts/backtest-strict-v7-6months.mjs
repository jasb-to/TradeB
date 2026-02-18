#!/usr/bin/env node

/**
 * XAU_USD STRICT v7 Strategy - 6 Month Backtest
 * Tests new score-based entry system over historical data
 */

import fetch from 'node-fetch'

const OANDA_HOST = 'api-fxtrade.oanda.com'
const API_KEY = process.env.OANDA_API_KEY
const ACCOUNT_ID = process.env.OANDA_ACCOUNT_ID

if (!API_KEY || !ACCOUNT_ID) {
  console.error('ERROR: Missing OANDA_API_KEY or OANDA_ACCOUNT_ID')
  process.exit(1)
}

// Calculate 6 months ago date
const endDate = new Date()
const startDate = new Date(endDate.getTime() - 180 * 24 * 60 * 60 * 1000)

console.log(`[BACKTEST] 6-Month STRICT v7 Backtest: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`)

async function fetchOandaCandles(symbol, granularity, count = 1000) {
  const url = `https://${OANDA_HOST}/v3/accounts/${ACCOUNT_ID}/instruments/${symbol}/candles?granularity=${granularity}&count=${count}&price=M`
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
    })
    
    if (!response.ok) {
      console.error(`[FETCH] ${symbol} ${granularity} returned ${response.status}`)
      return []
    }
    
    const data = await response.json()
    if (!data.candles) return []
    
    return data.candles
      .map(c => ({
        timestamp: new Date(c.time).getTime(),
        time: c.time,
        open: parseFloat(c.mid.o),
        high: parseFloat(c.mid.h),
        low: parseFloat(c.mid.l),
        close: parseFloat(c.mid.c),
        volume: c.volume || 0,
      }))
      .sort((a, b) => a.timestamp - b.timestamp)
  } catch (err) {
    console.error(`[ERROR] Fetch failed for ${symbol} ${granularity}:`, err.message)
    return []
  }
}

// Simple ADX calculation
function calculateADX(candles, period = 14) {
  if (candles.length < period + 1) return 0
  
  let plusDM = 0, minusDM = 0, trueRange = 0
  
  for (let i = candles.length - period; i < candles.length; i++) {
    const curr = candles[i]
    const prev = candles[i - 1]
    
    const upMove = curr.high - prev.high
    const downMove = prev.low - curr.low
    
    if (upMove > downMove && upMove > 0) plusDM += upMove
    if (downMove > upMove && downMove > 0) minusDM += downMove
    
    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close)
    )
    trueRange += tr
  }
  
  const diPlus = (plusDM / trueRange) * 100
  const diMinus = (minusDM / trueRange) * 100
  const di = Math.abs(diPlus - diMinus) / (diPlus + diMinus)
  
  return di * 100 // Simple ADX approximation
}

// Simple RSI calculation
function calculateRSI(candles, period = 14) {
  if (candles.length < period + 1) return 50
  
  let gains = 0, losses = 0
  
  for (let i = candles.length - period; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close
    if (change > 0) gains += change
    else losses += Math.abs(change)
  }
  
  const avgGain = gains / period
  const avgLoss = losses / period
  
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - (100 / (1 + rs))
}

// Check if 1H has breakout
function hasBreakout(candles, period = 20) {
  if (candles.length < period + 1) return false
  
  const recent = candles[candles.length - 1]
  const high20 = Math.max(...candles.slice(-period).map(c => c.high))
  const low20 = Math.min(...candles.slice(-period).map(c => c.low))
  
  return recent.close > high20 || recent.close < low20
}

// Simplified STRICT v7 evaluation
function evaluateStrictV7(daily, h4, h1, h15) {
  if (daily.length < 20 || h4.length < 20 || h1.length < 20 || h15.length < 20) {
    return { type: 'NO_TRADE', score: 0, reason: 'Insufficient data' }
  }
  
  // Score components
  let score = 0
  const checks = []
  
  // 1. 4H Trend check (hard gate)
  const h4_ema20 = h4.slice(-20).reduce((a, c) => a + c.close, 0) / 20
  const h4_ema50 = h4.slice(-50).reduce((a, c) => a + c.close, 0) / 50
  const has4HTrend = h4_ema20 !== h4_ema50
  checks.push({ check: '4H Trend', passed: has4HTrend })
  if (!has4HTrend) return { type: 'NO_TRADE', score: 0, reason: '4H trend gate failed' }
  
  // 2. 1H Breakout check (hard gate)
  const has1HBreakout = hasBreakout(h1, 20)
  checks.push({ check: '1H Breakout', passed: has1HBreakout })
  if (!has1HBreakout) return { type: 'NO_TRADE', score: 0, reason: '1H breakout gate failed' }
  
  // Score calculation (starts at 0, need 4+ to trade)
  // Daily alignment
  const dailyRSI = calculateRSI(daily)
  if (dailyRSI > 30 && dailyRSI < 70) score += 1
  
  // 4H ADX
  const h4ADX = calculateADX(h4)
  if (h4ADX > 20) score += 1
  
  // 1H ADX
  const h1ADX = calculateADX(h1)
  if (h1ADX > 25) score += 1
  
  // Momentum alignment
  const h1RSI = calculateRSI(h1)
  if ((h1RSI < 30 || h1RSI > 70) && (dailyRSI < 30 || dailyRSI > 70)) score += 1
  
  // ATR volatility
  const h1ATR = h1.slice(-10).reduce((a, c) => a + (c.high - c.low), 0) / 10
  if (h1ATR > 2.0) score += 1
  
  // Price action
  if (has1HBreakout) score += 1
  
  const hasEntry = score >= 4
  checks.push({ check: `Score (${score}/6)`, passed: hasEntry })
  
  return {
    type: hasEntry ? 'ENTRY' : 'NO_TRADE',
    direction: h1RSI < 50 ? 'SHORT' : 'LONG',
    score,
    checks,
    indicators: { dailyRSI, h1RSI, h4ADX, h1ADX, h1ATR }
  }
}

async function runBacktest() {
  console.log('\n[BACKTEST] Fetching 6 months of historical data...')
  
  // Fetch data: 6 months = ~26 weeks
  const daily = await fetchOandaCandles('XAU_USD', 'D', 200)
  const h4 = await fetchOandaCandles('XAU_USD', 'H4', 700)
  const h1 = await fetchOandaCandles('XAU_USD', 'H1', 2000)
  const h15 = await fetchOandaCandles('XAU_USD', 'M15', 1000)
  
  console.log(`[BACKTEST] Data loaded: Daily=${daily.length}, 4H=${h4.length}, 1H=${h1.length}, 15M=${h15.length}`)
  
  if (daily.length < 50 || h4.length < 50 || h1.length < 100) {
    console.log('[BACKTEST] ERROR: Insufficient data')
    return
  }
  
  // Backtest: iterate through each candle
  let totalEvaluations = 0
  let entrySignals = 0
  let trades = []
  
  // Find evaluation windows (every 4H candle, look back to get entries)
  for (let i = 50; i < h4.length; i++) {
    totalEvaluations++
    
    // Get candles up to this point
    const dailyWindow = daily.filter(c => c.timestamp <= h4[i].timestamp)
    const h4Window = h4.slice(0, i + 1)
    const h1Window = h1.filter(c => c.timestamp <= h4[i].timestamp)
    const h15Window = h15.filter(c => c.timestamp <= h4[i].timestamp)
    
    if (dailyWindow.length < 20 || h4Window.length < 20 || h1Window.length < 20) continue
    
    const signal = evaluateStrictV7(dailyWindow, h4Window, h1Window, h15Window)
    
    if (signal.type === 'ENTRY') {
      entrySignals++
      const entryPrice = h4[i].close
      
      // Simulate trade: next 4H candle is potential exit
      let exitPrice = null
      let exitType = null
      
      if (i + 1 < h4.length) {
        exitPrice = h4[i + 1].close
        const pnl = signal.direction === 'LONG' 
          ? exitPrice - entryPrice 
          : entryPrice - exitPrice
        
        trades.push({
          entryTime: h4[i].time,
          exitTime: h4[i + 1].time,
          entryPrice,
          exitPrice,
          direction: signal.direction,
          pnl,
          pips: Math.abs(pnl * 100), // Approximate pips
          win: pnl > 0,
          score: signal.score
        })
      }
    }
  }
  
  // Calculate statistics
  const wins = trades.filter(t => t.win).length
  const losses = trades.filter(t => !t.win).length
  const winRate = trades.length > 0 ? (wins / trades.length * 100).toFixed(2) : 0
  const totalPnL = trades.reduce((a, t) => a + t.pnl, 0)
  const avgWin = wins > 0 ? (trades.filter(t => t.win).reduce((a, t) => a + t.pnl, 0) / wins).toFixed(4) : 0
  const avgLoss = losses > 0 ? (Math.abs(trades.filter(t => !t.win).reduce((a, t) => a + t.pnl, 0) / losses)).toFixed(4) : 0
  
  // Print results
  console.log('\n' + '='.repeat(80))
  console.log('XAU_USD STRICT v7 Strategy - 6 Month Backtest Results')
  console.log('='.repeat(80))
  console.log(`\nData Period: ${daily[0].time} to ${daily[daily.length - 1].time}`)
  console.log(`Evaluations: ${totalEvaluations}`)
  console.log(`Entry Signals Generated: ${entrySignals}`)
  console.log(`Trades Executed: ${trades.length}`)
  console.log(`Wins: ${wins}`)
  console.log(`Losses: ${losses}`)
  console.log(`Win Rate: ${winRate}%`)
  console.log(`Total P&L: ${totalPnL.toFixed(4)} USD`)
  console.log(`Avg Win: ${avgWin}`)
  console.log(`Avg Loss: ${avgLoss}`)
  
  if (trades.length > 0) {
    console.log('\n' + '-'.repeat(80))
    console.log('TRADE DETAILS')
    console.log('-'.repeat(80))
    trades.slice(0, 20).forEach((t, idx) => {
      const status = t.win ? 'WIN' : 'LOSS'
      console.log(`${idx + 1}. [${status}] ${t.direction} @ ${t.entryPrice.toFixed(2)} → ${t.exitPrice.toFixed(2)} | P&L: ${t.pnl.toFixed(4)} | Score: ${t.score}`)
    })
    if (trades.length > 20) {
      console.log(`... and ${trades.length - 20} more trades`)
    }
  }
  
  console.log('\n' + '='.repeat(80))
  
  // Return as JSON for parsing
  return {
    status: 'SUCCESS',
    symbol: 'XAU_USD',
    strategy: 'STRICT_v7',
    period: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
    dataPoints: {
      daily: daily.length,
      h4: h4.length,
      h1: h1.length,
      h15: h15.length
    },
    evaluations: totalEvaluations,
    entriesGenerated: entrySignals,
    trades: trades.length,
    wins,
    losses,
    winRate: parseFloat(winRate),
    totalPnL: parseFloat(totalPnL.toFixed(4)),
    avgWin: parseFloat(avgWin),
    avgLoss: parseFloat(avgLoss),
    tradeDetails: trades.slice(0, 50)
  }
}

async function main() {
  try {
    const result = await runBacktest()
    if (result) {
      console.log('\n[BACKTEST] Complete')
    }
  } catch (err) {
    console.error('Fatal error:', err)
    process.exit(1)
  }
}

main()
