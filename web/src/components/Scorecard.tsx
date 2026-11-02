import React from "react";
import { Award, ShieldCheck, CheckCircle2 } from "lucide-react";
import type { ScorecardMetrics } from "../types";

interface Props {
  scorecard: ScorecardMetrics | null;
}

export const Scorecard: React.FC<Props> = ({ scorecard }) => {
  if (!scorecard) {
    return (
      <div className="p-8 text-center text-xs font-mono text-on-surface-variant bg-surface-container-lowest rounded-3xl border border-outline-variant/40">
        Loading execution quality metrics...
      </div>
    );
  }

  const lossAvoided = (Number(scorecard.totalLossAvoidedQuote) / 1e6).toFixed(2);

  return (
    <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/40 shadow-soft p-5 space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4 text-primary" />
          <h3 className="font-headline text-sm font-semibold text-on-surface">
            Execution-Quality Scorecard
          </h3>
        </div>
        <p className="font-body text-xs text-on-surface-variant mt-0.5">
          Audited record of compliance, slippage preservation, and estimation precision
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono">
        <div className="p-3 rounded-2xl bg-secondary-container/40 border border-primary/20">
          <div className="text-[10px] uppercase font-sans font-semibold text-primary">Executed</div>
          <div className="text-xl font-bold text-on-surface mt-1">{scorecard.executedCount}</div>
          <div className="text-[10px] text-on-surface-variant font-sans">Full safe trades</div>
        </div>

        <div className="p-3 rounded-2xl bg-tertiary-container/40 border border-tertiary/20">
          <div className="text-[10px] uppercase font-sans font-semibold text-tertiary">Trimmed</div>
          <div className="text-xl font-bold text-on-surface mt-1">{scorecard.trimmedCount}</div>
          <div className="text-[10px] text-on-surface-variant font-sans">Sized to budget</div>
        </div>

        <div className="p-3 rounded-2xl bg-error-container/40 border border-error/20">
          <div className="text-[10px] uppercase font-sans font-semibold text-error">Refused</div>
          <div className="text-xl font-bold text-on-surface mt-1">{scorecard.refusedCount}</div>
          <div className="text-[10px] text-on-surface-variant font-sans">Excess slippage</div>
        </div>

        <div className="p-3 rounded-2xl bg-surface-container-low border border-outline-variant/30">
          <div className="text-[10px] uppercase font-sans font-semibold text-on-surface-variant">Compliance</div>
          <div className="text-xl font-bold text-primary mt-1">
            {scorecard.budgetCompliancePercent}%
          </div>
          <div className="text-[10px] text-on-surface-variant font-sans">100% Floor check</div>
        </div>
      </div>

      {/* Avoided Loss & Error Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="p-3.5 rounded-2xl bg-surface-container-low border border-outline-variant/30">
          <div className="text-on-surface-variant font-sans">Impact Loss Avoided</div>
          <div className="text-lg font-bold font-mono text-primary mt-0.5">+${lossAvoided} USDT</div>
          <p className="text-[10px] text-on-surface-variant font-sans mt-0.5">
            Capital preserved by trimming and refusing predatory orders.
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-surface-container-low border border-outline-variant/30">
          <div className="text-on-surface-variant font-sans">Avg Estimation Error</div>
          <div className="text-lg font-bold font-mono text-on-surface mt-0.5">
            {scorecard.avgEstimateErrorBps} bps
          </div>
          <p className="text-[10px] text-on-surface-variant font-sans mt-0.5">
            QuoterV2 off-chain quote variance vs exact on-chain execution.
          </p>
        </div>
      </div>
    </div>
  );
};
