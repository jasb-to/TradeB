"use client"

import type { Signal, PatienceMetrics, GetReadyState } from "@/types/trading"
import type { CronHeartbeat as CronHeartbeatType } from "@/lib/cron-heartbeat"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Clock, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle, Info, Eye, Radio, AlertCircle } from "lucide-react"
import { useEffect, useState } from "react"
import { CronHeartbeat } from "@/lib/cron-heartbeat"

interface SystemStatePanelProps {
  signal: Signal | null
}

interface NearMissData {
  symbol: string
  stats: {
    count24h: number
    mostCommonBlocker: string | null
    avgScoreGap: number
    longVsShort: { long: number; short: number }
  }
  recentNearMisses: Array<{
    direction: string
    timestamp: string
    scoreGap: string
    scorePercentage: string
    blockers: string[]
    blockerCount: number
    classification: string
    htfPolarity: string
  }>
}

interface BTradeStats {
  symbol: string
  stats: {
    count24h: number
    totalRecorded: number
    directionalBias: { long: number; short: number }
    upgradedToA: number
    upgradedToAPlus: number
    mostCommonBlocker: string | null
    avgIndicatorGap: {
      adx: string
      rsi: string
      atr: string
    }
  }
  recentBSetups: Array<{
    timestamp: string
    direction: string
    classification: string
    blockersCount: number
    primaryBlocker: string | null
    indicatorGaps: {
      adx: string
      rsi: string
      atr: string
    }
    upgraded: string
  }>
}

export function SystemStatePanel({ signal }: SystemStatePanelProps) {
  const metrics = signal?.patienceMetrics
  const getReadyState = signal?.getReadyState
  const [heartbeats, setHeartbeats] = useState<CronHeartbeatType[]>([])
  const [nearMisses, setNearMisses] = useState<NearMissData[]>([])
  const [bTrades, setBTrades] = useState<BTradeStats[]>([])
  const [updateCounter, setUpdateCounter] = useState(0)

  // Update heartbeats, near-misses, and B-trades every 5 seconds
  useEffect(() => {
    const fetchData = async () => {
      const beats = await CronHeartbeat.getAllHeartbeats()
      setHeartbeats(beats)

      try {
        const res = await fetch("/api/near-miss")
        if (res.ok) {
          const data = await res.json()
          setNearMisses(data.symbols || [])
        }
      } catch (error) {
        console.error("Failed to fetch near-miss data:", error)
      }

      try {
        const res = await fetch("/api/b-trade")
        if (res.ok) {
          const data = await res.json()
          setBTrades(data.symbols || [])
        }
      } catch (error) {
        console.error("Failed to fetch B-trade data:", error)
      }

      setUpdateCounter((c) => c + 1)
    }

    fetchData()
    const interval = setInterval(fetchData, 5000)

    return () => clearInterval(interval)
  }, [])
  
  if (!metrics) {
    return (
      <Card className="bg-slate-900/40 border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-mono text-slate-200 flex items-center gap-2">
            <Info className="w-4 h-4" />
            SYSTEM STATE
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-400 text-sm">Loading patience metrics...</p>
        </CardContent>
      </Card>
    )
  }

  const getPolarityIcon = (polarity: string) => {
    switch (polarity) {
      case "LONG": return <TrendingUp className="w-4 h-4 text-emerald-400" />
      case "SHORT": return <TrendingDown className="w-4 h-4 text-red-400" />
      default: return <Minus className="w-4 h-4 text-amber-400" />
    }
  }

  const getPolarityColor = (polarity: string) => {
    switch (polarity) {
      case "LONG": return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
      case "SHORT": return "bg-red-500/20 text-red-300 border-red-500/30"
      default: return "bg-amber-500/20 text-amber-300 border-amber-500/30"
    }
  }

  const getBlockerColor = (blocker: string) => {
    if (blocker.toLowerCase().includes("neutral") || blocker.toLowerCase().includes("htf")) {
      return "text-amber-400"
    }
    if (blocker.toLowerCase().includes("cooldown")) {
      return "text-blue-400"
    }
    return "text-slate-400"
  }

  const getHeartbeatHealthColor = (health: "HEALTHY" | "STALE" | "FAILED" | "UNKNOWN") => {
    switch (health) {
      case "HEALTHY":
        return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
      case "STALE":
        return "bg-amber-500/20 text-amber-300 border-amber-500/30"
      case "FAILED":
        return "bg-red-500/20 text-red-300 border-red-500/30"
      default:
        return "bg-slate-500/20 text-slate-300 border-slate-500/30"
    }
  }

  return (
    <Card className="bg-slate-900/40 border-slate-700/50">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
          <CardTitle className="text-sm font-mono text-slate-200 flex items-center gap-2">
            <Info className="w-4 h-4" />
            SYSTEM STATE / PATIENCE MONITOR
          </CardTitle>
          <Badge variant="outline" className="text-xs text-slate-500 border-slate-600">
            Read-Only Diagnostic
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* CRON EXECUTION HEARTBEATS - MANDATORY */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-3">
            <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
            <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">CRON EXECUTION HEARTBEATS (MANDATORY)</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {heartbeats.map((hb) => {
              const health = CronHeartbeat.getHealthStatus(hb.symbol)
              const timeSince = CronHeartbeat.getFormattedTimeSinceExecution(hb.symbol)
              const lastExecTime = CronHeartbeat.formatTimestamp(hb.lastExecutionTime)

              return (
                <div key={hb.symbol} className="bg-slate-900/50 rounded p-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-300">{hb.symbol}</span>
                    <Badge className={getHeartbeatHealthColor(health)}>
                      {health}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span className="text-slate-400">{timeSince}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    Exec: <span className="text-slate-300 font-mono">{lastExecTime}</span>
                  </div>
                  <div className="text-xs text-slate-600">
                    #{hb.executionCount} executions
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-slate-600 mt-2 pt-2 border-t border-slate-700/50">
            <span className="text-slate-400 font-mono">ℹ️</span> If status shows UNKNOWN, the system was recently deployed. Heartbeats populate after first cron run (~2-5min). For persistent tracking across deploys, enable Upstash Redis in environment variables.
          </p>
        </div>

        {/* NEAR-MISS MONITOR - DIAGNOSTIC ONLY */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">NEAR-MISS MONITOR (DIAGNOSTIC ONLY)</p>
          </div>

          {nearMisses.length === 0 ? (
            <div className="text-sm text-slate-400">
              <p>No near-miss data available yet. System is collecting data...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {nearMisses.map((nm) => {
                const latest = nm.recentNearMisses[0]
                const hasNearMisses = nm.stats.count24h > 0

                return (
                  <div
                    key={nm.symbol}
                    className="bg-slate-900/50 rounded p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-mono font-semibold text-slate-200">{nm.symbol}</span>
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          hasNearMisses ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : "bg-slate-700/30 text-slate-400"
                        }`}
                      >
                        {hasNearMisses ? `${nm.stats.count24h} in 24h` : "None"}
                      </Badge>
                    </div>

                    {latest && (
                      <div className="space-y-2 text-xs">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-slate-500">Direction</p>
                            <p className="text-slate-300 font-mono">
                              {latest.direction}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500">Score Gap</p>
                            <p className="text-slate-300 font-mono">
                              {latest.scoreGap} away ({latest.scorePercentage}%)
                            </p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-slate-500">Primary Blocker</p>
                            <p className="text-slate-300 font-mono">
                              {latest.blockers[0] || "Unknown"}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500">HTF Polarity</p>
                            <p className="text-slate-300 font-mono">
                              {latest.htfPolarity}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500">Classification</p>
                            <p className="text-slate-300 font-mono">
                              {latest.classification}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {hasNearMisses && (
                      <div className="text-xs border-t border-slate-700/50 pt-2">
                        <p className="text-slate-500 mb-1">
                          <span className="text-slate-400">Most Common Blocker:</span>{" "}
                          <span className="text-slate-300 font-mono">
                            {nm.stats.mostCommonBlocker || "N/A"}
                          </span>
                        </p>
                        <p className="text-slate-500">
                          <span className="text-slate-400">Direction Bias:</span>{" "}
                          <span className="text-slate-300 font-mono">
                            LONG {nm.stats.longVsShort.long} / SHORT{" "}
                            {nm.stats.longVsShort.short}
                          </span>
                        </p>
                        <p className="text-slate-500">
                          <span className="text-slate-400">Avg Gap:</span>{" "}
                          <span className="text-slate-300 font-mono">
                            {nm.stats.avgScoreGap.toFixed(2)}
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <p className="text-xs text-slate-600 mt-3 pt-3 border-t border-slate-700/50">
            <span className="text-amber-400 font-mono">⚠️</span> DIAGNOSTIC ONLY: Near-misses are NOT trade signals. They prove the system correctly filters low-confidence setups. These setups do NOT trigger entries and are for analysis only.
          </p>
        </div>

        {/* B-TRADE MONITOR - EARLY STRUCTURE DETECTION */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-blue-400" />
            <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">B-SETUP MONITOR (EARLY STRUCTURE)</p>
          </div>

          {bTrades.length === 0 ? (
            <div className="text-sm text-slate-400">
              <p>No B-setup data available yet. System is collecting data...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {bTrades.map((bt) => {
                const latest = bt.recentBSetups[0]
                const hasBSetups = bt.stats.count24h > 0

                return (
                  <div
                    key={bt.symbol}
                    className="bg-slate-900/50 rounded p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-mono font-semibold text-slate-200">{bt.symbol}</span>
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          hasBSetups ? "bg-blue-500/20 text-blue-300 border-blue-500/30" : "bg-slate-700/30 text-slate-400"
                        }`}
                      >
                        {hasBSetups ? `${bt.stats.count24h} in 24h` : "None"}
                      </Badge>
                    </div>

                    {latest && (
                      <div className="space-y-2 text-xs">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-slate-500">Direction</p>
                            <p className="text-slate-300 font-mono">
                              {latest.direction}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500">Classification</p>
                            <p className="text-slate-300 font-mono">
                              {latest.classification}
                            </p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-slate-500">Primary Blocker</p>
                            <p className="text-slate-300 font-mono">
                              {latest.primaryBlocker || "None"}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500">ADX Gap</p>
                            <p className="text-slate-300 font-mono">
                              {latest.indicatorGaps.adx}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500">Upgraded</p>
                            <p className="text-slate-300 font-mono">
                              {latest.upgraded}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {hasBSetups && (
                      <div className="text-xs border-t border-slate-700/50 pt-2">
                        <p className="text-slate-500 mb-1">
                          <span className="text-slate-400">Upgraded to A/A+:</span>{" "}
                          <span className="text-slate-300 font-mono">
                            {bt.stats.upgradedToA + bt.stats.upgradedToAPlus} times
                          </span>
                        </p>
                        <p className="text-slate-500">
                          <span className="text-slate-400">Direction Bias:</span>{" "}
                          <span className="text-slate-300 font-mono">
                            LONG {bt.stats.directionalBias.long} / SHORT{" "}
                            {bt.stats.directionalBias.short}
                          </span>
                        </p>
                        <p className="text-slate-500">
                          <span className="text-slate-400">Avg ADX Gap:</span>{" "}
                          <span className="text-slate-300 font-mono">
                            {bt.stats.avgIndicatorGap.adx}
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <p className="text-xs text-slate-600 mt-3 pt-3 border-t border-slate-700/50">
            <span className="text-blue-400 font-mono">ℹ️</span> B-SETUPS: Early structure recognition showing setups that improved but didn't reach A-tier. Tracks potential future signals and system sensitivity.
          </p>
        </div>

        {/* HTF Polarity Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* HTF Polarity */}
          <div className="space-y-1">
            <p className="text-xs text-slate-500 uppercase tracking-wide">HTF Polarity</p>
            <div className="flex items-center gap-2">
              {getPolarityIcon(metrics.htfPolarity)}
              <Badge className={getPolarityColor(metrics.htfPolarity)}>
                {metrics.htfPolarity}
              </Badge>
            </div>
          </div>

          {/* Neutral Duration */}
          <div className="space-y-1">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Neutral Duration</p>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <span className={`text-sm font-mono ${metrics.htfPolarity === "NEUTRAL" ? "text-amber-400" : "text-slate-400"}`}>
                {metrics.htfPolarity === "NEUTRAL" ? metrics.htfNeutralFormatted || "0m" : "--"}
              </span>
            </div>
          </div>

          {/* Last Aligned */}
          <div className="space-y-1">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Last Aligned</p>
            <div className="flex items-center gap-2">
              {metrics.lastHTFDirection ? (
                <>
                  {getPolarityIcon(metrics.lastHTFDirection)}
                  <span className="text-sm font-mono text-slate-300">
                    {metrics.lastHTFAlignedFormatted || "Never"}
                  </span>
                </>
              ) : (
                <span className="text-sm text-slate-500">No record</span>
              )}
            </div>
          </div>

          {/* Last Valid Setup */}
          <div className="space-y-1">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Last A/A+ Setup</p>
            <div className="flex items-center gap-2">
              {metrics.lastValidSetupTier ? (
                <>
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-mono text-slate-300">
                    {metrics.hoursSinceLastValidSetup !== null 
                      ? `${metrics.hoursSinceLastValidSetup}h ago` 
                      : "Unknown"}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {metrics.lastValidSetupTier}
                  </Badge>
                </>
              ) : (
                <span className="text-sm text-slate-500">No record</span>
              )}
            </div>
          </div>
        </div>

        {/* GET_READY State - XAU UI Display */}
        {getReadyState && (
          <div className={`pt-2 border-t ${getReadyState.isGetReady ? "border-cyan-500/50 bg-cyan-950/20" : "border-slate-700/50"} rounded-lg p-3`}>
            <div className="flex items-center gap-2 mb-2">
              <Eye className={`w-4 h-4 ${getReadyState.isGetReady ? "text-cyan-400" : "text-slate-500"}`} />
              <p className="text-xs text-slate-500 uppercase tracking-wide">GET READY STATUS</p>
              {getReadyState.isGetReady && (
                <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 text-xs">
                  ACTIVE
                </Badge>
              )}
            </div>
            
            {getReadyState.isGetReady ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-400">Direction:</span>
                  <Badge className={getReadyState.direction === "LONG" 
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" 
                    : "bg-red-500/20 text-red-300 border-red-500/30"}>
                    {getReadyState.direction}
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-400">HTF Polarity:</span>
                  <span className="text-sm text-cyan-300">{getReadyState.htfPolarity}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-400">Structural:</span>
                  <span className="text-sm text-slate-300">
                    {getReadyState.structuralConditionsMet}/{getReadyState.structuralConditionsRequired} conditions
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-400">Awaiting:</span>
                  <span className="text-sm text-amber-300">{getReadyState.primaryBlocker}</span>
                </div>
                <p className="text-xs text-cyan-400/70 mt-2 pt-2 border-t border-cyan-500/20">
                  NOT A TRADE - Informational only. Entry alert fires when all criteria met.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm text-slate-400">
                  {getReadyState.blockedReason || "Conditions not met for GET READY"}
                </p>
                <p className="text-xs text-slate-500">
                  HTF: {getReadyState.htfPolarity} | Indicators: {getReadyState.indicatorConditionsMet ? "OK" : "Not met"}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Primary Blocker */}
        <div className="pt-2 border-t border-slate-700/50">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Current Primary Blocker</p>
              <p className={`text-sm ${getBlockerColor(metrics.currentPrimaryBlocker)}`}>
                {metrics.currentPrimaryBlocker}
              </p>
            </div>
          </div>
        </div>

        {/* No Trade Summary */}
        {metrics.noTradeSummary && (
          <div className="pt-2 border-t border-slate-700/50 bg-slate-800/30 rounded-lg p-3">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Why No Trade</p>
            <p className="text-sm text-slate-300 leading-relaxed">
              {metrics.noTradeSummary.explanation}
            </p>
            {metrics.noTradeSummary.blockingReasons.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {metrics.noTradeSummary.blockingReasons.slice(0, 3).map((reason, i) => (
                  <Badge key={i} variant="outline" className="text-xs text-slate-400 border-slate-600">
                    {reason}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <p className="text-xs text-slate-600 text-center pt-2">
          This panel is informational only. Strategy behavior unchanged.
        </p>
      </CardContent>
    </Card>
  )
}
