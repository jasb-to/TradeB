import { CheckCircle2, Circle, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Signal } from "@/types/trading"

interface TradeChecklistXAGProps {
  signal: Signal | null
}

export function TradeChecklistXAG({ signal }: TradeChecklistXAGProps) {
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

  // XAG-specific requirements (Silver is volatile, needs good momentum)
  const requirements = [
    {
      name: "4H/1H Core Alignment",
      description: "Both 4H and 1H must align (silver entry foundation)",
      checked: signal?.mtfBias?.["4h"] === effectiveDirection && signal?.mtfBias?.["1h"] === effectiveDirection,
    },
    {
      name: "Multi-TF Consensus (4/6)",
      description: "At least 4 of 6 timeframes agree (silver is more volatile)",
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
      name: "ADX Momentum",
      description: "ADX >= 20 for silver (captures more moves)",
      checked: signal?.indicators?.adx ? signal.indicators.adx >= 20 : false,
    },
    {
      name: "Volatility Spike (ATR)",
      description: "ATR >= 0.35 for silver swing trades",
      checked: signal?.indicators?.atr ? signal.indicators.atr >= 0.35 : false,
    },
    {
      name: "Momentum Kick",
      description: "RSI showing directional bias",
      checked: signal?.indicators?.rsi
        ? signal.direction === "LONG"
          ? signal.indicators.rsi > 45 && signal.indicators.rsi < 80
          : signal.indicators.rsi > 20 && signal.indicators.rsi < 55
        : false,
    },
    {
      name: "StochRSI Recovery",
      description: "StochRSI recovering from extreme zones",
      checked: signal?.indicators?.stochRSI
        ? signal.direction === "LONG"
          ? signal.indicators.stochRSI > 20 && signal.indicators.stochRSI < 80
          : signal.indicators.stochRSI > 15 && signal.indicators.stochRSI < 75
        : false,
    },
  ]

  const isExitSignal = signal?.type === "EXIT" || signal?.direction === "EXIT"
  const trendReversalDetected =
    signal &&
    signal.direction &&
    signal.mtfBias &&
    ((signal.direction === "LONG" && signal.mtfBias["4h"] === "SHORT") ||
      (signal.direction === "SHORT" && signal.mtfBias["4h"] === "LONG"))

  return (
    <Card className="border-white/30 bg-gradient-to-br from-white/5 to-transparent">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/10 rounded-lg border border-white/30">
            <CheckCircle2 className="h-5 w-5 text-white/70" />
          </div>
          <div>
            <CardTitle className="text-white/80">Silver (XAG/USD) Entry Checklist</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Silver is volatile - 4/6 TF aligned, captures more moves
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!isExitSignal && (
          <>
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Badge className="bg-white/20 text-white/80 border-white/30">XAG Specific</Badge>
                <h3 className="text-sm font-semibold">Requirements for Valid Entry</h3>
              </div>
              <div className="space-y-3">
                {requirements.map((req, index) => (
                  <div key={index} className="flex items-start gap-3">
                    {req.checked ? (
                      <CheckCircle2 className="h-5 w-5 text-white/70 mt-0.5 flex-shrink-0" />
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
                <Badge className="border-white/30">Signal Status</Badge>
              </div>
              <div
                className={`p-3 rounded-lg border transition-all ${
                  signal?.alertLevel === 1 ? "bg-blue-500/10 border-blue-500/30" : "bg-background/50 border-white/10"
                }`}
              >
                <div className="flex items-center gap-3 mb-1">
                  <Badge
                    variant={signal?.alertLevel === 1 ? "default" : "outline"}
                    className={signal?.alertLevel === 1 ? "bg-blue-500 text-white" : "border-white/30"}
                  >
                    {signal?.alertLevel === 1 ? "ACTIVE" : "WAITING"}
                  </Badge>
                  <p
                    className={`text-sm font-semibold ${signal?.alertLevel === 1 ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {signal?.alertLevel === 1 ? "Silver Setup Ready!" : "Waiting for 4/6 alignment"}
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
              <Badge className="bg-red-500 text-white">EXIT SILVER</Badge>
            </div>
            <p className="text-sm text-red-300">4H timeframe flipped. Exit silver position.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
