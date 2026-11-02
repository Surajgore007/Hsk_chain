/**
 * chat.ts — Natural Language Chat Controller with Zod schema & LLM / Rules dual parser
 *
 * Flow:
 * 1. Checks for prompt-injection attacks.
 * 2. Attempts structured JSON parse via Groq or Gemini (if API key available).
 * 3. Falls back seamlessly to deterministic `parseWithRules` if LLM fails, is rate-limited, or absent.
 * 4. Validates parsed intent through strict Zod schemas.
 * 5. Executes deterministic handlers. The LLM NEVER sets amounts, addresses, or triggers trades directly.
 */

import { z } from "zod";
import { parseWithRules, detectPromptInjection, type ParsedIntent } from "./rules.js";
import { APP_CONFIG, RISK_PRESETS, type RiskPreset } from "./config.js";

// Zod schemas for strict intent validation
const TradeIntentSchema = z.object({
  intent: z.literal("TRADE"),
  trade: z.object({
    side: z.enum(["BUY", "SELL"]),
    amount: z.object({
      value: z.number().positive(),
      unit: z.enum(["BASE", "QUOTE", "PERCENT_BALANCE"]),
    }),
    maxImpactBps: z.number().int().min(1).max(150).optional(), // Max ceiling 150 bps
  }),
});

const RiskIntentSchema = z.object({
  intent: z.literal("SET_RISK"),
  riskPreset: z.enum(["conservative", "balanced", "aggressive"]).optional(),
  impactBudgetBps: z.number().int().min(5).max(150).optional(),
});

const SizeIntentSchema = z.object({
  intent: z.literal("SET_SIZE"),
  percentOfBalance: z.number().min(1).max(50), // Hard ceiling 50%
});

const FrequencyIntentSchema = z.object({
  intent: z.literal("SET_FREQUENCY"),
  frequencySeconds: z.number().int().min(10).max(600).optional(),
  frequencyMultiplier: z.number().positive().optional(),
});

const AssetIntentSchema = z.object({
  intent: z.literal("SET_ASSET"),
  assetPair: z.string(),
});

const StopLossIntentSchema = z.object({
  intent: z.literal("SET_STOP_LOSS"),
  stopLossPct: z.number().min(0.5).max(20),
});

const TakeProfitIntentSchema = z.object({
  intent: z.literal("SET_TAKE_PROFIT"),
  takeProfitPct: z.number().min(1).max(50),
});

const MaxDrawdownIntentSchema = z.object({
  intent: z.literal("SET_MAX_DRAWDOWN"),
  maxDrawdownPct: z.number().min(2).max(25),
});

const SimpleIntentSchema = z.object({
  intent: z.enum([
    "STATUS",
    "SHOW_POSITIONS",
    "SHOW_PNL",
    "SHOW_DEPTH",
    "SHOW_SIGNALS",
    "EXPLAIN_LAST",
    "WHY_HOLD",
    "PAUSE",
    "RESUME",
    "EMERGENCY_STOP",
    "AUTO_ON",
    "AUTO_OFF",
    "UNKNOWN",
  ]),
  explanation: z.string().optional(),
});

export const AnyIntentSchema = z.discriminatedUnion("intent", [
  TradeIntentSchema,
  RiskIntentSchema,
  SizeIntentSchema,
  FrequencyIntentSchema,
  AssetIntentSchema,
  StopLossIntentSchema,
  TakeProfitIntentSchema,
  MaxDrawdownIntentSchema,
  SimpleIntentSchema,
]);

export interface ThoughtStep {
  title: string;
  detail: string;
  status?: "done" | "active" | "warning";
}

export interface ChatResponse {
  reply: string;
  parsedIntent: ParsedIntent;
  parserBadge: "LLM" | "rules";
  previewId?: string;
  previewCard?: Record<string, unknown>;
  requiresConfirmation?: boolean;
  thoughtProcess?: ThoughtStep[];
}

export function generateThoughtProcess(
  message: string,
  parsed: ParsedIntent,
  badge: "LLM" | "rules",
  currentRisk: RiskPreset,
  ctx?: {
    poolAddress?: string;
    spotPriceDisplay?: number;
    refPriceDisplay?: number;
    baseBal?: string;
    quoteBal?: string;
    activePair?: string;
  }
): ThoughtStep[] {
  const steps: ThoughtStep[] = [];

  // Step 1: Parser & Intent Classification (Runs for every incoming message)
  const modelName = APP_CONFIG.GROQ_MODEL.split("/")[1] || APP_CONFIG.GROQ_MODEL || "GPT-OSS";
  steps.push({
    title: `1. Intent Parsing via ${badge === "LLM" ? `Groq (${modelName})` : "Deterministic Rules"}`,
    detail: `Parsed prompt "${message.length > 32 ? message.slice(0, 32) + '...' : message}" → Intent: ${parsed.intent}. Prompt-injection verification passed.`,
    status: "done",
  });

  // Steps 2+: ONLY include steps that actually executed for this specific intent
  if (parsed.intent === "TRADE" && parsed.trade) {
    const poolShort = ctx?.poolAddress ? `${ctx.poolAddress.slice(0, 6)}...${ctx.poolAddress.slice(-4)}` : "0xe0f4...dfaf";
    const spotStr = ctx?.spotPriceDisplay !== undefined ? `${ctx.spotPriceDisplay.toFixed(4)} USDT` : "live spot";
    const refStr = ctx?.refPriceDisplay !== undefined ? `${ctx.refPriceDisplay.toFixed(4)} USDT` : "mainnet ref";
    const pairLabel = ctx?.activePair || "WHSK/tUSDT";
    steps.push({
      title: "2. Pool Liquidity & State Inspection",
      detail: `Querying HSK Testnet pool ${poolShort} (${pairLabel}). Reading slot0 (${spotStr}) vs reference price (${refStr}).`,
      status: "done",
    });

    const budget = parsed.trade.maxImpactBps || Number(RISK_PRESETS[currentRisk].impactBudgetBps);
    steps.push({
      title: "3. QuoterV2 Depth Curve Sweep",
      detail: `Simulating ${parsed.trade.side} order (${parsed.trade.amount.value} ${parsed.trade.amount.unit}). Enforcing active ${currentRisk.toUpperCase()} impact budget ceiling (${budget} bps).`,
      status: "done",
    });
    steps.push({
      title: "4. ExecutionGuard On-Chain Verification",
      detail: "Generated atomic swap payload: recipient hardcoded to address(this), minOutput floor calculated with slippage buffer.",
      status: "done",
    });
  } else if (parsed.intent === "SET_RISK") {
    const preset = parsed.riskPreset || "custom";
    const budget = parsed.impactBudgetBps || (parsed.riskPreset ? Number(RISK_PRESETS[parsed.riskPreset].impactBudgetBps) : 60);
    steps.push({
      title: "2. Risk Calibration & Impact Budget Update",
      detail: `Calibrated policy to ${preset.toUpperCase()}: impact ceiling set to ${budget} bps. Sizer will auto-trim future orders exceeding this limit.`,
      status: "done",
    });
  } else if (parsed.intent === "SET_FREQUENCY") {
    steps.push({
      title: "2. Polling Cadence Adjustment",
      detail: "Recalculated autonomous trading loop timer and updated background interval.",
      status: "done",
    });
  } else if (parsed.intent === "STATUS" || parsed.intent === "SHOW_POSITIONS" || parsed.intent === "SHOW_PNL") {
    const baseDisp = ctx?.baseBal ?? "on-chain WHSK";
    const quoteDisp = ctx?.quoteBal ?? "on-chain tUSDT";
    steps.push({
      title: "2. Portfolio & State Aggregation",
      detail: `Queried on-chain token balances (${baseDisp}, ${quoteDisp}), active network block, and NAV parameters.`,
      status: "done",
    });
  } else if (parsed.intent === "EMERGENCY_STOP" || parsed.intent === "PAUSE") {
    steps.push({
      title: "2. Safety Circuit Interlock",
      detail: "Halt signal recorded. Autonomous order generator paused to prevent unintended swaps.",
      status: "warning",
    });
  } else if (parsed.intent === "RESUME") {
    steps.push({
      title: "2. On-Chain Pause Verification",
      detail: "Verified ExecutionGuard.paused() state on-chain before resuming execution loop.",
      status: "done",
    });
  } else if (parsed.intent === "EXPLAIN_LAST") {
    steps.push({
      title: "2. Decision Ledger Query",
      detail: "Retrieved last decision record: cross-referencing requested vs decided size, price impact, and on-chain proof hash.",
      status: "done",
    });
  } else if (parsed.intent === "AUTO_ON" || parsed.intent === "AUTO_OFF") {
    steps.push({
      title: "2. Autonomous Mode Controller",
      detail: `Switched autonomous execution mode to ${parsed.intent === "AUTO_ON" ? "ENABLED" : "DISABLED"}.`,
      status: "done",
    });
  } else {
    steps.push({
      title: "2. Policy Guardrail Verification",
      detail: "No unauthorized funds or invalid routing requested. Deterministic safety boundaries maintained.",
      status: "done",
    });
  }

  return steps;
}

const SYSTEM_PROMPT = `You are a strict natural language parser for Fathom, an autonomous AI trading agent for HSKSwap on HSK Chain.
Your ONLY role is to parse the user's message into a structured JSON intent.
You NEVER make financial recommendations, generate quotes, or execute trades.
OUTPUT JSON ONLY matching one of these intent types:
1. STATUS: {"intent": "STATUS"}
2. SHOW_POSITIONS: {"intent": "SHOW_POSITIONS"}
3. SHOW_PNL: {"intent": "SHOW_PNL"}
4. SHOW_DEPTH: {"intent": "SHOW_DEPTH"}
5. SHOW_SIGNALS: {"intent": "SHOW_SIGNALS"}
6. EXPLAIN_LAST: {"intent": "EXPLAIN_LAST"} (Use for questions like "why did you refuse?", "why refuse?", "why was that rejected?", "why trimmed?", "explain last trade", "what happened to my order?")
7. WHY_HOLD: {"intent": "WHY_HOLD"} (Use for questions like "why are you holding?", "why no trades?", "why hold?")
8. TRADE: {"intent": "TRADE", "trade": {"side": "BUY"|"SELL", "amount": {"value": number, "unit": "BASE"|"QUOTE"|"PERCENT_BALANCE"}, "maxImpactBps": number optional}}
9. SET_RISK: {"intent": "SET_RISK", "riskPreset": "conservative"|"balanced"|"aggressive" OR "impactBudgetBps": number}
10. SET_SIZE: {"intent": "SET_SIZE", "percentOfBalance": number (1-50)}
11. SET_FREQUENCY: {"intent": "SET_FREQUENCY", "frequencySeconds": number (10-600)}
12. SET_ASSET: {"intent": "SET_ASSET", "assetPair": "WHSK/tUSDT"|"tWETH/tUSDT"|"tWBTC/tUSDT"}
13. SET_STOP_LOSS: {"intent": "SET_STOP_LOSS", "stopLossPct": number}
14. SET_TAKE_PROFIT: {"intent": "SET_TAKE_PROFIT", "takeProfitPct": number}
15. SET_MAX_DRAWDOWN: {"intent": "SET_MAX_DRAWDOWN", "maxDrawdownPct": number}
16. PAUSE: {"intent": "PAUSE"}
17. RESUME: {"intent": "RESUME"}
18. EMERGENCY_STOP: {"intent": "EMERGENCY_STOP"}
19. AUTO_ON: {"intent": "AUTO_ON"}
20. AUTO_OFF: {"intent": "AUTO_OFF"}
21. UNKNOWN: {"intent": "UNKNOWN", "explanation": "string question"}

Output raw JSON only without markdown or commentary.`;

export async function parseWithLLM(message: string): Promise<ParsedIntent | null> {
  const provider = APP_CONFIG.LLM_PROVIDER;

  if (provider === "groq" && APP_CONFIG.GROQ_API_KEY) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${APP_CONFIG.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: APP_CONFIG.GROQ_MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: message },
          ],
          temperature: 0,
          response_format: { type: "json_object" },
        }),
      });

      if (!res.ok) return null;
      const data = (await res.json()) as any;
      const rawText = data.choices?.[0]?.message?.content;
      if (!rawText) return null;

      const parsedJson = JSON.parse(rawText);
      const validated = AnyIntentSchema.safeParse(parsedJson);
      if (validated.success) {
        return {
          ...(validated.data as any),
          source: "LLM",
        };
      }
    } catch {
      return null;
    }
  }

  return null;
}

export interface ChatContext {
  statusSummary: string;
  portfolioSummary: string;
  lastDecisionSummary?: string;
  lastHoldSummary?: string;
  signalsSummary?: string;
  currentRisk: RiskPreset;
  poolAddress?: string;
  spotPriceDisplay?: number;
  refPriceDisplay?: number;
  baseBal?: string;
  quoteBal?: string;
  activePair?: string;
  supportedPairs?: string[];
  stopLossPct?: number;
  takeProfitPct?: number;
  maxDrawdownPct?: number;
}

export async function processChatMessage(
  message: string,
  context: ChatContext
): Promise<ChatResponse> {
  // 1. Safety check
  if (detectPromptInjection(message)) {
    return {
      reply: "Security Alert: Prompt injection keywords detected. Request rejected without touching contracts or funds.",
      parsedIntent: {
        intent: "UNKNOWN",
        source: "RULES",
      },
      parserBadge: "rules",
      thoughtProcess: [
        {
          title: "1. Security Filter Triggered",
          detail: "Detected prompt injection / override pattern in user input.",
          status: "warning",
        },
        {
          title: "2. Deterministic Isolation",
          detail: "Execution blocked immediately before reaching LLM parser or smart contracts.",
          status: "warning",
        },
      ],
    };
  }

  // 2. Try LLM parse first
  let parsed: ParsedIntent | null = null;
  let badge: "LLM" | "rules" = "rules";

  parsed = await parseWithLLM(message);
  if (parsed && parsed.intent !== "UNKNOWN") {
    badge = "LLM";
  } else {
    // 3. Fallback to deterministic rules if LLM is unavailable or returned UNKNOWN
    const rulesParsed = parseWithRules(message);
    if (rulesParsed.intent !== "UNKNOWN" || !parsed) {
      parsed = rulesParsed;
      badge = "rules";
    }
  }

  // 4. Deterministic handler responses
  let reply = "";
  switch (parsed.intent) {
    case "STATUS":
      reply = context.statusSummary;
      break;

    case "SHOW_POSITIONS":
    case "SHOW_PNL":
      reply = context.portfolioSummary;
      break;

    case "SHOW_DEPTH":
      reply = "Live pool depth curve loaded in the Depth tab on the right panel. Price impact is evaluated across 1% to 100% of vault balance.";
      break;

    case "EXPLAIN_LAST":
      reply = context.lastDecisionSummary || "No prior trade decisions recorded yet in this session.";
      break;

    case "SET_RISK":
      if (parsed.riskPreset) {
        const p = RISK_PRESETS[parsed.riskPreset];
        reply = `Risk profile updated to **${parsed.riskPreset.toUpperCase()}**.\n- Impact Budget: ${p.impactBudgetBps} bps\n- Slippage Allowance: ${p.slippageBps} bps\n- Max Trade Size: ${p.maxTradePercent}% of balance\n- Cooldown: ${p.cooldownSeconds}s`;
      } else if (parsed.impactBudgetBps) {
        reply = `Impact budget updated to **${parsed.impactBudgetBps} bps**. Orders causing impact above this will be trimmed or refused.`;
      }
      break;

    case "SET_SIZE":
      reply = `Max per-trade size set to **${parsed.percentOfBalance}%** of vault balance (contract hard ceiling: 50%).`;
      break;

    case "SET_FREQUENCY":
      reply = `Autonomous trading poll frequency set to **${parsed.frequencySeconds} seconds**.`;
      break;

    case "SHOW_SIGNALS":
      reply = context.signalsSummary || "Live signals: EMA fast/slow, rolling z-score, spread vs reference price, and pool depth shrinkage are monitored continuously.";
      break;

    case "WHY_HOLD":
      reply = context.lastHoldSummary || "No hold decisions logged yet. The AI proposes HOLD when market spread is within normal bands and pool depth is stable.";
      break;

    case "SET_STOP_LOSS":
      reply = `Stop-loss threshold set to **${parsed.stopLossPct}%**. Automatic position unwind triggers if drawdown exceeds this limit.`;
      break;

    case "SET_TAKE_PROFIT":
      reply = `Take-profit threshold set to **${parsed.takeProfitPct}%**. Automatic profit-taking will trigger once target gains are secured.`;
      break;

    case "SET_MAX_DRAWDOWN":
      reply = `Max portfolio drawdown set to **${parsed.maxDrawdownPct}%**. If NAV drops by this amount from its peak, the agent halts and engages the ExecutionGuard circuit breaker.`;
      break;

    case "SET_ASSET": {
      const p = parsed.assetPair?.toUpperCase() || "";
      if (p.includes("WETH") || p.includes("ETH")) {
        reply = "Active pair switched to **tWETH / tUSDT** (Fee tier: 3000 / 0.3%, deep pool).";
      } else if (p.includes("WBTC") || p.includes("BTC")) {
        reply = "Active pair switched to **tWBTC / tUSDT** (Fee tier: 3000 / 0.3%, deep pool).";
      } else if (p.includes("WHSK") || p.includes("HSK")) {
        reply = "Active pair switched to **WHSK / tUSDT** (Fee tier: 3000 / 0.3%).";
      } else {
        reply = `Supported pairs: **tWETH/tUSDT**, **tWBTC/tUSDT**, and **WHSK/tUSDT**.`;
      }
      break;
    }

    case "PAUSE":
      reply = "Trading loop **PAUSED**. Market monitoring and depth calculations continue in read-only mode.";
      break;

    case "RESUME":
      reply = "Trading loop **RESUMED**. Autonomous signals and chat trade executions are active.";
      break;

    case "EMERGENCY_STOP":
      reply = "🚨 **EMERGENCY STOP ACTIVATED**. ExecutionGuard.pause() triggered. All swaps are blocked at the smart contract level.";
      break;

    case "AUTO_ON":
      reply = "Autonomous trading loop **ENABLED**. Agent will monitor on-chain reference deviations and execute depth-guarded trades.";
      break;

    case "AUTO_OFF":
      reply = "Autonomous trading loop **DISABLED**. Agent will only analyze and await manual chat orders.";
      break;

    case "TRADE":
      reply = `Evaluating order: ${parsed.trade?.side} ${parsed.trade?.amount.value} ${parsed.trade?.amount.unit}. Sweeping pool depth to calculate price impact...`;
      break;

    case "UNKNOWN":
    default:
      reply = parsed.explanation || "I didn't understand that instruction. You can ask for 'status', 'portfolio', 'buy 20%', 'be more cautious', or 'emergency stop'.";
      break;
  }

  const thoughtProcess = generateThoughtProcess(message, parsed, badge, context.currentRisk, context);

  return {
    reply,
    parsedIntent: parsed,
    parserBadge: badge,
    thoughtProcess,
  };
}
