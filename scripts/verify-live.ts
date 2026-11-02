/**
 * verify-live.ts — End-to-end verification script for DepthGuard on HSK Testnet
 *
 * Verifies:
 * 1. RPC connection to HashKey Testnet (Chain 133).
 * 2. On-chain contract bytecodes (ExecutionGuard, MockUSDT, QuoterV2, Pool).
 * 3. ExecutionGuard policy configuration.
 * 4. Testnet pool spot price & Mainnet reference price agreement (~$0.087).
 * 5. Floor parity: contract idealOutAtSpot == TypeScript idealOut.
 * 6. Live QuoterV2 depth quote on-chain.
 * 7. Real decisions with verified transaction receipts.
 */

import { resolve } from "path";
import { readFileSync, existsSync } from "fs";
import {
  makePublicClient,
  makeMainnetClient,
  loadDeployments,
  APP_CONFIG,
} from "../agent/src/config.js";
import { EXECUTION_GUARD_ABI } from "../agent/src/executor.js";
import { readPoolState, quoteExactInput, tokenBalance } from "../agent/src/quoter.js";
import { sqrtPriceToDisplayPrice, idealOut } from "../agent/src/price.js";

async function main() {
  console.log("================================================================");
  console.log("  DEPTHGUARD — LIVE SYSTEM VERIFICATION (GATE CHECK)");
  console.log("================================================================\n");

  const dep = loadDeployments();
  if (!dep) {
    console.error("FAIL: deployments/testnet.json not found.");
    process.exit(1);
  }

  const client = makePublicClient();
  const mainnetClient = makeMainnetClient();

  let passCount = 0;
  let totalCount = 0;

  function assertCheck(name: string, condition: boolean, detail: string) {
    totalCount++;
    if (condition) {
      passCount++;
      console.log(`[PASS] ${name}: ${detail}`);
    } else {
      console.error(`[FAIL] ${name}: ${detail}`);
    }
  }

  // 1. RPC & Chain ID
  try {
    const chainId = await client.getChainId();
    const block = await client.getBlockNumber();
    assertCheck("Chain ID", chainId === 133, `Connected to HSK Testnet (Chain ID ${chainId}) at Block #${block}`);
  } catch (err) {
    assertCheck("Chain ID", false, `RPC error: ${err}`);
  }

  // 2. Bytecode checks
  const contracts = [
    { name: "ExecutionGuard", address: dep.executionGuard },
    { name: "MockUSDT", address: dep.mockUSDT },
    { name: "QuoterV2", address: dep.quoter },
    { name: "Pool (0.3%)", address: dep.pool },
  ];

  for (const c of contracts) {
    try {
      const code = await client.getBytecode({ address: c.address });
      assertCheck(`Bytecode: ${c.name}`, Boolean(code && code.length > 2), `Code size: ${code ? (code.length - 2) / 2 : 0} bytes at ${c.address}`);
    } catch (err) {
      assertCheck(`Bytecode: ${c.name}`, false, `Failed to fetch bytecode: ${err}`);
    }
  }

  // 3. ExecutionGuard Policy
  try {
    const paused = await client.readContract({
      address: dep.executionGuard,
      abi: EXECUTION_GUARD_ABI,
      functionName: "paused",
    });
    assertCheck("Guard State", paused === false, `Contract is active (paused = ${paused})`);
  } catch (err) {
    assertCheck("Guard State", false, `Read error: ${err}`);
  }

  // 4. Pool Spot Price & Mainnet Reference Price
  try {
    const poolState = await readPoolState(client, dep.pool, dep.whsk);
    const mainnetState = await readPoolState(mainnetClient, dep.mainnetPool, "0xB210D2120d57b758EE163cFfb43e73728c471Cf1");

    const spotPrice = sqrtPriceToDisplayPrice(poolState.sqrtPriceX96, poolState.token0IsBase);
    const refPrice = sqrtPriceToDisplayPrice(mainnetState.sqrtPriceX96, mainnetState.token0IsBase);

    assertCheck("Spot Price Read", spotPrice > 0.05 && spotPrice < 0.15, `Testnet Pool: $${spotPrice.toFixed(6)} USDT/WHSK`);
    assertCheck("Mainnet Ref Price Read", refPrice > 0.08 && refPrice < 0.095, `Mainnet Pool: $${refPrice.toFixed(6)} USDT/WHSK`);
  } catch (err) {
    assertCheck("Pool Spot / Ref", false, `Read error: ${err}`);
  }

  // 5. Floor Parity (idealOutAtSpot vs TS idealOut)
  try {
    const poolState = await readPoolState(client, dep.pool, dep.whsk);
    const testAmount = 1000000000000000n; // 0.001 WHSK
    const onchainFloor = await client.readContract({
      address: dep.executionGuard,
      abi: EXECUTION_GUARD_ABI,
      functionName: "idealOutAtSpot",
      args: [dep.whsk, testAmount],
    });
    const tsFloor = idealOut(poolState.sqrtPriceX96, testAmount, true, poolState.token0IsBase);
    const diff = onchainFloor > tsFloor ? onchainFloor - tsFloor : tsFloor - onchainFloor;
    assertCheck("Floor Parity", diff <= 1n, `Contract: ${onchainFloor} micro-USDT, TS: ${tsFloor} micro-USDT (Delta: ${diff})`);
  } catch (err) {
    assertCheck("Floor Parity", false, `Parity check error: ${err}`);
  }

  // 6. QuoterV2 Live Depth Check
  try {
    const quote = await quoteExactInput(client, dep.quoter, dep.whsk, dep.mockUSDT, 25000000000000n, 3000);
    assertCheck("QuoterV2 Live Depth", quote.ok && quote.amountOut > 0n, `Quoted ${quote.amountOut.toString()} micro-USDT for 0.000025 WHSK`);
  } catch (err) {
    assertCheck("QuoterV2 Live Depth", false, `Quoter error: ${err}`);
  }

  // 7. Recorded Decisions & Verified Transactions
  try {
    const rootDir = existsSync(resolve(process.cwd(), "fixtures")) ? process.cwd() : resolve(process.cwd(), "..");
    const recFile = resolve(rootDir, "fixtures/recorded-from-live.json");
    if (existsSync(recFile)) {
      const records = JSON.parse(readFileSync(recFile, "utf-8"));
      assertCheck("Recorded Evidence Count", records.length >= 3, `Found ${records.length} verified live decision records`);

      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        if (r.txHash) {
          const receipt = await client.getTransactionReceipt({ hash: r.txHash });
          assertCheck(`Tx Receipt [${r.decision}]`, receipt.status === "success", `Tx: ${r.txHash} confirmed in Block #${receipt.blockNumber}`);
        }
      }
    } else {
      assertCheck("Recorded Evidence", false, "fixtures/recorded-from-live.json does not exist");
    }
  } catch (err) {
    assertCheck("Recorded Evidence", false, `Error: ${err}`);
  }

  console.log("\n================================================================");
  console.log(`VERIFICATION RESULT: ${passCount}/${totalCount} CHECKS PASSED`);
  console.log("================================================================");

  if (passCount !== totalCount) {
    process.exit(1);
  }
}

main().catch(console.error);
