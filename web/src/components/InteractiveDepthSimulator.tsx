import React, { useState, useMemo } from "react";
import { Sliders, CheckCircle2, AlertTriangle, XCircle, ShieldCheck } from "lucide-react";

export const InteractiveDepthSimulator: React.FC<{ spotPrice?: number }> = ({ spotPrice = 0.0875 }) => {
  const [size, setSize] = useState<number>(110); // Default at 110 WHSK to show trim
  const budgetBps = 60; // 60 bps budget cap
  const safeCap = 42; // Max size that fits under 60 bps
  const trimLimit = 120; // Above 120 WHSK, refused

  // Mathematically calibrated curve:
  // whsk = 5   -> 4 bps
  // whsk = 42  -> 60 bps (Exact budget cap boundary)
  // whsk = 110 -> 270 bps
  // whsk = 120 -> 312 bps (Refusal boundary)
  // whsk = 250 -> 1137 bps (Deep pool distortion)
  const calculateImpact = (whsk: number): number => {
    return Math.round(0.015 * whsk * whsk + 0.8 * whsk);
  };

  const impactBps = calculateImpact(size);

  let decision: "EXECUTE_FULL" | "EXECUTE_TRIMMED" | "NO_TRADE" = "EXECUTE_FULL";
  let headline = "";
  let description = "";
  let executedSize = size;
  let capitalSaved = 0;

  if (size <= safeCap) {
    decision = "EXECUTE_FULL";
    headline = "Order within Safe Capacity";
    description = `Order fits safely within your ${budgetBps} bps impact budget. QuoterV2 passes the full transaction with zero trimming.`;
    executedSize = size;
    capitalSaved = 0;
  } else if (size <= trimLimit) {
    decision = "EXECUTE_TRIMMED";
    headline = "Trimmed to Max Safe Depth";
    description = `Requested ${size} WHSK causes ${impactBps} bps impact. DepthGuard automatically trims execution to ${safeCap} WHSK to preserve your ${budgetBps} bps budget.`;
    executedSize = safeCap;
    capitalSaved = Number(((size - safeCap) * spotPrice * ((impactBps - budgetBps) / 10000)).toFixed(2));
  } else {
    decision = "NO_TRADE";
    headline = "Refused: Slippage Exceeds Cap";
    description = `Requested ${size} WHSK requires severe pool distortion (${impactBps} bps). Sizer refuses transaction on-chain with code IMPACT_TOO_HIGH.`;
    executedSize = 0;
    capitalSaved = Number((size * spotPrice * (impactBps / 10000)).toFixed(2));
  }

  // ─── SVG Chart Math & Dimensions ──────────────────────────────────────────
  const viewBoxWidth = 520;
  const viewBoxHeight = 170;
  const padding = { top: 28, right: 30, bottom: 32, left: 45 };
  const plotWidth = viewBoxWidth - padding.left - padding.right;
  const plotHeight = viewBoxHeight - padding.top - padding.bottom;

  const minWhsk = 5;
  const maxWhsk = 250;
  const maxDisplayBps = 350; // Visual clamp for Y-axis so curve has nice slope

  const getX = (whsk: number) => {
    const clamped = Math.min(Math.max(whsk, minWhsk), maxWhsk);
    return padding.left + ((clamped - minWhsk) / (maxWhsk - minWhsk)) * plotWidth;
  };

  const getY = (bps: number) => {
    const clamped = Math.min(Math.max(bps, 0), maxDisplayBps);
    return padding.top + plotHeight - (clamped / maxDisplayBps) * plotHeight;
  };

  // Generate continuous smooth curve points
  const curvePoints = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const w = minWhsk + (i / steps) * (maxWhsk - minWhsk);
      const imp = calculateImpact(w);
      pts.push({ x: getX(w), y: getY(imp) });
    }
    return pts;
  }, []);

  const pathD = useMemo(() => {
    return curvePoints.reduce((acc, p, i) => `${acc} ${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`, "");
  }, [curvePoints]);

  const areaD = useMemo(() => {
    const firstX = curvePoints[0].x.toFixed(1);
    const lastX = curvePoints[curvePoints.length - 1].x.toFixed(1);
    const bottomY = (padding.top + plotHeight).toFixed(1);
    return `${pathD} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [pathD, curvePoints]);

  // Current dot position (strictly on the line)
  const currentX = getX(size);
  const currentY = getY(impactBps);
  const budgetY = getY(budgetBps);
  const safeCapX = getX(safeCap);
  const trimLimitX = getX(trimLimit);

  // Status colors
  const statusColor =
    decision === "EXECUTE_FULL"
      ? "#4a7c59"
      : decision === "EXECUTE_TRIMMED"
        ? "#8c6738"
        : "#b83230";

  return (
    <div className="rounded-3xl bg-surface-container-lowest border border-outline-variant/40 p-6 sm:p-8 shadow-card space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-surface-container pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary uppercase tracking-wider mb-1">
            <Sliders className="w-3.5 h-3.5" />
            <span>Interactive Pool Sizer</span>
          </div>
          <h2 className="font-headline text-2xl sm:text-3xl text-on-surface font-semibold tracking-tight">
            Pool Absorptive Capacity Simulator
          </h2>
          <p className="font-body text-sm text-on-surface-variant mt-1 max-w-xl">
            Drag the proposed trade size to observe how DepthGuard sweeps the liquidity curve, enforces impact budgets, and prevents slippage losses.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto px-3.5 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/40 text-xs">
          <span className="text-on-surface-variant">Pool Target:</span>
          <span className="font-mono font-bold text-on-surface">WHSK / tUSDT (0.3%)</span>
        </div>
      </div>

      {/* Grid: Controls (7 cols) + Outcome (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Column: Slider and Curve */}
        <div className="lg:col-span-7 flex flex-col justify-between gap-5 p-6 rounded-2xl bg-surface-container-low border border-outline-variant/40">
          {/* Top of control: Size display + quick presets */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs uppercase font-mono tracking-wider text-on-surface-variant font-medium">
                Proposed Order Size
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="font-mono text-3xl font-bold text-on-surface">{size}</span>
                <span className="font-mono text-sm text-on-surface-variant">WHSK</span>
                <span className="text-xs font-mono text-on-surface-variant">
                  (~${(size * spotPrice).toFixed(2)} USDT)
                </span>
              </div>
            </div>

            {/* Quick adjust presets */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSize((s) => Math.max(5, s - 5))}
                className="w-7 h-7 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-on-surface hover:bg-surface-container text-xs font-bold shadow-soft flex items-center justify-center transition-all cursor-pointer"
              >
                -
              </button>
              <button
                type="button"
                onClick={() => setSize((s) => Math.min(250, s + 5))}
                className="w-7 h-7 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-on-surface hover:bg-surface-container text-xs font-bold shadow-soft flex items-center justify-center transition-all cursor-pointer"
              >
                +
              </button>
              <div className="h-4 w-px bg-outline-variant/40 mx-1" />
              {[25, 42, 80, 110, 150].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setSize(preset)}
                  className={`px-2 py-1 rounded-md text-xs font-mono transition-all border cursor-pointer ${size === preset
                      ? "bg-primary text-white border-primary font-bold shadow-soft"
                      : "bg-surface-container-lowest border-outline-variant/40 text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                    }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Slider input */}
          <div className="space-y-2">
            <input
              type="range"
              min="5"
              max="250"
              step="1"
              value={size}
              onChange={(e) => setSize(parseInt(e.target.value, 10))}
              className="w-full h-2 bg-surface-container-high rounded-lg appearance-none cursor-pointer accent-[#4a7c59]"
            />
            <div className="flex justify-between font-mono text-[11px] text-on-surface-variant">
              <span>5 WHSK</span>
              <span className="text-primary font-semibold">42 WHSK (Safe Cap)</span>
              <span className="text-tertiary font-semibold">120 WHSK (Trim Range)</span>
              <span className="text-error font-semibold">250 WHSK (Excess)</span>
            </div>
          </div>

          {/* SVG Price Impact Curve */}
          <div className="relative pt-1">
            <div className="rounded-xl bg-surface-container-lowest border border-outline-variant/30 p-3 overflow-hidden shadow-soft">
              <svg viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`} className="w-full h-36 overflow-visible select-none">
                <defs>
                  {/* Linear gradient along the curve: Green -> Ochre -> Red */}
                  <linearGradient id="depthGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#4a7c59" />
                    <stop offset="16%" stopColor="#4a7c59" />
                    <stop offset="28%" stopColor="#8c6738" />
                    <stop offset="50%" stopColor="#b83230" />
                    <stop offset="100%" stopColor="#b83230" />
                  </linearGradient>

                  {/* Soft area fill gradient */}
                  <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="rgba(74, 124, 89, 0.15)" />
                    <stop offset="100%" stopColor="rgba(74, 124, 89, 0.01)" />
                  </linearGradient>
                </defs>

                {/* Shaded Safe Capacity Zone (< 60 bps) */}
                <rect
                  x={padding.left}
                  y={budgetY}
                  width={safeCapX - padding.left}
                  height={padding.top + plotHeight - budgetY}
                  fill="rgba(74, 124, 89, 0.08)"
                  rx="4"
                />

                {/* Y-Axis Grid Lines & Labels */}
                {[
                  { bps: 300, label: "300 bps" },
                  { bps: 180, label: "180 bps" },
                  { bps: 60, label: "60 bps" },
                  { bps: 0, label: "0 bps" },
                ].map(({ bps, label }) => {
                  const y = getY(bps);
                  return (
                    <g key={bps}>
                      <line
                        x1={padding.left}
                        x2={padding.left + plotWidth}
                        y1={y}
                        y2={y}
                        stroke="#e2ded4"
                        strokeDasharray={bps === 60 ? "4 4" : "2 2"}
                        strokeWidth={bps === 60 ? 1.5 : 1}
                      />
                      <text
                        x={padding.left - 6}
                        y={y + 3}
                        fill={bps === 60 ? "#8c6738" : "#8b8d87"}
                        fontSize="9"
                        fontFamily="monospace"
                        fontWeight={bps === 60 ? "700" : "500"}
                        textAnchor="end"
                      >
                        {label}
                      </text>
                    </g>
                  );
                })}

                {/* 60 bps Budget Line Label */}
                <text
                  x={padding.left + plotWidth}
                  y={budgetY - 5}
                  fill="#8c6738"
                  fontSize="9"
                  fontFamily="monospace"
                  fontWeight="700"
                  textAnchor="end"
                >
                  60 bps Budget Cap
                </text>

                {/* Vertical Safe Cap Marker (42 WHSK) */}
                <line
                  x1={safeCapX}
                  x2={safeCapX}
                  y1={padding.top}
                  y2={padding.top + plotHeight}
                  stroke="#4a7c59"
                  strokeDasharray="2 2"
                  strokeWidth="1"
                  opacity="0.4"
                />
                <text
                  x={safeCapX}
                  y={padding.top + plotHeight + 14}
                  fill="#4a7c59"
                  fontSize="9"
                  fontFamily="monospace"
                  fontWeight="600"
                  textAnchor="middle"
                >
                  42 WHSK
                </text>

                {/* Vertical Refusal Threshold Marker (120 WHSK) */}
                <line
                  x1={trimLimitX}
                  x2={trimLimitX}
                  y1={padding.top}
                  y2={padding.top + plotHeight}
                  stroke="#b83230"
                  strokeDasharray="2 2"
                  strokeWidth="1"
                  opacity="0.4"
                />
                <text
                  x={trimLimitX}
                  y={padding.top + plotHeight + 14}
                  fill="#b83230"
                  fontSize="9"
                  fontFamily="monospace"
                  fontWeight="600"
                  textAnchor="middle"
                >
                  120 WHSK
                </text>

                {/* Area Under Curve */}
                <path d={areaD} fill="url(#areaGradient)" />

                {/* Main Dynamic Price Impact Curve */}
                <path
                  d={pathD}
                  fill="none"
                  stroke="url(#depthGradient)"
                  strokeWidth="3"
                  strokeLinecap="round"
                />

                {/* Vertical Guide Line to Current Trade Point */}
                <line
                  x1={currentX}
                  x2={currentX}
                  y1={currentY}
                  y2={padding.top + plotHeight}
                  stroke={statusColor}
                  strokeDasharray="3 3"
                  strokeWidth="1.5"
                  opacity="0.6"
                />

                {/* Animated Pulse Ring on Dot */}
                <circle
                  cx={currentX}
                  cy={currentY}
                  r="10"
                  fill={statusColor}
                  opacity="0.2"
                  className="animate-ping"
                  style={{ animationDuration: "2s" }}
                />

                {/* Moving Indicator Dot — 100% Guaranteed on Curve */}
                <circle
                  cx={currentX}
                  cy={currentY}
                  r="6"
                  fill={statusColor}
                  stroke="#ffffff"
                  strokeWidth="2.5"
                  className="shadow-md transition-all duration-75"
                />

                {/* Floating Real-Time Data Pill above Dot */}
                <g transform={`translate(${Math.min(Math.max(currentX, 90), viewBoxWidth - 90)}, ${Math.max(currentY - 14, 16)})`}>
                  <rect
                    x="-48"
                    y="-13"
                    width="96"
                    height="18"
                    rx="9"
                    fill={statusColor}
                    className="shadow-sm"
                  />
                  <text
                    x="0"
                    y="-0.5"
                    fill="#ffffff"
                    fontSize="9"
                    fontFamily="monospace"
                    fontWeight="700"
                    textAnchor="middle"
                  >
                    {impactBps} bps impact
                  </text>
                </g>
              </svg>

              {/* Legend Strip with exact bounds */}
              <div className="flex justify-between items-center text-[10px] font-mono font-semibold pt-3 text-on-surface-variant border-t border-surface-container">
                <span className="text-primary flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  <span>Safe Zone (&le;42 WHSK &middot; &le;60 bps)</span>
                </span>
                <span className="text-tertiary flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-tertiary" />
                  <span>Trim Zone (42–120 WHSK)</span>
                </span>
                <span className="text-error flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-error" />
                  <span>Refusal Zone (&gt;120 WHSK)</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Dynamic Verdict Card */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-4 p-6 rounded-2xl bg-surface-container-low border border-outline-variant/40">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-mono tracking-wider text-on-surface-variant font-bold">
                QuoterV2 Verdict
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold tracking-wide border ${decision === "EXECUTE_FULL"
                    ? "bg-secondary-container text-on-secondary-container border-primary/30"
                    : decision === "EXECUTE_TRIMMED"
                      ? "bg-tertiary-container text-on-tertiary-container border-tertiary/30"
                      : "bg-error-container text-on-error-container border-error/30"
                  }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${decision === "EXECUTE_FULL"
                      ? "bg-primary"
                      : decision === "EXECUTE_TRIMMED"
                        ? "bg-tertiary"
                        : "bg-error"
                    }`}
                />
                {decision}
              </span>
            </div>

            <h3 className="font-headline text-xl text-on-surface font-semibold leading-snug">
              {headline}
            </h3>

            <p className="font-body text-xs text-on-surface-variant leading-relaxed">
              {description}
            </p>
          </div>

          {/* Metric Details Cluster */}
          <div className="space-y-2 rounded-xl bg-surface-container-lowest border border-outline-variant/30 p-4 shadow-soft">
            <div className="flex items-center justify-between text-xs py-1 border-b border-surface-container">
              <span className="text-on-surface-variant">Simulated Price Impact</span>
              <span
                className={`font-mono font-bold ${impactBps <= budgetBps ? "text-primary" : "text-error"
                  }`}
              >
                {impactBps} bps ({(impactBps / 100).toFixed(2)}%)
              </span>
            </div>

            <div className="flex items-center justify-between text-xs py-1 border-b border-surface-container">
              <span className="text-on-surface-variant">Allocated Impact Budget</span>
              <span className="font-mono text-on-surface font-medium">{budgetBps} bps (0.60%)</span>
            </div>

            <div className="flex items-center justify-between text-xs py-1 border-b border-surface-container">
              <span className="text-on-surface-variant">Execution Size Decided</span>
              <span className="font-mono font-bold text-on-surface">
                {executedSize} WHSK{" "}
                {executedSize !== size && (
                  <span className="text-on-surface-variant text-[11px] font-normal">
                    (trimmed from {size})
                  </span>
                )}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs py-1 pt-1.5">
              <span className="text-on-surface-variant font-medium">Capital Loss Avoided</span>
              <span className="font-mono font-bold text-primary">
                +${capitalSaved.toLocaleString()} USDT
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
