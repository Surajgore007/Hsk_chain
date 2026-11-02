import { describe, it, expect } from "vitest";
import {
  idealOut,
  priceImpactBps,
  minOutFromSlippage,
  contractFloor,
  deviationBps,
  sqrtPriceToDisplayPrice,
  Q96,
  mulDiv,
} from "../src/price.js";

describe("Price and Impact Math (bigint only)", () => {
  it("computes safe mulDiv without floating-point error", () => {
    const a = 1_000_000n;
    const b = 2_000_000n;
    const c = 500_000n;
    expect(mulDiv(a, b, c)).toBe(4_000_000n);
  });

  it("verifies live HSK Mainnet pool (0x4ff5...) slot0 display price scaling", () => {
    // Snapshot from HSK Mainnet (Chain 177) pool 0x4ff515761864e7838b0adb8b5b2b8b7a068905dc
    // token0 = WHSK (18 dec), token1 = USDT (6 dec)
    const MAINNET_SQRT_P = 23440559369646041157550n;

    // Display price should reflect ~0.0875 USD (matching CoinGecko / CoinMarketCap ~$0.087 to $0.088)
    const displayPrice = sqrtPriceToDisplayPrice(MAINNET_SQRT_P, true);
    expect(displayPrice).toBeGreaterThan(0.085);
    expect(displayPrice).toBeLessThan(0.090);
    expect(displayPrice).toBeCloseTo(0.087534, 4);
  });

  it("computes idealOut for base -> quote at real Mainnet spot (~0.0875 USDT/WHSK)", () => {
    const MAINNET_SQRT_P = 23440559369646041157550n;
    // 1 WHSK (10^18) base -> quote: exactly 87,534 micro-USDT (0.087534 USDT, 6 dec)
    const whskIn = 10n ** 18n;
    const quoteOut = idealOut(MAINNET_SQRT_P, whskIn, true, true);
    expect(quoteOut).toBe(87_534n);
  });

  it("computes idealOut for quote -> base at real Mainnet spot (~0.0875 USDT/WHSK)", () => {
    const MAINNET_SQRT_P = 23440559369646041157550n;
    // 87,534 micro-USDT quote -> base: exactly 1 WHSK (~10^18 wei)
    const baseOut = idealOut(MAINNET_SQRT_P, 87_534n, false, true);
    // Within 0.0001% of 1 WHSK due to integer division
    expect(baseOut).toBeGreaterThan(999_999_990_000_000_000n);
    expect(baseOut).toBeLessThanOrEqual(10n ** 18n);
  });

  it("separates pool fee (30 bps) from price impact", () => {
    const ideal = 100_000n;
    // 100 bps total cost -> 30 bps fee + 70 bps price impact
    const quoted = 99_000n; // 1% less
    const impact = priceImpactBps(ideal, quoted, 30n);
    expect(impact).toBe(70n);
  });

  it("computes minOut from slippage allowance", () => {
    const quoted = 10_000n;
    const slippageBps = 50n; // 0.5%
    const minOut = minOutFromSlippage(quoted, slippageBps);
    expect(minOut).toBe(9_950n);
  });

  it("computes on-chain minimum output floor", () => {
    const ideal = 10_000n;
    const feeBps = 30n;
    const maxImpactBps = 60n;
    const maxSlippageBps = 50n;
    // Floor deduction = 30 + 60 + 50 = 140 bps (1.4%)
    // Floor = 10000 * (10000 - 140) / 10000 = 9860
    const floor = contractFloor(ideal, feeBps, maxImpactBps, maxSlippageBps);
    expect(floor).toBe(9_860n);
  });

  it("computes deviation from reference price (signed)", () => {
    // Spot 0.0860 USDT, Ref 0.0876 USDT -> cheap -> negative deviation
    const spot = 86_000n;
    const ref = 87_600n;
    const dev = deviationBps(spot, ref);
    expect(dev).toBeLessThan(0n);
    expect(dev).toBe(-182n); // -1.82% (-182 bps)
  });
});

