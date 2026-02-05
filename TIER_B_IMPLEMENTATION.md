# TIER B TRADES - IMPLEMENTATION CONFIRMED ✅

## Tier Logic

### A+ Tier (Most Selective)
- **Requirements**: Score ≥7.5, ADX ≥23.5, Daily+4H+1H all aligned
- **Blocking**: Daily NOT aligned OR 4H NOT aligned = BLOCKED

### A Tier (Selective)
- **Requirements**: Score ≥5.5, ADX ≥19, Daily+4H+1H all aligned
- **Blocking**: Daily NOT aligned OR 4H NOT aligned = BLOCKED

### B Tier (Momentum-Driven) ⚠️ NEW
- **Requirements**: Score ≥4, ADX ≥18, **1H bias NOT neutral**
- **NO Daily/4H alignment required** - these can be neutral/mixed
- **Blocking**: ONLY if HTF is actively counter-trend (not if neutral)
- **Philosophy**: 1H + momentum + VWAP drive the trade

## Key Differences

| Criterion | A/A+ Tiers | B Tier |
|-----------|------------|--------|
| Daily alignment | **REQUIRED** | Optional (can be neutral) |
| 4H alignment | **REQUIRED** | Optional (can be mixed) |
| 1H bias | Must align | **PRIMARY DRIVER** |
| ADX minimum | 19-23.5 | 18 |
| HTF polarity | Must align | Can be neutral (not opposing) |

## Entry Decision Blocking Logic

\`\`\`typescript
// A/A+ tiers: Strict HTF requirements
if (tier === "A" || tier === "A+") {
  if (!dailyAligned) blockedReasons.push("Daily not aligned")
  if (!h4Aligned) blockedReasons.push("4H not aligned")
}

// B tier: NO Daily/4H requirement
// Only block if HTF actively opposes (not if neutral/mixed)
if (signal.htfTrend && signal.htfTrend !== "NEUTRAL" && signal.htfTrend !== signal.direction) {
  blockedReasons.push("Counter-trend detected")
}
\`\`\`

## Tier B Trade Scenarios (Examples)

### ✅ VALID Tier B Scenarios
1. **Daily neutral + 4H late + 1H LONG + VWAP support**
   - HTF mixed but 1H momentum clear → B tier entry allowed

2. **Daily LONG + 4H neutral + 1H LONG + RSI >50**
   - Some HTF support but not full alignment → B tier entry allowed

3. **Daily SHORT + 4H neutral + 1H SHORT + ADX 19**
   - HTF shows weakness but 1H shows direction → B tier entry allowed

### ❌ BLOCKED B Tier Scenarios
1. **Daily SHORT + 4H SHORT + 1H LONG**
   - HTF actively counter-trend → BLOCKED

2. **1H neutral + momentum weak**
   - No 1H direction → No B tier qualification

3. **ADX < 18**
   - Insufficient momentum → No entry

## Alert Dispatch Path

\`\`\`
external-cron → strategies.generateSignal() → buildEntryDecision()
  → tier determination (B allowed)
  → blocking check (B NOT blocked by Daily/4H)
  → allowed=true
  → TelegramNotifier.sendAlert()
\`\`\`

**NO health checks involved in alert path** ✅

## Logs to Watch For

When a Tier B trade triggers, you'll see:
\`\`\`
[v0] 🔵 TIER B APPROVED: 1H momentum-driven | Daily=NEUTRAL 4H=MIXED 1H=LONG
[v0] ENTRY DECISION: ✓ APPROVED | Tier B | Score 4.5/9
\`\`\`

## Health Checks (Isolated to Diagnostics Only)

These variables exist ONLY in `/app/api/system-diagnostics/route.ts`:
- `systemOperational`
- `isCronHealthy`
- `signalsAreFresh`
- `systemReadyForTrades`

**They are NOT used in:**
- Alert dispatch ✅
- Entry decision ✅
- Signal generation ✅
- Notification pipeline ✅

## Confirmation Checklist

- [x] Tier B determination does NOT require Daily+4H alignment
- [x] Blocking logic does NOT block Tier B on Daily/4H misalignment
- [x] 1H bias is primary driver for Tier B
- [x] HTF neutral is allowed for Tier B
- [x] No health checks in alert dispatch path
- [x] Diagnostic logs added for Tier B confirmation
