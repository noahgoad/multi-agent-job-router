/**
 * Motion — CSS keyframes + entrance helpers.
 *
 * The dashboard reads from these constants so every animated element
 * shares the same easing curves and durations (see `theme.motion`).
 *
 * Entrance animations are applied via inline `animation` style with
 * a per-element `delay` (typically `i * theme.motion.stagger`).
 */

import { theme } from "./theme.js";

export const keyframes = `
  /* ── Entrance ─────────────────────────────────────────────────────── */
  @keyframes pharos-fade-up {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes pharos-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes pharos-slide-right {
    from { opacity: 0; transform: translateX(-12px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes pharos-scale-in {
    from { opacity: 0; transform: scale(0.96); }
    to   { opacity: 1; transform: scale(1); }
  }

  /* ── Continuous ───────────────────────────────────────────────────── */
  @keyframes pharos-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%      { opacity: 0.5; transform: scale(0.85); }
  }
  @keyframes pharos-pulse-ring {
    0%   { box-shadow: 0 0 0 0 rgba(252, 213, 53, 0.45); }
    70%  { box-shadow: 0 0 0 8px rgba(252, 213, 53, 0); }
    100% { box-shadow: 0 0 0 0 rgba(252, 213, 53, 0); }
  }
  @keyframes pharos-spin {
    to { transform: rotate(360deg); }
  }
  @keyframes pharos-shimmer {
    0%   { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  @keyframes pharos-dash {
    to { stroke-dashoffset: -16; }
  }
  @keyframes pharos-float {
    0%, 100% { transform: translateY(0); }
    50%      { transform: translateY(-4px); }
  }
  @keyframes pharos-glow {
    0%, 100% { box-shadow: 0 0 16px rgba(252, 213, 53, 0.20); }
    50%      { box-shadow: 0 0 28px rgba(252, 213, 53, 0.45); }
  }
  @keyframes pharos-progress {
    from { transform: scaleX(0); }
    to   { transform: scaleX(1); }
  }
  @keyframes pharos-fade {
    0%, 100% { opacity: 0.4; }
    50%      { opacity: 1; }
  }
  @keyframes pharos-pulse-ring {
    0%   { transform: scale(0.9); opacity: 0.9; }
    100% { transform: scale(1.35); opacity: 0; }
  }

  /* ── Hover affordances ────────────────────────────────────────────── */
  .pharos-hover-lift {
    transition: transform ${theme.motion.normal} ${theme.motion.easeOut},
                box-shadow ${theme.motion.normal} ${theme.motion.easeOut},
                border-color ${theme.motion.fast} ${theme.motion.easeOut};
  }
  .pharos-hover-lift:hover {
    transform: translateY(-2px);
  }
  .pharos-glow-on-hover {
    transition: box-shadow ${theme.motion.normal} ${theme.motion.easeOut};
  }
  .pharos-glow-on-hover:hover {
    box-shadow: ${theme.glow.primary};
  }
`;

/** Standard entrance animation for a card or section. */
export function entrance(
  i = 0,
  variant: "fade-up" | "fade-in" | "slide-right" | "scale-in" = "fade-up"
): React.CSSProperties {
  const name =
    variant === "fade-up"
      ? "pharos-fade-up"
      : variant === "fade-in"
      ? "pharos-fade-in"
      : variant === "slide-right"
      ? "pharos-slide-right"
      : "pharos-scale-in";
  return {
    animation: `${name} ${theme.motion.slow} ${theme.motion.easeOut} both`,
    animationDelay: `${i * 40}ms`,
  };
}
