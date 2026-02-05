# CXSwitch Production Deployment Guide

## External Cron Setup (cron-job.org)

1. Visit https://cron-job.org/en/
2. Create new cronjob with URL: `https://your-vercel-domain.vercel.app/api/external-cron?secret=YOUR_CRON_SECRET`
3. Set schedule: Every 10 minutes
4. Enable notifications for failures

## System Architecture

**Backend**:
- Dual-tier strategies (A+/A) with weighted MTF alignment
- XAU/USD: A+ requires 5/6 TF + ADX ≥ 25; A requires score ≥ 6 + ADX ≥ 20
- XAG/USD: A requires score ≥ 4 + ADX ≥ 20
- Weighted scoring: Daily=2, 4H=2, 1H=2, 15M=1, 5M=1
- ADX as confidence gate (TREND/RANGE logging)

**Frontend**:
- Two-column responsive layout (Gold left, Silver right)
- Indicator cards: ATR, ADX, StochRSI, VWAP
- MTF badges showing all 5 timeframes with directional indicators
- Trade checklists with symbol-specific entry requirements

**Alerts**:
- Telegram notifications for A+ and A tier trades
- Debug messages for skipped trades and low-confidence setups
- Includes: symbol, tier, score, ADX, ATR, StochRSI, VWAP, entry/exit, timestamp

**Cron**:
- External cron.org job every 10 minutes
- Fetches latest OANDA candles
- Evaluates signals for both symbols
- Updates dashboard in real-time
- Sends Telegram alerts

## Confidence Scores (0-10)

- **Strategy**: Weighted MTF + ADX + ATR + momentum alignment
- **Backend**: Live API data + indicator calculation success
- **Frontend**: MTF badge rendering + indicator display + UI responsiveness
- **Alerts**: Telegram API delivery logs
- **Overall**: Combined module scores

## Production Checklist

✅ Dual-tier strategies implemented
✅ Weighted MTF alignment active
✅ External cron endpoint configured
✅ Telegram alerts integrated
✅ Dashboard fully responsive
✅ Backtest 90-day capability
✅ All XPT references removed
✅ CXSwitch branding applied
✅ Confidence scoring system
✅ Production logs active

## Deployment Commands

\`\`\`bash
# Run 90-day backtest with confidence scores
npx ts-node scripts/production-backtest.ts

# Deploy to Vercel
vercel deploy

# Test external cron
curl "https://your-domain.vercel.app/api/external-cron?secret=YOUR_CRON_SECRET"
\`\`\`

## Live System Status

- **XAU/USD**: Trading in A/A+ tier with weighted alignment
- **XAG/USD**: Trading in A tier capturing volatility
- **Cron**: Every 10 minutes via cron-job.org
- **Alerts**: Telegram notifications active
- **Dashboard**: Real-time two-column layout

---
**System is PRODUCTION READY. Ready for live execution.**
