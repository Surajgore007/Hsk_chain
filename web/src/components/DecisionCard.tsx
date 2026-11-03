import React from "react";
import { CheckCircle2, AlertCircle, XCircle, ExternalLink, ShieldCheck } from "lucide-react";
import type { DecisionRecord } from "../types";

interface Props {
  decision: DecisionRecord | null;
}

export const DecisionCard: React.FC<Props> = ({ decision }) => {
  if (!decision) {
    return (
      <div className="p-8 text-center bg-surface-container-lowest rounded-3xl border border-outline-variant/40 text-on-surface-variant shadow-soft">
        <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-primary/60" />
        <p className="text-xs font-mono">Awaiting first trading decision receipt...</p>
      </div>
    );
  }

  const isFull = decision.decision === "EXECUTE_FULL";
  const isTrimmed = decision.decision === "EXECUTE_TRIMMED";

  const chipColor = isFull
    ? "bg-secondary-container text-on-secondary-container border-primary/30"
    : isTrimmed
    ? "bg-tertiary-container text-on-tertiary-container border-tertiary/30"
    : "bg-error-container text-on-error-container border-error/30";

  const Icon = isFull ? CheckCircle2 : isTrimmed ? AlertCircle : XCircle;

  const budget = decision.impactBudgetBps || 60;
  const impact = decision.priceImpactBpsAtDecided || 0;
  const progressPercent = Math.min(Math.round((impact / budget) * 100), 100);

  return (
    <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/40 shadow-soft p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-container pb-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold border ${chipColor}`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{decision.decision}</span>
          </span>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-surface-container text-on-surface-variant border border-outline-variant/40">
            {decision.reasonCode}
          </span>
        </div>
        <span className="text-[10px] font-mono text-on-surface-variant">
          {new Date(decision.ts).toLocaleTimeString()}
        </span>
      </div>

      {/* Human Explanation */}
      <div className="p-3.5 rounded-2xl bg-surface-container-low border border-outline-variant/40 text-xs text-on-surface leading-relaxed font-sans">
        {decision.humanReason}
      </div>

      {/* Progress Bar: Impact vs Budget */}
      <div className="space-y-1.5 p-3 rounded-2xl bg-surface-container-low border border-outline-variant/30">
        <div className="flex justify-between text-xs font-mono">
          <span className="text-on-surface-variant">Impact vs Hard Cap</span>
          <span className="font-bold text-primary">
            {impact} bps / {budget} bps
          </span>
        </div>
        <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden flex">
          <div
            className={`h-full transition-all duration-300 ${
              impact <= budget ? "bg-primary" : "bg-error"
            }`}
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>
      </div>

      {/* Key Numbers Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
        <div className="p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30">
          <div className="text-[10px] text-on-surface-variant font-sans uppercase">Side / Target</div>
          <div className="font-bold text-on-surface mt-0.5 truncate">
            {decision.side} {decision.pair}
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30">
          <div className="text-[10px] text-on-surface-variant font-sans uppercase">Decided Size</div>
          <div className="font-bold text-on-surface mt-0.5 truncate">
            {Number(decision.decidedAmountIn) > 0 ? `${decision.decidedAmountIn} raw` : "0 (Refused)"}
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30">
          <div className="text-[10px] text-on-surface-variant font-sans uppercase">Impact Bps</div>
          <div className="font-bold text-primary mt-0.5">
            {impact} bps
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30">
          <div className="text-[10px] text-on-surface-variant font-sans uppercase">Floor Output</div>
          <div className="font-bold text-on-surface mt-0.5 truncate">
            {decision.minOut !== "0" ? decision.minOut : "None"}
          </div>
        </div>

        {/* Net Edge — only show if available */}
        {(decision as any).netEdgeBps !== undefined && (
          <div className="p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 col-span-2 sm:col-span-4">
            <div className="text-[10px] text-on-surface-variant font-sans uppercase">Net Edge Breakdown</div>
            <div className="font-bold text-on-surface mt-0.5 font-mono text-xs">
              Spread {(decision as any).devBps ?? "?"}bps − Fee {(decision as any).feeBps ?? 30}bps − Impact {decision.priceImpactBpsAtDecided}bps = {" "}
              <span className={(decision as any).netEdgeBps > 0 ? "text-primary" : "text-error"}>
                {(decision as any).netEdgeBps > 0 ? "+" : ""}{(decision as any).netEdgeBps ?? "?"}bps
              </span>
              {(decision as any).netEdgeBps <= 0 && <span className="text-error font-sans text-[10px] ml-1">(refused — negative edge)</span>}
            </div>
          </div>
        )}
      </div>

      {/* On-Chain Evidence / Explorer Link */}
      {decision.txHash && decision.txHash !== "0x0000000000000000000000000000000000000000000000000000000000000000" && (
        <div className="pt-2 border-t border-surface-container flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-on-surface-variant">
            <span>Tx:</span>
            <span className="text-on-surface font-semibold">
              {decision.txHash.slice(0, 10)}...{decision.txHash.slice(-8)}
            </span>
          </div>
          <a
            href={`https://testnet-explorer.hskchain.net/tx/${decision.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-primary hover:text-primary-container"
          >
            <span>HSK Explorer</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  );
};
