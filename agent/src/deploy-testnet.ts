/**
 * deploy-testnet.ts — Real On-Chain Testnet Deployment & Initialization
 *
 * Confirmed deployments:
 * - MockUSDT: 0x721e7fa9fb2446be07ab4a708254f4adcb70e4cf (tx: 0x6ff37f0327dafcefb5cc11401dfa9e1ac023d35c2decafab407c4733963b4c8c)
 * - QuoterV2: 0x5a850f9b26e01c0a10d0b3104e15f2bcd4889070 (tx: 0xa2effd49b5ad6364f8d5164ae6a7e5d68d01e4dcf38c4e9508aeba3077915b79)
 * - Pool:     0xe0f494ef52eacebb42cdb11a03a2e9e43fbfdfaf (tx: 0x0acd86d38ffe04c117cee7bd8a2c52b02dde9b134b56d551322788e679454668)
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  formatEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { config } from "dotenv";

const rootDir = existsSync(resolve(process.cwd(), "contracts"))
  ? process.cwd()
  : resolve(process.cwd(), "..");

config({ path: resolve(rootDir, ".env") });

const RPC = process.env.RPC_TESTNET || "https://testnet.hsk.xyz";
const CHAIN_ID = 133;

const hskChain = {
  id: CHAIN_ID,
  name: "HashKey Chain Testnet",
  nativeCurrency: { name: "HashKey EcoPoints", symbol: "HSK", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};

const publicClient = createPublicClient({ chain: hskChain as any, transport: http() });

const cleanPk = (pk?: string): `0x${string}` => {
  if (!pk) throw new Error("Missing PK");
  let trimmed = pk.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed.startsWith("0x")) trimmed = "0x" + trimmed;
  return trimmed as `0x${string}`;
};

const ownerAccount = privateKeyToAccount(cleanPk(process.env.OWNER_PK));
const operatorAccount = privateKeyToAccount(cleanPk(process.env.OPERATOR_PK));
const moverAccount = privateKeyToAccount(cleanPk(process.env.MOVER_PK));

const ownerWallet = createWalletClient({
  account: ownerAccount,
  chain: hskChain as any,
  transport: http(),
});

const operatorWallet = createWalletClient({
  account: operatorAccount,
  chain: hskChain as any,
  transport: http(),
});

const WHSK_ADDRESS = (process.env.WHSK_ADDRESS || "0xCA8aAceEC5Db1e91B9Ed3a344bA026c4a2B3ebF6") as `0x${string}`;
const ROUTER_ADDRESS = (process.env.ROUTER_ADDRESS || "0xa6914E66690c6794244B5f66a09eAEbf66254237") as `0x${string}`;
const FACTORY_ADDRESS = (process.env.FACTORY_ADDRESS || "0x2dC2c21D1049F786C535bF9d45F999dB5474f3A0") as `0x${string}`;
const POSITION_MANAGER_ADDRESS = (process.env.POSITION_MANAGER_ADDRESS || "0x73dEc6bfa6751509b08480bd97f54b874E3b20e8") as `0x${string}`;
const MAINNET_POOL_ADDRESS = (process.env.MAINNET_POOL_ADDRESS || "0x4ff515761864e7838b0adb8b5b2b8b7a068905dc") as `0x${string}`;

const mockUsdtAddress = "0x721e7fa9fb2446be07ab4a708254f4adcb70e4cf" as `0x${string}`;
const quoterAddress = "0x5a850f9b26e01c0a10d0b3104e15f2bcd4889070" as `0x${string}`;
const poolAddress = "0xe0f494ef52eacebb42cdb11a03a2e9e43fbfdfaf" as `0x${string}`;

const WHSK_ABI = parseAbi([
  "function deposit() external payable",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
]);

const ERC20_ABI = parseAbi([
  "function mint(address to, uint256 amount) external",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
]);

const POOL_ABI = parseAbi([
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function increaseObservationCardinalityNext(uint16 observationCardinalityNext) external",
]);

const POSITION_MGR_ABI = parseAbi([
  "struct MintParams { address token0; address token1; uint24 fee; int24 tickLower; int24 tickUpper; uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min; address recipient; uint256 deadline; }",
  "function mint(MintParams calldata params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
]);

const GUARD_ABI = parseAbi([
  "struct Intent { uint256 nonce; address tokenIn; address tokenOut; uint256 amountIn; uint256 quotedAmountOut; uint256 amountOutMin; uint256 quoteBlock; uint256 deadline; uint8 reasonCode; bytes32 rationaleHash; }",
  "function executeSwap(Intent calldata intent) external",
  "function idealOutAtSpot(address tokenIn, uint256 amountIn) external view returns (uint256)",
  "function getPolicy() external view returns (uint16 maxTradeBps, uint128 dailyCapQuote, uint16 maxImpactBps, uint16 maxSlippageBps, uint16 feeBps, uint16 maxQuoteAgeBlocks, uint32 cooldownSeconds)",
  "function usedNonce(uint256 nonce) external view returns (bool)",
]);

async function loadArtifact(pathRelative: string) {
  const full = resolve(rootDir, pathRelative);
  return JSON.parse(readFileSync(full, "utf-8"));
}

async function execOwnerTx(actionName: string, writeFn: (nonce: number, gasPrice: bigint) => Promise<`0x${string}`>) {
  console.log(`-> ${actionName}...`);
  const [nonce, gasPrice] = await Promise.all([
    publicClient.getTransactionCount({ address: ownerAccount.address, blockTag: "pending" }),
    publicClient.getGasPrice(),
  ]);
  const bufferedGasPrice = (gasPrice * 130n) / 100n;
  const hash = await writeFn(nonce, bufferedGasPrice);
  console.log(`   Submitted: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`   Confirmed in block ${receipt.blockNumber} (status: ${receipt.status})`);
  await new Promise((r) => setTimeout(r, 2000));
  return hash;
}

async function main() {
  console.log("=================================================================");
  console.log("  FATHOM — REAL ON-CHAIN TESTNET DEPLOYMENT (STAGE 2)");
  console.log("=================================================================\n");

  const ownerBal = await publicClient.getBalance({ address: ownerAccount.address });
  console.log(`OWNER:    ${ownerAccount.address} | Balance: ${formatEther(ownerBal)} HSK`);
  console.log(`MockUSDT: ${mockUsdtAddress}`);
  console.log(`QuoterV2: ${quoterAddress}`);
  console.log(`Pool:     ${poolAddress}`);

  const deployTxHashes: Record<string, string> = {
    mockUSDT: "0x6ff37f0327dafcefb5cc11401dfa9e1ac023d35c2decafab407c4733963b4c8c",
    quoter: "0xa2effd49b5ad6364f8d5164ae6a7e5d68d01e4dcf38c4e9508aeba3077915b79",
    createAndInitializePool: "0x0acd86d38ffe04c117cee7bd8a2c52b02dde9b134b56d551322788e679454668",
  };

  // Check if cardinality needs to be set
  try {
    const cardHash = await execOwnerTx("Setting pool cardinality to 30", (nonce, gasPrice) =>
      ownerWallet.writeContract({
        address: poolAddress,
        abi: POOL_ABI,
        functionName: "increaseObservationCardinalityNext",
        args: [30],
        nonce,
        gasPrice,
      })
    );
    deployTxHashes.cardinality = cardHash;
  } catch {
    console.log("   Cardinality already set or skipped");
  }

  // 1. Wrap 0.02 HSK to WHSK
  const wrapHash = await execOwnerTx("Wrapping 0.02 HSK -> WHSK", (nonce, gasPrice) =>
    ownerWallet.writeContract({
      address: WHSK_ADDRESS,
      abi: WHSK_ABI,
      functionName: "deposit",
      value: 20000000000000000n, // 0.02 HSK
      nonce,
      gasPrice,
    })
  );
  deployTxHashes.wrapWHSK = wrapHash;

  // 2. Mint MockUSDT (100,000 micro-USDT)
  const mintUsdtHash = await execOwnerTx("Minting 100,000 micro-USDT to OWNER", (nonce, gasPrice) =>
    ownerWallet.writeContract({
      address: mockUsdtAddress,
      abi: ERC20_ABI,
      functionName: "mint",
      args: [ownerAccount.address, 100000n],
      nonce,
      gasPrice,
    })
  );
  deployTxHashes.mintMockUSDT = mintUsdtHash;

  // 3. Approve and Mint Liquidity via PositionManager
  const whskLiq = 18000000000000000n; // 0.018 WHSK
  const usdtLiq = 1575n;               // 1,575 micro-USDT

  await execOwnerTx("Approving WHSK to PositionManager", (nonce, gasPrice) =>
    ownerWallet.writeContract({
      address: WHSK_ADDRESS,
      abi: WHSK_ABI,
      functionName: "approve",
      args: [POSITION_MANAGER_ADDRESS, whskLiq * 2n],
      nonce,
      gasPrice,
    })
  );

  await execOwnerTx("Approving MockUSDT to PositionManager", (nonce, gasPrice) =>
    ownerWallet.writeContract({
      address: mockUsdtAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [POSITION_MANAGER_ADDRESS, usdtLiq * 2n],
      nonce,
      gasPrice,
    })
  );

  // In pool: token0 = MockUSDT (0x721e...), token1 = WHSK (0xCA8a...)
  const mintLiqHash = await execOwnerTx("Minting Wide-Range Liquidity via PositionManager", (nonce, gasPrice) =>
    ownerWallet.writeContract({
      address: POSITION_MANAGER_ADDRESS,
      abi: POSITION_MGR_ABI,
      functionName: "mint",
      args: [
        {
          token0: mockUsdtAddress,
          token1: WHSK_ADDRESS,
          fee: 3000,
          tickLower: -887220,
          tickUpper: 887220,
          amount0Desired: usdtLiq,
          amount1Desired: whskLiq,
          amount0Min: 0n,
          amount1Min: 0n,
          recipient: ownerAccount.address,
          deadline: BigInt(Math.floor(Date.now() / 1000) + 600),
        },
      ],
      nonce,
      gasPrice,
    })
  );
  deployTxHashes.mintLiquidity = mintLiqHash;

  // 4. Deploy ExecutionGuard
  console.log("\n-> Deploying ExecutionGuard contract...");
  const guardArtifact = await loadArtifact("contracts/out/ExecutionGuard.sol/ExecutionGuard.json");
  const initialPolicy = {
    maxTradeBps: 2500, // 25% max of guard balance
    dailyCapQuote: 100_000n * 10n ** 6n,
    maxImpactBps: 60,  // 60 bps budget ceiling
    maxSlippageBps: 50,
    feeBps: 30,
    maxQuoteAgeBlocks: 5,
    cooldownSeconds: 20,
  };

  const guardNonce = await publicClient.getTransactionCount({ address: ownerAccount.address, blockTag: "pending" });
  const guardGasPrice = (await publicClient.getGasPrice()) * 130n / 100n;
  const deployGuardTx = await ownerWallet.deployContract({
    abi: guardArtifact.abi,
    bytecode: guardArtifact.bytecode.object,
    args: [
      ROUTER_ADDRESS,
      poolAddress,
      WHSK_ADDRESS,
      mockUsdtAddress,
      3000,
      operatorAccount.address,
      initialPolicy,
    ],
    nonce: guardNonce,
    gasPrice: guardGasPrice,
  });
  console.log(`   ExecutionGuard Deploy Tx: ${deployGuardTx}`);
  const receiptGuard = await publicClient.waitForTransactionReceipt({ hash: deployGuardTx });
  const guardAddress = receiptGuard.contractAddress!;
  deployTxHashes.executionGuard = deployGuardTx;
  console.log(`   ExecutionGuard deployed at: ${guardAddress}`);
  await new Promise((r) => setTimeout(r, 2000));

  // 5. Fund Operator, Mover, and Guard Balances
  const fundOpHash = await execOwnerTx("Funding OPERATOR gas (0.008 HSK)", (nonce, gasPrice) =>
    ownerWallet.sendTransaction({
      to: operatorAccount.address,
      value: 8000000000000000n, // 0.008 HSK
      nonce,
      gasPrice,
    })
  );
  deployTxHashes.fundOperator = fundOpHash;

  const fundMoverHash = await execOwnerTx("Funding MOVER gas (0.008 HSK)", (nonce, gasPrice) =>
    ownerWallet.sendTransaction({
      to: moverAccount.address,
      value: 8000000000000000n, // 0.008 HSK
      nonce,
      gasPrice,
    })
  );
  deployTxHashes.fundMover = fundMoverHash;

  // Fund Guard with 0.00063 WHSK (~3.5% of pool base reserve)
  const guardWhsk = 630000000000000n;
  const fundWhskHash = await execOwnerTx("Funding Guard with 0.00063 WHSK", (nonce, gasPrice) =>
    ownerWallet.writeContract({
      address: WHSK_ADDRESS,
      abi: WHSK_ABI,
      functionName: "transfer",
      args: [guardAddress, guardWhsk],
      nonce,
      gasPrice,
    })
  );
  deployTxHashes.fundGuardWhsk = fundWhskHash;

  // Fund Guard with 55 micro-USDT (~3.5% of pool quote reserve)
  const guardUsdt = 55n;
  const fundUsdtHash = await execOwnerTx("Funding Guard with 55 micro-USDT", (nonce, gasPrice) =>
    ownerWallet.writeContract({
      address: mockUsdtAddress,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [guardAddress, guardUsdt],
      nonce,
      gasPrice,
    })
  );
  deployTxHashes.fundGuardUsdt = fundUsdtHash;

  // Save deployments/testnet.json
  const currentBlock = await publicClient.getBlockNumber();
  const depData = {
    chainId: CHAIN_ID,
    whsk: WHSK_ADDRESS,
    mockUSDT: mockUsdtAddress,
    router: ROUTER_ADDRESS,
    factory: FACTORY_ADDRESS,
    positionManager: POSITION_MANAGER_ADDRESS,
    mainnetPool: MAINNET_POOL_ADDRESS,
    pool: poolAddress,
    quoter: quoterAddress,
    executionGuard: guardAddress,
    owner: ownerAccount.address,
    operator: operatorAccount.address,
    mover: moverAccount.address,
    deployBlock: Number(currentBlock),
    deployedAt: new Date().toISOString(),
    deployTxHashes,
  };

  const depDir = resolve(rootDir, "deployments");
  if (!existsSync(depDir)) mkdirSync(depDir, { recursive: true });
  writeFileSync(resolve(depDir, "testnet.json"), JSON.stringify(depData, null, 2), "utf-8");
  console.log(`\nSaved testnet deployment info to deployments/testnet.json`);

  // 6. Execute One Tiny Real Swap through ExecutionGuard (OPERATOR)
  console.log("\n-> Executing 1 Tiny Test Swap through ExecutionGuard...");
  const swapAmountIn = 50000000000000n; // 0.00005 WHSK
  const idealQuote = await publicClient.readContract({
    address: guardAddress,
    abi: GUARD_ABI,
    functionName: "idealOutAtSpot",
    args: [WHSK_ADDRESS, swapAmountIn],
  });
  console.log(`   idealOutAtSpot for 0.00005 WHSK: ${idealQuote} micro-USDT`);

  const amountOutMin = (idealQuote * 9860n) / 10000n;
  const quoteBlock = await publicClient.getBlockNumber();
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

  const testIntent = {
    nonce: 1n,
    tokenIn: WHSK_ADDRESS,
    tokenOut: mockUsdtAddress,
    amountIn: swapAmountIn,
    quotedAmountOut: idealQuote,
    amountOutMin: amountOutMin > 0n ? amountOutMin : 1n,
    quoteBlock,
    deadline,
    reasonCode: 0,
    rationaleHash: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
  };

  const opNonce = await publicClient.getTransactionCount({ address: operatorAccount.address, blockTag: "pending" });
  const opGasPrice = (await publicClient.getGasPrice()) * 130n / 100n;
  const swapTxHash = await operatorWallet.writeContract({
    address: guardAddress,
    abi: GUARD_ABI,
    functionName: "executeSwap",
    args: [testIntent],
    nonce: opNonce,
    gasPrice: opGasPrice,
  });
  console.log(`   executeSwap Tx Submitted: ${swapTxHash}`);
  const receiptSwap = await publicClient.waitForTransactionReceipt({ hash: swapTxHash });
  console.log(`   executeSwap Confirmed in block ${receiptSwap.blockNumber}! Status: ${receiptSwap.status}`);

  depData.deployTxHashes.testSwap = swapTxHash;
  writeFileSync(resolve(depDir, "testnet.json"), JSON.stringify(depData, null, 2), "utf-8");

  const finalOwnerBal = await publicClient.getBalance({ address: ownerAccount.address });
  const finalOpBal = await publicClient.getBalance({ address: operatorAccount.address });
  const finalMoverBal = await publicClient.getBalance({ address: moverAccount.address });

  console.log(`\nFinal Balances:`);
  console.log(`- OWNER:    ${formatEther(finalOwnerBal)} HSK`);
  console.log(`- OPERATOR: ${formatEther(finalOpBal)} HSK`);
  console.log(`- MOVER:    ${formatEther(finalMoverBal)} HSK`);
  console.log(`Explorer Link: https://testnet-explorer.hsk.xyz/tx/${swapTxHash}`);
  console.log("=================================================================");
  console.log("  DEPLOYMENT & VERIFICATION COMPLETE!");
  console.log("=================================================================\n");
}

main().catch((err) => {
  console.error("\nFATAL ERROR DURING DEPLOYMENT:", err);
  process.exit(1);
});
