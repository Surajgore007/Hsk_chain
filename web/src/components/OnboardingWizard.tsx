import React, { useState, useEffect, useCallback } from "react";
import { Shield, ArrowRight, ArrowLeft, Check } from "lucide-react";
import type { UserProfile } from "../types";

interface Props {
  onComplete: (profile: UserProfile) => void;
  currentProfile?: UserProfile | null;
}

type Step = 0 | 1 | 2 | 3;

const ROLES = [
  { id: "retail", label: "Retail Trader", desc: "Personal portfolio, small-medium positions" },
  { id: "treasury", label: "Protocol Treasury", desc: "DAO/protocol fund management" },
  { id: "fund", label: "Fund Manager", desc: "Managing capital for multiple stakeholders" },
  { id: "developer", label: "Developer / Builder", desc: "Testing integrations and tooling" },
] as const;

const RISK_OPTIONS = [
  {
    id: "conservative" as const,
    label: "Conservative",
    emoji: "🛡",
    desc: "Tight budgets, minimal slippage",
    detail: "25 bps impact cap · Max 5% trade size · Slow & safe",
    color: "border-primary/50 bg-secondary-container/60",
    selectedColor: "border-primary ring-2 ring-primary/30 bg-secondary-container",
  },
  {
    id: "balanced" as const,
    label: "Balanced",
    emoji: "⚖",
    desc: "Sensible defaults for most traders",
    detail: "60 bps impact cap · Max 10% trade size · Recommended",
    color: "border-outline-variant/40 bg-surface-container-low",
    selectedColor: "border-primary ring-2 ring-primary/30 bg-secondary-container",
  },
  {
    id: "aggressive" as const,
    label: "Aggressive",
    emoji: "⚡",
    desc: "Higher throughput, wider tolerance",
    detail: "120 bps impact cap · Max 20% trade size · Use with care",
    color: "border-tertiary/30 bg-tertiary-container/30",
    selectedColor: "border-tertiary ring-2 ring-tertiary/30 bg-tertiary-container/60",
  },
] as const;

const EXEC_OPTIONS = [
  {
    id: "manual" as const,
    label: "Human in the Loop",
    badge: "Recommended",
    desc: "Agent checks pool depth and shows an order preview. You click Confirm before any swap executes.",
    icon: "👤",
  },
  {
    id: "auto" as const,
    label: "Autonomous Guardian",
    badge: "Advanced",
    desc: "Agent executes automatically when signals pass depth checks and budget caps. No confirmation required.",
    icon: "🤖",
  },
];

const GOALS = [
  { id: "capital", label: "Capital Preservation", desc: "Don't lose principal above all else" },
  { id: "balanced", label: "Balanced Returns", desc: "Grow steadily with managed risk" },
  { id: "throughput", label: "Max Throughput", desc: "Capture every signal that clears budget" },
] as const;

export const OnboardingWizard: React.FC<Props> = ({ onComplete, currentProfile }) => {
  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState(currentProfile?.name || "");
  const [role, setRole] = useState<string>(currentProfile ? "retail" : "");
  const [risk, setRisk] = useState<"conservative" | "balanced" | "aggressive">(
    currentProfile?.riskPreference || "balanced"
  );
  const [execMode, setExecMode] = useState<"manual" | "auto">(
    currentProfile?.executionMode || "manual"
  );
  const [goal, setGoal] = useState<string>("");
  const [animDir, setAnimDir] = useState<"fwd" | "bwd">("fwd");
  const [visible, setVisible] = useState(true);

  const goNext = useCallback(() => {
    if (step >= 3) return;
    setAnimDir("fwd");
    setVisible(false);
    setTimeout(() => {
      setStep((s) => (s + 1) as Step);
      setVisible(true);
    }, 180);
  }, [step]);

  const goBack = useCallback(() => {
    if (step === 0) return;
    setAnimDir("bwd");
    setVisible(false);
    setTimeout(() => {
      setStep((s) => (s - 1) as Step);
      setVisible(true);
    }, 180);
  }, [step]);

  const handleFinish = () => {
    const profile: UserProfile = {
      name: name.trim() || "Trader",
      riskPreference: risk,
      executionMode: execMode,
      maxTradePct: risk === "conservative" ? 5 : risk === "balanced" ? 10 : 20,
    };
    try {
      localStorage.setItem("depthguard_profile", JSON.stringify(profile));
    } catch {}
    onComplete(profile);
  };

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        if (step === 3) handleFinish();
        else goNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [step, goNext]);

  const canAdvance = () => {
    if (step === 0) return name.trim().length > 0 && role.length > 0;
    if (step === 1) return !!risk;
    if (step === 2) return !!execMode;
    if (step === 3) return !!goal;
    return false;
  };

  const STEP_LABELS = ["Identity", "Risk", "Execution", "Goals"];

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center overflow-hidden">
      {/* Subtle bg accent */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/4 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-tertiary/4 rounded-full blur-3xl" />
      </div>

      {/* Progress bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-surface-container">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${((step + 1) / 4) * 100}%` }}
        />
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between w-full max-w-2xl px-6 pt-8 pb-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary text-white flex items-center justify-center">
            <Shield className="w-3.5 h-3.5" />
          </div>
          <span className="font-headline font-bold text-sm text-on-surface">DepthGuard</span>
        </div>

        {/* Step dots */}
        <div className="flex items-center gap-3">
          {STEP_LABELS.map((label, i) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <div
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  i < step
                    ? "bg-primary"
                    : i === step
                    ? "bg-primary ring-2 ring-primary/30 ring-offset-1 ring-offset-background"
                    : "bg-outline-variant/40"
                }`}
              />
              <span className="hidden sm:block text-[9px] font-mono text-on-surface-variant uppercase tracking-wider">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Animated step content */}
      <div
        className="relative z-10 flex-1 flex flex-col items-center justify-center w-full max-w-2xl px-6"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible
            ? "translateY(0)"
            : animDir === "fwd"
            ? "translateY(20px)"
            : "translateY(-20px)",
          transition: "opacity 0.18s ease, transform 0.18s ease",
        }}
      >
        {/* ─── Step 0: Identity ─── */}
        {step === 0 && (
          <div className="w-full space-y-8">
            <div className="space-y-2">
              <p className="text-xs font-mono text-primary uppercase tracking-widest">Step 1 of 4</p>
              <h2 className="font-headline text-3xl sm:text-4xl font-semibold text-on-surface">
                How should we call you?
              </h2>
              <p className="text-sm text-on-surface-variant">
                Your agent will personalize its responses to your context.
              </p>
            </div>

            <div className="space-y-4">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name or handle"
                autoFocus
                maxLength={30}
                className="w-full py-4 px-5 rounded-2xl border border-outline-variant/60 bg-surface-container-lowest text-lg text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary transition-all shadow-soft font-body"
              />

              <div className="grid grid-cols-2 gap-3">
                {ROLES.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRole(r.id)}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                      role === r.id
                        ? "border-primary bg-secondary-container ring-1 ring-primary/30 shadow-soft"
                        : "border-outline-variant/40 bg-surface-container-low hover:bg-surface-container"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-on-surface">{r.label}</span>
                      {role === r.id && <Check className="w-4 h-4 text-primary" />}
                    </div>
                    <p className="text-xs text-on-surface-variant mt-0.5">{r.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── Step 1: Risk Appetite ─── */}
        {step === 1 && (
          <div className="w-full space-y-8">
            <div className="space-y-2">
              <p className="text-xs font-mono text-primary uppercase tracking-widest">Step 2 of 4</p>
              <h2 className="font-headline text-3xl sm:text-4xl font-semibold text-on-surface">
                What's your risk appetite?
              </h2>
              <p className="text-sm text-on-surface-variant">
                This sets your price-impact budget, enforced by QuoterV2 before every swap.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {RISK_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setRisk(opt.id)}
                  className={`p-6 rounded-3xl border text-left transition-all ${
                    risk === opt.id ? opt.selectedColor : opt.color + " hover:opacity-90"
                  }`}
                >
                  <div className="text-3xl mb-3">{opt.emoji}</div>
                  <div className="font-headline font-semibold text-base text-on-surface mb-1">
                    {opt.label}
                  </div>
                  <div className="text-xs text-on-surface-variant mb-3">{opt.desc}</div>
                  <div className="font-mono text-[11px] text-primary font-bold leading-relaxed">
                    {opt.detail}
                  </div>
                  {risk === opt.id && (
                    <div className="mt-3 flex items-center gap-1 text-primary text-xs font-semibold">
                      <Check className="w-3.5 h-3.5" />
                      <span>Selected</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ─── Step 2: Execution Mode ─── */}
        {step === 2 && (
          <div className="w-full space-y-8">
            <div className="space-y-2">
              <p className="text-xs font-mono text-primary uppercase tracking-widest">Step 3 of 4</p>
              <h2 className="font-headline text-3xl sm:text-4xl font-semibold text-on-surface">
                How do you want to execute?
              </h2>
              <p className="text-sm text-on-surface-variant">
                You can change this at any time from the terminal.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {EXEC_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setExecMode(opt.id)}
                  className={`p-7 rounded-3xl border text-left transition-all ${
                    execMode === opt.id
                      ? "border-primary bg-secondary-container ring-2 ring-primary/25 shadow-card"
                      : "border-outline-variant/40 bg-surface-container-low hover:bg-surface-container"
                  }`}
                >
                  <div className="text-4xl mb-4">{opt.icon}</div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-headline font-semibold text-lg text-on-surface">
                      {opt.label}
                    </span>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg bg-surface-container text-on-surface-variant uppercase tracking-wider">
                      {opt.badge}
                    </span>
                  </div>
                  <p className="text-sm text-on-surface-variant leading-relaxed">{opt.desc}</p>
                  {execMode === opt.id && (
                    <div className="mt-4 flex items-center gap-1 text-primary text-xs font-semibold">
                      <Check className="w-3.5 h-3.5" />
                      <span>Selected</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ─── Step 3: Primary Goal ─── */}
        {step === 3 && (
          <div className="w-full space-y-8">
            <div className="space-y-2">
              <p className="text-xs font-mono text-primary uppercase tracking-widest">Step 4 of 4</p>
              <h2 className="font-headline text-3xl sm:text-4xl font-semibold text-on-surface">
                What matters most to you?
              </h2>
              <p className="text-sm text-on-surface-variant">
                This helps the agent prioritize reasoning when tradeoffs arise.
              </p>
            </div>

            <div className="space-y-3">
              {GOALS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGoal(g.id)}
                  className={`w-full p-5 rounded-2xl border text-left flex items-center justify-between transition-all ${
                    goal === g.id
                      ? "border-primary bg-secondary-container ring-1 ring-primary/25 shadow-soft"
                      : "border-outline-variant/40 bg-surface-container-low hover:bg-surface-container"
                  }`}
                >
                  <div>
                    <div className="font-headline font-semibold text-base text-on-surface">
                      {g.label}
                    </div>
                    <div className="text-sm text-on-surface-variant mt-0.5">{g.desc}</div>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ml-4 ${
                      goal === g.id ? "border-primary bg-primary" : "border-outline-variant/60"
                    }`}
                  >
                    {goal === g.id && <Check className="w-3 h-3 text-white" />}
                  </div>
                </button>
              ))}
            </div>

            <p className="text-xs text-on-surface-variant text-center opacity-70">
              Press{" "}
              <kbd className="font-mono px-1.5 py-0.5 rounded bg-surface-container border border-outline-variant/40 text-[10px]">
                Enter
              </kbd>{" "}
              or click to finish setup.
            </p>
          </div>
        )}
      </div>

      {/* Navigation footer */}
      <div className="relative z-10 w-full max-w-2xl px-6 pb-8 pt-4 flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={goBack}
          className={`flex items-center gap-1.5 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors ${
            step === 0 ? "opacity-0 pointer-events-none" : ""
          }`}
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        {step < 3 ? (
          <button
            type="button"
            onClick={goNext}
            disabled={!canAdvance()}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white text-sm font-semibold shadow-soft hover:shadow-card transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleFinish}
            disabled={!canAdvance()}
            className="flex items-center gap-2 px-7 py-3 rounded-xl bg-primary text-white text-sm font-semibold shadow-card hover:shadow-dropdown transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Launch DepthGuard
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

