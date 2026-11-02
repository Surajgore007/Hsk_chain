/**
 * config.ts — Fathom configuration loader
 * Reads .env, validates, and exports typed config.
 * NEVER logs private keys.
 */

import { config as loadDotenv } from "dotenv";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Chain } from "viem";

// Load .env from repo root
const envPath = resolve(process.cwd(), "../.env");
if (existsSync(envPath)) {
  loadDotenv({ path: envPath });
}
// Also try cwd
loadDotenv();

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const hskTestnet: Chain = {
  id: 133,
  name: "HSK Testnet",
  nativeCurrency: { name: "HashKey", symbol: "HSK", decimals: 18 },
  rpcUrls: {
    default: { http: [optional("RPC_TESTNET", "https://testnet.hsk.xyz")] },
    public:  { http: [optional("RPC_TESTNET", "https://testnet.hsk.xyz")] },
  },
  blockExplorers: {
    default: { name: "HSK Testnet Explorer", url: "https://testnet-explorer.hskchain.net" },
  },
};

export const hskMainnetReadonly: Chain = {
  id: 177,
  name: "HSK Mainnet (read-only)",
  nativeCurrency: { name: "HashKey", symbol: "HSK", decimals: 18 },
  rpcUrls: {
    default: { http: [optional("RPC_MAINNET_READONLY", "https://mainnet.hsk.xyz")] },
    public:  { http: [optional("RPC_MAINNET_READONLY", "https://mainnet.hsk.xyz")] },
  },
};

// Contracts — populated by scripts/setup-testnet and stored in deployments/testnet.json
export function loadDeployments(): Deployments | null {
  try {
    const candidates = [
      resolve(process.cwd(), "deployments/testnet.json"),
      resolve(process.cwd(), "../deployments/testnet.json"),
    ];
    for (const depFile of candidates) {
      if (existsSync(depFile)) {
        return JSON.parse(readFileSync(depFile, "utf-8")) as Deployments;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export interface Deployments {
  chainId: number;
  executionGuard: `0x${string}`;
  mockUSDT: `0x${string}`;
  whsk: `0x${string}`;
  pool: `0x${string}`;
  quoter: `0x${string}`;
  router: `0x${string}`;
  factory: `0x${string}`;
  positionManager: `0x${string}`;
  mainnetPool: `0x${string}`;
  deployBlock: number;
  deployedAt: string;
}

// Client helpers
export function makePublicClient(chain = hskTestnet) {
  return createPublicClient({ chain, transport: http() });
}

export function makeMainnetClient() {
  return createPublicClient({ chain: hskMainnetReadonly, transport: http() });
}

export function makeWalletClient(pk: `0x${string}`, chain = hskTestnet) {
  const account = privateKeyToAccount(pk);
  return {
    client: createWalletClient({ account, chain, transport: http() }),
    account,
  };
}

// Risk presets
export const RISK_PRESETS = {
  conservative: {
    impactBudgetBps:    25n,
    slippageBps:        30n,
    maxTradePercent:    5n,   // % of sellable balance
    cooldownSeconds:    120,
    signalThresholdBps: 120n,
  },
  balanced: {
    impactBudgetBps:    60n,
    slippageBps:        50n,
    maxTradePercent:    10n,
    cooldownSeconds:    60,
    signalThresholdBps: 80n,
  },
  aggressive: {
    impactBudgetBps:    120n,
    slippageBps:        100n,
    maxTradePercent:    20n,
    cooldownSeconds:    30,
    signalThresholdBps: 50n,
  },
} as const;

export type RiskPreset = keyof typeof RISK_PRESETS;

// Mode labels (must match README/UI exactly)
export const MODE_LABELS = {
  LIVE_TESTNET: "LIVE HSK TESTNET (own-seeded pool)",
  MAINNET_REF:  "MAINNET READ-ONLY (reference price)",
  FORK_TEST:    "HSK FORK TEST",
  LOCAL_MOCK:   "LOCAL MOCK (not HSK)",
  REPLAY:       "REPLAY MODE (recorded)",
} as const;

export const APP_CONFIG = {
  DEMO_MODE:               optional("DEMO_MODE", "true") === "true",
  POLL_SECONDS:            parseInt(optional("POLL_SECONDS", "20")),
  AUTO_CONFIRM:            optional("AUTO_CONFIRM", "false") === "true",
  RECORD_REFUSALS_ONCHAIN: optional("RECORD_REFUSALS_ONCHAIN", "auto") as "auto" | "always" | "never",
  LLM_PROVIDER:            optional("LLM_PROVIDER", "groq") as "groq" | "gemini",
  GROQ_API_KEY:            optional("GROQ_API_KEY", ""),
  GROQ_MODEL:              optional("GROQ_MODEL", "openai/gpt-oss-20b"),
  GEMINI_API_KEY:          optional("GEMINI_API_KEY", ""),
  GEMINI_MODEL:            optional("GEMINI_MODEL", "gemini-1.5-flash"),
  PORT:                    parseInt(optional("PORT", "3001")),
  CHAIN_ID:                133,
  MIN_VIABLE_BPS:          20n, // 20% of requested = min trim
  DUST_THRESHOLD_BASE:     BigInt("1000000000000000"),   // 0.001 WHSK
  DUST_THRESHOLD_QUOTE:    1000n,                         // 0.001 tUSDT (6 dec)
  EMA_FAST_ALPHA_BPS:      200n,  // α = 0.02 → smoothing factor in bps
  EMA_SLOW_ALPHA_BPS:      50n,   // α = 0.005
} as const;

