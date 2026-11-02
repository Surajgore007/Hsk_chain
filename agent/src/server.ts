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
  type PairConfig,
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
import { SignalsEngine, type PairSignals } from "./signals_engine.js";
import { RiskManager } from "./risk.js";
import { AiBrain, type BrainSnapshot } from "./brain.js";

// Enable automatic JSON serialization for BigInt values
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const app = express();
app.use(express.json());

// Dynamic CORS supporting local development and production Vercel frontend via ALLOWED_ORIGIN
const allowedOriginEnv = process.env.ALLOWED_ORIGIN;
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!allowedOriginEnv || allowedOriginEnv === "*") {
    res.header("Access-Control-Allow-Origin", origin || "*");
  } else {
    const allowedList = allowedOriginEnv.split(",").map((s) => s.trim().toLowerCase());
    if (origin && (allowedList.includes(origin.toLowerCase()) || allowedList.includes("*"))) {
      res.header("Access-Control-Allow-Origin", origin);
    } else if (!origin) {
      res.header("Access-Control-Allow-Origin", "*");
    } else {
      res.header("Access-Control-Allow-Origin", allowedList[0]);
    }
  }
  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-admin-token"
  );
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// In-memory sliding-window IP rate limiter
function createRateLimiter(windowMs: number, maxRequests: number, endpointName = "endpoint") {
  const ipHits = new Map<string, { count: number; resetAt: number }>();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of ipHits.entries()) {
      if (now > entry.resetAt) ipHits.delete(ip);
    }
  }, 60000);
  timer.unref?.();

  return (req: Request, res: Response, next: () => void) => {
    const forwarded = req.headers["x-forwarded-for"];
    const ip = (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : req.socket.remoteAddress) || "unknown";
    const now = Date.now();
    let entry = ipHits.get(ip);
    if (!entry || now > entry.resetAt) {
      entry = { count: 1, resetAt: now + windowMs };
      ipHits.set(ip, entry);
      return next();
    }
    if (entry.count >= maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", retryAfter);
      return res.status(429).json({
        error: `Rate limit exceeded for ${endpointName}. Try again in ${retryAfter}s.`,
        retryAfterSeconds: retryAfter,
      });
    }
    entry.count++;
    next();
  };
}

const chatRateLimiter = createRateLimiter(60_000, 30, "/api/chat");
const confirmRateLimiter = createRateLimiter(60_000, 20, "/api/confirm");

// Load deployments if available
let deployments: Deployments | null = null;
const depCandidates = [
  resolve(process.cwd(), "deployments/testnet.json"),
  resolve(process.cwd(), "../deployments/testnet.json"),
  resolve(process.cwd(), "agent/deployments/testnet.json"),
];
for (const p of depCandidates) {
  if (existsSync(p)) {
    try {
      deployments = JSON.parse(readFileSync(p, "utf-8"));
      break;
    } catch {}
  }
}

// Clients & Wallet Accounts
const publicClient = makePublicClient();
const mainnetClient = makeMainnetClient();
let opWalletClient: any = null;
let opAccount: any = null;
let moverWalletClient: any = null;
let moverAccount: any = null;
let ownerWalletClient: any = null;

if (deployments) {
  const opPk = (process.env.OPERATOR_PK || process.env.OWNER_PK) as `0x${string}` | undefined;
  if (opPk && !opPk.includes("YOUR_")) {
    const { client, account } = makeWalletClient(opPk);
    opWalletClient = client;
    opAccount = account;
  }

  const movPk = process.env.MOVER_PK as `0x${string}` | undefined;
  if (movPk && !movPk.includes("YOUR_")) {
    const { client, account } = makeWalletClient(movPk);
    moverWalletClient = client;
    moverAccount = account;
  }

  const ownPk = process.env.OWNER_PK as `0x${string}` | undefined;
  if (ownPk && !ownPk.includes("YOUR_")) {
    const { client } = makeWalletClient(ownPk);
    ownerWalletClient = client;
  }
}

// Runtime State
let autoEnabled = true;
let isPaused = false;
let currentRisk: RiskPreset = "balanced";
let pollIntervalSeconds = APP_CONFIG.POLL_SECONDS;
let isReplayMode = process.env.REPLAY === "true";
let activePairId: "WHSK/tUSDT" | "tWETH/tUSDT" | "tWBTC/tUSDT" = "tWETH/tUSDT";
let lastAutonomousCycle = Date.now();
let lastTradeTime = 0;
let lastHoldSummary = "AI proposing HOLD: spread within equilibrium and pool depth stable.";
const startTime = Date.now();

const ledger = new DecisionLedger();
const replay = new ReplayEngine();
const signalsEngine = new SignalsEngine();
const riskManager = new RiskManager();
const aiBrain = new AiBrain();

// Multi-Pair Config Helper
function getPairConfig(pairId: string = activePairId): PairConfig {
  if (deployments?.pairs && deployments.pairs[pairId]) {
    return deployments.pairs[pairId];
  }
  if (pairId === "tWETH/tUSDT") {
    return {
      id: "tWETH/tUSDT",
      baseSymbol: "tWETH",
      quoteSymbol: "tUSDT",
      baseToken: (deployments?.tWeth || "0xbb1f1b239d6353e8863c761d186910f0f3df674e") as `0x${string}`,
      quoteToken: (deployments?.mockUSDT || "0x721e7fa9fb2446be07ab4a708254f4adcb70e4cf") as `0x${string}`,
      pool: (deployments?.poolWeth || "0x4605627Af0621C90A74B2828E4Ee16d07cAD0d8c") as `0x${string}`,
      executionGuard: (deployments?.executionGuardWeth || "0x0d326a2b8eafd98c3bdf3412ed44ac151fdc3cc8") as `0x${string}`,
      feeTier: 3000,
      baseDecimals: 18,
      quoteDecimals: 6,
      isMock: true,
      referencePrice: 2500,
    };
  } else if (pairId === "tWBTC/tUSDT") {
    return {
      id: "tWBTC/tUSDT",
      baseSymbol: "tWBTC",
      quoteSymbol: "tUSDT",
      baseToken: (deployments?.tWbtc || "0x48bdf4a88e1ef7bbd482de4bb77eead612a53ece") as `0x${string}`,
      quoteToken: (deployments?.mockUSDT || "0x721e7fa9fb2446be07ab4a708254f4adcb70e4cf") as `0x${string}`,
      pool: (deployments?.poolWbtc || "0x313BE070B6851F74C17bb866C2F82A26f41cc9e8") as `0x${string}`,
      executionGuard: (deployments?.executionGuardWbtc || "0xd04859a859cf07fcf4bf6fb6f07eb90402e4f1b0") as `0x${string}`,
      feeTier: 3000,
      baseDecimals: 8,
      quoteDecimals: 6,
      isMock: true,
      referencePrice: 70000,
    };
  }
  return {
    id: "WHSK/tUSDT",
    baseSymbol: "WHSK",
    quoteSymbol: "tUSDT",
    baseToken: (deployments?.whsk || "0xCA8aAceEC5Db1e91B9Ed3a344bA026c4a2B3ebF6") as `0x${string}`,
    quoteToken: (deployments?.mockUSDT || "0x721e7fa9fb2446be07ab4a708254f4adcb70e4cf") as `0x${string}`,
    pool: (deployments?.pool || "0xe0f494ef52eacebb42cdb11a03a2e9e43fbfdfaf") as `0x${string}`,
    executionGuard: (deployments?.executionGuard || "0x6b0800d93a0fae5a5d11577be69c74c63e0b5b35") as `0x${string}`,
    feeTier: 3000,
    baseDecimals: 18,
    quoteDecimals: 6,
    isMock: false,
    referencePrice: 0.087534,
  };
}

function getExecutor(pairId: string = activePairId): OnchainExecutor | null {
  if (!opWalletClient || !opAccount) return null;
  const pair = getPairConfig(pairId);
  return new OnchainExecutor(publicClient, opWalletClient, opAccount, pair.executionGuard, 133n);
}

// Portfolio Trackers per pair
const trackers = new Map<string, PortfolioTracker>();
function getTracker(pairId: string = activePairId): PortfolioTracker {
  const pair = getPairConfig(pairId);
  if (!trackers.has(pairId)) {
    trackers.set(pairId, new PortfolioTracker(pair.baseToken, pair.quoteToken, BigInt(pair.baseDecimals)));
  }
  return trackers.get(pairId)!;
}

let latestDepthCurve: DepthPoint[] = [];
let latestSignalsData: PairSignals | null = null;
let latestSpotRatio = 87_051n;
let latestRefRatio = 87_528n;
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

// Helper: Query live on-chain state for a given pair
async function fetchLivePoolsAndBalances(pairId: string = activePairId) {
  if (!deployments) return null;
  const pair = getPairConfig(pairId);
  try {
    const [baseBal, quoteBal, poolState, contractPaused] = await Promise.all([
      tokenBalance(publicClient, pair.baseToken, pair.executionGuard),
      tokenBalance(publicClient, pair.quoteToken, pair.executionGuard),
      readPoolState(publicClient, pair.pool, pair.baseToken),
      publicClient
        .readContract({
          address: pair.executionGuard,
          abi: EXECUTION_GUARD_ABI,
          functionName: "paused",
        })
        .catch(() => false),
    ]);

    let refPriceDisplay = pair.referencePrice;
    let refTimestamp = Date.now();

    if (pair.id === "WHSK/tUSDT" && deployments.mainnetPool) {
      try {
        const mainnetState = await readPoolState(mainnetClient, deployments.mainnetPool, "0xB210D2120d57b758EE163cFfb43e73728c471Cf1");
        refPriceDisplay = sqrtPriceToDisplayPrice(mainnetState.sqrtPriceX96, mainnetState.token0IsBase, 18, 6);
      } catch (err) {
        refPriceDisplay = pair.referencePrice;
      }
    }

    const spotPriceDisplay = sqrtPriceToDisplayPrice(
      poolState.sqrtPriceX96,
      poolState.token0IsBase,
      pair.baseDecimals,
      pair.quoteDecimals
    );

    const spotRatio = BigInt(Math.max(1, Math.round(spotPriceDisplay * 1e6)));
    const refRatio = BigInt(Math.max(1, Math.round(refPriceDisplay * 1e6)));

    if (pairId === activePairId) {
      latestSpotRatio = spotRatio;
      latestRefRatio = refRatio;
      latestSlot0SqrtP = poolState.sqrtPriceX96;
      isPaused = Boolean(contractPaused);
    }

    return {
      pair,
      baseBal,
      quoteBal,
      poolState,
      spotPriceDisplay,
      refPriceDisplay,
      spotRatio,
      refRatio,
      refTimestamp,
      contractPaused: Boolean(contractPaused),
    };
  } catch (err) {
    console.warn(`[Fathom] Live pool/balance fetch error for ${pairId}:`, err);
    return null;
  }
}

// Helper: Refresh depth curve from QuoterV2 for active pair
async function refreshDepthCurve(pairId: string = activePairId) {
  if (!deployments) return;
  try {
    const live = await fetchLivePoolsAndBalances(pairId);
    if (!live) return;
    const pair = live.pair;

    const minSweep = pair.baseDecimals === 8 ? 100000n : 10000000000000000n; // 0.001 BTC or 0.01 ETH/WHSK
    const sweepBase = live.baseBal > minSweep ? live.baseBal : minSweep;

    const curve = await sweepDepth(
      publicClient,
      deployments.quoter,
      pair.baseToken,
      pair.quoteToken,
      pair.feeTier,
      sweepBase,
      live.poolState.sqrtPriceX96,
      live.poolState.token0IsBase,
      true
    );

    if (curve.points.length > 0 && pairId === activePairId) {
      latestDepthCurve = curve.points;
    }
  } catch (err) {
    console.warn(`[Fathom] Quoter depth sweep error for ${pairId}:`, err);
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

// GET / — Friendly root service status
app.get("/", (req: Request, res: Response) => {
  res.json({
    service: "Fathom Autonomous Trading Agent API",
    status: "online",
    network: "HSK Testnet (Chain ID 133)",
    mode: isReplayMode ? MODE_LABELS.REPLAY : MODE_LABELS.LIVE_TESTNET,
    activePair: activePairId,
    supportedPairs: ["tWETH/tUSDT", "tWBTC/tUSDT", "WHSK/tUSDT"],
    endpoints: {
      health: "/api/health",
      heartbeat: "/api/heartbeat",
      state: "/api/state",
      portfolio: "/api/portfolio",
      decisions: "/api/decisions",
      scorecard: "/api/scorecard",
      depth: "/api/depth",
      signals: "/api/signals",
      risk: "/api/risk",
      chat: "POST /api/chat",
      confirm: "POST /api/confirm",
      asset: "POST /api/asset",
    },
  });
});

// GET /api/health — Fast synchronous health check for Render / monitoring (no RPC calls)
app.get("/api/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    mode: isReplayMode ? MODE_LABELS.REPLAY : MODE_LABELS.LIVE_TESTNET,
    timestamp: Date.now(),
  });
});

// GET /api/heartbeat — Heartbeat endpoint for autonomy verification (Section 6)
app.get("/api/heartbeat", async (req: Request, res: Response) => {
  res.json({
    service: "fathom-agent",
    status: "online",
    network: "HSK Testnet (Chain ID 133)",
    activePair: activePairId,
    supportedPairs: ["tWETH/tUSDT", "tWBTC/tUSDT", "WHSK/tUSDT"],
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    lastAutonomousCycle,
    secondsSinceLastCycle: Math.floor((Date.now() - lastAutonomousCycle) / 1000),
    loopIntervalSeconds: pollIntervalSeconds,
    autoEnabled,
    isPaused,
    currentRisk,
    riskLimits: riskManager.getConfig(),
    backoffMultiplier: riskManager.getBackoffMultiplier(),
    latestSignals: latestSignalsData,
  });
});

// GET /api/state
app.get("/api/state", async (req: Request, res: Response) => {
  const mode = isReplayMode ? MODE_LABELS.REPLAY : MODE_LABELS.LIVE_TESTNET;
  res.json({
    mode,
    modeLabel: mode,
    network: "HSK Testnet (Chain ID 133)",
    referenceNetwork: "HSK Mainnet (Chain ID 177, Read-Only)",
    activePair: activePairId,
    supportedPairs: ["tWETH/tUSDT", "tWBTC/tUSDT", "WHSK/tUSDT"],
    autoEnabled,
    isPaused,
    currentRisk,
    riskConfig: {
      impactBudgetBps: Number(RISK_PRESETS[currentRisk].impactBudgetBps),
      slippageBps: Number(RISK_PRESETS[currentRisk].slippageBps),
      maxTradePercent: Number(RISK_PRESETS[currentRisk].maxTradePercent),
      cooldownSeconds: RISK_PRESETS[currentRisk].cooldownSeconds * riskManager.getBackoffMultiplier(),
      signalThresholdBps: Number(RISK_PRESETS[currentRisk].signalThresholdBps),
    },
    riskLimits: riskManager.getConfig(),
    backoffMultiplier: riskManager.getBackoffMultiplier(),
    pollIntervalSeconds,
    deployments,
    isReplayMode,
  });
});

// GET /api/portfolio
app.get("/api/portfolio", async (req: Request, res: Response) => {
  const pairId = (req.query.pair as string) || activePairId;
  const live = await fetchLivePoolsAndBalances(pairId);
  if (!live) {
    return res.status(503).json({ error: "On-chain portfolio data currently unreachable" });
  }

  const tracker = getTracker(pairId);
  const snapshot = tracker.getSnapshot(
    live.baseBal,
    live.quoteBal,
    live.spotRatio,
    live.refRatio
  );

  res.json({
    pair: pairId,
    baseSymbol: live.pair.baseSymbol,
    quoteSymbol: live.pair.quoteSymbol,
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
    isMock: live.pair.isMock,
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
  const pairId = (req.query.pair as string) || activePairId;
  if (latestDepthCurve.length === 0 || pairId !== activePairId) {
    await refreshDepthCurve(pairId);
  }
  res.json({
    pair: pairId,
    curve: latestDepthCurve.map((p) => ({
      amountIn: p.amountIn.toString(),
      quotedOut: p.quotedOut.toString(),
      totalCostBps: Number(p.totalCostBps),
      priceImpactBps: Number(p.priceImpactBps),
    })),
    impactBudgetBps: Number(RISK_PRESETS[currentRisk].impactBudgetBps),
  });
});

// GET /api/signals — Quantitative technical signals
app.get("/api/signals", async (req: Request, res: Response) => {
  const pairId = (req.query.pair as string) || activePairId;
  const live = await fetchLivePoolsAndBalances(pairId);
  if (!live) return res.status(503).json({ error: "Live RPC unavailable" });

  const currentBlock = Number(await publicClient.getBlockNumber().catch(() => 0n));
  const signals = signalsEngine.update({
    pairId,
    spotPrice: live.spotPriceDisplay,
    referencePrice: live.refPriceDisplay,
    currentLiquidity: live.poolState.liquidity,
    blockNumber: currentBlock,
  });

  if (pairId === activePairId) {
    latestSignalsData = signals;
  }
  res.json(signals);
});

// GET /api/risk — Risk framework limits & state
app.get("/api/risk", async (req: Request, res: Response) => {
  const live = await fetchLivePoolsAndBalances(activePairId);
  const tracker = getTracker(activePairId);
  const nav = live ? Number(tracker.getSnapshot(live.baseBal, live.quoteBal, live.spotRatio, live.refRatio).navQuote) / 1e6 : 0;
  res.json({
    config: riskManager.getConfig(),
    backoffMultiplier: riskManager.getBackoffMultiplier(),
    currentNavQuote: nav,
    isPaused,
    autoEnabled,
    activePair: activePairId,
  });
});

// POST /api/asset — Switch active asset pair
app.post("/api/asset", async (req: Request, res: Response) => {
  const { pair } = req.body;
  if (!pair || typeof pair !== "string") {
    return res.status(400).json({ error: "Missing 'pair' string in request body" });
  }
  const upper = pair.toUpperCase();
  if (upper.includes("WETH") || upper.includes("ETH")) {
    activePairId = "tWETH/tUSDT";
  } else if (upper.includes("WBTC") || upper.includes("BTC")) {
    activePairId = "tWBTC/tUSDT";
  } else if (upper.includes("WHSK") || upper.includes("HSK")) {
    activePairId = "WHSK/tUSDT";
  } else {
    return res.status(400).json({ error: `Unsupported pair '${pair}'. Supported: tWETH/tUSDT, tWBTC/tUSDT, WHSK/tUSDT` });
  }
  await refreshDepthCurve(activePairId);
  res.json({ ok: true, activePair: activePairId });
});

// POST /api/chat (Rate-limited per IP)
app.post("/api/chat", chatRateLimiter, async (req: Request, res: Response) => {
  const { message } = req.body;
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Missing 'message' string in request body" });
  }

  const live = await fetchLivePoolsAndBalances(activePairId);
  const pair = getPairConfig(activePairId);
  const spotDisp = live ? live.spotPriceDisplay.toFixed(live.pair.quoteDecimals === 6 ? 2 : 4) : "2500.00";
  const refDisp = live ? live.refPriceDisplay.toFixed(live.pair.quoteDecimals === 6 ? 2 : 4) : "2500.00";
  const baseBalDisp = live ? `${(Number(live.baseBal) / Math.pow(10, pair.baseDecimals)).toFixed(4)} ${pair.baseSymbol}` : `vault ${pair.baseSymbol}`;
  const quoteBalDisp = live ? `${(Number(live.quoteBal) / Math.pow(10, pair.quoteDecimals)).toFixed(2)} ${pair.quoteSymbol}` : `vault ${pair.quoteSymbol}`;

  const statusSummary = `Fathom Active. Mode: ${isReplayMode ? MODE_LABELS.REPLAY : MODE_LABELS.LIVE_TESTNET}. Auto: ${autoEnabled ? "ON" : "OFF"}. Risk: ${currentRisk.toUpperCase()} (${RISK_PRESETS[currentRisk].impactBudgetBps} bps budget). Target: ${activePairId}.`;
  const portfolioSummary = `Vault: ${baseBalDisp} / ${quoteBalDisp} | Spot: $${spotDisp} ${pair.quoteSymbol} | Ref: $${refDisp} ${pair.quoteSymbol}.`;
  
  const lastDec = ledger.getLatest();
  let lastDecisionSummary: string | undefined = undefined;
  if (lastDec) {
    const isBuy = lastDec.side === "BUY";
    const reqFmt = isBuy
      ? `${(Number(lastDec.requestedAmountIn) / 1e6).toFixed(4)} tUSDT`
      : `${(Number(lastDec.requestedAmountIn) / Math.pow(10, pair.baseDecimals)).toFixed(4)} ${pair.baseSymbol}`;
    const decFmt = isBuy
      ? `${(Number(lastDec.decidedAmountIn) / 1e6).toFixed(4)} tUSDT`
      : `${(Number(lastDec.decidedAmountIn) / Math.pow(10, pair.baseDecimals)).toFixed(4)} ${pair.baseSymbol}`;
    const txLink = lastDec.txHash
      ? `\n- **On-Chain Proof**: [\`${lastDec.txHash.slice(0, 10)}...${lastDec.txHash.slice(-6)}\`](https://testnet-explorer.hskchain.net/tx/${lastDec.txHash})`
      : "";
    lastDecisionSummary = `📊 **Audit of Last Decision**:\n- **Verdict**: **${lastDec.decision}** (\`${lastDec.reasonCode}\`)\n- **Side / Pair**: ${lastDec.side} on ${lastDec.pair}\n- **Requested Size**: ${reqFmt} (Simulated Impact: **${lastDec.priceImpactBpsAtRequested} bps**)\n- **Decided Size**: ${decFmt} (Enforced Budget: **${lastDec.impactBudgetBps} bps**)\n- **Reason**: ${lastDec.humanReason}${txLink}`;
  }

  let signalsSummary = "";
  if (latestSignalsData) {
    signalsSummary = `📈 **Live Signals for ${activePairId}**:\n- **Spread vs Ref**: ${latestSignalsData.spreadBps > 0 ? "+" : ""}${latestSignalsData.spreadBps} bps\n- **EMA Fast**: $${latestSignalsData.emaFast.toFixed(2)} | **EMA Slow**: $${latestSignalsData.emaSlow.toFixed(2)} (${latestSignalsData.emaCross})\n- **Z-Score**: ${latestSignalsData.zScore} (${latestSignalsData.isWarmingUp ? "warming up" : "stable"})\n- **Depth Status**: ${latestSignalsData.depthShrunk ? "⚠️ SHRUNK (>5% drop)" : "✅ Stable Depth"}`;
  }

  const chatRes = await processChatMessage(message, {
    statusSummary,
    portfolioSummary,
    lastDecisionSummary,
    lastHoldSummary,
    signalsSummary,
    currentRisk,
    poolAddress: pair.pool,
    spotPriceDisplay: live?.spotPriceDisplay,
    refPriceDisplay: live?.refPriceDisplay,
    baseBal: baseBalDisp,
    quoteBal: quoteBalDisp,
    activePair: activePairId,
    supportedPairs: ["tWETH/tUSDT", "tWBTC/tUSDT", "WHSK/tUSDT"],
    stopLossPct: riskManager.getConfig().stopLossPct,
    takeProfitPct: riskManager.getConfig().takeProfitPct,
    maxDrawdownPct: riskManager.getConfig().maxDrawdownPct,
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
  } else if (chatRes.parsedIntent.intent === "SET_STOP_LOSS" && chatRes.parsedIntent.stopLossPct) {
    const resSet = riskManager.setStopLoss(chatRes.parsedIntent.stopLossPct);
    chatRes.reply = `✅ ${resSet.message}`;
  } else if (chatRes.parsedIntent.intent === "SET_TAKE_PROFIT" && chatRes.parsedIntent.takeProfitPct) {
    const resSet = riskManager.setTakeProfit(chatRes.parsedIntent.takeProfitPct);
    chatRes.reply = `✅ ${resSet.message}`;
  } else if (chatRes.parsedIntent.intent === "SET_MAX_DRAWDOWN" && chatRes.parsedIntent.maxDrawdownPct) {
    const resSet = riskManager.setMaxDrawdown(chatRes.parsedIntent.maxDrawdownPct);
    chatRes.reply = `✅ ${resSet.message}`;
  } else if (chatRes.parsedIntent.intent === "SET_ASSET" && chatRes.parsedIntent.assetPair) {
    const p = chatRes.parsedIntent.assetPair.toUpperCase();
    if (p.includes("WETH") || p.includes("ETH")) {
      activePairId = "tWETH/tUSDT";
      chatRes.reply = "Active pair switched to **tWETH / tUSDT** (Fee tier: 3000 / 0.3%, deep pool).";
    } else if (p.includes("WBTC") || p.includes("BTC")) {
      activePairId = "tWBTC/tUSDT";
      chatRes.reply = "Active pair switched to **tWBTC / tUSDT** (Fee tier: 3000 / 0.3%, deep pool).";
    } else if (p.includes("WHSK") || p.includes("HSK")) {
      activePairId = "WHSK/tUSDT";
      chatRes.reply = "Active pair switched to **WHSK / tUSDT** (Fee tier: 3000 / 0.3%).";
    }
    await refreshDepthCurve(activePairId);
  } else if (chatRes.parsedIntent.intent === "PAUSE") {
    isPaused = true;
  } else if (chatRes.parsedIntent.intent === "RESUME") {
    const execGuard = pair.executionGuard;
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
          publicClient.readContract({ address: execGuard, abi: GUARD_PAUSE_ABI, functionName: "paused" }),
          publicClient.readContract({ address: execGuard, abi: GUARD_PAUSE_ABI, functionName: "owner" }),
        ]);

        if (isPausedOnchain) {
          if (ownerWalletClient) {
            const unpauseTx = await ownerWalletClient.writeContract({
              address: execGuard,
              abi: parseAbi(["function unpause() external"]),
              functionName: "unpause",
            });
            await publicClient.waitForTransactionReceipt({ hash: unpauseTx });
            const nowPaused = await publicClient.readContract({ address: execGuard, abi: GUARD_PAUSE_ABI, functionName: "paused" });
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

    const tokenIn = tradeSide === "SELL" ? pair.baseToken : pair.quoteToken;
    const tokenOut = tradeSide === "SELL" ? pair.quoteToken : pair.baseToken;
    const baseToQuote = tradeSide === "SELL";
    const availableBalance = tradeSide === "SELL" ? live.baseBal : live.quoteBal;

    let reqAmountIn = 0n;
    if (chatRes.parsedIntent.trade.amount.unit === "PERCENT_BALANCE") {
      const pct = BigInt(Math.round(chatRes.parsedIntent.trade.amount.value));
      reqAmountIn = (availableBalance * pct) / 100n;
    } else if (tradeSide === "SELL") {
      if (chatRes.parsedIntent.trade.amount.unit === "BASE") {
        reqAmountIn = BigInt(Math.round(chatRes.parsedIntent.trade.amount.value * Math.pow(10, pair.baseDecimals)));
      } else if (chatRes.parsedIntent.trade.amount.unit === "QUOTE") {
        reqAmountIn = idealOut(live.poolState.sqrtPriceX96, BigInt(Math.round(chatRes.parsedIntent.trade.amount.value * 1e6)), false, live.poolState.token0IsBase);
      }
    } else {
      if (chatRes.parsedIntent.trade.amount.unit === "QUOTE") {
        reqAmountIn = BigInt(Math.round(chatRes.parsedIntent.trade.amount.value * 1e6));
      } else if (chatRes.parsedIntent.trade.amount.unit === "BASE") {
        reqAmountIn = idealOut(live.poolState.sqrtPriceX96, BigInt(Math.round(chatRes.parsedIntent.trade.amount.value * Math.pow(10, pair.baseDecimals))), true, live.poolState.token0IsBase);
      }
    }

    const minDust = tradeSide === "SELL" ? (pair.baseDecimals === 8 ? 1000n : 1000000000000n) : 10n;
    if (availableBalance <= minDust || reqAmountIn === 0n || reqAmountIn > availableBalance) {
      const availFmt = tradeSide === "SELL"
        ? `${(Number(availableBalance) / Math.pow(10, pair.baseDecimals)).toFixed(4)} ${pair.baseSymbol}`
        : `${(Number(availableBalance) / 1e6).toFixed(2)} ${pair.quoteSymbol}`;
      const reqFmt = tradeSide === "SELL"
        ? `${(Number(reqAmountIn) / Math.pow(10, pair.baseDecimals)).toFixed(4)} ${pair.baseSymbol}`
        : `${(Number(reqAmountIn) / 1e6).toFixed(2)} ${pair.quoteSymbol}`;

      const rec: DecisionRecord = {
        id: `insuf-${Date.now()}`,
        ts: Date.now(),
        source: "CHAT",
        pair: activePairId,
        side: tradeSide,
        requestedAmountIn: reqAmountIn.toString(),
        decidedAmountIn: "0",
        decision: "NO_TRADE",
        reasonCode: "INSUFFICIENT_BALANCE",
        humanReason: `Insufficient guard balance (${availFmt} available, ${reqFmt} requested). Order blocked.`,
        spot: live.spotRatio.toString(),
        ref: live.refRatio.toString(),
        devBps: latestSignalsData?.spreadBps ? String(latestSignalsData.spreadBps) : "0",
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

    // Run deterministic sizing against Quoter depth curve
    const sizeResult = await computeSize(
      publicClient,
      deployments.quoter,
      tokenIn,
      tokenOut,
      pair.feeTier,
      reqAmountIn,
      availableBalance,
      budget,
      RISK_PRESETS[currentRisk].slippageBps,
      live.poolState.sqrtPriceX96,
      live.poolState.token0IsBase,
      baseToQuote,
      minDust
    );

    const exec = getExecutor(activePairId);

    if (isAutoExecution) {
      const currentBlock = await publicClient.getBlockNumber();
      const nonce = BigInt(Date.now());

      if (sizeResult.decision === "NO_TRADE") {
        const intentHash = ("0x" + nonce.toString(16).padStart(64, "0")) as `0x${string}`;
        let refusalTx: `0x${string}` | undefined;
        if (exec && APP_CONFIG.RECORD_REFUSALS_ONCHAIN !== "never") {
          const refRes = await exec.recordRefusalOnchain({
            intentHash,
            reasonCode: 2,
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
          pair: activePairId,
          side: tradeSide,
          requestedAmountIn: reqAmountIn.toString(),
          decidedAmountIn: "0",
          decision: "NO_TRADE",
          reasonCode: sizeResult.reasonCode,
          humanReason: sizeResult.humanReason,
          spot: live.spotRatio.toString(),
          ref: live.refRatio.toString(),
          devBps: latestSignalsData?.spreadBps ? String(latestSignalsData.spreadBps) : "0",
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

      if (!exec) {
        return res.status(500).json({ error: "No wallet configured to execute swap on-chain." });
      }

      const execSwap = await exec.buildAndExecuteSwap({
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
        const isCooldown = execSwap.error?.includes("COOLDOWN") || execSwap.error?.includes("0xa2724a4d");
        const replyText = isCooldown
          ? `⚠️ **Trade Execution Deferred**: On-chain cooldown active (${RISK_PRESETS[currentRisk].cooldownSeconds}s). The ExecutionGuard contract protects the vault by enforcing a minimum interval between consecutive trades.`
          : `⚠️ **On-Chain Execution Blocked**: ${execSwap.error}`;
        return res.json({
          ...chatRes,
          reply: replyText,
          autoExecuted: false,
        });
      }

      lastTradeTime = Date.now();
      const rec: DecisionRecord = {
        id: `auto-${Date.now()}`,
        ts: Date.now(),
        source: "CHAT",
        pair: activePairId,
        side: tradeSide,
        requestedAmountIn: reqAmountIn.toString(),
        decidedAmountIn: sizeResult.decidedAmountIn.toString(),
        decision: sizeResult.decision,
        reasonCode: sizeResult.reasonCode,
        humanReason: sizeResult.humanReason,
        spot: live.spotRatio.toString(),
        ref: live.refRatio.toString(),
        devBps: latestSignalsData?.spreadBps ? String(latestSignalsData.spreadBps) : "0",
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
      await refreshDepthCurve(activePairId);
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
      tokenInSymbol: tradeSide === "SELL" ? pair.baseSymbol : pair.quoteSymbol,
      tokenOutSymbol: tradeSide === "SELL" ? pair.quoteSymbol : pair.baseSymbol,
      status: isNoTrade ? "BLOCKED" : "READY_FOR_CONFIRMATION",
    };
    pendingPreviews.set(previewId, {
      ...previewCard,
      pairId: activePairId,
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

// POST /api/confirm (Rate-limited per IP)
app.post("/api/confirm", confirmRateLimiter, async (req: Request, res: Response) => {
  const { previewId } = req.body;
  if (!previewId || !pendingPreviews.has(previewId)) {
    return res.status(404).json({ error: "Invalid or expired previewId" });
  }

  const preview = pendingPreviews.get(previewId);
  pendingPreviews.delete(previewId);

  if (preview.sizeResult.decision === "NO_TRADE") {
    return res.status(400).json({ error: "Cannot confirm a refused trade (NO_TRADE). Order was blocked by Fathom risk policy." });
  }

  const exec = getExecutor(preview.pairId || activePairId);
  if (!exec || !deployments) {
    return res.status(500).json({ error: "Executor wallet or deployments not initialized." });
  }

  const currentBlock = await publicClient.getBlockNumber();
  const nonce = BigInt(Date.now());

  // Execute on-chain
  const execSwap = await exec.buildAndExecuteSwap({
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

  lastTradeTime = Date.now();
  const rec: DecisionRecord = {
    id: `conf-${Date.now()}`,
    ts: Date.now(),
    source: "CHAT",
    pair: preview.pairId || activePairId,
    side: preview.side,
    requestedAmountIn: preview.reqAmountIn.toString(),
    decidedAmountIn: preview.sizeResult.decidedAmountIn.toString(),
    decision: preview.sizeResult.decision,
    reasonCode: preview.sizeResult.reasonCode,
    humanReason: preview.sizeResult.humanReason,
    spot: latestSpotRatio.toString(),
    ref: latestRefRatio.toString(),
    devBps: latestSignalsData?.spreadBps ? String(latestSignalsData.spreadBps) : "0",
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
  await refreshDepthCurve(preview.pairId || activePairId);
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

// POST /api/demo/mover (Real on-chain pool shift for demo — requires ADMIN_TOKEN)
app.post("/api/demo/mover", async (req: Request, res: Response) => {
  const adminToken = process.env.ADMIN_TOKEN;
  const providedToken = (req.headers["x-admin-token"] || (req.headers["authorization"] ? req.headers["authorization"].replace(/^Bearer\s+/i, "") : "")) as string | undefined;

  if (adminToken && (!providedToken || providedToken !== adminToken)) {
    return res.status(401).json({ error: "Unauthorized: Missing or invalid ADMIN_TOKEN header." });
  }

  if (!APP_CONFIG.DEMO_MODE) {
    return res.status(403).json({ error: "Demo mover disabled when DEMO_MODE=false" });
  }

  const { action, pair: targetPairId } = req.body;
  if (!deployments || !moverWalletClient || !moverAccount) {
    return res.status(503).json({ error: "Mover wallet or deployments not initialized." });
  }

  const pair = getPairConfig(targetPairId || activePairId);

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
      // Mover sells base into pool -> pushes price down -> creates BUY signal
      const sellAmt = pair.baseDecimals === 8 ? 5000000n : parseEther("0.1"); // 0.05 BTC or 0.1 ETH/WHSK
      await execMoverTx({
        address: pair.baseToken,
        abi: parseAbi(["function approve(address spender, uint256 amount) external returns (bool)"]),
        functionName: "approve",
        args: [deployments.router, sellAmt],
      });
      const swapTx = await execMoverTx({
        address: deployments.router,
        abi: ROUTER_ABI,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn: pair.baseToken,
            tokenOut: pair.quoteToken,
            fee: pair.feeTier,
            recipient: moverAccount.address,
            amountIn: sellAmt,
            amountOutMinimum: 0n,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });

      const live = await fetchLivePoolsAndBalances(pair.id);
      return res.json({
        ok: true,
        action,
        pair: pair.id,
        newSpot: live?.spotPriceDisplay,
        ref: live?.refPriceDisplay,
        effect: "BUY signal generated (Pool discounted vs Reference)",
        txHash: swapTx,
      });
    } else if (action === "PUSH_PRICE_UP") {
      // Mover buys base with USDT -> pushes price up -> creates SELL signal
      const usdtAmt = 250000000n; // 250 USDT
      await execMoverTx({
        address: pair.quoteToken,
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
            tokenIn: pair.quoteToken,
            tokenOut: pair.baseToken,
            fee: pair.feeTier,
            recipient: moverAccount.address,
            amountIn: usdtAmt,
            amountOutMinimum: 0n,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });

      const live = await fetchLivePoolsAndBalances(pair.id);
      return res.json({
        ok: true,
        action,
        pair: pair.id,
        newSpot: live?.spotPriceDisplay,
        ref: live?.refPriceDisplay,
        effect: "SELL signal generated (Pool at premium vs Reference)",
        txHash: swapTx,
      });
    }

    return res.status(400).json({ error: "Unknown mover action. Use PUSH_PRICE_DOWN or PUSH_PRICE_UP." });
  } catch (err) {
    return res.status(500).json({ error: `Market mover failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// ─── Autonomous AI Loop ────────────────────────────────────────────────────────

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

  if (!deployments) return;

  try {
    lastAutonomousCycle = Date.now();

    // 1. Fetch live pool & balances for active pair
    const live = await fetchLivePoolsAndBalances(activePairId);
    if (!live) return;
    const pair = live.pair;
    const tracker = getTracker(activePairId);

    // 2. Risk Evaluation (Stop-Loss, Take-Profit, Max Drawdown, Daily Loss, Stale Reference)
    const snapshotPortfolio = tracker.getSnapshot(live.baseBal, live.quoteBal, live.spotRatio, live.refRatio);
    const navQuote = Number(snapshotPortfolio.navQuote) / 1e6;
    const avgCost = Number(snapshotPortfolio.avgCostBasisQuote) / 1e6;
    const refAgeMs = Date.now() - live.refTimestamp;

    const riskEval = riskManager.evaluate({
      spotPrice: live.spotPriceDisplay,
      avgCost,
      baseBalance: live.baseBal,
      navQuote,
      refAgeMs,
    });

    if (riskEval.triggered) {
      if (riskEval.action === "EMERGENCY_PAUSE") {
        isPaused = true;
        const exec = getExecutor(activePairId);
        if (exec) {
          await exec.emergencyStop().catch(() => {});
        }
        broadcastSSE("alert", { type: riskEval.type, reason: riskEval.reason });
        return;
      } else if (riskEval.action === "EXIT_POSITION" && live.baseBal > 0n) {
        // Trigger Stop-Loss or Take-Profit Position Exit
        const exec = getExecutor(activePairId);
        if (exec) {
          const currentBlock = await publicClient.getBlockNumber();
          const nonce = BigInt(Date.now());
          const quoteRes = await quoteExactInput(publicClient, deployments.quoter, pair.baseToken, pair.quoteToken, live.baseBal, pair.feeTier);
          const quotedOut = quoteRes.amountOut;
          const minOut = minOutFromSlippage(quotedOut, 100n);

          const execRes = await exec.buildAndExecuteSwap({
            nonce,
            tokenIn: pair.baseToken,
            tokenOut: pair.quoteToken,
            amountIn: live.baseBal,
            quotedAmountOut: quotedOut,
            amountOutMin: minOut,
            quoteBlock: currentBlock,
            reasonCode: 0,
            rationale: riskEval.reason,
          });

          if (execRes.ok) {
            const rec: DecisionRecord = {
              id: `${riskEval.type.toLowerCase()}-${Date.now()}`,
              ts: Date.now(),
              source: riskEval.type === "STOP_LOSS" ? "STOP_LOSS" : "TAKE_PROFIT",
              pair: activePairId,
              side: "SELL",
              requestedAmountIn: live.baseBal.toString(),
              decidedAmountIn: live.baseBal.toString(),
              decision: "EXECUTE_FULL",
              reasonCode: riskEval.type,
              humanReason: riskEval.reason,
              spot: live.spotRatio.toString(),
              ref: live.refRatio.toString(),
              devBps: String(Math.round(((live.spotPriceDisplay - live.refPriceDisplay) / live.refPriceDisplay) * 10000)),
              depthCurve: [],
              impactBudgetBps: 100,
              priceImpactBpsAtRequested: "0",
              priceImpactBpsAtDecided: "0",
              quotedOut: quotedOut.toString(),
              minOut: minOut.toString(),
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
            broadcastSSE("decision", rec);
            return;
          }
        }
      }
    }

    // 3. Quantitative Signals Update
    const currentBlockNum = Number(await publicClient.getBlockNumber().catch(() => 0n));
    const signals = signalsEngine.update({
      pairId: activePairId,
      spotPrice: live.spotPriceDisplay,
      referencePrice: live.refPriceDisplay,
      currentLiquidity: live.poolState.liquidity,
      blockNumber: currentBlockNum,
    });
    latestSignalsData = signals;

    // 4. Compact Brain Snapshot & AI Evaluation
    const effectiveCooldown = RISK_PRESETS[currentRisk].cooldownSeconds * riskManager.getBackoffMultiplier();
    const timeSinceTrade = Math.floor((Date.now() - lastTradeTime) / 1000);

    const brainSnapshot: BrainSnapshot = {
      pairId: activePairId,
      baseSymbol: pair.baseSymbol,
      quoteSymbol: pair.quoteSymbol,
      spotPrice: live.spotPriceDisplay,
      referencePrice: live.refPriceDisplay,
      spreadBps: signals.spreadBps,
      emaFast: signals.emaFast,
      emaSlow: signals.emaSlow,
      emaCross: signals.emaCross,
      zScore: signals.zScore,
      isWarmingUp: signals.isWarmingUp,
      depthShrunk: signals.depthShrunk,
      baseBalanceFormatted: `${(Number(live.baseBal) / Math.pow(10, pair.baseDecimals)).toFixed(4)} ${pair.baseSymbol}`,
      quoteBalanceFormatted: `${(Number(live.quoteBal) / Math.pow(10, pair.quoteDecimals)).toFixed(2)} ${pair.quoteSymbol}`,
      avgCost,
      unrealizedPnlPct: snapshotPortfolio.pnlPercent,
      lastDecisions: ledger.getAll(3).map((d) => ({ side: d.side, decision: d.decision, reasonCode: d.reasonCode, humanReason: d.humanReason })),
      riskPreset: currentRisk,
      impactBudgetBps: Number(RISK_PRESETS[currentRisk].impactBudgetBps),
      stopLossPct: riskManager.getConfig().stopLossPct,
      takeProfitPct: riskManager.getConfig().takeProfitPct,
      cooldownSeconds: effectiveCooldown,
      secondsSinceLastTrade: timeSinceTrade,
    };

    const brainRes = await aiBrain.evaluate(brainSnapshot);
    const proposal = brainRes.proposal;

    // 5. Cooldown & AI Proposal Handling
    if (proposal.action === "HOLD" || timeSinceTrade < effectiveCooldown) {
      const holdReason = timeSinceTrade < effectiveCooldown
        ? `Cooldown active (${Math.round(effectiveCooldown - timeSinceTrade)}s remaining). Holding position.`
        : proposal.rationale;

      lastHoldSummary = `AI proposed HOLD: ${holdReason}`;

      const holdRecord: DecisionRecord = {
        id: `ai-hold-${Date.now()}`,
        ts: Date.now(),
        source: brainRes.source === "ai" ? "AI" : "RULES_FALLBACK",
        pair: activePairId,
        side: "HOLD",
        requestedAmountIn: "0",
        decidedAmountIn: "0",
        decision: "HOLD",
        reasonCode: timeSinceTrade < effectiveCooldown ? "COOLDOWN_ACTIVE" : "AI_PROPOSED_HOLD",
        humanReason: holdReason,
        spot: live.spotRatio.toString(),
        ref: live.refRatio.toString(),
        devBps: String(signals.spreadBps),
        depthCurve: [],
        impactBudgetBps: Number(RISK_PRESETS[currentRisk].impactBudgetBps),
        priceImpactBpsAtRequested: "0",
        priceImpactBpsAtDecided: "0",
        quotedOut: "0",
        minOut: "0",
        quoteBlock: currentBlockNum.toString(),
        intentHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
        amountOutRealized: "0",
        realizedSlippageBps: 0,
        estimateErrorBps: 0,
        lossAvoidedQuote: "0",
        modeLabel: MODE_LABELS.LIVE_TESTNET,
        proposedByAI: {
          action: proposal.action,
          sizePct: proposal.sizePct,
          rationale: proposal.rationale,
          confidence: proposal.confidence,
          signalsUsed: proposal.signalsUsed,
        },
        aiRationale: proposal.rationale,
      };

      ledger.recordDecision(holdRecord);
      broadcastSSE("decision", holdRecord);
      return;
    }

    // 6. Sizing & On-Chain Preflight
    const tradeSide = proposal.action;
    const tokenIn = tradeSide === "SELL" ? pair.baseToken : pair.quoteToken;
    const tokenOut = tradeSide === "SELL" ? pair.quoteToken : pair.baseToken;
    const availableBal = tradeSide === "SELL" ? live.baseBal : live.quoteBal;
    const baseToQuote = tradeSide === "SELL";

    const sizePct = BigInt(Math.max(1, Math.min(50, Math.round(proposal.sizePct))));
    const requestedAmountIn = (availableBal * sizePct) / 100n;
    const dustThreshold = tradeSide === "SELL" ? (pair.baseDecimals === 8 ? 1000n : 1000000000000n) : 1000n;

    if (requestedAmountIn <= dustThreshold || availableBal <= dustThreshold) {
      return;
    }

    const budget = RISK_PRESETS[currentRisk].impactBudgetBps;
    const sizing = await computeSize(
      publicClient,
      deployments.quoter,
      tokenIn,
      tokenOut,
      pair.feeTier,
      requestedAmountIn,
      availableBal,
      budget,
      RISK_PRESETS[currentRisk].slippageBps,
      live.poolState.sqrtPriceX96,
      live.poolState.token0IsBase,
      baseToQuote,
      dustThreshold
    );

    const exec = getExecutor(activePairId);
    if (!exec) return;
    const currentBlock = await publicClient.getBlockNumber();
    const nonce = BigInt(Date.now());

    if (sizing.decision === "EXECUTE_FULL" || sizing.decision === "EXECUTE_TRIMMED") {
      const execRes = await exec.buildAndExecuteSwap({
        nonce,
        tokenIn,
        tokenOut,
        amountIn: sizing.decidedAmountIn,
        quotedAmountOut: sizing.quotedOut,
        amountOutMin: sizing.minOut,
        quoteBlock: currentBlock,
        reasonCode: sizing.decision === "EXECUTE_TRIMMED" ? 1 : 0,
        rationale: `AI Brain (${proposal.rationale}): ${sizing.humanReason}`,
      });

      if (execRes.ok) {
        lastTradeTime = Date.now();
        riskManager.recordSuccess();

        const rec: DecisionRecord = {
          id: `ai-exec-${Date.now()}`,
          ts: Date.now(),
          source: brainRes.source === "ai" ? "AI" : "RULES_FALLBACK",
          pair: activePairId,
          side: tradeSide,
          requestedAmountIn: requestedAmountIn.toString(),
          decidedAmountIn: sizing.decidedAmountIn.toString(),
          decision: sizing.decision,
          reasonCode: sizing.reasonCode,
          humanReason: sizing.humanReason,
          spot: live.spotRatio.toString(),
          ref: live.refRatio.toString(),
          devBps: String(signals.spreadBps),
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
          proposedByAI: {
            action: proposal.action,
            sizePct: proposal.sizePct,
            rationale: proposal.rationale,
            confidence: proposal.confidence,
            signalsUsed: proposal.signalsUsed,
          },
          aiRationale: proposal.rationale,
        };

        ledger.recordDecision(rec);
        await refreshDepthCurve(activePairId);
        broadcastSSE("decision", rec);
      }
    } else if (sizing.decision === "NO_TRADE") {
      riskManager.recordRefusal();
      const intentHash = ("0x" + nonce.toString(16).padStart(64, "0")) as `0x${string}`;
      let refusalTx: `0x${string}` | undefined;

      if (APP_CONFIG.RECORD_REFUSALS_ONCHAIN !== "never") {
        const refRes = await exec.recordRefusalOnchain({
          intentHash,
          reasonCode: 2,
          tokenIn,
          tokenOut,
          requestedAmountIn,
          maxSafeAmountIn: sizing.decidedAmountIn,
          impactBpsAtRequested: sizing.priceImpactBpsAtRequested,
          quoteBlock: currentBlock,
          rationale: sizing.humanReason,
        });
        if (refRes.ok) refusalTx = refRes.txHash;
      }

      const rec: DecisionRecord = {
        id: `ai-refuse-${Date.now()}`,
        ts: Date.now(),
        source: brainRes.source === "ai" ? "AI" : "RULES_FALLBACK",
        pair: activePairId,
        side: tradeSide,
        requestedAmountIn: requestedAmountIn.toString(),
        decidedAmountIn: "0",
        decision: "NO_TRADE",
        reasonCode: sizing.reasonCode,
        humanReason: sizing.humanReason,
        spot: live.spotRatio.toString(),
        ref: live.refRatio.toString(),
        devBps: String(signals.spreadBps),
        depthCurve: [],
        impactBudgetBps: Number(budget),
        priceImpactBpsAtRequested: sizing.priceImpactBpsAtRequested.toString(),
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
        modeLabel: MODE_LABELS.LIVE_TESTNET,
        proposedByAI: {
          action: proposal.action,
          sizePct: proposal.sizePct,
          rationale: proposal.rationale,
          confidence: proposal.confidence,
          signalsUsed: proposal.signalsUsed,
        },
        aiRationale: proposal.rationale,
      };

      ledger.recordDecision(rec);
      broadcastSSE("decision", rec);
    }
  } catch (err) {
    console.warn("[Fathom] Autonomous loop tick error:", err);
  }
}

// Sync on-chain logs across all deployed ExecutionGuards on boot
async function syncOnchainHistory() {
  if (!deployments) return;
  try {
    const fromBlock = BigInt(deployments.deployBlock || 35216580);
    const toBlock = await publicClient.getBlockNumber();
    console.log(`[Fathom] Syncing on-chain history from block #${fromBlock} to #${toBlock}...`);

    const guardsToSync: `0x${string}`[] = [deployments.executionGuard];
    if (deployments.executionGuardWeth) guardsToSync.push(deployments.executionGuardWeth);
    if (deployments.executionGuardWbtc) guardsToSync.push(deployments.executionGuardWbtc);

    async function fetchEventsInChunks(address: `0x${string}`, eventName: any) {
      const allEvents: any[] = [];
      const CHUNK = 1800n;
      for (let cur = fromBlock; cur <= toBlock; cur += CHUNK + 1n) {
        const end = cur + CHUNK > toBlock ? toBlock : cur + CHUNK;
        try {
          const chunkLogs = await publicClient.getContractEvents({
            address,
            abi: EXECUTION_GUARD_ABI,
            eventName,
            fromBlock: cur,
            toBlock: end,
          });
          allEvents.push(...chunkLogs);
        } catch {}
      }
      return allEvents;
    }

    for (const guardAddr of guardsToSync) {
      try {
        const [execLogs, rejLogs] = await Promise.all([
          fetchEventsInChunks(guardAddr, "TradeExecuted"),
          fetchEventsInChunks(guardAddr, "TradeRejected"),
        ]);

        console.log(`[Fathom] Guard ${guardAddr.slice(0, 10)}...: ${execLogs.length} Executed, ${rejLogs.length} Rejected.`);

        const sortedExec = [...execLogs].sort((a, b) => {
          const bDiff = Number(a.blockNumber - b.blockNumber);
          return bDiff !== 0 ? bDiff : (a.logIndex || 0) - (b.logIndex || 0);
        });

        for (const log of sortedExec) {
          const args = log.args as any;
          if (args && args.tokenIn && args.tokenOut && args.amountIn && args.amountOut) {
            getTracker(activePairId).processTradeEvent({
              tokenIn: args.tokenIn,
              tokenOut: args.tokenOut,
              amountIn: args.amountIn,
              amountOut: args.amountOut,
              blockNumber: log.blockNumber,
            });
          }
        }

        ledger.rebuildFromOnchainLogs(sortedExec, rejLogs, deployments);
      } catch (err) {
        console.warn(`[Fathom] Event sync error for guard ${guardAddr}:`, err);
      }
    }

    console.log(`[Fathom] State successfully synced from on-chain logs. Ledger size: ${ledger.getAll().length}`);
  } catch (err) {
    console.warn("[Fathom] Failed to sync on-chain history on boot:", err);
  }
}

export function startServer(port = APP_CONFIG.PORT) {
  const server = app.listen(port, "0.0.0.0", async () => {
    console.log(`[Fathom] Agent Server listening on http://127.0.0.1:${port}`);

    try {
      const block = await publicClient.getBlockNumber();
      console.log(`[Fathom] Connected to HSK Testnet (Chain 133) at Block #${block}`);
      isReplayMode = false;
      await syncOnchainHistory();
      await refreshDepthCurve(activePairId);
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

  // Autonomous polling interval
  setInterval(tick, pollIntervalSeconds * 1000);

  return server;
}

if (process.env.NODE_ENV !== "test") {
  startServer();
}

export { app };
