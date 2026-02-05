import { CheckCircle2, Circle, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Signal } from "@/types/trading"

interface TradeChecklistXAUProps {
  signal: Signal | null
}

export function TradeChecklistXAU({ signal }: TradeChecklistXAUProps) {
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

  // XAU-specific requirements (Gold is slower, prefers stronger confirmation)
  const requirements = [
    {
      name: "Daily Trend Alignment",
      description: "Daily timeframe must support direction (stronger requirement for gold)",
      checked: signal?.mtfBias?.daily === effectiveDirection,
    },
    {
      name: "4H/1H EMA Confirmation",
      description: "Both 4H and 1H must align with direction",
      checked: signal?.mtfBias?.["4h"] === effectiveDirection && signal?.mtfBias?.["1h"] === effectiveDirection,
    },
    {
      name: "Multi-TF Alignment (5/6)",
      description: "At least 5 of 6 timeframes agree (gold needs higher confirmation)",
      checked: signal?.mtfBias
        ? [
            signal.mtfBias.daily,
            signal.mtfBias["8h"],
            signal.mtfBias["4h"],
            signal.mtfBias["1h"],
            signal.mtfBias["15m"],
            signal.mtfBias["5m"],
          ].filter((bias) => bias === effectiveDirection).length >= 5
        : false,
    },
    {
      name: "ADX Strength",
      description: "ADX >= 25 for strong trending confirmation",
      checked: signal?.indicators?.adx ? signal.indicators.adx >= 25 : false,
    },
    {
      name: "Volatility (ATR)",
      description: "ATR sufficient for swing trading (typically 3+ on gold)",
      checked: signal?.indicators?.atr ? signal.indicators.atr >= 3.0 : false,
    },
    {
      name: "Momentum Confirmation",
      description: "RSI in proper zone without extremes",
      checked: signal?.indicators?.rsi
        ? signal.direction === "LONG"
          ? signal.indicators.rsi > 50 && signal.indicators.rsi < 75
          : signal.indicators.rsi > 25 && signal.indicators.rsi < 50
        : false,
    },
  ]

  const isExitSignal = signal?.type === "EXIT" || signal?.direction === "EXIT"
  const trendReversalDetected =
    signal &&
    signal.direction &&
    signal.mtfBias &&
    ((signal.direction === "LONG" && signal.mtfBias.daily === "SHORT") ||
      (signal.direction === "SHORT" && signal.mtfBias.daily === "LONG"))

  return (
    <Card className="border-yellow-500/30 bg-gradient-to-br from-yellow-500/5 to-transparent">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
            <CheckCircle2 className="h-5 w-5 text-yellow-400" />
          </div>
          <div>
            <CardTitle className="text-yellow-600">Gold (XAU/USD) Entry Checklist</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Gold requires stricter confirmation - 5/6 TF alignment</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!isExitSignal && (
          <>
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Badge className="bg-yellow-500/20 text-yellow-700 border-yellow-500/30">XAU Specific</Badge>
                <h3 className="text-sm font-semibold">Requirements for Valid Entry</h3>
              </div>
              <div className="space-y-3">
                {requirements.map((req, index) => (
                  <div key={index} className="flex items-start gap-3">
                    {req.checked ? (
                      <CheckCircle2 className="h-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
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
                <Badge className="border-yellow-500/30">Signal Status</Badge>
              </div>
              <div
                className={`p-3 rounded-lg border transition-all ${
                  signal?.alertLevel === 1
                    ? "bg-green-500/10 border-green-500/30"
                    : "bg-background/50 border-yellow-500/10"
                }`}
              >
                <div className="flex items-center gap-3 mb-1">
                  <Badge
                    variant={signal?.alertLevel === 1 ? "default" : "outline"}
                    className={signal?.alertLevel === 1 ? "bg-green-500 text-white" : "border-yellow-500/30"}
                  >
                    {signal?.alertLevel === 1 ? "ACTIVE" : "WAITING"}
                  </Badge>
                  <p
                    className={`text-sm font-semibold ${signal?.alertLevel === 1 ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {signal?.alertLevel === 1 ? "Gold Setup Ready!" : "Waiting for 5/6 alignment"}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {trendReversalDetected && (
          <div className="bg-red-500/20 border-red-500/50 p-4 rounded-lg border animate-pulse">
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle className="h-6 w-6 text-red-400" />
              <Badge className="bg-red-500 text-white">EXIT GOLD</Badge>
            </div>
            <p className="text-sm text-red-300">Daily timeframe flipped. Exit gold position.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
