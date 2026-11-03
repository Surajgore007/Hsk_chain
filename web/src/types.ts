export interface UserProfile {
  name: string;
  riskPreference: "conservative" | "balanced" | "aggressive";
  executionMode: "manual" | "auto";
  maxTradePct: number;
}

export type ModeLabel =
  | "LIVE HSK TESTNET (own-seeded pool)"
  | "MAINNET READ-ONLY (reference price)"
  | "HSK FORK TEST"
  | "LOCAL MOCK (not HSK)"
  | "REPLAY MODE (recorded)";

export interface AppState {
  mode: ModeLabel;
  modeLabel: ModeLabel;
  network: string;
  referenceNetwork: string;
  autoEnabled: boolean;
  isPaused: boolean;
  currentRisk: "conservative" | "balanced" | "aggressive";
  riskConfig: {
    impactBudgetBps: number;
    slippageBps: number;
    maxTradePercent: number;
    cooldownSeconds: number;
    signalThresholdBps: number;
  };
  pollIntervalSeconds: number;
  deployments: any;
  isReplayMode: boolean;
}

export interface PortfolioData {
  baseBalance: string;
  quoteBalance: string;
  spotPriceDisplay: number;
  refPriceDisplay: number;
  navQuote: string;
  navRefQuote: string;
  avgCostBasisQuote: string;
  realizedPnlQuote: string;
  unrealizedPnlQuote: string;
  totalPnlQuote: string;
  pnlPercent: number;
}

export interface DepthPoint {
  amountIn: string;
  quotedOut: string;
  totalCostBps: number;
  priceImpactBps: number;
}

export interface DecisionRecord {
  id: string;
  ts: number;
  source: "SIGNAL" | "CHAT";
  pair: string;
  side: "BUY" | "SELL";
  requestedAmountIn: string;
  decidedAmountIn: string;
  decision: "EXECUTE_FULL" | "EXECUTE_TRIMMED" | "NO_TRADE";
  reasonCode: string;
  humanReason: string;
  spot: string;
  ref: string;
  devBps: string;
  depthCurve: DepthPoint[];
  impactBudgetBps: number;
  priceImpactBpsAtRequested: string;
  priceImpactBpsAtDecided: string;
  quotedOut: string;
  minOut: string;
  quoteBlock: string;
  intentHash: string;
  txHash?: string;
  amountOutRealized?: string;
  realizedSlippageBps?: number;
  estimateErrorBps?: number;
  lossAvoidedQuote?: string;
  modeLabel: string;
  feeBps?: number;
  netEdgeBps?: number;
}

export interface ScorecardMetrics {
  totalDecisions: number;
  executedCount: number;
  trimmedCount: number;
  refusedCount: number;
  avgEstimateErrorBps: number;
  worstEstimateErrorBps: number;
  totalLossAvoidedQuote: string;
  budgetCompliancePercent: number;
  trades: Array<{
    id: string;
    ts: number;
    decision: string;
    predictedSlippageBps: number;
    realizedSlippageBps: number;
    estimateErrorBps: number;
    txHash?: string;
  }>;
}

export interface ThoughtStep {
  title: string;
  detail: string;
  status?: "done" | "active" | "warning";
}

export interface ChatMessage {
  id: string;
  sender: "user" | "agent";
  text: string;
  timestamp: number;
  parserBadge?: "LLM" | "rules";
  parsedIntent?: any;
  previewId?: string;
  previewCard?: any;
  decision?: DecisionRecord;
  thoughtProcess?: ThoughtStep[];
}

export interface VerifyData {
  rpcOk: boolean;
  currentBlock: string;
  latestBlockTime: number;
  activePair: string;
  executionGuardAddress: string;
  onchainParams: Record<string, string>;
  onchainEnforced: string[];
  offchainEnforced: string[];
  contracts: Record<string, string>;
  explorerBase: string;
  recentDecisions: Array<{
    id: string;
    ts: number;
    decision: string;
    pair: string;
    txHash?: string;
    impactBps: string | number;
  }>;
  lastAutonomousCycle: number;
  secondsSinceLastCycle: number;
  loopIntervalSeconds: number;
  autoEnabled: boolean;
  isPaused: boolean;
  currentRisk: string;
  groqApiConfigured: boolean;
}

