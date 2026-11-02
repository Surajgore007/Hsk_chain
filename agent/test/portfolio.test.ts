import { describe, it, expect } from "vitest";
import { PortfolioTracker } from "../src/portfolio.js";

const baseToken = "0xCA8aAceEC5Db1e91B9Ed3a344bA026c4a2B3ebF6";
const quoteToken = "0x5BaFcc0c93EcD8022925D7fd89da1C6250850E19";

describe("Portfolio Tracker & P&L Math", () => {
  it("tracks weighted average cost basis on BUY", () => {
    const tracker = new PortfolioTracker(baseToken, quoteToken);

    // Trade 1: Bought 10 WHSK for 800 tUSDT -> cost basis 80 tUSDT/WHSK
    tracker.processTradeEvent({
      tokenIn: quoteToken,
      tokenOut: baseToken,
      amountIn: 800n * 10n ** 6n,
      amountOut: 10n * 10n ** 18n,
      blockNumber: 100n,
    });

    // Trade 2: Bought 10 WHSK for 1000 tUSDT -> cost basis 100 tUSDT/WHSK
    // Average = (800 + 1000) / 20 = 90 tUSDT/WHSK
    tracker.processTradeEvent({
      tokenIn: quoteToken,
      tokenOut: baseToken,
      amountIn: 1000n * 10n ** 6n,
      amountOut: 10n * 10n ** 18n,
      blockNumber: 105n,
    });

    const snapshot = tracker.getSnapshot(
      20n * 10n ** 18n,
      0n,
      90n * 10n ** 6n, // current spot is 90
      90n * 10n ** 6n
    );

    expect(snapshot.avgCostBasisQuote).toBe(90n * 10n ** 6n);
    expect(snapshot.unrealizedPnlQuote).toBe(0n); // exactly at cost basis
  });

  it("calculates realized profit on SELL", () => {
    const tracker = new PortfolioTracker(baseToken, quoteToken);

    // Buy 10 WHSK at 80 tUSDT
    tracker.processTradeEvent({
      tokenIn: quoteToken,
      tokenOut: baseToken,
      amountIn: 800n * 10n ** 6n,
      amountOut: 10n * 10n ** 18n,
      blockNumber: 100n,
    });

    // Sell 5 WHSK at 100 tUSDT -> proceeds = 500 tUSDT, cost = 400 tUSDT -> profit = 100 tUSDT
    tracker.processTradeEvent({
      tokenIn: baseToken,
      tokenOut: quoteToken,
      amountIn: 5n * 10n ** 18n,
      amountOut: 500n * 10n ** 6n,
      blockNumber: 110n,
    });

    const snapshot = tracker.getSnapshot(
      5n * 10n ** 18n,
      500n * 10n ** 6n,
      100n * 10n ** 6n,
      100n * 10n ** 6n
    );

    expect(snapshot.realizedPnlQuote).toBe(100n * 10n ** 6n); // +100 tUSDT realized
  });
});

