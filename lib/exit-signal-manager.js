"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExitSignalManager = void 0;
/**
 * Exit Signal Manager - 3-Tier Dynamic Exit Engine
 *
 * Tier 1 - Structural Failure (Hard Exit)
 * Tier 2 - Momentum Failure (Soft Exit / Reduce Risk)
 * Tier 3 - Volatility Regime Shift
 */
var ExitSignalManager = /** @class */ (function () {
    function ExitSignalManager() {
    }
    /**
     * Check if trade should be exited
     * Returns EXIT signal with tier information
     */
    ExitSignalManager.checkForExit = function (trade, currentPrice, indicators) {
        // Check SL/TP first (hard exits)
        var hardExit = this.checkHardExits(trade, currentPrice);
        if (hardExit)
            return hardExit;
        // Check structural failure
        var structuralExit = this.checkStructuralFailure(trade, currentPrice, indicators);
        if (structuralExit)
            return structuralExit;
        // Check momentum failure
        var momentumExit = this.checkMomentumFailure(trade, currentPrice, indicators);
        if (momentumExit)
            return momentumExit;
        // Check volatility regime shift
        var volatilityExit = this.checkVolatilityShift(trade, currentPrice, indicators);
        if (volatilityExit)
            return volatilityExit;
        return null;
    };
    /**
     * Check for hard exits (SL/TP hits)
     */
    ExitSignalManager.checkHardExits = function (trade, currentPrice) {
        // Check SL breach - ALWAYS TOP PRIORITY
        if (trade.direction === "LONG" && currentPrice <= trade.stopLoss) {
            return {
                type: "EXIT",
                direction: "NONE",
                alertLevel: 3,
                confidence: 100,
                timestamp: Date.now(),
                reasons: ["STOP LOSS BREACHED: Price ".concat(currentPrice.toFixed(2), " \u2264 SL ").concat(trade.stopLoss.toFixed(2))],
                indicators: {},
                strategy: "EXIT_SIGNAL_MANAGER",
                structuralTier: "SL_HIT",
            };
        }
        if (trade.direction === "SHORT" && currentPrice >= trade.stopLoss) {
            return {
                type: "EXIT",
                direction: "NONE",
                alertLevel: 3,
                confidence: 100,
                timestamp: Date.now(),
                reasons: ["STOP LOSS BREACHED: Price ".concat(currentPrice.toFixed(2), " \u2265 SL ").concat(trade.stopLoss.toFixed(2))],
                indicators: {},
                strategy: "EXIT_SIGNAL_MANAGER",
                structuralTier: "SL_HIT",
            };
        }
        // Check TP2 hit - HIGHEST PRIORITY PROFIT TARGET
        if (trade.direction === "LONG" && currentPrice >= trade.takeProfit2) {
            return {
                type: "EXIT",
                direction: "NONE",
                alertLevel: 2,
                confidence: 100,
                timestamp: Date.now(),
                reasons: ["TAKE PROFIT 2 REACHED: Price ".concat(currentPrice.toFixed(2), " \u2265 TP2 ").concat(trade.takeProfit2.toFixed(2))],
                indicators: {},
                strategy: "EXIT_SIGNAL_MANAGER",
                structuralTier: "TP2_HIT",
            };
        }
        if (trade.direction === "SHORT" && currentPrice <= trade.takeProfit2) {
            return {
                type: "EXIT",
                direction: "NONE",
                alertLevel: 2,
                confidence: 100,
                timestamp: Date.now(),
                reasons: ["TAKE PROFIT 2 REACHED: Price ".concat(currentPrice.toFixed(2), " \u2264 TP2 ").concat(trade.takeProfit2.toFixed(2))],
                indicators: {},
                strategy: "EXIT_SIGNAL_MANAGER",
                structuralTier: "TP2_HIT",
            };
        }
        // Check TP1 hit - MEDIUM PRIORITY (partial exit)
        if (trade.direction === "LONG" && currentPrice >= trade.takeProfit1 && !trade.tp1Hit) {
            return {
                type: "EXIT",
                direction: "NONE",
                alertLevel: 1,
                confidence: 95,
                timestamp: Date.now(),
                reasons: ["TAKE PROFIT 1 REACHED: Price ".concat(currentPrice.toFixed(2), " \u2265 TP1 ").concat(trade.takeProfit1.toFixed(2))],
                indicators: {},
                strategy: "EXIT_SIGNAL_MANAGER",
                structuralTier: "TP1_HIT",
            };
        }
        if (trade.direction === "SHORT" && currentPrice <= trade.takeProfit1 && !trade.tp1Hit) {
            return {
                type: "EXIT",
                direction: "NONE",
                alertLevel: 1,
                confidence: 95,
                timestamp: Date.now(),
                reasons: ["TAKE PROFIT 1 REACHED: Price ".concat(currentPrice.toFixed(2), " \u2264 TP1 ").concat(trade.takeProfit1.toFixed(2))],
                indicators: {},
                strategy: "EXIT_SIGNAL_MANAGER",
                structuralTier: "TP1_HIT",
            };
        }
        return null;
    };
    /**
     * Check for structural failure (Tier 1)
     * Long: 4H close below 50 EMA AND below prior swing low
     * Short: 4H close above 50 EMA AND above prior swing high
     */
    ExitSignalManager.checkStructuralFailure = function (trade, currentPrice, indicators) {
        var _a, _b;
        if (!indicators || !indicators["4h"])
            return null;
        var fourHourData = indicators["4h"];
        var current4hClose = ((_a = fourHourData[fourHourData.length - 1]) === null || _a === void 0 ? void 0 : _a.close) || 0;
        var ema50_4h = ((_b = fourHourData[fourHourData.length - 1]) === null || _b === void 0 ? void 0 : _b.ema50) || 0;
        var priorSwingLow = this.getPriorSwingLow(fourHourData);
        var priorSwingHigh = this.getPriorSwingHigh(fourHourData);
        if (trade.direction === "LONG") {
            if (current4hClose < ema50_4h && currentPrice < priorSwingLow) {
                return {
                    type: "EXIT",
                    direction: "NONE",
                    alertLevel: 3,
                    confidence: 90,
                    timestamp: Date.now(),
                    reasons: [
                        "STRUCTURAL FAILURE: 4H close ".concat(current4hClose.toFixed(2), " < 50 EMA ").concat(ema50_4h.toFixed(2)),
                        "AND price ".concat(currentPrice.toFixed(2), " < prior swing low ").concat(priorSwingLow.toFixed(2))
                    ],
                    indicators: {},
                    strategy: "EXIT_SIGNAL_MANAGER",
                    structuralTier: "STRUCTURAL_FAILURE",
                };
            }
        }
        else if (trade.direction === "SHORT") {
            if (current4hClose > ema50_4h && currentPrice > priorSwingHigh) {
                return {
                    type: "EXIT",
                    direction: "NONE",
                    alertLevel: 3,
                    confidence: 90,
                    timestamp: Date.now(),
                    reasons: [
                        "STRUCTURAL FAILURE: 4H close ".concat(current4hClose.toFixed(2), " > 50 EMA ").concat(ema50_4h.toFixed(2)),
                        "AND price ".concat(currentPrice.toFixed(2), " > prior swing high ").concat(priorSwingHigh.toFixed(2))
                    ],
                    indicators: {},
                    strategy: "EXIT_SIGNAL_MANAGER",
                    structuralTier: "STRUCTURAL_FAILURE",
                };
            }
        }
        return null;
    };
    /**
     * Check for momentum failure (Tier 2)
     * Long: RSI(14) crosses below 45 AFTER trade was > +1R
     * Short: RSI(14) crosses above 55 AFTER trade was > +1R
     * Action: Move stop to break-even, do NOT full exit unless also structural failure
     */
    ExitSignalManager.checkMomentumFailure = function (trade, currentPrice, indicators) {
        if (!indicators || !indicators["1h"])
            return null;
        var oneHourData = indicators["1h"];
        var currentRSI = oneHourData.rsi || 50;
        var unrealizedR = this.calculateUnrealizedR(trade, currentPrice);
        if (trade.direction === "LONG") {
            if (unrealizedR > 1.0 && currentRSI < 45) {
                return {
                    type: "EXIT",
                    direction: "NONE",
                    alertLevel: 2,
                    confidence: 75,
                    timestamp: Date.now(),
                    reasons: [
                        "MOMENTUM FAILURE: RSI(14) ".concat(currentRSI.toFixed(1), " < 45 after trade > +1R"),
                        "Unrealized R: ".concat(unrealizedR.toFixed(2))
                    ],
                    indicators: {},
                    strategy: "EXIT_SIGNAL_MANAGER",
                    structuralTier: "MOMENTUM_FAILURE",
                };
            }
        }
        else if (trade.direction === "SHORT") {
            if (unrealizedR > 1.0 && currentRSI > 55) {
                return {
                    type: "EXIT",
                    direction: "NONE",
                    alertLevel: 2,
                    confidence: 75,
                    timestamp: Date.now(),
                    reasons: [
                        "MOMENTUM FAILURE: RSI(14) ".concat(currentRSI.toFixed(1), " > 55 after trade > +1R"),
                        "Unrealized R: ".concat(unrealizedR.toFixed(2))
                    ],
                    indicators: {},
                    strategy: "EXIT_SIGNAL_MANAGER",
                    structuralTier: "MOMENTUM_FAILURE",
                };
            }
        }
        return null;
    };
    /**
     * Check for volatility regime shift (Tier 3)
     * ATR < 30% of 6M median → tighten trailing stop
     * ATR > 2x median + strong opposite candle → partial exit (50%)
     */
    ExitSignalManager.checkVolatilityShift = function (trade, currentPrice, indicators) {
        if (!indicators || !indicators["1h"])
            return null;
        var oneHourData = indicators["1h"];
        var currentATR = oneHourData.atr || 0;
        var medianATR = this.calculateMedianATR(oneHourData);
        var strongOppositeCandle = this.detectStrongOppositeCandle(trade, oneHourData);
        if (currentATR < 0.3 * medianATR) {
            return {
                type: "EXIT",
                direction: "NONE",
                alertLevel: 1,
                confidence: 60,
                timestamp: Date.now(),
                reasons: [
                    "VOLATILITY SHIFT: ATR ".concat(currentATR.toFixed(4), " < 30% of 6M median ").concat(medianATR.toFixed(4)),
                    "Consider tightening trailing stop"
                ],
                indicators: {},
                strategy: "EXIT_SIGNAL_MANAGER",
                structuralTier: "VOLATILITY_SHIFT",
            };
        }
        if (currentATR > 2 * medianATR && strongOppositeCandle) {
            return {
                type: "EXIT",
                direction: "NONE",
                alertLevel: 2,
                confidence: 70,
                timestamp: Date.now(),
                reasons: [
                    "VOLATILITY SHIFT: ATR ".concat(currentATR.toFixed(4), " > 2x median ").concat(medianATR.toFixed(4)),
                    "Strong opposite candle detected - consider partial exit (50%)"
                ],
                indicators: {},
                strategy: "EXIT_SIGNAL_MANAGER",
                structuralTier: "VOLATILITY_SHIFT",
            };
        }
        return null;
    };
    ExitSignalManager.getPriorSwingLow = function (data) {
        // Simple implementation - find lowest low in last 20 bars
        var lookback = data.slice(-20, -1);
        return Math.min.apply(Math, lookback.map(function (c) { return c.low; }));
    };
    ExitSignalManager.getPriorSwingHigh = function (data) {
        // Simple implementation - find highest high in last 20 bars
        var lookback = data.slice(-20, -1);
        return Math.max.apply(Math, lookback.map(function (c) { return c.high; }));
    };
    ExitSignalManager.calculateUnrealizedR = function (trade, currentPrice) {
        var entryPrice = trade.entryPrice;
        var stopLoss = trade.stopLoss;
        var riskAmount = Math.abs(entryPrice - stopLoss);
        if (trade.direction === "LONG") {
            return (currentPrice - entryPrice) / riskAmount;
        }
        else {
            return (entryPrice - currentPrice) / riskAmount;
        }
    };
    ExitSignalManager.calculateMedianATR = function (data) {
        // Simple median calculation for last 20 ATR values
        var atrValues = data.slice(-20).map(function (c) { return c.atr; }).filter(function (v) { return v > 0; });
        if (atrValues.length === 0)
            return 0.01;
        atrValues.sort(function (a, b) { return a - b; });
        var mid = Math.floor(atrValues.length / 2);
        return atrValues.length % 2 !== 0 ? atrValues[mid] : (atrValues[mid - 1] + atrValues[mid]) / 2;
    };
    ExitSignalManager.detectStrongOppositeCandle = function (trade, data) {
        var currentCandle = data[data.length - 1];
        var previousCandle = data[data.length - 2];
        if (!currentCandle || !previousCandle)
            return false;
        if (trade.direction === "LONG") {
            // Look for strong bearish candle
            return currentCandle.close < previousCandle.close &&
                currentCandle.close < currentCandle.open &&
                Math.abs(currentCandle.close - currentCandle.open) > 0.5 * currentCandle.atr;
        }
        else {
            // Look for strong bullish candle
            return currentCandle.close > previousCandle.close &&
                currentCandle.close > currentCandle.open &&
                Math.abs(currentCandle.close - currentCandle.open) > 0.5 * currentCandle.atr;
        }
    };
    return ExitSignalManager;
}());
exports.ExitSignalManager = ExitSignalManager;
