import React, { useState } from "react";
import { Shield, Sparkles, Scale, Zap, Check, ArrowRight, User, CheckCircle2 } from "lucide-react";
import type { UserProfile } from "../types";

interface Props {
  isOpen: boolean;
  onComplete: (profile: UserProfile) => void;
  currentProfile?: UserProfile | null;
}

export const OnboardingModal: React.FC<Props> = ({
  isOpen,
  onComplete,
  currentProfile,
}) => {
  const [name, setName] = useState(currentProfile?.name || "Trader");
  const [riskPreference, setRiskPreference] = useState<"conservative" | "balanced" | "aggressive">(
    currentProfile?.riskPreference || "balanced"
  );
  const [executionMode, setExecutionMode] = useState<"manual" | "auto">(
    currentProfile?.executionMode || "manual"
  );

  if (!isOpen) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const finalProfile: UserProfile = {
      name: name.trim() || "Trader",
      riskPreference,
      executionMode,
      maxTradePct: riskPreference === "conservative" ? 5 : riskPreference === "balanced" ? 10 : 20,
    };
    try {
      localStorage.setItem("depthguard_profile", JSON.stringify(finalProfile));
    } catch {}
    onComplete(finalProfile);
  };

  const handleUseDefaults = () => {
    const defaults: UserProfile = {
      name: "Trader",
      riskPreference: "balanced",
      executionMode: "manual",
      maxTradePct: 10,
    };
    try {
      localStorage.setItem("depthguard_profile", JSON.stringify(defaults));
    } catch {}
    onComplete(defaults);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-on-surface/40 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-xl rounded-3xl bg-surface-container-lowest border border-outline-variant/40 shadow-dropdown overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-6 sm:p-8 bg-surface-container-low/70 border-b border-surface-container flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary text-white flex items-center justify-center shadow-soft">
              <Shield className="w-4 h-4" />
            </div>
            <span className="font-headline font-bold text-base text-on-surface">DepthGuard</span>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-secondary-container text-on-secondary-container">
              Personalized Setup
            </span>
          </div>

          <h2 className="font-headline text-2xl sm:text-3xl text-on-surface font-semibold tracking-tight mt-1">
            Tailor Your Trading Agent
          </h2>
          <p className="font-body text-xs sm:text-sm text-on-surface-variant leading-relaxed">
            Configure your risk tolerance and execution rules. DepthGuard adapts its QuoterV2 preflight checks and smart contract floors to match your profile.
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1">
          {/* 1. Trader Name / Handle */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant font-mono">
              1. Trader Handle / Nickname
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-on-surface-variant absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alex or TreasuryVault"
                className="w-full rounded-xl border border-outline-variant/60 bg-surface-container-lowest py-2.5 pl-10 pr-4 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-hidden focus:border-primary transition-all shadow-soft"
                maxLength={30}
              />
            </div>
          </div>

          {/* 2. Risk Appetite Preset */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant font-mono">
                2. Risk & Slippage Budget
              </label>
              <span className="text-[11px] font-mono text-primary font-medium">
                Enforced by QuoterV2
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Conservative */}
              <button
                type="button"
                onClick={() => setRiskPreference("conservative")}
                className={`p-3.5 rounded-2xl border text-left transition-all ${
                  riskPreference === "conservative"
                    ? "bg-secondary-container/60 border-primary ring-1 ring-primary/40 shadow-soft"
                    : "bg-surface-container-low border-outline-variant/40 hover:bg-surface-container"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <Shield className="w-4 h-4 text-primary" />
                  {riskPreference === "conservative" && (
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                  )}
                </div>
                <div className="font-headline font-semibold text-xs text-on-surface">Conservative</div>
                <div className="text-[10px] text-on-surface-variant mt-0.5">25 bps budget cap</div>
                <div className="font-mono text-[10px] text-primary font-bold mt-2">Max 5% size</div>
              </button>

              {/* Balanced */}
              <button
                type="button"
                onClick={() => setRiskPreference("balanced")}
                className={`p-3.5 rounded-2xl border text-left transition-all ${
                  riskPreference === "balanced"
                    ? "bg-secondary-container/60 border-primary ring-1 ring-primary/40 shadow-soft"
                    : "bg-surface-container-low border-outline-variant/40 hover:bg-surface-container"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <Scale className="w-4 h-4 text-primary" />
                  {riskPreference === "balanced" && (
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                  )}
                </div>
                <div className="font-headline font-semibold text-xs text-on-surface">Balanced</div>
                <div className="text-[10px] text-on-surface-variant mt-0.5">60 bps budget cap</div>
                <div className="font-mono text-[10px] text-primary font-bold mt-2">Max 10% size</div>
              </button>

              {/* Aggressive */}
              <button
                type="button"
                onClick={() => setRiskPreference("aggressive")}
                className={`p-3.5 rounded-2xl border text-left transition-all ${
                  riskPreference === "aggressive"
                    ? "bg-secondary-container/60 border-primary ring-1 ring-primary/40 shadow-soft"
                    : "bg-surface-container-low border-outline-variant/40 hover:bg-surface-container"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <Zap className="w-4 h-4 text-primary" />
                  {riskPreference === "aggressive" && (
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                  )}
                </div>
                <div className="font-headline font-semibold text-xs text-on-surface">Aggressive</div>
                <div className="text-[10px] text-on-surface-variant mt-0.5">120 bps budget cap</div>
                <div className="font-mono text-[10px] text-primary font-bold mt-2">Max 20% size</div>
              </button>
            </div>
          </div>

          {/* 3. Execution Control */}
          <div className="space-y-2.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant font-mono">
              3. Execution Control
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setExecutionMode("manual")}
                className={`p-3.5 rounded-2xl border text-left transition-all flex items-start gap-3 ${
                  executionMode === "manual"
                    ? "bg-secondary-container/60 border-primary ring-1 ring-primary/40 shadow-soft"
                    : "bg-surface-container-low border-outline-variant/40 hover:bg-surface-container"
                }`}
              >
                <div className="w-4 h-4 rounded-full border border-primary flex items-center justify-center shrink-0 mt-0.5">
                  {executionMode === "manual" && <div className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <div>
                  <div className="font-headline font-semibold text-xs text-on-surface">
                    Human in the Loop (Recommended)
                  </div>
                  <div className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">
                    Agent checks pool depth and shows an order preview; you click to confirm execution.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setExecutionMode("auto")}
                className={`p-3.5 rounded-2xl border text-left transition-all flex items-start gap-3 ${
                  executionMode === "auto"
                    ? "bg-secondary-container/60 border-primary ring-1 ring-primary/40 shadow-soft"
                    : "bg-surface-container-low border-outline-variant/40 hover:bg-surface-container"
                }`}
              >
                <div className="w-4 h-4 rounded-full border border-primary flex items-center justify-center shrink-0 mt-0.5">
                  {executionMode === "auto" && <div className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <div>
                  <div className="font-headline font-semibold text-xs text-on-surface">
                    Autonomous Guardian
                  </div>
                  <div className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">
                    Agent executes automatically when signals occur, trimmed strictly within budget.
                  </div>
                </div>
              </button>
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="p-6 bg-surface-container-low/70 border-t border-surface-container flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleUseDefaults}
            className="text-xs font-mono text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Use standard defaults
          </button>

          <button
            type="button"
            onClick={() => handleSubmit()}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-primary hover:bg-primary-container text-white font-semibold text-xs shadow-soft hover:shadow-card transition-all flex items-center justify-center gap-2"
          >
            <span>Save Profile & Enter Terminal</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

