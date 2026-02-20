## PRODUCTION DEPLOYMENT CHECKLIST - v11.0.0-ARCHITECTURAL-RESET

### CURRENT STATE
- ✅ Gold (XAU_USD): Fully operational, safe to trade
- ✅ Capital Protection Layer: Active and working
- ✅ Entry Decision Enforcement: Verified 
- ❌ Indices (NAS100USD, SPX500USD): Code ready but not deployed
- ⚠️ Diagnostic endpoint: Functional (old debug logs showing pre-fix state)

### ROOT CAUSE: Partial Deployment
Production only has `validSymbols: ["XAU_USD"]` which means:
- Local code has all 3 symbols
- Vercel deployment cache still has old bytecode (only XAU_USD)
- Need forced clean redeploy

---

## DEPLOYMENT STEPS (Execute in Order)

### STEP 1: Verify Current Deployment ✓
Endpoint: `GET /api/deployment-status`
Expected Response:
```json
{
  "status": "OK",
  "version": "11.0.0-ARCHITECTURAL-RESET",
  "symbols": ["XAU_USD", "NAS100USD", "SPX500USD"],
  "deploymentTime": "..."
}
```

### STEP 2: Fix Vercel Build Cache
1. Go to Vercel Project Settings
2. Find "Build & Development Settings"
3. Click "Clear Production Deployments"
4. Trigger redeploy: 
   - Option A: Git push to main branch
   - Option B: Vercel dashboard → "Redeploy"
   - Ensure: Use "Ignore Build Cache" option

### STEP 3: Verify Build Contains All Symbols
After redeploy, check:
```
https://your-vercel-url/api/deployment-status
```

Must show all 3 symbols. If still only shows XAU_USD → investigate:
- Git commit contains symbol-config.ts changes
- Environment variables not filtering symbols
- Build artifact issue

### STEP 4: Verify Diagnostic Endpoint
```
https://your-vercel-url/api/diagnostic/full-system
```
Should return full system health report without errors

### STEP 5: Verify UI Renders All Cards
1. Homepage should show 3 trading cards (Gold, US100, US500)
2. Each card should poll data from `/api/signal/current?symbol=SYMBOL`
3. Capital protection should allow/block signals correctly

---

## VERIFICATION CHECKLIST

### Before Going Live
- [ ] `/api/deployment-status` returns all 3 symbols
- [ ] `/api/signal/current?symbol=XAU_USD` returns valid signal (data flowing)
- [ ] `/api/signal/current?symbol=NAS100USD` returns valid signal (indices activated)
- [ ] `/api/signal/current?symbol=SPX500USD` returns valid signal (indices activated)
- [ ] Dashboard shows 3 trading cards without crashes
- [ ] Entry checklist doesn't crash on NO_TRADE signals
- [ ] Capital protection logging shows freshness checks (not blocking unless critical)
- [ ] Redis trade state accessible
- [ ] Telegram alerts functional for entry tiers

### Production Ready ✓
Once all checks pass:
- ✅ XAU_USD: 24/5 live trading enabled
- ✅ NAS100USD: 24/5 live trading enabled  
- ✅ SPX500USD: 24/5 live trading enabled
- ✅ Capital Protection: Active on all symbols
- ✅ Entry Decision Enforcement: Active on all symbols
- ✅ Institutional Grade: v11.0.0-ARCHITECTURAL-RESET fully deployed

---

## QUICK REFERENCE

**System Version**: 11.0.0-ARCHITECTURAL-RESET  
**Active Symbols**: ["XAU_USD", "NAS100USD", "SPX500USD"]  
**OANDA Names**: 
- XAU_USD → "XAU_USD"
- NAS100USD → "US NAS 100" (with spaces)
- SPX500USD → "US SPX 500" (with spaces)

**Entry Logic**: Score-based tiers (A+, A, B, NO_TRADE)  
**Capital Protection**: 3-layer (candle freshness, instrument hours, SAFE_MODE)  
**Safe to Trade**: YES (with capital protection active)
