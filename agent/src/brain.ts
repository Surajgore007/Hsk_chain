/**
 * brain.ts — Autonomous AI Trading Proposer (USP Core)
 *
 * Implements the core AI decision engine:
 * 1. Takes compact, structured market snapshot (spot, reference, spread, EMAs, z-score, depth curve, balances, PnL, risk limits).
 * 2. Calls Groq Cloud (LLaMA 3.3 70B Versatile, temperature 0, JSON mode).
 * 3. Zod-validates output: { action: BUY|SELL|HOLD, sizePct: 0-100, rationale: string<=240, confidence: 0-1, signalsUsed: string[] }.
 * 4. Fails safely to deterministic rule-based fallback on timeout, rate-limit, or invalid schema.
 * 5. Strictly a PROPOSER: proposal flows into Sizer -> Preflight -> ExecutionGuard.
 */

import { z } from "zod";
import { APP_CONFIG, RISK_PRESETS, type RiskPreset } from "./config.js";

export const AiProposalSchema = z.object({
  action: z.enum(["BUY", "SELL", "HOLD"]),
  sizePct: z.number().min(0).max(100),
  rationale: z.string().max(240),
  confidence: z.number().min(0).max(1),
  signalsUsed: z.array(z.string()),
});

export type AiProposal = z.infer<typeof AiProposalSchema>;

export interface BrainSnapshot {
  pairId: string;
  baseSymbol: string;
  quoteSymbol: string;
  spotPrice: number;
  referencePrice: number;
  spreadBps: number;
  emaFast: number;
  emaSlow: number;
  emaCross: "BULLISH" | "BEARISH" | "NEUTRAL";
  zScore: number;
  isWarmingUp: boolean;
  depthShrunk: boolean;
  baseBalanceFormatted: string;
  quoteBalanceFormatted: string;
  avgCost: number;
  unrealizedPnlPct: number;
  lastDecisions: Array<{ side: string; decision: string; reasonCode: string; humanReason: string }>;
  riskPreset: RiskPreset;
  impactBudgetBps: number;
  stopLossPct: number;
  takeProfitPct: number;
  cooldownSeconds: number;
  secondsSinceLastTrade: number;
}

export interface BrainDecision {
  proposal: AiProposal;
  source: "ai" | "rules-fallback";
  latencyMs: number;
}

const BRAIN_SYSTEM_PROMPT = `You are Fathom's Core AI Trading Engine on HashKey Chain DEX (HSKSwap).
You analyze live on-chain market snapshots and propose trading actions.
You are a PROPOSER ONLY. All proposals pass through a deterministic sizer and the on-chain ExecutionGuard vault contract.

STRATEGY GUIDELINES:
1. Spread Arbitrage / Mean Reversion:
   - If testnet pool is discounted vs reference (spreadBps <= -80) -> Propose BUY with sizePct matching risk preset.
   - If testnet pool is at a premium vs reference (spreadBps >= +80) -> Propose SELL with sizePct matching risk preset.
2. Trend & Momentum:
   - Confirm with EMA crossover and z-score. If z-score is extreme (> 2.0 or < -2.0), mean reversion is likely.
3. Liquidity Awareness:
   - If depthShrunk is true, be cautious and propose smaller sizePct.
4. Capital Preservation:
   - If cooldown is active (secondsSinceLastTrade < cooldownSeconds), propose HOLD.
   - If spread is within normal band (-80 to +80 bps) and no dislocation exists, propose HOLD.
   - If balances are insufficient for proposed side, propose HOLD.

OUTPUT FORMAT:
Output JSON ONLY matching this exact schema:
{
  "action": "BUY" | "SELL" | "HOLD",
  "sizePct": <number 0-100>,
  "rationale": "<string <= 240 chars explaining why, citing spread and signals>",
  "confidence": <number 0.0 to 1.0>,
  "signalsUsed": ["<signal1>", "<signal2>"]
}`;

export class AiBrain {
  /**
   * Evaluates the market snapshot and returns an AI proposal.
   * If the LLM is unavailable or fails, returns a deterministic rules fallback.
   */
  public async evaluate(snapshot: BrainSnapshot): Promise<BrainDecision> {
    const start = Date.now();

    // 1. Try Groq LLM
    if (APP_CONFIG.GROQ_API_KEY) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000); // 6s timeout

        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${APP_CONFIG.GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model: APP_CONFIG.GROQ_MODEL,
            messages: [
              { role: "system", content: BRAIN_SYSTEM_PROMPT },
              {
                role: "user",
                content: `MARKET SNAPSHOT:\n${JSON.stringify(snapshot, null, 2)}`,
              },
            ],
            temperature: 0,
            response_format: { type: "json_object" },
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (res.ok) {
          const data = (await res.json()) as any;
          const content = data.choices?.[0]?.message?.content;
          if (content) {
            const parsed = JSON.parse(content);
            const validated = AiProposalSchema.safeParse(parsed);
            if (validated.success) {
              return {
                proposal: validated.data,
                source: "ai",
                latencyMs: Date.now() - start,
              };
            }
          }
        }
      } catch (err) {
        // Fall through to deterministic rules fallback
      }
    }

    // 2. Deterministic Rules Fallback
    const fallbackProposal = this.computeRulesFallback(snapshot);
    return {
      proposal: fallbackProposal,
      source: "rules-fallback",
      latencyMs: Date.now() - start,
    };
  }

  /**
   * Deterministic quantitative fallback when LLM is unavailable, rate-limited, or timed out.
   */
  public computeRulesFallback(snapshot: BrainSnapshot): AiProposal {
    const preset = RISK_PRESETS[snapshot.riskPreset];
    const inCooldown = snapshot.secondsSinceLastTrade < snapshot.cooldownSeconds;

    if (inCooldown) {
      return {
        action: "HOLD",
        sizePct: 0,
        rationale: `Cooldown active (${snapshot.secondsSinceLastTrade}s / ${snapshot.cooldownSeconds}s). Preserving vault rate limits.`,
        confidence: 1.0,
        signalsUsed: ["cooldown"],
      };
    }

    const maxTrade = Number(preset.maxTradePercent);

    // Cheap pool -> BUY
    if (snapshot.spreadBps <= -Number(preset.signalThresholdBps)) {
      return {
        action: "BUY",
        sizePct: maxTrade,
        rationale: `Rules fallback: pool is discounted by ${Math.abs(snapshot.spreadBps)} bps vs ref price. Reversion opportunity.`,
        confidence: 0.8,
        signalsUsed: ["spreadBps", "emaCross"],
      };
    }

    // Expensive pool -> SELL
    if (snapshot.spreadBps >= Number(preset.signalThresholdBps)) {
      return {
        action: "SELL",
        sizePct: maxTrade,
        rationale: `Rules fallback: pool is at ${snapshot.spreadBps} bps premium vs ref price. Capturing spread.`,
        confidence: 0.8,
        signalsUsed: ["spreadBps", "emaCross"],
      };
    }

    return {
      action: "HOLD",
      sizePct: 0,
      rationale: `Rules fallback: spread (${snapshot.spreadBps} bps) within normal band (+/-${preset.signalThresholdBps} bps). No trade warranted.`,
      confidence: 0.95,
      signalsUsed: ["spreadBps"],
    };
  }
}

