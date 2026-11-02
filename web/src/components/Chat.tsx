import React, { useState, useRef, useEffect } from "react";
import {
  Send,
  CheckCircle2,
  ShieldCheck,
  CornerDownLeft,
  Sliders,
  ArrowDownRight,
  ArrowUpRight,
  User,
  Sparkles,
  ChevronDown,
  AlertTriangle,
  Cpu,
} from "lucide-react";
import type { ChatMessage, UserProfile } from "../types";

interface Props {
  messages: ChatMessage[];
  onSendMessage: (msg: string) => void;
  onConfirmTrade: (previewId: string) => void;
  isLoading: boolean;
  userProfile: UserProfile | null;
  currentRisk: "conservative" | "balanced" | "aggressive";
  onSelectRisk: (preset: "conservative" | "balanced" | "aggressive") => void;
  onTriggerMover: (action: "PUSH_PRICE_DOWN" | "PUSH_PRICE_UP") => void;
}

const QUICK_CHIPS = [
  "status",
  "buy 20%",
  "sell 5 WHSK",
  "be more cautious",
  "why did you refuse?",
  "show positions",
];

export const Chat: React.FC<Props> = ({
  messages,
  onSendMessage,
  onConfirmTrade,
  isLoading,
  userProfile,
  currentRisk,
  onSelectRisk,
  onTriggerMover,
}) => {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  // Track expanded thought process accordions by message ID
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});

  // Auto-expand thought process for the latest agent message
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.sender === "agent" && lastMsg.thoughtProcess) {
      setExpandedThoughts((prev) => ({ ...prev, [lastMsg.id]: true }));
    }
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const toggleThought = (id: string) => {
    setExpandedThoughts((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSendMessage(input.trim());
    setInput("");
  };

  return (
    <div className="flex flex-col h-full bg-surface-container-lowest rounded-3xl border border-outline-variant/40 shadow-soft overflow-hidden">
      {/* Sleek Sub-Header with Active Profile & Demo Tooling */}
      <div className="px-4 py-2.5 border-b border-surface-container flex items-center justify-between gap-3 bg-surface-container-low/40 shrink-0">
        {/* Agent & User Profile Status */}
        <div className="flex items-center gap-2 text-xs">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          <span className="font-headline font-semibold text-on-surface">
            {userProfile?.name ? `${userProfile.name}'s Agent` : "Fathom Console"}
          </span>
          <span className="text-on-surface-variant/40">•</span>
          {/* Quick Risk Pill Switcher */}
          <div className="inline-flex items-center p-0.5 rounded-lg bg-surface-container border border-outline-variant/30 text-[10px] font-mono">
            {(["conservative", "balanced", "aggressive"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onSelectRisk(r)}
                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                  currentRisk === r
                    ? "bg-surface-container-lowest text-primary font-bold shadow-soft"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {r === "conservative" ? "25 bps" : r === "balanced" ? "60 bps" : "120 bps"}
              </button>
            ))}
          </div>
        </div>

        {/* Demo Shift Tools (Compact & Unobtrusive) */}
        <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono">
          <span className="text-on-surface-variant text-[10px] mr-1">Simulate:</span>
          <button
            type="button"
            onClick={() => onTriggerMover("PUSH_PRICE_DOWN")}
            className="flex items-center gap-0.5 px-2 py-1 rounded-md bg-secondary-container text-on-secondary-container hover:bg-secondary-container/80 transition-colors border border-primary/20 cursor-pointer"
            title="Discount pool to trigger Buy signal"
          >
            <ArrowDownRight className="w-3 h-3 text-primary" />
            <span>Price Drop</span>
          </button>
          <button
            type="button"
            onClick={() => onTriggerMover("PUSH_PRICE_UP")}
            className="flex items-center gap-0.5 px-2 py-1 rounded-md bg-tertiary-container text-on-tertiary-container hover:bg-tertiary-container/80 transition-colors border border-tertiary/20 cursor-pointer"
            title="Premium pool to trigger Sell signal"
          >
            <ArrowUpRight className="w-3 h-3 text-tertiary" />
            <span>Price Surge</span>
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
        {messages.map((m) => {
          const isUser = m.sender === "user";
          const isThoughtExpanded = expandedThoughts[m.id] ?? false;

          return (
            <div
              key={m.id}
              className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
            >
              {/* Sender / Badge */}
              <div className="text-[10px] font-mono uppercase text-on-surface-variant mb-1 px-1 flex items-center gap-1.5">
                <span>{isUser ? userProfile?.name || "Human Operator" : "Fathom AI"}</span>
                {m.parserBadge && (
                  <span className="px-1.5 py-0.5 rounded bg-secondary-container text-on-secondary-container font-mono text-[9px] lowercase">
                    via {m.parserBadge}
                  </span>
                )}
              </div>

              {/* Message Bubble Container */}
              <div
                className={`max-w-[88%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                  isUser
                    ? "bg-primary text-white shadow-soft"
                    : "bg-surface-container-low text-on-surface border border-outline-variant/40 shadow-soft"
                }`}
              >
                {/* ─── Expandable Thought Process / Reasoning Block ─── */}
                {!isUser && m.thoughtProcess && m.thoughtProcess.length > 0 && (
                  <div className="mb-3 rounded-xl border border-primary/25 bg-surface-container-lowest overflow-hidden shadow-soft">
                    <button
                      type="button"
                      onClick={() => toggleThought(m.id)}
                      className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-mono text-on-surface hover:bg-surface-container-low/70 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="font-semibold text-primary">
                          Agent Thought Process
                        </span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-secondary-container text-on-secondary-container font-semibold">
                          {m.thoughtProcess.length} steps verified
                        </span>
                      </div>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-on-surface-variant transition-transform duration-200 ${
                          isThoughtExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {isThoughtExpanded && (
                      <div className="px-3 pb-3 pt-1.5 space-y-2 border-t border-outline-variant/20 bg-surface-container-lowest text-[11px]">
                        {m.thoughtProcess.map((step, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <div className="mt-0.5 shrink-0">
                              {step.status === "warning" ? (
                                <AlertTriangle className="w-3.5 h-3.5 text-tertiary" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold font-mono text-on-surface text-[10px]">
                                {step.title}
                              </div>
                              <p className="text-[11px] text-on-surface-variant font-sans leading-snug mt-0.5">
                                {step.detail}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Final Reply Text */}
                <p className="whitespace-pre-line font-sans">{m.text}</p>

                {/* Trade Preview Card */}
                {m.previewCard && (() => {
                  const card = m.previewCard as any;
                  const isSell = card.side === "SELL";
                  const reqFmt = card.requestedAmountIn
                    ? isSell
                      ? `${(Number(card.requestedAmountIn) / 1e18).toFixed(6)} WHSK`
                      : `${(Number(card.requestedAmountIn) / 1e6).toFixed(4)} tUSDT`
                    : `${card.amount?.value} ${card.amount?.unit}`;
                  const decFmt = card.decidedAmountIn
                    ? isSell
                      ? `${(Number(card.decidedAmountIn) / 1e18).toFixed(6)} WHSK`
                      : `${(Number(card.decidedAmountIn) / 1e6).toFixed(4)} tUSDT`
                    : "—";
                  const maxSafeFmt = card.maxSafeAmountIn
                    ? isSell
                      ? `${(Number(card.maxSafeAmountIn) / 1e18).toFixed(6)} WHSK`
                      : `${(Number(card.maxSafeAmountIn) / 1e6).toFixed(4)} tUSDT`
                    : "—";
                  const quoteFmt = card.quotedOut
                    ? isSell
                      ? `${(Number(card.quotedOut) / 1e6).toFixed(4)} tUSDT`
                      : `${(Number(card.quotedOut) / 1e18).toFixed(6)} WHSK`
                    : "—";
                  const minOutFmt = card.minOut
                    ? isSell
                      ? `${(Number(card.minOut) / 1e6).toFixed(4)} tUSDT`
                      : `${(Number(card.minOut) / 1e18).toFixed(6)} WHSK`
                    : "—";
                  const isNoTrade = card.decision === "NO_TRADE";

                  return (
                    <div className="mt-3 p-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant/50 shadow-soft text-on-surface text-xs space-y-2.5">
                      <div className="flex items-center justify-between font-semibold border-b border-surface-container pb-2">
                        <span className="text-primary flex items-center gap-1.5 font-headline">
                          <ShieldCheck className="w-4 h-4" />
                          <span>Order Pre-Flight Verification</span>
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                              isNoTrade
                                ? "bg-error-container text-on-error-container border-error/30"
                                : card.decision === "EXECUTE_TRIMMED"
                                ? "bg-tertiary-container text-on-tertiary-container border-tertiary/30"
                                : "bg-secondary-container text-on-secondary-container border-primary/30"
                            }`}
                          >
                            {card.decision || "PENDING"} {card.reasonCode ? `(${card.reasonCode})` : ""}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] pt-0.5 font-mono">
                        <div>
                          <span className="text-on-surface-variant font-sans">Side:</span>{" "}
                          <span className="font-bold text-on-surface">{card.side}</span>
                        </div>
                        <div>
                          <span className="text-on-surface-variant font-sans">Impact Budget:</span>{" "}
                          <span className="font-bold text-on-surface">{card.impactBudgetBps} bps</span>
                        </div>
                        <div>
                          <span className="text-on-surface-variant font-sans">Requested:</span>{" "}
                          <span className="font-bold text-on-surface">{reqFmt}</span>
                        </div>
                        <div>
                          <span className="text-on-surface-variant font-sans">Decided:</span>{" "}
                          <span className={`font-bold ${isNoTrade ? "text-error" : "text-primary"}`}>{decFmt}</span>
                        </div>
                        <div>
                          <span className="text-on-surface-variant font-sans">Impact (Req):</span>{" "}
                          <span className="font-bold text-on-surface">{card.priceImpactBpsAtRequested ?? 0} bps</span>
                        </div>
                        <div>
                          <span className="text-on-surface-variant font-sans">Impact (Decided):</span>{" "}
                          <span className={`font-bold ${card.priceImpactBpsAtDecided <= card.impactBudgetBps ? "text-primary" : "text-error"}`}>
                            {card.priceImpactBpsAtDecided ?? 0} bps
                          </span>
                        </div>
                        <div>
                          <span className="text-on-surface-variant font-sans">Max Safe:</span>{" "}
                          <span className="font-bold text-on-surface">{maxSafeFmt}</span>
                        </div>
                        <div>
                          <span className="text-on-surface-variant font-sans">Quoted Out:</span>{" "}
                          <span className="font-bold text-on-surface">{quoteFmt}</span>
                        </div>
                        <div className="col-span-2 border-t border-surface-container/60 pt-1.5 flex items-center justify-between">
                          <span className="text-on-surface-variant font-sans">Min Out Floor (Slippage):</span>
                          <span className="font-bold text-on-surface">{minOutFmt}</span>
                        </div>
                      </div>

                      {/* Button logic: NO_TRADE => NO confirm button */}
                      {isNoTrade ? (
                        <div className="mt-1 p-2 rounded-lg bg-error-container/30 border border-error/30 text-on-error-container text-[11px] font-sans flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-error shrink-0" />
                          <span>Order Refused by Fathom Risk Engine ({card.reasonCode || "RISK_BUDGET_EXCEEDED"}). Execution blocked.</span>
                        </div>
                      ) : (
                        <div className="pt-1.5">
                          <button
                            type="button"
                            onClick={() => m.previewId && onConfirmTrade(m.previewId)}
                            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-primary hover:bg-primary-container text-white font-semibold text-xs shadow-soft transition-all cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Confirm & Execute on HSKSwap</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* On-Chain Execution / Refusal Receipt Card */}
                {m.decision && (() => {
                  const dec = m.decision;
                  const isNoTrade = dec.decision === "NO_TRADE";
                  const isTrimmed = dec.decision === "EXECUTE_TRIMMED";
                  const headerTitle = isNoTrade
                    ? "On-Chain Refusal Proof (TradeRejected)"
                    : isTrimmed
                    ? "On-Chain Trimmed Swap Receipt"
                    : "On-Chain Swap Receipt";

                  return (
                    <div
                      className={`mt-3 p-3.5 rounded-xl border shadow-soft text-on-surface text-xs space-y-2 font-mono ${
                        isNoTrade
                          ? "bg-error-container/20 border-error/30"
                          : isTrimmed
                          ? "bg-tertiary-container/25 border-tertiary/30"
                          : "bg-secondary-container/40 border-primary/30"
                      }`}
                    >
                      <div className="flex items-center justify-between font-semibold border-b border-outline-variant/20 pb-2">
                        <span className={`flex items-center gap-1.5 font-headline ${isNoTrade ? "text-error" : isTrimmed ? "text-tertiary" : "text-primary"}`}>
                          {isNoTrade ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                          <span>{headerTitle}</span>
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${
                            isNoTrade
                              ? "bg-error-container text-on-error-container border-error/30"
                              : isTrimmed
                              ? "bg-tertiary-container text-on-tertiary-container border-tertiary/30"
                              : "bg-secondary-container text-on-secondary-container border-primary/30"
                          }`}
                        >
                          {dec.decision}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] pt-0.5">
                        <div>
                          <span className="text-on-surface-variant font-sans">Tx Hash:</span>{" "}
                          {dec.txHash ? (
                            <a
                              href={`https://testnet-explorer.hskchain.net/tx/${dec.txHash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary font-bold underline hover:opacity-80"
                            >
                              {dec.txHash.slice(0, 10)}...
                            </a>
                          ) : (
                            <span className="text-on-surface-variant italic">Refused (Local)</span>
                          )}
                        </div>
                        <div>
                          <span className="text-on-surface-variant font-sans">{isNoTrade ? "Reason Code:" : "Realized Impact:"}</span>{" "}
                          <span className="font-bold text-on-surface">
                            {isNoTrade ? dec.reasonCode : `${dec.priceImpactBpsAtDecided} bps`}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })}

        {/* Live Animated Thinking State */}
        {isLoading && (
          <div className="flex flex-col items-start space-y-1.5">
            <div className="text-[10px] font-mono uppercase text-on-surface-variant px-1 flex items-center gap-1.5">
              <span>Fathom AI</span>
              <span className="px-1.5 py-0.2 rounded bg-secondary-container text-on-secondary-container font-mono text-[9px] animate-pulse">
                reasoning
              </span>
            </div>
            <div className="rounded-2xl px-4 py-3 bg-surface-container-low border border-outline-variant/40 shadow-soft text-xs max-w-[85%] space-y-2">
              <div className="flex items-center gap-2 text-primary font-mono font-semibold">
                <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
                <span>Evaluating DEX liquidity & budget boundaries...</span>
              </div>
              <div className="text-[10px] text-on-surface-variant font-mono space-y-1 pl-5">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  <span>Parsing natural language intent via Groq (Qwen 2.5)...</span>
                </div>
                <div className="flex items-center gap-1.5 opacity-70">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse" />
                  <span>Simulating QuoterV2 depth curve on HSKSwap...</span>
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Suggested Prompt Chips */}
      <div className="px-4 py-1.5 border-t border-surface-container flex items-center gap-1.5 overflow-x-auto bg-surface-container-low/40 shrink-0">
        <span className="text-[10px] font-mono text-on-surface-variant shrink-0">Try:</span>
        {QUICK_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => onSendMessage(chip)}
            className="text-[11px] font-medium px-2.5 py-0.5 rounded-lg bg-surface-container-lowest hover:bg-surface-container text-on-surface-variant hover:text-on-surface border border-outline-variant/40 transition-all whitespace-nowrap shadow-soft cursor-pointer"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Docked Input Form */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-surface-container bg-surface-container-lowest shrink-0">
        <div className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type instructions (e.g., 'buy 20%', 'be more cautious', 'status')..."
            className="w-full rounded-xl border border-outline-variant/60 bg-surface-container-lowest py-2.5 pl-4 pr-12 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-hidden focus:border-primary transition-all shadow-soft"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-1.5 p-2 rounded-lg bg-primary hover:bg-primary-container text-white disabled:opacity-40 transition-all cursor-pointer"
          >
            <CornerDownLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
};
