/**
 * Pharos dashboard design tokens — v4 ("premium motion").
 *
 * The v4 system layers a true motion language on top of the Binance
 * palette we settled on in v3:
 *   - glass tokens    — semi-transparent surfaces for backdrop blur
 *   - glow tokens     — coloured box-shadows for hover / focus
 *   - motion tokens   — easing curves and durations that every
 *                       animated element reads from
 *
 * The brand's character is unchanged (single Binance Yellow accent,
 * hairline-bordered chrome, numbers in the "tabular" face) but every
 * interactive element now lifts, glows, or pulses on touch.
 */

export const theme = {
  color: {
    // Page background + the 4-step surface ladder.
    canvas: "#050507",
    surface1: "#0f1014",
    surface2: "#16181d",
    surface3: "#1d2026",

    // Glass variants — used for hero + sidebar + DAG backdrop.
    glass1: "rgba(15, 16, 20, 0.65)",
    glass2: "rgba(22, 24, 29, 0.55)",
    glassBorder: "rgba(255, 255, 255, 0.06)",

    // Hairlines.
    hairline: "rgba(255, 255, 255, 0.06)",
    hairlineStrong: "rgba(255, 255, 255, 0.12)",
    hairlineSubtle: "rgba(255, 255, 255, 0.03)",

    // Text ladder.
    ink: "#ffffff",
    body: "#d4d6db",
    muted: "#7a7e87",
    mutedStrong: "#a0a4ac",
    faint: "#3d4047",

    // Brand accent.
    primary: "#fcd535",
    primarySoft: "#ffe082",
    primaryDeep: "#f0b90b",
    onPrimary: "#0a0a0c",

    // Trading semantics — RESERVED for price direction only.
    tradingUp: "#0ecb81",
    tradingDown: "#f6465d",

    // Generic semantic state colours.
    success: "#0ecb81",
    successBg: "rgba(14, 203, 129, 0.12)",
    successBorder: "rgba(14, 203, 129, 0.32)",
    warning: "#fcd535",
    warningBg: "rgba(252, 213, 53, 0.10)",
    warningBorder: "rgba(252, 213, 53, 0.30)",
    danger: "#f6465d",
    dangerBg: "rgba(246, 70, 93, 0.10)",
    dangerBorder: "rgba(246, 70, 93, 0.30)",
    info: "#5b8def",
    infoBg: "rgba(91, 141, 239, 0.10)",
    infoBorder: "rgba(91, 141, 239, 0.30)",
    violet: "#a78bfa",
    violetBg: "rgba(167, 139, 250, 0.10)",
    violetBorder: "rgba(167, 139, 250, 0.30)",
    neutral: "#a0a4ac",
    neutralBg: "rgba(160, 164, 172, 0.08)",
    neutralBorder: "rgba(160, 164, 172, 0.20)",
  },
  font: {
    sans: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    numbers: '"IBM Plex Sans", "Inter", system-ui, sans-serif',
    mono: '"JetBrains Mono", "SF Mono", Menlo, Monaco, Consolas, monospace',
  },
  radius: {
    xs: "4px",
    sm: "6px",
    md: "10px",
    lg: "14px",
    xl: "20px",
    "2xl": "28px",
    pill: "9999px",
  },
  // Glow tokens — used on hover/focus for the brand yellow and the
  // most common semantic colours. These replace the heavy "shadows"
  // the design system used to forbid.
  glow: {
    primary:
      "0 0 0 1px rgba(252, 213, 53, 0.35), 0 0 24px rgba(252, 213, 53, 0.25)",
    primarySoft:
      "0 0 0 1px rgba(252, 213, 53, 0.20), 0 0 16px rgba(252, 213, 53, 0.10)",
    success:
      "0 0 0 1px rgba(14, 203, 129, 0.30), 0 0 20px rgba(14, 203, 129, 0.20)",
    danger:
      "0 0 0 1px rgba(246, 70, 93, 0.30), 0 0 20px rgba(246, 70, 93, 0.20)",
    info: "0 0 0 1px rgba(91, 141, 239, 0.30), 0 0 20px rgba(91, 141, 239, 0.20)",
  },
  // Motion tokens — the single source of truth for animation
  // duration, easing, and stagger. Every transition reads from here
  // so the system "breathes" at one consistent pace.
  motion: {
    // Easings — chosen to feel "alive" but not "frivolous".
    easeOut: "cubic-bezier(0.16, 1, 0.3, 1)", // smooth deceleration
    easeIn: "cubic-bezier(0.4, 0, 1, 1)",
    easeInOut: "cubic-bezier(0.65, 0, 0.35, 1)",
    spring: "cubic-bezier(0.34, 1.56, 0.64, 1)", // slight overshoot
    // Durations.
    fast: "120ms",
    normal: "240ms",
    slow: "400ms",
    slower: "600ms",
    // Stagger — used for entrance animations to cascade across
    // siblings. Components multiply this by their index.
    stagger: "40ms",
  },
  shadow: {
    // Card surface — a faint top-edge highlight (Linear's "subtle
    // white edge highlight on the top edge of lifted panels") plus
    // a soft drop for separation.
    card: "inset 0 1px 0 0 rgba(255, 255, 255, 0.04), 0 4px 16px rgba(0, 0, 0, 0.20)",
    cardHover:
      "inset 0 1px 0 0 rgba(255, 255, 255, 0.06), 0 8px 32px rgba(0, 0, 0, 0.30)",
    focusRing: "0 0 0 2px rgba(91, 141, 239, 0.50)",
  },
} as const;

export const fontSize = {
  display2xl: "48px",
  displayXl: "36px",
  displayLg: "24px",
  displayMd: "18px",
  displaySm: "15px",
  eyebrow: "11px",
  bodyLg: "15px",
  body: "14px",
  bodySm: "13px",
  caption: "12px",
  micro: "10px",
  numberLg: "32px",
  numberMd: "20px",
  number: "16px",
  numberSm: "14px",
  code: "12.5px",
  codeLg: "13px",
} as const;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  black: 800,
} as const;

export const lineHeight = {
  tight: 1.05,
  snug: 1.2,
  normal: 1.5,
  relaxed: 1.65,
} as const;

export const space = {
  xxs: "2px",
  xs: "4px",
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "20px",
  "2xl": "24px",
  "3xl": "32px",
  "4xl": "40px",
  "5xl": "48px",
  "6xl": "64px",
  "7xl": "80px",
} as const;

import type { TaskState } from "@pharos-router/workflow";

export interface StateStyle {
  readonly fg: string;
  readonly bg: string;
  readonly border: string;
  readonly label: string;
}

export function stateStyle(state: TaskState): StateStyle {
  switch (state) {
    case "PLANNED":
      return {
        fg: theme.color.muted,
        bg: theme.color.neutralBg,
        border: theme.color.neutralBorder,
        label: "Planned",
      };
    case "READY":
      return {
        fg: theme.color.info,
        bg: theme.color.infoBg,
        border: theme.color.infoBorder,
        label: "Ready",
      };
    case "ASSIGNED":
      return {
        fg: theme.color.violet,
        bg: theme.color.violetBg,
        border: theme.color.violetBorder,
        label: "Assigned",
      };
    case "RUNNING":
      return {
        fg: theme.color.warning,
        bg: theme.color.warningBg,
        border: theme.color.warningBorder,
        label: "Running",
      };
    case "SUBMITTED":
      return {
        fg: theme.color.info,
        bg: theme.color.infoBg,
        border: theme.color.infoBorder,
        label: "Submitted",
      };
    case "VERIFIED":
      return {
        fg: theme.color.primary,
        bg: theme.color.warningBg,
        border: theme.color.warningBorder,
        label: "Verified",
      };
    case "FAILED":
      return {
        fg: theme.color.danger,
        bg: theme.color.dangerBg,
        border: theme.color.dangerBorder,
        label: "Failed",
      };
    case "CANCELLED":
      return {
        fg: theme.color.muted,
        bg: theme.color.neutralBg,
        border: theme.color.neutralBorder,
        label: "Cancelled",
      };
  }
}

export function verdictStyle(verdict: "pass" | "fail"): StateStyle {
  return verdict === "pass"
    ? {
        fg: theme.color.primary,
        bg: theme.color.warningBg,
        border: theme.color.warningBorder,
        label: "safe",
      }
    : {
        fg: theme.color.danger,
        bg: theme.color.dangerBg,
        border: theme.color.dangerBorder,
        label: "conflicting",
      };
}
