import React, { useState } from "react";
import { Eye, TrendingUp, Sliders, ShieldCheck, ChevronRight, Cpu } from "lucide-react";

/**
 * PipelineHotspots.tsx — Interactive Pipeline Visualizer
 * Themed to warm cream & sage palette.
 * Visualizes the 4-stage pipeline: Market Monitor → Signal Engine → Depth Sizer → ExecutionGuard.
 */
export const PipelineHotspots: React.FC = () => {
  const [activeStage, setActiveStage] = useState<number>(2); // Default to Sizer (Core USP)

  const stages = [
    {
      id: 0,
      title: "1. Market Monitor",
      subtitle: "Dual-Pool Polling",
      icon: Eye,
      tag: "READ-ONLY",
      desc: "Queries HSK Testnet pool slot0 sqrtPrice alongside HSK Mainnet reference price every 20 seconds.",
      details: [
        "Testnet Pool: 0xe0f4... (Chain ID 133, slot0 sqrtPriceX96)",
        "Mainnet Pool (Chain 177): ~0.0875 USDT / WHSK",
        "Calculates spot-to-reference deviation in basis points (bps)",
        "Disables execution automatically if reference price is >60s stale",
      ],
    },
    {
      id: 1,
      title: "2. Signal Engine",
      subtitle: "Reference Reversion",
      icon: TrendingUp,
      tag: "DETERMINISTIC",
      desc: "Triggers BUY when pool is discounted vs reference, SELL when at a premium. Mathematical reversion, not black-box guesses.",
      details: [
        "devBps = (spot - ref) * 10000 / ref",
        "BUY Trigger: devBps <= -80 bps (discounted pool)",
        "SELL Trigger: devBps >= +80 bps (expensive pool)",
        "Fast/Slow EMAs prevent whipsawing during momentary volatility",
      ],
    },
    {
      id: 2,
      title: "3. Depth Sizer",
      subtitle: "Core USP: Liquidity Sweep",
      icon: Sliders,
      tag: "CORE USP",
      desc: "Sweeps quotes across balance tiers via QuoterV2 and binary-searches the maximum safe trade size.",
      details: [
        "Sweeps 1%, 2%, 5%, 10%, 25%, 50%, 100% of vault balance",
        "Constructs full price impact curve before signing any calldata",
        "Deterministic output: EXECUTE_FULL | EXECUTE_TRIMMED | NO_TRADE",
        "Auto-trims oversized requests to strictly respect the impact budget",
      ],
    },
    {
      id: 3,
      title: "4. ExecutionGuard",
      subtitle: "On-Chain Spot Floor",
      icon: ShieldCheck,
      tag: "SOLIDITY VAULT",
      desc: "Non-custodial smart contract verifies pool spot tick directly inside the transaction before calling the router.",
      details: [
        "Recipient hardcoded to address(this) — agent has zero withdrawal rights",
        "On-Chain Floor: amountOutMin >= idealOut * (1 - fee - impact - slippage)",
        "Reverts immediately on-chain if spot tick has shifted unfavorably",
        "Strict cooldown, per-trade caps, and daily notional limits",
      ],
    },
  ];

  return (
    <div className="rounded-3xl bg-surface-container-lowest border border-outline-variant/40 p-6 sm:p-8 shadow-card space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-surface-container pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary uppercase tracking-wider mb-1">
            <Cpu className="w-3.5 h-3.5" />
            <span>Autonomous Loop Architecture</span>
          </div>
          <h3 className="font-headline text-2xl sm:text-3xl text-on-surface font-semibold tracking-tight">
            How an Order Travels Through DepthGuard
          </h3>
          <p className="font-body text-sm text-on-surface-variant mt-1">
            Click any stage node below to inspect its deterministic safety guarantees.
          </p>
        </div>
        <span className="text-xs font-mono font-medium text-primary bg-secondary-container px-3 py-1 rounded-full border border-primary/20 self-start sm:self-auto">
          Interactive Architecture
        </span>
      </div>

      {/* Connected Interactive Stage Nodes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 relative">
        {stages.map((s, idx) => {
          const Icon = s.icon;
          const isSelected = activeStage === s.id;

          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveStage(s.id)}
              className={`relative text-left p-4 rounded-2xl border transition-all duration-200 cursor-pointer ${
                isSelected
                  ? "bg-primary text-white border-primary shadow-soft -translate-y-0.5"
                  : "bg-surface-container-low border-outline-variant/40 hover:bg-surface-container text-on-surface"
              }`}
            >
              <div className="flex items-center justify-between">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                    isSelected ? "bg-white text-primary" : "bg-surface-container text-on-surface"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <span
                  className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full ${
                    isSelected
                      ? "bg-white/20 text-white"
                      : "bg-surface-container text-on-surface-variant"
                  }`}
                >
                  {s.tag}
                </span>
              </div>

              <div className="mt-3">
                <h4 className="font-headline font-semibold text-sm tracking-tight">{s.title}</h4>
                <p
                  className={`text-xs mt-0.5 font-body ${
                    isSelected ? "text-white/80" : "text-on-surface-variant"
                  }`}
                >
                  {s.subtitle}
                </p>
              </div>

              {/* Connecting Laser Line Indicator */}
              {idx < stages.length - 1 && (
                <div className="hidden lg:block absolute top-1/2 -right-3 w-3 h-0.5 bg-outline-variant/50 z-10" />
              )}
            </button>
          );
        })}
      </div>

      {/* Expanded Stage Inspection Card */}
      <div className="p-6 rounded-2xl bg-surface-container-low border border-outline-variant/40 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
            <span className="font-headline font-semibold text-base text-on-surface">
              Stage Deep-Dive: {stages[activeStage].title}
            </span>
          </div>
          <span className="text-xs font-mono font-bold text-primary px-2.5 py-0.5 rounded-lg bg-surface-container-lowest border border-outline-variant/30">
            {stages[activeStage].tag}
          </span>
        </div>

        <p className="text-sm text-on-surface leading-relaxed font-body">
          {stages[activeStage].desc}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-3 border-t border-outline-variant/30">
          {stages[activeStage].details.map((d, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-on-surface-variant font-mono">
              <ChevronRight className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
              <span>{d}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
