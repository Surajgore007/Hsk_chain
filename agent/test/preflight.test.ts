import { describe, it, expect } from "vitest";
import { runPreflight, type PreflightParams } from "../src/preflight.js";
import { Q96 } from "../src/price.js";

const baseToken = "0xCA8aAceEC5Db1e91B9Ed3a344bA026c4a2B3ebF6";
const quoteToken = "0x5BaFcc0c93EcD8022925D7fd89da1C6250850E19";

const validPolicy = {
  maxTradeBps: 2500, // 25%
  dailyCapQuote: 100_000n * 10n ** 6n,
  maxImpactBps: 60,
  maxSlippageBps: 50,
  feeBps: 30,
  maxQuoteAgeBlocks: 5,
  cooldownSeconds: 30,
};

// Live HSK Mainnet snapshot (Pool 0x4ff5...)
const MAINNET_SQRT_P = 23440559369646041157550n;

function makeValidParams(): PreflightParams {
  const amountIn = 10n ** 18n; // 1 WHSK
  const ideal = 87_534n;       // 87,534 micro-USDT (~0.0875 USDT)
  const floor = (ideal * (10000n - 30n - 60n - 50n)) / 10000n; // 9860 bps of ideal

  return {
    tokenIn: baseToken,
    tokenOut: quoteToken,
    baseToken,
    quoteToken,
    amountIn,
    amountOutMin: floor,
    quotedAmountOut: ideal,
    balanceTokenIn: 100n * (10n ** 18n), // 100 WHSK balance
    quoteBlock: 100n,
    currentBlock: 102n,
    deadline: 10000n,
    currentTimestamp: 5000n,
    lastTradeTime: 4000n, // well past cooldown
    nonceUsed: false,
    isPaused: false,
    dayVolumeQuote: 0n,
    sqrtPriceX96: MAINNET_SQRT_P,
    token0IsBase: true,
    policy: validPolicy,
  };
}

describe("Preflight Validation (Contract Mirror)", () => {
  it("passes when all invariants are respected", () => {
    const res = runPreflight(makeValidParams());
    expect(res.ok).toBe(true);
    expect(res.reasonCode).toBe("OK");
  });

  it("reverts with GUARD_PAUSED when paused", () => {
    const p = makeValidParams();
    p.isPaused = true;
    const res = runPreflight(p);
    expect(res.ok).toBe(false);
    expect(res.reasonCode).toBe("GUARD_PAUSED");
  });

  it("reverts with PAIR_NOT_ALLOWED for unapproved tokens", () => {
    const p = makeValidParams();
    p.tokenIn = "0x1111111111111111111111111111111111111111";
    const res = runPreflight(p);
    expect(res.ok).toBe(false);
    expect(res.reasonCode).toBe("PAIR_NOT_ALLOWED");
  });

  it("reverts with DEADLINE_EXPIRED when expired", () => {
    const p = makeValidParams();
    p.deadline = 4000n;
    p.currentTimestamp = 5000n;
    const res = runPreflight(p);
    expect(res.ok).toBe(false);
    expect(res.reasonCode).toBe("DEADLINE_EXPIRED");
  });

  it("reverts with QUOTE_STALE when older than maxQuoteAgeBlocks", () => {
    const p = makeValidParams();
    p.quoteBlock = 100n;
    p.currentBlock = 110n; // 10 blocks old, max is 5
    const res = runPreflight(p);
    expect(res.ok).toBe(false);
    expect(res.reasonCode).toBe("QUOTE_STALE");
  });

  it("reverts with NONCE_REPLAY when nonce already executed", () => {
    const p = makeValidParams();
    p.nonceUsed = true;
    const res = runPreflight(p);
    expect(res.ok).toBe(false);
    expect(res.reasonCode).toBe("NONCE_REPLAY");
  });

  it("reverts with COOLDOWN when trade attempted too soon", () => {
    const p = makeValidParams();
    p.lastTradeTime = 4990n;
    p.currentTimestamp = 5000n; // only 10s elapsed, cooldown is 30s
    const res = runPreflight(p);
    expect(res.ok).toBe(false);
    expect(res.reasonCode).toBe("COOLDOWN");
  });

  it("reverts with AMOUNT_TOO_LARGE when exceeding per-trade cap", () => {
    const p = makeValidParams();
    // Balance 100 WHSK, max 25% = 25 WHSK. Attempt 30 WHSK
    p.amountIn = 30n * (10n ** 18n);
    const res = runPreflight(p);
    expect(res.ok).toBe(false);
    expect(res.reasonCode).toBe("AMOUNT_TOO_LARGE");
  });

  it("reverts with MIN_OUT_ZERO when amountOutMin is 0", () => {
    const p = makeValidParams();
    p.amountOutMin = 0n;
    const res = runPreflight(p);
    expect(res.ok).toBe(false);
    expect(res.reasonCode).toBe("MIN_OUT_ZERO");
  });

  it("reverts with MIN_OUT_TOO_LOW when violating on-chain floor", () => {
    const p = makeValidParams();
    p.amountOutMin = 100n; // non-zero but below floor
    const res = runPreflight(p);
    expect(res.ok).toBe(false);
    expect(res.reasonCode).toBe("MIN_OUT_TOO_LOW");
  });
});

