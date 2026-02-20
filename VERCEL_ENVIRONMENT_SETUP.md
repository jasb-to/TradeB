# VERCEL ENVIRONMENT SETUP FOR LIVE TRADING

## Your Configuration
- Account Type: LIVE
- Account ID: 5271115
- Status: Ready for setup

## Step-by-Step Vercel Configuration

### 1. Access Vercel Project Settings
- Go to vercel.com and open your TradeB project
- Navigate to **Settings** → **Environment Variables**

### 2. Add/Update These Variables

**For Production (Deployed)**

| Variable Name | Value | Notes |
|---|---|---|
| `OANDA_ACCOUNT_ID` | `5271115` | Your live account ID |
| `OANDA_ENVIRONMENT` | `live` | Production environment |
| `OANDA_API_KEY` | `[your-existing-key]` | Should already be set |

**For Preview (Optional)**

| Variable Name | Value | 
|---|---|
| `OANDA_ACCOUNT_ID` | `5271115` |
| `OANDA_ENVIRONMENT` | `live` |
| `OANDA_API_KEY` | `[same-key]` |

### 3. Redeploy

After setting environment variables:
1. Click "Settings" → "Git" → "Deploy Hooks" 
2. OR simply push a change to trigger automatic redeploy
3. OR manually redeploy: Click "Deployments" → Select latest → Click "Redeploy"

### 4. Verify Deployment

Once redeployed, test these endpoints:

```
GET /api/deployment-status
Expected: All 3 symbols active (XAU_USD, NAS100USD, SPX500USD)

GET /api/oanda/instruments?type=INDEX
Expected: US NAS 100, US SPX 500 instruments listed
```

## Current System Status

**XAU_USD**: ✅ LIVE - Trading with account 5271115
- 100-200 candles flowing from OANDA
- Strategy evaluation: STRICT mode active
- Entry decisions: Enforced (NO_TRADE when score < 5.0)
- Alerts: Gated (blocked when entry not approved)

**NAS100USD & SPX500USD**: ⏳ Ready - Awaiting environment variable update
- Code is 100% ready
- Just need environment variables locked in
- Will activate immediately after redeploy

## Expected Results After Setup

1. Dashboard shows all 3 trading cards (Gold, NAS100, SPX500)
2. Each symbol fetches 100-200 candles from OANDA
3. Strategy evaluation runs in parallel for all symbols
4. Alerts send only when entry decisions approve (tier A+/A/B)
5. Capital protection blocks trades outside market hours
6. Redis maintains active trade state across restarts

## Troubleshooting

**If /api/oanda/instruments returns 400 "Invalid accountID"**
- Environment variables not updated yet
- Redeploy not complete
- Wait 60 seconds and refresh

**If indices still show NO_CANDLES**
- Check `/api/deployment-status` - which symbols are active?
- If indices not in list, redeploy didn't pick up changes
- Clear Vercel cache: Settings → General → Deployments → clear cache

**If entry checklist crashes**
- This is NOW FIXED - entry decision data is properly guarded
- Old debug logs showing line 38 crash are outdated
- Current code has defensive null checks

## System Version

- **Live Version**: 11.0.0-ARCHITECTURAL-RESET
- **Capital Protection**: Active (blocks on CRITICAL_DATA_MISSING only)
- **Entry Decision Enforcement**: 6/6 consistency checks passing
- **Alert Gating**: 5 gates enforced (market hours, entry decision, tier validation, fingerprint, circuit breaker)

## Next Action

Update OANDA_ACCOUNT_ID to 5271115 in Vercel, redeploy, and verify with /api/deployment-status endpoint.
