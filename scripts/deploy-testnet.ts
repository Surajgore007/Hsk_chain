/**
 * deploy-testnet.ts — Real On-Chain Testnet Deployment & Initialization
 *
 * Deploys MockUSDT, QuoterV2, initializes WHSK/tUSDT pool at 0.087534 USDT/WHSK,
 * adds wide-range liquidity, deploys ExecutionGuard, funds operator/mover/guard,
 * saves to deployments/testnet.json, and executes 1 tiny test swap.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseGwei,
  formatEther,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env") });

const RPC = process.env.RPC_TESTNET || "https://testnet.hsk.xyz";
const CHAIN_ID = 133;

const hskChain = {
  id: CHAIN_ID,
  name: "HashKey Chain Testnet",
  nativeCurrency: { name: "HashKey EcoPoints", symbol: "HSK", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};

const publicClient = createPublicClient({ chain: hskChain as any, transport: http() });

if (!process.env.OWNER_PK || !process.env.OPERATOR_PK || !process.env.MOVER_PK) {
  throw new Error("OWNER_PK, OPERATOR_PK, MOVER_PK must be set in .env");
}

const ownerAccount = privateKeyToAccount(process.env.OWNER_PK as `0x${string}`);
const operatorAccount = privateKeyToAccount(process.env.OPERATOR_PK as `0x${string}`);
const moverAccount = privateKeyToAccount(process.env.MOVER_PK as `0x${string}`);

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

const FACTORY_ABI = parseAbi([
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
  "function createPool(address tokenA, address tokenB, uint24 fee) external returns (address pool)",
]);

const POOL_ABI = parseAbi([
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function initialize(uint160 sqrtPriceX96) external",
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
  "function policy() external view returns (uint16 maxTradeBps, uint128 dailyCapQuote, uint16 maxImpactBps, uint16 maxSlippageBps, uint16 feeBps, uint16 maxQuoteAgeBlocks, uint32 cooldownSeconds)",
  "function usedNonce(uint256 nonce) external view returns (bool)",
]);

async function loadArtifact(pathRelative: string) {
  const full = resolve(process.cwd(), pathRelative);
  return JSON.parse(readFileSync(full, "utf-8"));
}

async function sendTx(wallet: any, txReq: any, desc: string): Promise<`0x${string}`> {
  console.log(`-> Sending: ${desc}...`);
  const gasPrice = await publicClient.getGasPrice();
  // Buffer gas price by 20% to avoid underpriced transaction errors
  const bufferedGasPrice = (gasPrice * 120n) / 100n;
  const hash = await wallet.sendTransaction({
    ...txReq,
    gasPrice: bufferedGasPrice,
  });
  console.log(`   Tx submitted: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Tx failed: ${desc} (hash: ${hash})`);
  }
  console.log(`   Confirmed in block ${receipt.blockNumber} (gasUsed: ${receipt.gasUsed})`);
  return hash;
}

async function main() {
  console.log("=================================================================");
  console.log("  DEPTHGUARD — REAL ON-CHAIN TESTNET DEPLOYMENT");
  console.log("=================================================================\n");

  const ownerBal = await publicClient.getBalance({ address: ownerAccount.address });
  console.log(`OWNER:    ${ownerAccount.address} | Balance: ${formatEther(ownerBal)} HSK`);
  console.log(`OPERATOR: ${operatorAccount.address}`);
  console.log(`MOVER:    ${moverAccount.address}`);

  if (ownerBal < parseGwei("50000000")) { // 0.05 HSK
    throw new Error(`Insufficient OWNER balance: ${formatEther(ownerBal)} HSK. Minimum required: 0.05 HSK`);
  }

  const deployTxHashes: Record<string, string> = {};

  // 1. Deploy MockUSDT
  console.log("\n[1/9] Deploying MockUSDT (6 decimals)...");
  const mockUsdtArtifact = await loadArtifact("contracts/out/MockUSDT.sol/MockUSDT.json");
  const deployMockUsdtTx = await ownerWallet.deployContract({
    abi: mockUsdtArtifact.abi,
    bytecode: mockUsdtArtifact.bytecode.object,
    args: ["Mock USDT", "tUSDT", 6],
  });
  console.log(`   Tx: ${deployMockUsdtTx}`);
  const receiptUsdt = await publicClient.waitForTransactionReceipt({ hash: deployMockUsdtTx });
  const mockUsdtAddress = receiptUsdt.contractAddress!;
  deployTxHashes.mockUSDT = deployMockUsdtTx;
  console.log(`   MockUSDT deployed at: ${mockUsdtAddress}`);

  // 2. Deploy QuoterV2
  console.log("\n[2/9] Deploying QuoterV2 pointing to Factory & WETH9...");
  const quoterArtifact = await loadArtifact("contracts/out/QuoterV2.sol/QuoterV2.json");
  const deployQuoterTx = await ownerWallet.deployContract({
    abi: quoterArtifact.abi,
    bytecode: quoterArtifact.bytecode.object,
    args: [FACTORY_ADDRESS, WHSK_ADDRESS],
  });
  console.log(`   Tx: ${deployQuoterTx}`);
  const receiptQuoter = await publicClient.waitForTransactionReceipt({ hash: deployQuoterTx });
  const quoterAddress = receiptQuoter.contractAddress!;
  deployTxHashes.quoter = deployQuoterTx;
  console.log(`   QuoterV2 deployed at: ${quoterAddress}`);

  // 3. Create or Locate Pool on Factory
  console.log("\n[3/9] Creating / Locating Uniswap V3 Pool (fee = 3000)...");
  let poolAddress = await publicClient.readContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: "getPool",
    args: [WHSK_ADDRESS, mockUsdtAddress, 3000],
  });

  if (poolAddress === "0x0000000000000000000000000000000000000000") {
    const createPoolHash = await ownerWallet.writeContract({
      address: FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: "createPool",
      args: [WHSK_ADDRESS, mockUsdtAddress, 3000],
    });
    console.log(`   Create pool tx: ${createPoolHash}`);
    await publicClient.waitForTransactionReceipt({ hash: createPoolHash });
    deployTxHashes.createPool = createPoolHash;

    poolAddress = await publicClient.readContract({
      address: FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: "getPool",
      args: [WHSK_ADDRESS, mockUsdtAddress, 3000],
    });
  }
  console.log(`   Pool address: ${poolAddress}`);

  // Sort tokens
  const token0IsBase = WHSK_ADDRESS.toLowerCase() < mockUsdtAddress.toLowerCase();
  const token0 = token0IsBase ? WHSK_ADDRESS : mockUsdtAddress;
  const token1 = token0IsBase ? mockUsdtAddress : WHSK_ADDRESS;

  // SqrtPriceX96 corresponding to 0.087534 USDT / WHSK
  // If token0 = WHSK, sqrtPriceX96 = 23440559369646041157550
  // If token0 = MockUSDT, sqrtPriceX96 = 2^192 / 23440559369646041157550 = 267788052170594029335402890420021020
  const Q192 = 2n ** 192n;
  const sqrtPriceX96 = token0IsBase ? 23440559369646041157550n : Q192 / 23440559369646041157550n;

  // 4. Initialize Pool if uninitialized
  const slot0 = await publicClient.readContract({
    address: poolAddress,
    abi: POOL_ABI,
    functionName: "slot0",
  });

  if (slot0[0] === 0n) {
    console.log(`\n[4/9] Initializing Pool with sqrtPriceX96 = ${sqrtPriceX96}...`);
    const initHash = await ownerWallet.writeContract({
      address: poolAddress,
      abi: POOL_ABI,
      functionName: "initialize",
      args: [sqrtPriceX96],
    });
    console.log(`   Initialize tx: ${initHash}`);
    await publicClient.waitForTransactionReceipt({ hash: initHash });
    deployTxHashes.initializePool = initHash;
  } else {
    console.log(`\n[4/9] Pool already initialized (sqrtPriceX96 = ${slot0[0]})`);
  }

  // Set observation cardinality
  try {
    const cardHash = await ownerWallet.writeContract({
      address: poolAddress,
      abi: POOL_ABI,
      functionName: "increaseObservationCardinalityNext",
      args: [30],
    });
    await publicClient.waitForTransactionReceipt({ hash: cardHash });
    deployTxHashes.cardinality = cardHash;
  } catch {}

  // 5. Wrap HSK into WHSK & Mint MockUSDT
  console.log("\n[5/9] Wrapping 0.02 HSK into WHSK & Minting MockUSDT...");
  const wrapHash = await ownerWallet.writeContract({
    address: WHSK_ADDRESS,
    abi: WHSK_ABI,
    functionName: "deposit",
    value: 20000000000000000n, // 0.02 HSK
  });
  await publicClient.waitForTransactionReceipt({ hash: wrapHash });
  deployTxHashes.wrapWHSK = wrapHash;

  // Mint 50,000 micro-USDT (0.05 USDT) to owner
  const mintUsdtHash = await ownerWallet.writeContract({
    address: mockUsdtAddress,
    abi: ERC20_ABI,
    functionName: "mint",
    args: [ownerAccount.address, 50000n],
  });
  await publicClient.waitForTransactionReceipt({ hash: mintUsdtHash });
  deployTxHashes.mintMockUSDT = mintUsdtHash;

  // 6. Provide Wide-Range Liquidity via NonfungiblePositionManager
  console.log("\n[6/9] Seeding Pool Liquidity via PositionManager...");
  // Pool liquidity: 0.018 WHSK + ~1,575 micro-USDT
  const whskLiq = 18000000000000000n; // 0.018 WHSK
  const usdtLiq = 1575n;               // 1,575 micro-USDT

  const approveWhskHash = await ownerWallet.writeContract({
    address: WHSK_ADDRESS,
    abi: WHSK_ABI,
    functionName: "approve",
    args: [POSITION_MANAGER_ADDRESS, whskLiq * 2n],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveWhskHash });

  const approveUsdtHash = await ownerWallet.writeContract({
    address: mockUsdtAddress,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [POSITION_MANAGER_ADDRESS, usdtLiq * 2n],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveUsdtHash });

  const amount0Desired = token0IsBase ? whskLiq : usdtLiq;
  const amount1Desired = token0IsBase ? usdtLiq : whskLiq;

  const mintLiqHash = await ownerWallet.writeContract({
    address: POSITION_MANAGER_ADDRESS,
    abi: POSITION_MGR_ABI,
    functionName: "mint",
    args: [
      {
        token0,
        token1,
        fee: 3000,
        tickLower: -887220,
        tickUpper: 887220,
        amount0Desired,
        amount1Desired,
        amount0Min: 0n,
        amount1Min: 0n,
        recipient: ownerAccount.address,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 600),
      },
    ],
  });
  console.log(`   Mint liquidity tx: ${mintLiqHash}`);
  const receiptMint = await publicClient.waitForTransactionReceipt({ hash: mintLiqHash });
  deployTxHashes.mintLiquidity = mintLiqHash;

  // 7. Deploy ExecutionGuard
  console.log("\n[7/9] Deploying ExecutionGuard...");
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
  });
  console.log(`   Tx: ${deployGuardTx}`);
  const receiptGuard = await publicClient.waitForTransactionReceipt({ hash: deployGuardTx });
  const guardAddress = receiptGuard.contractAddress!;
  deployTxHashes.executionGuard = deployGuardTx;
  console.log(`   ExecutionGuard deployed at: ${guardAddress}`);

  // 8. Fund Operator, Mover, and Guard Balances
  console.log("\n[8/9] Funding Operator & Mover gas + ExecutionGuard vault balance...");
  // Send 0.008 HSK to OPERATOR
  const fundOpHash = await ownerWallet.sendTransaction({
    to: operatorAccount.address,
    value: 8000000000000000n, // 0.008 HSK
  });
  await publicClient.waitForTransactionReceipt({ hash: fundOpHash });
  deployTxHashes.fundOperator = fundOpHash;

  // Send 0.008 HSK to MOVER
  const fundMoverHash = await ownerWallet.sendTransaction({
    to: moverAccount.address,
    value: 8000000000000000n, // 0.008 HSK
  });
  await publicClient.waitForTransactionReceipt({ hash: fundMoverHash });
  deployTxHashes.fundMover = fundMoverHash;

  // Fund Guard with 0.00063 WHSK (~3.5% of 0.018 WHSK pool reserve)
  const guardWhsk = 630000000000000n; // 0.00063 WHSK
  const fundGuardWhskHash = await ownerWallet.writeContract({
    address: WHSK_ADDRESS,
    abi: WHSK_ABI,
    functionName: "transfer",
    args: [guardAddress, guardWhsk],
  });
  await publicClient.waitForTransactionReceipt({ hash: fundGuardWhskHash });

  // Fund Guard with 55 micro-USDT (~3.5% of 1,575 micro-USDT pool reserve)
  const guardUsdt = 55n;
  const fundGuardUsdtHash = await ownerWallet.writeContract({
    address: mockUsdtAddress,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [guardAddress, guardUsdt],
  });
  await publicClient.waitForTransactionReceipt({ hash: fundGuardUsdtHash });

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

  const depDir = resolve(process.cwd(), "deployments");
  if (!existsSync(depDir)) mkdirSync(depDir, { recursive: true });
  writeFileSync(resolve(depDir, "testnet.json"), JSON.stringify(depData, null, 2), "utf-8");
  console.log(`\nSaved testnet deployment info to deployments/testnet.json`);

  // 9. Execute One Tiny Real Swap to Prove Path Works
  console.log("\n[9/9] Executing 1 Tiny Test Swap through ExecutionGuard...");
  // OPERATOR executes swap: sell 0.00005 WHSK (50_000_000_000_000 wei)
  const swapAmountIn = 50000000000000n; // 0.00005 WHSK
  const idealQuote = await publicClient.readContract({
    address: guardAddress,
    abi: GUARD_ABI,
    functionName: "idealOutAtSpot",
    args: [WHSK_ADDRESS, swapAmountIn],
  });
  console.log(`   idealOutAtSpot for 0.00005 WHSK: ${idealQuote} micro-USDT`);

  // Floor is 9860 bps (1.4% max deduction)
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

  const swapTxHash = await operatorWallet.writeContract({
    address: guardAddress,
    abi: GUARD_ABI,
    functionName: "executeSwap",
    args: [testIntent],
  });
  console.log(`   executeSwap Tx Submitted: ${swapTxHash}`);
  const receiptSwap = await publicClient.waitForTransactionReceipt({ hash: swapTxHash });
  console.log(`   executeSwap Confirmed in block ${receiptSwap.blockNumber}! Status: ${receiptSwap.status}`);

  depData.deployTxHashes.testSwap = swapTxHash;
  writeFileSync(resolve(depDir, "testnet.json"), JSON.stringify(depData, null, 2), "utf-8");

  const finalOwnerBal = await publicClient.getBalance({ address: ownerAccount.address });
  console.log(`\nFinal OWNER Balance: ${formatEther(finalOwnerBal)} HSK`);
  console.log(`Explorer Link: https://testnet-explorer.hsk.xyz/tx/${swapTxHash}`);
  console.log("=================================================================");
  console.log("  DEPLOYMENT & VERIFICATION COMPLETE!");
  console.log("=================================================================\n");
}

main().catch((err) => {
  console.error("\nFATAL ERROR DURING DEPLOYMENT:", err);
  process.exit(1);
});

