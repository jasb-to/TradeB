import { NextResponse } from 'next/server'
import { getOpenTrades, updateTrade, isValidTradeFile } from '@/lib/trade-lifecycle'
import { DataFetcher } from '@/lib/data-fetcher'
import { TradingStrategies } from '@/lib/strategies'
import { DEFAULT_TRADING_CONFIG } from '@/lib/default-config'

export const dynamic = 'force-dynamic'

interface MarketPrice {
  symbol: string
  bid: number
  ask: number
  mid: number
}

async function fetchMarketPrice(symbol: string): Promise<MarketPrice | null> {
  try {
    const fetcher = new DataFetcher(DEFAULT_TRADING_CONFIG)
    const pricing = await fetcher.fetchLatestPricing([symbol])
    
    if (pricing && pricing.prices && pricing.prices.length > 0) {
      const price = pricing.prices[0]
      return {
        symbol,
        bid: parseFloat(price.bids?.[0]?.price || price.mid),
        ask: parseFloat(price.asks?.[0]?.price || price.mid),
        mid: parseFloat(price.mid),
      }
    }
  } catch (error) {
    console.error(`[LIFECYCLE] Error fetching price for ${symbol}:`, error)
  }
  return null
}

async function checkStructuralInvalidation(symbol: string, originalTier: string): Promise<boolean> {
  try {
    const fetcher = new DataFetcher(DEFAULT_TRADING_CONFIG)
    const strategies = new TradingStrategies(DEFAULT_TRADING_CONFIG)
    
    const dataDaily = await fetcher.fetchCandles(symbol, 100, 'D')
    const data1h = await fetcher.fetchCandles(symbol, 200, 'H1')
    
    if (!dataDaily?.length || !data1h?.length) {
      return false
    }
    
    const signal = await strategies.evaluateSignals(
      dataDaily, dataDaily, dataDaily,
      data1h, data1h, data1h
    )
    
    const newTier = (signal as any).structuralTier || 'NO_TRADE'
    
    // Invalidated if tier dropped or direction flipped
    if (newTier === 'NO_TRADE') {
      console.log(`[LIFECYCLE] Structure invalidated: ${originalTier} → ${newTier}`)
      return true
    }
    
    return false
  } catch (error) {
    console.error(`[LIFECYCLE] Error checking structural invalidation:`, error)
    return false
  }
}

export async function GET(req: Request) {
  const startTime = Date.now()
  const results = {
    scanned: 0,
    tpHits: 0,
    slHits: 0,
    invalidations: 0,
    errors: 0,
  }

  try {
    const trades = await getOpenTrades()
    console.log(`[LIFECYCLE] Scan started: ${trades.length} open trades`)

    for (const trade of trades) {
      if (!isValidTradeFile(trade)) {
        console.error(`[LIFECYCLE] Invalid trade file: ${trade.id}`)
        results.errors++
        continue
      }

      results.scanned++
      trade.lastChecked = Math.floor(Date.now() / 1000)

      try {
        const price = await fetchMarketPrice(trade.symbol)
        if (!price) {
          console.warn(`[LIFECYCLE] Could not fetch price for ${trade.symbol}`)
          continue
        }

        const mid = price.mid

        // Stop Loss Check
        let slTriggered = false
        if (!trade.slHit) {
          if (trade.direction === 'BUY' && mid <= trade.stopLoss) {
            trade.slHit = true
            trade.status = 'CLOSED'
            trade.closedAt = Math.floor(Date.now() / 1000)
            trade.closeReason = 'SL'
            slTriggered = true
            results.slHits++
            console.log(
              `[LIFECYCLE] SL hit: ${trade.symbol} ${trade.direction} at ${mid.toFixed(2)} (SL: ${trade.stopLoss.toFixed(2)})`
            )
          } else if (trade.direction === 'SELL' && mid >= trade.stopLoss) {
            trade.slHit = true
            trade.status = 'CLOSED'
            trade.closedAt = Math.floor(Date.now() / 1000)
            trade.closeReason = 'SL'
            slTriggered = true
            results.slHits++
            console.log(
              `[LIFECYCLE] SL hit: ${trade.symbol} ${trade.direction} at ${mid.toFixed(2)} (SL: ${trade.stopLoss.toFixed(2)})`
            )
          }
        }

        // TP1 Check
        if (!trade.tp1Hit) {
          if (trade.direction === 'BUY' && mid >= trade.tp1) {
            trade.tp1Hit = true
            console.log(
              `[LIFECYCLE] TP1 hit: ${trade.symbol} ${trade.direction} at ${mid.toFixed(2)} (TP1: ${trade.tp1.toFixed(2)})`
            )
            results.tpHits++
            
            // Move SL to entry for breakeven protection
            trade.stopLoss = trade.entry
          } else if (trade.direction === 'SELL' && mid <= trade.tp1) {
            trade.tp1Hit = true
            console.log(
              `[LIFECYCLE] TP1 hit: ${trade.symbol} ${trade.direction} at ${mid.toFixed(2)} (TP1: ${trade.tp1.toFixed(2)})`
            )
            results.tpHits++
            
            // Move SL to entry for breakeven protection
            trade.stopLoss = trade.entry
          }
        }

        // TP2 Check
        if (!trade.tp2Hit) {
          if (trade.direction === 'BUY' && mid >= trade.tp2) {
            trade.tp2Hit = true
            trade.status = 'CLOSED'
            trade.closedAt = Math.floor(Date.now() / 1000)
            trade.closeReason = 'TP2'
            results.tpHits++
            console.log(
              `[LIFECYCLE] TP2 hit: ${trade.symbol} ${trade.direction} at ${mid.toFixed(2)} (TP2: ${trade.tp2.toFixed(2)})`
            )
          } else if (trade.direction === 'SELL' && mid <= trade.tp2) {
            trade.tp2Hit = true
            trade.status = 'CLOSED'
            trade.closedAt = Math.floor(Date.now() / 1000)
            trade.closeReason = 'TP2'
            results.tpHits++
            console.log(
              `[LIFECYCLE] TP2 hit: ${trade.symbol} ${trade.direction} at ${mid.toFixed(2)} (TP2: ${trade.tp2.toFixed(2)})`
            )
          }
        }

        // Structural Invalidation Check (only if not already closed by SL or TP2)
        if (!slTriggered && !trade.tp2Hit && !trade.invalidated) {
          const isInvalidated = await checkStructuralInvalidation(trade.symbol, trade.tier)
          if (isInvalidated) {
            trade.invalidated = true
            results.invalidations++
            console.log(`[LIFECYCLE] Structure invalidated: ${trade.symbol} ${trade.direction}`)
          }
        }

        // Persist updates
        await updateTrade(trade)
      } catch (tradeError) {
        console.error(`[LIFECYCLE] Error processing trade ${trade.id}:`, tradeError)
        results.errors++
        await updateTrade(trade) // Persist lastChecked timestamp even on error
      }
    }

    const elapsed = Date.now() - startTime
    console.log(`[LIFECYCLE] Scan complete in ${elapsed}ms: ${results.scanned} scanned, ${results.tpHits} TP hits, ${results.slHits} SL hits, ${results.invalidations} invalidations`)

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
      openTradeCount: trades.length,
    })
  } catch (error) {
    console.error('[LIFECYCLE] Scan error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
