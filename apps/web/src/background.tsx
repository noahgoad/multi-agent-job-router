/**
 * Animated background.
 *
 * The dashboard sits on a near-black canvas. To keep the surface from
 * feeling flat, we layer four subtle motion elements behind the
 * content:
 *
 *   1.  Grid pattern    — a 32px square grid, hairline faint, gives
 *                        the page a sense of "infrastructure" and
 *                        provides a soft reference line.
 *   2.  Vignette        — a radial fade at the edges so the centre
 *                        reads as the "stage" and the orbs feel
 *                        embedded.
 *   3.  Floating orbs   — three large, slow-drifting radial gradients
 *                        in the brand yellow + two complementary
 *                        cool tones. They breathe (slow scale + slow
 *                        translation) and never repeat identically
 *                        because each uses a different period.
 *   4.  Particles       — a field of tiny dots, most of them at low
 *                        alpha, a handful of them slowly twinkling.
 *
 * The whole thing is a single `position: fixed` layer behind the
 * app so it never causes layout reflows.
 */

import React from "react";

export function AnimatedBackground() {
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
        overflow: "hidden",
        background:
          // Deep base — slightly cooler than pure black, with a faint
          // top-left warm wash so the canvas never looks dead.
          "radial-gradient(ellipse at 20% 0%, rgba(252, 213, 53, 0.04) 0%, transparent 50%), #050507",
      }}
    >
      <style>{`
        @keyframes pharos-orb-1 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.55; }
          33%      { transform: translate(60px, -40px) scale(1.05); opacity: 0.7; }
          66%      { transform: translate(-30px, 50px) scale(0.95); opacity: 0.45; }
        }
        @keyframes pharos-orb-2 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.4; }
          50%      { transform: translate(-80px, 60px) scale(1.1); opacity: 0.6; }
        }
        @keyframes pharos-orb-3 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.3; }
          50%      { transform: translate(70px, 30px) scale(0.9); opacity: 0.45; }
        }
        @keyframes pharos-twinkle {
          0%, 100% { opacity: 0.15; }
          50%      { opacity: 0.85; }
        }
        .pharos-orb { will-change: transform, opacity; }
        .pharos-twinkle { animation: pharos-twinkle 6s ease-in-out infinite; }
      `}</style>

      {/* Vignette — darkens the corners so the centre reads as the stage. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 40%, transparent 0%, transparent 30%, rgba(0,0,0,0.5) 90%, rgba(0,0,0,0.85) 100%)",
        }}
      />

      {/* Grid pattern — 32px square, hairline faint. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage:
            "radial-gradient(ellipse at 50% 30%, black 0%, transparent 70%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at 50% 30%, black 0%, transparent 70%)",
        }}
      />

      {/* Orb 1 — primary yellow, top-right quadrant. */}
      <div
        className="pharos-orb"
        style={{
          position: "absolute",
          width: 600,
          height: 600,
          top: "-15%",
          right: "-10%",
          background:
            "radial-gradient(circle, rgba(252, 213, 53, 0.18) 0%, rgba(252, 213, 53, 0.06) 30%, transparent 65%)",
          filter: "blur(40px)",
          animation: "pharos-orb-1 18s ease-in-out infinite",
        }}
      />

      {/* Orb 2 — cool blue, bottom-left quadrant. */}
      <div
        className="pharos-orb"
        style={{
          position: "absolute",
          width: 500,
          height: 500,
          bottom: "-10%",
          left: "-8%",
          background:
            "radial-gradient(circle, rgba(91, 141, 239, 0.16) 0%, rgba(91, 141, 239, 0.05) 30%, transparent 65%)",
          filter: "blur(50px)",
          animation: "pharos-orb-2 22s ease-in-out infinite",
        }}
      />

      {/* Orb 3 — violet, mid-right. */}
      <div
        className="pharos-orb"
        style={{
          position: "absolute",
          width: 400,
          height: 400,
          top: "40%",
          right: "20%",
          background:
            "radial-gradient(circle, rgba(167, 139, 250, 0.12) 0%, rgba(167, 139, 250, 0.04) 30%, transparent 65%)",
          filter: "blur(60px)",
          animation: "pharos-orb-3 26s ease-in-out infinite",
        }}
      />

      {/* Particles — a sparse field of small dots. */}
      <ParticleField />
    </div>
  );
}

/**
 * A small, deterministic particle field. Positions and twinkle
 * offsets are computed at module load so the render is cheap and
 * the layout never shifts between frames.
 */
const PARTICLES = Array.from({ length: 28 }, (_, i) => {
  // Use a deterministic pseudo-random distribution so the field
  // looks the same on every load (no hydration-style flicker).
  const seed = (i + 1) * 0.12345;
  return {
    left: `${(seed * 7919) % 100}%`,
    top: `${(seed * 6271) % 100}%`,
    size: 1 + (i % 3),
    delay: (i * 0.37) % 5,
    twinkle: i % 4 === 0, // only a quarter actually twinkle
  };
});

function ParticleField() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
      }}
    >
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className={p.twinkle ? "pharos-twinkle" : undefined}
          style={{
            position: "absolute",
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            backgroundColor: "rgba(252, 213, 53, 0.6)",
            opacity: p.twinkle ? undefined : 0.18,
            animationDelay: `${p.delay}s`,
            boxShadow: "0 0 4px rgba(252, 213, 53, 0.3)",
          }}
        />
      ))}
    </div>
  );
}
