"use client"

import type { Candle } from "@/types/trading"
import { useMemo } from "react"

interface SimpleChartProps {
  candles: Candle[]
  entryPrice?: number
  stopLoss?: number
  takeProfit?: number
  takeProfit1?: number
  takeProfit2?: number
  chandelierStop?: number
}

export function SimpleChart({
  candles,
  entryPrice,
  stopLoss,
  takeProfit,
  takeProfit1,
  takeProfit2,
  chandelierStop,
}: SimpleChartProps) {
  const { minPrice, maxPrice, priceRange, chartData } = useMemo(() => {
    if (!candles.length) return { minPrice: 0, maxPrice: 0, priceRange: 0, chartData: [] }

    const prices = candles.flatMap((c) => [c.high, c.low])
    if (entryPrice && typeof entryPrice === "number" && !isNaN(entryPrice)) prices.push(entryPrice)
    if (stopLoss && typeof stopLoss === "number" && !isNaN(stopLoss)) prices.push(stopLoss)
    if (takeProfit && typeof takeProfit === "number" && !isNaN(takeProfit)) prices.push(takeProfit)
    if (takeProfit1 && typeof takeProfit1 === "number" && !isNaN(takeProfit1)) prices.push(takeProfit1)
    if (takeProfit2 && typeof takeProfit2 === "number" && !isNaN(takeProfit2)) prices.push(takeProfit2)
    if (chandelierStop && typeof chandelierStop === "number" && !isNaN(chandelierStop)) prices.push(chandelierStop)

    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const range = max - min

    const padding = Math.max(range * 0.01, 1)

    const data = candles.map((candle, i) => {
      const x = (i / (candles.length - 1)) * 100
      const yHigh = ((candle.high - (min - padding)) / (range + padding * 2)) * 100
      const yLow = ((candle.low - (min - padding)) / (range + padding * 2)) * 100
      const yOpen = ((candle.open - (min - padding)) / (range + padding * 2)) * 100
      const yClose = ((candle.close - (min - padding)) / (range + padding * 2)) * 100

      return { x, yHigh, yLow, yOpen, yClose, bullish: candle.close > candle.open }
    })

    return { minPrice: min - padding, maxPrice: max + padding, priceRange: range + padding * 2, chartData: data }
  }, [candles, entryPrice, stopLoss, takeProfit, takeProfit1, takeProfit2, chandelierStop])

  const getY = (price: number) => {
    if (!price || typeof price !== "number" || isNaN(price) || priceRange === 0) {
      return 50 // Return middle of chart if invalid
    }
    const y = 100 - ((price - minPrice) / priceRange) * 100
    return isNaN(y) ? 50 : y
  }

  const candleWidth = Math.max(0.8, Math.min(2.5, 200 / candles.length))

  return (
    <div className="relative w-full h-[600px] bg-black rounded-lg overflow-hidden border border-primary/30">
      <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {/* Grid lines */}
        <line x1="0" y1="20" x2="100" y2="20" stroke="#52525b" opacity="0.15" strokeWidth="0.15" />
        <line x1="0" y1="40" x2="100" y2="40" stroke="#52525b" opacity="0.15" strokeWidth="0.15" />
        <line x1="0" y1="60" x2="100" y2="60" stroke="#52525b" opacity="0.15" strokeWidth="0.15" />
        <line x1="0" y1="80" x2="100" y2="80" stroke="#52525b" opacity="0.15" strokeWidth="0.15" />

        {/* Candles */}
        {chartData.map((candle, i) => (
          <g key={i}>
            <line
              x1={candle.x}
              y1={100 - candle.yHigh}
              x2={candle.x}
              y2={100 - candle.yLow}
              stroke={candle.bullish ? "#10b981" : "#ef4444"}
              strokeWidth="0.8"
              opacity="1"
            />
            <rect
              x={candle.x - candleWidth / 2}
              y={Math.min(100 - candle.yOpen, 100 - candle.yClose)}
              width={candleWidth}
              height={Math.max(Math.abs(candle.yClose - candle.yOpen), 1.0)}
              fill={candle.bullish ? "#10b981" : "#ef4444"}
              opacity="1"
            />
          </g>
        ))}

        {/* Entry Price Line */}
        {entryPrice && typeof entryPrice === "number" && !isNaN(entryPrice) && (
          <line
            x1="0"
            y1={getY(entryPrice)}
            x2="100"
            y2={getY(entryPrice)}
            stroke="#3b82f6"
            strokeWidth="0.5"
            strokeDasharray="2,1"
            opacity="0.95"
          />
        )}

        {/* Stop Loss Line */}
        {stopLoss && typeof stopLoss === "number" && !isNaN(stopLoss) && (
          <line
            x1="0"
            y1={getY(stopLoss)}
            x2="100"
            y2={getY(stopLoss)}
            stroke="#ef4444"
            strokeWidth="0.5"
            strokeDasharray="2,1"
            opacity="0.95"
          />
        )}

        {/* TP1 Line */}
        {takeProfit1 && typeof takeProfit1 === "number" && !isNaN(takeProfit1) && (
          <line
            x1="0"
            y1={getY(takeProfit1)}
            x2="100"
            y2={getY(takeProfit1)}
            stroke="#10b981"
            strokeWidth="0.5"
            strokeDasharray="1,1"
            opacity="0.95"
          />
        )}

        {/* TP2 Line */}
        {takeProfit2 && typeof takeProfit2 === "number" && !isNaN(takeProfit2) && (
          <line
            x1="0"
            y1={getY(takeProfit2)}
            x2="100"
            y2={getY(takeProfit2)}
            stroke="#22c55e"
            strokeWidth="0.5"
            strokeDasharray="1,1"
            opacity="0.95"
          />
        )}

        {/* Chandelier Stop Line */}
        {chandelierStop && typeof chandelierStop === "number" && !isNaN(chandelierStop) && (
          <line
            x1="0"
            y1={getY(chandelierStop)}
            x2="100"
            y2={getY(chandelierStop)}
            stroke="#c0c0c0"
            strokeWidth="0.4"
            opacity="0.8"
          />
        )}
      </svg>

      <div className="absolute top-3 right-3 bg-black/95 backdrop-blur-sm border border-primary/30 p-3 rounded-lg text-xs space-y-1.5">
        {entryPrice && typeof entryPrice === "number" && (
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-blue-500" />
            <span className="text-gray-300">Entry ${entryPrice.toFixed(2)}</span>
          </div>
        )}
        {stopLoss && typeof stopLoss === "number" && (
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-red-500" />
            <span className="text-gray-300">Stop ${stopLoss.toFixed(2)}</span>
          </div>
        )}
        {takeProfit1 && typeof takeProfit1 === "number" && (
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-emerald-500" />
            <span className="text-gray-300">TP1 ${takeProfit1.toFixed(2)}</span>
          </div>
        )}
        {takeProfit2 && typeof takeProfit2 === "number" && (
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-green-500" />
            <span className="text-gray-300">TP2 ${takeProfit2.toFixed(2)}</span>
          </div>
        )}
        {chandelierStop && typeof chandelierStop === "number" && (
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-gray-400" />
            <span className="text-gray-300">Chandelier ${chandelierStop.toFixed(2)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
