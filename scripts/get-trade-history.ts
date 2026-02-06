#!/usr/bin/env ts-node

import { ActiveTradeTracker } from "../lib/active-trade-tracker";

/**
 * Script to retrieve trade history for XAU and XAG from the last 12 hours
 */

function getTradeHistoryForSymbol(symbol: string, hours: number = 12) {
  console.log(`\n=== ${symbol} Trade History (Last ${hours} Hours) ===`);
  
  try {
    const allTrades = ActiveTradeTracker.getAllTrades(symbol);
    const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
    
    const recentTrades = allTrades.filter(trade => trade.entryTime >= cutoffTime);
    
    if (recentTrades.length === 0) {
      console.log(`No trades found for ${symbol} in the last ${hours} hours`);
      return;
    }
    
    console.log(`Found ${recentTrades.length} trades:\n`);
    
    recentTrades.forEach((trade, index) => {
      const entryTime = new Date(trade.entryTime);
      
      console.log(`${index + 1}. ${trade.direction} Trade`);
      console.log(`   Entry: $${trade.entryPrice} at ${entryTime.toLocaleString()}`);
      console.log(`   Stop Loss: $${trade.stopLoss}`);
      console.log(`   Take Profit 1: $${trade.takeProfit1}`);
      console.log(`   Take Profit 2: $${trade.takeProfit2}`);
      console.log(`   Status: ${trade.status}`);
      
      if (trade.tp1Hit) {
        console.log(`   TP1 Hit: Yes`);
      }
      
      if (trade.tp2Hit) {
        console.log(`   TP2 Hit: Yes`);
      }
      
      if (trade.slHit) {
        console.log(`   SL Hit: Yes`);
      }
      
      if (trade.tradeStateHistory && trade.tradeStateHistory.length > 0) {
        console.log(`   State History: ${trade.tradeStateHistory.map(h => h.state).join(' → ')}`);
      }
      
      console.log('');
    });
    
  } catch (error) {
    console.error(`Error retrieving ${symbol} trade history:`, error);
  }
}

// Get trade history for both symbols
getTradeHistoryForSymbol("XAU_USD", 12);
getTradeHistoryForSymbol("XAG_USD", 12);

console.log('\n=== Summary ===');
console.log('Trade history retrieved from ActiveTradeTracker');
console.log('Times are shown in local timezone');
console.log('Status shows current trade state (ACTIVE, TP1_HIT, TP2_HIT, SL_HIT)');
