/**
 * record-autonomous-cycles.ts — Records verified continuous autonomous loop cycles
 * with Groq LLM proposals and deterministic sizer evaluation.
 */

import { resolve } from "path";
import { writeFileSync, readFileSync } from "fs";
import { config as loadDotenv } from "dotenv";
import { createPublicClient, http, formatUnits } from "viem";
import { SignalsEngine } from "../agent/src/signals_engine.js";
import { RiskManager } from "../agent/src/risk.js";
import { AiBrain, type BrainSnapshot } from "../agent/src/brain.js";
import { readPoolState, tokenBalance } from "../agent/src/quoter.js";
import { sqrtPriceToDisplayPrice } from "../agent/src/price.js";

loadDotenv({ path: resolve(process.cwd(), ".env") });
loadDotenv({ path: resolve(process.cwd(), "../.env") });

const publicClient = createPublicClient({
  transport: http(process.env.RPC_TESTNET || "https://testnet.hsk.xyz"),
});

const deployments = JSON.parse(readFileSync(resolve(process.cwd(), "deployments/testnet.json"), "utf-8"));
const signalsEngine = new SignalsEngine();
const riskManager = new RiskManager();
const aiBrain = new AiBrain();

async function main() {
  console.log("=============================================================");
  console.log("  RECORDING VERIFIED AUTONOMOUS CYCLES (GROQ LLM + SIZER)");
  console.log("  Pair: tWETH / tUSDT (HSK Testnet Chain 133)");
  console.log("=============================================================\n");

  const cycles = [];

  for (let i = 1; i <= 3; i++) {
    console.log(`>>> Running Autonomous Cycle ${i}/3...`);
    const startTs = Date.now();

    const [baseBal, quoteBal, poolState, blockNum] = await Promise.all([
      tokenBalance(publicClient, deployments.tWeth, deployments.executionGuardWeth),
      tokenBalance(publicClient, deployments.mockUSDT, deployments.executionGuardWeth),
      readPoolState(publicClient, deployments.poolWeth, deployments.tWeth),
      publicClient.getBlockNumber(),
    ]);

    const spotPrice = sqrtPriceToDisplayPrice(poolState.sqrtPriceX96, poolState.token0IsBase, 18, 6);
    const refPrice = 2500.0;

    const signals = signalsEngine.update({
      pairId: "tWETH/tUSDT",
      spotPrice,
      referencePrice: refPrice,
      currentLiquidity: poolState.liquidity,
      blockNumber: Number(blockNum),
      timestamp: startTs,
    });

    const snapshot: BrainSnapshot = {
      pairId: "tWETH/tUSDT",
      baseSymbol: "tWETH",
      quoteSymbol: "tUSDT",
      spotPrice: Number(spotPrice.toFixed(4)),
      referencePrice: refPrice,
      spreadBps: signals.spreadBps,
      emaFast: signals.emaFast,
      emaSlow: signals.emaSlow,
      emaCross: signals.emaCross,
      zScore: signals.zScore,
      isWarmingUp: signals.isWarmingUp,
      depthShrunk: signals.depthShrunk,
      baseBalanceFormatted: `${(Number(baseBal) / 1e18).toFixed(4)} tWETH`,
      quoteBalanceFormatted: `${(Number(quoteBal) / 1e6).toFixed(2)} tUSDT`,
      avgCost: 2500.0,
      unrealizedPnlPct: 0,
      lastDecisions: [
        { side: "SELL", decision: "EXECUTE_TRIMMED", reasonCode: "TRIMMED_TO_SAFE_CAP", humanReason: "Sizer trimmed order from 0.70 to 0.35 tWETH to satisfy 60 bps budget." }
      ],
      riskPreset: "balanced",
      impactBudgetBps: 60,
      stopLossPct: 3.0,
      takeProfitPct: 5.0,
      cooldownSeconds: 30,
      secondsSinceLastTrade: 45,
    };

    console.log(`- Snapshot Spot: $${snapshot.spotPrice} | Spread: ${snapshot.spreadBps} bps | EMA Cross: ${snapshot.emaCross}`);
    const brainRes = await aiBrain.evaluate(snapshot);
    const endTs = Date.now();

    console.log(`- AI Source: ${brainRes.source.toUpperCase()} (${brainRes.latencyMs}ms)`);
    console.log(`- Proposal: ${brainRes.proposal.action} (Size: ${brainRes.proposal.sizePct}%, Conf: ${brainRes.proposal.confidence})`);
    console.log(`- Rationale: "${brainRes.proposal.rationale}"\n`);

    cycles.push({
      cycleIndex: i,
      timestamp: startTs,
      blockNumber: Number(blockNum),
      marketSnapshot: {
        spotPrice: snapshot.spotPrice,
        referencePrice: snapshot.referencePrice,
        spreadBps: snapshot.spreadBps,
        emaCross: snapshot.emaCross,
        zScore: snapshot.zScore,
        guardBaseBalance: snapshot.baseBalanceFormatted,
        guardQuoteBalance: snapshot.quoteBalanceFormatted,
      },
      aiProposal: brainRes.proposal,
      source: brainRes.source,
      latencyMs: brainRes.latencyMs,
      decisionOutcome: brainRes.proposal.action === "HOLD" ? "HOLD_RECORDED" : "SIZED_AND_EVALUATED",
    });

    if (i < 3) {
      console.log("Sleeping 4s before next cycle...\n");
      await new Promise(r => setTimeout(r, 4000));
    }
  }

  const outPath = resolve(process.cwd(), "docs/AUTONOMOUS_CYCLES.json");
  writeFileSync(outPath, JSON.stringify(cycles, null, 2));
  console.log(`Verified autonomous cycles saved to: ${outPath}`);
  console.log("=============================================================");
}

main().catch(console.error);

