# Higher-Timeframe Directional Polarity Implementation (Gold Only)

## Overview

Gold (XAU/USD) now enforces **directional polarity locking** - trade entries must align with the Higher-Timeframe (Daily + 4H) trend direction. Counter-trend entries are explicitly blocked regardless of momentum indicators.

## Key Components

### 1. HTF Polarity Detection (`detectHTFPolarity`)

Analyzes Daily and 4H timeframes using two factors:

**Structure Detection (HH/HL vs LH/LL):**
- **HH (Higher High)**: Successively higher highs → uptrend structure
- **HL (Higher Low)**: Higher lows with rising trend → uptrend continuation
- **LL (Lower Low)**: Successively lower lows → downtrend structure
- **LH (Lower High)**: Lower highs with declining trend → downtrend continuation

**VWAP Bias Anchor:**
- If price > VWAP: Bullish anchor (confirms uptrend)
- If price < VWAP: Bearish anchor (confirms downtrend)
- Mixed signals indicate neutral zone

**Result:**
- **LONG Polarity**: HH/HL structure + price above VWAP anchors
- **SHORT Polarity**: LL/LH structure + price below VWAP anchors
- **NEUTRAL**: Mixed or conflicting signals

### 2. Directional Locking Logic

\`\`\`
IF HTF trend ≠ NEUTRAL:
  ├─ Entry direction MUST match HTF trend
  ├─ Counter-trend entries: BLOCKED with "counterTrendBlocked: true"
  └─ Lower timeframes (1H/15M/5M): Timing only, direction ignored

IF HTF trend = NEUTRAL:
  └─ Entry: NO_TRADE (unclear polarity)
\`\`\`

### 3. Counter-Trend Blocking

**Example: HTF Trend DOWN, Signal suggests LONG**
\`\`\`
[v0] HTF POLARITY: SHORT (LL/LH structure + price below VWAP anchors)
[v0] COUNTER-TREND BLOCKED: HTF trend=SHORT but signal suggests LONG. 
     counterTrendBlocked: true
\`\`\`

Returned response:
\`\`\`json
{
  "type": "NO_TRADE",
  "direction": "NONE",
  "counterTrendBlocked": true,
  "htfTrend": "SHORT",
  "reasons": [
    "Counter-trend entry blocked: HTF SHORT-only regime",
    "(LL/LH structure + price below VWAP anchors)",
    "Lower timeframes suggesting opposite direction - ignored for directional alignment"
  ]
}
\`\`\`

### 4. Telegram Alert Enhancement

Alerts now include trend context:

\`\`\`
📊 HTF Trend: SHORT-only regime
   (LL/LH structure + price below VWAP anchors)
\`\`\`

This appears in all ENTRY signals, clearly stating which direction is allowed.

## Logging Output

### Success Path (Entry Approved)
\`\`\`
[v0] HTF POLARITY: LONG (HH/HL structure + price above VWAP anchors)
[v0] HTF Structure: Daily=HL, 4H=HH | Price vs VWAP: Daily=ABOVE 4H=ABOVE
[v0] SIGNAL GENERATED: SHORT at 4815.23, HTF Trend=SHORT
\`\`\`

### Blocked Counter-Trend Path
\`\`\`
[v0] HTF POLARITY: SHORT (LL/LH structure + price below VWAP anchors)
[v0] COUNTER-TREND BLOCKED: HTF trend=SHORT but signal suggests LONG. counterTrendBlocked: true
[v0] Skipped: No clear trend direction. Rejecting entry.
\`\`\`

### Neutral Zone Path
\`\`\`
[v0] HTF POLARITY: NEUTRAL (Mixed structure signals - no clear HTF trend)
[v0] HTF POLARITY NEUTRAL: No clear trend direction. Rejecting entry.
\`\`\`

## Signal Properties Added

\`\`\`typescript
interface Signal {
  counterTrendBlocked?: boolean    // true if entry blocked due to counter-trend
  htfTrend?: "LONG" | "SHORT" | "NEUTRAL"  // Detected HTF polarity
  trendContext?: string             // Descriptive reason (structure + VWAP)
}
\`\`\`

## Example Scenarios

### Scenario 1: Strong Uptrend, Valid LONG Entry
\`\`\`
Daily: HH structure, price above VWAP
4H: HL structure, price above VWAP
1H: LONG bias confirmed

Result: ✅ LONG entry allowed (aligns with HTF)
\`\`\`

### Scenario 2: Strong Downtrend, Invalid LONG Entry Blocked
\`\`\`
Daily: LL structure, price below VWAP
4H: LH structure, price below VWAP
1H: LONG bias from momentum (but trend is DOWN)

Result: ❌ LONG entry BLOCKED
Reason: counterTrendBlocked: true (HTF is SHORT-only)
\`\`\`

### Scenario 3: Neutral Zone, No Entry
\`\`\`
Daily: HL mixed signals
4H: Choppy structure

Result: ❌ NO_TRADE (HTF polarity = NEUTRAL)
Reason: Unclear trend direction
\`\`\`

## Integration Points

1. **Strategy File** (`lib/strategies.ts`):
   - `detectHTFPolarity()`: Main polarity analysis
   - `detectStructure()`: HH/HL/LL/LH detection
   - Modified `evaluateSignals()`: Enforces polarity locking

2. **XAU Route** (`app/api/signal/xau/route.ts`):
   - Passes HTF trend info to signals
   - Logs polarity decisions server-side

3. **Telegram Notifier** (`lib/telegram.ts`):
   - Displays HTF trend context in alerts
   - Clarifies which direction is allowed

## Gold Only Guarantee

This implementation applies **ONLY to Gold (XAU/USD)**. Silver strategy remains completely unchanged with its own risk control rules (ONE TRADE RULE, session filter, etc.).

## Rules Hierarchy

1. **HTF Polarity** (Highest): Must match - absolute blocker
2. **Daily/4H/1H alignment**: Must meet tier requirements
3. **Lower timeframe momentum** (Lowest): Used for timing only

Lower timeframes can never override HTF polarity.
