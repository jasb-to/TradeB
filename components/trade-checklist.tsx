import { CheckCircle2, Circle, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Signal } from "@/types/trading"

interface TradeChecklistProps {
  signal: Signal | null
}

export function TradeChecklist({ signal }: TradeChecklistProps) {
  // Determine the expected direction based on MTF bias majority
  const getMajorityDirection = () => {
    if (!signal?.mtfBias) return null
    const biases = [
      signal.mtfBias.daily,
      signal.mtfBias["8h"],
      signal.mtfBias["4h"],
      signal.mtfBias["1h"],
      signal.mtfBias["15m"],
      signal.mtfBias["5m"],
    ]
    const longCount = biases.filter((b) => b === "LONG").length
    const shortCount = biases.filter((b) => b === "SHORT").length
    if (longCount >= 4) return "LONG"
    if (shortCount >= 4) return "SHORT"
    return null
  }

  const majorityDirection = getMajorityDirection()
  const effectiveDirection = signal?.direction || majorityDirection

  // Determine which requirements are met based on the signal
  const requirements = [
    {
      name: "4H/Daily EMA Alignment",
      description: "Price position vs EMA20/50 on higher timeframes",
      checked: signal?.mtfBias?.daily !== "NEUTRAL" && signal?.mtfBias?.["4h"] !== "NEUTRAL",
    },
    {
      name: "Multi-Timeframe Confirmation",
      description: "At least 4 of 6 timeframes agree on direction",
      checked: signal?.mtfBias
        ? [
            signal.mtfBias.daily,
            signal.mtfBias["8h"],
            signal.mtfBias["4h"],
            signal.mtfBias["1h"],
            signal.mtfBias["15m"],
            signal.mtfBias["5m"],
          ].filter((bias) => bias === effectiveDirection).length >= 4
        : false,
    },
    {
      name: "Trend Strength (ADX)",
      description: "ADX above 23 for strong trending market",
      checked: signal?.indicators?.adx ? signal.indicators.adx >= 23 : false,
    },
    {
      name: "Volatility Check (ATR)",
      description: "Sufficient price movement for swing trading",
      checked: signal?.indicators?.atr ? signal.indicators.atr >= 2.0 : false,
    },
    {
      name: "Momentum Confirmation (RSI)",
      description: "RSI in trending range, not extreme zones",
      checked: signal?.indicators?.rsi
        ? signal.direction === "LONG"
          ? signal.indicators.rsi > 45 && signal.indicators.rsi < 80
          : signal.indicators.rsi > 20 && signal.indicators.rsi < 55
        : false,
    },
    {
      name: "StochRSI Position",
      description: "StochRSI recovering from oversold or in trend zone",
      checked: signal?.indicators?.stochRSI
        ? signal.direction === "LONG"
          ? signal.indicators.stochRSI > 15 && signal.indicators.stochRSI < 85
          : signal.indicators.stochRSI > 10 && signal.indicators.stochRSI < 80
        : false,
    },
  ]

  const isExitSignal = signal?.type === "EXIT" || signal?.direction === "EXIT"

  const trendReversalDetected =
    signal &&
    signal.direction &&
    signal.mtfBias &&
    ((signal.direction === "LONG" && signal.mtfBias.daily === "SHORT" && signal.mtfBias["8h"] === "SHORT") ||
      (signal.direction === "SHORT" && signal.mtfBias.daily === "LONG" && signal.mtfBias["8h"] === "LONG"))

  const exitTriggered =
    isExitSignal ||
    trendReversalDetected ||
    (signal?.filters?.failed && Array.isArray(signal.filters.failed)
      ? signal.filters.failed.some((f) => f.includes("Entry expired"))
      : false)

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-amber-500/5 to-transparent">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/30">
            <CheckCircle2 className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <CardTitle>Trade Entry Checklist</CardTitle>
            <CardDescription>Requirements for valid entry signal</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!isExitSignal && (
          <>
            {/* Pre-Trade Requirements */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Badge variant="outline" className="border-primary/30 bg-background">
                  Requirements
                </Badge>
                <h3 className="text-sm font-semibold">All Must Pass for Entry Signal</h3>
              </div>
              <div className="space-y-3">
                {requirements.map((req, index) => (
                  <div key={index} className="flex items-start gap-3">
                    {req.checked ? (
                      <CheckCircle2 className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${req.checked ? "text-foreground" : "text-muted-foreground"}`}>
                        {req.name}
                      </p>
                      <p className="text-xs text-muted-foreground">{req.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-4">
                <Badge variant="outline" className="border-primary/30 bg-background">
                  Signal Status
                </Badge>
              </div>
              <div
                className={`p-3 rounded-lg border transition-all ${
                  signal?.alertLevel === 1
                    ? "bg-green-500/10 border-green-500/30"
                    : "bg-background/50 border-primary/10"
                }`}
              >
                <div className="flex items-center gap-3 mb-1">
                  <Badge
                    variant={signal?.alertLevel === 1 ? "default" : "outline"}
                    className={signal?.alertLevel === 1 ? "bg-green-500 text-white" : "border-primary/30"}
                  >
                    {signal?.alertLevel === 1 ? "ACTIVE" : "WAITING"}
                  </Badge>
                  <p
                    className={`text-sm font-semibold ${signal?.alertLevel === 1 ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {signal?.alertLevel === 1 ? "Enter Now!" : "Waiting for Setup"}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground ml-14">
                  {signal?.alertLevel === 1
                    ? "All conditions met - enter trade with provided levels"
                    : "Monitoring for valid entry setup"}
                </p>
              </div>
            </div>
          </>
        )}

        {exitTriggered && (
          <div className="bg-red-500/20 border-red-500/50 p-4 rounded-lg border animate-pulse">
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle className="h-6 w-6 text-red-400" />
              <Badge variant="default" className="bg-red-500 text-white text-lg px-3 py-1">
                EXIT
              </Badge>
              <p className="text-lg font-bold text-red-400">Exit Trade Now!</p>
            </div>
            <p className="text-sm text-red-300 font-medium ml-9">
              {trendReversalDetected
                ? "Both Daily and 8H timeframes flipped against your position. EXIT IMMEDIATELY!"
                : signal?.advice || "Strong reversal signal detected."}
            </p>
          </div>
        )}

        {!exitTriggered && (
          <div className="p-3 rounded-lg border bg-background/50 border-primary/10 opacity-60">
            <div className="flex items-center gap-3 mb-1">
              <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              <Badge variant="outline" className="border-primary/30">
                EXIT
              </Badge>
              <p className="text-sm font-semibold text-muted-foreground">Trend Reversal Monitor</p>
            </div>
            <p className="text-xs ml-14 text-muted-foreground">
              Exit warning will appear here if trend reversal is detected.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
