/**
 * rules.ts — Deterministic regex fallback parser for natural language trading chat
 *
 * Guarantees that the chat interface functions 100% reliably even if Groq/Gemini
 * is offline, rate-limited, or has invalid API keys.
 * Also acts as a validator and safety filter against prompt injection.
 */

export type ChatIntentType =
  | "STATUS"
  | "SHOW_POSITIONS"
  | "SHOW_PNL"
  | "SHOW_DEPTH"
  | "SHOW_SIGNALS"
  | "EXPLAIN_LAST"
  | "WHY_HOLD"
  | "TRADE"
  | "SET_RISK"
  | "SET_SIZE"
  | "SET_FREQUENCY"
  | "SET_ASSET"
  | "SET_STOP_LOSS"
  | "SET_TAKE_PROFIT"
  | "SET_MAX_DRAWDOWN"
  | "PAUSE"
  | "RESUME"
  | "EMERGENCY_STOP"
  | "AUTO_ON"
  | "AUTO_OFF"
  | "UNKNOWN";

export interface ParsedTrade {
  side: "BUY" | "SELL";
  amount: {
    value: number;
    unit: "BASE" | "QUOTE" | "PERCENT_BALANCE";
  };
  maxImpactBps?: number;
}

export interface ParsedIntent {
  intent: ChatIntentType;
  trade?: ParsedTrade;
  riskPreset?: "conservative" | "balanced" | "aggressive";
  impactBudgetBps?: number;
  percentOfBalance?: number;
  frequencySeconds?: number;
  frequencyMultiplier?: number;
  assetPair?: string;
  stopLossPct?: number;
  takeProfitPct?: number;
  maxDrawdownPct?: number;
  explanation?: string;
  source: "RULES" | "LLM";
}

// Prompt injection check: reject any attempts to override instructions or steal funds
export function detectPromptInjection(text: string): boolean {
  const lower = text.toLowerCase();
  const dangerousPatterns = [
    /ignore (all|previous|prior|system)/i,
    /send (all|funds|tokens|coins|everything).*0x/i,
    /transfer (everything|all|balance).*to/i,
    /bypass (safety|limits|ceilings|guard)?/i,
    /disable (all )?guard/i,
    /developer mode/i,
    /system prompt/i,
    /prompt override/i,
  ];

  return dangerousPatterns.some((pattern) => pattern.test(lower));
}

export function parseWithRules(input: string): ParsedIntent {
  const text = input.trim();
  const lower = text.toLowerCase();

  // Safety filter first
  if (detectPromptInjection(lower)) {
    return {
      intent: "UNKNOWN",
      explanation: "Security alert: Instruction contained disallowed prompt manipulation keywords. Command rejected.",
      source: "RULES",
    };
  }

  // 1. Emergency stop / Panic
  if (
    lower.includes("emergency stop") ||
    lower.includes("kill switch") ||
    lower === "panic" ||
    lower.includes("halt all")
  ) {
    return { intent: "EMERGENCY_STOP", source: "RULES" };
  }

  // 2. Pause / Resume
  if (lower === "pause" || lower.includes("pause trading") || lower.includes("stop trading")) {
    return { intent: "PAUSE", source: "RULES" };
  }
  if (lower === "resume" || lower.includes("resume trading") || lower === "unpause") {
    return { intent: "RESUME", source: "RULES" };
  }

  // 3. Autonomous loop toggle
  if (lower === "auto on" || lower.includes("enable auto") || lower.includes("start auto")) {
    return { intent: "AUTO_ON", source: "RULES" };
  }
  if (lower === "auto off" || lower.includes("disable auto") || lower.includes("stop auto")) {
    return { intent: "AUTO_OFF", source: "RULES" };
  }

  // 4. Status / Info
  if (
    lower === "status" ||
    lower === "state" ||
    lower === "info" ||
    lower.includes("how are things") ||
    lower.includes("system status")
  ) {
    return { intent: "STATUS", source: "RULES" };
  }

  // 5. Positions / Portfolio
  if (
    (lower.includes("position") ||
      lower.includes("holding") ||
      lower === "portfolio" ||
      /\b(my )?balances?\b/i.test(lower)) &&
    !/\b(buy|sell|balanced|size)\b/i.test(lower)
  ) {
    return { intent: "SHOW_POSITIONS", source: "RULES" };
  }

  // 6. P&L / Profits
  if (
    lower.includes("p&l") ||
    lower.includes("pnl") ||
    lower.includes("profit") ||
    lower.includes("loss") ||
    lower.includes("how much made")
  ) {
    return { intent: "SHOW_PNL", source: "RULES" };
  }

  // 7. Depth curve / Liquidity
  if (
    lower.includes("depth") ||
    lower.includes("orderbook") ||
    lower.includes("impact curve") ||
    lower.includes("liquidity")
  ) {
    return { intent: "SHOW_DEPTH", source: "RULES" };
  }

  // 7b. Signals
  if (
    lower.includes("signal") ||
    lower.includes("technical") ||
    lower.includes("indicator") ||
    lower.includes("z-score") ||
    lower.includes("ema")
  ) {
    return { intent: "SHOW_SIGNALS", source: "RULES" };
  }

  // 8. Explain last decision / why hold
  if (lower.includes("why hold") || lower.includes("why did you hold") || lower.includes("why no trade")) {
    return { intent: "WHY_HOLD", source: "RULES" };
  }
  if (
    lower.includes("why did you refuse") ||
    lower.includes("explain last") ||
    lower.includes("why was it trimmed") ||
    lower.includes("why did you reject") ||
    lower.includes("what happened with the last trade") ||
    lower === "explain"
  ) {
    return { intent: "EXPLAIN_LAST", source: "RULES" };
  }

  // 8b. Stop-Loss, Take-Profit, Max Drawdown
  const slMatch = lower.match(/(?:set\s+)?stop[\s-]loss\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*%/i);
  if (slMatch) {
    return { intent: "SET_STOP_LOSS", stopLossPct: parseFloat(slMatch[1]), source: "RULES" };
  }

  const tpMatch = lower.match(/(?:set\s+)?take[\s-]profit\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*%/i);
  if (tpMatch) {
    return { intent: "SET_TAKE_PROFIT", takeProfitPct: parseFloat(tpMatch[1]), source: "RULES" };
  }

  const ddMatch = lower.match(/(?:set\s+)?(?:max\s+)?drawdown\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*%/i);
  if (ddMatch) {
    return { intent: "SET_MAX_DRAWDOWN", maxDrawdownPct: parseFloat(ddMatch[1]), source: "RULES" };
  }

  // 8c. Target Asset Switch
  const assetMatch = lower.match(/(?:switch\s+to\s+(?:pair\s+|asset\s+)?|set\s+asset\s+|trade\s+pair\s+)([a-z0-9/_-]+)/i);
  if (assetMatch) {
    const candidate = assetMatch[1].toLowerCase();
    const isRiskPreset = ["balanced", "conservative", "cautious", "aggressive", "normal"].includes(candidate);
    if (!isRiskPreset) {
      let rawPair = candidate.toUpperCase();
      if (rawPair.includes("ETH")) rawPair = "tWETH/tUSDT";
      else if (rawPair.includes("BTC")) rawPair = "tWBTC/tUSDT";
      else if (rawPair.includes("HSK")) rawPair = "WHSK/tUSDT";
      if (rawPair.includes("/") || ["TWETH/TUSDT", "TWBTC/TUSDT", "WHSK/TUSDT"].includes(rawPair)) {
        return { intent: "SET_ASSET", assetPair: rawPair, source: "RULES" };
      }
    }
  }

  // 9. Risk adjustments
  if (lower.includes("cautious") || lower.includes("conservative")) {
    return { intent: "SET_RISK", riskPreset: "conservative", source: "RULES" };
  }
  if (lower.includes("aggressive") || lower.includes("take more risk")) {
    return { intent: "SET_RISK", riskPreset: "aggressive", source: "RULES" };
  }
  if (lower.includes("balanced") || lower.includes("normal risk") || lower.includes("moderate")) {
    return { intent: "SET_RISK", riskPreset: "balanced", source: "RULES" };
  }
  const impactMatch = lower.match(/(?:impact|risk|budget)\s*(?:of|to|=)?\s*(\d+)\s*(?:bps|%)/i);
  if (impactMatch) {
    const val = parseInt(impactMatch[1], 10);
    return { intent: "SET_RISK", impactBudgetBps: val, source: "RULES" };
  }

  // 10. Position sizing adjustments
  const sizeMatch = lower.match(/(?:set )?size\s*(?:to|=)?\s*(\d+)%/i);
  if (sizeMatch) {
    return { intent: "SET_SIZE", percentOfBalance: parseInt(sizeMatch[1], 10), source: "RULES" };
  }

  // 11. Frequency adjustments (trade less often -> x2, trade more often -> x0.5)
  if (lower.includes("trade less often") || lower.includes("slower")) {
    return { intent: "SET_FREQUENCY", frequencyMultiplier: 2, source: "RULES" };
  }
  if (lower.includes("trade more often") || lower.includes("faster")) {
    return { intent: "SET_FREQUENCY", frequencyMultiplier: 0.5, source: "RULES" };
  }
  const freqMatch = lower.match(/(?:frequency|every|interval)\s*(?:of|to|=)?\s*(\d+)\s*(?:s|sec|seconds)?/i);
  if (freqMatch) {
    return { intent: "SET_FREQUENCY", frequencySeconds: parseInt(freqMatch[1], 10), source: "RULES" };
  }

  // 12. Trade orders (e.g. "buy 20% of my balance", "sell 5 WHSK but max 40 bps impact")
  const tradeMatch = lower.match(/\b(buy|sell)\b/i);
  if (tradeMatch) {
    const side = tradeMatch[1].toUpperCase() as "BUY" | "SELL";

    // Check for percent of balance
    const pctMatch = lower.match(/(\d+(?:\.\d+)?)\s*%\s*(?:of\s*(?:my\s*)?balance)?/i);
    let maxImpactBps: number | undefined;
    const impactLim = lower.match(/max\s*(\d+)\s*(?:bps|impact)/i);
    if (impactLim) {
      maxImpactBps = parseInt(impactLim[1], 10);
    }

    if (pctMatch) {
      const pct = parseFloat(pctMatch[1]);
      return {
        intent: "TRADE",
        trade: {
          side,
          amount: {
            value: pct,
            unit: "PERCENT_BALANCE",
          },
          maxImpactBps,
        },
        source: "RULES",
      };
    }

    // Check for fixed unit amounts (e.g. "5 whsk", "100 usdt")
    const unitMatch = lower.match(/(\d+(?:\.\d+)?)\s*(whsk|hsk|tusdt|usdt)/i);
    if (unitMatch) {
      const val = parseFloat(unitMatch[1]);
      const token = unitMatch[2].toLowerCase();
      const unit = token.includes("whsk") || token.includes("hsk") ? "BASE" : "QUOTE";
      return {
        intent: "TRADE",
        trade: {
          side,
          amount: {
            value: val,
            unit,
          },
          maxImpactBps,
        },
        source: "RULES",
      };
    }
  }

  // Fallback
  return {
    intent: "UNKNOWN",
    explanation: "I didn't recognize that command. Try: 'status', 'buy 20% of balance', 'be more cautious', 'why did you refuse?', or 'emergency stop'.",
    source: "RULES",
  };
}
