import { TrendingUp, TrendingDown, Minus } from "lucide-react"

interface MTFBiasStripProps {
  biasDaily: "LONG" | "SHORT" | "NEUTRAL"
  bias8h: "LONG" | "SHORT" | "NEUTRAL"
  bias4h: "LONG" | "SHORT" | "NEUTRAL"
  bias1h: "LONG" | "SHORT" | "NEUTRAL"
  bias15m: "LONG" | "SHORT" | "NEUTRAL"
  bias5m: "LONG" | "SHORT" | "NEUTRAL"
}

export function MTFBiasStrip({ biasDaily, bias8h, bias4h, bias1h, bias15m, bias5m }: MTFBiasStripProps) {
  const getBiasIcon = (bias: string) => {
    if (bias === "LONG") return <TrendingUp className="h-3 w-3" />
    if (bias === "SHORT") return <TrendingDown className="h-3 w-3" />
    return <Minus className="h-3 w-3" />
  }

  const getBiasColor = (bias: string) => {
    if (bias === "LONG") return "bg-green-500/90 text-white border-green-400/30"
    if (bias === "SHORT") return "bg-red-500/90 text-white border-red-400/30"
    return "bg-gray-500/50 text-white border-gray-400/30"
  }

  const getBiasLabel = (bias: string) => {
    if (bias === "LONG") return "Bullish"
    if (bias === "SHORT") return "Bearish"
    return "Ranging"
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground">Multi-Timeframe Bias</h3>
      <div className="flex gap-2 flex-wrap">
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${getBiasColor(biasDaily)}`}
        >
          {getBiasIcon(biasDaily)}
          <span>Daily</span>
          <span className="opacity-70">• {getBiasLabel(biasDaily)}</span>
        </div>
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${getBiasColor(bias8h)}`}
        >
          {getBiasIcon(bias8h)}
          <span>8H</span>
          <span className="opacity-70">• {getBiasLabel(bias8h)}</span>
        </div>
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${getBiasColor(bias4h)}`}
        >
          {getBiasIcon(bias4h)}
          <span>4H</span>
          <span className="opacity-70">• {getBiasLabel(bias4h)}</span>
        </div>
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${getBiasColor(bias1h)}`}
        >
          {getBiasIcon(bias1h)}
          <span>1H</span>
          <span className="opacity-70">• {getBiasLabel(bias1h)}</span>
        </div>
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${getBiasColor(bias15m)}`}
        >
          {getBiasIcon(bias15m)}
          <span>15M</span>
          <span className="opacity-70">• {getBiasLabel(bias15m)}</span>
        </div>
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${getBiasColor(bias5m)}`}
        >
          {getBiasIcon(bias5m)}
          <span>5M</span>
          <span className="opacity-70">• {getBiasLabel(bias5m)}</span>
        </div>
      </div>
    </div>
  )
}
