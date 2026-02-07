# Troubleshooting Guide & Diagnostic Commands

## Quick Diagnostics

### 1. Verify Caching is Working

**In Browser Console:**
```javascript
// Check if cache exists
const cached = localStorage.getItem("lastValidSignalXAU")
console.log("Cache exists:", !!cached)

// View cached data
if (cached) {
  const data = JSON.parse(cached)
  console.log("Cached signal:", data)
  console.log("Market was:", data.marketClosed ? "CLOSED" : "OPEN")
  console.log("Age (seconds):", (Date.now() - data.timestamp) / 1000)
}

// Clear cache if needed (fresh start)
localStorage.removeItem("lastValidSignalXAU")
window.location.reload()
```

### 2. Test API Directly

**Using curl:**
```bash
# Test XAU signal
curl "https://your-domain.vercel.app/api/signal/current?symbol=XAU_USD"

# Test XAG signal
curl "https://your-domain.vercel.app/api/signal/current?symbol=XAG_USD"

# Expected response during market hours:
# {"success":true,"signal":{...},"timestamp":"...","marketClosed":false}

# Expected response during market closed:
# {"success":true,"signal":{...},"marketClosed":true}

# Expected response when API fails:
# {"success":false,"error":"...","marketClosed":true,"details":"..."}
```

**Using browser:**
```javascript
// In console
fetch("/api/signal/current?symbol=XAU_USD")
  .then(r => r.json())
  .then(d => console.log(d))

// Should show full signal object with indicators
```

### 3. Check Component Rendering

**Verify all components render:**
```javascript
// In React DevTools
// Look for these in component tree:
// ├─ GoldTradingDashboard
//   ├─ GoldPriceDisplay
//   ├─ GoldSignalPanel
//   ├─ MTFBiasViewer
//   ├─ IndicatorCards
//   └─ EntryChecklist

// If any are missing, check console for errors
```

### 4. Validate Indicator Data

**In console after API response loads:**
```javascript
// Get signal from page state (debug only)
// Check if indicators exist:
const signal = window.__signal; // May not be available

// Or check by fetching:
fetch("/api/signal/current?symbol=XAU_USD")
  .then(r => r.json())
  .then(d => {
    console.log("ADX:", d.signal?.indicators?.adx)
    console.log("ATR:", d.signal?.indicators?.atr)
    console.log("StochRSI:", d.signal?.indicators?.stochRSI)
    console.log("VWAP:", d.signal?.indicators?.vwap)
  })

// All should be numbers or objects, not undefined
```

## Common Issues & Solutions

### Issue 1: "No Signal Available" on App Load

**Symptoms:**
- UI shows error card immediately
- No data even after refresh

**Diagnosis Steps:**
```javascript
// 1. Check if cache exists
localStorage.getItem("lastValidSignalXAU")

// 2. Check browser console for errors
// Look for: "[v0] Signal fetch error:" or JavaScript errors

// 3. Check API response status
fetch("/api/signal/current?symbol=XAU_USD")
  .then(r => console.log("Status:", r.status))
  .catch(e => console.error("Fetch failed:", e))

// 4. Check market hours
// Gold market should be open Mon-Fri 17:00 UTC to Sat 04:00 UTC
```

**Solutions:**
- If it's weekend: Cache will load, API will return 503
- If it's weekday: Check OANDA_API_KEY in environment variables
- If API returns 500: Check backend logs in Vercel
- Clear cache and refresh: `localStorage.clear(); window.location.reload()`

### Issue 2: Indicator Cards Show "DATA ERROR"

**Symptoms:**
- MTF Viewer works, but Indicator Cards show error
- Message: "Indicators missing from API response"

**Diagnosis:**
```javascript
// Check API response structure
fetch("/api/signal/current?symbol=XAU_USD")
  .then(r => r.json())
  .then(d => {
    console.log("Has indicators?", !!d.signal?.indicators)
    console.log("Indicators object:", d.signal?.indicators)
    console.log("ADX value:", d.signal?.indicators?.adx)
  })
```

**Solutions:**
- **During market hours**: Wait 5-10 minutes for indicators to calculate
- **ADX = 0**: Trends too weak, indicator calculating
- **ATR = undefined**: Volatility data missing, API issue
- **Retry after 1-2 minutes** - indicators need data accumulation

### Issue 3: Market Closed Banner Always Shows

**Symptoms:**
- Banner shows "Market closed" even during market hours
- Timestamp is old (from previous session)

**Diagnosis:**
```javascript
// Check market status tracking
const cached = JSON.parse(localStorage.getItem("lastValidSignalXAU"))
console.log("Cached marketClosed flag:", cached?.marketClosed)
console.log("Cached age (hours):", (Date.now() - cached?.timestamp) / 3600000)

// Check API response
fetch("/api/signal/current?symbol=XAU_USD")
  .then(r => r.json())
  .then(d => console.log("API says market open:", !d.marketClosed))
```

**Solutions:**
- **Cache is stale**: Clear and refresh
  ```javascript
  localStorage.removeItem("lastValidSignalXAU")
  window.location.reload()
  ```
- **Market really is closed**: Shows only during weekends/holidays
- **API reports wrong status**: Restart app or wait 60 seconds for refresh

### Issue 4: Synthetic Data Warning Keeps Showing

**Symptoms:**
- Amber warning banner shows "Using generated data"
- OANDA data isn't loading

**Diagnosis:**
```javascript
// Check which data source is being used
fetch("/api/signal/current?symbol=XAU_USD")
  .then(r => r.json())
  .then(d => console.log("Data source:", d.dataSource))

// Check for OANDA API errors in backend logs
```

**Solutions:**
1. **Missing API Key:**
   - Vercel > Project Settings > Environment Variables
   - Add OANDA_API_KEY and OANDA_ACCOUNT_ID
   - Redeploy project
2. **OANDA API Down:**
   - Check https://fxlab.oanda.com/
   - Synthetic data is fallback, trading signals still work
3. **Account Disabled:**
   - Verify OANDA credentials are correct
   - Check account permissions

### Issue 5: Polling Doesn't Switch from 60s to 1h on Weekends

**Symptoms:**
- API called every 60 seconds even on Saturday/Sunday

**Diagnosis:**
```javascript
// Check polling interval
const day = new Date().getDay()
const isWeekend = day === 0 || day === 6
console.log("Day:", day, "Is weekend:", isWeekend)

// Check what interval is set
// (This is internal to component, not accessible)
```

**Solutions:**
- Polling interval is recalculated on component mount
- Refresh page on Saturday/Sunday to reset
- Or wait ~1 hour for interval to adjust

### Issue 6: Refresh Button Doesn't Update Data

**Symptoms:**
- Click Refresh → spinner shows → nothing changes

**Diagnosis:**
```javascript
// Check if fetchSignals function exists
// Test API manually:
fetch("/api/signal/current?symbol=XAU_USD")
  .then(r => r.json())
  .then(d => console.log("API responds:", d))

// Check for errors in console
// Look for "[v0] Signal fetch error:"
```

**Solutions:**
1. **Network Error:**
   - Check internet connection
   - Try in incognito mode (no extensions)
2. **API Timeout:**
   - May take 2-3 seconds
   - Wait longer before clicking again
3. **Component Error:**
   - Check browser console for React errors
   - Try hard refresh: Ctrl+Shift+R (or Cmd+Shift+R)

## Vercel Deployment Troubleshooting

### Check Build Status

```bash
# 1. View deployment logs
# Vercel Dashboard > Deployments > [Latest]
# Look for "Build Output" tab

# 2. Common build errors:
# - "Cannot find module" → Missing dependency, run npm install
# - "TypeScript error" → Type mismatch, check compilation
# - "Parsing ecmascript failed" → Syntax error in JSX
```

### Check Function Logs

```bash
# 1. Access function logs
# Vercel Dashboard > Deployments > [Latest] > Function Logs

# 2. Look for patterns:
# ✅ "[v0] API Request for XAU_USD - Market Status:"
# ✅ "[v0] Data loaded: Daily=100, 4H=200..."
# ❌ "Error fetching candle data:"
# ❌ "Error: Cannot find name 'OANDA_API_KEY'"

# 3. Watch logs in real-time:
# vercel logs --tail
```

### Environment Variables Missing

```bash
# 1. Check what's set
# Vercel > Project Settings > Environment Variables

# 2. Required variables:
# OANDA_ACCOUNT_ID
# OANDA_API_KEY
# TELEGRAM_BOT_TOKEN
# TELEGRAM_CHAT_ID

# 3. Redeploy after adding/changing:
# Don't commit, just use Vercel Dashboard "Redeploy" button
```

## Performance Monitoring

### Measure Response Times

```javascript
// Time API calls
console.time("API Call")
fetch("/api/signal/current?symbol=XAU_USD")
  .then(r => r.json())
  .then(d => {
    console.timeEnd("API Call")
    console.log("Response size (KB):", JSON.stringify(d).length / 1024)
  })

// Expected: <1s during market hours, <2s if from cache
```

### Monitor Cache Hit Ratio

```javascript
// Approximate cache effectiveness
fetch("/api/signal/current?symbol=XAU_USD")
  .then(r => r.json())
  .then(d => {
    if (d.cached) {
      console.log("CACHE HIT: Served from backend cache")
    } else {
      console.log("FRESH FETCH: New data from OANDA")
    }
  })
```

## Debug Mode

### Enable Verbose Logging

In `/app/page.tsx`, add to fetchSignals():
```javascript
console.log("[v0] DEBUG: Fetch started")
console.log("[v0] DEBUG: Response:", xauData)
console.log("[v0] DEBUG: Signal set to:", signalXAU)
console.log("[v0] DEBUG: Cache updated to:", localStorage.getItem("lastValidSignalXAU"))
```

### Watch State Changes

```javascript
// In React DevTools Profiler:
// 1. Open DevTools > Profiler tab
// 2. Record interaction
// 3. Look for state updates:
//    - signalXAU changes
//    - loading changes
//    - marketClosed changes
```

## Escalation Checklist

Before contacting support, verify:
- [ ] Environment variables set (OANDA_API_KEY, TELEGRAM tokens)
- [ ] Browser console has no JavaScript errors
- [ ] Cache cleared and page refreshed
- [ ] Tested API endpoint directly with curl
- [ ] Checked Vercel function logs for errors
- [ ] Confirmed market is actually open (not weekend)
- [ ] OANDA API status is green
- [ ] No typos in environment variable names
- [ ] Project redeployed after setting new env vars

**Include in support request:**
1. Screenshot of error
2. Browser console logs (paste as code)
3. Vercel function log excerpt
4. Time error occurred (in UTC)
5. Steps to reproduce
