"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"
import type { Signal } from "@/types/trading"

interface IndicatorCardsProps {
  signal: Signal | null
}

export function IndicatorCards({ signal }: IndicatorCardsProps) {
  // HARD GUARD: Only read from signal.indicators
  if (!signal?.indicators) {
    return (
      <Alert className="bg-red-950/30 border-red-700/50">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-red-200">
          DATA ERROR: Indicators missing from API response. Signal object exists but indicators is null/undefined.
        </AlertDescription>
      </Alert>
    )
  }

  const adx = signal.indicators.adx ?? 0
  const atr = signal.indicators.atr ?? 0
  const vwap = signal.indicators.vwap ?? 0

  // Extract stochRSI - it's now a structured object { value: number | null, state: string }
  const stochRsiRaw = signal.indicators.stochRSI
  const stochRsiData = typeof stochRsiRaw === "object" && stochRsiRaw !== null
    ? stochRsiRaw as { value: number | null; state: string }
    : { value: typeof stochRsiRaw === "number" ? stochRsiRaw : null, state: "CALCULATING" }

  // VALIDATION: Check if we have valid indicator calculations
  // We only consider it an error if BOTH are missing AND signal has no candle data
  // Zero values CAN occur legitimately during market transitions (especially ATR at intraday levels)
  const hasCandles = signal?.lastCandle?.close !== undefined && signal?.lastCandle?.close !== 0
  const hasValidAdx = adx > 0 || adx >= 0 // ADX can be calculated even if small
  const hasValidAtr = atr > 0 || atr >= 0 // ATR can be calculated even if small
  const indicatorsNotCalculated = adx === 0 && atr === 0 && !hasCandles

  if (indicatorsNotCalculated) {
    return (
      <Alert className="bg-red-950/30 border-red-700/50">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-red-200">
          DATA ERROR: Indicators not yet calculated. ADX={adx.toFixed(1)}, ATR={atr.toFixed(2)}
        </AlertDescription>
      </Alert>
    )
  }

  const getADXStatus = (val: number) => {
    if (val >= 30) return { label: "STRONG", color: "text-green-400", width: "90%" }
    if (val >= 25) return { label: "TRENDING", color: "text-green-300", width: "75%" }
    if (val >= 20) return { label: "MODERATE", color: "text-yellow-300", width: "60%" }
    return { label: "WEAK", color: "text-orange-300", width: "30%" }
  }

  const getATRStatus = (val: number) => {
    // ATR threshold scaled for display (2.375 = normalized threshold, display shows raw value)
    // For XAU: typical range 2-40, threshold ≥ 2.375 normalizes to ~5.8% of typical range
    // For XAG: typical range 0.1-0.5, threshold ≥ 2.375 scales differently
    // FIXED: Compare raw ATR value against threshold directly
    const threshold = 2.375 // 5% loosened from 2.5
    
    if (val < 0) return { label: "DATA ERROR", color: "text-red-400", width: "0%" }
    if (val >= threshold) return { label: "✓ PASS", color: "text-green-400", width: "70%" }
    return { label: "✗ FAIL", color: "text-orange-300", width: "40%" }
  }

  // StochRSI status uses state from backend - NO MORE "NEUTRAL 50"
  const getStochStatusFromState = (data: { value: number | null; state: string }) => {
    // CALCULATING state - insufficient candles
    if (data.value === null || data.state === "CALCULATING") {
      return { label: "CALCULATING", color: "text-gray-400", width: "0%", isCalculating: true }
    }
    // State-based colors (from backend)
    switch (data.state) {
      case "MOMENTUM_UP":
        return { label: "MOMENTUM UP", color: "text-green-400", width: `${data.value}%`, isCalculating: false }
      case "MOMENTUM_DOWN":
        return { label: "MOMENTUM DOWN", color: "text-red-400", width: `${data.value}%`, isCalculating: false }
      case "COMPRESSION":
        return { label: "COMPRESSION", color: "text-yellow-400", width: `${data.value}%`, isCalculating: false }
      default:
        return { label: "DATA ERROR", color: "text-red-400", width: "0%", isCalculating: false }
    }
  }

  const getVWAPStatus = (vwapVal: number | undefined, currentPrice: number | undefined) => {
    // VWAP should compare to current market price, not entryPrice
    if (vwapVal === undefined || vwapVal === 0 || currentPrice === undefined || currentPrice === 0) {
      return { label: "N/A", color: "text-gray-400" }
    }
    if (currentPrice > vwapVal * 1.002) return { label: "BULLISH", color: "text-green-400" }
    if (currentPrice < vwapVal * 0.998) return { label: "BEARISH", color: "text-red-400" }
    return { label: "NEUTRAL", color: "text-gray-400" }
  }

  // Get current price from signal's lastCandle close price
  const currentPrice = signal?.lastCandle?.close ?? 0
  const adxStatus = getADXStatus(adx)
  const atrStatus = getATRStatus(atr)
  const stochRsi = stochRsiData.value ?? 0
  const stochStatus = getStochStatusFromState(stochRsiData)
  const vwapStatus = getVWAPStatus(vwap, currentPrice)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card className="bg-slate-900/40 border-slate-700/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-mono">ADX (Trend Strength)</CardTitle>
          <p className="text-xs text-slate-500 mt-1">1H Timeframe</p>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between items-baseline">
            <span className="text-2xl font-bold">{adx.toFixed(1)}</span>
            <span className={`text-xs font-mono ${adxStatus.color}`}>{adxStatus.label}</span>
          </div>
          <div className="w-full bg-slate-800 rounded h-2">
            <div className={`bg-green-600 rounded h-2 transition-all`} style={{ width: adxStatus.width }} />
          </div>
          <p className="text-xs text-slate-400">Range: 0-100 | Gate: ≥20 (Mod) | ≥25 (Strong) | ≥30 (V.Strong)</p>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/40 border-slate-700/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-mono">ATR (Volatility)</CardTitle>
          <p className="text-xs text-slate-500 mt-1">1H Timeframe</p>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between items-baseline">
            <span className="text-2xl font-bold">{atr.toFixed(2)}</span>
            <span className={`text-xs font-mono ${atrStatus.color}`}>{atrStatus.label}</span>
          </div>
          <div className="w-full bg-slate-800 rounded h-2">
            <div className={`bg-orange-600 rounded h-2 transition-all`} style={{ width: atrStatus.width }} />
          </div>
                <p className="text-xs text-slate-400">Threshold: ≥ 2.38 (5% loosened) | Current: {atr >= 2.375 ? "✓ PASS" : "✗ FAIL"}</p>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/40 border-slate-700/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-mono">Stochastic RSI</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between items-baseline">
            {stochStatus.isCalculating ? (
              <span className="text-2xl font-bold text-gray-500" title="Waiting for sufficient candles">-</span>
            ) : stochRsiData.value !== null && stochRsiData.value !== undefined ? (
              <span className="text-2xl font-bold">{stochRsiData.value.toFixed(1)}</span>
            ) : (
              <span className="text-2xl font-bold text-gray-500">-</span>
            )}
            <span className={`text-xs font-mono ${stochStatus.color}`}>{stochStatus.label}</span>
          </div>
          <div className="w-full bg-slate-800 rounded h-2">
            <div
              className={`${stochStatus.color.includes("green") ? "bg-green-600" : stochStatus.color.includes("red") ? "bg-red-600" : stochStatus.color.includes("yellow") ? "bg-yellow-600" : "bg-gray-600"} rounded h-2 transition-all`}
              style={{ width: stochStatus.isCalculating ? "0%" : (stochRsiData.value !== null && stochRsiData.value !== undefined ? `${Math.min(100, stochRsiData.value)}%` : "0%") }}
            />
          </div>
          <p className="text-xs text-slate-400">UP &gt; 60 | COMPRESSION 40-60 | DOWN &lt; 40</p>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/40 border-slate-700/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-mono">VWAP Bias</CardTitle>
          <p className="text-xs text-slate-500 mt-1">Daily Anchor Level</p>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between items-baseline">
            <span className="text-2xl font-bold">{vwap === 0 ? "-" : `$${vwap.toFixed(2)}`}</span>
            <span className={`text-xs font-mono ${vwapStatus.color}`}>{vwapStatus.label}</span>
          </div>
          <div className="w-full bg-slate-800 rounded h-2">
            <div
              className={`${vwapStatus.label === "BULLISH" ? "bg-green-600" : vwapStatus.label === "BEARISH" ? "bg-red-600" : "bg-gray-600"} rounded h-2 transition-all`}
              style={{ width: "50%" }}
            />
          </div>
          <p className="text-xs text-slate-400">Daily Anchor | Key Support/Resistance</p>
        </CardContent>
      </Card>
    </div>
  )
}
