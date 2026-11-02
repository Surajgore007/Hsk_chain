import React from "react";
import { TrendingUp, TrendingDown, Wallet } from "lucide-react";
import type { PortfolioData } from "../types";

interface Props {
  portfolio: PortfolioData | null;
}

export const Portfolio: React.FC<Props> = ({ portfolio }) => {
  if (!portfolio) {
    return (
      <div className="p-8 text-center text-xs font-mono text-on-surface-variant bg-surface-container-lowest rounded-3xl border border-outline-variant/40">
        Loading portfolio telemetry...
      </div>
    );
  }

  const isProfitable = portfolio.pnlPercent >= 0;
  const navUSDT = (Number(portfolio.navQuote) / 1e6).toFixed(2);
  const realizedUSDT = (Number(portfolio.realizedPnlQuote) / 1e6).toFixed(2);
  const unrealizedUSDT = (Number(portfolio.unrealizedPnlQuote) / 1e6).toFixed(2);
  const baseBal = (Number(portfolio.baseBalance) / 1e18).toFixed(4);
  const quoteBal = (Number(portfolio.quoteBalance) / 1e6).toFixed(2);
  const avgCost = (Number(portfolio.avgCostBasisQuote) / 1e6).toFixed(2);

  return (
    <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/40 shadow-soft p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-headline text-sm font-semibold text-on-surface">
            Portfolio NAV & Positions
          </h3>
          <p className="font-body text-xs text-on-surface-variant">
            Live on-chain token balances and position cost basis
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container text-xs font-mono text-on-surface-variant">
          <Wallet className="w-3.5 h-3.5 text-primary" />
          <span>ExecutionGuard Vault</span>
        </div>
      </div>

      {/* Main NAV Header Card */}
      <div className="p-5 rounded-2xl bg-surface-container-low border border-outline-variant/40 shadow-soft flex items-center justify-between">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-on-surface-variant font-medium">
            Total Net Asset Value (NAV)
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-mono text-3xl font-bold text-on-surface">${navUSDT}</span>
            <span className="font-mono text-xs text-on-surface-variant">tUSDT</span>
          </div>
          <div className="text-[11px] font-mono text-on-surface-variant mt-1">
            Realized: <span className="text-on-surface font-semibold">${realizedUSDT}</span> · Unrealized:{" "}
            <span className="text-on-surface font-semibold">${unrealizedUSDT}</span>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[10px] font-mono uppercase tracking-wider text-on-surface-variant font-medium">
            Net Return
          </span>
          <div
            className={`font-mono text-xl font-bold mt-1 flex items-center justify-end gap-1 ${
              isProfitable ? "text-primary" : "text-error"
            }`}
          >
            {isProfitable ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            <span>
              {isProfitable ? "+" : ""}
              {portfolio.pnlPercent.toFixed(2)}%
            </span>
          </div>
          <div className="text-[10px] font-mono text-on-surface-variant mt-1">
            Spot: ${portfolio.spotPriceDisplay.toFixed(4)}
          </div>
        </div>
      </div>

      {/* 4 Asset Telemetry Cards */}
      <div className="grid grid-cols-2 gap-2.5 text-xs font-mono">
        <div className="p-3 rounded-2xl bg-surface-container-low border border-outline-variant/30">
          <div className="text-[10px] text-on-surface-variant font-sans uppercase">WHSK Vault Balance</div>
          <div className="font-bold text-on-surface text-sm mt-1">{baseBal} WHSK</div>
          <div className="text-[10px] text-on-surface-variant font-sans mt-0.5">Base Asset (18 decimals)</div>
        </div>

        <div className="p-3 rounded-2xl bg-surface-container-low border border-outline-variant/30">
          <div className="text-[10px] text-on-surface-variant font-sans uppercase">tUSDT Vault Balance</div>
          <div className="font-bold text-on-surface text-sm mt-1">${quoteBal} tUSDT</div>
          <div className="text-[10px] text-on-surface-variant font-sans mt-0.5">Quote Stablecoin (6 decimals)</div>
        </div>

        <div className="p-3 rounded-2xl bg-surface-container-low border border-outline-variant/30">
          <div className="text-[10px] text-on-surface-variant font-sans uppercase">Avg Cost Basis</div>
          <div className="font-bold text-on-surface text-sm mt-1">${avgCost} / WHSK</div>
          <div className="text-[10px] text-on-surface-variant font-sans mt-0.5">Volume-weighted acquisition</div>
        </div>

        <div className="p-3 rounded-2xl bg-surface-container-low border border-outline-variant/30">
          <div className="text-[10px] text-on-surface-variant font-sans uppercase">Live Spot vs Ref</div>
          <div className="font-bold text-on-surface text-sm mt-1">
            ${portfolio.spotPriceDisplay.toFixed(4)} / ${portfolio.refPriceDisplay.toFixed(4)}
          </div>
          <div className="text-[10px] text-on-surface-variant font-sans mt-0.5">Our Pool vs Mainnet Read-Only</div>
        </div>
      </div>
    </div>
  );
};
