import React, { useEffect, useState } from "react";
import { Shield } from "lucide-react";

interface Props {
  onDone: () => void;
}

const STATUS_LINES = [
  "Connecting to HSK Testnet (Chain 133)...",
  "Loading QuoterV2 depth curves...",
  "Calibrating risk budgets...",
  "Agent ready.",
];

export const LoadingScreen: React.FC<Props> = ({ onDone }) => {
  const [progress, setProgress] = useState(0);
  const [lineIndex, setLineIndex] = useState(0);
  const [doneLines, setDoneLines] = useState<number[]>([]);

  useEffect(() => {
    // Animate progress 0 → 100 over ~2.2s
    const startTime = Date.now();
    const duration = 2200;

    const frame = () => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      setProgress(pct);

      // Reveal status lines at progress thresholds
      if (pct >= 20 && lineIndex < 1) {
        setLineIndex(1);
        setDoneLines([0]);
      }
      if (pct >= 50 && lineIndex < 2) {
        setLineIndex(2);
        setDoneLines([0, 1]);
      }
      if (pct >= 80 && lineIndex < 3) {
        setLineIndex(3);
        setDoneLines([0, 1, 2]);
      }

      if (pct < 100) {
        requestAnimationFrame(frame);
      } else {
        setDoneLines([0, 1, 2, 3]);
        setTimeout(onDone, 400);
      }
    };

    requestAnimationFrame(frame);
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center gap-8">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/6 rounded-full blur-3xl" />
      </div>

      {/* Shield icon with pulse ring */}
      <div className="relative z-10 flex flex-col items-center gap-6">
        <div className="relative">
          <div className="absolute inset-0 rounded-2xl bg-primary/15 animate-ping" style={{ animationDuration: "1.6s" }} />
          <div className="relative w-16 h-16 rounded-2xl bg-primary text-white flex items-center justify-center shadow-card">
            <Shield className="w-8 h-8" />
          </div>
        </div>

        <div className="text-center space-y-1">
          <h2 className="font-headline text-2xl font-semibold text-on-surface">Calibrating your agent</h2>
          <p className="text-sm text-on-surface-variant font-body">Setting up Fathom with your preferences</p>
        </div>

        {/* Progress bar */}
        <div className="w-72 h-1.5 bg-surface-container rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="font-mono text-xs text-on-surface-variant">{progress}%</p>

        {/* Status lines */}
        <div className="space-y-2 w-72">
          {STATUS_LINES.map((line, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-xs font-mono transition-all duration-300"
              style={{
                opacity: i <= lineIndex ? 1 : 0,
                transform: i <= lineIndex ? "translateY(0)" : "translateY(6px)",
              }}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  doneLines.includes(i) ? "bg-primary" : "bg-outline-variant/40 animate-pulse"
                }`}
              />
              <span className={doneLines.includes(i) ? "text-on-surface" : "text-on-surface-variant"}>
                {line}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

