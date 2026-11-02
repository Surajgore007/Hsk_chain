import React, { useEffect, useRef } from "react";

/**
 * LiquidityWaves.tsx — 3D Ambient Wave Background (representing pool liquidity)
 * Inspired by Codepen 3D Waves Background, recolored for our premium light theme.
 * Uses high-performance Canvas 2D/WebGL math with silky smooth sine-wave meshes.
 */
export const LiquidityWaves: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let step = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const waves = [
      { amplitude: 35, frequency: 0.004, speed: 0.015, color: "rgba(2, 132, 199, 0.035)", offset: 0 },
      { amplitude: 45, frequency: 0.003, speed: 0.010, color: "rgba(99, 102, 241, 0.025)", offset: 2 },
      { amplitude: 25, frequency: 0.006, speed: 0.020, color: "rgba(14, 165, 233, 0.030)", offset: 4 },
    ];

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      step += 1;

      const baseY = canvas.height * 0.75;

      waves.forEach((w) => {
        ctx.beginPath();
        ctx.moveTo(0, baseY);

        for (let x = 0; x <= canvas.width; x += 8) {
          const y =
            baseY +
            Math.sin(x * w.frequency + step * w.speed + w.offset) * w.amplitude +
            Math.cos(x * (w.frequency * 0.5) + step * (w.speed * 0.7)) * (w.amplitude * 0.5);
          ctx.lineTo(x, y);
        }

        ctx.lineTo(canvas.width, canvas.height);
        ctx.lineTo(0, canvas.height);
        ctx.closePath();
        ctx.fillStyle = w.color;
        ctx.fill();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 opacity-80"
    />
  );
};

