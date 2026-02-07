# OANDA Authentication Issue - Root Cause Analysis

## Summary

Your Vercel logs show: **"OANDA authentication failed on both servers. Check your API key."** 

**This is NOT a market closed issue.** The market's open/closed status does NOT affect API authentication. This is a configuration issue with missing or invalid OANDA credentials.

---

## Root Cause: Missing Environment Variables

### Current Situation

The error occurs in `/lib/data-fetcher.ts` at lines 75-101:

```typescript
private async fetchFromOanda(timeframe: "5m" | "15m" | "1h" | "4h" | "8h" | "1d", limit: number): Promise<Candle[]> {
  const apiKey = process.env.OANDA_API_KEY  // ← This is undefined
  if (!apiKey) {
    throw new Error("OANDA_API_KEY not configured")
  }
  
  // ... tries to fetch with Bearer token ...
  // When API key is invalid/missing, OANDA returns 401 Unauthorized
  // Message: "OANDA authentication failed on both servers. Check your API key."
}
```

### Why Market Hours Don't Affect This

**Market Closed ≠ Authentication Error**

- **Market Closed**: Returns valid data (Friday close candles) or market-closed status message
- **Auth Failed (401)**: API rejects the request entirely - no data returned

Your logs show:
```
[v0] OANDA fetch failed: Error: OANDA authentication failed on both servers. Check your API key..
[v0] Falling back to synthetic data.
```

This means:
1. ✅ System tried OANDA (live server)
2. ✅ Got 401 Unauthorized (bad credentials)
3. ✅ Tried OANDA (practice server)  
4. ✅ Got 401 Unauthorized again
5. ✅ Fell back to synthetic data (safety mechanism working)

---

## Quick Fix (3 Steps)

### 1. Get OANDA Credentials
- Go to https://www.oanda.com/ and create account
- Generate API token in account settings
- Note your Account ID

### 2. Add to Vercel Project
- Vercel Dashboard → Your Project → Settings → Environment Variables
- Add: `OANDA_API_KEY=your_token`
- Add: `OANDA_ACCOUNT_ID=your_account_id`

### 3. Redeploy
- Go to Deployments
- Click Redeploy on latest build

---

## Verify Fix

**Before Fix (Current)**:
```
[v0] OANDA fetch failed: Error: OANDA authentication failed...
[v0] Using synthetic data for XAU_USD
```

**After Fix**:
```
[v0] Loaded 200 candles from OANDA (live)
[v0] Data loaded: Daily=100, 4H=200, 1H=200, 15M=200, 5M=200 (source: OANDA)
```

---

## Why System Still Works Without Credentials

Your system has **intelligent fallback**:
- Tries OANDA API first
- If 401 error → tries practice server
- If both fail → generates synthetic data
- Dashboard still works but with synthetic market data

This is why you see StochRSI displaying even without real data - it's calculating on synthetic candles.
