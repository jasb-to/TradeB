import { NextResponse } from 'next/server'
import { getOpenTrades, getAllTrades } from '@/lib/trade-lifecycle'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') || 'open'

    let trades
    if (status === 'all') {
      trades = await getAllTrades()
    } else {
      trades = await getOpenTrades()
    }

    console.log(`[TRADES] Retrieved ${trades.length} ${status} trades`)

    // Calculate P&L for each trade if it has market data
    const enrichedTrades = trades.map(trade => ({
      ...trade,
      riskReward: trade.tp2 && trade.entry && trade.stopLoss 
        ? ((trade.tp2 - trade.entry) / Math.abs(trade.entry - trade.stopLoss)).toFixed(2)
        : null,
      daysOpen: Math.floor((Date.now() - trade.openedAt * 1000) / (1000 * 60 * 60 * 24)),
    }))

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      status,
      count: trades.length,
      trades: enrichedTrades,
    })
  } catch (error) {
    console.error('[TRADES] Error retrieving trades:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
