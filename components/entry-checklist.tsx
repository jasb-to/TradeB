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
  
  try {
    const entryDecision = signal?.entryDecision
    
    // DEFENSIVE GUARD 1: Must have entryDecision object
    if (!entryDecision) {
      return (
        <Card className="bg-slate-900/40 border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-sm font-mono">ENTRY CHECKLIST</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-400">No entry decision available</p>
          </CardContent>
        </Card>
      )
    }
    
    // DEFENSIVE GUARD 2: Safe access to criteria with default empty array
    const criteria = entryDecision?.criteria
    
    if (!Array.isArray(criteria) || criteria.length === 0) {
      return (
        <Card className="bg-slate-900/40 border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-sm font-mono">ENTRY CHECKLIST</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-400">No criteria data ({entryDecision?.tier})</p>
          </CardContent>
        </Card>
      )
    }

    // DEFENSIVE GUARD 3: Safe filter with null checks
    const passCount = (criteria || []).filter((c: any) => c && typeof c === 'object' && c.passed === true).length
    const totalCount = criteria.length
  
  // Tier score requirements - UPDATED TO 5.5 THRESHOLD
  const tierRequirements = [
    { tier: "A+", scoreRange: "7.0-9.0", requirement: "Premium: 5+ TF aligned + ADX ≥23.5", color: "text-yellow-400 bg-yellow-900/20" },
    { tier: "A", scoreRange: "6.0-6.99", requirement: "Good: 4+ TF aligned + ADX ≥21", color: "text-blue-400 bg-blue-900/20" },
    { tier: "B", scoreRange: "5.5-5.99", requirement: "Momentum-aligned: 1H+15M aligned + ADX ≥15", color: "text-slate-400 bg-slate-800/20" },
    { tier: "NO_TRADE", scoreRange: "<5.5", requirement: "Below threshold - entry not allowed", color: "text-red-400 bg-red-900/20" },
  ]
  
  const currentTierReq = tierRequirements.find(t => t.tier === entryDecision.tier)
  
  return (
    <Card className="bg-slate-900/40 border-slate-700/50">
      <CardHeader>
        <CardTitle className="text-sm font-mono flex justify-between items-center">
          <span>ENTRY CHECKLIST</span>
          <span className={`text-xs ${passCount >= 6 ? "text-green-400" : passCount >= 4 ? "text-yellow-400" : "text-red-400"}`}>
            {passCount}/{totalCount}
          </span>
        </CardTitle>
        <div className="text-xs text-slate-400 mt-2 space-y-1">
          <p>Tier: {entryDecision.tier} | Score: {entryDecision.score.toFixed(1)}/9</p>
        </div>
      </CardHeader>
      
      {/* Tier Requirements Reference Column */}
      <div className="px-6 py-3 border-b border-slate-700/30">
        <p className="text-xs font-semibold text-slate-300 mb-2">TIER SCORE REQUIREMENTS:</p>
        <div className="space-y-1">
          {tierRequirements.map((tier) => (
            <div 
              key={tier.tier}
              className={`p-2 rounded text-xs ${tier.color} ${tier.tier === entryDecision.tier ? "ring-1 ring-current" : "opacity-60"}`}
            >
              <div className="font-semibold">{tier.tier}: {tier.scoreRange}</div>
              <div className="text-xs opacity-90">{tier.requirement}</div>
            </div>
          ))}
        </div>
      </div>
      <CardContent className="space-y-2 pt-4">
        <p className="text-xs font-semibold text-slate-300 mb-3">CRITERIA EVALUATION:</p>
        {entryDecision.criteria.map((criterion, i) => (
          <div key={criterion.key} className="flex items-center gap-2 text-sm">
            {criterion.passed ? (
              <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
            ) : (
              <X className="w-4 h-4 text-red-400 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <span className={criterion.passed ? "text-green-300" : "text-red-300"}>
                {i + 1}. {criterion.label}
              </span>
              <p className="text-xs text-slate-500">{criterion.reason}</p>
              {/* Additional context for problematic criteria */}
              {criterion.key === "momentum_confirm" && !criterion.passed && (
                <p className="text-xs text-slate-600 italic">
                  Timing confirmation • Non-blocking
                </p>
              )}
              {criterion.key === "htf_polarity" && criterion.passed && (
                <p className="text-xs text-slate-600 italic">
                  Directional integrity verified (HTF matches direction)
                </p>
              )}
              {criterion.key === "htf_polarity" && !criterion.passed && (
                <p className="text-xs text-red-600 italic">
                  {criterion.reason.includes("not evaluated") && "HTF not evaluated — alignment required for A/A+"}
                  {criterion.reason.includes("neutral") && "HTF neutral — strict mode requires directional alignment"}
                  {criterion.reason.includes("≠") && criterion.reason}
                </p>
              )}
            </div>
          </div>
        ))}
        
        {entryDecision.blockedReasons.length > 0 && (
          <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 rounded">
            <p className="text-xs text-red-300 font-semibold">Blocked Reasons:</p>
            {entryDecision.blockedReasons.map((reason, i) => (
              <p key={i} className="text-xs text-red-300/70">• {reason}</p>
            ))}
          </div>
        )}
        
        {entryDecision.allowed && (
          <div className="mt-3 p-2 bg-green-500/10 border border-green-500/30 rounded">
            <p className="text-xs text-green-300 font-semibold">✓ Entry Approved</p>
            <p className="text-xs text-green-300/70">
              {entryDecision.tier} tier • {passCount}/{totalCount} criteria met
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  ) // close try block
  } catch (error) {
    console.error("[v0] EntryChecklist crash prevented:", error)
    return (
      <Card className="bg-slate-900/40 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-sm font-mono">ENTRY CHECKLIST</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-400">Component error (see logs)</p>
        </CardContent>
      </Card>
    )
  }
}

