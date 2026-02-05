# XPTSwitch Swing Trading System

## Overview
The system now operates in **SWING MODE** - designed to capture larger 1H-4H timeframe moves without constant monitoring.

## Key Changes for Hands-Off Trading

### 1. Higher Timeframe Profit Targets
- **OLD:** Fixed 3% profit targets
- **NEW:** Dynamic targets based on 4H resistance levels
  - TP1: 50% of move to 4H resistance (partial profit)
  - TP2: Full 4H resistance target
  - TP3: Extended 2% beyond resistance (let winners run)

### 2. Wider 4H Chandelier Stops
- **OLD:** 1H Chandelier Exit (too tight for swings)
- **NEW:** 4H Chandelier Exit (gives trades room to breathe)
  - 22-period lookback on 4H chart
  - 3x ATR multiplier
  - Trails as price moves in your favor

### 3. Trade Management
**Entry:**
- 5M/15M used only for precise entry timing
- 1H/4H must be aligned in your direction
- Enter when all timeframes confirm

**During Trade:**
- Take 50% profit at TP1 (secures partial gains)
- Move stop to breakeven after TP1 hit
- Trail remaining 50% with 4H Chandelier Exit
- Let the rest run to TP2/TP3

**Exit:**
- TP2: Close another 30% (80% total closed)
- TP3: Final 20% for maximum gains
- OR exit when 4H Chandelier stop is hit

### 4. No Constant Monitoring Required
The system alerts you via Telegram when:
- New swing setup forms (Level 2/3)
- Entry triggered
- Approaching profit targets

You DON'T need to watch the charts constantly. The 4H Chandelier trailing stop protects your downside while capturing full swing moves.

## Example Trade Scenarios

### Scenario 1: LONG Breakout Swing
\`\`\`
Entry: $2,335 (1H breakout, 4H uptrend confirmed)
Stop: $2,310 (4H Chandelier Exit)
TP1: $2,360 (50% profit, partial close)
TP2: $2,375 (4H resistance)
TP3: $2,385 (extended target)

Trade Management:
1. Enter full position at $2,335
2. At TP1 ($2,360): Close 50%, move stop to breakeven
3. Trail remaining 50% with 4H Chandelier
4. At TP2 ($2,375): Close 30% more
5. Trail final 20% to TP3 or stop out
\`\`\`

### Scenario 2: SHORT Breakdown Swing
\`\`\`
Entry: $2,350 (1H breakdown, 4H downtrend confirmed)
Stop: $2,375 (4H Chandelier Exit)
TP1: $2,325 (50% profit, partial close)
TP2: $2,310 (4H support)
TP3: $2,300 (extended target)
\`\`\`

## Confidence Scores

### Optimized for Swing Reliability
- **Level 3 (80%+):** Enter immediately, all systems aligned
- **Level 2 (60-79%):** Strong setup, place limit order
- **Level 1 (50-59%):** Monitor only, wait for confirmation

Only Level 2+ signals are sent via Telegram to reduce noise.

## Risk Management

### Position Sizing
- Risk 1-2% of capital per trade
- Wider stops = smaller position size
- Use TP1 to lock in gains early

### Stop Loss Discipline
- NEVER move stop against you
- ALWAYS trail with 4H Chandelier after TP1
- Accept the stop if hit (don't revenge trade)

## Benefits of Swing Approach

1. **Larger Profits:** Capturing full 1H-4H moves (typically 3-8%)
2. **Less Stress:** No need to watch every 5M candle
3. **Better Win Rate:** Higher timeframe = cleaner signals
4. **Trailing Stops:** Maximize gains without constant monitoring
5. **Telegram Alerts:** Stay informed without being glued to charts

## System Requirements

You should:
- Check Telegram for alerts 2-3 times per day
- Set entry orders when Level 2 signals appear
- Trust the 4H Chandelier Exit trailing stop
- Take partial profits at TP1 (critical!)
- Let remaining position run to full targets

The system does the analysis. You manage the trade with simple rules.
