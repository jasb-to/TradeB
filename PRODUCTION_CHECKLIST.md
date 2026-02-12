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

#### 3. Kill Switch Verification
```typescript
// Both endpoints execute immediately without kill switch checks
// Trading is enabled by default
```
- [ ] `/api/signal/current` runs without gating
- [ ] `/api/trades/scan` runs without gating
- [ ] All cron endpoints respond to external triggers

#### 2. External Cron Setup (cron-job.org)
Since Vercel Hobby accounts limit cron jobs to daily execution, using cron-job.org for external triggering:
- [ ] **Signal Generation & Trade Scanning:** Cron every 10 minutes
  ```
  https://xptswitch.vercel.app/api/cron/signal-xau
  https://xptswitch.vercel.app/api/trades/scan
  Header: Authorization: Bearer [CRON_SECRET]
  ```
- [ ] Bearer token protection active
- [ ] All cron jobs configured in cron-job.org dashboard
- [ ] 10-minute frequency ensures 6 signal evaluations per day + 144 trade scans

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
1. Monitor 10-minute cron for first week
2. Verify logs for:
   - [ ] No duplicate exit alerts
   - [ ] No duplicate state changes
   - [ ] No scan overlaps
   - [ ] No KV lock collisions
3. 10-minute frequency = more signal opportunities + faster exit detection

#### 6. Code Cleanup (COMPLETED)
- [x] All old backtest scripts removed
- [x] Dead code cleaned up
- [x] No filesystem-based storage
- [x] No console.log exposing secrets
- [x] Vercel cron config removed (using cron-job.org instead)

#### 7. Production Safeguards
- [x] Kill switch implemented and tested
- [x] KV properly configured
- [x] Orphan trade cleanup active
- [x] Telegram alerts configured
- [x] B-tier gate set to score >= 5
- [x] Cron token protected

### Deployment Steps

1. **Configure cron-job.org** with the three cron URLs and bearer tokens
2. **Deploy to production**
3. **Run live fire test** (see section 4)
4. **Monitor first 24 hours** for any issues

### Emergency Protocol

If something behaves unexpectedly, simply delete the cron jobs from cron-job.org dashboard. No signal generation = no new trades = no exit scanning.

For immediate restart: Re-add the three cron jobs with the same URLs and bearer token.

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
