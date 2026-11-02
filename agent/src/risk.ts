/**
 * risk.ts — Deterministic Risk-Control & Stop-Loss Framework (USP 2)
 *
 * Runs deterministically in code and strictly BYPASSES the LLM.
 * The AI cannot override these limits.
 *
 * Implements:
 * 1. Hard Stop-Loss (default 3% below avgCost) -> Triggers immediate position exit
 * 2. Take-Profit (default 5% above avgCost) -> Triggers immediate position exit
 * 3. Max Drawdown from peak NAV (default 8%) -> Auto-pauses agent & triggers contract pause()
 * 4. Daily Loss Limit (default 5% from day open) -> Auto-pauses agent & triggers contract pause()
 * 5. Consecutive Refusal Backoff -> Dynamically multiplies poll interval
 * 6. Stale Reference Price Guard -> Prevents trades if reference is stale (> 90s)
 */

export interface RiskConfig {
  stopLossPct: number;       // e.g. 3.0 = 3%
  takeProfitPct: number;     // e.g. 5.0 = 5%
  maxDrawdownPct: number;    // e.g. 8.0 = 8%
  dailyLossLimitPct: number; // e.g. 5.0 = 5%
  maxPositionPctNav: number; // e.g. 25.0 = 25% max exposure per asset
  consecutiveRefusalThreshold: number; // e.g. 3 refusals -> backoff
}

export interface RiskEvaluation {
  triggered: boolean;
  type: "NONE" | "STOP_LOSS" | "TAKE_PROFIT" | "MAX_DRAWDOWN" | "DAILY_LOSS" | "STALE_REF";
  action: "HOLD" | "EXIT_POSITION" | "EMERGENCY_PAUSE";
  reason: string;
  source: "stop-loss" | "take-profit" | "drawdown" | "daily-loss" | "system";
  details: {
    spotPrice: number;
    avgCost: number;
    distanceToStopLossPct: number;
    distanceToTakeProfitPct: number;
    currentNavQuote: number;
    peakNavQuote: number;
    drawdownPct: number;
    dailyPnlPct: number;
    backoffMultiplier: number;
  };
}

export class RiskManager {
  private config: RiskConfig = {
    stopLossPct: 3.0,
    takeProfitPct: 5.0,
    maxDrawdownPct: 8.0,
    dailyLossLimitPct: 5.0,
    maxPositionPctNav: 25.0,
    consecutiveRefusalThreshold: 3,
  };

  private peakNavQuote = 0;
  private dayStartNavQuote = 0;
  private currentDay = new Date().getUTCDay();
  private consecutiveRefusals = 0;
  private backoffMultiplier = 1;

  constructor(customConfig?: Partial<RiskConfig>) {
    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }
  }

  public getConfig(): RiskConfig {
    return { ...this.config };
  }

  public setStopLoss(pct: number): { success: boolean; message: string } {
    // Clamped between 0.5% and 20%
    const clamped = Math.max(0.5, Math.min(20, pct));
    this.config.stopLossPct = clamped;
    return { success: true, message: `Stop-loss threshold updated to ${clamped}% below entry cost.` };
  }

  public setTakeProfit(pct: number): { success: boolean; message: string } {
    // Clamped between 1% and 50%
    const clamped = Math.max(1.0, Math.min(50, pct));
    this.config.takeProfitPct = clamped;
    return { success: true, message: `Take-profit threshold updated to ${clamped}% above entry cost.` };
  }

  public setMaxDrawdown(pct: number): { success: boolean; message: string } {
    // Clamped between 2% and 25%
    const clamped = Math.max(2.0, Math.min(25, pct));
    this.config.maxDrawdownPct = clamped;
    return { success: true, message: `Max portfolio drawdown limit updated to ${clamped}%.` };
  }

  public setDailyLossLimit(pct: number): { success: boolean; message: string } {
    const clamped = Math.max(1.0, Math.min(20, pct));
    this.config.dailyLossLimitPct = clamped;
    return { success: true, message: `Daily loss limit updated to ${clamped}%.` };
  }

  public recordRefusal() {
    this.consecutiveRefusals++;
    if (this.consecutiveRefusals >= this.config.consecutiveRefusalThreshold) {
      this.backoffMultiplier = Math.min(4, this.backoffMultiplier * 2);
    }
  }

  public recordSuccess() {
    this.consecutiveRefusals = 0;
    this.backoffMultiplier = 1;
  }

  public getBackoffMultiplier(): number {
    return this.backoffMultiplier;
  }

  /**
   * Evaluates all on-chain risk triggers before the AI proposer is queried.
   */
  public evaluate(params: {
    spotPrice: number;
    avgCost: number;
    baseBalance: bigint;
    navQuote: number;
    refAgeMs: number;
  }): RiskEvaluation {
    const { spotPrice, avgCost, baseBalance, navQuote, refAgeMs } = params;

    // Daily rollover tracking
    const today = new Date().getUTCDay();
    if (today !== this.currentDay || this.dayStartNavQuote === 0) {
      this.currentDay = today;
      this.dayStartNavQuote = navQuote > 0 ? navQuote : 1;
    }

    if (navQuote > this.peakNavQuote) {
      this.peakNavQuote = navQuote;
    }

    // 1. Drawdown calculation
    const drawdownPct = this.peakNavQuote > 0
      ? ((this.peakNavQuote - navQuote) / this.peakNavQuote) * 100
      : 0;

    // 2. Daily loss calculation
    const dailyPnlPct = this.dayStartNavQuote > 0
      ? ((navQuote - this.dayStartNavQuote) / this.dayStartNavQuote) * 100
      : 0;

    // 3. Stop-loss & take-profit distance
    let distanceToStopLossPct = 999;
    let distanceToTakeProfitPct = 999;
    if (avgCost > 0) {
      const pnlPct = ((spotPrice - avgCost) / avgCost) * 100;
      distanceToStopLossPct = pnlPct + this.config.stopLossPct; // 0 when triggered
      distanceToTakeProfitPct = this.config.takeProfitPct - pnlPct; // 0 when triggered
    }

    const details = {
      spotPrice,
      avgCost,
      distanceToStopLossPct: Number(distanceToStopLossPct.toFixed(2)),
      distanceToTakeProfitPct: Number(distanceToTakeProfitPct.toFixed(2)),
      currentNavQuote: Number(navQuote.toFixed(4)),
      peakNavQuote: Number(this.peakNavQuote.toFixed(4)),
      drawdownPct: Number(drawdownPct.toFixed(2)),
      dailyPnlPct: Number(dailyPnlPct.toFixed(2)),
      backoffMultiplier: this.backoffMultiplier,
    };

    // Trigger 1: Stale reference price (>90s)
    if (refAgeMs > 90_000) {
      return {
        triggered: true,
        type: "STALE_REF",
        action: "HOLD",
        reason: `Reference price is stale (${Math.round(refAgeMs / 1000)}s old > 90s safety limit). Autonomous trading suspended.`,
        source: "system",
        details,
      };
    }

    // Trigger 2: Max Drawdown breach
    if (drawdownPct >= this.config.maxDrawdownPct) {
      return {
        triggered: true,
        type: "MAX_DRAWDOWN",
        action: "EMERGENCY_PAUSE",
        reason: `Max drawdown limit breached (${drawdownPct.toFixed(1)}% >= ${this.config.maxDrawdownPct}%). Calling ExecutionGuard.pause() and halting agent loop.`,
        source: "drawdown",
        details,
      };
    }

    // Trigger 3: Daily loss limit breach
    if (dailyPnlPct <= -this.config.dailyLossLimitPct) {
      return {
        triggered: true,
        type: "DAILY_LOSS",
        action: "EMERGENCY_PAUSE",
        reason: `Daily loss limit breached (${dailyPnlPct.toFixed(1)}% <= -${this.config.dailyLossLimitPct}%). Calling ExecutionGuard.pause() and halting agent loop.`,
        source: "daily-loss",
        details,
      };
    }

    // Trigger 4: Stop-Loss exit (if holding base asset)
    if (baseBalance > 0n && avgCost > 0) {
      const lossPct = ((avgCost - spotPrice) / avgCost) * 100;
      if (lossPct >= this.config.stopLossPct) {
        return {
          triggered: true,
          type: "STOP_LOSS",
          action: "EXIT_POSITION",
          reason: `Position stop-loss triggered: spot ($${spotPrice.toFixed(4)}) is ${lossPct.toFixed(1)}% below entry cost ($${avgCost.toFixed(4)}), breaching ${this.config.stopLossPct}% threshold.`,
          source: "stop-loss",
          details,
        };
      }
    }

    // Trigger 5: Take-Profit exit (if holding base asset)
    if (baseBalance > 0n && avgCost > 0) {
      const gainPct = ((spotPrice - avgCost) / avgCost) * 100;
      if (gainPct >= this.config.takeProfitPct) {
        return {
          triggered: true,
          type: "TAKE_PROFIT",
          action: "EXIT_POSITION",
          reason: `Take-profit triggered: spot ($${spotPrice.toFixed(4)}) is +${gainPct.toFixed(1)}% above entry cost ($${avgCost.toFixed(4)}), reaching ${this.config.takeProfitPct}% target.`,
          source: "take-profit",
          details,
        };
      }
    }

    return {
      triggered: false,
      type: "NONE",
      action: "HOLD",
      reason: "All risk parameters within safety boundaries.",
      source: "system",
      details,
    };
  }
}

