'use client';
import { useEffect, useRef } from 'react';

const CHARS =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ<>{}[]|/\\;:.,!@#$%^&*';

export default function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      // Use the actual rendered size; fall back to clientWidth when
      // offsetWidth is briefly 0 during a layout transition (this
      // happens on narrow viewports the first time the panel toggles
      // visible).
      const w = canvas.offsetWidth || canvas.clientWidth || canvas.parentElement?.clientWidth || 0;
      const h = canvas.offsetHeight || canvas.clientHeight || canvas.parentElement?.clientHeight || 0;
      if (w > 0) canvas.width = w;
      if (h > 0) canvas.height = h;
    };
    resize();
    window.addEventListener('resize', resize);

    // Robustness pass — observe parent size changes too. Without this
    // the canvas captured a 0×0 size at mount-time whenever its parent
    // wasn't laid out yet, and the rain animation drew to an invisible
    // surface for the rest of the session. This guarantees the canvas
    // re-syncs as soon as the parent has real dimensions.
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
      ro = new ResizeObserver(() => resize());
      ro.observe(canvas.parentElement);
    }

    const fontSize = 13;
    let cols = Math.floor(canvas.width / fontSize);
    const drops: number[] = Array.from({ length: cols }, () => Math.floor(Math.random() * -50));

    const draw = () => {
      ctx.fillStyle = 'rgba(10, 10, 10, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      cols = Math.floor(canvas.width / fontSize);
      while (drops.length < cols) drops.push(0);

      for (let i = 0; i < cols; i++) {
        const char = CHARS[Math.floor(Math.random() * CHARS.length)];
        const brightness = Math.random();

        if (brightness > 0.95) {
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = '#00ff41';
          ctx.shadowBlur = 8;
        } else if (brightness > 0.7) {
          ctx.fillStyle = '#00ff41';
          ctx.shadowColor = '#00ff41';
          ctx.shadowBlur = 4;
        } else {
          ctx.fillStyle = '#006600';
          ctx.shadowBlur = 0;
        }

        ctx.font = `${fontSize}px JetBrains Mono, monospace`;
        ctx.fillText(char, i * fontSize, drops[i] * fontSize);

        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i] += 0.5;
      }
    };

    const interval = setInterval(draw, 50);
    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', resize);
      ro?.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full opacity-80"
      aria-hidden="true"
    />
  );
}