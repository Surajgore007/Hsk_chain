import React from "react";
import type { DecisionRecord } from "../types";
import { CheckCircle2, AlertCircle, XCircle } from "lucide-react";

interface Props {
  decisions: DecisionRecord[];
}

export const DecisionTicker: React.FC<Props> = ({ decisions }) => {
  if (decisions.length === 0) return null;

  return (
    <div className="bg-slate-900 text-slate-300 py-1.5 px-4 text-xs border-b border-slate-800 overflow-hidden flex items-center space-x-3">
      <span className="font-mono text-[10px] uppercase font-bold text-sky-400 bg-sky-950 px-2 py-0.5 rounded border border-sky-800/80 whitespace-nowrap">
        Live Ledger Ticker
      </span>
      <div className="flex items-center space-x-6 overflow-x-auto no-scrollbar whitespace-nowrap">
        {decisions.slice(0, 5).map((d) => {
          const isFull = d.decision === "EXECUTE_FULL";
          const isTrim = d.decision === "EXECUTE_TRIMMED";
          const color = isFull
            ? "text-emerald-400"
            : isTrim
            ? "text-amber-400"
            : "text-rose-400";
          const Icon = isFull ? CheckCircle2 : isTrim ? AlertCircle : XCircle;

          return (
            <div key={d.id} className="flex items-center space-x-1.5 font-mono text-[11px]">
              <Icon className={`w-3.5 h-3.5 ${color}`} />
              <span className={`font-semibold ${color}`}>{d.decision}</span>
              <span className="text-slate-400">({d.side} {d.pair})</span>
              <span className="text-slate-500">Impact: {d.priceImpactBpsAtDecided} bps</span>
              {d.txHash && (
                <span className="text-slate-600">tx: {d.txHash.slice(0, 6)}...</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

