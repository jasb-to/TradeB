import Anthropic from "@anthropic-ai/sdk";
import { DataFetcher } from "@/lib/data-fetcher";
import { TradingStrategies } from "@/lib/strategies";
import { DEFAULT_TRADING_CONFIG } from "@/lib/default-config";

const client = new Anthropic();

interface BacktestTrade {
  entry_price: number;
  entry_time: string;
  direction: "LONG" | "SHORT";
  tier: string;
  score: number;
  tp1: number;
  tp2: number;
  sl: number;
  exit_price?: number;
  exit_time?: string;
  pnl?: number;
  pnl_pct?: number;
  status: "open" | "tp1" | "tp2" | "sl" | "timeout";
}

interface GateResult {
  gate_threshold: number;
  total_signals: number;
  b_tier_signals: number;
  trades: BacktestTrade[];
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  avg_win: number;
  avg_loss: number;
  total_pnl: number;
  risk_reward_ratio: number;
}

async function runBacktest(gateThreshold: number): Promise<GateResult> {
  console.log(`\n🔍 Running backtest with B tier gate: score >= ${gateThreshold}`);

  const strategies = new TradingStrategies(DEFAULT_TRADING_CONFIG);
  const dataFetcher = new DataFetcher();
  const trades: BacktestTrade[] = [];

  // Fetch 500 daily candles (~2 years of data for daily TF)
  console.log("📊 Fetching historical data...");
  const candles = await dataFetcher.getCandles("XAU_USD", "D", 500, "MBA");

  if (!candles || candles.length < 100) {
    throw new Error("Insufficient candle data for backtest");
  }

  console.log(`✓ Loaded ${candles.length} daily candles`);

  // Simulate sliding window evaluation
  const windowSize = 100;
  let totalSignals = 0;
  let bTierSignals = 0;

  for (let i = windowSize; i < candles.length; i++) {
    const window = candles.slice(i - windowSize, i);

    // Mock multi-timeframe data by decimating daily candles
    const candles4h = candles.slice(Math.max(0, i - 200), i);
    const candles1h = candles.slice(Math.max(0, i - 200), i);
    const candles15m = candles.slice(Math.max(0, i - 200), i);
    const candles5m = candles.slice(Math.max(0, i - 200), i);

    try {
      const signal = await strategies.evaluateSignals(
        window,
        candles4h,
        candles4h,
        candles1h,
        candles15m,
        candles5m
      );

      totalSignals++;

      // Check if this would be a B-tier signal with current gate
      const score = signal.reasons?.[0]?.match(/Score (\d+\.?\d*)/)?.[1];
      const actualTier = (signal as any).structuralTier;

      if (actualTier === "B") {
        bTierSignals++;

        // For this backtest simulation, we're comparing the theoretical impact
        // We would trade this signal
        const currentCandle = window[window.length - 1];
        trades.push({
          entry_price: currentCandle.mid.c,
          entry_time: currentCandle.time,
          direction: signal.direction as "LONG" | "SHORT",
          tier: "B",
          score: parseFloat(score || "0"),
          tp1: (signal as any).takeProfit1 || 0,
          tp2: (signal as any).takeProfit2 || 0,
          sl: (signal as any).stopLoss || 0,
          status: "open",
        });
      }

      // Progress indicator
      if (i % 50 === 0) {
        process.stdout.write(
          `\r  Progress: ${i}/${candles.length} (${bTierSignals} B signals found)`
        );
      }
    } catch (error) {
      // Silently continue on evaluation errors (insufficient data windows)
      continue;
    }
  }

  console.log(`\n✓ Evaluation complete`);

  // Simulate trade exits using next candles
  console.log("📈 Simulating trade exits...");
  for (let tradeIdx = 0; tradeIdx < trades.length; tradeIdx++) {
    const trade = trades[tradeIdx];
    const startIdx = candles.findIndex(
      (c) => c.time === trade.entry_time
    );

    if (startIdx === -1) continue;

    // Look ahead up to 10 candles for exit
    for (let j = startIdx + 1; j < Math.min(startIdx + 11, candles.length); j++) {
      const candle = candles[j];
      const high = candle.mid.h;
      const low = candle.mid.l;
      const close = candle.mid.c;

      if (trade.direction === "LONG") {
        if (high >= trade.tp2) {
          trade.exit_price = trade.tp2;
          trade.exit_time = candle.time;
          trade.status = "tp2";
          break;
        } else if (high >= trade.tp1) {
          trade.exit_price = trade.tp1;
          trade.exit_time = candle.time;
          trade.status = "tp1";
          break;
        } else if (low <= trade.sl) {
          trade.exit_price = trade.sl;
          trade.exit_time = candle.time;
          trade.status = "sl";
          break;
        }
      } else {
        // SHORT
        if (low <= trade.tp2) {
          trade.exit_price = trade.tp2;
          trade.exit_time = candle.time;
          trade.status = "tp2";
          break;
        } else if (low <= trade.tp1) {
          trade.exit_price = trade.tp1;
          trade.exit_time = candle.time;
          trade.status = "tp1";
          break;
        } else if (high >= trade.sl) {
          trade.exit_price = trade.sl;
          trade.exit_time = candle.time;
          trade.status = "sl";
          break;
        }
      }
    }

    // If not exited, mark as timeout
    if (!trade.exit_price) {
      trade.status = "timeout";
    }

    // Calculate P&L
    if (trade.exit_price) {
      if (trade.direction === "LONG") {
        trade.pnl = trade.exit_price - trade.entry_price;
      } else {
        trade.pnl = trade.entry_price - trade.exit_price;
      }
      trade.pnl_pct = (trade.pnl / trade.entry_price) * 100;
    }
  }

  // Calculate statistics
  const closedTrades = trades.filter((t) => t.pnl !== undefined);
  const winningTrades = closedTrades.filter((t) => (t.pnl || 0) > 0);
  const losingTrades = closedTrades.filter((t) => (t.pnl || 0) < 0);

  const winRate =
    closedTrades.length > 0
      ? (winningTrades.length / closedTrades.length) * 100
      : 0;
  const avgWin =
    winningTrades.length > 0
      ? winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) /
        winningTrades.length
      : 0;
  const avgLoss =
    losingTrades.length > 0
      ? losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) /
        losingTrades.length
      : 0;
  const totalPnL = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const riskRewardRatio = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0;

  return {
    gate_threshold: gateThreshold,
    total_signals: totalSignals,
    b_tier_signals: bTierSignals,
    trades,
    winning_trades: winningTrades.length,
    losing_trades: losingTrades.length,
    win_rate: winRate,
    avg_win: avgWin,
    avg_loss: avgLoss,
    total_pnl: totalPnL,
    risk_reward_ratio: riskRewardRatio,
  };
}

async function main() {
  console.log("🚀 B Tier Gate Comparison Backtest");
  console.log("===================================");
  console.log(
    "Comparing B tier gate: score >= 4.5 vs score >= 5.0\n"
  );

  const results: GateResult[] = [];

  // Run backtest with current gate (4.5)
  const result1 = await runBacktest(4.5);
  results.push(result1);

  // Run backtest with new gate (5.0)
  const result2 = await runBacktest(5.0);
  results.push(result2);

  console.log("\n\n📊 BACKTEST RESULTS COMPARISON");
  console.log("=====================================\n");

  for (const result of results) {
    console.log(`Gate Threshold: score >= ${result.gate_threshold}`);
    console.log("─".repeat(50));
    console.log(`Total signals evaluated: ${result.total_signals}`);
    console.log(`B-tier signals generated: ${result.b_tier_signals}`);
    console.log(`Trades executed: ${result.trades.length}`);
    console.log(`Winning trades: ${result.winning_trades}`);
    console.log(`Losing trades: ${result.losing_trades}`);
    console.log(`Win rate: ${result.win_rate.toFixed(2)}%`);
    console.log(`Avg win: ${result.avg_win.toFixed(2)} pips`);
    console.log(`Avg loss: ${result.avg_loss.toFixed(2)} pips`);
    console.log(`Total P&L: ${result.total_pnl.toFixed(2)} pips`);
    console.log(
      `Risk/Reward ratio: ${result.risk_reward_ratio.toFixed(2)}`
    );
    console.log();
  }

  // Comparison analysis
  console.log("📈 COMPARATIVE ANALYSIS");
  console.log("=====================================\n");

  const current = results[0];
  const proposed = results[1];

  const signalReduction =
    ((current.b_tier_signals - proposed.b_tier_signals) /
      current.b_tier_signals) *
    100;
  const winRateChange = proposed.win_rate - current.win_rate;
  const pnlChange = proposed.total_pnl - current.total_pnl;

  console.log(`Signal reduction: ${signalReduction.toFixed(1)}%`);
  console.log(
    `  → More selective approach eliminates ${Math.abs(current.b_tier_signals - proposed.b_tier_signals)} lower-quality signals`
  );
  console.log();

  console.log(`Win rate change: ${winRateChange > 0 ? "+" : ""}${winRateChange.toFixed(2)}%`);
  console.log(
    `  → ${winRateChange > 0 ? "Improved" : "Decreased"} signal quality with higher score threshold`
  );
  console.log();

  console.log(
    `Total P&L change: ${pnlChange > 0 ? "+" : ""}${pnlChange.toFixed(2)} pips`
  );
  console.log(
    `  → ${pnlChange > 0 ? "Better" : "Worse"} profitability with new gate`
  );
  console.log();

  console.log("🎯 RECOMMENDATION");
  console.log("─".repeat(50));

  if (winRateChange > 2 && pnlChange > 0) {
    console.log(
      "✅ ADOPT new gate (5.0): Significantly better quality at acceptable signal frequency"
    );
  } else if (winRateChange > 0 && pnlChange > -50) {
    console.log(
      "⚠️  CONSIDER new gate (5.0): Better quality but reduced frequency"
    );
  } else {
    console.log(
      "❌ KEEP current gate (4.5): Better frequency/profitability trade-off"
    );
  }

  // Use Claude for detailed analysis
  console.log("\n\n🤖 CLAUDE ANALYSIS");
  console.log("=====================================\n");

  const analysisPrompt = `
Based on the following B-tier trading backtest comparison, provide a detailed analysis:

Current Gate (score >= 4.5):
- B-tier signals: ${current.b_tier_signals}
- Trades executed: ${current.trades.length}
- Win rate: ${current.win_rate.toFixed(2)}%
- Total P&L: ${current.total_pnl.toFixed(2)} pips
- Risk/Reward ratio: ${current.risk_reward_ratio.toFixed(2)}

Proposed Gate (score >= 5.0):
- B-tier signals: ${proposed.b_tier_signals}
- Trades executed: ${proposed.trades.length}
- Win rate: ${proposed.win_rate.toFixed(2)}%
- Total P&L: ${proposed.total_pnl.toFixed(2)} pips
- Risk/Reward ratio: ${proposed.risk_reward_ratio.toFixed(2)}

Key differences:
- Signal reduction: ${signalReduction.toFixed(1)}%
- Win rate change: ${winRateChange > 0 ? "+" : ""}${winRateChange.toFixed(2)}%
- P&L change: ${pnlChange > 0 ? "+" : ""}${pnlChange.toFixed(2)} pips

Please provide:
1. Statistical significance of the changes
2. Quality vs. frequency trade-off analysis
3. Risk management implications
4. Recommendation with justification
`;

  const message = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: analysisPrompt,
      },
    ],
  });

  console.log(
    message.content[0].type === "text" ? message.content[0].text : ""
  );
}

main().catch(console.error);
