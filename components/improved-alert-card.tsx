'use client';

import React from "react"
import type { Signal } from "@/types/trading"
import type { MarketState, IndicatorVerification } from "@/lib/market-state-monitor"
import type { TradeRiskAssessment } from "@/lib/exit-signal-manager"

interface ImprovedAlertCardProps {
  signal: Signal & { marketState?: MarketState; indicatorVerification?: IndicatorVerification }
  tradeRisk?: TradeRiskAssessment
  symbol: string
  onCloseAlert?: () => void
}

export function ImprovedAlertCard({
  signal,
  tradeRisk,
  symbol,
  onCloseAlert,
}: ImprovedAlertCardProps) {
  const marketState = signal.marketState
  const indicators = signal.indicators
  const verification = signal.indicatorVerification

  return (
    <div className="border-2 border-gray-700 rounded-lg p-4 bg-gray-900 space-y-4">
      {/* Alert Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-xl font-bold">
            {signal.type === "ENTRY" && `📈 ${signal.direction} Entry Signal`}
            {signal.type === "EXIT" && "🚪 EXIT SIGNAL"}
            {signal.type === "NO_TRADE" && "⏸️ No Trade"}
          </h3>
          <p className="text-sm text-gray-400">
            {symbol} • Confidence: {signal.confidence}%
          </p>
        </div>
        {signal.type === "EXIT" && (
          <div className="text-right">
            <span className="px-3 py-1 bg-red-900 text-red-100 rounded-full text-sm font-bold">
              URGENT
            </span>
          </div>
        )}
      </div>

      {/* Market State Display */}
      {marketState && (
        <div className="bg-gray-800 rounded p-3 space-y-2">
          <h4 className="font-semibold text-sm uppercase tracking-wide">Market State</h4>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="space-y-1">
              <p className="text-gray-400">Regime</p>
              <p className="font-bold text-blue-400">{marketState.regime}</p>
            </div>

            <div className="space-y-1">
              <p className="text-gray-400">Bias</p>
              <p className={`font-bold ${marketState.bias === "BULLISH" ? "text-green-400" : marketState.bias === "BEARISH" ? "text-red-400" : "text-yellow-400"}`}>
                {marketState.bias}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-gray-400">Volatility</p>
              <p className="font-bold text-purple-400">{marketState.volatility}</p>
            </div>

            <div className="space-y-1">
              <p className="text-gray-400">Momentum</p>
              <p className="font-bold text-orange-400">{marketState.momentum}</p>
            </div>

            <div className="space-y-1">
              <p className="text-gray-400">Strength</p>
              <div className="flex items-center gap-2">
                <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${marketState.strength >= 7 ? "bg-green-500" : marketState.strength >= 5 ? "bg-yellow-500" : "bg-red-500"}`}
                    style={{ width: `${(marketState.strength / 10) * 100}%` }}
                  />
                </div>
                <span className="font-bold">{marketState.strength.toFixed(1)}/10</span>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-gray-400">Risk Level</p>
              <p className={`font-bold ${marketState.riskLevel === "HIGH" ? "text-red-400" : marketState.riskLevel === "MEDIUM" ? "text-yellow-400" : "text-green-400"}`}>
                {marketState.riskLevel}
              </p>
            </div>
          </div>

          {/* Signal Validity Checks */}
          <div className="pt-2 border-t border-gray-700 grid grid-cols-2 gap-2 text-xs">
            {Object.entries(marketState.signals).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2">
                <span className={value ? "text-green-400" : "text-red-400"}>
                  {value ? "✓" : "✗"}
                </span>
                <span className="text-gray-400 capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Indicator Values */}
      {indicators && (
        <div className="bg-gray-800 rounded p-3 space-y-2">
          <h4 className="font-semibold text-sm uppercase tracking-wide">Indicators</h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="space-y-1">
              <p className="text-gray-400">ADX</p>
              <p className={`font-bold ${(indicators.adx || 0) >= 25 ? "text-green-400" : (indicators.adx || 0) >= 20 ? "text-yellow-400" : "text-red-400"}`}>
                {(indicators.adx || 0).toFixed(1)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-gray-400">ATR</p>
              <p className="font-bold text-blue-400">{(indicators.atr || 0).toFixed(2)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-gray-400">RSI</p>
              <p className={`font-bold ${(indicators.rsi || 50) > 60 ? "text-green-400" : (indicators.rsi || 50) < 40 ? "text-red-400" : "text-gray-300"}`}>
                {(indicators.rsi || 50).toFixed(1)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-gray-400">StochRSI</p>
              <p className={`font-bold ${(indicators.stochRSI || 50) > 70 ? "text-green-400" : (indicators.stochRSI || 50) < 30 ? "text-red-400" : "text-gray-300"}`}>
                {(indicators.stochRSI || 50).toFixed(1)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-gray-400">VWAP</p>
              <p className="font-bold text-purple-400">{(indicators.vwap || 0).toFixed(2)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Indicator Verification */}
      {verification && (
        <div className="bg-gray-800 rounded p-3 space-y-2">
          <h4 className="font-semibold text-sm uppercase tracking-wide">
            Indicator Verification{" "}
            <span className={verification.verification.allValid ? "text-green-400" : "text-red-400"}>
              {verification.confidence.toFixed(0)}%
            </span>
          </h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {Object.entries(verification.verification).map(([key, value]) => {
              if (key === "allValid") return null
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className={value ? "text-green-400" : "text-red-400"}>
                    {value ? "✓" : "✗"}
                  </span>
                  <span className="text-gray-400 capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
                </div>
              )
            })}
          </div>
          {verification.deviations.length > 0 && (
            <div className="pt-2 border-t border-gray-700 space-y-1">
              {verification.deviations.map((dev, i) => (
                <p key={i} className="text-xs text-orange-400">
                  ⚠️ {dev}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Trade Risk Assessment */}
      {tradeRisk && (
        <div className="bg-gray-800 rounded p-3 space-y-2">
          <h4 className="font-semibold text-sm uppercase tracking-wide">
            Trade Risk Status
            <span
              className={`ml-2 px-2 py-1 rounded text-xs font-bold ${
                tradeRisk.riskStatus === "CRITICAL"
                  ? "bg-red-900 text-red-100"
                  : tradeRisk.riskStatus === "WARNING"
                    ? "bg-orange-900 text-orange-100"
                    : tradeRisk.riskStatus === "CAUTION"
                      ? "bg-yellow-900 text-yellow-100"
                      : "bg-green-900 text-green-100"
              }`}
            >
              {tradeRisk.riskStatus}
            </span>
          </h4>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="space-y-1">
              <p className="text-gray-400">P&L</p>
              <p className={`font-bold ${tradeRisk.pnlPercent >= 0 ? "text-green-400" : "text-red-400"}`}>
                {tradeRisk.pnlPercent > 0 ? "+" : ""}
                {tradeRisk.pnlPercent.toFixed(2)}%
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-gray-400">To SL</p>
              <p className="font-bold text-orange-400">
                {tradeRisk.distanceToSLPercent.toFixed(1)}%
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-gray-400">To TP1</p>
              <p className="font-bold text-blue-400">
                {tradeRisk.distanceToTP1Percent.toFixed(1)}%
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-gray-700">
            <p className="text-sm font-semibold text-gray-300 mb-1">Recommendation</p>
            <p className="text-xs text-gray-400">{tradeRisk.recommendation}</p>
          </div>
        </div>
      )}

      {/* Warnings */}
      {marketState && marketState.warnings.length > 0 && (
        <div className="bg-red-900/30 border border-red-700 rounded p-3 space-y-1">
          <h4 className="font-semibold text-sm text-red-300 uppercase">Warnings</h4>
          {marketState.warnings.map((warning, i) => (
            <p key={i} className="text-xs text-red-200">
              {warning}
            </p>
          ))}
        </div>
      )}

      {/* Recommendations */}
      {marketState && marketState.recommendations.length > 0 && (
        <div className="bg-green-900/30 border border-green-700 rounded p-3 space-y-1">
          <h4 className="font-semibold text-sm text-green-300 uppercase">Recommendations</h4>
          {marketState.recommendations.map((rec, i) => (
            <p key={i} className="text-xs text-green-200">
              {rec}
            </p>
          ))}
        </div>
      )}

      {/* Trade Details */}
      {signal.type === "ENTRY" && (
        <div className="bg-gray-800 rounded p-3 space-y-2">
          <h4 className="font-semibold text-sm uppercase tracking-wide">Trade Setup</h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Entry</span>
              <span className="font-bold text-green-400">${(signal.entryPrice || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Stop Loss</span>
              <span className="font-bold text-red-400">${(signal.stopLoss || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">TP1</span>
              <span className="font-bold text-blue-400">${(signal.takeProfit1 || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">TP2</span>
              <span className="font-bold text-purple-400">${(signal.takeProfit2 || 0).toFixed(2)}</span>
            </div>
            {signal.riskReward && (
              <div className="flex justify-between pt-1 border-t border-gray-700">
                <span className="text-gray-400">Risk:Reward</span>
                <span className="font-bold text-yellow-400">{signal.riskReward.toFixed(2)}:1</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Strategy Info */}
      {signal.strategy && (
        <div className="bg-gray-800 rounded p-3 space-y-2 text-sm">
          <h4 className="font-semibold uppercase tracking-wide">Strategy</h4>
          <p className="text-gray-300">{signal.strategy}</p>
          {signal.reasons && signal.reasons.length > 0 && (
            <ul className="list-disc list-inside space-y-1 text-xs text-gray-400">
              {signal.reasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Close Button */}
      {onCloseAlert && (
        <button
          onClick={onCloseAlert}
          className="w-full py-2 px-3 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded font-semibold text-sm transition"
        >
          Dismiss Alert
        </button>
      )}
    </div>
  )
}
