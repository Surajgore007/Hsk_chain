/**
 * executor.ts — On-chain Transaction Executor for ExecutionGuard
 *
 * Implements:
 * 1. Building typed Intent struct.
 * 2. Simulating executeSwap via viem simulateContract before sending.
 * 3. Submitting transaction and waiting for confirmed receipt (status === "success").
 * 4. Decoding TradeExecuted and TradeRejected events.
 * 5. Gas-efficient recordRefusal calls.
 */

import {
  type PublicClient,
  type WalletClient,
  type Account,
  parseAbi,
  decodeEventLog,
  keccak256,
  toHex,
} from "viem";
import { computeIntentHash } from "./price.js";

export const EXECUTION_GUARD_ABI = parseAbi([
  "struct Intent { uint256 nonce; address tokenIn; address tokenOut; uint256 amountIn; uint256 quotedAmountOut; uint256 amountOutMin; uint256 quoteBlock; uint256 deadline; uint8 reasonCode; bytes32 rationaleHash; }",
  "function executeSwap(Intent calldata intent) external",
  "function recordRefusal(bytes32 intentHash, uint8 reasonCode, address tokenIn, address tokenOut, uint256 requestedAmountIn, uint256 maxSafeAmountIn, uint256 impactBpsAtRequested, uint256 quoteBlock, bytes32 rationaleHash) external",
  "function pause() external",
  "function unpause() external",
  "function paused() external view returns (bool)",
  "function lastTradeTime() external view returns (uint256)",
  "function usedNonce(uint256 nonce) external view returns (bool)",
  "function idealOutAtSpot(address tokenIn, uint256 amountIn) external view returns (uint256)",
  "event TradeExecuted(bytes32 indexed intentHash, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 quotedAmountOut, uint256 amountOutMin, uint8 reasonCode, bytes32 rationaleHash, uint256 blockNumber)",
  "event TradeRejected(bytes32 indexed intentHash, uint8 reasonCode, address tokenIn, address tokenOut, uint256 requestedAmountIn, uint256 maxSafeAmountIn, uint256 impactBpsAtRequested, uint256 quoteBlock, bytes32 rationaleHash)",
]);

export interface OnchainIntent {
  nonce: bigint;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: bigint;
  quotedAmountOut: bigint;
  amountOutMin: bigint;
  quoteBlock: bigint;
  deadline: bigint;
  reasonCode: number;
  rationaleHash: `0x${string}`;
}

export interface ExecutionSuccess {
  ok: true;
  intentHash: `0x${string}`;
  txHash: `0x${string}`;
  blockNumber: bigint;
  amountOut: bigint;
}

export interface ExecutionFailure {
  ok: false;
  intentHash: `0x${string}`;
  error: string;
}

export type ExecutionResult = ExecutionSuccess | ExecutionFailure;

export class OnchainExecutor {
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private account: Account;
  private guardAddress: `0x${string}`;
  private chainId: bigint;

  constructor(
    publicClient: PublicClient,
    walletClient: WalletClient,
    account: Account,
    guardAddress: `0x${string}`,
    chainId: bigint = 133n,
  ) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.account = account;
    this.guardAddress = guardAddress;
    this.chainId = chainId;
  }

  public async buildAndExecuteSwap(params: {
    nonce: bigint;
    tokenIn: `0x${string}`;
    tokenOut: `0x${string}`;
    amountIn: bigint;
    quotedAmountOut: bigint;
    amountOutMin: bigint;
    quoteBlock: bigint;
    deadlineSeconds?: number;
    reasonCode?: number;
    rationale?: string;
  }): Promise<ExecutionResult> {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + (params.deadlineSeconds || 300));
    const rationaleHash = params.rationale
      ? keccak256(toHex(params.rationale))
      : ("0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`);

    const intent: OnchainIntent = {
      nonce: params.nonce,
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountIn: params.amountIn,
      quotedAmountOut: params.quotedAmountOut,
      amountOutMin: params.amountOutMin,
      quoteBlock: params.quoteBlock,
      deadline,
      reasonCode: params.reasonCode ?? 0,
      rationaleHash,
    };

    const intentHash = computeIntentHash({
      chainId: this.chainId,
      guardAddress: this.guardAddress,
      nonce: intent.nonce,
      tokenIn: intent.tokenIn,
      tokenOut: intent.tokenOut,
      amountIn: intent.amountIn,
      quotedAmountOut: intent.quotedAmountOut,
      amountOutMin: intent.amountOutMin,
      quoteBlock: intent.quoteBlock,
      deadline: intent.deadline,
    });

    try {
      // 1. Simulate contract call first
      await this.publicClient.simulateContract({
        account: this.account,
        address: this.guardAddress,
        abi: EXECUTION_GUARD_ABI,
        functionName: "executeSwap",
        args: [intent],
      });

      // 2. Submit transaction with pending nonce & buffer
      const nonce = await this.publicClient.getTransactionCount({
        address: this.account.address,
        blockTag: "pending",
      });
      const gasPrice = await this.publicClient.getGasPrice();
      const txHash = await this.walletClient.writeContract({
        account: this.account,
        address: this.guardAddress,
        abi: EXECUTION_GUARD_ABI,
        functionName: "executeSwap",
        args: [intent],
        nonce,
        gasPrice: (gasPrice * 130n) / 100n,
        chain: null,
      });

      // 3. Await receipt
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") {
        return { ok: false, intentHash, error: "Transaction reverted on-chain" };
      }

      // 4. Extract amountOut from TradeExecuted event
      let amountOut = 0n;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: EXECUTION_GUARD_ABI,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === "TradeExecuted") {
            amountOut = (decoded.args as any).amountOut;
            break;
          }
        } catch {}
      }

      return {
        ok: true,
        intentHash,
        txHash,
        blockNumber: receipt.blockNumber,
        amountOut,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, intentHash, error: msg };
    }
  }

  public async recordRefusalOnchain(params: {
    intentHash: `0x${string}`;
    reasonCode: number;
    tokenIn: `0x${string}`;
    tokenOut: `0x${string}`;
    requestedAmountIn: bigint;
    maxSafeAmountIn: bigint;
    impactBpsAtRequested: bigint;
    quoteBlock: bigint;
    rationale?: string;
  }): Promise<{ ok: boolean; txHash?: `0x${string}`; error?: string }> {
    try {
      const rationaleHash = params.rationale
        ? keccak256(toHex(params.rationale))
        : ("0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`);

      const nonce = await this.publicClient.getTransactionCount({
        address: this.account.address,
        blockTag: "pending",
      });
      const gasPrice = await this.publicClient.getGasPrice();
      const txHash = await this.walletClient.writeContract({
        account: this.account,
        address: this.guardAddress,
        abi: EXECUTION_GUARD_ABI,
        functionName: "recordRefusal",
        args: [
          params.intentHash,
          params.reasonCode,
          params.tokenIn,
          params.tokenOut,
          params.requestedAmountIn,
          params.maxSafeAmountIn,
          params.impactBpsAtRequested,
          params.quoteBlock,
          rationaleHash,
        ],
        nonce,
        gasPrice: (gasPrice * 130n) / 100n,
        chain: null,
      });

      await this.publicClient.waitForTransactionReceipt({ hash: txHash });
      return { ok: true, txHash };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  public async emergencyStop(): Promise<{ ok: boolean; txHash?: `0x${string}`; error?: string }> {
    try {
      const nonce = await this.publicClient.getTransactionCount({
        address: this.account.address,
        blockTag: "pending",
      });
      const gasPrice = await this.publicClient.getGasPrice();
      const txHash = await this.walletClient.writeContract({
        account: this.account,
        address: this.guardAddress,
        abi: EXECUTION_GUARD_ABI,
        functionName: "pause",
        args: [],
        nonce,
        gasPrice: (gasPrice * 130n) / 100n,
        chain: null,
      });
      await this.publicClient.waitForTransactionReceipt({ hash: txHash });
      return { ok: true, txHash };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

