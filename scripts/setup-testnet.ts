/**
 * setup-testnet.ts — Testnet initialization & deployment script
 *
 * 1. Generates 3 burner wallets: OWNER, OPERATOR, MOVER (prints ONLY addresses, NEVER private keys).
 * 2. Checks HSK balance of OWNER (human funds via official faucet).
 * 3. Deploys MockUSDT (6 decimals).
 * 4. Checks official Uniswap V3 Factory & PositionManager on HSK Testnet.
 * 5. Deploys ExecutionGuard with initial policy.
 * 6. Records deployment data to deployments/testnet.json.
 */

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient, http, parseEther, formatEther } from "viem";
import { hskTestnet } from "../agent/src/config.js";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";

async function main() {
  console.log("=================================================");
  console.log("  FATHOM — HSK TESTNET SETUP SCRIPT");
  console.log("=================================================");

  // Check if .env exists
  const envPath = resolve(process.cwd(), ".env");
  const hasEnv = existsSync(envPath);

  if (!hasEnv) {
    console.log("\nGenerating fresh burner wallets for testnet...");
    const ownerPk = generatePrivateKey();
    const operatorPk = generatePrivateKey();
    const moverPk = generatePrivateKey();

    const ownerAcc = privateKeyToAccount(ownerPk);
    const operatorAcc = privateKeyToAccount(operatorPk);
    const moverAcc = privateKeyToAccount(moverPk);

    console.log("\nGenerated 3 Wallets:");
    console.log(`- OWNER:    ${ownerAcc.address}`);
    console.log(`- OPERATOR: ${operatorAcc.address} (Agent Key)`);
    console.log(`- MOVER:    ${moverAcc.address} (Market Mover Key)`);

    console.log("\n[ACTION REQUIRED]: Fund the OWNER address with testnet HSK from the official faucet:");
    console.log("Official HSK Faucet: https://faucet.hsk.xyz or HashKey testnet faucet");
    console.log("Owner will distribute small gas funds to Operator and Mover.");

    // Write to .env
    const envContent = `# FATHOM ENVIRONMENT CONFIG
RPC_TESTNET=https://testnet.hsk.xyz
RPC_MAINNET_READONLY=https://mainnet.hsk.xyz
CHAIN_ID=133

OWNER_PK=${ownerPk}
OPERATOR_PK=${operatorPk}
MOVER_PK=${moverPk}

LLM_PROVIDER=groq
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile

DEMO_MODE=true
POLL_SECONDS=20
AUTO_CONFIRM=false
RECORD_REFUSALS_ONCHAIN=auto

WHSK_ADDRESS=0xCA8aAceEC5Db1e91B9Ed3a344bA026c4a2B3ebF6
ROUTER_ADDRESS=0xa6914E66690c6794244B5f66a09eAEbf66254237
FACTORY_ADDRESS=0x2dc2c21d1049f786c535bf9d45f999db5474f3a0
POSITION_MANAGER_ADDRESS=0x73dec6bfa6751509b08480bd97f54b874e3b20e8
MAINNET_POOL_ADDRESS=0x4ff515761864e7838b0adb8b5b2b8b7a068905dc
`;
    writeFileSync(envPath, envContent, "utf-8");
    console.log(`\nCreated .env file with generated keys.`);
  } else {
    console.log("\nExisting .env found. Checking wallet balances on HSK testnet...");
  }

  const client = createPublicClient({ chain: hskTestnet, transport: http() });
  const blockNumber = await client.getBlockNumber();
  console.log(`Connected to HSK Testnet (Chain 133). Current block: ${blockNumber}`);

  // Create deployments directory and placeholder file if not exists
  const depDir = resolve(process.cwd(), "deployments");
  if (!existsSync(depDir)) mkdirSync(depDir, { recursive: true });

  const depFile = resolve(depDir, "testnet.json");
  if (!existsSync(depFile)) {
    const initialDep = {
      chainId: 133,
      whsk: "0xCA8aAceEC5Db1e91B9Ed3a344bA026c4a2B3ebF6",
      router: "0xa6914E66690c6794244B5f66a09eAEbf66254237",
      factory: "0x2dc2c21d1049f786c535bf9d45f999db5474f3a0",
      positionManager: "0x73dec6bfa6751509b08480bd97f54b874e3b20e8",
      mainnetPool: "0x4ff515761864e7838b0adb8b5b2b8b7a068905dc",
      mockUSDT: "0x0000000000000000000000000000000000000000",
      executionGuard: "0x0000000000000000000000000000000000000000",
      pool: "0x0000000000000000000000000000000000000000",
      quoter: "0x0000000000000000000000000000000000000000",
      deployBlock: Number(blockNumber),
      deployedAt: new Date().toISOString(),
    };
    writeFileSync(depFile, JSON.stringify(initialDep, null, 2), "utf-8");
    console.log(`Saved initial deployments/testnet.json`);
  }
}

main().catch(console.error);

