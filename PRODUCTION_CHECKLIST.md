# PRODUCTION LOCKDOWN CHECKLIST
## v1.0.0-live-autonomous

### Pre-Deployment Verification

#### 1. Environment Variables (MUST ALL BE SET)
- [ ] TRADING_ENABLED = "true"
- [ ] CRON_SECRET = [generated token]
- [ ] KV_REST_API_URL = [Vercel KV URL]
- [ ] KV_REST_API_TOKEN = [Vercel KV token]
- [ ] TELEGRAM_BOT_TOKEN = [active token]
- [ ] TELEGRAM_CHAT_ID = [valid chat ID]
- [ ] OANDA_TOKEN = [OANDA API key]
- NO development/test values in production

#### 2. Kill Switch Verification
```typescript
// Both endpoints check this before executing
if (process.env.TRADING_ENABLED !== "true") {
  return neutral_signal / skip_scan
}
```
- [ ] `/api/signal/current` has kill switch
- [ ] `/api/trades/scan` has kill switch
- [ ] Can disable trading instantly without redeploying

#### 3. Cron Configuration (vercel.json)
```json
{
  "crons": [
    { "path": "/api/cron/signal-xau", "schedule": "0 */4 * * *" },
    { "path": "/api/cron/signal-xag", "schedule": "15 */4 * * *" },
    { "path": "/api/cron/trade-scan", "schedule": "*/15 * * * *" }
  ]
}
```
- [ ] Cron paths configured
- [ ] Bearer token protection active
- [ ] 15-minute trade scan frequency set

#### 4. Live Fire Test (DO THIS BEFORE GOING LIVE)
**Manual Signal Trigger:**
1. Call `/api/signal/current?symbol=XAU_USD`
2. Verify response includes:
   - [ ] structuralTier properly set
   - [ ] entryDecision.approved = true (if signal)
   - [ ] Telegram alert sent
3. Check `/api/trades/status?status=open`
   - [ ] Trade appears in KV storage
4. Manually verify TP/SL conditions:
   - [ ] TP1 hit → Telegram alert sent (✓ ONCE ONLY)
   - [ ] TP2 hit → Trade marked CLOSED
   - [ ] SL hit → Trade marked CLOSED
5. Check deduplication:
   - [ ] No duplicate alerts (idempotent scan)

#### 5. Idempotency Test
1. Reduce cron to 1-minute frequency for 10 minutes
2. Monitor logs for:
   - [ ] No duplicate exit alerts
   - [ ] No duplicate state changes
   - [ ] No scan overlaps
   - [ ] No KV lock collisions
3. Restore to 15-minute frequency

#### 6. Code Cleanup (COMPLETED)
- [x] All old backtest scripts removed
- [x] Dead code cleaned up
- [x] No filesystem-based storage
- [x] No console.log exposing secrets
- [x] Diagnostic documents archived

#### 7. Production Safeguards
- [x] Kill switch implemented and tested
- [x] KV properly configured
- [x] Orphan trade cleanup active
- [x] Telegram alerts configured
- [x] B-tier gate set to score >= 5
- [x] Cron token protected

### Deployment Steps

1. **Set TRADING_ENABLED environment variable to "true"**
2. **Deploy to production**
3. **Run live fire test** (see section 4)
4. **Monitor first 24 hours** for any issues
5. **If critical issue**: Set TRADING_ENABLED="false" to instantly disable trading

### Emergency Protocol

If something behaves unexpectedly:

```bash
# IMMEDIATELY: Disable trading without redeploying
vercel env add TRADING_ENABLED false
```

This stops all signals and exit scans without touching logic.

### Monitoring Commands

**Check active trades:**
```bash
curl https://xptswitch.vercel.app/api/trades/status?status=open
```

**Check recent exits:**
```bash
curl https://xptswitch.vercel.app/api/trades/status?status=all | jq '.trades[] | select(.status=="CLOSED")'
```

**Manual trade scan:**
```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://xptswitch.vercel.app/api/cron/trade-scan
```

### Git Tag
```bash
git tag v1.0.0-live-autonomous
git push origin v1.0.0-live-autonomous
```

This becomes the stable production base. No quick tweaks in production.

### Audit Trail
- All trades logged with KV timestamps
- All exits logged with close reason (TP1/TP2/SL/INVALIDATED)
- All Telegram alerts timestamped
- Kill switch state always verifiable

---

**STATUS:** Ready for production deployment
**LAST UPDATED:** 2026-02-12
**VERSION:** 1.0.0-live-autonomous
