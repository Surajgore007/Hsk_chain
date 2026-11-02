import React, { useEffect, useRef } from "react";

interface Props {
  isActive: boolean;
}

/**
 * EcgPulse.tsx — Real-time ECG Oscilloscope Heartbeat ("Agent is Alive")
 * Inspired by Codepen Three.js / Canvas ECG heartbeat animations.
 * Provides instant visual telemetry next to the AUTO toggle in the TopBar.
 */
export const EcgPulse: React.FC<Props> = ({ isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frameId: number;
    let offset = 0;

    const width = 64;
    const height = 24;
    canvas.width = width;
    canvas.height = height;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      ctx.beginPath();
      ctx.strokeStyle = isActive ? "#10b981" : "#f59e0b"; // emerald when active, amber on standby
      ctx.lineWidth = 1.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const midY = height / 2;
      offset = (offset + (isActive ? 1.8 : 0.8)) % width;

      for (let x = 0; x < width; x++) {
        const relX = (x + offset) % width;
        let y = midY;

        if (isActive) {
          // Classic P-Q-R-S-T heartbeat wave
          if (relX > 20 && relX < 24) {
            y = midY - 3; // P wave
          } else if (relX >= 24 && relX < 26) {
            y = midY + 2; // Q dip
          } else if (relX >= 26 && relX < 30) {
            y = midY - 9; // R spike
          } else if (relX >= 30 && relX < 33) {
            y = midY + 6; // S dip
          } else if (relX >= 33 && relX < 38) {
            y = midY - 4; // T wave
          }
        } else {
          // Idle resting wave
          y = midY + Math.sin((relX * Math.PI * 2) / 30) * 1.5;
        }

        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();

      // Glowing pulse head
      const headX = width - 1;
      ctx.beginPath();
      ctx.arc(headX, midY, 2, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? "#10b981" : "#f59e0b";
      ctx.fill();

      frameId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(frameId);
  }, [isActive]);

  return (
    <div className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-slate-100/80 border border-slate-200">
      <canvas ref={canvasRef} className="w-16 h-6 block" />
      <span className="text-[10px] font-mono font-bold text-slate-600 pl-0.5">
        {isActive ? "ALIVE" : "STANDBY"}
      </span>
    </div>
  );
};

