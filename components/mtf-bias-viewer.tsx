"use client"

import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown, Minus, AlertCircle } from "lucide-react"
import type { Signal } from "@/types/trading"

interface MTFBiasViewerProps {
  signal: Signal | null
}

export function MTFBiasViewer({ signal }: MTFBiasViewerProps) {
  // Get market state from signal.marketState
  const marketState = signal?.marketState
  
  console.log("[v0] MTFBiasViewer - signal:", { 
    hasSignal: !!signal, 
    hasMarketState: !!marketState,
    hasTimeframeAlignment: !!signal?.timeframeAlignment,
    alignment: signal?.timeframeAlignment 
  })
  
  // Determine trend direction from market state
  const getTrendLabel = () => {
    if (!marketState) return "ANALYZING..."
    if (marketState.isInTrend) {
      if (marketState.isTrendingUp) return "BULLISH"
      if (marketState.isTrendingDown) return "BEARISH"
      return "TRENDING"
    }
    if (marketState.isRanging) return "RANGING"
    return "NO TREND"
  }

  const getTrendIcon = () => {
    if (!marketState) return <Minus className="w-3 h-3" />
    if (marketState.isTrendingUp) return <TrendingUp className="w-3 h-3" />
    if (marketState.isTrendingDown) return <TrendingDown className="w-3 h-3" />
    return <Minus className="w-3 h-3" />
  }

  const getTrendColor = () => {
    if (!marketState) return "bg-gray-900/50 text-gray-300 border-gray-700/50"
    if (marketState.isTrendingUp) return "bg-green-950/50 text-green-200 border-green-700/50"
    if (marketState.isTrendingDown) return "bg-red-950/50 text-red-200 border-red-700/50"
    if (marketState.isRanging) return "bg-yellow-950/50 text-yellow-200 border-yellow-700/50"
    return "bg-gray-900/50 text-gray-300 border-gray-700/50"
  }

  // CANONICAL: Use timeframeAlignment from backend - no recalculation, no defaults
  const alignment = signal?.timeframeAlignment
  const timeframes = [
    { name: "DAILY", value: alignment?.daily },
    { name: "4H", value: alignment?.h4 },
    { name: "1H", value: alignment?.h1 },
    { name: "15M", value: alignment?.m15 },
    { name: "5M", value: alignment?.m5 },
  ]

  const getAlignmentColor = (state: string | undefined) => {
    if (!state || state === "NO_CLEAR_BIAS") return "bg-gray-900/50 text-gray-300 border-gray-700/50"
    if (state === "BULLISH") return "bg-green-950/50 text-green-200 border-green-700/50"
    if (state === "BEARISH") return "bg-red-950/50 text-red-200 border-red-700/50"
    return "bg-gray-900/50 text-gray-300 border-gray-700/50"
  }

  const getAlignmentIcon = (state: string | undefined) => {
    if (!state || state === "NO_CLEAR_BIAS") return <Minus className="w-3 h-3" />
    if (state === "BULLISH") return <TrendingUp className="w-3 h-3" />
    if (state === "BEARISH") return <TrendingDown className="w-3 h-3" />
    return <Minus className="w-3 h-3" />
  }

  const getAlignmentLabel = (state: string | undefined) => {
    if (!state) return "—"
    if (state === "NO_CLEAR_BIAS") return "No Clear Bias"
    return state
  }

  const getAlignmentTooltip = (state: string | undefined) => {
    if (state === "NO_CLEAR_BIAS") {
      return "No clear bias: EMA structure not confirmed. Bias requires close > EMA20 > EMA50 with RSI alignment. Strong momentum may exist without structural alignment."
    }
    if (state === "BULLISH") return "Bullish: Price above EMA20, EMA20 above EMA50, RSI above 50"
    if (state === "BEARISH") return "Bearish: Price below EMA20, EMA20 below EMA50, RSI below 50"
    return "Alignment data processing..."
  }

  return (
    <div className="space-y-3">
      {/* Multi-timeframe alignment badges - from canonical backend source */}
      <div className="flex flex-wrap gap-2">
        {timeframes.map((tf) => (
          <div key={tf.name} title={getAlignmentTooltip(tf.value)} className="cursor-help">
            <Badge
              className={`${getAlignmentColor(tf.value)} border font-mono text-xs px-2 py-1 flex items-center gap-1`}
            >
              {getAlignmentIcon(tf.value)}
              {tf.name} {getAlignmentLabel(tf.value)}
            </Badge>
          </div>
        ))}
      </div>

      {/* Market regime badge */}
      <Badge
        className={`${getTrendColor()} border font-mono text-sm px-3 py-2 flex items-center gap-2 w-full justify-center`}
      >
        {getTrendIcon()}
        {getTrendLabel()}
      </Badge>

      {/* Explanation section */}
      <div className="text-xs text-slate-400 p-2 bg-slate-900/30 rounded border border-slate-700/30 flex gap-2">
        <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
        <span>
          <strong>Bias requires confirmed EMA structure:</strong> Bias requires close {">"} EMA20 {">"} EMA50 with RSI alignment. Strong momentum or volatility may exist without clear structural bias. See higher-timeframe trend direction for context.
        </span>
      </div>
    </div>
  )
}
