# Trading Indicator Troubleshooting Guide

## Issues Identified and Fixes Applied

### 1. VWAP Bias Display Issue (Daily Anchor Level showing "—N/A")

**Root Causes:**
- VWAP was being calculated from 1H candles instead of daily candles
- Daily VWAP represents the true anchor level for daily support/resistance
- Type validation wasn't strict enough, allowing 0 values to pass through

**Fixes Applied:**

#### Backend (app/api/signal/xau/route.ts):
```typescript
// Calculate VWAP from DAILY candles as anchor level (not 1H)
const dailyCandlesNormalized = dataDaily.candles?.map((c: any) => ({
  open: c.bid?.o || 0,
  high: c.bid?.h || 0,
  low: c.bid?.l || 0,
  close: c.bid?.c || 0,
  volume: c.volume || 1,
  time: c.time,
  timestamp: c.time || Date.now(),
})) || []

// Calculate VWAP from daily candles
const vwapResultDaily = dailyCandlesNormalized && dailyCandlesNormalized.length > 0
  ? TechnicalAnalysis.calculateVWAP(dailyCandlesNormalized)
  : { value: 0, bias: "FLAT" }
const vwapValueDaily = typeof vwapResultDaily === "object" ? vwapResultDaily.value : vwapResultDaily

// Secure assignment with type checking
const finalVWAPValue = typeof vwapValueDaily === "number" && vwapValueDaily > 0 
  ? vwapValueDaily 
  : (typeof closePrice === "number" && closePrice > 0 ? closePrice : 0)

indicators.vwap = finalVWAPValue
```

#### Frontend (components/mtf-bias-viewer.tsx):
```typescript
// Strict type validation and debugging
const dailyVWAP = signal?.indicators?.vwap ?? 0
const currentPrice = signal?.lastCandle?.close ?? 0

const getVWAPBias = () => {
  // Strict validation: both values must be valid numbers and non-zero
  if (typeof dailyVWAP !== "number" || dailyVWAP <= 0 || 
      typeof currentPrice !== "number" || currentPrice <= 0) {
    return "N/A"
  }
  const threshold = 0.002 // 0.2% threshold
  if (currentPrice > dailyVWAP * (1 + threshold)) return "BULLISH"
  if (currentPrice < dailyVWAP * (1 - threshold)) return "BEARISH"
  return "NEUTRAL"
}
```

**Data Flow Synchronization:**
- Daily candles fetched separately from 1H/4H/8H candles
- VWAP calculation uses full daily candle history (100 candles)
- Falls back to current price only if daily VWAP calculation fails
- Console logging at each step for debugging data quality

---

### 2. Stochastic RSI Functionality Issues

**Root Causes:**
- StochRSI is a complex indicator requiring minimum 14 + 3 = 17 candles
- Previous implementations used fallback value of 50, masking data issues
- State transitions not properly reflected in display

**Fix Structure (lib/indicators.ts):**

The calculation properly returns a structured object:
```typescript
{
  value: number | null,    // Actual stochastic RSI value 0-100 or null if calculating
  state: "CALCULATING" | "MOMENTUM_UP" | "MOMENTUM_DOWN" | "COMPRESSION"
}
```

**State Definitions:**
- **CALCULATING**: Insufficient candles (< 17). Value = null
- **MOMENTUM_UP**: StochRSI > 60. Shows positive momentum building
- **MOMENTUM_DOWN**: StochRSI < 40. Shows negative momentum building
- **COMPRESSION**: StochRSI 40-60. Shows consolidation phase or flat RSI range

**Frontend Display (components/indicator-cards.tsx):**
```typescript
const getStochStatusFromState = (data: { value: number | null; state: string }) => {
  // CALCULATING state - insufficient candles
  if (data.value === null || data.state === "CALCULATING") {
    return { label: "CALCULATING", color: "text-gray-400", width: "0%", isCalculating: true }
  }
  // State-based colors (from backend)
  switch (data.state) {
    case "MOMENTUM_UP":
      return { label: "MOMENTUM UP", color: "text-green-400", width: `${data.value}%` }
    case "MOMENTUM_DOWN":
      return { label: "MOMENTUM DOWN", color: "text-red-400", width: `${data.value}%` }
    case "COMPRESSION":
      return { label: "COMPRESSION", color: "text-yellow-400", width: `${data.value}%` }
  }
}
```

---

### 3. Real-Time Data Synchronization

**Critical Data Flow:**

```
API Route (GET /api/signal/xau) → 
  1. Fetch daily candles (100 records)
  2. Fetch 1H/4H/8H candles (200 records each)
  3. Calculate indicators from appropriate timeframe:
     - ADX/ATR from 1H candles
     - RSI from 1H candles
     - StochRSI from 1H candles (needs 17+ samples)
     - VWAP from DAILY candles (anchor level)
  4. Normalize all candle data (bid/ask prices)
  5. Build indicators object with proper type validation
  6. Analyze market state
  7. Return enhancedSignal with all data
     
Frontend Component (MTFBiasViewer) → 
  1. Receive signal object
  2. Extract indicators.vwap
  3. Extract lastCandle.close (current 1H price)
  4. Compare price vs VWAP with 0.2% threshold
  5. Display bias and anchor level
```

---

## Troubleshooting Checklist

### VWAP Displaying as N/A?

**Debug Steps:**

1. Check browser console for data validation logs:
   ```javascript
   // You should see:
   [v0] MTFBiasViewer - Data validation: {
     hasSignal: true,
     hasIndicators: true,
     vwapValue: 2450.75,  // Should be a number > 0
     vwapType: "number",
     currentPrice: 2451.20,
     priceType: "number"
   }
   ```

2. Check backend logs for VWAP calculation:
   ```
   [v0] Daily candles normalized: 100 candles, first=2440.50, last=2451.20
   [v0] XAU Daily VWAP Calculated: 2450.75 from 100 daily candles
   ```

3. If VWAP shows as 0 or undefined:
   - Check if daily candles are being fetched (100 records minimum)
   - Verify bid prices are populated: `c.bid?.o, c.bid?.h, c.bid?.l, c.bid?.c`
   - Check if TechnicalAnalysis.calculateVWAP is returning proper object

**Common Issues:**
- Market closed: Daily candles may not update. Falls back to current price.
- Data gap: If daily candles missing timestamps, normalization fails.
- Volume data missing: VWAP needs volume for accurate calculation.

### StochRSI Showing "CALCULATING"?

**Expected Behavior:**
- First API call will show CALCULATING (need 17+ candles minimum)
- After ~20 minutes of data collection, transitions to MOMENTUM_UP/DOWN/COMPRESSION
- During tight consolidation, shows COMPRESSION (don't trade)

**Debug:**
```javascript
// API response should show:
{
  value: null,           // null during CALCULATING
  state: "CALCULATING"
}

// After sufficient data:
{
  value: 75.3,          // 0-100 range
  state: "MOMENTUM_UP"  // directional state
}
```

**If stuck on CALCULATING:**
- Check candle count in API logs: need at least 17 for 1H candles
- Verify market is open (candles updating)
- Monitor for data fetch failures in console

### Indicator Data Quality Issues?

**Verification:**
1. Open browser DevTools → Network tab
2. Call `/api/signal/xau`
3. Check response includes:
   ```json
   {
     "signal": {
       "indicators": {
         "adx": 24.2,
         "atr": 31.95,
         "vwap": 2450.75,
         "stochRSI": {
           "value": 75.3,
           "state": "MOMENTUM_UP"
         }
       },
       "lastCandle": {
         "close": 2451.20
       }
     }
   }
   ```

4. Verify all numeric values are numbers (not strings)
5. Verify stochRSI is always an object (never a bare number)

---

## Architecture Best Practices Applied

### 1. Indicator Calculation Hierarchy
- **Daily Level**: VWAP (support/resistance anchor)
- **4H Level**: Market regime, HTF polarity
- **1H Level**: Entry confirmation (ADX, ATR, StochRSI, RSI)

### 2. Type Safety
- All numeric indicators properly validated
- StochRSI always returns structured object
- VWAP has strict > 0 check before display

### 3. Data Flow Separation
- Each timeframe calculated independently
- No cross-contamination of data sources
- Frontend receives canonical backend calculation

### 4. Fallback Handling
- VWAP falls back to current price if daily calc fails
- StochRSI returns null during CALCULATING state
- ADX/ATR return 0 if insufficient data (but logged)

---

## Real-Time Update Strategy

**Polling Interval:** 30 seconds during market hours
**Process:**
1. Fetch latest 1H candles (200 records)
2. Fetch latest daily candles (100 records)
3. Recalculate all indicators
4. Update signal state if major changes detected
5. Display updates automatically via React state

**Market Closed Handling:**
- Switches to 60-minute check interval
- Preserves last valid VWAP for reference
- Alerts when market reopens

---

## Monitoring and Maintenance

### Key Metrics to Watch
- StochRSI state transitions (should change within 4-8 candles)
- VWAP movement (should stay relatively stable over 30min)
- Data fetch latency (target < 2 seconds)

### Regular Checks
1. Verify daily VWAP calculation in logs (once per day)
2. Check StochRSI calculations reach proper states (during trading hours)
3. Monitor for data gaps or fetch failures
4. Validate indicator thresholds quarterly
