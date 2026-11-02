import { createPublicClient, http, formatEther, formatUnits } from "viem";
import { hskTestnet, loadDeployments } from "../agent/src/config.js";
import { tokenBalance, readPoolState, quoteExactInput } from "../agent/src/quoter.js";
import { idealOut, priceImpactBps, sqrtPriceToDisplayPrice } from "../agent/src/price.js";

async function main() {
  const dep = loadDeployments()!;
  const client = createPublicClient({ chain: hskTestnet, transport: http("https://testnet.hsk.xyz") });

  const [ownerBal, opBal, movBal] = await Promise.all([
    client.getBalance({ address: dep.owner }),
    client.getBalance({ address: dep.operator }),
    client.getBalance({ address: dep.mover }),
  ]);

  console.log("=== WALLET BALANCES (GAS HSK) ===");
  console.log(`OWNER    (${dep.owner}):    ${formatEther(ownerBal)} HSK`);
  console.log(`OPERATOR (${dep.operator}): ${formatEther(opBal)} HSK`);
  console.log(`MOVER    (${dep.mover}):    ${formatEther(movBal)} HSK`);
  console.log();

  const [guardWhsk, guardUsdt, poolWhsk, poolUsdt, poolState] = await Promise.all([
    tokenBalance(client, dep.whsk, dep.executionGuard),
    tokenBalance(client, dep.mockUSDT, dep.executionGuard),
    tokenBalance(client, dep.whsk, dep.pool),
    tokenBalance(client, dep.mockUSDT, dep.pool),
    readPoolState(client, dep.pool, dep.whsk),
  ]);

  const spotDisplay = sqrtPriceToDisplayPrice(poolState.sqrtPriceX96, poolState.token0IsBase);

  console.log("=== POOL & GUARD STATE ===");
  console.log(`Pool Address: ${dep.pool}`);
  console.log(`Pool WHSK:    ${formatEther(poolWhsk)} WHSK (${poolWhsk.toString()} wei)`);
  console.log(`Pool tUSDT:   ${formatUnits(poolUsdt, 6)} tUSDT (${poolUsdt.toString()} raw units)`);
  console.log(`Pool Liquidity: ${poolState.liquidity.toString()}`);
  console.log(`Pool Spot:    $${spotDisplay.toFixed(6)} USDT/WHSK (sqrtPriceX96: ${poolState.sqrtPriceX96})`);
  console.log();
  console.log(`Guard Address: ${dep.executionGuard}`);
  console.log(`Guard WHSK:   ${formatEther(guardWhsk)} WHSK (${guardWhsk.toString()} wei)`);
  console.log(`Guard tUSDT:  ${formatUnits(guardUsdt, 6)} tUSDT (${guardUsdt.toString()} raw units)`);
  console.log();

  const whskRatio = poolWhsk > 0n ? (Number(guardWhsk * 10000n / poolWhsk) / 100).toFixed(2) : "0";
  const usdtRatio = poolUsdt > 0n ? (Number(guardUsdt * 10000n / poolUsdt) / 100).toFixed(2) : "0";
  console.log(`Guard/Pool Ratio (WHSK):  ${whskRatio}% of pool`);
  console.log(`Guard/Pool Ratio (tUSDT): ${usdtRatio}% of pool`);
  console.log();

  console.log("=== QUOTER SWEEP (SELLING GUARD WHSK) ===");
  const pcts = [1n, 5n, 10n, 25n, 50n, 100n];
  for (const pct of pcts) {
    const amt = (guardWhsk * pct) / 100n;
    if (amt === 0n) {
      console.log(` - ${pct}%: 0 wei -> skip`);
      continue;
    }
    const q = await quoteExactInput(client, dep.quoter, dep.whsk, dep.mockUSDT, amt, 3000);
    if (!q.ok) {
      console.log(` - ${pct}% (${amt} wei): Quoter REVERTED`);
      continue;
    }
    const ideal = idealOut(poolState.sqrtPriceX96, amt, true, poolState.token0IsBase);
    const impact = priceImpactBps(ideal, q.amountOut);
    console.log(` - ${pct}% (${amt} wei): quotedOut = ${q.amountOut} raw units (~${formatUnits(q.amountOut, 6)} tUSDT) | impact = ${impact} bps`);
  }
}

main().catch(console.error);

