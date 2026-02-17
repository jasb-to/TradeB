import React from 'react'
import { Signal, ActiveTrade } from "@/types/trading"

interface TradeStatusCardProps {
  signal?: Signal
  trade?: ActiveTrade
  mode: "STRICT" | "BALANCED" | "ADAPTIVE"
}

export const TradeStatusCard: React.FC<TradeStatusCardProps> = ({ signal, trade, mode }) => {
  const isNoTrade = signal?.type === "NO_TRADE"
  const isTradeActive = trade?.status === "ACTIVE"

  // Market state analysis
  const marketState = getMarketState(signal)
  const bias = getBias(signal)
  const breakoutDistance = getBreakoutDistance(signal)
  const adxValue = getADXValue(signal)
  const atrRegime = getATRRegime(signal)

  // Exit risk indicators
  const structuralRisk = getStructuralRisk(signal, trade)
  const momentumRisk = getMomentumRisk(signal, trade)
  const volatilityRisk = getVolatilityRisk(signal, trade)

  if (isNoTrade) {
    return (
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Trade Status - {mode}</h3>
        
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-gray-400 text-sm">Market State</label>
            <p className="text-white">{marketState}</p>
          </div>
          <div>
            <label className="text-gray-400 text-sm">Bias</label>
            <p className="text-white">{bias}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-gray-400 text-sm">Breakout Distance</label>
            <p className="text-white">{breakoutDistance}%</p>
          </div>
          <div>
            <label className="text-gray-400 text-sm">ADX</label>
            <p className="text-white">{adxValue}</p>
          </div>
        </div>

        <div>
          <label className="text-gray-400 text-sm">ATR Regime</label>
          <p className="text-white">{atrRegime}</p>
          <div className="mt-2 w-full bg-gray-600 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full" style={{ width: getATRPercentage(signal) }}></div>
          </div>
        </div>
      </div>
    )
  }

  if (isTradeActive) {
    const currentPrice = trade.entryPrice + (trade.direction === "LONG" ? 10 : -10) // Mock current price
    const rMultiple = calculateRMultiple(trade, currentPrice)

    return (
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Trade Status - {mode}</h3>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-gray-400 text-sm">Entry Price</label>
            <p className="text-white">${trade.entryPrice.toFixed(2)}</p>
          </div>
          <div>
            <label className="text-gray-400 text-sm">Current Price</label>
            <p className="text-white">${currentPrice.toFixed(2)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-gray-400 text-sm">R Multiple</label>
            <p className={`text-white font-semibold ${rMultiple > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {rMultiple.toFixed(2)}R
            </p>
          </div>
          <div>
            <label className="text-gray-400 text-sm">Unrealized P/L</label>
            <p className={`text-white font-semibold ${rMultiple > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {calculateUnrealizedPL(trade, currentPrice).toFixed(2)}%
            </p>
          </div>
          <div>
            <label className="text-gray-400 text-sm">Trailing Stop</label>
            <p className="text-white">${trade.stopLoss.toFixed(2)}</p>
          </div>
        </div>

        <div className="mb-4">
          <label className="text-gray-400 text-sm">Exit Risk Indicators</label>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <RiskIndicator level={structuralRisk} label="Structural" />
            <RiskIndicator level={momentumRisk} label="Momentum" />
            <RiskIndicator level={volatilityRisk} label="Volatility" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Trade Status - {mode}</h3>
      <p className="text-gray-400">Loading trade data...</p>
    </div>
  )
}

// Helper functions
function getMarketState(signal?: Signal): string {
  if (!signal) return "Unknown"
  const trend = signal.mtfBias?.daily || "NEUTRAL"
  return trend === "LONG" ? "Trending Bullish" : trend === "SHORT" ? "Trending Bearish" : "Ranging"
}

function getBias(signal?: Signal): string {
  if (!signal) return "Neutral"
  const trend = signal.mtfBias?.daily || "NEUTRAL"
  return trend === "LONG" ? "Bullish" : trend === "SHORT" ? "Bearish" : "Neutral"
}

function getBreakoutDistance(signal?: Signal): number {
  if (!signal || !signal.indicators?.atr) return 0
  const atr = signal.indicators.atr
  return (atr / signal.entryPrice) * 100
}

function getADXValue(signal?: Signal): number {
  return signal?.indicators?.adx || 0
}

function getATRRegime(signal?: Signal): string {
  const adx = getADXValue(signal)
  if (adx < 15) return "Compressed"
  if (adx < 25) return "Normal"
  return "Expanding"
}

function getATRPercentage(signal?: Signal): string {
  const adx = getADXValue(signal)
  if (adx < 15) return "20%"
  if (adx < 25) return "60%"
  return "100%"
}

function getStructuralRisk(signal?: Signal, trade?: ActiveTrade): number {
  if (!signal || !trade) return 0
  // Mock structural risk assessment
  return Math.random() > 0.7 ? 2 : Math.random() > 0.4 ? 1 : 0
}

function getMomentumRisk(signal?: Signal, trade?: ActiveTrade): number {
  if (!signal || !trade) return 0
  // Mock momentum risk assessment
  return Math.random() > 0.6 ? 2 : Math.random() > 0.3 ? 1 : 0
}

function getVolatilityRisk(signal?: Signal, trade?: ActiveTrade): number {
  if (!signal || !trade) return 0
  // Mock volatility risk assessment
  return Math.random() > 0.5 ? 2 : Math.random() > 0.2 ? 1 : 0
}

function calculateRMultiple(trade: ActiveTrade, currentPrice: number): number {
  const entryPrice = trade.entryPrice
  const stopLoss = trade.stopLoss
  const riskAmount = Math.abs(entryPrice - stopLoss)

  if (trade.direction === "LONG") {
    return (currentPrice - entryPrice) / riskAmount
  } else {
    return (entryPrice - currentPrice) / riskAmount
  }
}

function calculateUnrealizedPL(trade: ActiveTrade, currentPrice: number): number {
  const entryPrice = trade.entryPrice
  const riskAmount = Math.abs(entryPrice - trade.stopLoss)

  if (trade.direction === "LONG") {
    return ((currentPrice - entryPrice) / riskAmount) * 100
  } else {
    return ((entryPrice - currentPrice) / riskAmount) * 100
  }
}

interface RiskIndicatorProps {
  level: number
  label: string
}

const RiskIndicator: React.FC<RiskIndicatorProps> = ({ level, label }) => {
  const colors = ['text-green-400', 'text-yellow-400', 'text-red-400']
  const labels = ['Low', 'Medium', 'High']

  return (
    <div className="text-center">
      <div className={`text-sm font-medium ${colors[level]}`}>{labels[level]}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  )
}