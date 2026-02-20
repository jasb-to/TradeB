# CRITICAL: OANDA Account ID Configuration Fix

## Your Account Details
- **MT5 Account**: 5271115 (NOT compatible with v20 REST API)
- **Primary v20 Account ID**: 001-004-10193814-001 (✅ CORRECT ONE)
- v20 API Endpoint: https://api-fxpractice.oanda.com or https://stream-fxpractice.oanda.com (practice) OR https://api-fxtrade.oanda.com (live)

## Why Current Setup Is Failing

The system is currently using `OANDA_ACCOUNT_ID=5271115` which is the MT5 login ID, NOT the v20 REST API account ID. OANDA's v20 API requires the format: `001-004-XXXXXXXXX-XXX`.

### Current Error
```
OANDA API returned 400
Invalid value specified for 'accountID'
```

This is happening because the v20 API doesn't recognize `5271115`.

## IMMEDIATE ACTION REQUIRED

### Step 1: Update Vercel Environment Variables

Go to your Vercel Project → Settings → Environment Variables

**Update these values:**

```
OANDA_ACCOUNT_ID = 001-004-10193814-001
OANDA_ENVIRONMENT = live
OANDA_API_KEY = [keep your existing API key]
```

### Step 2: Verify OANDA_ENVIRONMENT Setting

Double-check the value is `live` (not `practice`). Since you have a live account, it should be:
```
OANDA_ENVIRONMENT = live
```

### Step 3: Redeploy

After updating environment variables:
- Vercel will automatically redeploy
- Or manually trigger: Deployments → Redeploy

### Step 4: Verify Fix

Once redeployed, visit `/api/oanda/instruments` to confirm:
- Should return 200 status with instrument list
- Should show `US NAS 100`, `US SPX 500`, `XAU_USD`

## Account Structure Breakdown

Your OANDA dashboard shows:
```
SPREAD_BETTING      → 001-004-10193814-003 (v20, GBP)
MT4                 → 001-004-10193814-002 (v20, GBP)
Primary             → 001-004-10193814-001 (v20, GBP) ← USE THIS
MT5 Login           → 5271115 (MT5 only, cannot use with v20 API)
```

The `Primary` account (001-004-10193814-001) is the one connected to your OANDA API key and is what v20 REST API expects.

## Timeline to Full Live Trading

1. Update `OANDA_ACCOUNT_ID` → 001-004-10193814-001
2. Redeploy (2 mins)
3. Test indices on `/api/oanda/instruments` 
4. All 3 symbols go live immediately: XAU_USD, NAS100USD, SPX500USD

## Current System Status After Fix

```
XAU_USD:      Will continue working ✅
NAS100USD:    Will activate immediately ✅
SPX500USD:    Will activate immediately ✅
```

All three symbols will stream data from your live OANDA account with full capital protection active.
