/**
 * Pharos logo.
 *
 * The Lighthouse of Alexandria (`φάρος` → Pharos) was the original
 * "decentralised beacon" — a tower whose light reached every ship
 * for miles. The brand mark distils that into a single mark: a
 * central pillar flanked by an outward-fanning beam, suggesting
 * both a lighthouse and a network of connected agents.
 *
 * Two marks ship in this file:
 *   - `PharosMark`    : the small icon used in chrome (16-32px)
 *   - `PharosLogotype`: the full lockup with the wordmark (used in
 *                       the hero and the top-of-card brand area)
 *
 * Both render the same SVG so the icon and the wordmark share a
 * single source of truth. The yellow is a 2-stop gradient (Binance
 * gold → amber) for that "lit-from-within" feel.
 */

import React from "react";

const GRADIENT_ID = "pharos-logo-gradient";

const BeamPath = (
  <>
    <defs>
      <linearGradient id={GRADIENT_ID} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fff7c2" />
        <stop offset="55%" stopColor="#fcd535" />
        <stop offset="100%" stopColor="#f0b90b" />
      </linearGradient>
    </defs>
    {/* The pillar — a vertical bar with a slight taper at top/bottom. */}
    <rect x="11" y="6" width="2" height="14" rx="1" fill={`url(#${GRADIENT_ID})`} />
    {/* The beam — eight rays fanning outward from the pillar top. */}
    <g fill={`url(#${GRADIENT_ID})`} opacity="0.95">
      <rect x="11.75" y="2" width="0.5" height="3" />
      <rect x="11.75" y="21" width="0.5" height="3" />
      <rect x="2" y="11.75" width="3" height="0.5" />
      <rect x="21" y="11.75" width="3" height="0.5" />
    </g>
    <g fill="#fcd535" opacity="0.7">
      <path d="M12 4 L13.2 7 L10.8 7 Z" />
      <path d="M12 22 L13.2 19 L10.8 19 Z" />
      <path d="M4 12 L7 13.2 L7 10.8 Z" />
      <path d="M22 12 L19 13.2 L19 10.8 Z" />
    </g>
    <g fill="#fcd535" opacity="0.45">
      <path d="M6 6 L8 7.2 L7.2 8.8 L5.2 7.6 Z" />
      <path d="M20 6 L18 7.2 L18.8 8.8 L20.8 7.6 Z" />
      <path d="M6 20 L8 18.8 L7.2 17.2 L5.2 18.4 Z" />
      <path d="M20 20 L18 18.8 L18.8 17.2 L20.8 18.4 Z" />
    </g>
    {/* The bulb at the centre of the beam — a glowing dot. */}
    <circle cx="12" cy="12" r="2.2" fill="#fffbe6" />
    <circle cx="12" cy="12" r="3.5" fill="#fcd535" opacity="0.35" />
  </>
);

export function PharosMark({
  size = 24,
  withGlow = false,
}: {
  size?: number;
  withGlow?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-label="Pharos"
      style={{
        filter: withGlow
          ? "drop-shadow(0 0 6px rgba(252, 213, 53, 0.6)) drop-shadow(0 0 14px rgba(252, 213, 53, 0.3))"
          : "drop-shadow(0 0 4px rgba(252, 213, 53, 0.25))",
        transition: "filter 240ms",
      }}
    >
      {BeamPath}
    </svg>
  );
}

/**
 * Full lockup — icon + wordmark + tagline, used in the hero and the
 * sidebar brand area.
 */
export function PharosLogotype({
  size = 36,
  showTagline = true,
}: {
  size?: number;
  showTagline?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <PharosMark size={size} withGlow />
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 18,
            fontWeight: 700,
            color: "#fffbe6",
            letterSpacing: "0.01em",
            lineHeight: 1.05,
            textShadow: "0 0 18px rgba(252, 213, 53, 0.25)",
          }}
        >
          Pharos
        </span>
        {showTagline && (
          <span
            style={{
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 10,
              fontWeight: 500,
              color: "#929aa5",
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              lineHeight: 1,
            }}
          >
            Multi-Agent Router
          </span>
        )}
      </div>
    </div>
  );
}
