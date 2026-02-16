"use client"

import React from "react"
import type { Signal } from "@/types/trading"

interface TradeStatusCardProps {
  signal: Signal | null
  symbol: string
  mode: "STRICT" | "BALANCED" | "ADAPTIVE"
}

export function TradeStatusCard({ signal, symbol, mode }: TradeStatusCardProps) {
  if (!signal) {
    return (
      <div className="w-full max-w-md border border-slate-200 rounded-lg p-4 bg-slate-50">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{symbol}</h2>
          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
            {mode}
          </span>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Market State</p>
            <p className="text-sm font-medium">Analyzing...</p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-slate-500">Bias</p>
              <p className="font-semibold">Neutral</p>
            </div>
            <div>
              <p className="text-slate-500">ADX</p>
              <p className="font-semibold">--</p>
            </div>
            <div>
              <p className="text-slate-500">ATR Regime</p>
              <p className="font-semibold">--</p>
            </div>
            <div>
              <p className="text-slate-500">Breakout %</p>
              <p className="font-semibold">--</p>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200 text-xs text-slate-600">
            <p>Awaiting entry conditions...</p>
          </div>
        </div>
      </div>
    )
  }

  // Trade Active State
  if (signal.type === "ENTRY") {
    const rMultiple = signal.entryPrice && signal.lastCandle?.close
      ? (signal.lastCandle.close - signal.entryPrice) / Math.abs(signal.entryPrice - signal.stopLoss!)
      : 0

    const structuralRisk = rMultiple > 2 ? "green" : rMultiple > 0 ? "yellow" : "red"
    const momentumRisk = (signal.indicators.rsi || 50) > 60 ? "yellow" : (signal.indicators.rsi || 50) < 40 ? "red" : "green"

    return (
      <div className="w-full max-w-md border border-emerald-200 rounded-lg p-4 bg-emerald-50">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">{symbol}</h2>
            <p className="text-xs text-emerald-600 font-medium">
              {signal.direction === "LONG" ? "↑ LONG" : "↓ SHORT"}
            </p>
          </div>
          <span
            className={`px-2 py-1 text-xs font-medium rounded ${
              signal.structuralTier === "A+"
                ? "bg-emerald-100 text-emerald-700"
                : signal.structuralTier === "A"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-amber-100 text-amber-700"
            }`}
          >
            {signal.structuralTier} Tier
          </span>
        </div>

        <div className="space-y-3">
          <div className="bg-white rounded p-2 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600">Entry Price</span>
              <span className="font-semibold">{signal.entryPrice?.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Current Price</span>
              <span className="font-semibold">{signal.lastCandle?.close.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">R Multiple</span>
              <span className={`font-semibold ${rMultiple > 0 ? "text-emerald-600" : "text-red-600"}`}>
                {rMultiple > 0 ? "+" : ""}{rMultiple.toFixed(2)}R
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Stop Loss</span>
              <span className="font-semibold">{signal.stopLoss?.toFixed(2)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center space-x-1">
              <span
                className={`w-2 h-2 rounded-full ${
                  structuralRisk === "green" ? "bg-emerald-500" : structuralRisk === "yellow" ? "bg-amber-500" : "bg-red-500"
                }`}
              />
              <span className="text-slate-600">Structural</span>
            </div>
            <div className="flex items-center space-x-1">
              <span
                className={`w-2 h-2 rounded-full ${
                  momentumRisk === "green" ? "bg-emerald-500" : momentumRisk === "yellow" ? "bg-amber-500" : "bg-red-500"
                }`}
              />
              <span className="text-slate-600">Momentum</span>
            </div>
          </div>

          <div className="pt-2 border-t border-emerald-200">
            <p className="text-xs text-slate-600">
              {signal.structuralTier === "A+" && "High-quality setup. Optimal execution conditions."}
              {signal.structuralTier === "A" && "Quality setup. Good entry conditions."}
              {signal.structuralTier === "B" && "Valid setup. Conservative execution recommended."}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return null
}
