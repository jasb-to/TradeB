import type { Signal } from "@/types/trading"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown, Pause, Info, AlertCircle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

interface SignalCardProps {
  signal: Signal | null | undefined
}

export function SignalCard({ signal }: SignalCardProps) {
  if (!signal) {
    return (
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="text-lg">No Active Signal</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Waiting for trading conditions to align...</p>
        </CardContent>
      </Card>
    )
  }

  function safeString(value: any, fallback = "—"): string {
    if (!value || typeof value !== "string") return fallback
    return value
  }

  const isExitSignal = signal.type === "EXIT" || signal.direction === "EXIT"

  const getSignalIcon = () => {
    if (isExitSignal) return <TrendingDown className="h-5 w-5 text-red-500 animate-pulse" />
    if (signal.alertLevel === 0) return <Pause className="h-5 w-5" />
    if (signal.direction === "LONG") return <TrendingUp className="h-5 w-5 text-green-500" />
    return <TrendingDown className="h-5 w-5 text-red-500" />
  }

  const getSignalColor = () => {
    if (isExitSignal) return "destructive"
    if (signal.alertLevel === 0) return "secondary"
    if (signal.direction === "LONG") return "default"
    return "destructive"
  }

  const getAlertBadge = () => {
    if (isExitSignal) {
      return <Badge className="bg-red-500 text-white border-red-600 animate-pulse">EXIT NOW - Close Position</Badge>
    }
    if (signal.alertLevel === 1) {
      const qualityBadge = signal.entryDecision?.tier === "A+" ? "⭐ A+ " : ""
      return <Badge className="bg-green-500 text-white border-green-600 animate-pulse">{qualityBadge}ENTER NOW</Badge>
    }
    return (
      <Badge variant="secondary" className="bg-muted">
        NO SIGNAL
      </Badge>
    )
  }

  const passedFilters = Array.isArray(signal.filters?.passed) ? signal.filters.passed : []
  const failedFilters = Array.isArray(signal.filters?.failed) ? signal.filters.failed : []

  const formatPrice = (value: any): string => {
    const num = typeof value === "number" ? value : Number(value)
    return !isNaN(num) && isFinite(num) ? num.toFixed(2) : "N/A"
  }

  const formatPercentage = (value: any): string => {
    const num = typeof value === "number" ? value : Number(value)
    return !isNaN(num) && isFinite(num) ? num.toFixed(2) : "0.00"
  }

  const safeDate = (timestamp: any): string => {
    if (!timestamp) return "Unknown"
    try {
      const date = typeof timestamp === "number" ? new Date(timestamp) : new Date(timestamp)
      if (isNaN(date.getTime())) return "Invalid Date"
      return date.toLocaleString()
    } catch {
      return "Invalid Date"
    }
  }

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between mb-2">{getAlertBadge()}</div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getSignalIcon()}
            <CardTitle className="text-lg">
              {isExitSignal ? "EXIT Signal" : signal.alertLevel === 0 ? "No Trade" : `${signal.direction} Signal`}
            </CardTitle>
          </div>
          <Badge variant={getSignalColor() as any} className="bg-primary/20 text-primary border-primary/30">
            {signal.confidence}% Confidence
          </Badge>
        </div>
        <CardDescription>Strategy: {safeString(signal.strategy, "Unknown").replace(/_/g, " ")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {signal.alertLevel > 0 && (
          <div className="space-y-2 font-semibold text-sm">
            <div className="flex items-center gap-2 p-2 rounded bg-green-500/20 border border-green-500/50">
              <span className="text-green-500">✓ ENTER:</span>
              <span className="text-green-400">${formatPrice(signal.entryPrice)}</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded bg-red-500/20 border border-red-500/50">
              <span className="text-red-500">✗ STOP:</span>
              <span className="text-red-400">${formatPrice(signal.stopLoss)}</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded bg-blue-500/20 border border-blue-500/50">
              <span className="text-blue-500">TP1:</span>
              <span className="text-blue-400">${formatPrice(signal.takeProfit1)}</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded bg-purple-500/20 border border-purple-500/50">
              <span className="text-purple-500">TP2:</span>
              <span className="text-purple-400">${formatPrice(signal.takeProfit2)}</span>
            </div>
          </div>
        )}

        {signal.type === "ENTRY" && !isExitSignal && signal.alertLevel > 0 && (
          <>
            {/* Trade Setup Quality Indicator */}
            <div className="bg-primary/10 p-3 rounded-lg border border-primary/30">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-primary">Setup Quality</span>
                <Badge className={
                  signal.entryDecision?.tier === "A+" ? "bg-yellow-500 text-black" 
                  : signal.entryDecision?.tier === "A" ? "bg-blue-500 text-white"
                  : signal.entryDecision?.tier === "B" ? "bg-slate-600 text-white"
                  : "bg-amber-600 text-white"
                }>
                  {signal.entryDecision?.tier === "A+" ? "⭐ A+ Setup" 
                  : signal.entryDecision?.tier === "A" ? "A Setup"
                  : signal.entryDecision?.tier === "B" ? "🚨 B TIER SETUP"
                  : "Tier: PENDING"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {signal.entryDecision?.tier === "A+"
                  ? "Premium setup: 5+ TF aligned + ADX ≥23. Target 2R."
                  : signal.entryDecision?.tier === "A"
                  ? "A TIER: Good setup, 4+ TF aligned + ADX ≥21. Scaled exit at 1.5R."
                  : signal.entryDecision?.tier === "B"
                  ? "B TIER: 1H momentum-aligned. Hard TP1 exit only. Use 50% position size."
                  : "Analyzing trade setup..."}
              </p>
            </div>

            {/* Entry and Risk/Reward Grid */}
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="bg-muted/50 p-3 rounded-lg border border-primary/20">
                <p className="text-muted-foreground text-xs font-semibold mb-1">ENTRY PRICE</p>
                <p className="text-xl font-bold text-primary">${formatPrice(signal.entryPrice)}</p>
                <p className="text-xs text-muted-foreground mt-1">Buy here</p>
              </div>
              <div className="bg-destructive/10 p-3 rounded-lg border border-destructive/30">
                <p className="text-destructive text-xs font-semibold mb-1">STOP LOSS</p>
                <p className="text-xl font-bold text-destructive">${formatPrice(signal.stopLoss)}</p>
                <p className="text-xs text-destructive/70 mt-1">
                  -
                  {formatPercentage(
                    ((Number(signal.entryPrice) - Number(signal.stopLoss)) / Number(signal.entryPrice)) * 100,
                  )}
                  %
                </p>
              </div>
              <div className="bg-amber-500/10 p-3 rounded-lg border border-amber-500/30">
                <p className="text-amber-600 text-xs font-semibold mb-1">MAX RISK</p>
                <p className="text-lg font-bold text-amber-600">
                  ${formatPrice(Math.abs(Number(signal.entryPrice) - Number(signal.stopLoss)))}
                </p>
                <p className="text-xs text-amber-600/70 mt-1">
                  {formatPercentage(
                    (Math.abs(Number(signal.entryPrice) - Number(signal.stopLoss)) / Number(signal.entryPrice)) * 100,
                  )}
                  % risk
                </p>
              </div>
            </div>

            {/* Take Profit Targets */}
            {signal.entryDecision?.tier === "B" ? (
              // B TIER: Hard TP1 only (no TP2)
              signal.takeProfit1 && (
                <div className="grid grid-cols-1 gap-3">
                  <div className="bg-green-500/10 p-3 rounded-lg border border-green-500/30">
                    <p className="text-green-600 text-xs font-semibold mb-1">TP1 - FULL EXIT (B TIER)</p>
                    <p className="text-xl font-bold text-green-500">${formatPrice(signal.takeProfit1)}</p>
                    <p className="text-xs text-green-600/70 mt-1">
                      +
                      {formatPercentage(
                        ((Number(signal.takeProfit1) - Number(signal.entryPrice)) / Number(signal.entryPrice)) * 100,
                      )}
                      % (Full Position Closes)
                    </p>
                  </div>
                </div>
              )
            ) : signal.takeProfit1 && signal.takeProfit2 ? (
              // A/A+ TIER: TP1 scale + TP2 trail
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-500/10 p-3 rounded-lg border border-green-500/30">
                  <p className="text-green-600 text-xs font-semibold mb-1">TP1 - TAKE 50%</p>
                  <p className="text-xl font-bold text-green-500">${formatPrice(signal.takeProfit1)}</p>
                  <p className="text-xs text-green-600/70 mt-1">
                    +
                    {formatPercentage(
                      ((Number(signal.takeProfit1) - Number(signal.entryPrice)) / Number(signal.entryPrice)) * 100,
                    )}
                    % (1R Profit)
                  </p>
                </div>
                <div className="bg-green-600/10 p-3 rounded-lg border border-green-600/30">
                  <p className="text-green-700 text-xs font-semibold mb-1">
                    TP2 - TRAIL {signal.entryDecision?.tier === "A+" ? "2R" : "1.5R"}
                  </p>
                  <p className="text-xl font-bold text-green-600">${formatPrice(signal.takeProfit2)}</p>
                  <p className="text-xs text-green-700/70 mt-1">
                    +
                    {formatPercentage(
                      ((Number(signal.takeProfit2) - Number(signal.entryPrice)) / Number(signal.entryPrice)) * 100,
                    )}
                    % ({signal.entryDecision?.tier === "A+" ? "2R" : "1.5R"} Profit)
                  </p>
                </div>
              </div>
            ) : null}

            {/* Risk/Reward Ratio */}
            <div className="bg-accent/10 p-3 rounded-lg border border-accent/30 flex justify-between items-center">
              <span className="text-sm font-semibold">Expected Risk:Reward</span>
              <span className="text-lg font-bold text-accent">
                {signal.entryDecision?.tier === "A+" ? "1:2.0" : signal.entryDecision?.tier === "B" ? "1:1.0" : "1:1.5"}
              </span>
            </div>

            {signal.mtfBias && typeof signal.mtfBias === "object" && Object.keys(signal.mtfBias).length > 0 && (
              <div className="bg-muted/50 p-3 rounded-lg border border-primary/20">
                <p className="text-sm font-semibold mb-2">Multi-Timeframe Confirmation</p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {Object.entries(signal.mtfBias).map(([tf, bias]) => (
                    <div key={tf} className="flex items-center gap-2">
                      <div
                        className={`w-8 h-8 rounded flex items-center justify-center font-bold text-white ${
                          bias === "LONG" ? "bg-green-500" : bias === "SHORT" ? "bg-red-500" : "bg-gray-500"
                        }`}
                      >
                        {bias === "LONG" ? "↑" : bias === "SHORT" ? "↓" : "→"}
                      </div>
                      <span className="uppercase text-muted-foreground">{tf}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Key Indicators */}
            <div className="bg-muted/50 p-3 rounded-lg border border-primary/20">
              <p className="text-sm font-semibold mb-2">Key Indicators</p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">ADX</span>
                  <p className="font-bold text-lg">{formatPrice(signal?.indicators?.adx)}</p>
                  <p className="text-muted-foreground text-xs">
                    {Number(signal?.indicators?.adx) >= 23 ? "Strong Trend" : "Developing"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">ATR</span>
                  <p className="font-bold text-lg">{formatPrice(signal?.indicators?.atr)}</p>
                  <p className="text-muted-foreground text-xs">Volatility</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Stochastic RSI</span>
                  <p className="font-bold text-lg">{formatPrice(signal?.indicators?.stochRSI)}</p>
                  <p className="text-muted-foreground text-xs">
                    {Number(signal?.indicators?.stochRSI) > 70
                      ? "Overbought"
                      : Number(signal?.indicators?.stochRSI) < 30
                        ? "Oversold"
                        : "Neutral"}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="w-full bg-transparent border-primary/30 hover:bg-primary/10">
              <Info className="h-4 w-4 mr-2" />
              Why This Signal?
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Signal Analysis</DialogTitle>
              <DialogDescription>Detailed breakdown of filters and conditions</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Alert className="bg-blue-500/10 border-blue-500/30">
                <AlertCircle className="h-4 w-4 text-blue-500" />
                <AlertTitle className="text-sm font-semibold">Data Source: OANDA (XAU_USD / XAG_USD)</AlertTitle>
                <AlertDescription className="text-xs space-y-2">
                  <p>
                    Real-time intraday data from OANDA for Gold (XAU_USD) and Silver (XAG_USD). Prices should closely
                    match your broker.
                  </p>
                </AlertDescription>
              </Alert>

              {/* Optimal Indicator Ranges */}
              <div className="bg-muted/50 p-3 rounded-lg">
                <h4 className="font-semibold text-sm mb-2">Optimal Indicator Ranges</h4>
                <div className="text-xs space-y-1 text-muted-foreground">
                  <p>
                    <strong>ATR:</strong> &gt;3.0 (Strong) | 2.0-3.0 (Moderate) | &lt;2.0 (Low/Choppy)
                  </p>
                  <p>
                    <strong>ADX:</strong> &gt;23 (Strong Trend/A+) | 21-23 (Developing Trend) | &lt;21 (Ranging)
                  </p>
                  <p>
                    <strong>HTF Polarity:</strong> Must match direction - only A/A+ with directional integrity allowed
                  </p>
                  <p>
                    <strong>Stochastic RSI:</strong> &lt;30 (Oversold/Buy) | &gt;70 (Overbought/Sell) | 40-60 (Neutral)
                  </p>
                </div>
              </div>

              {/* Current Indicator Values */}
              <div className="bg-muted/50 p-3 rounded-lg">
                <h4 className="font-semibold text-sm mb-2">Current Indicator Values</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">ATR:</span>{" "}
                    <span className="font-semibold">{formatPrice(signal?.indicators?.atr)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">ADX:</span>{" "}
                    <span className="font-semibold">{formatPrice(signal?.indicators?.adx)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Stochastic RSI:</span>{" "}
                    <span className="font-semibold">{formatPrice(signal?.indicators?.stochRSI)}</span>
                  </div>
                </div>
              </div>

              {/* Passed Filters */}
              {passedFilters.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm mb-2">Passed Filters</h4>
                  <ul className="space-y-1">
                    {passedFilters.map((filter, i) => (
                      <li key={i} className="text-sm text-green-600 dark:text-green-400">
                        • {filter}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Failed Filters */}
              {failedFilters.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm mb-2">Failed Filters</h4>
                  <ul className="space-y-1">
                    {failedFilters.map((filter, i) => (
                      <li key={i} className="text-sm text-red-600 dark:text-red-400">
                        • {filter}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Reasons */}
              <div>
                <h4 className="font-semibold text-sm mb-2">Reasons</h4>
                <ul className="space-y-1">
                  {signal.reasons?.map((reason, i) => (
                    <li key={i} className="text-sm">
                      • {reason}
                    </li>
                  )) || <li className="text-sm text-muted-foreground">No additional reasons</li>}
                </ul>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Generated Time */}
        <p className="text-xs text-muted-foreground">Generated: {safeDate(signal.timestamp)}</p>
      </CardContent>
    </Card>
  )
}
