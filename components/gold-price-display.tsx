"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Signal } from "@/types/trading"
import { TrendingUp, Database, Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface GoldPriceDisplayProps {
  signal: Signal | null
  marketClosed?: boolean
}

export function GoldPriceDisplay({ signal, marketClosed = false }: GoldPriceDisplayProps) {
  const currentPrice = signal?.lastCandle?.close ?? 0
  
  // Use actual market status from API, not just presence of data
  const isMarketOpen = !marketClosed
  
  // Data source - always OANDA for this trading system
  const dataSource = "OANDA"
  const dataTimestamp = signal?.lastCandle?.timestamp ? new Date(signal.lastCandle.timestamp).toLocaleTimeString() : "—"

  if (!currentPrice) {
    return (
      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-400">Gold Price</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-slate-400">Loading price...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-gradient-to-br from-amber-950/20 to-slate-900/50 border-amber-700/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-amber-300 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            XAU/USD Price
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-xs ${isMarketOpen ? "bg-green-950/30 text-green-200 border-green-700/50" : "bg-red-950/30 text-red-200 border-red-700/50"}`}>
              <div className={`w-2 h-2 rounded-full mr-1 ${isMarketOpen ? "bg-green-400" : "bg-red-400"}`} />
              {isMarketOpen ? "MARKET OPEN" : "MARKET CLOSED"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-4xl font-bold text-amber-400">
          ${currentPrice.toFixed(2)}
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-400 border-t border-slate-700/30 pt-3">
          <div className="flex items-center gap-1">
            <Database className="w-3 h-3" />
            <span>Source: {dataSource}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>{dataTimestamp}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
