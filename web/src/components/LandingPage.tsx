import React from "react";
import { ArrowRight, ShieldCheck, Scale, Lock, Sliders, ExternalLink } from "lucide-react";
import { InteractiveDepthSimulator } from "./InteractiveDepthSimulator";
import type { AppState } from "../types";

interface Props {
  state: AppState | null;
  onLaunchTerminal: () => void;
}

export const LandingPage: React.FC<Props> = ({ state, onLaunchTerminal }) => {
  return (
    <div className="max-w-6xl mx-auto space-y-12 py-4">
      {/* ─── HERO SECTION ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl bg-surface-container-lowest p-8 sm:p-12 border border-outline-variant/40 shadow-card">
        {/* Subtle decorative glow */}
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-primary/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-tertiary/5 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col items-start gap-6 max-w-3xl">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-secondary-container text-on-secondary-container border border-primary/20 text-xs">
            <span className="w-2 h-2 rounded-full bg-primary"></span>
            <span className="font-mono font-bold uppercase tracking-wider text-primary">
              HSK Chain Horizon Hackathon · Track 1: AI Agent Trading
            </span>
          </div>

          {/* Headline */}
          <h1 className="font-headline text-3xl sm:text-5xl lg:text-6xl text-on-surface tracking-tight leading-[1.15]">
            Trading bots trade blind.<br />
            <span className="text-primary italic">DepthGuard</span> measures the depth first.
          </h1>

          {/* Subtitle */}
          <p className="font-body text-base sm:text-lg text-on-surface-variant leading-relaxed">
            An autonomous AI trading agent for <strong>HSKSwap</strong> that sweeps DEX liquidity curves in real time, dynamically sizes every order to the pool’s safe capacity, and enforces an immutable minimum-output floor on-chain.
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={onLaunchTerminal}
              className="px-6 py-3.5 rounded-xl bg-primary hover:bg-primary-container text-white font-semibold text-sm shadow-soft hover:shadow-card transition-all flex items-center gap-2"
            >
              <span>Launch Trading Terminal</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <a
              href="#simulator"
              className="px-6 py-3.5 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface font-semibold text-sm border border-outline-variant/40 transition-all text-center"
            >
              Try Pool Capacity Simulator
            </a>
          </div>
        </div>
      </section>

      {/* ─── TRUST & VALUE PILLARS (3 MINIMAL CARDS) ────────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant/40 shadow-soft space-y-3">
          <div className="w-10 h-10 rounded-xl bg-secondary-container text-primary flex items-center justify-center">
            <Sliders className="w-5 h-5" />
          </div>
          <h3 className="font-headline text-lg font-semibold text-on-surface">
            QuoterV2 Depth Sweeps
          </h3>
          <p className="font-body text-xs text-on-surface-variant leading-relaxed">
            Before signing any calldata, the agent queries pool quotes across multiple balance tiers to construct the real price-impact curve and binary-search the maximum safe trade size.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant/40 shadow-soft space-y-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="font-headline text-lg font-semibold text-on-surface">
            On-Chain Spot Floor
          </h3>
          <p className="font-body text-xs text-on-surface-variant leading-relaxed">
            <code className="text-primary font-mono text-[11px]">ExecutionGuard.sol</code> verifies spot tick directly inside the transaction. If output drops below the calculated floor, the contract immediately reverts.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant/40 shadow-soft space-y-3">
          <div className="w-10 h-10 rounded-xl bg-tertiary/10 text-tertiary flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
          <h3 className="font-headline text-lg font-semibold text-on-surface">
            Non-Custodial Vault
          </h3>
          <p className="font-body text-xs text-on-surface-variant leading-relaxed">
            The agent acts as a scoped operator only. Users retain 100% custody of assets and can revoke trade permissions or trigger the on-chain emergency pause at any time.
          </p>
        </div>
      </section>

      {/* ─── INTERACTIVE POOL SIMULATOR ──────────────────────────────────── */}
      <section id="simulator">
        <InteractiveDepthSimulator />
      </section>

      {/* ─── TERMINAL CALLOUT ────────────────────────────────────────────── */}
      <section className="rounded-3xl bg-surface-container-low border border-outline-variant/40 p-8 sm:p-10 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="space-y-2">
          <h3 className="font-headline text-2xl text-on-surface font-semibold">
            Ready to test live trading on HSK Testnet?
          </h3>
          <p className="font-body text-xs text-on-surface-variant max-w-xl">
            Switch to the Trading Terminal to converse with the agent, adjust risk budgets, and inspect verifiable on-chain decision proofs.
          </p>
        </div>
        <button
          onClick={onLaunchTerminal}
          className="shrink-0 px-6 py-3 rounded-xl bg-primary hover:bg-primary-container text-white font-semibold text-sm shadow-soft transition-all flex items-center gap-2"
        >
          <span>Open Trading Console</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </section>
    </div>
  );
};
