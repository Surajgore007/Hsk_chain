/**
 * portfolio.ts — Real-time Position, NAV, and P&L tracking (R8)
 *
 * Tracks:
 * - Base (WHSK) and Quote (tUSDT) balances held in ExecutionGuard
 * - Net Asset Value (NAV) in quote units at our pool's spot price
 * - Secondary NAV at mainnet reference price
 * - Weighted-average cost basis of base token
 * - Realized P&L (on sells)
 * - Unrealized P&L = baseBalance * (currentSpot - avgCost)
 * - P&L % vs initial baseline
 */

import { mulDiv, BASE_DECIMALS, QUOTE_DECIMALS, DECIMAL_ADJ } from "./price.js";

export interface TradeExecutionEvent {
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: bigint;
  amountOut: bigint;
  blockNumber: bigint;
}

export interface PortfolioSnapshot {
  baseBalance: bigint;          // WHSK (18 dec)
  quoteBalance: bigint;         // tUSDT (6 dec)
  spotPriceDisplay: number;     // e.g. 0.0875 USDT per WHSK
  refPriceDisplay: number;      // e.g. 0.0875
  navQuote: bigint;             // in tUSDT (6 dec)
  navRefQuote: bigint;          // in tUSDT (6 dec) at mainnet ref price
  avgCostBasisQuote: bigint;    // cost basis per 1 WHSK (in 6 dec)
  realizedPnlQuote: bigint;     // total realized P&L (6 dec)
  unrealizedPnlQuote: bigint;   // total unrealized P&L (6 dec)
  totalPnlQuote: bigint;        // realized + unrealized (6 dec)
  pnlPercent: number;           // % return vs initial baseline NAV
  initialNavQuote: bigint;
}

export class PortfolioTracker {
  private baseToken: `0x${string}`;
  private quoteToken: `0x${string}`;
  private baseDecimals: bigint;
  private avgCostBasis: bigint = 0n;      // cost in quote (6 dec) per 1 base unit
  private totalBaseAcquired: bigint = 0n;
  private realizedPnl: bigint = 0n;        // quote (6 dec)
  private initialNav: bigint = 0n;

  constructor(baseToken: `0x${string}`, quoteToken: `0x${string}`, baseDecimals = 18n) {
    this.baseToken = baseToken.toLowerCase() as `0x${string}`;
    this.quoteToken = quoteToken.toLowerCase() as `0x${string}`;
    this.baseDecimals = baseDecimals;
  }

  /**
   * Process historical or live TradeExecuted event to update cost basis & realized P&L.
   */
  public processTradeEvent(event: TradeExecutionEvent): void {
    const isBuy =
      event.tokenIn.toLowerCase() === this.quoteToken &&
      event.tokenOut.toLowerCase() === this.baseToken;

    const isSell =
      event.tokenIn.toLowerCase() === this.baseToken &&
      event.tokenOut.toLowerCase() === this.quoteToken;

    if (isBuy) {
      // Bought base using quote:
      // quote spent = event.amountIn (6 dec)
      // base received = event.amountOut (base dec)
      const costThisTradePerBase = event.amountOut > 0n
        ? mulDiv(event.amountIn, 10n ** this.baseDecimals, event.amountOut)
        : 0n;

      const newTotalBase = this.totalBaseAcquired + event.amountOut;
      if (newTotalBase > 0n) {
        // Weighted average cost
        this.avgCostBasis =
          (this.avgCostBasis * this.totalBaseAcquired + costThisTradePerBase * event.amountOut) /
          newTotalBase;
        this.totalBaseAcquired = newTotalBase;
      }
    } else if (isSell) {
      // Sold base for quote:
      // base sold = event.amountIn (base dec)
      // quote received = event.amountOut (6 dec)
      // Cost of sold base = (baseSold * avgCostBasis) / 10^baseDecimals
      const costOfSoldBase = mulDiv(event.amountIn, this.avgCostBasis, 10n ** this.baseDecimals);
      const tradeProfit = event.amountOut - costOfSoldBase;
      this.realizedPnl += tradeProfit;

      if (this.totalBaseAcquired > event.amountIn) {
        this.totalBaseAcquired -= event.amountIn;
      } else {
        this.totalBaseAcquired = 0n;
      }
    }
  }

  /**
   * Compute live snapshot.
   *
   * @param baseBal        current base in vault (native dec)
   * @param quoteBal       current tUSDT in vault (6 dec)
   * @param spotPriceRatio raw price or price in quote per 1 base (6 dec)
   * @param refPriceRatio  reference price in quote per 1 base (6 dec)
   */
  public getSnapshot(
    baseBal: bigint,
    quoteBal: bigint,
    spotPriceRatio: bigint,
    refPriceRatio: bigint,
  ): PortfolioSnapshot {
    // Value of base in quote = (baseBal * spotPriceRatio) / 10^baseDecimals
    const baseValueQuote = mulDiv(baseBal, spotPriceRatio, 10n ** this.baseDecimals);
    const nav = quoteBal + baseValueQuote;

    const baseValueRef = mulDiv(baseBal, refPriceRatio, 10n ** this.baseDecimals);
    const navRef = quoteBal + baseValueRef;

    if (this.initialNav === 0n && nav > 0n) {
      this.initialNav = nav;
    }

    // Unrealized P&L on currently held base
    let unrealized = 0n;
    if (baseBal > 0n && this.avgCostBasis > 0n) {
      unrealized = mulDiv(
        baseBal,
        spotPriceRatio - this.avgCostBasis,
        10n ** this.baseDecimals
      );
    }

    const totalPnl = this.realizedPnl + unrealized;
    const pnlPct = this.initialNav > 0n
      ? (Number(totalPnl) / Number(this.initialNav)) * 100
      : 0;

    return {
      baseBalance: baseBal,
      quoteBalance: quoteBal,
      spotPriceDisplay: Number(spotPriceRatio) / 1e6,
      refPriceDisplay: Number(refPriceRatio) / 1e6,
      navQuote: nav,
      navRefQuote: navRef,
      avgCostBasisQuote: this.avgCostBasis,
      realizedPnlQuote: this.realizedPnl,
      unrealizedPnlQuote: unrealized,
      totalPnlQuote: totalPnl,
      pnlPercent: pnlPct,
      initialNavQuote: this.initialNav,
    };
  }
}

