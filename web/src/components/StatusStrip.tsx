import React from "react";
import { TrendingUp, ShieldAlert, Activity, DollarSign, Wallet } from "lucide-react";
import type { AppState, PortfolioData } from "../types";

interface Props {
  state: AppState | null;
  portfolio: PortfolioData | null;
  networkSource: "testnet" | "mainnet";
}

export const StatusStrip: React.FC<Props> = ({ state, portfolio, networkSource }) => {
  const isAuto = state?.autoEnabled ?? false;
  const pair = (state as any)?.activePair || "WHSK/tUSDT";
  const budgetBps = state?.riskConfig?.impactBudgetBps ?? 60;
  const riskMode = state?.currentRisk ?? "balanced";
  const pnlPercent = portfolio?.pnlPercent ?? 0;
  const isProfit = pnlPercent >= 0;

  // Format balances
  const baseBal = portfolio?.baseBalance ?? "—";
  const quoteBal = portfolio?.quoteBalance ?? "—";

  return (
    <div className="shrink-0 bg-surface-container-low/80 backdrop-blur-sm border-b border-outline-variant/30 px-3 sm:px-5 py-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] font-mono text-on-surface-variant z-30">
      {/* Left: Active Pair, Mode, Network Badge */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-bold text-on-surface flex items-center gap-1.5">
          <Activity className="w-3 h-3 text-primary" />
          <span>{pair}</span>
        </span>

        <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase border ${
          isAuto
            ? "bg-secondary-container text-on-secondary-container border-primary/30"
            : "bg-surface-container text-on-surface-variant border-outline-variant/40"
        }`}>
          {isAuto ? "AUTO" : "MANUAL"}
        </span>

        <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface-container border border-outline-variant/30 text-on-surface-variant">
          {networkSource === "mainnet" ? "HSK Mainnet (177)" : "HSK Testnet (133)"}
        </span>

        <span className="text-[10px] text-on-surface-variant hidden md:inline">
          Budget: <span className="font-bold text-primary">{budgetBps} bps</span> ({riskMode})
        </span>
      </div>

      {/* Middle: Balances & NAV */}
      <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Wallet className="w-3 h-3 text-on-surface-variant/70 shrink-0" />
          <span className="hidden sm:inline text-on-surface-variant text-[10px]">Vault:</span>
          <span className="text-on-surface font-semibold truncate max-w-[150px] sm:max-w-none">
            {baseBal} / {quoteBal}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <DollarSign className="w-3 h-3 text-on-surface-variant/70 shrink-0" />
          <span className="text-on-surface-variant text-[10px]">NAV:</span>
          <span className="text-on-surface font-bold">
            {portfolio?.navQuote ? `${portfolio.navQuote} tUSDT` : "—"}
          </span>
        </div>
      </div>

      {/* Right: Realized/Unrealized P&L & Circuit Breakers */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <TrendingUp className={`w-3 h-3 ${isProfit ? "text-primary" : "text-error"}`} />
          <span className="text-on-surface-variant text-[10px]">P&L:</span>
          <span className={`font-bold ${isProfit ? "text-primary" : "text-error"}`}>
            {portfolio?.totalPnlQuote ? `${portfolio.totalPnlQuote} tUSDT` : "$0.00"} ({isProfit ? "+" : ""}{pnlPercent.toFixed(2)}%)
          </span>
        </div>

        <div className="hidden lg:flex items-center gap-1.5 text-[10px] text-on-surface-variant">
          <ShieldAlert className="w-3 h-3 text-tertiary shrink-0" />
          <span>SL 5% / TP 10% / Max DD 15%</span>
        </div>
      </div>
    </div>
  );
};

