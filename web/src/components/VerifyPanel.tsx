import React, { useState } from "react";
import { ExternalLink, RefreshCw, CheckCircle2, XCircle, ShieldCheck, Clock, Cpu, Radio } from "lucide-react";
import type { VerifyData } from "../types";

interface Props {
  data: VerifyData | null;
  onRecheck: () => void;
  isChecking: boolean;
}

export const VerifyPanel: React.FC<Props> = ({ data, onRecheck, isChecking }) => {
  const [expandedSection, setExpandedSection] = useState<string | null>("health");

  if (!data) {
    return (
      <div className="p-8 text-center bg-surface-container-lowest rounded-3xl border border-outline-variant/40 shadow-soft">
        <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-primary/60" />
        <p className="text-xs font-mono text-on-surface-variant">Loading verification data...</p>
      </div>
    );
  }

  const explorerBase = data.explorerBase || "https://testnet-explorer.hskchain.net";

  const toggleSection = (s: string) => setExpandedSection(prev => prev === s ? null : s);

  return (
    <div className="space-y-4">
      {/* Live Health Strip */}
      <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/40 shadow-soft p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-primary" />
            <h3 className="font-headline text-sm font-semibold text-on-surface">Live System Health</h3>
          </div>
          <button
            type="button"
            onClick={onRecheck}
            disabled={isChecking}
            className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/40 text-on-surface-variant hover:text-on-surface transition-all disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${isChecking ? "animate-spin" : ""}`} />
            Re-check
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <div className="p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30">
            <div className="text-[10px] text-on-surface-variant font-sans uppercase">RPC Status</div>
            <div className={`font-bold mt-0.5 flex items-center gap-1 ${data.rpcOk ? "text-primary" : "text-error"}`}>
              {data.rpcOk ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
              {data.rpcOk ? "Online" : "Unavailable"}
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30">
            <div className="text-[10px] text-on-surface-variant font-sans uppercase">Block</div>
            <div className="font-bold text-on-surface mt-0.5">#{data.currentBlock ? BigInt(data.currentBlock).toLocaleString() : "—"}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30">
            <div className="text-[10px] text-on-surface-variant font-sans uppercase">Last Loop</div>
            <div className="font-bold text-on-surface mt-0.5">{data.secondsSinceLastCycle}s ago</div>
          </div>
          <div className="p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30">
            <div className="text-[10px] text-on-surface-variant font-sans uppercase">Reasoning Engine</div>
            <div className={`font-bold mt-0.5 flex items-center gap-1 ${(data.neuralEngineConfigured ?? data.groqApiConfigured) ? "text-primary" : "text-tertiary"}`}>
              <Cpu className="w-3 h-3" />
              {(data.neuralEngineConfigured ?? data.groqApiConfigured) ? "Neural Brain Active" : "Rules Engine"}
            </div>
          </div>
        </div>

        <div className="mt-2.5 flex items-center gap-2 text-[11px] font-mono text-on-surface-variant">
          <Clock className="w-3 h-3" />
          <span>Loop every {data.loopIntervalSeconds}s · Auto: <span className={data.autoEnabled ? "text-primary font-bold" : "text-error font-bold"}>{data.autoEnabled ? "ON" : "OFF"}</span> · Vault: <span className={data.isPaused ? "text-error font-bold" : "text-primary font-bold"}>{data.isPaused ? "PAUSED" : "ACTIVE"}</span></span>
        </div>
      </div>

      {/* On-Chain Contract Parameters */}
      <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/40 shadow-soft p-4 space-y-3">
        <button
          type="button"
          onClick={() => toggleSection("params")}
          className="flex items-center justify-between w-full cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <h3 className="font-headline text-sm font-semibold text-on-surface">Vault Parameters (Live)</h3>
          </div>
          <span className="text-[10px] font-mono text-on-surface-variant">{expandedSection === "params" ? "▲" : "▼"}</span>
        </button>

        {expandedSection === "params" && (
          <div className="space-y-1.5 text-xs">
            <div className="rounded-xl bg-surface-container-low border border-outline-variant/30 p-3 font-mono text-[11px] space-y-1.5">
              {Object.entries(data.onchainParams).map(([key, val]) => (
                <div key={key} className="flex justify-between items-center">
                  <span className="text-on-surface-variant">{key}:</span>
                  <span className={`font-bold ${key === "paused" && val === "true" ? "text-error" : "text-on-surface"}`}>{val}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-on-surface-variant font-sans px-1">Read live from ExecutionGuard contract via eth_call. No caching.</p>
          </div>
        )}
      </div>

      {/* Contract Addresses */}
      <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/40 shadow-soft p-4 space-y-3">
        <button
          type="button"
          onClick={() => toggleSection("contracts")}
          className="flex items-center justify-between w-full cursor-pointer"
        >
          <h3 className="font-headline text-sm font-semibold text-on-surface">Verified Contract Addresses</h3>
          <span className="text-[10px] font-mono text-on-surface-variant">{expandedSection === "contracts" ? "▲" : "▼"}</span>
        </button>

        {expandedSection === "contracts" && (
          <div className="space-y-1.5">
            {Object.entries(data.contracts).map(([name, address]) => (
              <div key={name} className="p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 flex items-center justify-between text-xs">
                <div>
                  <div className="font-semibold text-on-surface capitalize">{name.replace(/([A-Z])/g, ' $1').trim()}</div>
                  <div className="font-mono text-[10px] text-on-surface-variant truncate max-w-[220px]">{address}</div>
                </div>
                <a
                  href={`${explorerBase}/address/${address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-on-surface-variant hover:text-primary transition-colors shadow-soft"
                  title="View on Explorer"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* On-chain vs Off-chain enforcement */}
      <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/40 shadow-soft p-4 space-y-3">
        <button
          type="button"
          onClick={() => toggleSection("enforcement")}
          className="flex items-center justify-between w-full cursor-pointer"
        >
          <h3 className="font-headline text-sm font-semibold text-on-surface">What is Enforced Where</h3>
          <span className="text-[10px] font-mono text-on-surface-variant">{expandedSection === "enforcement" ? "▲" : "▼"}</span>
        </button>

        {expandedSection === "enforcement" && (
          <div className="space-y-2 text-xs">
            <div className="rounded-xl bg-secondary-container/30 border border-primary/20 p-3">
              <div className="font-semibold text-primary mb-2 font-mono text-[11px]">✅ ON-CHAIN (smart contract)</div>
              <ul className="space-y-1">
                {data.onchainEnforced.map((item, i) => (
                  <li key={i} className="text-on-surface-variant flex items-start gap-1.5">
                    <span className="text-primary mt-0.5 shrink-0">·</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl bg-surface-container-low border border-outline-variant/30 p-3">
              <div className="font-semibold text-on-surface-variant mb-2 font-mono text-[11px]">🔒 OFF-CHAIN (TypeScript risk engine)</div>
              <ul className="space-y-1">
                {data.offchainEnforced.map((item, i) => (
                  <li key={i} className="text-on-surface-variant flex items-start gap-1.5">
                    <span className="mt-0.5 shrink-0">·</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-[10px] text-on-surface-variant font-sans px-1">
              Stop-loss, take-profit and drawdown limits run in the off-chain risk engine. Per-trade cap, cooldown, nonce and on-chain minimum-output floor are enforced by the smart contract and cannot be bypassed. This contract has not been formally audited.
            </p>
          </div>
        )}
      </div>

      {/* Recent On-Chain Events */}
      <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/40 shadow-soft p-4 space-y-3">
        <h3 className="font-headline text-sm font-semibold text-on-surface">Recent On-Chain Events</h3>
        {data.recentDecisions.length === 0 ? (
          <p className="text-xs font-mono text-on-surface-variant text-center py-4">No on-chain events recorded yet in this session.</p>
        ) : (
          <div className="space-y-1.5">
            {data.recentDecisions.map((d) => {
              const isFull = d.decision === "EXECUTE_FULL";
              const isTrim = d.decision === "EXECUTE_TRIMMED";
              const badgeColor = isFull
                ? "bg-secondary-container text-on-secondary-container border-primary/30"
                : isTrim
                ? "bg-tertiary-container text-on-tertiary-container border-tertiary/30"
                : "bg-error-container text-on-error-container border-error/30";
              return (
                <div key={d.id} className="p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${badgeColor}`}>{d.decision}</span>
                    <span className="text-on-surface-variant font-mono text-[10px]">{new Date(d.ts).toLocaleTimeString()}</span>
                    <span className="text-on-surface-variant font-mono text-[10px]">{d.pair}</span>
                  </div>
                  {d.txHash && d.txHash !== "0x0000000000000000000000000000000000000000000000000000000000000000" ? (
                    <a
                      href={`${explorerBase}/tx/${d.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-[10px] font-mono font-semibold text-primary hover:text-primary/80"
                    >
                      {d.txHash.slice(0, 6)}...{d.txHash.slice(-4)}
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  ) : (
                    <span className="text-[10px] font-mono text-on-surface-variant/50">No on-chain tx</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

