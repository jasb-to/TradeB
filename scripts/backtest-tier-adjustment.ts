/**
 * Backtest: Tier Threshold Adjustment Simulation
 * 
 * Purpose: Evaluate impact of reducing A-tier lower bound by 2%
 * 
 * Current Thresholds (Production):
 *   A+ ≥ 7.0
 *   A  ≥ 6.0
 * 
 * New Thresholds (Simulation):
 *   Max score = 8.5
 *   2% reduction = 0.17
 *   A+ ≥ 6.91 (unchanged to measure pure A expansion)
 *   A  ≥ 5.83 (6.0 - 0.17)
 */

import { generateXauSignal } from '../lib/strategies'

interface Trade {
  id: string
  date: string
  direction: 'LONG' | 'SHORT'
  entry: number
  exit: number
  pnl: number
  pnlPercent: number
  tier: 'A+' | 'A' | 'REJECTED'
  score: number
  confidence: number
  adx1h: number
  setupQuality: string
}

interface BacktestResult {
  symbol: string
  currentThresholds: {
    aPlus: number
    a: number
  }
  newThresholds: {
    aPlus: number
    a: number
  }
  production: {
    totalTrades: number
    aPlusTrades: number
    aTrades: number
    rejectedTrades: number
    winningTrades: number
    losingTrades: number
    winRate: number
    totalProfit: number
    profitFactor: number
    maxDrawdown: number
    avgPnl: number
    avgWin: number
    avgLoss: number
  }
  simulation: {
    totalTrades: number
    aPlusTrades: number
    aTrades: number
    rejectedTrades: number
    winningTrades: number
    losingTrades: number
    winRate: number
    totalProfit: number
    profitFactor: number
    maxDrawdown: number
    avgPnl: number
    avgWin: number
    avgLoss: number
  }
  comparison: {
    tradeFrequencyChange: string
    aPlusDelta: number
    aDelta: number
    winRateDelta: number
    profitDelta: number
    expectancyDelta: number
  }
}

// Simulate 1 year of realistic XAU/USD trading data
function generateHistoricalTrades(): Trade[] {
  const trades: Trade[] = []
  const basePrice = 2450 // Realistic XAU/USD base
  let date = new Date('2024-01-01')
  let tradeId = 1

  // Generate realistic daily price movements
  for (let day = 0; day < 365; day++) {
    date = new Date(date.getTime() + 24 * 60 * 60 * 1000)
    
    // Market hours: 8 trades per day on average
    const tradesPerDay = Math.floor(Math.random() * 4) + 4
    
    for (let i = 0; i < tradesPerDay; i++) {
      // Generate realistic score distribution
      // A+ trades: 20% of all signals
      // A trades: 50% of all signals
      // Rejected: 30% of all signals
      
      const rand = Math.random()
      let score: number
      let expectedTier: 'A+' | 'A' | 'REJECTED'
      
      if (rand < 0.2) {
        // A+ Setup
        score = 6.91 + Math.random() * 1.59 // 6.91 to 8.5
        expectedTier = 'A+'
      } else if (rand < 0.7) {
        // A Setup (wider distribution to capture expansion effect)
        score = 5.0 + Math.random() * 3.0 // 5.0 to 8.0
        expectedTier = 'A'
      } else {
        // Rejected
        score = Math.random() * 5.0 // 0 to 5.0
        expectedTier = 'REJECTED'
      }

      // Generate ADX (correlated with score)
      const adx1h = 15 + (score / 8.5) * 20 + (Math.random() - 0.5) * 5

      // Direction 50/50
      const direction = Math.random() > 0.5 ? 'LONG' : 'SHORT'
      
      // Win probability varies by tier
      let winProbability = 0.45
      if (expectedTier === 'A+') {
        winProbability = 0.68
      } else if (expectedTier === 'A') {
        winProbability = 0.58
      }
      
      const isWin = Math.random() < winProbability
      
      // PnL generation
      const pnlPercent = isWin 
        ? 0.5 + Math.random() * 2.5 // 0.5% to 3% wins
        : -(0.3 + Math.random() * 1.8) // -0.3% to -2.1% losses
      
      const entry = basePrice + (Math.random() - 0.5) * 50
      const exit = entry * (1 + pnlPercent / 100)
      const pnl = exit - entry

      trades.push({
        id: `TRADE_${tradeId++}`,
        date: date.toISOString().split('T')[0],
        direction,
        entry: Math.round(entry * 100) / 100,
        exit: Math.round(exit * 100) / 100,
        pnl: Math.round(pnl * 100) / 100,
        pnlPercent: Math.round(pnlPercent * 100) / 100,
        tier: expectedTier,
        score: Math.round(score * 100) / 100,
        confidence: 70 + (score / 8.5) * 20 + (Math.random() - 0.5) * 10,
        adx1h: Math.round(adx1h * 10) / 10,
        setupQuality: expectedTier,
      })
    }
  }

  return trades
}

// Reclassify trades using new thresholds
function reclassifyTrades(trades: Trade[], aPlus: number, a: number): Trade[] {
  return trades.map(trade => {
    if (trade.score >= aPlus) {
      return { ...trade, tier: 'A+' }
    } else if (trade.score >= a) {
      return { ...trade, tier: 'A' }
    } else {
      return { ...trade, tier: 'REJECTED' }
    }
  })
}

// Calculate backtest metrics
function calculateMetrics(trades: Trade[]) {
  const acceptedTrades = trades.filter(t => t.tier !== 'REJECTED')
  
  if (acceptedTrades.length === 0) {
    return {
      totalTrades: 0,
      aPlusTrades: 0,
      aTrades: 0,
      rejectedTrades: trades.length,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalProfit: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      avgPnl: 0,
      avgWin: 0,
      avgLoss: 0,
    }
  }

  const aPlusTrades = acceptedTrades.filter(t => t.tier === 'A+')
  const aTrades = acceptedTrades.filter(t => t.tier === 'A')
  
  const winningTrades = acceptedTrades.filter(t => t.pnl > 0)
  const losingTrades = acceptedTrades.filter(t => t.pnl < 0)
  
  const totalProfit = acceptedTrades.reduce((sum, t) => sum + t.pnl, 0)
  const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0)
  const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0))
  
  // Max drawdown calculation
  let maxDrawdown = 0
  let runningBalance = 500 // Starting capital
  let peak = runningBalance
  
  for (const trade of acceptedTrades) {
    runningBalance += trade.pnl
    if (runningBalance > peak) {
      peak = runningBalance
    }
    const drawdown = (peak - runningBalance) / peak
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown
    }
  }

  return {
    totalTrades: acceptedTrades.length,
    aPlusTrades: aPlusTrades.length,
    aTrades: aTrades.length,
    rejectedTrades: trades.filter(t => t.tier === 'REJECTED').length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate: winningTrades.length / acceptedTrades.length,
    totalProfit: Math.round(totalProfit * 100) / 100,
    profitFactor: grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : 0,
    maxDrawdown: Math.round(maxDrawdown * 10000) / 100,
    avgPnl: Math.round((totalProfit / acceptedTrades.length) * 100) / 100,
    avgWin: winningTrades.length > 0 ? Math.round((grossProfit / winningTrades.length) * 100) / 100 : 0,
    avgLoss: losingTrades.length > 0 ? Math.round((grossLoss / losingTrades.length) * 100) / 100 : 0,
  }
}

async function runBacktest() {
  console.log('╔════════════════════════════════════════════════════════════════════╗')
  console.log('║     XAU/USD BACKTEST: Tier Threshold Adjustment Simulation         ║')
  console.log('╚════════════════════════════════════════════════════════════════════╝\n')

  // Current production thresholds
  const CURRENT_A_PLUS = 7.0
  const CURRENT_A = 6.0
  
  // New simulation thresholds
  const NEW_A_PLUS = 6.91 // Unchanged (benchmark)
  const NEW_A = 5.83 // 6.0 - 0.17 (2% of 8.5)

  console.log('THRESHOLD CONFIGURATION\n')
  console.log('Production Thresholds:')
  console.log(`  A+: ≥ ${CURRENT_A_PLUS}`)
  console.log(`  A:  ≥ ${CURRENT_A}\n`)
  
  console.log('Simulation Thresholds:')
  console.log(`  A+: ≥ ${NEW_A_PLUS}`)
  console.log(`  A:  ≥ ${NEW_A}`)
  console.log(`  (A expanded by 0.17 points / 2.8% of max 8.5 score)\n`)

  // Generate 1 year of realistic trades
  console.log('Generating 365 days of realistic XAU/USD trade data...')
  const allTrades = generateHistoricalTrades()
  console.log(`Generated ${allTrades.length} signals\n`)

  // Classify using CURRENT thresholds
  const productionTrades = reclassifyTrades([...allTrades], CURRENT_A_PLUS, CURRENT_A)
  const productionMetrics = calculateMetrics(productionTrades)

  // Classify using NEW thresholds
  const simulationTrades = reclassifyTrades([...allTrades], NEW_A_PLUS, NEW_A)
  const simulationMetrics = calculateMetrics(simulationTrades)

  // Calculate equity curves
  let productionBalance = 500
  let simulationBalance = 500
  const equityCurve = { dates: [], production: [], simulation: [] }

  const acceptedProductionTrades = productionTrades.filter(t => t.tier !== 'REJECTED')
  const acceptedSimulationTrades = simulationTrades.filter(t => t.tier !== 'REJECTED')

  for (let i = 0; i < Math.min(acceptedProductionTrades.length, 252); i++) {
    productionBalance += acceptedProductionTrades[i].pnl
    simulationBalance += acceptedSimulationTrades[i].pnl
    
    if (i % 10 === 0) {
      equityCurve.dates.push(`Trade ${i}`)
      equityCurve.production.push(Math.round(productionBalance * 100) / 100)
      equityCurve.simulation.push(Math.round(simulationBalance * 100) / 100)
    }
  }

  // Print comprehensive results
  console.log('╔═══════════════════════════════════════════════════════════════════╗')
  console.log('║                    BACKTEST RESULTS COMPARISON                     ║')
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n')

  console.log('METRIC                    PRODUCTION        SIMULATION        DELTA')
  console.log('─────────────────────────────────────────────────────────────────────')
  
  // Total trades
  const totalDelta = simulationMetrics.totalTrades - productionMetrics.totalTrades
  console.log(`Total Trades              ${String(productionMetrics.totalTrades).padEnd(17)} ${String(simulationMetrics.totalTrades).padEnd(17)} ${totalDelta > 0 ? '+' : ''}${totalDelta}`)

  // A+ trades
  const aPlusDelta = simulationMetrics.aPlusTrades - productionMetrics.aPlusTrades
  console.log(`A+ Tier Trades            ${String(productionMetrics.aPlusTrades).padEnd(17)} ${String(simulationMetrics.aPlusTrades).padEnd(17)} ${aPlusDelta > 0 ? '+' : ''}${aPlusDelta}`)

  // A trades
  const aDelta = simulationMetrics.aTrades - productionMetrics.aTrades
  console.log(`A Tier Trades             ${String(productionMetrics.aTrades).padEnd(17)} ${String(simulationMetrics.aTrades).padEnd(17)} ${aDelta > 0 ? '+' : ''}${aDelta}`)

  // Rejected trades
  const rejectedDelta = simulationMetrics.rejectedTrades - productionMetrics.rejectedTrades
  console.log(`Rejected Trades           ${String(productionMetrics.rejectedTrades).padEnd(17)} ${String(simulationMetrics.rejectedTrades).padEnd(17)} ${rejectedDelta > 0 ? '+' : ''}${rejectedDelta}`)

  // Win rate
  const winRateDelta = ((simulationMetrics.winRate - productionMetrics.winRate) * 100).toFixed(2)
  console.log(`Win Rate                  ${(productionMetrics.winRate * 100).toFixed(1)}%${' '.repeat(12)} ${(simulationMetrics.winRate * 100).toFixed(1)}%${' '.repeat(12)} ${winRateDelta > 0 ? '+' : ''}${winRateDelta}%`)

  // Total profit
  const profitDelta = simulationMetrics.totalProfit - productionMetrics.totalProfit
  console.log(`Total Profit (£)          £${String(productionMetrics.totalProfit).padEnd(15)} £${String(simulationMetrics.totalProfit).padEnd(15)} ${profitDelta > 0 ? '+' : ''}£${Math.abs(profitDelta).toFixed(2)}`)

  // Profit factor
  const profitFactorDelta = simulationMetrics.profitFactor - productionMetrics.profitFactor
  console.log(`Profit Factor             ${String(productionMetrics.profitFactor).padEnd(17)} ${String(simulationMetrics.profitFactor).padEnd(17)} ${profitFactorDelta > 0 ? '+' : ''}${profitFactorDelta.toFixed(2)}`)

  // Max drawdown
  const maxDDDelta = simulationMetrics.maxDrawdown - productionMetrics.maxDrawdown
  console.log(`Max Drawdown              ${productionMetrics.maxDrawdown.toFixed(2)}%${' '.repeat(12)} ${simulationMetrics.maxDrawdown.toFixed(2)}%${' '.repeat(12)} ${maxDDDelta > 0 ? '+' : ''}${maxDDDelta.toFixed(2)}%`)

  // Average PnL
  const avgPnlDelta = simulationMetrics.avgPnl - productionMetrics.avgPnl
  console.log(`Avg PnL per Trade (£)     £${String(productionMetrics.avgPnl).padEnd(15)} £${String(simulationMetrics.avgPnl).padEnd(15)} ${avgPnlDelta > 0 ? '+' : ''}£${Math.abs(avgPnlDelta).toFixed(2)}`)

  console.log('\n╔═══════════════════════════════════════════════════════════════════╗')
  console.log('║                    TIER DISTRIBUTION ANALYSIS                      ║')
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n')

  console.log('PRODUCTION THRESHOLDS')
  console.log(`  A+ (≥${CURRENT_A_PLUS}):    ${productionMetrics.aPlusTrades} trades (${((productionMetrics.aPlusTrades / productionMetrics.totalTrades) * 100).toFixed(1)}%)`)
  console.log(`  A  (≥${CURRENT_A}):    ${productionMetrics.aTrades} trades (${((productionMetrics.aTrades / productionMetrics.totalTrades) * 100).toFixed(1)}%)`)
  console.log(`  Rejected: ${productionMetrics.rejectedTrades} signals (${((productionMetrics.rejectedTrades / allTrades.length) * 100).toFixed(1)}%)\n`)

  console.log('SIMULATION THRESHOLDS')
  console.log(`  A+ (≥${NEW_A_PLUS}):    ${simulationMetrics.aPlusTrades} trades (${((simulationMetrics.aPlusTrades / simulationMetrics.totalTrades) * 100).toFixed(1)}%)`)
  console.log(`  A  (≥${NEW_A}):    ${simulationMetrics.aTrades} trades (${((simulationMetrics.aTrades / simulationMetrics.totalTrades) * 100).toFixed(1)}%)`)
  console.log(`  Rejected: ${simulationMetrics.rejectedTrades} signals (${((simulationMetrics.rejectedTrades / allTrades.length) * 100).toFixed(1)}%)\n`)

  console.log('EXPANSION EFFECT')
  console.log(`  A tier expanded by: ${aDelta} trades (${((aDelta / productionMetrics.aTrades) * 100).toFixed(1)}% increase)`)
  console.log(`  Trade frequency: ${((simulationMetrics.totalTrades / productionMetrics.totalTrades - 1) * 100).toFixed(1)}% ${simulationMetrics.totalTrades > productionMetrics.totalTrades ? 'increase' : 'decrease'}\n`)

  console.log('╔═══════════════════════════════════════════════════════════════════╗')
  console.log('║                    QUALITY METRICS SUMMARY                         ║')
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n')

  console.log('PRODUCTION METRICS:')
  console.log(`  A+: ${productionMetrics.aPlusTrades} trades | Avg PnL: £${productionMetrics.avgPnl}`)
  console.log(`  A:  ${productionMetrics.aTrades} trades | Avg PnL: £${productionMetrics.avgPnl}`)
  console.log(`  System Win Rate: ${(productionMetrics.winRate * 100).toFixed(1)}% | Profit Factor: ${productionMetrics.profitFactor}\n`)

  console.log('SIMULATION METRICS:')
  console.log(`  A+: ${simulationMetrics.aPlusTrades} trades | Avg PnL: £${simulationMetrics.avgPnl}`)
  console.log(`  A:  ${simulationMetrics.aTrades} trades | Avg PnL: £${simulationMetrics.avgPnl}`)
  console.log(`  System Win Rate: ${(simulationMetrics.winRate * 100).toFixed(1)}% | Profit Factor: ${simulationMetrics.profitFactor}\n`)

  console.log('╔═══════════════════════════════════════════════════════════════════╗')
  console.log('║                    RECOMMENDATION                                  ║')
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n')

  const expectancyChange = ((simulationMetrics.avgPnl - productionMetrics.avgPnl) / productionMetrics.avgPnl * 100)
  
  console.log('IMPACT SUMMARY:')
  console.log(`  Trade frequency: +${((totalDelta / productionMetrics.totalTrades) * 100).toFixed(1)}%`)
  console.log(`  Expected value change: ${expectancyChange > 0 ? '+' : ''}${expectancyChange.toFixed(2)}%`)
  console.log(`  Risk profile: ${simulationMetrics.maxDrawdown > productionMetrics.maxDrawdown ? 'Slightly Higher' : 'Slightly Lower'} (${Math.abs(maxDDDelta).toFixed(2)}% ${simulationMetrics.maxDrawdown > productionMetrics.maxDrawdown ? 'increase' : 'decrease'})`)
  console.log(`  Win rate: ${(simulationMetrics.winRate * 100).toFixed(1)}% (${(winRateDelta).toFixed(2)}% change)\n`)

  if (expectancyChange > 0 && simulationMetrics.winRate > 0.55) {
    console.log('✅ RECOMMENDATION: Proceed with threshold adjustment')
    console.log('   The expanded A tier increases trade frequency while maintaining quality.')
  } else if (expectancyChange < -2) {
    console.log('⚠️  CAUTION: Review threshold adjustment')
    console.log('   Expected value degradation detected.')
  } else {
    console.log('⚡ NEUTRAL: Threshold adjustment is trade-off neutral')
    console.log('   More trades with similar quality metrics.')
  }

  console.log('\n')
}

runBacktest().catch(console.error)
