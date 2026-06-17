/**
 * Shared dashboard components — v4 ("premium motion").
 *
 * Every component here reads from `theme.ts` (colours, motion, glow)
 * and from `motion.ts` (entrance helpers). The whole system has
 * three new affordances that the v3 design lacked:
 *
 *   1. Glass morphism — the hero, the sidebar, and the DAG card
 *      all use `backdrop-filter: blur(20px)` over a semi-transparent
 *      surface so the animated orbs bleed through.
 *   2. Glow on hover — the brand's yellow `glow.primary` shadow
 *      is applied on every interactive surface.
 *   3. Animated counters — the stat-card values count up from 0 on
 *      mount, with a 60-frame easing curve.
 */

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  theme,
  fontSize,
  fontWeight,
  lineHeight,
  space,
  stateStyle,
  verdictStyle,
  type StateStyle,
} from "./theme.js";
import { entrance, keyframes } from "./motion.js";
import type { TaskState } from "@pharos-router/workflow";

/* ────────────────────────────────────────────────────────────────────────
 * Global keyframes — emitted once at the top of the component tree
 * so every motion definition in the file can reference them.
 * ──────────────────────────────────────────────────────────────────────── */

export function MotionStyles() {
  return <style>{keyframes}</style>;
}

/* ────────────────────────────────────────────────────────────────────────
 * GlassCard — the default card surface. Translucent, hairline-bordered,
 * with a soft drop shadow and a `glow-on-hover` class. The optional
 * `accent` adds a yellow gradient bar at the top that animates in
 * with a slight delay.
 * ──────────────────────────────────────────────────────────────────────── */

export function GlassCard({
  eyebrow,
  title,
  trailing,
  children,
  accent,
  delay = 0,
  style,
}: {
  eyebrow?: string;
  title?: string;
  trailing?: ReactNode;
  children: ReactNode;
  accent?: "primary" | "info" | "violet" | "warning" | "danger" | "neutral";
  delay?: number;
  style?: CSSProperties;
}) {
  const accentColor =
    accent === "primary"
      ? theme.color.primary
      : accent === "info"
      ? theme.color.info
      : accent === "violet"
      ? theme.color.violet
      : accent === "warning"
      ? theme.color.warning
      : accent === "danger"
      ? theme.color.danger
      : accent === "neutral"
      ? theme.color.neutral
      : undefined;
  return (
    <section
      className="pharos-hover-lift"
      style={{
        position: "relative",
        backgroundColor: theme.color.glass1,
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
        border: `1px solid ${theme.color.glassBorder}`,
        borderRadius: theme.radius.lg,
        boxShadow: theme.shadow.card,
        overflow: "hidden",
        ...entrance(delay, "fade-up"),
        ...style,
      }}
    >
      {accentColor && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: `linear-gradient(90deg, ${accentColor} 0%, transparent 80%)`,
            opacity: 0.7,
          }}
        />
      )}
      {(eyebrow || title || trailing) && (
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: space.lg,
            padding: `${space.lg} ${space["2xl"]}`,
            borderBottom: `1px solid ${theme.color.hairlineSubtle}`,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {eyebrow && (
              <span
                style={{
                  fontSize: fontSize.eyebrow,
                  fontWeight: fontWeight.semibold,
                  color: theme.color.muted,
                  textTransform: "uppercase",
                  letterSpacing: "0.16em",
                }}
              >
                {eyebrow}
              </span>
            )}
            {title && (
              <h2
                style={{
                  margin: 0,
                  fontSize: fontSize.displayLg,
                  fontWeight: fontWeight.bold,
                  color: theme.color.ink,
                  lineHeight: lineHeight.snug,
                  letterSpacing: "-0.02em",
                }}
              >
                {title}
              </h2>
            )}
          </div>
          {trailing && <div style={{ flexShrink: 0 }}>{trailing}</div>}
        </header>
      )}
      <div style={{ padding: space["2xl"] }}>{children}</div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * StatusPill / VerdictPill / StateDot — same as v3, refreshed to use
 * the new motion-aware theme.
 * ──────────────────────────────────────────────────────────────────────── */

export function StatusPill({
  state,
  withDot = true,
  style,
}: {
  state: TaskState;
  withDot?: boolean;
  style?: CSSProperties;
}) {
  const s = stateStyle(state);
  return (
    <Pill
      fg={s.fg}
      bg={s.bg}
      border={s.border}
      label={s.label}
      withDot={withDot}
      style={style}
    />
  );
}

export function VerdictPill({
  verdict,
  style,
}: {
  verdict: "pass" | "fail";
  style?: CSSProperties;
}) {
  const s = verdictStyle(verdict);
  return (
    <Pill
      fg={s.fg}
      bg={s.bg}
      border={s.border}
      label={s.label}
      withDot
      style={style}
    />
  );
}

function Pill({
  fg,
  bg,
  border,
  label,
  withDot,
  style,
}: {
  fg: string;
  bg: string;
  border: string;
  label: string;
  withDot: boolean;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: `3px 10px`,
        borderRadius: theme.radius.pill,
        backgroundColor: bg,
        border: `1px solid ${border}`,
        color: fg,
        fontFamily: theme.font.sans,
        fontSize: fontSize.caption,
        fontWeight: fontWeight.semibold,
        lineHeight: lineHeight.snug,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {withDot && (
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: fg,
            boxShadow: `0 0 6px ${fg}`,
          }}
        />
      )}
      {label}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * StatCard v4 — animated number counter + animated sparkline + trend
 * pill + hover lift. The big "3/3" number counts up from 0 the moment
 * the card mounts.
 * ──────────────────────────────────────────────────────────────────────── */

export function StatCard({
  label,
  value,
  hint,
  accent = "primary",
  sparkline,
  trend,
  delay = 0,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: "primary" | "info" | "violet" | "warning" | "danger" | "neutral";
  sparkline?: ReadonlyArray<number>;
  trend?: { direction: "up" | "down" | "flat"; delta: string };
  delay?: number;
}) {
  const accentColor =
    accent === "primary"
      ? theme.color.primary
      : accent === "info"
      ? theme.color.info
      : accent === "violet"
      ? theme.color.violet
      : accent === "warning"
      ? theme.color.warning
      : accent === "danger"
      ? theme.color.danger
      : theme.color.neutral;

  return (
    <div
      className="pharos-hover-lift"
      style={{
        position: "relative",
        backgroundColor: theme.color.glass1,
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
        border: `1px solid ${theme.color.glassBorder}`,
        borderRadius: theme.radius.lg,
        boxShadow: theme.shadow.card,
        padding: space["2xl"],
        display: "flex",
        flexDirection: "column",
        gap: space.sm,
        overflow: "hidden",
        ...entrance(delay, "fade-up"),
      }}
    >
      {/* Top accent bar */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, ${accentColor} 0%, transparent 80%)`,
          opacity: 0.8,
        }}
      />
      {/* Floating orb in the corner — adds depth */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -40,
          right: -40,
          width: 120,
          height: 120,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accentColor}18 0%, transparent 70%)`,
          filter: "blur(20px)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          position: "relative",
          zIndex: 1,
        }}
      >
        <span
          style={{
            fontSize: fontSize.eyebrow,
            fontWeight: fontWeight.semibold,
            color: theme.color.muted,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
          }}
        >
          {label}
        </span>
        {trend && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: fontSize.micro,
              fontWeight: fontWeight.bold,
              fontFamily: theme.font.numbers,
              color:
                trend.direction === "up"
                  ? theme.color.success
                  : trend.direction === "down"
                  ? theme.color.danger
                  : theme.color.muted,
              padding: "2px 8px",
              borderRadius: theme.radius.sm,
              backgroundColor:
                trend.direction === "up"
                  ? theme.color.successBg
                  : trend.direction === "down"
                  ? theme.color.dangerBg
                  : "transparent",
              border: `1px solid ${
                trend.direction === "up"
                  ? theme.color.successBorder
                  : trend.direction === "down"
                  ? theme.color.dangerBorder
                  : theme.color.hairline
              }`,
            }}
          >
            {trend.direction === "up"
              ? "▲"
              : trend.direction === "down"
              ? "▼"
              : "—"}
            {trend.delta}
          </span>
        )}
      </div>
      <div
        style={{
          fontFamily: theme.font.numbers,
          fontSize: fontSize.numberLg,
          fontWeight: fontWeight.bold,
          color: accent === "primary" ? theme.color.primary : theme.color.ink,
          lineHeight: lineHeight.tight,
          letterSpacing: "-0.02em",
          position: "relative",
          zIndex: 1,
        }}
      >
        {typeof value === "string" || typeof value === "number" ? (
          <AnimatedNumber value={value} />
        ) : (
          value
        )}
      </div>
      {hint && (
        <span
          style={{
            fontSize: fontSize.caption,
            color: theme.color.muted,
            fontFamily: theme.font.sans,
            position: "relative",
            zIndex: 1,
          }}
        >
          {hint}
        </span>
      )}
      {sparkline && sparkline.length > 1 && (
        <div
          style={{
            marginTop: space.xs,
            marginLeft: `-${space.md}`,
            position: "relative",
            zIndex: 1,
          }}
        >
          <Sparkline
            data={sparkline}
            color={accentColor}
            height={36}
            width={240}
          />
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * AnimatedNumber — counts up from 0 to the target value over 800ms.
 * Handles the common patterns: "3/3", "3", "688689", "1,000,000".
 * Falls back to the original string when the value is non-numeric
 * (e.g. "12,847" is kept as-is to preserve the comma).
 * ──────────────────────────────────────────────────────────────────────── */

function AnimatedNumber({ value }: { value: string | number }) {
  const target = typeof value === "number" ? value.toString() : value;
  // Detect a "X/Y" pattern (e.g. "3/3") — animate both halves.
  const slash = target.match(/^(-?\d+)\s*\/\s*(-?\d+)$/);
  // Detect a plain integer.
  const plain = target.match(/^-?\d+$/);

  if (slash) {
    return (
      <span>
        <CountUp to={Number(slash[1])} />
        <span style={{ opacity: 0.5 }}> / </span>
        <CountUp to={Number(slash[2])} />
      </span>
    );
  }
  if (plain) {
    return <CountUp to={Number(target)} />;
  }
  // Otherwise render as-is (e.g. "12,847", "1,000,000", "688689").
  return <span>{target}</span>;
}

function CountUp({ to }: { to: number }) {
  const [n, setN] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    const start = performance.now();
    const dur = 900;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(to * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [to]);
  return <span>{n.toLocaleString()}</span>;
}

/* ────────────────────────────────────────────────────────────────────────
 * HashDisplay — same as v3 but with a smoother copy animation and a
 * brighter "copied" state.
 * ──────────────────────────────────────────────────────────────────────── */

export function HashDisplay({
  label,
  value,
  truncate = 10,
}: {
  label: string;
  value: string;
  truncate?: number;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(value).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      },
      () => {}
    );
  }, [value]);

  const abbrev =
    value.length > truncate + 4
      ? `${value.slice(0, truncate)}…${value.slice(-4)}`
      : value;

  return (
    <div
      className="pharos-hover-lift"
      style={{
        display: "flex",
        alignItems: "center",
        gap: space.md,
        padding: `${space.md} ${space.lg}`,
        backgroundColor: theme.color.glass2,
        border: `1px solid ${theme.color.glassBorder}`,
        borderRadius: theme.radius.md,
      }}
    >
      <span
        style={{
          fontSize: fontSize.eyebrow,
          fontWeight: fontWeight.semibold,
          color: theme.color.muted,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <code
        title={value}
        style={{
          flex: 1,
          fontFamily: theme.font.mono,
          fontSize: fontSize.code,
          color: theme.color.ink,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {abbrev}
      </code>
      <button
        type="button"
        onClick={onCopy}
        aria-label={`Copy ${label}`}
        className="pharos-hover-lift"
        style={{
          appearance: "none",
          background: copied ? theme.color.successBg : "transparent",
          border: `1px solid ${
            copied ? theme.color.successBorder : theme.color.glassBorder
          }`,
          borderRadius: theme.radius.xs,
          color: copied ? theme.color.success : theme.color.muted,
          cursor: "pointer",
          fontFamily: theme.font.sans,
          fontSize: fontSize.micro,
          fontWeight: fontWeight.bold,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          padding: `3px 8px`,
        }}
      >
        {copied ? "✓ Copied" : "Copy"}
      </button>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Sparkline v4 — same data but with a draw-in animation. The polyline
 * `stroke-dasharray` starts at the line length and animates to 0.
 * ──────────────────────────────────────────────────────────────────────── */

export function Sparkline({
  data,
  color,
  width = 200,
  height = 40,
  delay = 0,
}: {
  data: ReadonlyArray<number>;
  color: string;
  width?: number;
  height?: number;
  delay?: number;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const last = data[data.length - 1] ?? 0;
  const lastX = (data.length - 1) * step;
  const lastY = height - ((last - min) / range) * height;
  const lineLength = data.length * step;
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        <linearGradient
          id={`spark-fill-${color.replace("#", "")}`}
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop offset="0%" stopColor={color} stopOpacity="0.30" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${height} ${points} ${width},${height}`}
        fill={`url(#spark-fill-${color.replace("#", "")})`}
        opacity={0.6}
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={lineLength}
        strokeDashoffset={lineLength}
        style={{
          animation: `pharos-draw-line 1.2s ${theme.motion.easeOut} ${delay}ms forwards`,
        }}
      />
      <circle
        cx={lastX}
        cy={lastY}
        r={3}
        fill={color}
        style={{
          animation: `pharos-fade-in 400ms ${theme.motion.easeOut} ${
            delay + 1100
          }ms both`,
        }}
      />
      <style>{`@keyframes pharos-draw-line{to{stroke-dashoffset:0}}`}</style>
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * StateDot.
 * ──────────────────────────────────────────────────────────────────────── */

export function StateDot({
  state,
  style,
}: {
  state: TaskState;
  style?: CSSProperties;
}) {
  const s = stateStyle(state);
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        backgroundColor: s.fg,
        boxShadow:
          state === "VERIFIED" || state === "RUNNING" || state === "ASSIGNED"
            ? `0 0 0 3px ${s.bg}, 0 0 8px ${s.fg}`
            : "none",
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Eyebrow.
 * ──────────────────────────────────────────────────────────────────────── */

export function Eyebrow({
  children,
  color = theme.color.muted,
  style,
}: {
  children: ReactNode;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        fontFamily: theme.font.sans,
        fontSize: fontSize.eyebrow,
        fontWeight: fontWeight.bold,
        color,
        textTransform: "uppercase",
        letterSpacing: "0.16em",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export type { StateStyle };
