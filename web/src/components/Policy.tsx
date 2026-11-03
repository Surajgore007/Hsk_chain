import React from "react";
import { ExternalLink, ShieldCheck, Lock } from "lucide-react";
import type { AppState } from "../types";

interface Props {
  state: AppState | null;
}

export const Policy: React.FC<Props> = ({ state }) => {
  const dep = state?.deployments || {};

  const contracts = [
    { name: "ExecutionGuard (Vault)", address: dep.executionGuard || "0x8a8E4a10F57C53e194ebE3e2683045ad7F2EC2FC", desc: "Non-custodial trading vault enforcing policy & spot floors" },
    { name: "HSKSwap SwapRouter02", address: dep.router || "0xa6914E66690c6794244B5f66a09eAEbf66254237", desc: "Official HSKSwap Uniswap-V3 router fork on HSK Testnet" },
    { name: "WHSK (Base Token)", address: dep.whsk || "0xCA8aAceEC5Db1e91B9Ed3a344bA026c4a2B3ebF6", desc: "Wrapped HSK (18 decimals)" },
    { name: "tUSDT (Quote Token)", address: dep.mockUSDT || "0x5BaFcc0c93EcD8022925D7fd89da1C6250850E19", desc: "HSK Testnet USDT stablecoin (6 decimals)" },
    { name: "UniswapV3Factory", address: dep.factory || "0x2dc2c21d1049f786c535bf9d45f999db5474f3a0", desc: "HSKSwap V3 Pool Factory" },
    { name: "Mainnet WHSK/USDT Pool", address: dep.mainnetPool || "0x4ff515761864e7838b0adb8b5b2b8b7a068905dc", desc: "Chain 177 Read-only reference price pool (slot0)" },
  ];

  return (
    <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/40 shadow-soft p-5 space-y-4">
      <div>
        <h3 className="font-headline text-sm font-semibold text-on-surface">
          On-Chain Policy & Verified Contracts
        </h3>
        <p className="font-body text-xs text-on-surface-variant">
          Hard ceilings enforced at the smart contract level
        </p>
      </div>

      {/* Policy Limits */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4 space-y-2.5 text-xs">
        <div className="flex justify-between items-center">
          <span className="text-on-surface-variant">Max Price Impact Budget:</span>
          <span className="font-mono font-bold text-on-surface">
            {state?.riskConfig?.impactBudgetBps ?? 60} bps (Ceiling: 150 bps)
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-on-surface-variant">Max Slippage Allowance:</span>
          <span className="font-mono font-bold text-on-surface">
            {state?.riskConfig?.slippageBps ?? 50} bps (Ceiling: 100 bps)
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-on-surface-variant">Max Per-Trade Balance Size:</span>
          <span className="font-mono font-bold text-on-surface">
            {state?.riskConfig?.maxTradePercent ?? 10}% (Ceiling: 50%)
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-on-surface-variant">Cooldown Between Swaps:</span>
          <span className="font-mono font-bold text-on-surface">
            {state?.riskConfig?.cooldownSeconds ?? 60} seconds
          </span>
        </div>
        <div className="flex justify-between items-center pt-1 border-t border-outline-variant/20">
          <span className="text-on-surface-variant">Operator Privileges:</span>
          <span className="font-mono text-[11px] font-bold text-primary bg-secondary-container px-2 py-0.5 rounded-md">
            Trade-only · Cannot withdraw assets
          </span>
        </div>
      </div>

      {/* Verified Contracts List */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-on-surface font-headline">
          Verified Addresses on HSK Testnet
        </div>
        <div className="space-y-1.5">
          {contracts.map((c) => (
            <div
              key={c.name}
              className="p-3 rounded-2xl bg-surface-container-low border border-outline-variant/30 hover:border-outline-variant/60 transition-colors flex items-center justify-between text-xs"
            >
              <div className="space-y-0.5 pr-2">
                <div className="font-semibold text-on-surface">{c.name}</div>
                <div className="font-mono text-[11px] text-on-surface-variant truncate max-w-[280px]">
                  {c.address}
                </div>
              </div>
              <a
                href={
                  c.name.includes("Mainnet")
                    ? `https://hashkey.blockscout.com/address/${c.address}`
                    : `https://testnet-explorer.hsk.xyz/address/${c.address}`
                }
                target="_blank"
                rel="noreferrer"
                className="p-2 rounded-xl bg-surface-container-lowest border border-outline-variant/40 text-on-surface-variant hover:text-primary transition-colors shadow-soft"
                title="View on Explorer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
