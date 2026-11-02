import { describe, it, expect } from "vitest";
import { computeIntentHash } from "../src/price.js";
import { keccak256, encodeAbiParameters, parseAbiParameters } from "viem";

describe("Intent Hash Parity with ExecutionGuard.sol", () => {
  it("produces identical hash matching Solidity keccak256(abi.encode(...))", () => {
    const params = {
      chainId: 133n,
      guardAddress: "0x8a8E4a10F57C53e194ebE3e2683045ad7F2EC2FC" as `0x${string}`,
      nonce: 42n,
      tokenIn: "0xCA8aAceEC5Db1e91B9Ed3a344bA026c4a2B3ebF6" as `0x${string}`,
      tokenOut: "0x5BaFcc0c93EcD8022925D7fd89da1C6250850E19" as `0x${string}`,
      amountIn: 10n ** 18n,
      quotedAmountOut: 87n * (10n ** 6n),
      amountOutMin: 86n * (10n ** 6n),
      quoteBlock: 140000n,
      deadline: 1793520000n,
    };

    const hash = computeIntentHash(params);
    expect(hash).toMatch(/^0x[a-f0-9]{64}$/i);

    // Direct re-encoding check with exact ABI parameter layout
    const manualEncoding = encodeAbiParameters(
      parseAbiParameters(
        "uint256 chainId, address guard, uint256 nonce, address tokenIn, address tokenOut, uint256 amountIn, uint256 quotedAmountOut, uint256 amountOutMin, uint256 quoteBlock, uint256 deadline"
      ),
      [
        params.chainId,
        params.guardAddress,
        params.nonce,
        params.tokenIn,
        params.tokenOut,
        params.amountIn,
        params.quotedAmountOut,
        params.amountOutMin,
        params.quoteBlock,
        params.deadline,
      ]
    );

    expect(hash).toBe(keccak256(manualEncoding));
  });
});

