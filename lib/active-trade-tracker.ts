import type { Signal, ActiveTrade } from "@/types/trading"

interface TradeEntry {
  trade: ActiveTrade
  initialSignal: Signal
  lastUpdate: number
  slBreached: boolean
  tp1Achieved: boolean
  tp2Achieved: boolean
  trailingActive: boolean
  trailingStopLevel: number
  manualExit: boolean
}

const TRADE_HISTORY: Map<string, TradeEntry[]> = new Map()

export const ActiveTradeTracker = {
  // Create a new active trade from a signal
  createTradeFromSignal: (signal: Signal, symbol: string): ActiveTrade => {
    const trade: ActiveTrade = {
      id: `${symbol}_${Date.now()}`,
      direction: signal.direction as "LONG" | "SHORT",
      entryPrice: signal.entryPrice || 0,
      stopLoss: signal.stopLoss || 0,
      takeProfit1: signal.takeProfit1 || 0,
      takeProfit2: signal.takeProfit2 || 0,
      entryTime: Date.now(),
      status: "ACTIVE",
      tp1Hit: false,
      tp2Hit: false,
      slHit: false,
    }
    return trade
  },

  // Add a new trade to tracking
  addTrade: (trade: ActiveTrade, signal: Signal, symbol: string): void => {
    if (!TRADE_HISTORY.has(symbol)) {
      TRADE_HISTORY.set(symbol, [])
    }

    const entry: TradeEntry = {
      trade,
      initialSignal: signal,
      lastUpdate: Date.now(),
      slBreached: false,
      tp1Achieved: false,
      tp2Achieved: false,
      trailingActive: false,
      trailingStopLevel: trade.stopLoss,
      manualExit: false,
    }

    TRADE_HISTORY.get(symbol)!.push(entry)
    console.log(`[v0] ACTIVE TRADE: ${trade.id} created at $${trade.entryPrice} for ${symbol}`)
  },

  // Update trade status based on current price - with trailing stop after TP1
  updateTradePrice: (currentPrice: number, symbol: string): void => {
    const trades = TRADE_HISTORY.get(symbol)
    if (!trades) return

    for (const entry of trades) {
      if (entry.trade.status === "ACTIVE" || entry.trade.status === "TP1_HIT") {
        const trade = entry.trade
        const isLong = trade.direction === "LONG"

        // Check TP1 first (only once)
        if (!entry.tp1Achieved) {
          if ((isLong && currentPrice >= trade.takeProfit1) || (!isLong && currentPrice <= trade.takeProfit1)) {
            entry.tp1Achieved = true
            entry.trade.tp1Hit = true
            entry.trade.status = "TP1_HIT"
            // Activate trailing stop: move SL to TP1, then trail from there
            entry.trailingActive = true
            entry.trailingStopLevel = trade.takeProfit1
            console.log(`[v0] TRADE TP1 HIT: ${trade.id} - Price $${currentPrice} | Trailing stop activated at $${trade.takeProfit1}`)
          }
        }

        // Trail the stop loss after TP1 is hit
        if (entry.trailingActive && entry.tp1Achieved && !entry.tp2Achieved && !entry.slBreached) {
          const trailDistance = Math.abs(trade.takeProfit1 - trade.entryPrice)
          if (isLong) {
            const newStop = Math.max(currentPrice - trailDistance, entry.trailingStopLevel)
            if (newStop > entry.trailingStopLevel) {
              entry.trailingStopLevel = newStop
            }
            // Check if trailing SL is hit
            if (currentPrice <= entry.trailingStopLevel) {
              entry.slBreached = true
              entry.trade.status = "SL_HIT"
              entry.trade.slHit = true
              entry.trade.stopLoss = entry.trailingStopLevel
              console.log(`[v0] TRADE TRAILING SL HIT: ${trade.id} - Price $${currentPrice} <= Trailing SL $${entry.trailingStopLevel}`)
            }
          } else {
            const newStop = Math.min(currentPrice + trailDistance, entry.trailingStopLevel)
            if (newStop < entry.trailingStopLevel) {
              entry.trailingStopLevel = newStop
            }
            if (currentPrice >= entry.trailingStopLevel) {
              entry.slBreached = true
              entry.trade.status = "SL_HIT"
              entry.trade.slHit = true
              entry.trade.stopLoss = entry.trailingStopLevel
              console.log(`[v0] TRADE TRAILING SL HIT: ${trade.id} - Price $${currentPrice} >= Trailing SL $${entry.trailingStopLevel}`)
            }
          }
        }

        // Check original SL if trailing not active yet
        if (!entry.trailingActive && !entry.slBreached) {
          if ((isLong && currentPrice <= trade.stopLoss) || (!isLong && currentPrice >= trade.stopLoss)) {
            entry.slBreached = true
            entry.trade.status = "SL_HIT"
            entry.trade.slHit = true
            console.log(`[v0] TRADE SL HIT: ${trade.id} - Price $${currentPrice}`)
          }
        }

        // Check TP2
        if (!entry.tp2Achieved && !entry.slBreached) {
          if ((isLong && currentPrice >= trade.takeProfit2) || (!isLong && currentPrice <= trade.takeProfit2)) {
            entry.tp2Achieved = true
            entry.trade.status = "TP2_HIT"
            entry.trade.tp2Hit = true
            console.log(`[v0] TRADE TP2 HIT: ${trade.id} - Price $${currentPrice} | Full exit`)
          }
        }

        entry.lastUpdate = Date.now()
      }
    }
  },

  // Manual exit endpoint
  manualExitTrade: (symbol: string): { success: boolean; trade?: ActiveTrade; exitPrice?: number } => {
    const trades = TRADE_HISTORY.get(symbol)
    if (!trades) return { success: false }

    const entry = trades.find((e) => e.trade.status === "ACTIVE" || e.trade.status === "TP1_HIT")
    if (!entry) return { success: false }

    entry.manualExit = true
    entry.trade.status = "MANUAL_EXIT"
    entry.lastUpdate = Date.now()
    console.log(`[v0] MANUAL EXIT: ${entry.trade.id} - Trade closed by user`)

    return { success: true, trade: entry.trade, exitPrice: entry.trade.takeProfit1 }
  },

  // Get active trades for a symbol
  getActiveTrades: (symbol: string): ActiveTrade[] => {
    const trades = TRADE_HISTORY.get(symbol) || []
    return trades
      .filter((e) => e.trade.status === "ACTIVE" || e.trade.status === "TP1_HIT")
      .map((e) => e.trade)
  },

  // Get current trailing stop level
  getTrailingStopLevel: (symbol: string): number | undefined => {
    const trades = TRADE_HISTORY.get(symbol) || []
    const entry = trades.find((e) => e.trailingActive)
    return entry?.trailingStopLevel
  },

  // Get all trades (including closed) for a symbol
  getAllTrades: (symbol: string): ActiveTrade[] => {
    const trades = TRADE_HISTORY.get(symbol) || []
    return trades.map((e) => e.trade)
  },

  // Get closed trades (TP/SL hit)
  getClosedTrades: (symbol: string): ActiveTrade[] => {
    const trades = TRADE_HISTORY.get(symbol) || []
    return trades
      .filter((e) => e.trade.status !== "ACTIVE")
      .map((e) => e.trade)
  },

  // Get trades that just hit TP1 (for scaling exit alert)
  getTP1Hits: (symbol: string): ActiveTrade[] => {
    const trades = TRADE_HISTORY.get(symbol) || []
    return trades
      .filter((e) => e.tp1Achieved && !e.tp2Achieved && e.trade.status === "TP1_HIT")
      .map((e) => e.trade)
  },

  // Get trades that just hit SL
  getSLHits: (symbol: string): ActiveTrade[] => {
    const trades = TRADE_HISTORY.get(symbol) || []
    return trades
      .filter((e) => e.slBreached)
      .map((e) => e.trade)
  },

  // Clear history for a symbol
  clearHistory: (symbol?: string): void => {
    if (symbol) {
      TRADE_HISTORY.delete(symbol)
    } else {
      TRADE_HISTORY.clear()
    }
  },

  // Track trade closure and report result back to state machine
  reportTradeResult: (symbol: string, tradeId: string): { result: "WIN" | "LOSS" | "OPEN"; trade?: ActiveTrade } => {
    const trades = TRADE_HISTORY.get(symbol) || []
    const tradeEntry = trades.find((e) => e.trade.id === tradeId)

    if (!tradeEntry) {
      return { result: "OPEN" }
    }

    const trade = tradeEntry.trade

    // Trade is closed if TP2 or SL was hit
    if (trade.status === "TP2_HIT" || trade.status === "MANUAL_EXIT") {
      return { result: "WIN", trade }
    }

    if (trade.status === "SL_HIT") {
      return { result: "LOSS", trade }
    }

    return { result: "OPEN", trade }
  },
  getStats: (symbol: string) => {
    const trades = TRADE_HISTORY.get(symbol) || []
    const closed = trades.filter((e) => e.trade.status !== "ACTIVE" && e.trade.status !== "TP1_HIT")
    const slHits = closed.filter((e) => e.trade.slHit)
    const tp1Hits = trades.filter((e) => e.tp1Achieved)
    const tp2Hits = closed.filter((e) => e.trade.tp2Hit)

    return {
      totalTrades: trades.length,
      activeTrades: trades.filter((e) => e.trade.status === "ACTIVE" || e.trade.status === "TP1_HIT").length,
      closedTrades: closed.length,
      slHits: slHits.length,
      tp1Hits: tp1Hits.length,
      tp2Hits: tp2Hits.length,
      winRate: closed.length > 0 ? ((tp2Hits.length / closed.length) * 100).toFixed(1) : "0",
    }
  },
}
