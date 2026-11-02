import { createPublicClient, http, formatUnits } from "viem";
import { hskTestnet, loadDeployments } from "../agent/src/config.js";
import { tokenBalance, readPoolState, quoteExactInput } from "../agent/src/quoter.js";
import { idealOut, priceImpactBps } from "../agent/src/price.js";

async function main() {
  const dep = loadDeployments()!;
  const client = createPublicClient({ chain: hskTestnet, transport: http("https://testnet.hsk.xyz") });

  console.log("=================================================================");
  console.log("  SECTION 1 VERIFICATION — POOL RESERVES & QUOTER DEPTH SWEEPS");
  console.log("=================================================================\n");

  const pairs = Object.values(dep.pairs || {});
  for (const p of pairs) {
    console.log(`-----------------------------------------------------------------`);
    console.log(`PAIR: ${p.id} (${p.isMock ? "MOCK TOKENS, own pool" : "NATIVE WHSK"})`);
    console.log(`Pool Address:  ${p.pool}`);
    console.log(`Guard Address: ${p.executionGuard}`);
    console.log(`Base:  ${p.baseSymbol} (${p.baseToken}, ${p.baseDecimals} dec)`);
    console.log(`Quote: ${p.quoteSymbol} (${p.quoteToken}, ${p.quoteDecimals} dec)`);

    const [poolBase, poolQuote, guardBase, guardQuote, poolState] = await Promise.all([
      tokenBalance(client, p.baseToken, p.pool),
      tokenBalance(client, p.quoteToken, p.pool),
      tokenBalance(client, p.baseToken, p.executionGuard),
      tokenBalance(client, p.quoteToken, p.executionGuard),
      readPoolState(client, p.pool, p.baseToken),
    ]);

    const baseRatio = (Number(guardBase) / Number(poolBase || 1n)) * 100;
    const quoteRatio = (Number(guardQuote) / Number(poolQuote || 1n)) * 100;

    console.log(`Pool Reserves:  ${formatUnits(poolBase, p.baseDecimals)} ${p.baseSymbol} | ${formatUnits(poolQuote, p.quoteDecimals)} ${p.quoteSymbol}`);
    console.log(`Guard Reserves: ${formatUnits(guardBase, p.baseDecimals)} ${p.baseSymbol} | ${formatUnits(guardQuote, p.quoteDecimals)} ${p.quoteSymbol}`);
    console.log(`Guard/Pool Ratio (Base):  ${baseRatio.toFixed(2)}% of pool`);
    console.log(`Guard/Pool Ratio (Quote): ${quoteRatio.toFixed(2)}% of pool`);

    console.log(`\nQuoter Sweep Selling Guard ${p.baseSymbol} -> ${p.quoteSymbol}:`);
    const pcts = [1, 5, 10, 25, 50, 100];
    for (const pct of pcts) {
      const amountIn = (guardBase * BigInt(pct)) / 100n;
      if (amountIn === 0n) continue;
      const quote = await quoteExactInput(
        client,
        dep.quoter,
        p.baseToken,
        p.quoteToken,
        amountIn,
        p.feeTier,
      );

      if (!quote.ok) {
        console.log(` - ${pct}% (${amountIn}): Quoter failed (${quote.error})`);
        continue;
      }

      const ideal = idealOut(poolState.sqrtPriceX96, amountIn, true, poolState.token0IsBase);
      const impact = priceImpactBps(ideal, quote.amountOut);
      console.log(` - ${pct}% (${formatUnits(amountIn, p.baseDecimals)} ${p.baseSymbol}): quotedOut = ${quote.amountOut.toString()} raw units (${formatUnits(quote.amountOut, p.quoteDecimals)} ${p.quoteSymbol}) | impact = ${impact} bps (budget: 60 bps)`);
    }
    console.log();
  }
}

main().catch(console.error);
