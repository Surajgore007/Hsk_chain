import React, { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { DecisionRecord } from "../types";

interface Props {
  decisions: DecisionRecord[];
}

export const Ledger: React.FC<Props> = ({ decisions }) => {
  const [filter, setFilter] = useState<"ALL" | "EXECUTE_FULL" | "EXECUTE_TRIMMED" | "NO_TRADE">("ALL");

  const filtered = decisions.filter((d) => (filter === "ALL" ? true : d.decision === filter));

  const downloadLedgerJson = () => {
    const json = JSON.stringify(decisions, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fathom-ledger-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadLedgerCsv = () => {
    const headers = ["id", "timestamp", "decision", "reasonCode", "pair", "side", "requestedAmount", "decidedAmount", "impactBps", "budgetBps", "netEdgeBps", "txHash"];
    const rows = decisions.map(d => [
      d.id,
      new Date(d.ts).toISOString(),
      d.decision,
      d.reasonCode,
      d.pair,
      d.side,
      d.requestedAmountIn,
      d.decidedAmountIn,
      d.priceImpactBpsAtDecided,
      d.impactBudgetBps,
      d.netEdgeBps ?? "",
      d.txHash || "",
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fathom-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/40 shadow-soft p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="font-headline text-sm font-semibold text-on-surface">
            Execution Ledger & Decision History
          </h3>
          <p className="font-body text-xs text-on-surface-variant">
            Verifiable log of every trade proposal, trim, and refusal
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 p-1 bg-surface-container rounded-xl text-xs font-mono text-on-surface-variant self-start sm:self-auto">
          {(["ALL", "EXECUTE_FULL", "EXECUTE_TRIMMED", "NO_TRADE"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`px-2 py-1 rounded-lg transition-all ${
                filter === tab
                  ? "bg-surface-container-lowest text-on-surface shadow-soft font-bold"
                  : "hover:text-on-surface"
              }`}
            >
              {tab === "ALL" ? "All" : tab === "EXECUTE_FULL" ? "Executed" : tab === "EXECUTE_TRIMMED" ? "Trimmed" : "Refused"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={downloadLedgerJson}
            className="flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/40 text-on-surface-variant hover:text-on-surface transition-all cursor-pointer shadow-soft"
            title="Download session ledger as JSON"
          >
            ↓ JSON
          </button>
          <button
            type="button"
            onClick={downloadLedgerCsv}
            className="flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/40 text-on-surface-variant hover:text-on-surface transition-all cursor-pointer shadow-soft"
            title="Download session ledger as CSV"
          >
            ↓ CSV
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-8 text-center text-xs font-mono text-on-surface-variant bg-surface-container-low/40 rounded-2xl">
          No records match current filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-outline-variant/30">
          <table className="w-full text-xs text-left">
            <thead className="bg-surface-container-low text-on-surface-variant font-mono text-[11px] border-b border-outline-variant/30">
              <tr>
                <th className="py-2.5 px-3">Time</th>
                <th className="py-2.5 px-3">Verdict</th>
                <th className="py-2.5 px-3">Reason Code</th>
                <th className="py-2.5 px-3">Req → Decided</th>
                <th className="py-2.5 px-3">Impact / Budget</th>
                <th className="py-2.5 px-3">Net Edge</th>
                <th className="py-2.5 px-3 text-right">Explorer Proof</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container font-mono text-[11px]">
              {filtered.map((d) => {
                const isFull = d.decision === "EXECUTE_FULL";
                const isTrim = d.decision === "EXECUTE_TRIMMED";
                const badgeColor = isFull
                  ? "bg-secondary-container text-on-secondary-container border-primary/30"
                  : isTrim
                  ? "bg-tertiary-container text-on-tertiary-container border-tertiary/30"
                  : "bg-error-container text-on-error-container border-error/30";

                return (
                  <tr key={d.id} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="py-2 px-3 text-on-surface-variant">
                      {new Date(d.ts).toLocaleTimeString()}
                    </td>
                    <td className="py-2 px-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeColor}`}>
                        {d.decision}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-on-surface font-semibold">
                      {d.reasonCode}
                    </td>
                    <td className="py-2 px-3 text-on-surface-variant">
                      {d.requestedAmountIn} &rarr; {d.decidedAmountIn}
                    </td>
                    <td className="py-2 px-3 text-on-surface-variant">
                      <span className="font-bold text-on-surface">{d.priceImpactBpsAtDecided}</span> / {d.impactBudgetBps} bps
                    </td>
                    <td className="py-2 px-3">
                      {d.netEdgeBps !== undefined ? (
                        <span className={`font-bold ${d.netEdgeBps > 0 ? "text-primary" : "text-error"}`}>
                          {d.netEdgeBps > 0 ? `+${d.netEdgeBps}` : d.netEdgeBps} bps
                        </span>
                      ) : (
                        <span className="text-on-surface-variant/50">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {d.txHash && d.txHash !== "0x0000000000000000000000000000000000000000000000000000000000000000" ? (
                        <a
                          href={`https://testnet-explorer.hskchain.net/tx/${d.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-semibold text-primary hover:text-primary-container"
                        >
                          <span>{d.txHash.slice(0, 6)}...{d.txHash.slice(-4)}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-on-surface-variant/50">Simulated</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
