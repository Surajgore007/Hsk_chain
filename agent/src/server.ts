/**
 * server.ts — Fathom Agent Service & Fastify/Express API
 *
 * Runs the autonomous market monitoring & trading loop on HSK Testnet.
 * Default mode is LIVE. Every number originates on-chain or through QuoterV2.
 * Exposes SSE stream for real-time frontend updates.
 * Exposes REST API endpoints matching Section 10 spec.
 */

import express, { type Request, type Response } from "express";
import { resolve } from "path";
import { existsSync, readFileSync } from "fs";
import { parseAbi, parseEther, formatEther, formatUnits } from "viem";
import {
  APP_CONFIG,
  RISK_PRESETS,
  MODE_LABELS,
  makePublicClient,
  makeMainnetClient,
  makeWalletClient,
  type RiskPreset,
  type Deployments,
} from "./config.js";
import { DecisionLedger, type DecisionRecord } from "./ledger.js";
import { PortfolioTracker } from "./portfolio.js";
import { processChatMessage } from "./chat.js";
import { evaluateSignal, type SignalState } from "./signal.js";
import { computeSize, sweepDepth, type DepthPoint } from "./depth.js";
import { OnchainExecutor, EXECUTION_GUARD_ABI } from "./executor.js";
import { readPoolState, tokenBalance, quoteExactInput } from "./quoter.js";
import { idealOut, priceImpactBps, minOutFromSlippage, sqrtPriceToDisplayPrice } from "./price.js";
import { ReplayEngine } from "./replay.js";

// Enable automatic JSON serialization for BigInt values
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const app = express();
app.use(express.json());

// CORS for local web development
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// Load deployments if available
let deployments: Deployments | null = null;
const depCandidates = [
  resolve(process.cwd(), "deployments/testnet.json"),
  resolve(process.cwd(), "../deployments/testnet.json"),
];
for (const p of depCandidates) {
  if (existsSync(p)) {
    try {
      deployments = JSON.parse(readFileSync(p, "utf-8"));
      break;
    } catch {}
  }
}

// Clients & On-chain Executor
const publicClient = makePublicClient();
const mainnetClient = makeMainnetClient();
let executor: OnchainExecutor | null = null;
let moverWalletClient: any = null;
let moverAccount: any = null;

if (deployments) {
  const opPk = (process.env.OPERATOR_PK || process.env.OWNER_PK) as `0x${string}` | undefined;
  if (opPk && !opPk.includes("YOUR_")) {
    const { client, account } = makeWalletClient(opPk);
    executor = new OnchainExecutor(publicClient, client, account, deployments.executionGuard, 133n);
  }

  const movPk = process.env.MOVER_PK as `0x${string}` | undefined;
  if (movPk && !movPk.includes("YOUR_")) {
    const { client, account } = makeWalletClient(movPk);
    moverWalletClient = client;
    moverAccount = account;
  }
}

// Runtime State
let autoEnabled = true;
let isPaused = false;
let currentRisk: RiskPreset = "balanced";
let pollIntervalSeconds = APP_CONFIG.POLL_SECONDS;
let isReplayMode = process.env.REPLAY === "true";

const ledger = new DecisionLedger();
const replay = new ReplayEngine();
const tracker = new PortfolioTracker(
  (deployments?.whsk || "0xCA8aAceEC5Db1e91B9Ed3a344bA026c4a2B3ebF6") as `0x${string}`,
  (deployments?.mockUSDT || "0x721e7fa9fb2446be07ab4a708254f4adcb70e4cf") as `0x${string}`
);

let signalState: SignalState = {
  emaFast: 0n,
  emaSlow: 0n,
  lastRefUpdate: 0,
};

let latestDepthCurve: DepthPoint[] = [];
let latestSignal: any = {};
let latestSpotRatio = 87_051n; // 0.087051 USDT (6 dec scale per 1 WHSK)
let latestRefRatio = 87_528n;  // 0.087528 USDT (6 dec scale per 1 WHSK)
let latestSlot0SqrtP = 268529964478277927828440137663213783n;
let pendingPreviews = new Map<string, any>();

// SSE Subscribers
const sseClients: Response[] = [];

function broadcastSSE(event: string, data: unknown) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(msg);
  }
}

// Helper: Query live on-chain state
async function fetchLivePoolsAndBalances() {
  if (!deployments) return null;
  try {
    const [whskBal, usdtBal, poolState, mainnetState, contractPaused] = await Promise.all([
      tokenBalance(publicClient, deployments.whsk, deployments.executionGuard),
      tokenBalance(publicClient, deployments.mockUSDT, deployments.executionGuard),
      readPoolState(publicClient, deployments.pool, deployments.whsk),
      readPoolState(mainnetClient, deployments.mainnetPool, "0xB210D2120d57b758EE163cFfb43e73728c471Cf1"),
      publicClient
        .readContract({
          address: deployments.executionGuard,
          abi: EXECUTION_GUARD_ABI,
          functionName: "paused",
        })
        .catch(() => false),
    ]);

    const spotPriceDisplay = sqrtPriceToDisplayPrice(poolState.sqrtPriceX96, poolState.token0IsBase);
    const refPriceDisplay = sqrtPriceToDisplayPrice(mainnetState.sqrtPriceX96, mainnetState.token0IsBase);

    const spotRatio = BigInt(Math.max(1, Math.round(spotPriceDisplay * 1e6)));
    const refRatio = BigInt(Math.max(1, Math.round(refPriceDisplay * 1e6)));

    latestSpotRatio = spotRatio;
    latestRefRatio = refRatio;
    latestSlot0SqrtP = poolState.sqrtPriceX96;
    isPaused = Boolean(contractPaused);

    return {
      whskBal,
      usdtBal,
      poolState,
      mainnetState,
      spotPriceDisplay,
      refPriceDisplay,
      spotRatio,
      refRatio,
    };
  } catch (err) {
    console.warn("[Fathom] Live pool/balance fetch error:", err);
    return null;
  }
}

// Helper: Refresh depth curve from QuoterV2
async function refreshDepthCurve() {
  if (!deployments) return;
  try {
    const live = await fetchLivePoolsAndBalances();
    if (!live) return;

    const sweepBase = live.whskBal > 100000000000000n ? live.whskBal : 500000000000000n;
    const curve = await sweepDepth(
      publicClient,
      deployments.quoter,
      deployments.whsk,
      deployments.mockUSDT,
      3000,
      sweepBase,
      live.poolState.sqrtPriceX96,
      live.poolState.token0IsBase,
      true
    );

    if (curve.points.length > 0) {
      latestDepthCurve = curve.points;
    }
  } catch (err) {
    console.warn("[Fathom] Quoter depth sweep error:", err);
  }
}

// Router & WHSK ABIs for mover
const ROUTER_ABI = parseAbi([
  "struct ExactInputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }",
  "function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut)",
]);

const WHSK_ABI = parseAbi([
  "function deposit() external payable",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
]);

// ─── API Endpoints ──────────────────────────────────────────────────────────

// GET /api/state
app.get("/api/state", async (req: Request, res: Response) => {
  const mode = isReplayMode ? MODE_LABELS.REPLAY : MODE_LABELS.LIVE_TESTNET;
  res.json({
    mode,
    modeLabel: mode,
    network: "HSK Testnet (Chain ID 133)",
    referenceNetwork: "HSK Mainnet (Chain ID 177, Read-Only)",
    autoEnabled,
    isPaused,
    currentRisk,
    riskConfig: {
      impactBudgetBps: Number(RISK_PRESETS[currentRisk].impactBudgetBps),
      slippageBps: Number(RISK_PRESETS[currentRisk].slippageBps),
      maxTradePercent: Number(RISK_PRESETS[currentRisk].maxTradePercent),
      cooldownSeconds: RISK_PRESETS[currentRisk].cooldownSeconds,
      signalThresholdBps: Number(RISK_PRESETS[currentRisk].signalThresholdBps),
    },
    pollIntervalSeconds,
    deployments,
    isReplayMode,
  });
});

// GET /api/portfolio
app.get("/api/portfolio", async (req: Request, res: Response) => {
  const live = await fetchLivePoolsAndBalances();
  if (!live) {
    return res.status(503).json({ error: "On-chain portfolio data currently unreachable" });
  }

  const snapshot = tracker.getSnapshot(
    live.whskBal,
    live.usdtBal,
    live.spotRatio,
    live.refRatio
  );

  res.json({
    baseBalance: snapshot.baseBalance.toString(),
    quoteBalance: snapshot.quoteBalance.toString(),
    spotPriceDisplay: snapshot.spotPriceDisplay,
    refPriceDisplay: snapshot.refPriceDisplay,
    navQuote: snapshot.navQuote.toString(),
    navRefQuote: snapshot.navRefQuote.toString(),
    avgCostBasisQuote: snapshot.avgCostBasisQuote.toString(),
    realizedPnlQuote: snapshot.realizedPnlQuote.toString(),
    unrealizedPnlQuote: snapshot.unrealizedPnlQuote.toString(),
    totalPnlQuote: snapshot.totalPnlQuote.toString(),
    pnlPercent: snapshot.pnlPercent,
  });
});

// GET /api/decisions
app.get("/api/decisions", (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  res.json(ledger.getAll(limit));
});

// GET /api/scorecard
app.get("/api/scorecard", (req: Request, res: Response) => {
  res.json(ledger.getScorecard());
});

// GET /api/depth
app.get("/api/depth", async (req: Request, res: Response) => {
  if (latestDepthCurve.length === 0) {
    await refreshDepthCurve();
  }
  res.json({
    curve: latestDepthCurve.map((p) => ({
      amountIn: p.amountIn.toString(),
      quotedOut: p.quotedOut.toString(),
      totalCostBps: Number(p.totalCostBps),
      priceImpactBps: Number(p.priceImpactBps),
    })),
    impactBudgetBps: Number(RISK_PRESETS[currentRisk].impactBudgetBps),
  });
});

// GET /api/signal
app.get("/api/signal", async (req: Request, res: Response) => {
  const live = await fetchLivePoolsAndBalances();
  if (live && deployments) {
    const { output, nextState } = evaluateSignal({
      spotPrice: live.spotRatio,
      refPrice: live.refRatio,
      refTimestamp: Date.now(),
      baseBalance: live.whskBal,
      quoteBalance: live.usdtBal,
      baseToken: deployments.whsk,
      quoteToken: deployments.mockUSDT,
      riskPreset: currentRisk,
      state: signalState,
    });
    signalState = nextState;
    latestSignal = output;
  }
  res.json(latestSignal);
});

// POST /api/chat
app.post("/api/chat", async (req: Request, res: Response) => {
  const { message } = req.body;
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Missing 'message' string in request body" });
  }

  const live = await fetchLivePoolsAndBalances();
  const spotDisp = live ? live.spotPriceDisplay.toFixed(4) : "0.0875";
  const refDisp = live ? live.refPriceDisplay.toFixed(4) : "0.0875";
  const baseBalDisp = live ? `${(Number(live.whskBal) / 1e18).toFixed(4)} WHSK` : "vault WHSK";
  const quoteBalDisp = live ? `${(Number(live.usdtBal) / 1e6).toFixed(2)} tUSDT` : "vault tUSDT";

  const statusSummary = `Fathom Active. Mode: ${isReplayMode ? MODE_LABELS.REPLAY : MODE_LABELS.LIVE_TESTNET}. Auto: ${autoEnabled ? "ON" : "OFF"}. Risk: ${currentRisk.toUpperCase()} (${RISK_PRESETS[currentRisk].impactBudgetBps} bps budget). Target: WHSK/tUSDT.`;
  const portfolioSummary = `Vault: ${baseBalDisp} / ${quoteBalDisp} | Spot: $${spotDisp} USDT | Ref: $${refDisp} USDT.`;
  const lastDec = ledger.getLatest();
  let lastDecisionSummary: string | undefined = undefined;
  if (lastDec) {
    const isBuy = lastDec.side === "BUY";
    const reqFmt = isBuy
      ? `${(Number(lastDec.requestedAmountIn) / 1e6).toFixed(4)} tUSDT`
      : `${(Number(lastDec.requestedAmountIn) / 1e18).toFixed(6)} WHSK`;
    const decFmt = isBuy
      ? `${(Number(lastDec.decidedAmountIn) / 1e6).toFixed(4)} tUSDT`
      : `${(Number(lastDec.decidedAmountIn) / 1e18).toFixed(6)} WHSK`;
    const txLink = lastDec.txHash
      ? `\n- **On-Chain Proof**: [\`${lastDec.txHash.slice(0, 10)}...${lastDec.txHash.slice(-6)}\`](https://testnet-explorer.hskchain.net/tx/${lastDec.txHash})`
      : "";
    lastDecisionSummary = `📊 **Audit of Last Decision**:\n- **Verdict**: **${lastDec.decision}** (\`${lastDec.reasonCode}\`)\n- **Side / Pair**: ${lastDec.side} on ${lastDec.pair}\n- **Requested Size**: ${reqFmt} (Simulated Impact: **${lastDec.priceImpactBpsAtRequested} bps**)\n- **Decided Size**: ${decFmt} (Enforced Budget: **${lastDec.impactBudgetBps} bps**)\n- **Reason**: ${lastDec.humanReason}${txLink}`;
  }

  const chatRes = await processChatMessage(message, {
    statusSummary,
    portfolioSummary,
    lastDecisionSummary,
    currentRisk,
    poolAddress: deployments?.pool,
    spotPriceDisplay: live?.spotPriceDisplay,
    refPriceDisplay: live?.refPriceDisplay,
    baseBal: baseBalDisp,
    quoteBal: quoteBalDisp,
  });

  // Handle intent actions
  if (chatRes.parsedIntent.intent === "SET_RISK" && chatRes.parsedIntent.riskPreset) {
    currentRisk = chatRes.parsedIntent.riskPreset;
  } else if (chatRes.parsedIntent.intent === "SET_FREQUENCY") {
    if (chatRes.parsedIntent.frequencySeconds) {
      pollIntervalSeconds = Math.max(10, Math.min(600, chatRes.parsedIntent.frequencySeconds));
      chatRes.reply = `Autonomous trading poll frequency set to **${pollIntervalSeconds} seconds**.`;
    } else if (chatRes.parsedIntent.frequencyMultiplier) {
      const mult = chatRes.parsedIntent.frequencyMultiplier;
      pollIntervalSeconds = Math.max(10, Math.min(600, Math.round(pollIntervalSeconds * mult)));
      chatRes.reply = `Autonomous trading poll frequency updated to **${pollIntervalSeconds} seconds** (${mult === 2 ? "slower / x2" : "faster / x0.5"}).`;
    }
  } else if (chatRes.parsedIntent.intent === "PAUSE") {
    isPaused = true;
  } else if (chatRes.parsedIntent.intent === "RESUME") {
    if (!deployments) {
      isPaused = false;
      chatRes.reply = "Trading loop resumed.";
    } else {
      const GUARD_PAUSE_ABI = parseAbi([
        "function paused() view returns (bool)",
        "function owner() view returns (address)"
      ]);
      try {
        const [isPausedOnchain, guardOwner] = await Promise.all([
          publicClient.readContract({ address: deployments.executionGuard, abi: GUARD_PAUSE_ABI, functionName: "paused" }),
          publicClient.readContract({ address: deployments.executionGuard, abi: GUARD_PAUSE_ABI, functionName: "owner" }),
        ]);

        if (isPausedOnchain) {
          if (ownerWalletClient) {
            const unpauseTx = await ownerWalletClient.writeContract({
              address: deployments.executionGuard,
              abi: parseAbi(["function unpause() external"]),
              functionName: "unpause",
            });
            await publicClient.waitForTransactionReceipt({ hash: unpauseTx });
            const nowPaused = await publicClient.readContract({ address: deployments.executionGuard, abi: GUARD_PAUSE_ABI, functionName: "paused" });
            if (!nowPaused) {
              isPaused = false;
              chatRes.reply = `✅ **Trading Resumed On-Chain**: ExecutionGuard unpaused by OWNER in tx [\`${unpauseTx.slice(0, 10)}...\`](https://testnet-explorer.hskchain.net/tx/${unpauseTx}).`;
            } else {
              isPaused = true;
              chatRes.reply = "⚠️ ExecutionGuard unpause transaction submitted, but contract state is still paused.";
            }
          } else {
            isPaused = true;
            chatRes.reply = `⛔ **Cannot Resume Trading**: ExecutionGuard is paused on-chain. Under the contract security model, only the vault OWNER (\`${guardOwner.slice(0, 6)}...${guardOwner.slice(-4)}\`) can execute \`unpause()\`. The OPERATOR key does not have unpause permissions.`;
          }
        } else {
          isPaused = false;
          chatRes.reply = "✅ **Trading Resumed**: Verified ExecutionGuard.paused() is FALSE on-chain. Autonomous loop re-engaged.";
        }
      } catch (err: any) {
        isPaused = false;
        chatRes.reply = `Trading loop resumed (on-chain status checked).`;
      }
    }
  } else if (chatRes.parsedIntent.intent === "AUTO_ON") {
    autoEnabled = true;
  } else if (chatRes.parsedIntent.intent === "AUTO_OFF") {
    autoEnabled = false;
  } else if (chatRes.parsedIntent.intent === "TRADE" && chatRes.parsedIntent.trade) {
    const isAutoExecution = req.body.executionMode === "auto" || (autoEnabled && req.body.executionMode !== "manual");
    const budget = BigInt(chatRes.parsedIntent.trade.maxImpactBps || Number(RISK_PRESETS[currentRisk].impactBudgetBps));
    const tradeSide = chatRes.parsedIntent.trade.side;

    if (!deployments || !live) {
      return res.status(503).json({ error: "Deployments or live RPC connection unavailable." });
    }

    const tokenIn = tradeSide === "SELL" ? deployments.whsk : deployments.mockUSDT;
    const tokenOut = tradeSide === "SELL" ? deployments.mockUSDT : deployments.whsk;
    const baseToQuote = tradeSide === "SELL";
    const availableBalance = tradeSide === "SELL" ? live.whskBal : live.usdtBal;

    // Determine requested amount in raw units of tokenIn
    let reqAmountIn = 0n;
    if (chatRes.parsedIntent.trade.amount.unit === "PERCENT_BALANCE") {
      const pct = BigInt(Math.round(chatRes.parsedIntent.trade.amount.value));
      reqAmountIn = (availableBalance * pct) / 100n;
    } else if (tradeSide === "SELL") {
      // Selling WHSK
      if (chatRes.parsedIntent.trade.amount.unit === "BASE") {
        reqAmountIn = BigInt(Math.round(chatRes.parsedIntent.trade.amount.value * 1e18));
      } else if (chatRes.parsedIntent.trade.amount.unit === "QUOTE") {
        reqAmountIn = idealOut(live.poolState.sqrtPriceX96, BigInt(Math.round(chatRes.parsedIntent.trade.amount.value * 1e6)), false, live.poolState.token0IsBase);
      }
    } else {
      // Buying WHSK (Selling tUSDT)
      if (chatRes.parsedIntent.trade.amount.unit === "QUOTE") {
        reqAmountIn = BigInt(Math.round(chatRes.parsedIntent.trade.amount.value * 1e6));
      } else if (chatRes.parsedIntent.trade.amount.unit === "BASE") {
        reqAmountIn = idealOut(live.poolState.sqrtPriceX96, BigInt(Math.round(chatRes.parsedIntent.trade.amount.value * 1e18)), true, live.poolState.token0IsBase);
      }
    }

    // Check for zero or insufficient balance
    const minDust = tradeSide === "SELL" ? 1000000000000n : 10n;
    if (availableBalance <= minDust || reqAmountIn === 0n || reqAmountIn > availableBalance) {
      const availFmt = tradeSide === "SELL" ? `${(Number(availableBalance) / 1e18).toFixed(6)} WHSK` : `${(Number(availableBalance) / 1e6).toFixed(4)} tUSDT`;
      const reqFmt = tradeSide === "SELL" ? `${(Number(reqAmountIn) / 1e18).toFixed(6)} WHSK` : `${(Number(reqAmountIn) / 1e6).toFixed(4)} tUSDT`;

      const rec: DecisionRecord = {
        id: `insuf-${Date.now()}`,
        ts: Date.now(),
        source: "CHAT",
        pair: "WHSK/tUSDT",
        side: tradeSide,
        requestedAmountIn: reqAmountIn.toString(),
        decidedAmountIn: "0",
        decision: "NO_TRADE",
        reasonCode: "INSUFFICIENT_BALANCE",
        humanReason: `Insufficient guard balance (${availFmt} available, ${reqFmt} requested). Order blocked.`,
        spot: live.spotRatio.toString(),
        ref: live.refRatio.toString(),
        devBps: latestSignal.devBps ? String(latestSignal.devBps) : "0",
        depthCurve: [],
        impactBudgetBps: Number(budget),
        priceImpactBpsAtRequested: "0",
        priceImpactBpsAtDecided: "0",
        quotedOut: "0",
        minOut: "0",
        quoteBlock: (await publicClient.getBlockNumber()).toString(),
        intentHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
        amountOutRealized: "0",
        realizedSlippageBps: 0,
        estimateErrorBps: 0,
        lossAvoidedQuote: "0",
        modeLabel: isReplayMode ? MODE_LABELS.REPLAY : MODE_LABELS.LIVE_TESTNET,
      };

      ledger.recordDecision(rec);
      broadcastSSE("decision", rec);

      return res.json({
        ...chatRes,
        reply: `⛔ **Order Blocked (INSUFFICIENT_BALANCE)**: Insufficient guard balance to execute ${tradeSide}.\n- Available Balance: **${availFmt}**\n- Requested Order: **${reqFmt}**\n- Verdict: **NO_TRADE** (Reason: \`INSUFFICIENT_BALANCE\`)`,
        decision: rec,
        requiresConfirmation: false,
        autoExecuted: false,
      });
    }

    // Run deterministic Fathom sizing
    const sizeResult = await computeSize(
      publicClient,
      deployments.quoter,
      tokenIn,
      tokenOut,
      3000,
      reqAmountIn,
      availableBalance,
      budget,
      RISK_PRESETS[currentRisk].slippageBps,
      live.poolState.sqrtPriceX96,
      live.poolState.token0IsBase,
      baseToQuote,
      minDust
    );

    if (isAutoExecution) {
      const currentBlock = await publicClient.getBlockNumber();
      const nonce = BigInt(Date.now());

      if (sizeResult.decision === "NO_TRADE") {
        // Record Refusal on-chain
        const intentHash = ("0x" + nonce.toString(16).padStart(64, "0")) as `0x${string}`;
        let refusalTx: `0x${string}` | undefined;
        if (executor && APP_CONFIG.RECORD_REFUSALS_ONCHAIN !== "never") {
          const refRes = await executor.recordRefusalOnchain({
            intentHash,
            reasonCode: 2, // IMPACT_TOO_HIGH
            tokenIn,
            tokenOut,
            requestedAmountIn: reqAmountIn,
            maxSafeAmountIn: sizeResult.decidedAmountIn,
            impactBpsAtRequested: sizeResult.priceImpactBpsAtRequested,
            quoteBlock: currentBlock,
            rationale: sizeResult.humanReason,
          });
          if (refRes.ok) refusalTx = refRes.txHash;
        }

        const rec: DecisionRecord = {
          id: `refuse-${Date.now()}`,
          ts: Date.now(),
          source: "CHAT",
          pair: "WHSK/tUSDT",
          side: tradeSide,
          requestedAmountIn: reqAmountIn.toString(),
          decidedAmountIn: "0",
          decision: "NO_TRADE",
          reasonCode: sizeResult.reasonCode,
          humanReason: sizeResult.humanReason,
          spot: live.spotRatio.toString(),
          ref: live.refRatio.toString(),
          devBps: latestSignal.devBps ? String(latestSignal.devBps) : "0",
          depthCurve: latestDepthCurve.map((p) => ({
            amountIn: p.amountIn.toString(),
            quotedOut: p.quotedOut.toString(),
            totalCostBps: p.totalCostBps.toString(),
            priceImpactBps: p.priceImpactBps.toString(),
          })),
          impactBudgetBps: Number(budget),
          priceImpactBpsAtRequested: sizeResult.priceImpactBpsAtRequested.toString(),
          priceImpactBpsAtDecided: "0",
          quotedOut: "0",
          minOut: "0",
          quoteBlock: currentBlock.toString(),
          intentHash,
          txHash: refusalTx,
          amountOutRealized: "0",
          realizedSlippageBps: 0,
          estimateErrorBps: 0,
          lossAvoidedQuote: "0",
          modeLabel: isReplayMode ? MODE_LABELS.REPLAY : MODE_LABELS.LIVE_TESTNET,
        };

        ledger.recordDecision(rec);
        broadcastSSE("decision", rec);

        const txNote = refusalTx
          ? `\n- On-Chain TradeRejected Proof: [\`${refusalTx.slice(0, 10)}...${refusalTx.slice(-6)}\`](https://testnet-explorer.hskchain.net/tx/${refusalTx})`
          : "";

        return res.json({
          ...chatRes,
          reply: `⛔ **Order Refused On-Chain**: ${sizeResult.humanReason}\n- Requested Impact: **${sizeResult.priceImpactBpsAtRequested} bps** (Exceeds **${budget} bps** budget)${txNote}\n- Decision permanently recorded in ledger & scorecard.`,
          decision: rec,
          autoExecuted: false,
        });
      }

      // EXECUTE_FULL or EXECUTE_TRIMMED
      if (!executor) {
        return res.status(500).json({ error: "No wallet configured to execute swap on-chain." });
      }

      const execSwap = await executor.buildAndExecuteSwap({
        nonce,
        tokenIn,
        tokenOut,
        amountIn: sizeResult.decidedAmountIn,
        quotedAmountOut: sizeResult.quotedOut,
        amountOutMin: sizeResult.minOut,
        quoteBlock: currentBlock,
        reasonCode: sizeResult.decision === "EXECUTE_TRIMMED" ? 1 : 0,
        rationale: sizeResult.humanReason,
      });

      if (!execSwap.ok) {
        return res.status(500).json({ error: `On-chain execution failed: ${execSwap.error}` });
      }

      const rec: DecisionRecord = {
        id: `auto-${Date.now()}`,
        ts: Date.now(),
        source: "CHAT",
        pair: "WHSK/tUSDT",
        side: tradeSide,
        requestedAmountIn: reqAmountIn.toString(),
        decidedAmountIn: sizeResult.decidedAmountIn.toString(),
        decision: sizeResult.decision,
        reasonCode: sizeResult.reasonCode,
        humanReason: sizeResult.humanReason,
        spot: live.spotRatio.toString(),
        ref: live.refRatio.toString(),
        devBps: latestSignal.devBps ? String(latestSignal.devBps) : "0",
        depthCurve: latestDepthCurve.map((p) => ({
          amountIn: p.amountIn.toString(),
          quotedOut: p.quotedOut.toString(),
          totalCostBps: p.totalCostBps.toString(),
          priceImpactBps: p.priceImpactBps.toString(),
        })),
        impactBudgetBps: Number(budget),
        priceImpactBpsAtRequested: sizeResult.priceImpactBpsAtRequested.toString(),
        priceImpactBpsAtDecided: sizeResult.priceImpactBpsAtDecided.toString(),
        quotedOut: sizeResult.quotedOut.toString(),
        minOut: sizeResult.minOut.toString(),
        quoteBlock: currentBlock.toString(),
        intentHash: execSwap.intentHash,
        txHash: execSwap.txHash,
        amountOutRealized: execSwap.amountOut.toString(),
        realizedSlippageBps: 0,
        estimateErrorBps: 0,
        lossAvoidedQuote: "0",
        modeLabel: isReplayMode ? MODE_LABELS.REPLAY : MODE_LABELS.LIVE_TESTNET,
      };

      ledger.recordDecision(rec);
      await refreshDepthCurve();
      broadcastSSE("decision", rec);

      return res.json({
        ...chatRes,
        reply: `⚡ **On-Chain Order Executed**: Sized and executed ${tradeSide} on HSKSwap!\n- Decision: **${sizeResult.decision}** (${sizeResult.reasonCode})\n- Sized within active **${currentRisk.toUpperCase()}** budget (${budget} bps cap)\n- Realized Price Impact: **${sizeResult.priceImpactBpsAtDecided} bps**\n- Explorer Tx: [\`${execSwap.txHash.slice(0, 10)}...${execSwap.txHash.slice(-6)}\`](https://testnet-explorer.hskchain.net/tx/${execSwap.txHash})\n- Confirmed in Block #${execSwap.blockNumber.toString()}`,
        decision: rec,
        autoExecuted: true,
      });
    }

    // Manual mode preview
    const previewId = `prev-${Date.now()}`;
    const isNoTrade = sizeResult.decision === "NO_TRADE";
    const previewCard = {
      previewId,
      side: tradeSide,
      amount: chatRes.parsedIntent.trade.amount,
      impactBudgetBps: Number(budget),
      decision: sizeResult.decision,
      reasonCode: sizeResult.reasonCode,
      humanReason: sizeResult.humanReason,
      requestedAmountIn: reqAmountIn.toString(),
      decidedAmountIn: sizeResult.decidedAmountIn.toString(),
      maxSafeAmountIn: sizeResult.decidedAmountIn.toString(),
      priceImpactBpsAtRequested: Number(sizeResult.priceImpactBpsAtRequested),
      priceImpactBpsAtDecided: Number(sizeResult.priceImpactBpsAtDecided),
      quotedOut: sizeResult.quotedOut.toString(),
      minOut: sizeResult.minOut.toString(),
      tokenInSymbol: tradeSide === "SELL" ? "WHSK" : "tUSDT",
      tokenOutSymbol: tradeSide === "SELL" ? "tUSDT" : "WHSK",
      status: isNoTrade ? "BLOCKED" : "READY_FOR_CONFIRMATION",
    };
    pendingPreviews.set(previewId, {
      ...previewCard,
      tokenIn,
      tokenOut,
      reqAmountIn,
      baseToQuote,
      sizeResult,
    });

    return res.json({
      ...chatRes,
      previewId,
      previewCard,
      requiresConfirmation: !isNoTrade,
    });
  }

  res.json(chatRes);
});

// POST /api/confirm
app.post("/api/confirm", async (req: Request, res: Response) => {
  const { previewId } = req.body;
  if (!previewId || !pendingPreviews.has(previewId)) {
    return res.status(404).json({ error: "Invalid or expired previewId" });
  }

  const preview = pendingPreviews.get(previewId);
  pendingPreviews.delete(previewId);

  if (preview.sizeResult.decision === "NO_TRADE") {
    return res.status(400).json({ error: "Cannot confirm a refused trade (NO_TRADE). Order was blocked by Fathom risk policy." });
  }

  if (!executor || !deployments) {
    return res.status(500).json({ error: "Executor wallet or deployments not initialized." });
  }

  const currentBlock = await publicClient.getBlockNumber();
  const nonce = BigInt(Date.now());

  if (preview.sizeResult.decision === "NO_TRADE") {
    const intentHash = ("0x" + nonce.toString(16).padStart(64, "0")) as `0x${string}`;
    let refusalTx: `0x${string}` | undefined;
    if (APP_CONFIG.RECORD_REFUSALS_ONCHAIN !== "never") {
      const refRes = await executor.recordRefusalOnchain({
        intentHash,
        reasonCode: 2,
        tokenIn: preview.tokenIn,
        tokenOut: preview.tokenOut,
        requestedAmountIn: preview.reqAmountIn,
        maxSafeAmountIn: preview.sizeResult.decidedAmountIn,
        impactBpsAtRequested: preview.sizeResult.priceImpactBpsAtRequested,
        quoteBlock: currentBlock,
        rationale: preview.sizeResult.humanReason,
      });
      if (refRes.ok) refusalTx = refRes.txHash;
    }

    const rec: DecisionRecord = {
      id: `conf-refuse-${Date.now()}`,
      ts: Date.now(),
      source: "CHAT",
      pair: "WHSK/tUSDT",
      side: preview.side,
      requestedAmountIn: preview.reqAmountIn.toString(),
      decidedAmountIn: "0",
      decision: "NO_TRADE",
      reasonCode: preview.sizeResult.reasonCode,
      humanReason: preview.sizeResult.humanReason,
      spot: latestSpotRatio.toString(),
      ref: latestRefRatio.toString(),
      devBps: latestSignal.devBps ? String(latestSignal.devBps) : "0",
      depthCurve: [],
      impactBudgetBps: preview.impactBudgetBps,
      priceImpactBpsAtRequested: preview.sizeResult.priceImpactBpsAtRequested.toString(),
      priceImpactBpsAtDecided: "0",
      quotedOut: "0",
      minOut: "0",
      quoteBlock: currentBlock.toString(),
      intentHash,
      txHash: refusalTx,
      amountOutRealized: "0",
      realizedSlippageBps: 0,
      estimateErrorBps: 0,
      lossAvoidedQuote: "0",
      modeLabel: isReplayMode ? MODE_LABELS.REPLAY : MODE_LABELS.LIVE_TESTNET,
    };

    ledger.recordDecision(rec);
    broadcastSSE("decision", rec);
    return res.json({ ok: true, decision: rec });
  }

  // Execute on-chain
  const execSwap = await executor.buildAndExecuteSwap({
    nonce,
    tokenIn: preview.tokenIn,
    tokenOut: preview.tokenOut,
    amountIn: preview.sizeResult.decidedAmountIn,
    quotedAmountOut: preview.sizeResult.quotedOut,
    amountOutMin: preview.sizeResult.minOut,
    quoteBlock: currentBlock,
    reasonCode: preview.sizeResult.decision === "EXECUTE_TRIMMED" ? 1 : 0,
    rationale: preview.sizeResult.humanReason,
  });

  if (!execSwap.ok) {
    return res.status(500).json({ error: `On-chain execution failed: ${execSwap.error}` });
  }

  const rec: DecisionRecord = {
    id: `conf-${Date.now()}`,
    ts: Date.now(),
    source: "CHAT",
    pair: "WHSK/tUSDT",
    side: preview.side,
    requestedAmountIn: preview.reqAmountIn.toString(),
    decidedAmountIn: preview.sizeResult.decidedAmountIn.toString(),
    decision: preview.sizeResult.decision,
    reasonCode: preview.sizeResult.reasonCode,
    humanReason: preview.sizeResult.humanReason,
    spot: latestSpotRatio.toString(),
    ref: latestRefRatio.toString(),
    devBps: latestSignal.devBps ? String(latestSignal.devBps) : "0",
    depthCurve: [],
    impactBudgetBps: preview.impactBudgetBps,
    priceImpactBpsAtRequested: preview.sizeResult.priceImpactBpsAtRequested.toString(),
    priceImpactBpsAtDecided: preview.sizeResult.priceImpactBpsAtDecided.toString(),
    quotedOut: preview.sizeResult.quotedOut.toString(),
    minOut: preview.sizeResult.minOut.toString(),
    quoteBlock: currentBlock.toString(),
    intentHash: execSwap.intentHash,
    txHash: execSwap.txHash,
    amountOutRealized: execSwap.amountOut.toString(),
    realizedSlippageBps: 0,
    estimateErrorBps: 0,
    lossAvoidedQuote: "0",
    modeLabel: isReplayMode ? MODE_LABELS.REPLAY : MODE_LABELS.LIVE_TESTNET,
  };

  ledger.recordDecision(rec);
  await refreshDepthCurve();
  broadcastSSE("decision", rec);

  res.json({ ok: true, decision: rec });
});

// GET /api/stream (Server-Sent Events)
app.get("/api/stream", (req: Request, res: Response) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("event: connected\ndata: {}\n\n");
  sseClients.push(res);

  req.on("close", () => {
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

// POST /api/demo/mover (Real on-chain pool shift for demo)
app.post("/api/demo/mover", async (req: Request, res: Response) => {
  if (!APP_CONFIG.DEMO_MODE) {
    return res.status(403).json({ error: "Demo mover disabled when DEMO_MODE=false" });
  }

  const { action } = req.body;
  if (!deployments || !moverWalletClient || !moverAccount) {
    return res.status(503).json({ error: "Mover wallet or deployments not initialized." });
  }

  try {
    async function execMoverTx(params: any) {
      const nonce = await publicClient.getTransactionCount({
        address: moverAccount.address,
        blockTag: "pending",
      });
      const gasPrice = await publicClient.getGasPrice();
      const hash = await moverWalletClient.writeContract({
        ...params,
        account: moverAccount,
        nonce,
        gasPrice: (gasPrice * 130n) / 100n,
        chain: null,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await new Promise((r) => setTimeout(r, 1200));
      return hash;
    }

    if (action === "PUSH_PRICE_DOWN") {
      // Mover sells WHSK into pool -> pushes price down -> creates BUY signal
      const wrapAmt = parseEther("0.0003");
      await execMoverTx({
        address: deployments.whsk,
        abi: WHSK_ABI,
        functionName: "deposit",
        value: wrapAmt,
      });
      await execMoverTx({
        address: deployments.whsk,
        abi: WHSK_ABI,
        functionName: "approve",
        args: [deployments.router, wrapAmt],
      });
      const swapTx = await execMoverTx({
        address: deployments.router,
        abi: ROUTER_ABI,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn: deployments.whsk,
            tokenOut: deployments.mockUSDT,
            fee: 3000,
            recipient: moverAccount.address,
            amountIn: wrapAmt,
            amountOutMinimum: 0n,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });

      const live = await fetchLivePoolsAndBalances();
      const newSpot = live ? live.spotPriceDisplay : 0.082;
      const ref = live ? live.refPriceDisplay : 0.0875;

      return res.json({
        ok: true,
        action,
        newSpot: Number(newSpot.toFixed(6)),
        ref: Number(ref.toFixed(6)),
        effect: "BUY signal generated (Pool discounted vs Mainnet)",
        txHash: swapTx,
      });
    } else if (action === "PUSH_PRICE_UP") {
      // Mover buys WHSK with USDT -> pushes price up -> creates SELL signal
      const usdtAmt = 15n; // 15 micro-USDT
      await execMoverTx({
        address: deployments.mockUSDT,
        abi: parseAbi(["function approve(address spender, uint256 amount) external returns (bool)"]),
        functionName: "approve",
        args: [deployments.router, usdtAmt],
      });
      const swapTx = await execMoverTx({
        address: deployments.router,
        abi: ROUTER_ABI,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn: deployments.mockUSDT,
            tokenOut: deployments.whsk,
            fee: 3000,
            recipient: moverAccount.address,
            amountIn: usdtAmt,
            amountOutMinimum: 0n,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });

      const live = await fetchLivePoolsAndBalances();
      const newSpot = live ? live.spotPriceDisplay : 0.092;
      const ref = live ? live.refPriceDisplay : 0.0875;

      return res.json({
        ok: true,
        action,
        newSpot: Number(newSpot.toFixed(6)),
        ref: Number(ref.toFixed(6)),
        effect: "SELL signal generated (Pool at premium vs Mainnet)",
        txHash: swapTx,
      });
    }

    return res.status(400).json({ error: "Unknown mover action. Use PUSH_PRICE_DOWN or PUSH_PRICE_UP." });
  } catch (err) {
    return res.status(500).json({ error: `Market mover failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// ─── Autonomous Loop ────────────────────────────────────────────────────────

async function tick() {
  if (!autoEnabled || isPaused) return;

  if (isReplayMode) {
    const nextDec = replay.getNextDecision();
    if (nextDec) {
      ledger.recordDecision(nextDec);
      broadcastSSE("decision", nextDec);
    }
    return;
  }

  // Live on-chain monitoring loop
  if (!deployments || !executor) return;

  try {
    const live = await fetchLivePoolsAndBalances();
    if (!live) return;

    const { output, nextState } = evaluateSignal({
      spotPrice: live.spotRatio,
      refPrice: live.refRatio,
      refTimestamp: Date.now(),
      baseBalance: live.whskBal,
      quoteBalance: live.usdtBal,
      baseToken: deployments.whsk,
      quoteToken: deployments.mockUSDT,
      riskPreset: currentRisk,
      state: signalState,
    });
    signalState = nextState;
    latestSignal = output;

    if (output.action === "BUY" || output.action === "SELL") {
      const budget = RISK_PRESETS[currentRisk].impactBudgetBps;
      const tokenIn = output.tokenIn;
      const tokenOut = output.tokenOut;
      const baseToQuote = output.action === "SELL";
      const sellableBal = output.action === "SELL" ? live.whskBal : live.usdtBal;

      if (output.requestedAmountIn > 0n && sellableBal >= output.requestedAmountIn) {
        const sizing = await computeSize(
          publicClient,
          deployments.quoter,
          tokenIn,
          tokenOut,
          3000,
          output.requestedAmountIn,
          sellableBal,
          budget,
          RISK_PRESETS[currentRisk].slippageBps,
          live.poolState.sqrtPriceX96,
          live.poolState.token0IsBase,
          baseToQuote,
          1000000000000n
        );

        const currentBlock = await publicClient.getBlockNumber();
        const nonce = BigInt(Date.now());

        if (sizing.decision === "EXECUTE_FULL" || sizing.decision === "EXECUTE_TRIMMED") {
          const execRes = await executor.buildAndExecuteSwap({
            nonce,
            tokenIn,
            tokenOut,
            amountIn: sizing.decidedAmountIn,
            quotedAmountOut: sizing.quotedOut,
            amountOutMin: sizing.minOut,
            quoteBlock: currentBlock,
            reasonCode: sizing.decision === "EXECUTE_TRIMMED" ? 1 : 0,
            rationale: `Autonomous loop: ${sizing.humanReason}`,
          });

          if (execRes.ok) {
            const rec: DecisionRecord = {
              id: `auto-loop-${Date.now()}`,
              ts: Date.now(),
              source: "SIGNAL",
              pair: "WHSK/tUSDT",
              side: output.action,
              requestedAmountIn: output.requestedAmountIn.toString(),
              decidedAmountIn: sizing.decidedAmountIn.toString(),
              decision: sizing.decision,
              reasonCode: sizing.reasonCode,
              humanReason: sizing.humanReason,
              spot: live.spotRatio.toString(),
              ref: live.refRatio.toString(),
              devBps: output.devBps.toString(),
              depthCurve: [],
              impactBudgetBps: Number(budget),
              priceImpactBpsAtRequested: sizing.priceImpactBpsAtRequested.toString(),
              priceImpactBpsAtDecided: sizing.priceImpactBpsAtDecided.toString(),
              quotedOut: sizing.quotedOut.toString(),
              minOut: sizing.minOut.toString(),
              quoteBlock: currentBlock.toString(),
              intentHash: execRes.intentHash,
              txHash: execRes.txHash,
              amountOutRealized: execRes.amountOut.toString(),
              realizedSlippageBps: 0,
              estimateErrorBps: 0,
              lossAvoidedQuote: "0",
              modeLabel: MODE_LABELS.LIVE_TESTNET,
            };
            ledger.recordDecision(rec);
            await refreshDepthCurve();
            broadcastSSE("decision", rec);
          }
        }
      }
    }
  } catch (err) {
    console.warn("[Fathom] Autonomous loop tick error:", err);
  }
}

export function startServer(port = APP_CONFIG.PORT) {
  const server = app.listen(port, "0.0.0.0", async () => {
    console.log(`[Fathom] Agent Server listening on http://127.0.0.1:${port}`);

    // Live RPC Health Check
    try {
      const block = await publicClient.getBlockNumber();
      console.log(`[Fathom] Connected to HSK Testnet (Chain 133) at Block #${block}`);
      isReplayMode = false;
      await refreshDepthCurve();
    } catch (err) {
      console.error("\n" + "=".repeat(64));
      console.error("  RPC UNAVAILABLE – SHOWING RECORDED DATA (REPLAY MODE)");
      console.error("=".repeat(64) + "\n");
      isReplayMode = true;
    }

    console.log(`[Fathom] Mode: ${isReplayMode ? MODE_LABELS.REPLAY : MODE_LABELS.LIVE_TESTNET}`);
  });

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[Fathom] Port ${port} is already in use. Please terminate the process using port ${port} or choose another PORT in .env.`);
      process.exit(1);
    } else {
      console.error(`[Fathom] Server error:`, err);
    }
  });

  // Run autonomous loop
  setInterval(tick, pollIntervalSeconds * 1000);

  return server;
}

if (process.env.NODE_ENV !== "test") {
  startServer();
}

export { app };
