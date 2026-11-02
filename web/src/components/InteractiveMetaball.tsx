import React, { useEffect, useRef } from "react";

/**
 * InteractiveMetaball.tsx — Interactive Fluid Liquidity Orb (Hero Visual)
 * Inspired by Codrops / WebGL Metaballs & Liquid Glass Shaders.
 * Renders an organic, morphing fluid orb that reacts to cursor position,
 * symbolizing dynamic decentralized liquidity pools.
 */
export const InteractiveMetaball: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let time = 0;
    let mouse = { x: canvas.width / 2, y: canvas.height / 2, targetX: canvas.width / 2, targetY: canvas.height / 2 };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.targetX = e.clientX - rect.left;
      mouse.targetY = e.clientY - rect.top;
    };

    window.addEventListener("mousemove", handleMouseMove);

    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        mouse.x = canvas.width / 2;
        mouse.y = canvas.height / 2;
        mouse.targetX = mouse.x;
        mouse.targetY = mouse.y;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const render = () => {
      time += 0.02;
      mouse.x += (mouse.targetX - mouse.x) * 0.05;
      mouse.y += (mouse.targetY - mouse.y) * 0.05;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const baseRadius = Math.min(canvas.width, canvas.height) * 0.32;

      // Draw background ambient glow
      const glowGrad = ctx.createRadialGradient(
        centerX,
        centerY,
        baseRadius * 0.2,
        centerX,
        centerY,
        baseRadius * 1.6
      );
      glowGrad.addColorStop(0, "rgba(2, 132, 199, 0.12)");
      glowGrad.addColorStop(0.5, "rgba(99, 102, 241, 0.06)");
      glowGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Render morphing liquid fluid boundary
      ctx.save();
      ctx.translate(centerX, centerY);

      // Mouse influence on deformation
      const dx = (mouse.x - centerX) / canvas.width;
      const dy = (mouse.y - centerY) / canvas.height;

      const numPoints = 64;
      ctx.beginPath();

      for (let i = 0; i <= numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        const wave1 = Math.sin(angle * 3 + time * 1.2) * (baseRadius * 0.08);
        const wave2 = Math.cos(angle * 5 - time * 0.9) * (baseRadius * 0.05);
        const wave3 = Math.sin(angle * 2 + time * 2.0) * (baseRadius * 0.04);
        const mouseDistort = (Math.cos(angle) * dx + Math.sin(angle) * dy) * (baseRadius * 0.2);

        const r = baseRadius + wave1 + wave2 + wave3 + mouseDistort;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.closePath();

      // Fluid glass gradient fill
      const orbGrad = ctx.createRadialGradient(
        -baseRadius * 0.3 + dx * 40,
        -baseRadius * 0.3 + dy * 40,
        baseRadius * 0.1,
        0,
        0,
        baseRadius * 1.2
      );
      orbGrad.addColorStop(0, "rgba(255, 255, 255, 0.95)");
      orbGrad.addColorStop(0.2, "rgba(224, 242, 254, 0.85)");
      orbGrad.addColorStop(0.5, "rgba(186, 230, 253, 0.65)");
      orbGrad.addColorStop(0.8, "rgba(125, 211, 252, 0.45)");
      orbGrad.addColorStop(1, "rgba(56, 189, 248, 0.2)");

      ctx.fillStyle = orbGrad;
      ctx.shadowColor = "rgba(2, 132, 199, 0.25)";
      ctx.shadowBlur = 35;
      ctx.fill();

      // Outer glass specular ring
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
      ctx.stroke();

      // Inner liquid depth ripples
      ctx.beginPath();
      for (let i = 0; i <= numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        const rInner = baseRadius * 0.65 + Math.sin(angle * 4 - time * 1.5) * 8;
        const xi = Math.cos(angle) * rInner;
        const yi = Math.sin(angle) * rInner;
        if (i === 0) ctx.moveTo(xi, yi);
        else ctx.lineTo(xi, yi);
      }
      ctx.closePath();
      ctx.strokeStyle = "rgba(2, 132, 199, 0.25)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div className="relative w-full h-[420px] md:h-[480px] flex items-center justify-center overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};

