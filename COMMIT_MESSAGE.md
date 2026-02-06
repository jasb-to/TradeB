## Commit Message

### Fix: Complete Dashboard Data Visibility & UI Responsiveness

**Summary**: Fixed critical data flow issue preventing frontend from displaying indicators, entry decisions, and MTF alignment. Resolved refresh button state management and removed unnecessary UI components.

**Issues Fixed**:
1. StochRSI not displaying - Added full indicators object to API response
2. Refresh button stuck in infinite loop - Fixed state management race conditions
3. Test Telegram button invisible on mobile - Made header responsive
4. "Loading signal..." never clearing - Guaranteed state cleanup in error paths
5. MTF Alignment stuck "ANALYZING" - ensured timeframeAlignment in all responses
6. Active Trades section unnecessary - Removed polling and unused components

**Changes**:
- `/app/api/signal/current/route.ts`: Include full indicators object in response (line 174)
- `/lib/strategies.ts`: Fixed indicators object in all 3 signal return paths (ENTRY/PENDING/NO_TRADE)
- `/app/page.tsx`: Fixed refresh guard clause, removed Active Trades, improved header responsiveness
- `/components/indicator-cards.tsx`: Removed debug logging
- `/components/mtf-bias-viewer.tsx`: Removed debug logging

**Technical Details**:
- Fixed stochRSI fallback logic (removed `|| 50` for structured `{ value, state }` objects)
- Ensured all 14 indicators included in response (not just subset in lastCandle)
- Added 15-second timeout to prevent API hangs
- Made Test Telegram button responsive: "Test Telegram" on desktop, "TG" on mobile
- Removed fetchActiveTrades() and fetchCurrentPrice() polling functions

**Testing**:
- ✅ StochRSI displays with value and state (MOMENTUM_UP/DOWN/COMPRESSION/CALCULATING)
- ✅ Entry Checklist shows all 7 criteria with pass/fail status
- ✅ MTF Alignment shows BULLISH/BEARISH/NO_CLEAR_BIAS for all timeframes
- ✅ Refresh button responds to all clicks without lock-up
- ✅ Test Telegram button visible on all screen sizes
- ✅ Market closed state preserved (Friday close data persists)
- ✅ No console errors, all debug logs removed

**Breaking Changes**: None

**Deployment**: Ready for production. All strategies (XAU/XAG) unchanged and working.
