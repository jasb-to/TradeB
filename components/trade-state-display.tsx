import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { TradeStateInfo } from "@/types/trading"

interface TradeStateDisplayProps {
  tradeState: TradeStateInfo | null
}

export function TradeStateDisplay({ tradeState }: TradeStateDisplayProps) {
  if (!tradeState) {
    return null
  }

  const getStateColor = (state: string) => {
    switch (state) {
      case "ACTIVE":
        return "text-blue-400"
      case "PULLBACK_HEALTHY":
        return "text-yellow-400"
      case "NEAR_INVALIDATION":
        return "text-orange-400"
      case "TP1_HIT":
        return "text-green-400"
      case "TP2_HIT":
        return "text-green-500 font-bold"
      case "STOPPED":
        return "text-red-500 font-bold"
      case "INVALIDATED":
        return "text-red-600 font-bold"
      default:
        return "text-gray-400"
    }
  }

  const getStateEmoji = (state: string) => {
    switch (state) {
      case "ACTIVE":
        return "📊"
      case "PULLBACK_HEALTHY":
        return "📉"
      case "NEAR_INVALIDATION":
        return "⚠️"
      case "TP1_HIT":
        return "✅"
      case "TP2_HIT":
        return "🎯"
      case "STOPPED":
        return "🛑"
      case "INVALIDATED":
        return "❌"
      default:
        return "❓"
    }
  }

  return (
    <Card className="bg-slate-900/40 border-slate-700/50">
      <CardHeader>
        <CardTitle className="text-sm font-mono">TRADE STATE</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{getStateEmoji(tradeState.state)}</span>
          <span className={`text-lg font-bold ${getStateColor(tradeState.state)}`}>
            {tradeState.state.replace(/_/g, " ")}
          </span>
        </div>

        <p className="text-sm text-slate-300">{tradeState.reason}</p>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-slate-400">Price Distance</p>
            <p className={tradeState.priceDistance >= 0 ? "text-green-400" : "text-red-400"}>
              {tradeState.priceDistance > 0 ? "+" : ""}
              {tradeState.priceDistance.toFixed(2)}
            </p>
          </div>

          <div>
            <p className="text-slate-400">To TP1</p>
            <p className={tradeState.percentToTP1 >= 100 ? "text-green-400" : "text-yellow-400"}>
              {tradeState.percentToTP1.toFixed(0)}%
            </p>
          </div>

          <div>
            <p className="text-slate-400">Pullback Depth</p>
            <p className="text-slate-300">{tradeState.pullbackDepth.toFixed(2)}</p>
          </div>

          <div>
            <p className="text-slate-400">To TP2</p>
            <p className={tradeState.percentToTP2 >= 100 ? "text-green-400" : "text-yellow-400"}>
              {tradeState.percentToTP2.toFixed(0)}%
            </p>
          </div>
        </div>

        {tradeState.invalidationRisk && (
          <div className="p-2 bg-orange-500/10 border border-orange-500/30 rounded">
            <p className="text-xs text-orange-300 font-mono">{tradeState.invalidationRisk}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
