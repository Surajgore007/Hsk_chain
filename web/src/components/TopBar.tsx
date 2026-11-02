import React from "react";
import { Shield, Power, AlertTriangle, User, ArrowLeft } from "lucide-react";
import type { AppState, UserProfile } from "../types";

interface Props {
  state: AppState | null;
  onToggleAuto: () => void;
  onEmergencyStop: () => void;
  userProfile: UserProfile | null;
  onOpenProfile: () => void;
  onGoHome: () => void;
}

export const TopBar: React.FC<Props> = ({
  state,
  onToggleAuto,
  onEmergencyStop,
  userProfile,
  onOpenProfile,
  onGoHome,
}) => {
  const isReplay = state?.isReplayMode ?? false;

  return (
    <header className="h-14 shrink-0 bg-surface-container-lowest/95 backdrop-blur-md border-b border-outline-variant/40 px-4 sm:px-5 flex items-center justify-between gap-3 z-40">
      {/* Brand & Back to Overview */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        <button
          type="button"
          onClick={onGoHome}
          className="flex items-center gap-2 text-left group shrink-0 cursor-pointer"
          title="Return to Overview & Simulator"
        >
          <div className="w-7 h-7 rounded-xl bg-primary text-white flex items-center justify-center shadow-soft group-hover:scale-105 transition-transform">
            <Shield className="w-3.5 h-3.5" />
          </div>
          <div className="hidden sm:block">
            <div className="flex items-center gap-1.5">
              <span className="font-headline font-bold text-sm tracking-tight text-on-surface">
                Fathom
              </span>
              <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded-md bg-secondary-container text-on-secondary-container">
                HSKSwap
              </span>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={onGoHome}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold text-on-surface-variant hover:text-on-surface bg-surface-container/60 hover:bg-surface-container transition-all cursor-pointer border border-outline-variant/30"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-primary" />
          <span className="hidden md:inline">Overview & Simulator</span>
          <span className="md:hidden">Overview</span>
        </button>
      </div>

      {/* Center: network status */}
      <div className="flex items-center gap-2">
        {/* Live ping */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-surface-container border border-outline-variant/40 text-xs">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          <span className="font-mono text-[11px] text-on-surface font-medium">HSK Testnet (133)</span>
        </div>

        {/* Mode badge */}
        <span
          className={`hidden lg:inline-flex text-[10px] font-mono font-semibold px-2 py-0.5 rounded-lg border ${
            isReplay
              ? "bg-tertiary-container text-on-tertiary-container border-tertiary/20"
              : "bg-secondary-container text-on-secondary-container border-primary/20"
          }`}
        >
          {isReplay ? "REPLAY" : "LIVE"}
        </span>

        {/* Risk badge */}
        {state?.currentRisk && (
          <span className="hidden xl:inline-flex text-[10px] font-mono font-semibold px-2 py-0.5 rounded-lg border border-outline-variant/40 bg-surface-container text-on-surface-variant uppercase">
            {state.currentRisk}
          </span>
        )}
      </div>

      {/* Right: controls */}
      <div className="flex items-center gap-2">
        {/* Profile pill */}
        <button
          type="button"
          onClick={onOpenProfile}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/40 text-xs font-medium text-on-surface transition-all shadow-soft cursor-pointer"
          title="Edit trading profile"
        >
          <User className="w-3.5 h-3.5 text-primary" />
          <span className="font-semibold">{userProfile?.name || "Profile"}</span>
          {userProfile?.riskPreference && (
            <span className="text-[9px] font-mono text-primary font-bold uppercase hidden sm:inline">
              · {userProfile.riskPreference.slice(0, 4)}
            </span>
          )}
        </button>

        {/* Auto toggle */}
        <button
          type="button"
          onClick={onToggleAuto}
          className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-xl border transition-all shadow-soft cursor-pointer ${
            state?.autoEnabled
              ? "bg-primary text-white border-primary"
              : "bg-surface-container-low text-on-surface-variant border-outline-variant/40 hover:bg-surface-container"
          }`}
        >
          <Power className="w-3 h-3" />
          <span className="hidden sm:inline">AUTO: {state?.autoEnabled ? "ON" : "OFF"}</span>
          <span className="sm:hidden">{state?.autoEnabled ? "ON" : "OFF"}</span>
        </button>

        {/* Emergency halt */}
        <button
          type="button"
          onClick={onEmergencyStop}
          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-error-container text-on-error-container border border-error/30 hover:bg-error hover:text-white transition-all shadow-soft cursor-pointer"
          title="ExecutionGuard.pause() — halts all swaps on-chain"
        >
          <AlertTriangle className="w-3 h-3" />
          <span className="hidden sm:inline">HALT</span>
        </button>
      </div>
    </header>
  );
};
