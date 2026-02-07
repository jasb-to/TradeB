"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle2, X } from "lucide-react"
import type { Signal } from "@/types/trading"

interface EntryChecklistProps {
  signal: Signal | null
}

export function EntryChecklist({ signal }: EntryChecklistProps) {
  // CANONICAL: Use ONLY entryDecision.criteria - do NOT recalculate
  // This is the single source of truth shared with backend alert logic
  const entryDecision = signal?.entryDecision
  
  if (!entryDecision) {
    return (
      <Card className="bg-slate-900/40 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-sm font-mono">ENTRY CHECKLIST</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-400">No signal data available</p>
        </CardContent>
      </Card>
    )
  }

  const passCount = entryDecision.criteria.filter((c) => c.passed).length
  const totalCount = entryDecision.criteria.length

  return (
    <Card className="bg-slate-900/40 border-slate-700/50">
      <CardHeader>
        <CardTitle className="text-sm font-mono flex justify-between items-center">
          <span>ENTRY CHECKLIST</span>
          <span className={`text-xs ${passCount >= 6 ? "text-green-400" : passCount >= 4 ? "text-yellow-400" : "text-red-400"}`}>
            {passCount}/{totalCount}
          </span>
        </CardTitle>
        <p className="text-xs text-slate-400 mt-2">Tier: {entryDecision.tier} | Score: {entryDecision.score.toFixed(1)}/9</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {entryDecision.criteria.map((criterion, i) => (
          <div key={criterion.key} className="flex items-center gap-2 text-sm">
            {criterion.passed ? (
              <CheckCircle2 className="w-4 h-4 text-green-400" />
            ) : (
              <X className="w-4 h-4 text-red-400" />
            )}
            <div className="flex-1 min-w-0">
              <span className={criterion.passed ? "text-green-300" : "text-red-300"}>{criterion.label}</span>
              <p className="text-xs text-slate-500">{criterion.reason}</p>
            </div>
          </div>
        ))}
        
        {entryDecision.blockedReasons.length > 0 && (
          <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 rounded">
            <p className="text-xs text-red-300">Blocked Reasons:</p>
            {entryDecision.blockedReasons.map((reason, i) => (
              <p key={i} className="text-xs text-red-300/70">• {reason}</p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
