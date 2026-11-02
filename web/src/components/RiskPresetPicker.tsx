import React from "react";
import { Shield, Scale, Zap, Check } from "lucide-react";

interface Props {
  currentRisk: "conservative" | "balanced" | "aggressive";
  onSelectRisk: (preset: "conservative" | "balanced" | "aggressive") => void;
}

export const RiskPresetPicker: React.FC<Props> = ({ currentRisk, onSelectRisk }) => {
  const presets = [
    {
      id: "conservative" as const,
      name: "Conservative",
      desc: "Capital preservation",
      impactBudget: "25 bps",
      maxTrade: "5%",
      cooldown: "120s",
      icon: Shield,
    },
    {
      id: "balanced" as const,
      name: "Balanced",
      desc: "Default optimal profile",
      impactBudget: "60 bps",
      maxTrade: "10%",
      cooldown: "60s",
      icon: Scale,
    },
    {
      id: "aggressive" as const,
      name: "Aggressive",
      desc: "Higher throughput",
      impactBudget: "120 bps",
      maxTrade: "20%",
      cooldown: "30s",
      icon: Zap,
    },
  ];

  return (
    <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/40 shadow-soft p-5 space-y-3.5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-headline text-sm font-semibold text-on-surface">
            Risk-Appetite Profiles
          </h3>
          <p className="font-body text-xs text-on-surface-variant">
            Deterministic parameter bounds for the preflight sizer
          </p>
        </div>
        <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-secondary-container text-on-secondary-container uppercase">
          Active: {currentRisk}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {presets.map((p) => {
          const isActive = currentRisk === p.id;
          const Icon = p.icon;

          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectRisk(p.id)}
              className={`relative text-left p-3.5 rounded-2xl border transition-all text-xs ${
                isActive
                  ? "bg-secondary-container/60 border-primary shadow-soft ring-1 ring-primary/30"
                  : "bg-surface-container-low border-outline-variant/40 hover:bg-surface-container hover:border-outline-variant/60"
              }`}
            >
              {isActive && (
                <span className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </span>
              )}

              <div className="flex items-center gap-2">
                <div
                  className={`p-1.5 rounded-lg ${
                    isActive ? "bg-white text-primary shadow-soft" : "bg-surface-container text-on-surface-variant"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-headline font-semibold text-xs text-on-surface">{p.name}</div>
                  <div className="text-[10px] text-on-surface-variant">{p.desc}</div>
                </div>
              </div>

              <div className="mt-2.5 pt-2 border-t border-outline-variant/30 grid grid-cols-3 gap-1 text-center font-mono text-[10px]">
                <div>
                  <div className="text-[9px] uppercase text-on-surface-variant font-sans">Budget</div>
                  <div className="font-bold text-on-surface mt-0.5">{p.impactBudget}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase text-on-surface-variant font-sans">Max Size</div>
                  <div className="font-bold text-on-surface mt-0.5">{p.maxTrade}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase text-on-surface-variant font-sans">Cooldown</div>
                  <div className="font-bold text-on-surface mt-0.5">{p.cooldown}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
