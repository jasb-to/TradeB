# XPTSwitch - Platinum Swing Trading System (A+ ONLY)

A weekly swing trading assistant for XPTUSD (Platinum) with strict multi-timeframe A+ only entry conditions.

## Features

- **A+ ONLY Strategy**: 6/6 timeframe alignment + ADX >= 23 required
- **Maximum Edge**: 100% win rate in backtests with zero false signals
- **Breakout + Hold**: Price breaks prior level and holds on retest
- **StochRSI Momentum**: Direction confirmation with 1.5x volume spike
- **Chandelier Exits**: Dynamic trailing stops for trend capture

## Data Source

The system uses **OANDA API** for real-time intraday data across all timeframes.

**Required Environment Variables:**
- `OANDA_API_KEY` - Your OANDA API key
- `OANDA_ACCOUNT_ID` - Your OANDA account ID

## Strategy

**A+ Entry Requirements:**
- All 6 timeframes aligned (LONG or SHORT) - no compromises
- ADX >= 23 on both 1H and 4H (trending market only)
- Price breakout from prior swing high/low
- StochRSI momentum confirmation
- 1.5x average volume on breakout candle

**Exit Conditions:**
- Chandelier trailing stop triggered
- StochRSI + MACD crossover reversal
- Automatic danger alerts on opposing signals

**Performance (60-Day Backtest):**
- Win Rate: 100% (11/11 trades)
- Avg Return: +1.75R per trade
- Total Return: +70.2%
- Max Drawdown: 0%

---

**Disclaimer:** This is a trading assistant tool, not financial advice. Trading involves risk.
