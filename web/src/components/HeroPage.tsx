import React from "react";
import {
  Shield,
  ArrowRight,
  Sliders,
  ShieldCheck,
  Lock,
  Zap,
  TrendingDown,
  TrendingUp,
  Cpu,
  CheckCircle2,
  XCircle,
  ExternalLink,
} from "lucide-react";
import { InteractiveDepthSimulator } from "./InteractiveDepthSimulator";
import { PipelineHotspots } from "./PipelineHotspots";
import type { AppState } from "../types";

interface Props {
  onGetStarted: () => void;
  onEnterTerminal: () => void;
  state?: AppState | null;
}

export const HeroPage: React.FC<Props> = ({ onGetStarted, onEnterTerminal, state }) => {
  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background text-on-surface font-sans selection:bg-primary/20 selection:text-primary">
      {/* ─── Top Floating Navigation ───────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-surface-container-lowest/90 backdrop-blur-md border-b border-outline-variant/40 px-4 sm:px-8 py-3.5 flex items-center justify-between transition-all">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary text-white flex items-center justify-center shadow-soft">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-headline font-bold text-base tracking-tight text-on-surface">
                Fathom
              </span>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-secondary-container text-on-secondary-container">
                HSKSwap
              </span>
            </div>
          </div>
        </div>

        {/* Center Nav Links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-on-surface-variant">
          <button
            type="button"
            onClick={() => scrollToSection("problem-solution")}
            className="hover:text-on-surface transition-colors cursor-pointer"
          >
            Why Fathom
          </button>
          <button
            type="button"
            onClick={() => scrollToSection("simulator")}
            className="hover:text-on-surface transition-colors cursor-pointer"
          >
            Pool Simulator
          </button>
          <button
            type="button"
            onClick={() => scrollToSection("pipeline")}
            className="hover:text-on-surface transition-colors cursor-pointer"
          >
            Autonomous Pipeline
          </button>
          <button
            type="button"
            onClick={() => scrollToSection("security")}
            className="hover:text-on-surface transition-colors cursor-pointer"
          >
            On-Chain Safety
          </button>
        </nav>

        {/* Right CTA */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container border border-outline-variant/40 text-[11px] font-mono">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            <span className="text-on-surface">HSK Testnet (133)</span>
          </div>

          <button
            type="button"
            onClick={onGetStarted}
            className="group px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white font-semibold text-xs shadow-soft hover:shadow-card transition-all duration-200 flex items-center gap-2 cursor-pointer"
          >
            <span>Launch Terminal</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </header>

      {/* ─── Hero Main Container ──────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-14 space-y-16 sm:space-y-24">
        {/* ─── 1. HERO SECTION ────────────────────────────────────────────── */}
        <section className="relative overflow-hidden rounded-3xl bg-surface-container-lowest p-8 sm:p-14 border border-outline-variant/40 shadow-card">
          {/* Gentle, calm ambient background glow (ultra slow breathing, no fast motion) */}
          <div className="absolute -top-32 -right-32 w-96 h-96 bg-primary/8 rounded-full blur-3xl pointer-events-none transition-all duration-1000" />
          <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-tertiary/6 rounded-full blur-3xl pointer-events-none transition-all duration-1000" />

          <div className="relative z-10 flex flex-col items-start gap-6 max-w-3xl">
            {/* Eyebrow badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-secondary-container text-on-secondary-container border border-primary/20 text-xs shadow-soft">
              <span className="w-2 h-2 rounded-full bg-primary" />
              <span className="font-mono font-bold uppercase tracking-wider text-primary text-[11px]">
                HSK Chain Horizon Hackathon · Track 1: AI Agent Trading
              </span>
            </div>

            {/* Headline */}
            <h1 className="font-headline text-3xl sm:text-5xl lg:text-6xl text-on-surface tracking-tight leading-[1.12] font-semibold">
              Trading bots trade blind.{" "}
              <br />
              <span className="text-primary italic font-serif">Fathom</span> measures the depth first.
            </h1>

            {/* Subtitle */}
            <p className="font-body text-base sm:text-lg text-on-surface-variant leading-relaxed">
              An autonomous AI trading agent for <strong>HSKSwap</strong> that sweeps DEX liquidity curves in real time, dynamically sizes every order to the pool’s safe capacity, and enforces an immutable on-chain spot floor via <code className="font-mono text-xs text-primary font-bold px-1.5 py-0.5 rounded bg-surface-container">ExecutionGuard.sol</code>.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onGetStarted}
                className="group px-6 py-3.5 rounded-xl bg-primary hover:bg-primary-container text-white font-semibold text-sm shadow-card hover:shadow-dropdown transition-all flex items-center gap-2.5 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>Launch Trading Terminal</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                type="button"
                onClick={() => scrollToSection("simulator")}
                className="px-6 py-3.5 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface font-semibold text-sm border border-outline-variant/40 transition-all flex items-center gap-2 cursor-pointer"
              >
                <Sliders className="w-4 h-4 text-primary" />
                <span>Try Pool Simulator</span>
              </button>
            </div>

            {/* Live Metrics Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 pt-4 border-t border-outline-variant/30 w-full">
              {[
                { label: "Active Pool Pair", val: "WHSK / tUSDT", sub: "Uniswap V3 (0.3% fee)" },
                { label: "Impact Budget", val: "60 bps", sub: "Default budget cap" },
                { label: "Execution Vault", val: "Non-Custodial", sub: "User holds 100% keys" },
                { label: "On-Chain Spot Floor", val: "100% Enforced", sub: "Reverts on deviation" },
              ].map((m, i) => (
                <div key={i} className="space-y-0.5">
                  <div className="font-mono text-lg sm:text-xl font-bold text-on-surface">{m.val}</div>
                  <div className="text-[11px] font-semibold text-on-surface-variant">{m.label}</div>
                  <div className="text-[10px] text-on-surface-variant/70 font-mono">{m.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── 2. THE PROBLEM VS SOLUTION (BLIND BOT VS FATHOM) ───────── */}
        <section id="problem-solution" className="space-y-6">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="font-mono text-xs uppercase tracking-wider text-primary font-bold">
              The Structural Dilemma on HSK
            </span>
            <h2 className="font-headline text-3xl font-semibold text-on-surface">
              Why 99% of DEX Trading Bots Lose Capital
            </h2>
            <p className="font-body text-sm text-on-surface-variant">
              Shallow pools create steep, non-linear price impact curves. When a bot calculates orders based on spot price alone, slippage and front-runners destroy profitability.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* The Blind Bot Card */}
            <div className="p-7 rounded-3xl bg-error-container/20 border border-error/20 space-y-4 shadow-soft">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-error font-headline font-bold text-base">
                  <XCircle className="w-5 h-5 shrink-0" />
                  <span>Standard Blind Trading Bot</span>
                </div>
                <span className="font-mono text-[10px] font-bold text-error uppercase px-2 py-0.5 rounded-full bg-error-container/50">
                  Fragile
                </span>
              </div>

              <p className="text-xs text-on-surface-variant leading-relaxed">
                Reads spot price → submits fixed-size swap order directly to router with a static 0.5% tolerance.
              </p>

              <div className="space-y-2 pt-2 border-t border-error/15 text-xs font-mono text-on-surface">
                <div className="flex items-center justify-between py-1 border-b border-error/10">
                  <span className="text-on-surface-variant">Liquidity Awareness:</span>
                  <span className="text-error font-bold">Zero (Blind)</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-error/10">
                  <span className="text-on-surface-variant">100 WHSK Swap Impact:</span>
                  <span className="text-error font-bold">+165 bps (~$144 loss)</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-error/10">
                  <span className="text-on-surface-variant">Sandwich Vulnerability:</span>
                  <span className="text-error font-bold">High (Wide static slippage)</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-on-surface-variant">Execution Outcome:</span>
                  <span className="text-error font-bold">Capital Depleted</span>
                </div>
              </div>
            </div>

            {/* Fathom Card */}
            <div className="p-7 rounded-3xl bg-secondary-container/40 border border-primary/30 space-y-4 shadow-soft ring-1 ring-primary/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-primary font-headline font-bold text-base">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span>Fathom Autonomous Agent</span>
                </div>
                <span className="font-mono text-[10px] font-bold text-primary uppercase px-2 py-0.5 rounded-full bg-secondary-container">
                  Liquidity-Aware
                </span>
              </div>

              <p className="text-xs text-on-surface-variant leading-relaxed">
                Queries QuoterV2 depth curves across balance tiers → dynamically trims order size to fit impact budget → enforces spot tick floor on-chain.
              </p>

              <div className="space-y-2 pt-2 border-t border-primary/15 text-xs font-mono text-on-surface">
                <div className="flex items-center justify-between py-1 border-b border-primary/10">
                  <span className="text-on-surface-variant">Liquidity Awareness:</span>
                  <span className="text-primary font-bold">Full QuoterV2 Curve</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-primary/10">
                  <span className="text-on-surface-variant">100 WHSK Swap Sizing:</span>
                  <span className="text-primary font-bold">Trimmed to 42 WHSK (58 bps)</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-primary/10">
                  <span className="text-on-surface-variant">Loss Avoided:</span>
                  <span className="text-primary font-bold">+$126 Protected</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-on-surface-variant">Execution Guard:</span>
                  <span className="text-primary font-bold">On-Chain Revert Floor</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── 3. INTERACTIVE POOL SIMULATOR ───────────────────────────────── */}
        <section id="simulator">
          <InteractiveDepthSimulator />
        </section>

        {/* ─── 4. AUTONOMOUS 4-STAGE PIPELINE ──────────────────────────────── */}
        <section id="pipeline">
          <PipelineHotspots />
        </section>

        {/* ─── 5. SECURITY & ARCHITECTURE PILLARS ─────────────────────────── */}
        <section id="security" className="space-y-6">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="font-mono text-xs uppercase tracking-wider text-primary font-bold">
              Non-Custodial Architecture
            </span>
            <h2 className="font-headline text-3xl font-semibold text-on-surface">
              Built on Verifiable On-Chain Safety
            </h2>
            <p className="font-body text-sm text-on-surface-variant">
              The AI LLM parses natural language intents, but deterministic code and smart contracts make all financial decisions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-7 rounded-3xl bg-surface-container-lowest border border-outline-variant/40 shadow-soft space-y-3 hover:shadow-card transition-all">
              <div className="w-10 h-10 rounded-2xl bg-secondary-container text-primary flex items-center justify-center shadow-soft">
                <Sliders className="w-5 h-5" />
              </div>
              <h3 className="font-headline text-lg font-semibold text-on-surface">
                QuoterV2 Preflight Sweep
              </h3>
              <p className="font-body text-xs text-on-surface-variant leading-relaxed">
                Before generating calldata, Fathom queries pool quotes at 1%, 2%, 5%, 10%, 25%, 50%, and 100% of vault balance. It binary-searches the maximum safe trade size.
              </p>
            </div>

            <div className="p-7 rounded-3xl bg-surface-container-lowest border border-outline-variant/40 shadow-soft space-y-3 hover:shadow-card transition-all">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-soft">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="font-headline text-lg font-semibold text-on-surface">
                ExecutionGuard Spot Floor
              </h3>
              <p className="font-body text-xs text-on-surface-variant leading-relaxed">
                <code className="text-primary font-mono text-[11px]">ExecutionGuard.sol</code> verifies the spot tick inside the transaction. If output drops below the calculated floor, the contract immediately reverts.
              </p>
            </div>

            <div className="p-7 rounded-3xl bg-surface-container-lowest border border-outline-variant/40 shadow-soft space-y-3 hover:shadow-card transition-all">
              <div className="w-10 h-10 rounded-2xl bg-tertiary/10 text-tertiary flex items-center justify-center shadow-soft">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="font-headline text-lg font-semibold text-on-surface">
                Scoped Non-Custodial Vault
              </h3>
              <p className="font-body text-xs text-on-surface-variant leading-relaxed">
                The agent holds zero transfer privileges. Swap recipients are hardcoded to the vault itself. Users can pause execution or revoke operator rights on-chain at any time.
              </p>
            </div>
          </div>
        </section>

        {/* ─── 6. FINAL LAUNCH CALLOUT ────────────────────────────────────── */}
        <section className="rounded-3xl bg-surface-container-low border border-outline-variant/40 p-8 sm:p-12 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-soft">
          <div className="space-y-2 max-w-xl">
            <h3 className="font-headline text-2xl sm:text-3xl text-on-surface font-semibold">
              Ready to experience Fathom live?
            </h3>
            <p className="font-body text-sm text-on-surface-variant">
              Launch the Trading Terminal to customize your risk profile, chat with the agent, trigger testnet price moves, and inspect verifiable decision proofs on-chain.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0 w-full sm:w-auto">
            <button
              type="button"
              onClick={onGetStarted}
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-primary hover:bg-primary-container text-white font-semibold text-sm shadow-card hover:shadow-dropdown transition-all flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>Launch Trading Terminal</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>

        {/* ─── Footer ──────────────────────────────────────────────────────── */}
        <footer className="border-t border-outline-variant/30 py-8 text-center text-xs text-on-surface-variant/80 space-y-2">
          <p className="font-mono text-[11px]">
            Fathom · HSK Chain Horizon Hackathon 2026 (Track 1: AI Agent Trading)
          </p>
          <p className="text-[10px] text-on-surface-variant/60">
            Tested on HSK Testnet (Chain ID 133) · Reference on HSK Mainnet (Chain ID 177) · Non-custodial Solidity ExecutionGuard
          </p>
        </footer>
      </div>
    </div>
  );
};
