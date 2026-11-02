import React from "react";
import type { DepthPoint } from "../types";

interface Props {
  curve: DepthPoint[];
  budgetBps: number;
}

export const DepthChart: React.FC<Props> = ({ curve, budgetBps }) => {
  const points =
    curve.length > 0
      ? curve
      : [
          { amountIn: "1%", quotedOut: "0", totalCostBps: 32, priceImpactBps: 2 },
          { amountIn: "5%", quotedOut: "0", totalCostBps: 45, priceImpactBps: 15 },
          { amountIn: "10%", quotedOut: "0", totalCostBps: 68, priceImpactBps: 38 },
          { amountIn: "25%", quotedOut: "0", totalCostBps: 120, priceImpactBps: 90 },
          { amountIn: "50%", quotedOut: "0", totalCostBps: 240, priceImpactBps: 210 },
          { amountIn: "100%", quotedOut: "0", totalCostBps: 510, priceImpactBps: 480 },
        ];

  const width = 560;
  const height = 240;
  const padding = { top: 25, right: 25, bottom: 35, left: 45 };

  const maxImpact = Math.max(...points.map((p) => p.priceImpactBps), budgetBps * 1.5, 120);

  const getX = (index: number) => {
    return padding.left + (index / (points.length - 1)) * (width - padding.left - padding.right);
  };

  const getY = (impact: number) => {
    const usableHeight = height - padding.top - padding.bottom;
    const norm = Math.min(impact / maxImpact, 1);
    return height - padding.bottom - norm * usableHeight;
  };

  const budgetY = getY(budgetBps);

  // SVG path for curve
  const pathD = points.reduce((acc, p, i) => {
    const x = getX(i);
    const y = getY(p.priceImpactBps);
    return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, "");

  // Area under curve
  const areaD = `${pathD} L ${getX(points.length - 1)} ${height - padding.bottom} L ${getX(0)} ${
    height - padding.bottom
  } Z`;

  return (
    <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/40 shadow-soft p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-headline text-sm font-semibold text-on-surface">
            Pool Depth & Impact Curve
          </h3>
          <p className="font-body text-xs text-on-surface-variant">
            Swept across vault balance via QuoterV2
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="flex items-center gap-1.5 text-primary font-medium">
            <span className="w-2 h-2 rounded-full bg-primary"></span>
            <span>Quote Curve</span>
          </span>
          <span className="flex items-center gap-1.5 text-tertiary font-semibold">
            <span className="w-3 h-0.5 bg-tertiary"></span>
            <span>Budget ({budgetBps} bps)</span>
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low/50 p-2 overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
          {/* Safe Zone Area (under budget) */}
          <rect
            x={padding.left}
            y={budgetY}
            width={width - padding.left - padding.right}
            height={height - padding.bottom - budgetY}
            fill="rgba(74, 124, 89, 0.06)"
          />

          {/* Grid lines */}
          <line
            x1={padding.left}
            y1={height - padding.bottom}
            x2={width - padding.right}
            y2={height - padding.bottom}
            stroke="#dcd8cd"
            strokeWidth="1"
          />
          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left}
            y2={height - padding.bottom}
            stroke="#dcd8cd"
            strokeWidth="1"
          />

          {/* Budget Line */}
          <line
            x1={padding.left}
            y1={budgetY}
            x2={width - padding.right}
            y2={budgetY}
            stroke="#8c6738"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
          <text
            x={width - padding.right}
            y={budgetY - 5}
            fill="#8c6738"
            fontSize="9"
            fontWeight="bold"
            textAnchor="end"
            fontFamily="monospace"
          >
            Budget Cap ({budgetBps} bps)
          </text>

          {/* Shaded Impact Area */}
          <path d={areaD} fill="rgba(74, 124, 89, 0.08)" />

          {/* Main Curve */}
          <path d={pathD} fill="none" stroke="#4a7c59" strokeWidth="2.5" />

          {/* Data Points */}
          {points.map((p, i) => {
            const x = getX(i);
            const y = getY(p.priceImpactBps);
            const isSafe = p.priceImpactBps <= budgetBps;
            return (
              <g key={i}>
                <circle
                  cx={x}
                  cy={y}
                  r="4"
                  fill={isSafe ? "#4a7c59" : "#b83230"}
                  stroke="#ffffff"
                  strokeWidth="2"
                />
                {/* X axis labels */}
                <text
                  x={x}
                  y={height - padding.bottom + 16}
                  fill="#575d56"
                  fontSize="10"
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  {p.amountIn}
                </text>
              </g>
            );
          })}

          {/* Y axis label */}
          <text
            x={padding.left - 6}
            y={padding.top + 8}
            fill="#74796e"
            fontSize="9"
            textAnchor="end"
            fontFamily="monospace"
          >
            bps
          </text>
        </svg>
      </div>

      <div className="flex items-center justify-between text-[11px] text-on-surface-variant font-mono pt-1">
        <span>🟢 Safe execution zone (&lt;{budgetBps} bps)</span>
        <span>🔴 Sizer trims or refuses beyond budget</span>
      </div>
    </div>
  );
};
