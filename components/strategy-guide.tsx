"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export function StrategyGuide() {
  return (
    <Card className="border-zinc-800 bg-black/40">
      <CardHeader>
        <CardTitle className="text-silver-400">BREAKOUT CHANDELIER Strategy</CardTitle>
        <CardDescription className="text-zinc-400">
          Premium swing trading strategy for 4H/8H/Daily timeframes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 shrink-0">MACRO</Badge>
            <div>
              <p className="text-sm text-silver-300 font-medium">Daily & 8H Alignment (25pts)</p>
              <p className="text-xs text-zinc-500">Both timeframes must show same directional bias</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 shrink-0">ENTRY</Badge>
            <div>
              <p className="text-sm text-silver-300 font-medium">1H Breakout Trigger (30pts)</p>
              <p className="text-xs text-zinc-500">Price breaks above 5-candle high with momentum</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 shrink-0">CONFIRM</Badge>
            <div>
              <p className="text-sm text-silver-300 font-medium">15M + 5M Confirmation (35pts)</p>
              <p className="text-xs text-zinc-500">RSI 50-70 on 15m, price above EMA20 on 5m</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 shrink-0">FILTER</Badge>
            <div>
              <p className="text-sm text-silver-300 font-medium">Volatility & Trend (30pts)</p>
              <p className="text-xs text-zinc-500">ATR above 3.0, ADX above 21</p>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-zinc-800">
          <p className="text-xs text-zinc-400 leading-relaxed">
            <strong className="text-silver-400">Exit Strategy:</strong> Chandelier Stop (3x ATR trailing) for stop loss.
            TP1 at first resistance/Fib 0.618. TP2 at second resistance/Fib 1.618 for maximum swing profits.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
