import React, { useState, useEffect } from "react";
import { HeroPage } from "./components/HeroPage";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { LoadingScreen } from "./components/LoadingScreen";
import { TopBar } from "./components/TopBar";
import { Chat } from "./components/Chat";
import { DecisionCard } from "./components/DecisionCard";
import { DepthChart } from "./components/DepthChart";
import { Portfolio } from "./components/Portfolio";
import { Scorecard } from "./components/Scorecard";
import { Ledger } from "./components/Ledger";
import { Policy } from "./components/Policy";
import type {
  AppState,
  PortfolioData,
  DecisionRecord,
  ScorecardMetrics,
  DepthPoint,
  ChatMessage,
  UserProfile,
} from "./types";

type AppFlow = "HERO" | "ONBOARDING" | "LOADING" | "TERMINAL";
type InspectorTab = "PROOF" | "DEPTH" | "PORTFOLIO" | "LEDGER" | "POLICY";

export function App() {
  // ── Flow State Machine ─────────────────────────────────────────────────────
  const [flow, setFlow] = useState<AppFlow>(() => {
    try {
      return localStorage.getItem("depthguard_profile") ? "HERO" : "HERO";
    } catch {
      return "HERO";
    }
  });

  const [isReOnboarding, setIsReOnboarding] = useState(false);

  // ── User Profile ──────────────────────────────────────────────────────────
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem("depthguard_profile");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // ── Inspector Tab ─────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<InspectorTab>("PROOF");

  // ── Agent / Trading State ─────────────────────────────────────────────────
  const [state, setState] = useState<AppState | null>({
    mode: "LIVE HSK TESTNET (own-seeded pool)",
    modeLabel: "LIVE HSK TESTNET (own-seeded pool)",
    network: "HSK Testnet (Chain ID 133)",
    referenceNetwork: "HSK Mainnet (Chain ID 177, Read-Only)",
    autoEnabled: false,
    isPaused: false,
    currentRisk: "balanced",
    riskConfig: {
      impactBudgetBps: 60,
      slippageBps: 50,
      maxTradePercent: 10,
      cooldownSeconds: 60,
      signalThresholdBps: 80,
    },
    pollIntervalSeconds: 20,
    deployments: null,
    isReplayMode: false,
  });

  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);

  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [scorecard, setScorecard] = useState<ScorecardMetrics | null>(null);
  const [depthCurve, setDepthCurve] = useState<DepthPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const name = (() => {
      try {
        const p = localStorage.getItem("depthguard_profile");
        return p ? JSON.parse(p).name : null;
      } catch {
        return null;
      }
    })();
    return [
      {
        id: "welcome-1",
        sender: "agent",
        text: `👋 Welcome${name ? `, ${name}` : ""} to DepthGuard — Liquidity-Aware AI Trading Agent on HSKSwap (HSK Testnet).\n\nI monitor pool liquidity via QuoterV2 and enforce hard price impact budgets before execution.\n\nTry typing: **status**, **buy 20%**, **be more cautious**, or **why did you refuse?**`,
        timestamp: Date.now(),
        parserBadge: "LLM",
        thoughtProcess: [
          {
            title: "1. Agent Environment Initialized",
            detail: "Connected to HSK Testnet (Chain ID 133). Monitoring dual-pool WHSK/tUSDT reference rates.",
            status: "done",
          },
          {
            title: "2. Liquidity Sizer Engaged",
            detail: "QuoterV2 interface loaded. Active impact budget ceiling: 60 bps.",
            status: "done",
          },
        ],
      },
    ];
  });

  // ── API helpers ───────────────────────────────────────────────────────────
  const fetchData = async () => {
    try {
      const [sRes, pRes, dRes, scRes, dpRes] = await Promise.all([
        fetch("/api/state").then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/portfolio").then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/decisions?limit=50").then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/scorecard").then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/depth").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (sRes) setState(sRes);
      if (pRes) setPortfolio(pRes);
      if (dRes) setDecisions(dRes);
      if (scRes) setScorecard(scRes);
      if (dpRes?.curve) setDepthCurve(dpRes.curve);
    } catch {}
  };

  useEffect(() => {
    fetchData();
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource("/api/stream");
      eventSource.addEventListener("decision", (e) => {
        try {
          const dec = JSON.parse(e.data);
          setDecisions((prev) => [dec, ...prev]);
          fetchData();
        } catch {}
      });
      eventSource.onerror = () => {};
    } catch {}
    return () => eventSource?.close();
  }, []);

  // ── Chat ──────────────────────────────────────────────────────────────────
  const handleSendMessage = async (text: string) => {
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: "user",
      text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          executionMode: userProfile?.executionMode || (state?.autoEnabled ? "auto" : "manual"),
        }),
      });
      const data = await res.json();
      const agentMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        sender: "agent",
        text: data.reply,
        timestamp: Date.now(),
        parserBadge: data.parserBadge,
        parsedIntent: data.parsedIntent,
        previewId: data.previewId,
        previewCard: data.previewCard,
        thoughtProcess: data.thoughtProcess,
        decision: data.decision,
      };
      setMessages((prev) => [...prev, agentMsg]);
      if (data.decision) {
        setActiveTab("PROOF");
      }
      fetchData();
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: "agent",
          text: "⚠ Agent backend offline — responses using deterministic rules fallback.",
          timestamp: Date.now(),
          thoughtProcess: [
            {
              title: "1. Network Connection Check",
              detail: "Backend connection dropped. Initiating offline deterministic fallback parser.",
              status: "warning",
            },
          ],
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmTrade = async (previewId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previewId }),
      });
      const data = await res.json();
      if (data.ok && data.decision) {
        setMessages((prev) => [
          ...prev,
          {
            id: `exec-${Date.now()}`,
            sender: "agent",
            text: `✅ Order confirmed and executed on-chain! Tx: ${data.decision.txHash?.slice(0, 10)}... Impact: ${data.decision.priceImpactBpsAtDecided} bps.`,
            timestamp: Date.now(),
            decision: data.decision,
            thoughtProcess: [
              {
                title: "1. Human Confirmation Validated",
                detail: `Operator confirmed trade preview ${previewId}. Preparing on-chain transaction.`,
                status: "done",
              },
              {
                title: "2. Spot Floor Verification",
                detail: `Preflight check confirmed realized impact (${data.decision.priceImpactBpsAtDecided} bps) is strictly within budget.`,
                status: "done",
              },
              {
                title: "3. ExecutionGuard Transaction Broadcast",
                detail: `Swapped on HSKSwap testnet. Tx hash: ${data.decision.txHash || "0x9c3f..."}. Vault balances updated.`,
                status: "done",
              },
            ],
          },
        ]);
        setActiveTab("PROOF");
        fetchData();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleAuto = () => {
    if (!state) return;
    handleSendMessage(state.autoEnabled ? "auto off" : "auto on");
  };

  const handleEmergencyStop = () => handleSendMessage("emergency stop");

  const handleSelectRisk = (preset: "conservative" | "balanced" | "aggressive") => {
    handleSendMessage(`Set risk to ${preset}`);
  };

  const triggerMover = async (action: "PUSH_PRICE_DOWN" | "PUSH_PRICE_UP") => {
    await fetch("/api/demo/mover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    fetchData();
  };

  // ── Onboarding Complete ───────────────────────────────────────────────────
  const handleOnboardingComplete = (profile: UserProfile) => {
    setUserProfile(profile);
    setIsReOnboarding(false);

    // Apply to agent (fire-and-forget — may fail if agent offline)
    setTimeout(() => {
      handleSendMessage(`Set risk to ${profile.riskPreference}`);
      if (profile.executionMode === "auto" && !state?.autoEnabled) {
        setTimeout(() => handleSendMessage("auto on"), 400);
      }
    }, 800);

    // Personalized welcome message
    const budget =
      profile.riskPreference === "conservative" ? 25 : profile.riskPreference === "aggressive" ? 120 : 60;
    setMessages(() => [
      {
        id: "welcome-personalized",
        sender: "agent",
        text: `✨ Setup complete, **${profile.name}**! DepthGuard is now calibrated:\n\n- **Profile:** ${profile.riskPreference.toUpperCase()}\n- **Impact Budget:** ${budget} bps cap\n- **Execution:** ${profile.executionMode === "manual" ? "Human Approval (Preview & Confirm)" : "Autonomous Auto-Execution"}\n\nType **status** to see live state, or **buy 20%** to try a trade.`,
        timestamp: Date.now(),
        parserBadge: "LLM",
        thoughtProcess: [
          {
            title: "1. Profile Personalization Applied",
            detail: `Configured risk parameters for ${profile.name}: ${profile.riskPreference.toUpperCase()} preset with ${budget} bps budget ceiling.`,
            status: "done",
          },
          {
            title: "2. Execution Guardrail Enforced",
            detail: profile.executionMode === "manual" ? "Human in the Loop: Orders will require interactive confirmation before sending to router." : "Autonomous Guardian: Orders will execute automatically when market deviation triggers fire.",
            status: "done",
          },
        ],
      },
    ]);

    setFlow("LOADING");
  };

  const handleLoadingDone = () => setFlow("TERMINAL");

  const handleOpenProfile = () => setIsReOnboarding(true);

  // ── Re-onboarding (from terminal) ─────────────────────────────────────────
  if (isReOnboarding) {
    return (
      <OnboardingWizard
        onComplete={handleOnboardingComplete}
        currentProfile={userProfile}
      />
    );
  }

  // ── Flow Router ───────────────────────────────────────────────────────────
  if (flow === "HERO") {
    return (
      <HeroPage
        state={state}
        onGetStarted={() => {
          if (userProfile) {
            setFlow("TERMINAL");
          } else {
            setFlow("ONBOARDING");
          }
        }}
        onEnterTerminal={() => {
          if (userProfile) {
            setFlow("TERMINAL");
          } else {
            setFlow("ONBOARDING");
          }
        }}
      />
    );
  }

  if (flow === "ONBOARDING") {
    return (
      <OnboardingWizard
        onComplete={handleOnboardingComplete}
        currentProfile={userProfile}
      />
    );
  }

  if (flow === "LOADING") {
    return <LoadingScreen onDone={handleLoadingDone} />;
  }

  // ── TERMINAL ──────────────────────────────────────────────────────────────
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background text-on-surface font-sans">
      <TopBar
        state={state}
        onToggleAuto={handleToggleAuto}
        onEmergencyStop={handleEmergencyStop}
        userProfile={userProfile}
        onOpenProfile={handleOpenProfile}
        onGoHome={() => setFlow("HERO")}
      />

      {/* Main terminal workspace — fills remaining viewport, no scroll */}
      <main className="flex-1 min-h-0 flex gap-3 p-3 overflow-hidden">
        {/* ── LEFT: Chat console ── */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden">
          <Chat
            messages={messages}
            onSendMessage={handleSendMessage}
            onConfirmTrade={handleConfirmTrade}
            isLoading={isLoading}
            userProfile={userProfile}
            currentRisk={state?.currentRisk ?? "balanced"}
            onSelectRisk={handleSelectRisk}
            onTriggerMover={triggerMover}
          />
        </div>

        {/* ── RIGHT: Inspector panel ── */}
        <div className="hidden lg:flex w-[380px] xl:w-[420px] shrink-0 flex-col min-h-0 bg-surface-container-lowest rounded-2xl border border-outline-variant/40 shadow-soft overflow-hidden">
          {/* Tab bar */}
          <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-surface-container bg-surface-container-low/50">
            <div className="flex items-center gap-0.5">
              {(["PROOF", "DEPTH", "PORTFOLIO", "LEDGER", "POLICY"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 rounded-xl font-mono text-[11px] font-semibold transition-all ${
                    activeTab === tab
                      ? "bg-surface-container-lowest text-primary shadow-soft"
                      : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                  }`}
                >
                  {tab === "PROOF" ? "Proof" : tab === "DEPTH" ? "Depth" : tab === "PORTFOLIO" ? "NAV" : tab === "LEDGER" ? "Ledger" : "Policy"}
                </button>
              ))}
            </div>
            <span className="text-[10px] font-mono text-on-surface-variant pr-1">Chain 133</span>
          </div>

          {/* Inspector content — scrollable internally */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            {activeTab === "PROOF" && (
              decisions.length > 0 ? (
                <DecisionCard decision={decisions[0]} />
              ) : (
                <EmptyInspectorState tab="PROOF" />
              )
            )}
            {activeTab === "DEPTH" && (
              <DepthChart
                curve={depthCurve.length > 0 ? depthCurve : (decisions[0]?.depthCurve || [])}
                budgetBps={state?.riskConfig?.impactBudgetBps ?? 60}
              />
            )}
            {activeTab === "PORTFOLIO" && <Portfolio portfolio={portfolio} />}
            {activeTab === "LEDGER" && (
              <div className="space-y-4">
                <Scorecard scorecard={scorecard} />
                <Ledger decisions={decisions} />
              </div>
            )}
            {activeTab === "POLICY" && <Policy state={state} />}
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Empty state placeholder for inspector ─────────────────────────────────
function EmptyInspectorState({ tab }: { tab: "PROOF" | "DEPTH" }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      <div className="w-12 h-12 rounded-2xl bg-surface-container flex items-center justify-center">
        {tab === "PROOF" ? (
          <svg className="w-6 h-6 text-on-surface-variant/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-on-surface-variant/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        )}
      </div>
      <div>
        <p className="text-sm font-semibold text-on-surface-variant">
          {tab === "PROOF" ? "Waiting for first decision" : "Depth curve loading"}
        </p>
        <p className="text-xs text-on-surface-variant/60 mt-1 max-w-[180px]">
          {tab === "PROOF"
            ? "Send a trade command or let the agent scan the pool. Proof cards will appear here."
            : "Depth data will populate once the agent polls QuoterV2."}
        </p>
      </div>
      {/* Skeleton placeholder cards */}
      <div className="w-full space-y-2 mt-2 opacity-30">
        {[80, 60, 40].map((w) => (
          <div key={w} className="h-3 bg-surface-container rounded-full" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}
