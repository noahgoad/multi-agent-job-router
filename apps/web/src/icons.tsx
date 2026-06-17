/**
 * Inline-SVG icon set.
 *
 * Every icon in the dashboard reads from this file. We inline the SVG
 * paths (instead of pulling in `lucide-react` or similar) so the
 * project stays dependency-free, the bundle stays small, and the
 * stroke / fill / size can be controlled per-call site via props.
 *
 * Convention:
 *   - All icons are 24×24 viewBox, stroke-based, no fill
 *   - Stroke width is 1.5 (matches the hairline aesthetic)
 *   - Stroke caps are round for a softer "fintech" feel
 *   - Each icon takes `size` (px) and `color` (any CSS color) props
 *   - `aria-hidden` should be set by the caller if the icon is
 *     decorative; pass `title` to give the icon a label
 */

import React from "react";

export interface IconProps {
  readonly size?: number;
  readonly color?: string;
  readonly strokeWidth?: number;
  readonly style?: React.CSSProperties;
}

function base(
  path: React.ReactNode,
  { size = 16, color = "currentColor", strokeWidth = 1.5, style }: IconProps
) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={style}
    >
      {path}
    </svg>
  );
}

/* ── Status / state ───────────────────────────────────────────────────── */

export const CheckIcon = (p: IconProps) =>
  base(<polyline points="20 6 9 17 4 12" />, p);

export const CheckCircleIcon = (p: IconProps) =>
  base(
    <>
      <circle cx="12" cy="12" r="10" />
      <polyline points="9 12 11 14 15 10" />
    </>,
    p
  );

export const XIcon = (p: IconProps) =>
  base(
    <>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </>,
    p
  );

export const AlertTriangleIcon = (p: IconProps) =>
  base(
    <>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </>,
    p
  );

export const LoaderIcon = (p: IconProps) =>
  base(
    <>
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </>,
    p
  );

/* ── Actions ──────────────────────────────────────────────────────────── */

export const CopyIcon = (p: IconProps) =>
  base(
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>,
    p
  );

export const ExternalLinkIcon = (p: IconProps) =>
  base(
    <>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </>,
    p
  );

export const RefreshIcon = (p: IconProps) =>
  base(
    <>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </>,
    p
  );

export const PlayIcon = (p: IconProps) =>
  base(<polygon points="5 3 19 12 5 21 5 3" />, p);

export const PauseIcon = (p: IconProps) =>
  base(
    <>
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </>,
    p
  );

/* ── Data / chart ─────────────────────────────────────────────────────── */

export const ActivityIcon = (p: IconProps) =>
  base(<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />, p);

export const TrendingUpIcon = (p: IconProps) =>
  base(
    <>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </>,
    p
  );

export const TrendingDownIcon = (p: IconProps) =>
  base(
    <>
      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
      <polyline points="17 18 23 18 23 12" />
    </>,
    p
  );

export const HashIcon = (p: IconProps) =>
  base(
    <>
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" />
      <line x1="16" y1="3" x2="14" y2="21" />
    </>,
    p
  );

export const ClockIcon = (p: IconProps) =>
  base(
    <>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </>,
    p
  );

/* ── Navigation / section ─────────────────────────────────────────────── */

export const DashboardIcon = (p: IconProps) =>
  base(
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>,
    p
  );

export const JobsIcon = (p: IconProps) =>
  base(
    <>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </>,
    p
  );

export const AgentIcon = (p: IconProps) =>
  base(
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M3 21v-2a7 7 0 0 1 7-7h4a7 7 0 0 1 7 7v2" />
    </>,
    p
  );

export const ShieldIcon = (p: IconProps) =>
  base(
    <>
      <path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4z" />
      <polyline points="9 12 11 14 15 10" />
    </>,
    p
  );

export const ReceiptIcon = (p: IconProps) =>
  base(
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </>,
    p
  );

export const SettingsIcon = (p: IconProps) =>
  base(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>,
    p
  );

export const ChainIcon = (p: IconProps) =>
  base(
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>,
    p
  );

export const SearchIcon = (p: IconProps) =>
  base(
    <>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </>,
    p
  );

export const ChevronRightIcon = (p: IconProps) =>
  base(<polyline points="9 18 15 12 9 6" />, p);

export const ChevronDownIcon = (p: IconProps) =>
  base(<polyline points="6 9 12 15 18 9" />, p);

export const PlusIcon = (p: IconProps) =>
  base(
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>,
    p
  );

export const FilterIcon = (p: IconProps) =>
  base(
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />,
    p
  );

/* ── State-specific (the task lifecycle) ──────────────────────────────── */

export const CheckVerifiedIcon = (p: IconProps) =>
  base(
    <>
      <path d="M9 12l2 2 4-4" />
      <path d="M21 12c0 1.66-1.34 3-3 3v3.4a3 3 0 0 1-1.4 2.5L12 22l-4.6-1.1A3 3 0 0 1 6 18.4V15a3 3 0 0 1-3-3c0-1.66 1.34-3 3-3V5.6a3 3 0 0 1 1.4-2.5L12 2l4.6 1.1A3 3 0 0 1 18 5.6V9c1.66 0 3 1.34 3 3z" />
    </>,
    p
  );

/* ── Branding ─────────────────────────────────────────────────────────── */

export const PharosMark = ({
  size = 24,
  color = "#fcd535",
}: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
    {/* Stylised "P" — diamond + chevron motif, Pharos brand mark. */}
    <path d="M5 3 L5 21 L9 21 L9 14 L13 14 C 16.5 14, 19 11.5, 19 8.5 C 19 5.5, 16.5 3, 13 3 Z M 9 6.5 L 12.5 6.5 C 14 6.5, 15 7.4, 15 8.5 C 15 9.6, 14 10.5, 12.5 10.5 L 9 10.5 Z" />
  </svg>
);
