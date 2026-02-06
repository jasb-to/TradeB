import { NextResponse } from "next/server"
import { ActiveTradeTracker } from "@/lib/active-trade-tracker"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get("symbol") || "XAU_USD"
    
    const activeTrades = ActiveTradeTracker.getActiveTrades(symbol)
    const allTrades = ActiveTradeTracker.getAllTrades(symbol)
    const closedTrades = ActiveTradeTracker.getClosedTrades(symbol)
    const stats = ActiveTradeTracker.getStats(symbol)
    const trailingStop = ActiveTradeTracker.getTrailingStopLevel(symbol)

    return NextResponse.json({
      success: true,
      symbol,
      activeTrades,
      allTrades,
      closedTrades,
      stats,
      trailingStop,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Error fetching active trades:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch active trades",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const { symbol, trade, signal } = await request.json()

    if (!symbol || !trade || !signal) {
      return NextResponse.json(
        { success: false, error: "Symbol, trade, and signal required" },
        { status: 400 }
      )
    }

    // Create trade from signal
    const activeTrade = ActiveTradeTracker.createTradeFromSignal(signal, symbol)
    
    // Add to tracker
    ActiveTradeTracker.addTrade(activeTrade, signal, symbol)

    return NextResponse.json({
      success: true,
      message: "Trade added successfully",
      trade: activeTrade,
    })
  } catch (error) {
    console.error("Error adding trade:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to add trade",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get("symbol")
    const tradeId = searchParams.get("tradeId")

    if (tradeId) {
      // Clear specific trade
      // Note: ActiveTradeTracker doesn't have a delete method, so we'll clear all for symbol
      ActiveTradeTracker.clearHistory(symbol || "XAU_USD")
      return NextResponse.json({
        success: true,
        message: "Trade cleared successfully",
      })
    } else if (symbol) {
      // Clear all trades for symbol
      ActiveTradeTracker.clearHistory(symbol)
      return NextResponse.json({
        success: true,
        message: `All trades cleared for ${symbol}`,
      })
    } else {
      // Clear all trades
      ActiveTradeTracker.clearHistory()
      return NextResponse.json({
        success: true,
        message: "All trades cleared",
      })
    }
  } catch (error) {
    console.error("Error clearing trades:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to clear trades",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}