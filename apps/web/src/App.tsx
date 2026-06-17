import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { RouterClient, type JobView } from "@pharos-router/sdk";
import type { TaskResult, TaskState } from "@pharos-router/workflow";
import {
  theme,
  fontSize,
  fontWeight,
  lineHeight,
  space,
  stateStyle,
} from "./theme.js";
import {
  GlassCard,
  StatusPill,
  VerdictPill,
  StateDot,
  StatCard,
  HashDisplay,
  Eyebrow,
  MotionStyles,
} from "./components.js";
import { AnimatedBackground } from "./background.js";
import { PharosMark, PharosLogotype } from "./logo.js";
import {
  CheckIcon,
  XIcon,
  AlertTriangleIcon,
  ExternalLinkIcon,
  RefreshIcon,
  ActivityIcon,
  HashIcon,
  ClockIcon,
  DashboardIcon,
  JobsIcon,
  AgentIcon,
  ShieldIcon,
  ReceiptIcon,
  SettingsIcon,
  ChainIcon,
  SearchIcon,
  ChevronRightIcon,
  PlusIcon,
  CheckVerifiedIcon,
} from "./icons.js";

/**
 * Pharos Multi-Agent Job Router — v4 ("premium motion").
 *
 * v4 builds on the v3 Binance-inspired system with three new
 * affordances that the previous design lacked:
 *
 *   - **Animated background.** Three large, slow-drifting gradient
 *     orbs (yellow / blue / violet) sit behind the dashboard,
 *     overlaid on a hairline grid + a sparse particle field. The
 *     whole layer is a single `position: fixed` div so it never
 *     causes layout reflows.
 *
 *   - **Glass morphism.** Every surface that lives over the
 *     background (sidebar, hero, DAG card, hash cards, copy
 *     buttons) uses a translucent fill + `backdrop-filter: blur(20px)`
 *     so the orbs bleed through.
 *
 *   - **Motion everywhere.** Hover-lift, glow, sparkline draw-in,
 *     animated counters, accent-bar pulse, pill-pulse, shimmer.
 *     Every duration + easing reads from `theme.motion` so the
 *     system breathes at one consistent pace.
 */

export const EXPECTED_CHAIN_ID = 688689;
export const EXPLORER_URL =
  (typeof process !== "undefined" && process.env?.PHAROS_EXPLORER_URL) ||
  "https://atlantic.pharosscan.xyz";

// Sidebar nav items — declared at module scope so `DashboardLoaded`
// can look up a label by id (for the "coming soon" toast) without
// re-creating the same list inside `Sidebar`.
export const workspaceItems = [
  { id: "dashboard", label: "Dashboard" },
  { id: "jobs", label: "Jobs" },
  { id: "agents", label: "Agents" },
  { id: "receipts", label: "Receipts" },
] as const;
export const observabilityItems = [
  { id: "verifications", label: "Verifications" },
  { id: "activity", label: "Activity log" },
  { id: "settings", label: "Settings" },
] as const;

export interface DashboardProps {
  readonly baseUrl?: string;
  readonly jobId?: string;
  readonly authToken?: string;
}

export function Dashboard({
  baseUrl = "http://127.0.0.1:8787",
  jobId = "demo",
  authToken = "dev-token",
}: DashboardProps) {
  const client = useMemo(
    () =>
      new RouterClient({
        baseUrl,
        headers: { authorization: `Bearer ${authToken}` },
      }),
    [baseUrl, authToken]
  );
  const [view, setView] = useState<JobView | null>(null);
  const [pending, setPending] = useState(true);
  // apiDown: true while the API is unreachable. Replaces the old
  // hard-error screen with a transient retry+toast. attempt
  // increments per failed poll so the toast can show "retry #3…".
  const [apiDown, setApiDown] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [retryIn, setRetryIn] = useState(0); // seconds until next retry
  // Mirror apiDown into a ref so the 1Hz countdown tick reads the
  // latest value without re-binding the interval.
  const apiDownRef = useRef(false);
  useEffect(() => {
    apiDownRef.current = apiDown;
  }, [apiDown]);

  useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    let timer: number | null = null;

    const schedule = (delay: number) => {
      if (cancelled) return;
      setRetryIn(Math.ceil(delay / 1000));
      timer = window.setTimeout(load, delay);
    };

    async function load() {
      if (cancelled) return;
      setPending(true);
      try {
        const v = await client.inspectJob(jobId);
        if (cancelled) return;
        setView(v);
        setApiDown(false);
        setRetryAttempt(0);
      } catch {
        if (cancelled) return;
        attempt += 1;
        setApiDown(true);
        setRetryAttempt(attempt);
        // Exponential backoff: 1s, 2s, 4s, 8s, … capped at 30s.
        const delay = Math.min(30_000, 1_000 * Math.pow(2, attempt - 1));
        schedule(delay);
      } finally {
        if (!cancelled) setPending(false);
      }
    }
    // Tick once per second while waiting, so the toast shows a
    // live countdown.
    const ticker = window.setInterval(() => {
      if (apiDownRef.current) {
        setRetryIn((s) => (s > 0 ? s - 1 : 0));
      }
    }, 1000);
    void load();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      window.clearInterval(ticker);
    };
  }, [client, jobId]);

  return (
    <>
      <MotionStyles />
      <AnimatedBackground />
      {apiDown && <ApiDownToast attempt={retryAttempt} secondsLeft={retryIn} />}
      {pending && !view ? (
        <LoadingState jobId={jobId} />
      ) : !view ? (
        <EmptyState />
      ) : (
        <DashboardLoaded
          view={view}
          baseUrl={baseUrl}
          client={client}
          jobId={jobId}
          onViewUpdate={setView}
          onApiChange={setApiDown}
        />
      )}
    </>
  );
}

/**
 * Small top-of-screen toast shown while the API is unreachable.
 * Lives outside the dashboard scroll container so it stays pinned
 * regardless of viewport position.
 */
function ApiDownToast({
  attempt,
  secondsLeft,
}: {
  attempt: number;
  secondsLeft: number;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 200,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: space.sm,
        padding: `${space.xs} ${space.md}`,
        background: theme.color.dangerBg,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        borderBottom: `1px solid ${theme.color.dangerBorder}`,
        color: theme.color.danger,
        fontFamily: theme.font.numbers,
        fontSize: fontSize.caption,
        fontWeight: fontWeight.bold,
        letterSpacing: "0.02em",
      }}
    >
      <span aria-hidden style={{ fontSize: 14 }}>
        ⚠
      </span>
      <span>
        API unreachable — retry #{attempt}, next attempt in {secondsLeft}s…
      </span>
    </div>
  );
}

function DashboardLoaded({
  view,
  baseUrl,
  client,
  jobId,
  onViewUpdate,
  onApiChange,
}: {
  view: JobView;
  baseUrl: string;
  client: RouterClient;
  jobId: string;
  onViewUpdate: Dispatch<SetStateAction<JobView | null>>;
  onApiChange?: (down: boolean) => void;
}) {
  const wrongNetwork =
    view.receipt && view.receipt.chainId !== EXPECTED_CHAIN_ID;
  const verified = countByState(view, "VERIFIED");
  const failed = countByState(view, "FAILED");
  const totalTasks = view.graph.nodes.length;
  const totalSpentLabel = view.receipt
    ? formatMicrousd(view.receipt.totalSpentMicrousd)
    : "—";
  const chainId = view.receipt?.chainId ?? EXPECTED_CHAIN_ID;
  const allDone = verified === totalTasks;
  const activity = buildActivity(view);

  // ── Demo playback state ─────────────────────────────────────
  // The server's /jobs/:id/play endpoint runs the orchestrator in
  // slow motion (default 600ms per transition). We fire-and-forget
  // the request and poll /jobs/:id every 400ms so the dashboard
  // animates through PLANNED → ASSIGNED → RUNNING → VERIFIED for
  // each task.
  //
  // The user can flip between two modes:
  //   - "auto"  : server-side slow play (current behaviour). The
  //                speed slider sets tickMs on the server. Pause /
  //                Resume stop and restart the polling (the server
  //                keeps running, the UI just stops catching up).
  //   - "step"  : client-side simulation. The sequence is
  //                precomputed for each scenario and the user
  //                advances one transition per Step click. Step
  //                mode is great for explaining each transition
  //                during a live presentation.
  type DemoScenario = "happy" | "verifier" | "failure";
  type Step = Partial<Record<string, TaskState>>;
  type Mode = "auto" | "step";
  const [mode, setMode] = useState<Mode>("auto");
  // 1500ms per transition = ~6s for the full happy-path demo
  // (4 tasks × 1500ms each on the critical path). Short enough to
  // stay snappy, long enough that the dashboard has time to render
  // every PLANNED → ASSIGNED → RUNNING → VERIFIED transition before
  // the user blinks. The slider can override at runtime.
  const [tickMs, setTickMs] = useState(1500);
  const [activeScenario, setActiveScenario] = useState<DemoScenario | null>(
    null
  );
  // Auto-mode state.
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const pollRef = useRef<{ interval?: number; timeout?: number } | null>(null);
  // Set true by stopPolling so any in-flight recursive setTimeout
  // bails out instead of firing one more poll after teardown.
  const pollingCancelledRef = useRef(false);
  // Step-mode state.
  const [sequence, setSequence] = useState<Step[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [isAutoStepping, setIsAutoStepping] = useState(false);
  const autoStepTimerRef = useRef<number | null>(null);
  const stepIdxRef = useRef(stepIdx);
  useEffect(() => {
    stepIdxRef.current = stepIdx;
  }, [stepIdx]);
  // Highlight ring: a Map of taskId → timestamp of last state change.
  // The DagView uses this to flash a pulse ring around the node that
  // just transitioned. Cleared after ~1s.
  const [recentChanges, setRecentChanges] = useState<Map<string, number>>(
    new Map()
  );
  const prevStateRef = useRef<Record<string, TaskState>>({});
  useEffect(() => {
    const prev = prevStateRef.current;
    const curr = view.state;
    if (prev === curr) return;
    const now = Date.now();
    const next = new Map<string, number>();
    for (const node of view.graph.nodes) {
      const taskId = node.taskId;
      if (prev[taskId] !== curr[taskId]) {
        next.set(taskId, now);
      }
    }
    prevStateRef.current = curr;
    if (next.size > 0) {
      setRecentChanges((prevMap) => {
        const merged = new Map(prevMap);
        for (const [k, v] of next) merged.set(k, v);
        return merged;
      });
      const t = window.setTimeout(() => {
        setRecentChanges((prevMap) => {
          const cut = Date.now() - 1000;
          const m = new Map(prevMap);
          for (const [k, v] of prevMap) {
            if (v <= cut) m.delete(k);
          }
          return m;
        });
      }, 1100);
      return () => window.clearTimeout(t);
    }
  }, [view.state, view.graph.nodes]);
  // Combined `isPlaying` is true while either mode is mid-run; the
  // segmented control disables itself while this is set.
  const isPlaying =
    mode === "auto" ? isAutoRunning : stepIdx > 0 && stepIdx < sequence.length;

  // Precomputed transition sequences. Each entry is a partial state
  // update that gets merged into the current view; the user steps
  // through them one at a time in step mode. The demo DAG is a
  // diamond: t1 → {t2, t3} → t4.
  const SCENARIO_SEQUENCES: Record<DemoScenario, Step[]> = {
    happy: [
      { t1: "ASSIGNED" },
      { t1: "RUNNING" },
      { t1: "VERIFIED" },
      { t2: "ASSIGNED" },
      { t2: "RUNNING" },
      { t2: "VERIFIED" },
      { t3: "ASSIGNED" },
      { t3: "RUNNING" },
      { t3: "VERIFIED" },
      { t4: "ASSIGNED" },
      { t4: "RUNNING" },
      { t4: "VERIFIED" },
    ],
    // t2's verifier disagrees on every attempt (wrong outputHash).
    // t1 succeeds; t2 SUBMITTED×3 then FAILED; cancelDownstream
    // marks t4 CANCELLED. t3 still runs (deps are t1 only) and
    // VERIFIED.
    verifier: [
      { t1: "ASSIGNED" },
      { t1: "RUNNING" },
      { t1: "VERIFIED" },
      { t2: "ASSIGNED" },
      { t2: "SUBMITTED" },
      { t2: "ASSIGNED" },
      { t2: "SUBMITTED" },
      { t2: "ASSIGNED" },
      { t2: "SUBMITTED" },
      { t2: "FAILED" },
      { t4: "CANCELLED" },
      { t3: "ASSIGNED" },
      { t3: "RUNNING" },
      { t3: "VERIFIED" },
    ],
    // t1's worker throws on every attempt (3 attempts). t1 ends
    // FAILED; cancelDownstream then marks every transitive
    // downstream (t2, t3, t4) as CANCELLED. Visually this is the
    // "cascading failure" — t1 dies, the whole DAG dies.
    failure: [
      { t1: "ASSIGNED" },
      { t1: "RUNNING" },
      { t1: "FAILED" },
      { t1: "ASSIGNED" },
      { t1: "RUNNING" },
      { t1: "FAILED" },
      { t1: "ASSIGNED" },
      { t1: "RUNNING" },
      { t1: "FAILED" },
      { t2: "CANCELLED" },
      { t3: "CANCELLED" },
      { t4: "CANCELLED" },
    ],
  };

  const stopPolling = useCallback(() => {
    pollingCancelledRef.current = true;
    const p = pollRef.current;
    if (!p) return;
    if (p.interval !== undefined) window.clearInterval(p.interval);
    if (p.timeout !== undefined) window.clearTimeout(p.timeout);
    pollRef.current = null;
  }, []);
  const resetViewToPlanned = useCallback(() => {
    onViewUpdate((prev) => {
      if (!prev) return prev;
      const fresh: Record<string, TaskState> = {};
      for (const n of prev.graph.nodes) fresh[n.taskId] = "PLANNED";
      return { ...prev, state: fresh };
    });
  }, [onViewUpdate]);
  const runAuto = useCallback(
    async (scenario: DemoScenario) => {
      if (isAutoRunning && !isPaused) return;
      if (!isPaused) {
        // Fresh start. Reset the polling cancellation flag first —
        // in StrictMode (dev) the auto-play fires after the cleanup
        // has already set `pollingCancelledRef.current = true`, so
        // without this the very first poll would short-circuit and
        // the demo would never start ticking on the UI.
        pollingCancelledRef.current = false;
        // Fresh start.
        setActiveScenario(scenario);
        setIsAutoRunning(true);
        setIsPaused(false);
        resetViewToPlanned();
        try {
          void client.playJob(jobId, { tickMs, scenario }).catch(() => {
            // Polling below will detect the failure.
          });
        } catch {
          stopPolling();
          setIsAutoRunning(false);
          return;
        }
      } else {
        // Resume from pause.
        pollingCancelledRef.current = false;
        setIsPaused(false);
      }
      // Recursive setTimeout (not setInterval) so we can use
      // exponential backoff on errors without losing the polling
      // cadence on success.
      const poll = async (delay: number) => {
        if (pollingCancelledRef.current) return;
        try {
          const v = await client.inspectJob(jobId);
          if (pollingCancelledRef.current) return;
          onViewUpdate(v);
          onApiChange?.(false);
          const done = v.graph.nodes.every(
            (n) =>
              v.state[n.taskId] === "VERIFIED" ||
              v.state[n.taskId] === "FAILED" ||
              v.state[n.taskId] === "CANCELLED"
          );
          if (done) {
            stopPolling();
            setIsAutoRunning(false);
            return;
          }
          pollRef.current = {
            timeout: window.setTimeout(() => void poll(400), 400),
          };
        } catch {
          // Don't give up. Notify the parent so the toast banner
          // shows, then back off exponentially so we don't hammer
          // a downed server.
          onApiChange?.(true);
          const nextDelay = Math.min(10_000, delay * 2);
          pollRef.current = {
            timeout: window.setTimeout(() => void poll(nextDelay), nextDelay),
          };
        }
      };
      void poll(400);
      const timeout = window.setTimeout(() => {
        stopPolling();
        setIsAutoRunning(false);
      }, 120_000);
      pollRef.current = { timeout };
    },
    [
      client,
      isAutoRunning,
      isPaused,
      jobId,
      onApiChange,
      onViewUpdate,
      resetViewToPlanned,
      stopPolling,
      tickMs,
    ]
  );
  const pauseAuto = useCallback(() => {
    setIsPaused(true);
    stopPolling();
  }, [stopPolling]);
  const runStep = useCallback(
    (scenario: DemoScenario) => {
      const seq = SCENARIO_SEQUENCES[scenario];
      setActiveScenario(scenario);
      setSequence(seq);
      setStepIdx(0);
      resetViewToPlanned();
      // Apply the first step so the user sees something happen
      // immediately on click.
      if (seq.length > 0) {
        const first = seq[0]!;
        onViewUpdate((prev) => {
          if (!prev) return prev;
          const merged: Record<string, TaskState> = {
            ...prev.state,
            ...first,
          } as Record<string, TaskState>;
          return { ...prev, state: merged };
        });
        setStepIdx(1);
      }
    },
    [onViewUpdate, resetViewToPlanned]
  );
  const stepOnce = useCallback(() => {
    if (stepIdx >= sequence.length) return;
    const step = sequence[stepIdx]!;
    onViewUpdate((prev) => {
      if (!prev) return prev;
      const merged: Record<string, TaskState> = {
        ...prev.state,
        ...step,
      } as Record<string, TaskState>;
      return { ...prev, state: merged };
    });
    setStepIdx((i) => i + 1);
  }, [stepIdx, sequence, onViewUpdate]);
  const stopAutoStep = useCallback(() => {
    if (autoStepTimerRef.current !== null) {
      window.clearTimeout(autoStepTimerRef.current);
      autoStepTimerRef.current = null;
    }
    setIsAutoStepping(false);
  }, []);
  const playRemaining = useCallback(() => {
    if (sequence.length === 0) return;
    if (stepIdxRef.current >= sequence.length) return;
    setIsAutoStepping(true);
    const tick = () => {
      const i = stepIdxRef.current;
      if (i >= sequence.length) {
        autoStepTimerRef.current = null;
        setIsAutoStepping(false);
        return;
      }
      const step = sequence[i]!;
      onViewUpdate((prev) => {
        if (!prev) return prev;
        const merged: Record<string, TaskState> = {
          ...prev.state,
          ...step,
        } as Record<string, TaskState>;
        return { ...prev, state: merged };
      });
      const next = i + 1;
      stepIdxRef.current = next;
      setStepIdx(next);
      if (next < sequence.length) {
        autoStepTimerRef.current = window.setTimeout(tick, tickMs);
      } else {
        autoStepTimerRef.current = null;
        setIsAutoStepping(false);
      }
    };
    tick();
  }, [sequence, tickMs, onViewUpdate]);
  const resetStep = useCallback(() => {
    setStepIdx(0);
    resetViewToPlanned();
  }, [resetViewToPlanned]);
  const autoFromStart = useCallback(() => {
    // Reset the ref synchronously so playRemaining's first tick
    // starts at index 0 even before React re-renders.
    stepIdxRef.current = 0;
    setStepIdx(0);
    resetViewToPlanned();
    // playRemaining() schedules ticks via setTimeout, so it's safe
    // to call after the synchronous state mutations above.
    playRemaining();
  }, [playRemaining, resetViewToPlanned]);

  // Click handler for the segmented control. Branches on mode.
  const onScenarioClick = useCallback(
    (scenario: DemoScenario) => {
      if (mode === "auto") void runAuto(scenario);
      else runStep(scenario);
    },
    [mode, runAuto, runStep]
  );

  // Clean up polling and auto-step on unmount.
  useEffect(() => {
    return () => {
      stopPolling();
      if (autoStepTimerRef.current !== null) {
        window.clearTimeout(autoStepTimerRef.current);
      }
    };
  }, [stopPolling]);

  // First-load auto-play. When the dashboard opens and every task is
  // still PLANNED (i.e. jobs.json either doesn't exist or the job was
  // seeded but never played), kick off the happy-path demo so the user
  // actually sees the DAG walk through its states. A returning visitor
  // (or anyone who already hit "Run demo") will land on a finalised
  // job and the effect is a no-op.
  //
  // Disabled when the URL has `?autoplay=0` so a developer inspecting
  // a PLANNED job isn't ambushed by a self-starting demo.
  //
  // Implementation note: the effect depends on `view` so it can read
  // the latest state, but the `autoPlayFiredRef` guard plus the lack of
  // a cleanup function together guarantee the timer fires exactly once
  // per DashboardLoaded lifetime — we never want a re-render to cancel
  // a scheduled playback.
  const autoPlayFiredRef = useRef(false);
  useEffect(() => {
    if (autoPlayFiredRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("autoplay") === "0") return;
    const allPlanned = view.graph.nodes.every(
      (n) => (view.state[n.taskId] ?? "PLANNED") === "PLANNED"
    );
    if (!allPlanned) return;
    autoPlayFiredRef.current = true;
    // 600ms lets the DAG paint first so the user sees the
    // PLANNED -> ASSIGNED transition before the slow-motion run
    // starts re-tickling the orchestrator.
    window.setTimeout(() => {
      void runAuto("happy");
    }, 600);
    // runAuto intentionally omitted from the dep array — we only
    // want this to fire once per mount with a PLANNED view, and
    // `view` changing afterwards should not cancel a scheduled
    // playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // When the mode changes, stop everything and reset.
  const switchMode = useCallback(
    (m: Mode) => {
      stopPolling();
      stopAutoStep();
      setIsAutoRunning(false);
      setIsPaused(false);
      setSequence([]);
      setStepIdx(0);
      setActiveScenario(null);
      setMode(m);
      resetViewToPlanned();
    },
    [resetViewToPlanned, stopAutoStep, stopPolling]
  );

  // Lifted state: which sidebar nav is currently selected. The
  // Dashboard is the only fully-rendered view today; clicking any
  // other nav updates the breadcrumb + shows a small "coming soon"
  // notice via the title bar. The breadcrumb reflects the current
  // nav so the navigation feels responsive even though other views
  // are placeholders.
  const [activeNav, setActiveNav] = useState<string>("dashboard");
  const [toast, setToast] = useState<string | null>(null);
  const handleNav = (id: string) => {
    setActiveNav(id);
    if (id !== "dashboard") {
      const label = [...workspaceItems, ...observabilityItems].find(
        (n) => n.id === id
      )?.label;
      if (label) {
        setToast(`“${label}” is coming soon — Dashboard view only for now.`);
        window.setTimeout(() => setToast(null), 2400);
      }
    }
  };
  const navLabel = [...workspaceItems, ...observabilityItems].find(
    (n) => n.id === activeNav
  )?.label;

  return (
    <div
      style={{
        minHeight: "100vh",
        color: theme.color.body,
        fontFamily: theme.font.sans,
        fontSize: fontSize.body,
        lineHeight: lineHeight.normal,
        position: "relative",
        zIndex: 1,
        display: "grid",
        gridTemplateColumns: "260px 1fr",
      }}
    >
      <Sidebar
        jobId={view.jobId}
        state={allDone ? "all-verified" : failed > 0 ? "has-failed" : "running"}
        jobCount={1}
        verifiedCount={verified}
        activeNav={activeNav}
        onNavChange={handleNav}
      />

      <div style={{ display: "flex", flexDirection: "column" }}>
        <TopNav
          jobId={view.jobId}
          chainId={chainId}
          wrongNetwork={!!wrongNetwork}
          navLabel={navLabel}
        />
        {toast && <Toast message={toast} />}

        <main
          style={{
            maxWidth: "1280px",
            margin: "0 auto",
            width: "100%",
            padding: `${space["2xl"]} ${space["3xl"]} ${space["7xl"]}`,
            display: "flex",
            flexDirection: "column",
            gap: space["3xl"],
          }}
        >
          <HeroHeader view={view} verified={verified} total={totalTasks} />

          {wrongNetwork && (
            <WrongNetworkBanner chainId={view.receipt!.chainId} />
          )}

          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: space.lg,
            }}
          >
            <StatCard
              label="Tasks verified"
              value={`${verified}/${totalTasks}`}
              accent="primary"
              hint={failed > 0 ? `${failed} failed` : "All tasks verified"}
              trend={{ direction: "up", delta: "100%" }}
              sparkline={[1, 1, 1, 1, 2, 2, 3]}
              delay={0}
            />
            <StatCard
              label="Total spent"
              value={`${totalSpentLabel} μUSD`}
              accent="info"
              hint="Settled on-chain"
              trend={{ direction: "flat", delta: "0.0%" }}
              sparkline={[0, 1, 1, 1, 2, 3, 3]}
              delay={1}
            />
            <StatCard
              label="Agents assigned"
              value={new Set(view.assignments.map((a) => a.agentId)).size}
              accent="violet"
              hint={`${view.assignments.length} assignments`}
              trend={{ direction: "up", delta: "+2" }}
              sparkline={[1, 1, 1, 1, 1, 1, 1]}
              delay={2}
            />
            <StatCard
              label="Chain"
              value={chainId}
              accent={wrongNetwork ? "danger" : "primary"}
              hint={wrongNetwork ? "Wrong network" : "Pharos Atlantic"}
              trend={{ direction: "up", delta: "12,847" }}
              sparkline={[12800, 12820, 12835, 12840, 12843, 12845, 12847]}
              delay={3}
            />
          </section>

          <GlassCard
            eyebrow="01 · Topology"
            title="Job DAG"
            accent="primary"
            delay={2}
            trailing={
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: space.md,
                }}
              >
                <div
                  role="group"
                  aria-label="Demo scenario"
                  style={{
                    display: "inline-flex",
                    borderRadius: theme.radius.md,
                    border: `1px solid ${
                      isPlaying
                        ? theme.color.warningBorder
                        : theme.color.glassBorder
                    }`,
                    background: isPlaying
                      ? theme.color.warningBg
                      : "transparent",
                    overflow: "hidden",
                  }}
                >
                  <ScenarioButton
                    label="Happy"
                    icon="✓"
                    accent="success"
                    isActive={activeScenario === "happy"}
                    isPlaying={isPlaying}
                    onClick={() => onScenarioClick("happy")}
                    isFirst
                  />
                  <ScenarioButton
                    label="Verifier"
                    icon="⚠"
                    accent="warning"
                    isActive={activeScenario === "verifier"}
                    isPlaying={isPlaying}
                    onClick={() => onScenarioClick("verifier")}
                  />
                  <ScenarioButton
                    label="Failure"
                    icon="✗"
                    accent="danger"
                    isActive={activeScenario === "failure"}
                    isPlaying={isPlaying}
                    onClick={() => onScenarioClick("failure")}
                    isLast
                  />
                </div>
                <SpeedSlider
                  value={tickMs}
                  onChange={setTickMs}
                  disabled={mode === "auto" && isAutoRunning}
                />
                <ModeToggle mode={mode} onChange={switchMode} />
                {mode === "auto" && isAutoRunning && (
                  <button
                    type="button"
                    onClick={
                      isPaused ? () => void runAuto(activeScenario!) : pauseAuto
                    }
                    className="pharos-glow-on-hover"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: space.xs,
                      padding: `${space.xs} ${space.md}`,
                      borderRadius: theme.radius.md,
                      border: `1px solid ${
                        isPaused
                          ? theme.color.successBorder
                          : theme.color.warningBorder
                      }`,
                      background: isPaused
                        ? theme.color.successBg
                        : theme.color.warningBg,
                      color: isPaused
                        ? theme.color.success
                        : theme.color.primary,
                      fontSize: fontSize.caption,
                      fontWeight: fontWeight.bold,
                      fontFamily: theme.font.numbers,
                      cursor: "pointer",
                    }}
                  >
                    {isPaused ? "▶ Resume" : "⏸ Pause"}
                  </button>
                )}
                {mode === "step" && sequence.length > 0 && (
                  <StepControls
                    stepIdx={stepIdx}
                    total={sequence.length}
                    onStep={stepOnce}
                    onReset={resetStep}
                    onAuto={autoFromStart}
                    onPlay={playRemaining}
                    onStop={stopAutoStep}
                    isComplete={stepIdx >= sequence.length}
                    isAutoStepping={isAutoStepping}
                  />
                )}
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: space.sm,
                    fontFamily: theme.font.numbers,
                    fontSize: fontSize.caption,
                    color: theme.color.muted,
                    fontWeight: fontWeight.bold,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      backgroundColor: theme.color.primary,
                      boxShadow: `0 0 8px ${theme.color.primary}`,
                    }}
                  />
                  {view.graph.criticalPath.length} critical
                </span>
              </div>
            }
          >
            <DagView view={view} recentChanges={recentChanges} />
            <PermissionsView view={view} />
          </GlassCard>

          <GlassCard
            eyebrow="02 · Activity"
            title="Recent activity"
            accent="info"
            delay={3}
            trailing={
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: space.sm,
                  fontFamily: theme.font.numbers,
                  fontSize: fontSize.caption,
                  color: theme.color.muted,
                  fontWeight: fontWeight.bold,
                }}
              >
                <ActivityIcon size={12} />
                {activity.length} events
              </span>
            }
          >
            <ActivityTimeline events={activity} />
          </GlassCard>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: space["2xl"],
            }}
          >
            <GlassCard
              eyebrow="03 · State"
              title="Tasks"
              delay={4}
              trailing={`${totalTasks} total`}
            >
              <StateList view={view} />
            </GlassCard>

            <GlassCard
              eyebrow="04 · Routing"
              title="Assignments"
              delay={5}
              trailing={
                view.assignments.length === 0 ? null : (
                  <span
                    style={{
                      fontFamily: theme.font.numbers,
                      fontSize: fontSize.caption,
                      color: theme.color.muted,
                      fontWeight: fontWeight.bold,
                    }}
                  >
                    {view.assignments.length} rows
                  </span>
                )
              }
            >
              <AssignmentsTable view={view} />
            </GlassCard>
          </div>

          <GlassCard
            eyebrow="06 · Trust"
            title="Partner data"
            accent="violet"
            delay={6}
          >
            <PartnerDataView verifications={view.verifications ?? []} />
          </GlassCard>

          <GlassCard
            eyebrow="05 · Settlement"
            title="On-chain receipt"
            accent="primary"
            delay={7}
          >
            <ReceiptView view={view} />
          </GlassCard>

          <footer
            style={{
              marginTop: space["2xl"],
              paddingTop: space["2xl"],
              borderTop: `1px solid ${theme.color.hairlineSubtle}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: space.lg,
              color: theme.color.muted,
              fontSize: fontSize.caption,
            }}
          >
            <span>
              Pharos Multi-Agent Job Router ·{" "}
              <span style={{ fontFamily: theme.font.numbers }}>v0.1.0</span>
            </span>
            <span>
              API:{" "}
              <code style={{ fontFamily: theme.font.mono }}>{baseUrl}</code>
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Sidebar — 260px glass rail. Pharos logo + lockup, ⌘K search, two
 * nav groups (Workspace / Observability), and a footer card showing
 * the current job state. Active row gets the yellow indicator bar
 * (Linear pattern).
 * ──────────────────────────────────────────────────────────────────────── */

function Sidebar({
  jobId,
  state,
  jobCount,
  verifiedCount,
  activeNav,
  onNavChange,
}: {
  jobId: string;
  state: "all-verified" | "has-failed" | "running";
  jobCount: number;
  verifiedCount: number;
  activeNav: string;
  onNavChange: (id: string) => void;
}) {
  const workspace = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: <DashboardIcon />,
      badge: null,
    },
    { id: "jobs", label: "Jobs", icon: <JobsIcon />, badge: jobCount },
    { id: "agents", label: "Agents", icon: <AgentIcon />, badge: null },
    { id: "receipts", label: "Receipts", icon: <ReceiptIcon />, badge: null },
  ];
  const observability = [
    {
      id: "verifications",
      label: "Verifications",
      icon: <ShieldIcon />,
      badge: verifiedCount,
    },
    {
      id: "activity",
      label: "Activity log",
      icon: <ActivityIcon />,
      badge: null,
    },
    { id: "settings", label: "Settings", icon: <SettingsIcon />, badge: null },
  ];

  return (
    <aside
      style={{
        backgroundColor: theme.color.glass1,
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
        borderRight: `1px solid ${theme.color.glassBorder}`,
        padding: `${space["2xl"]} ${space.lg}`,
        display: "flex",
        flexDirection: "column",
        gap: space["2xl"],
        position: "sticky",
        top: 0,
        height: "100vh",
      }}
    >
      <PharosLogotype size={32} />

      <button
        type="button"
        className="pharos-hover-lift"
        style={{
          display: "flex",
          alignItems: "center",
          gap: space.sm,
          padding: `${space.sm} ${space.md}`,
          backgroundColor: theme.color.glass2,
          border: `1px solid ${theme.color.glassBorder}`,
          borderRadius: theme.radius.md,
          color: theme.color.muted,
          fontFamily: theme.font.sans,
          fontSize: fontSize.bodySm,
          cursor: "pointer",
          width: "100%",
        }}
      >
        <SearchIcon size={14} />
        <span style={{ flex: 1, textAlign: "left" }}>Search</span>
        <kbd
          style={{
            fontFamily: theme.font.mono,
            fontSize: fontSize.micro,
            padding: `2px 6px`,
            backgroundColor: theme.color.surface3,
            border: `1px solid ${theme.color.hairline}`,
            borderRadius: theme.radius.xs,
            color: theme.color.mutedStrong,
            fontWeight: fontWeight.bold,
          }}
        >
          ⌘K
        </kbd>
      </button>

      <NavGroup
        label="Workspace"
        items={workspace}
        activeId={activeNav}
        onSelect={onNavChange}
      />
      <NavGroup
        label="Observability"
        items={observability}
        activeId={activeNav}
        onSelect={onNavChange}
      />

      <div
        className="pharos-hover-lift"
        style={{
          marginTop: "auto",
          padding: space.md,
          backgroundColor: theme.color.glass2,
          border: `1px solid ${theme.color.glassBorder}`,
          borderRadius: theme.radius.lg,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: space.sm,
            marginBottom: space.sm,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor:
                state === "all-verified"
                  ? theme.color.primary
                  : state === "has-failed"
                  ? theme.color.danger
                  : theme.color.warning,
              boxShadow:
                state === "all-verified"
                  ? `0 0 0 3px ${theme.color.warningBg}, 0 0 12px ${theme.color.primary}`
                  : "none",
              animation:
                state === "all-verified"
                  ? "pharos-pulse 2s ease-in-out infinite"
                  : undefined,
            }}
          />
          <span
            style={{
              fontSize: fontSize.eyebrow,
              fontWeight: fontWeight.bold,
              color: theme.color.muted,
              textTransform: "uppercase",
              letterSpacing: "0.16em",
            }}
          >
            Job
          </span>
        </div>
        <div
          style={{
            fontFamily: theme.font.mono,
            fontSize: fontSize.body,
            color: theme.color.ink,
            fontWeight: fontWeight.bold,
            marginBottom: space.xs,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={jobId}
        >
          {jobId}
        </div>
        <div
          style={{
            fontSize: fontSize.caption,
            color: theme.color.muted,
          }}
        >
          {state === "all-verified"
            ? `${verifiedCount} tasks verified`
            : state === "has-failed"
            ? "Some tasks failed"
            : "Execution in progress"}
        </div>
      </div>
    </aside>
  );
}

function NavGroup({
  label,
  items,
  activeId,
  onSelect,
}: {
  label: string;
  items: ReadonlyArray<{
    id: string;
    label: string;
    icon: React.ReactNode;
    badge: number | null | string;
  }>;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{
          fontSize: fontSize.micro,
          fontWeight: fontWeight.bold,
          color: theme.color.muted,
          textTransform: "uppercase",
          letterSpacing: "0.18em",
          padding: `0 ${space.md}`,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      {items.map((item) => (
        <NavItem
          key={item.id}
          id={item.id}
          label={item.label}
          icon={item.icon}
          active={activeId === item.id}
          badge={item.badge}
          onClick={() => onSelect(item.id)}
        />
      ))}
    </div>
  );
}

function NavItem({
  id: _id,
  label,
  icon,
  active,
  badge,
  onClick,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  badge: number | null | string;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setPressed(false);
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      aria-current={active ? "page" : undefined}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: space.md,
        padding: `${space.sm} ${space.md}`,
        borderRadius: theme.radius.md,
        backgroundColor: active
          ? theme.color.glass2
          : pressed
          ? "rgba(255, 255, 255, 0.05)"
          : hover
          ? "rgba(255, 255, 255, 0.03)"
          : "transparent",
        color: active ? theme.color.ink : theme.color.muted,
        fontSize: fontSize.body,
        fontWeight: active ? fontWeight.bold : fontWeight.medium,
        cursor: "pointer",
        border: "none",
        textAlign: "left",
        width: "100%",
        fontFamily: "inherit",
        transform: pressed ? "scale(0.98)" : "scale(1)",
        transition: `background-color ${theme.motion.fast} ${theme.motion.easeOut}, transform ${theme.motion.fast} ${theme.motion.easeOut}`,
      }}
    >
      {active && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: "-12px",
            top: "20%",
            bottom: "20%",
            width: "2px",
            borderRadius: theme.radius.pill,
            backgroundColor: theme.color.primary,
            boxShadow: `0 0 8px ${theme.color.primary}`,
          }}
        />
      )}
      <span style={{ display: "flex", flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge !== null && (
        <span
          style={{
            fontFamily: theme.font.numbers,
            fontSize: fontSize.micro,
            fontWeight: fontWeight.bold,
            color: active ? theme.color.primary : theme.color.muted,
            backgroundColor: active
              ? theme.color.warningBg
              : theme.color.glass2,
            padding: `2px 8px`,
            borderRadius: theme.radius.pill,
            minWidth: 22,
            textAlign: "center",
            border: `1px solid ${
              active ? theme.color.warningBorder : theme.color.glassBorder
            }`,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * TopNav — glass sticky bar.
 * ──────────────────────────────────────────────────────────────────────── */

function TopNav({
  jobId,
  chainId,
  wrongNetwork,
  navLabel,
}: {
  jobId: string;
  chainId: number;
  wrongNetwork: boolean;
  navLabel: string | undefined;
}) {
  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        backgroundColor: "rgba(5, 5, 7, 0.70)",
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
        borderBottom: `1px solid ${theme.color.glassBorder}`,
        padding: `0 ${space["3xl"]}`,
        height: 64,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: space.lg,
        fontFamily: theme.font.sans,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: space.md,
          fontSize: fontSize.body,
          color: theme.color.muted,
        }}
      >
        <span style={{ fontWeight: fontWeight.medium }}>Workspace</span>
        <ChevronRightIcon size={12} />
        <span
          style={{
            fontWeight: fontWeight.semibold,
            color:
              navLabel && navLabel !== "Dashboard"
                ? theme.color.ink
                : theme.color.muted,
          }}
        >
          {navLabel ?? "Dashboard"}
        </span>
        <ChevronRightIcon size={12} />
        <span
          style={{
            fontFamily: theme.font.mono,
            fontWeight: fontWeight.bold,
            color: theme.color.ink,
          }}
        >
          {jobId}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: space.md }}>
        <button
          type="button"
          aria-label="Refresh"
          className="pharos-hover-lift"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: theme.radius.md,
            background: "transparent",
            border: `1px solid ${theme.color.glassBorder}`,
            color: theme.color.muted,
            cursor: "pointer",
          }}
        >
          <RefreshIcon size={14} />
        </button>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: space.sm,
            padding: `${space.xs} ${space.md}`,
            borderRadius: theme.radius.md,
            border: `1px solid ${
              wrongNetwork
                ? theme.color.dangerBorder
                : theme.color.warningBorder
            }`,
            backgroundColor: wrongNetwork
              ? theme.color.dangerBg
              : theme.color.warningBg,
            color: wrongNetwork ? theme.color.danger : theme.color.primary,
            fontSize: fontSize.caption,
            fontWeight: fontWeight.bold,
            fontFamily: theme.font.numbers,
            letterSpacing: "0.02em",
            boxShadow: wrongNetwork
              ? "none"
              : `0 0 16px ${theme.color.warningBg}`,
          }}
        >
          <ChainIcon size={12} color="currentColor" />
          {wrongNetwork ? "Wrong network" : `Atlantic · ${chainId}`}
        </span>
      </div>
    </nav>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Hero — full-bleed glass panel with the job goal, a big verified
 * badge, and meta row.
 * ──────────────────────────────────────────────────────────────────────── */

function HeroHeader({
  view,
  verified,
  total,
}: {
  view: JobView;
  verified: number;
  total: number;
}) {
  const allDone = verified === total;
  return (
    <header
      style={{
        position: "relative",
        padding: space["4xl"],
        borderRadius: theme.radius.xl,
        backgroundColor: theme.color.glass1,
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
        border: `1px solid ${theme.color.glassBorder}`,
        boxShadow: theme.shadow.card,
        overflow: "hidden",
        animation: `pharos-fade-up ${theme.motion.slower} ${theme.motion.easeOut} both`,
      }}
    >
      {/* Decorative orb in the corner */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -100,
          right: -100,
          width: 400,
          height: 400,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(252, 213, 53, 0.20) 0%, transparent 60%)",
          filter: "blur(40px)",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: -50,
          left: "30%",
          width: 300,
          height: 300,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(91, 141, 239, 0.12) 0%, transparent 70%)",
          filter: "blur(50px)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: space["2xl"],
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: space.md,
          }}
        >
          <Eyebrow>
            Job · {view.spec.allowedCapabilities.length} capabilities
          </Eyebrow>
          {allDone && (
            <span
              className="pharos-glow-on-hover"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: `4px 12px`,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.color.primary,
                color: theme.color.onPrimary,
                fontSize: fontSize.eyebrow,
                fontWeight: fontWeight.bold,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                boxShadow: `0 0 0 1px ${theme.color.primary}, 0 0 24px rgba(252, 213, 53, 0.4)`,
                animation: `pharos-fade-in ${theme.motion.slow} ${theme.motion.easeOut} 200ms both`,
              }}
            >
              <CheckVerifiedIcon size={12} color="currentColor" />
              All tasks verified
            </span>
          )}
        </div>
        <h1
          style={{
            margin: 0,
            fontFamily: theme.font.sans,
            fontSize: fontSize.display2xl,
            fontWeight: fontWeight.bold,
            color: theme.color.ink,
            lineHeight: lineHeight.tight,
            letterSpacing: "-0.025em",
            maxWidth: "880px",
          }}
        >
          {view.spec.goal}
        </h1>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: space["3xl"],
            color: theme.color.muted,
          }}
        >
          <HeroMeta
            icon={<HashIcon size={14} />}
            label="Budget"
            value={`${formatMicrousd(view.spec.budgetMicrousd)} μUSD`}
          />
          <HeroMeta
            icon={<CheckIcon size={14} />}
            label="Tasks"
            value={String(total)}
          />
          <HeroMeta
            icon={<ShieldIcon size={14} />}
            label="Verifier"
            value={view.spec.verifier}
            mono
          />
          <HeroMeta
            icon={<ClockIcon size={14} />}
            label="Deadline"
            value={String(view.spec.deadline)}
            mono
          />
        </div>
      </div>
    </header>
  );
}

function HeroMeta({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: fontSize.eyebrow,
          fontWeight: fontWeight.bold,
          color: theme.color.muted,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
        }}
      >
        {icon}
        {label}
      </span>
      <span
        style={{
          fontSize: fontSize.bodyLg,
          color: theme.color.ink,
          fontFamily: mono ? theme.font.mono : theme.font.numbers,
          fontWeight: fontWeight.bold,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function WrongNetworkBanner({ chainId }: { chainId: number }) {
  return (
    <div
      className="pharos-hover-lift"
      style={{
        backgroundColor: theme.color.dangerBg,
        border: `1px solid ${theme.color.dangerBorder}`,
        borderRadius: theme.radius.md,
        padding: space.lg,
        color: theme.color.danger,
        display: "flex",
        alignItems: "center",
        gap: space.md,
        fontSize: fontSize.body,
      }}
    >
      <AlertTriangleIcon size={18} color="currentColor" />
      Receipt chain id {chainId} does not match expected {EXPECTED_CHAIN_ID}.
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * DAG view — animated SVG. Edges use stroke-dasharray for a "draw"
 * animation on mount; critical path glows with a yellow filter.
 * ──────────────────────────────────────────────────────────────────────── */

function ScenarioButton({
  label,
  icon,
  accent,
  isActive,
  isPlaying,
  onClick,
  isFirst,
  isLast,
}: {
  label: string;
  icon: string;
  accent: "success" | "warning" | "danger";
  isActive: boolean;
  isPlaying: boolean;
  onClick: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const accentBg =
    accent === "success"
      ? theme.color.successBg
      : accent === "warning"
      ? theme.color.warningBg
      : theme.color.dangerBg;
  const accentFg =
    accent === "success"
      ? theme.color.success
      : accent === "warning"
      ? theme.color.primary
      : theme.color.danger;
  const activeBg = isActive ? accentBg : "transparent";
  const activeFg = isActive ? accentFg : theme.color.muted;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPlaying}
      aria-pressed={isActive}
      aria-label={`Run ${label} scenario`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: space.xs,
        padding: `${space.xs} ${space.md}`,
        background: activeBg,
        border: "none",
        borderLeft: isFirst
          ? "none"
          : `1px solid ${
              isPlaying ? theme.color.warningBorder : theme.color.glassBorder
            }`,
        borderRight: isLast ? "none" : "none",
        color: isPlaying && !isActive ? theme.color.muted : activeFg,
        fontSize: fontSize.caption,
        fontWeight: fontWeight.bold,
        fontFamily: theme.font.numbers,
        letterSpacing: "0.02em",
        cursor: isPlaying && !isActive ? "not-allowed" : "pointer",
        opacity: isPlaying && !isActive ? 0.5 : 1,
        transition: `all ${theme.motion.fast} ${theme.motion.easeOut}`,
      }}
    >
      <span aria-hidden style={{ fontSize: "12px" }}>
        {icon}
      </span>
      {label}
    </button>
  );
}

/**
 * Speed slider — controls tickMs (per-transition delay) for the
 * server's slow-motion playJob. Range 100–2000ms.
 */
function SpeedSlider({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: space.sm,
        opacity: disabled ? 0.5 : 1,
        fontFamily: theme.font.numbers,
        fontSize: fontSize.caption,
        color: theme.color.muted,
      }}
    >
      <span style={{ fontWeight: fontWeight.bold }}>Speed</span>
      <input
        type="range"
        min={100}
        max={2000}
        step={100}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Transition speed in milliseconds"
        style={{
          width: 100,
          accentColor: theme.color.primary,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      />
      <span
        style={{
          minWidth: 60,
          color: theme.color.body,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}ms
      </span>
    </label>
  );
}

/**
 * Mode toggle — switches between server-side auto play and
 * client-side step-by-step mode.
 */
function ModeToggle({
  mode,
  onChange,
}: {
  mode: "auto" | "step";
  onChange: (m: "auto" | "step") => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Demo mode"
      style={{
        display: "inline-flex",
        borderRadius: theme.radius.md,
        border: `1px solid ${theme.color.glassBorder}`,
        overflow: "hidden",
      }}
    >
      {(["auto", "step"] as const).map((m, i) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={mode === m}
          onClick={() => onChange(m)}
          style={{
            padding: `${space.xs} ${space.md}`,
            background: mode === m ? theme.color.primary : "transparent",
            color: mode === m ? theme.color.onPrimary : theme.color.muted,
            border: "none",
            borderLeft:
              i === 0 ? "none" : `1px solid ${theme.color.glassBorder}`,
            fontSize: fontSize.caption,
            fontWeight: fontWeight.bold,
            fontFamily: theme.font.numbers,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            cursor: "pointer",
            transition: `all ${theme.motion.fast} ${theme.motion.easeOut}`,
          }}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

/**
 * Step controls — show the user where they are in the precomputed
 * sequence and let them advance one transition at a time.
 */
function StepControls({
  stepIdx,
  total,
  onStep,
  onReset,
  onAuto,
  onPlay,
  onStop,
  isComplete,
  isAutoStepping,
}: {
  stepIdx: number;
  total: number;
  onStep: () => void;
  onReset: () => void;
  onAuto: () => void;
  onPlay: () => void;
  onStop: () => void;
  isComplete: boolean;
  isAutoStepping: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Step controls"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: space.sm,
        fontFamily: theme.font.numbers,
        fontSize: fontSize.caption,
      }}
    >
      <button
        type="button"
        onClick={onStep}
        disabled={isComplete || isAutoStepping}
        className="pharos-glow-on-hover"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: space.xs,
          padding: `${space.xs} ${space.md}`,
          borderRadius: theme.radius.md,
          border: `1px solid ${
            isComplete || isAutoStepping
              ? theme.color.glassBorder
              : theme.color.successBorder
          }`,
          background:
            isComplete || isAutoStepping
              ? "transparent"
              : theme.color.successBg,
          color:
            isComplete || isAutoStepping
              ? theme.color.muted
              : theme.color.success,
          fontSize: fontSize.caption,
          fontWeight: fontWeight.bold,
          fontFamily: theme.font.numbers,
          cursor: isComplete || isAutoStepping ? "not-allowed" : "pointer",
          opacity: isComplete || isAutoStepping ? 0.5 : 1,
        }}
      >
        ⏵ Step
      </button>
      <button
        type="button"
        onClick={onAuto}
        disabled={isComplete || isAutoStepping}
        title="Reset and auto-play all steps"
        className="pharos-glow-on-hover"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: space.xs,
          padding: `${space.xs} ${space.md}`,
          borderRadius: theme.radius.md,
          border: `1px solid ${
            isComplete || isAutoStepping
              ? theme.color.glassBorder
              : theme.color.warningBorder
          }`,
          background:
            isComplete || isAutoStepping
              ? "transparent"
              : theme.color.warningBg,
          color:
            isComplete || isAutoStepping
              ? theme.color.muted
              : theme.color.primary,
          fontSize: fontSize.caption,
          fontWeight: fontWeight.bold,
          fontFamily: theme.font.numbers,
          cursor: isComplete || isAutoStepping ? "not-allowed" : "pointer",
          opacity: isComplete || isAutoStepping ? 0.5 : 1,
        }}
      >
        ▶ Auto
      </button>
      {isAutoStepping ? (
        <button
          type="button"
          onClick={onStop}
          className="pharos-glow-on-hover"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: space.xs,
            padding: `${space.xs} ${space.md}`,
            borderRadius: theme.radius.md,
            border: `1px solid ${theme.color.warningBorder}`,
            background: theme.color.warningBg,
            color: theme.color.primary,
            fontSize: fontSize.caption,
            fontWeight: fontWeight.bold,
            fontFamily: theme.font.numbers,
            cursor: "pointer",
          }}
        >
          ⏸ Stop
        </button>
      ) : (
        <button
          type="button"
          onClick={onPlay}
          disabled={isComplete}
          title="Auto-play remaining steps"
          className="pharos-glow-on-hover"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: space.xs,
            padding: `${space.xs} ${space.md}`,
            borderRadius: theme.radius.md,
            border: `1px solid ${
              isComplete ? theme.color.glassBorder : theme.color.infoBorder
            }`,
            background: isComplete ? "transparent" : theme.color.infoBg,
            color: isComplete ? theme.color.muted : theme.color.info,
            fontSize: fontSize.caption,
            fontWeight: fontWeight.bold,
            fontFamily: theme.font.numbers,
            cursor: isComplete ? "not-allowed" : "pointer",
            opacity: isComplete ? 0.5 : 1,
          }}
        >
          ▶ Play
        </button>
      )}
      <button
        type="button"
        onClick={onReset}
        title="Reset to start"
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: `${space.xs} ${space.md}`,
          borderRadius: theme.radius.md,
          border: `1px solid ${theme.color.glassBorder}`,
          background: "transparent",
          color: theme.color.muted,
          fontFamily: theme.font.numbers,
          cursor: "pointer",
        }}
      >
        ↺ Reset
      </button>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          minWidth: 80,
        }}
      >
        <div
          style={{
            height: 4,
            borderRadius: 2,
            background: theme.color.glassBorder,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${total === 0 ? 0 : (stepIdx / total) * 100}%`,
              background: isComplete
                ? theme.color.success
                : theme.color.primary,
              transition: `width ${theme.motion.normal} ${theme.motion.easeOut}`,
            }}
          />
        </div>
        <span
          style={{
            color: theme.color.muted,
            fontSize: fontSize.micro,
            fontFamily: theme.font.numbers,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          Step {Math.min(stepIdx, total)} / {total}
        </span>
      </div>
    </div>
  );
}

/**
 * Compact bigint → "100k" / "1.5M" formatter used by DAG edge
 * labels and node tooltips. Keeps the labels short so they don't
 * dominate the diagram.
 */
function formatBudget(n: bigint): string {
  const num = Number(n);
  if (num >= 1_000_000) {
    const m = num / 1_000_000;
    return `${Number.isInteger(m) ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (num >= 1_000) return `${Math.round(num / 1_000)}k`;
  return num.toString();
}

function DagView({
  view,
  recentChanges,
}: {
  view: JobView;
  recentChanges?: Map<string, number>;
}) {
  const nodes = view.graph.nodes;
  // Refs + hover state for the custom HTML tooltip.
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{
    taskId: string;
    capability: string;
    budgetMicrousd: bigint;
    verifierKind: string;
    dependsOn: string[];
    x: number;
    y: number;
  } | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  // Trigger the fade-in after the tooltip element has mounted so
  // the CSS transition can play.
  useEffect(() => {
    if (tooltip) {
      const id = requestAnimationFrame(() => setTooltipVisible(true));
      return () => cancelAnimationFrame(id);
    } else {
      setTooltipVisible(false);
    }
  }, [tooltip]);
  if (nodes.length === 0) {
    return (
      <div
        style={{
          padding: space["3xl"],
          textAlign: "center",
          color: theme.color.muted,
          fontSize: fontSize.body,
        }}
      >
        No tasks in this job.
      </div>
    );
  }
  const depth = new Map<string, number>();
  const visit = (id: string, stack: Set<string>): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (stack.has(id)) return 0;
    stack.add(id);
    const node = nodes.find((n) => n.taskId === id);
    const deps = node?.dependsOn ?? [];
    const d =
      deps.length === 0 ? 0 : Math.max(...deps.map((x) => visit(x, stack))) + 1;
    stack.delete(id);
    depth.set(id, d);
    return d;
  };
  nodes.forEach((n) => visit(n.taskId, new Set()));

  const cols = (Math.max(...Array.from(depth.values())) || 0) + 1;
  const colW = 200;
  const rowH = 80;
  const padX = 32;
  const padY = 32;
  const width = padX * 2 + cols * colW;

  const nodePos = new Map<string, { x: number; y: number }>();
  const buckets: Record<number, number> = {};
  nodes.forEach((n) => {
    const d = depth.get(n.taskId) ?? 0;
    const row = buckets[d] ?? 0;
    buckets[d] = row + 1;
    nodePos.set(n.taskId, {
      x: padX + d * colW + colW / 2,
      y: padY + row * rowH + 24,
    });
  });
  // Height must follow the deepest *row*, not the total node count —
  // otherwise a 3-node linear chain wastes 2 empty rows of dark space.
  const maxRows = Math.max(1, ...Object.values(buckets));
  const height = padY * 2 + maxRows * rowH;

  const critical = new Set(view.graph.criticalPath);
  const stateFor = (id: string): TaskState =>
    (view.state[id] as TaskState | undefined) ?? "PLANNED";

  // Convert a viewBox-space (svgX, svgY) point to container-relative
  // pixel coords so the HTML tooltip can be positioned above the
  // node the cursor is over.
  const svgToContainer = (
    svgX: number,
    svgY: number
  ): { x: number; y: number } | null => {
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!svg || !container) return null;
    const svgRect = svg.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const scaleX = svgRect.width / width;
    const scaleY = svgRect.height / height;
    return {
      x: svgRect.left - containerRect.left + svgX * scaleX,
      y: svgRect.top - containerRect.top + svgY * scaleY,
    };
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        border: `1px solid ${theme.color.glassBorder}`,
        borderRadius: theme.radius.lg,
        // Subtle "graph paper" backdrop — fills the visual space with
        // something interesting instead of a flat dark slab, while
        // staying low-contrast enough not to compete with the nodes.
        backgroundColor: theme.color.glass2,
        backgroundImage: `radial-gradient(circle, ${theme.color.hairline} 1px, transparent 1px)`,
        backgroundSize: "20px 20px",
        backgroundPosition: "0 0",
        overflow: "hidden",
        marginBottom: space["2xl"],
      }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{ display: "block" }}
        role="img"
        aria-label="Job DAG visualization"
      >
        <defs>
          {/* Bigger, more visible arrowheads. The "active" variant is
              a touch larger still so the running edge reads as the
              dominant direction. */}
          <marker
            id="pharos-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.color.muted} />
          </marker>
          <marker
            id="pharos-arrow-active"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="9"
            markerHeight="9"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.color.primary} />
          </marker>
          <marker
            id="pharos-arrow-completed"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.color.success} />
          </marker>
          <marker
            id="pharos-arrow-failed"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.color.danger} />
          </marker>
          <marker
            id="pharos-arrow-cancelled"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.color.faint} />
          </marker>
          <filter id="pharos-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {nodes.flatMap((n) =>
          (n.dependsOn ?? []).map((dep) => {
            const from = nodePos.get(dep);
            const to = nodePos.get(n.taskId);
            if (!from || !to) return null;
            // Edge styling is driven by the *target* node's state:
            // the arrow head always points at the consumer, so its
            // colour tells the user what's about to happen.
            const tgt = stateFor(n.taskId);
            const isCritical = critical.has(dep) && critical.has(n.taskId);
            const isActive =
              tgt === "ASSIGNED" || tgt === "RUNNING" || tgt === "SUBMITTED";
            const isCompleted = tgt === "VERIFIED";
            const isFailed = tgt === "FAILED";
            const isCancelled = tgt === "CANCELLED";
            const x1 = from.x + 70;
            const y1 = from.y;
            const x2 = to.x - 70;
            const y2 = to.y;
            const cx = (x1 + x2) / 2;
            const pathLength = 200;
            const stroke = isActive
              ? theme.color.primary
              : isCompleted
              ? theme.color.success
              : isFailed
              ? theme.color.danger
              : isCancelled
              ? theme.color.faint
              : isCritical
              ? theme.color.primary
              : theme.color.hairlineStrong;
            const markerId = isActive
              ? "pharos-arrow-active"
              : isCompleted
              ? "pharos-arrow-completed"
              : isFailed
              ? "pharos-arrow-failed"
              : isCancelled
              ? "pharos-arrow-cancelled"
              : "pharos-arrow";
            return (
              <path
                key={`${dep}->${n.taskId}`}
                d={`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={stroke}
                strokeWidth={isActive ? 2.5 : 2}
                strokeDasharray={
                  isActive || isCompleted || isFailed || isCancelled
                    ? undefined
                    : `${pathLength} ${pathLength}`
                }
                markerEnd={`url(#${markerId})`}
                opacity={
                  isCancelled ? 0.55 : isActive ? 1 : isCompleted ? 0.95 : 0.7
                }
                filter={isActive ? "url(#pharos-glow)" : undefined}
                style={{
                  animation: isActive
                    ? "pharos-dash 1.2s linear infinite"
                    : undefined,
                  strokeDashoffset: isActive ? 0 : undefined,
                  transition:
                    "stroke 240ms cubic-bezier(0.16, 1, 0.3, 1), opacity 240ms cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              />
            );
          })
        )}

        {/* Edge labels: after a task VERIFIEDs, show how much it
            actually cost relative to its reserved budget
            ("1/200k μ" means 1 μUSD spent out of a 200k μUSD budget);
            otherwise show just the budget. paint-order: stroke
            fill keeps the text readable on top of the curve. */}
        {nodes.flatMap((n) =>
          (n.dependsOn ?? []).map((dep) => {
            const from = nodePos.get(dep);
            const to = nodePos.get(n.taskId);
            if (!from || !to) return null;
            const fromNode = nodes.find((nd) => nd.taskId === dep);
            if (!fromNode) return null;
            const depState = stateFor(dep);
            const sourceResult: TaskResult | undefined = view.results.find(
              (r) => r.taskId === dep
            );
            const spentBig =
              sourceResult &&
              sourceResult.output &&
              typeof sourceResult.output === "object" &&
              "costMicrousd" in (sourceResult.output as Record<string, unknown>)
                ? BigInt(
                    String(
                      (sourceResult.output as { costMicrousd: bigint | number })
                        .costMicrousd
                    )
                  )
                : null;
            const budgetLabel = formatBudget(fromNode.budgetMicrousd);
            const labelText =
              depState === "VERIFIED" && spentBig !== null
                ? `${formatBudget(spentBig)}/${budgetLabel} μ`
                : `${budgetLabel} μ`;
            const x1 = from.x + 70;
            const y1 = from.y;
            const x2 = to.x - 70;
            const y2 = to.y;
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            const isActive =
              depState === "ASSIGNED" ||
              depState === "RUNNING" ||
              depState === "SUBMITTED";
            return (
              <text
                key={`label-${dep}-${n.taskId}`}
                x={midX}
                y={midY - 4}
                fontSize={9}
                fontFamily={theme.font.numbers}
                fontWeight={fontWeight.semibold}
                fill={
                  isActive
                    ? theme.color.primary
                    : depState === "VERIFIED"
                    ? theme.color.success
                    : theme.color.muted
                }
                textAnchor="middle"
                style={{
                  paintOrder: "stroke fill",
                  stroke: theme.color.canvas,
                  strokeWidth: 3,
                  strokeLinejoin: "round",
                  pointerEvents: "none",
                  fontVariantNumeric: "tabular-nums",
                  opacity: isActive ? 1 : 0.85,
                  transition: `fill 240ms ${theme.motion.easeOut}, opacity 240ms ${theme.motion.easeOut}`,
                }}
              >
                {labelText}
              </text>
            );
          })
        )}

        {nodes.map((n) => {
          const pos = nodePos.get(n.taskId)!;
          const s = stateStyle(stateFor(n.taskId));
          const isCritical = critical.has(n.taskId);
          // Outer <g> owns the SVG positioning (transform attribute).
          // Inner <g> owns the hover effect (CSS transform). Keeping
          // them on separate elements stops the hover from clobbering
          // the node's position, which used to make the boxes jump to
          // (0, -2) on hover.
          return (
            <g
              key={n.taskId}
              transform={`translate(${pos.x - 70}, ${pos.y - 22})`}
              onMouseEnter={() => {
                const screen = svgToContainer(pos.x, pos.y - 22);
                if (screen) {
                  setTooltip({
                    taskId: n.taskId,
                    capability: n.capability,
                    budgetMicrousd: n.budgetMicrousd,
                    verifierKind: n.verifierKind,
                    dependsOn: [...(n.dependsOn ?? [])],
                    x: screen.x,
                    y: screen.y,
                  });
                }
              }}
              onMouseLeave={() => setTooltip(null)}
            >
              {recentChanges?.has(n.taskId) && (
                <rect
                  key={`pulse-${n.taskId}-${recentChanges.get(n.taskId)}`}
                  x={-8}
                  y={-8}
                  width={156}
                  height={60}
                  rx={14}
                  fill="none"
                  stroke={theme.color.primary}
                  strokeWidth={2}
                  style={{
                    transformBox: "fill-box",
                    transformOrigin: "center",
                    pointerEvents: "none",
                    animation:
                      "pharos-pulse-ring 900ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
                  }}
                />
              )}
              <g className="pharos-hover-lift" style={{ cursor: "pointer" }}>
                {/* (Native SVG <title> removed — the React HTML
                    tooltip below renders richer content.) */}
                {isCritical && (
                  <rect
                    x={-3}
                    y={-3}
                    width={146}
                    height={50}
                    rx={9}
                    fill="none"
                    stroke={theme.color.primary}
                    strokeOpacity={0.5}
                    strokeDasharray="3 3"
                  />
                )}
                <rect
                  width={140}
                  height={44}
                  rx={8}
                  fill={theme.color.surface3}
                  stroke={
                    isCritical
                      ? theme.color.primary
                      : theme.color.hairlineStrong
                  }
                  strokeWidth={1}
                />
                {/* Pulsing dot at the centre */}
                <circle
                  cx={14}
                  cy={22}
                  r={4}
                  fill={s.fg}
                  style={{
                    filter: `drop-shadow(0 0 4px ${s.fg})`,
                  }}
                />
                <text
                  x={26}
                  y={19}
                  fontSize={12}
                  fontWeight={700}
                  fontFamily={theme.font.sans}
                  fill={theme.color.ink}
                >
                  {n.taskId}
                </text>
                <text
                  x={26}
                  y={33}
                  fontSize={10.5}
                  fontFamily={theme.font.sans}
                  fill={theme.color.muted}
                >
                  {n.capability}
                </text>
                <text
                  x={126}
                  y={28}
                  fontSize={9}
                  fontWeight={700}
                  fontFamily={theme.font.mono}
                  fill={s.fg}
                  textAnchor="end"
                >
                  {s.label}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
      {/* Custom HTML tooltip — rendered as a sibling of the SVG so it
          can use real HTML/CSS (no SVG <foreignObject> limitations).
          pointer-events: none lets the cursor "pass through" the
          tooltip to the node beneath, so hover doesn't flicker. */}
      {tooltip && (
        <NodeTooltip
          taskId={tooltip.taskId}
          capability={tooltip.capability}
          budgetMicrousd={tooltip.budgetMicrousd}
          verifierKind={tooltip.verifierKind}
          dependsOn={tooltip.dependsOn}
          currentState={stateFor(tooltip.taskId)}
          result={view.results.find((r) => r.taskId === tooltip.taskId)}
          x={tooltip.x}
          y={tooltip.y}
          visible={tooltipVisible}
        />
      )}
    </div>
  );
}

/**
 * Glass-card tooltip with taskId, capability badge, budget, spent,
 * verifier, current state, and deps. Positioned absolutely above the
 * node the cursor is over.
 */
function NodeTooltip({
  taskId,
  capability,
  budgetMicrousd,
  verifierKind,
  dependsOn,
  currentState,
  result,
  x,
  y,
  visible,
}: {
  taskId: string;
  capability: string;
  budgetMicrousd: bigint;
  verifierKind: string;
  dependsOn: string[];
  currentState: TaskState;
  result: TaskResult | undefined;
  x: number;
  y: number;
  visible: boolean;
}) {
  const spentBig =
    result &&
    result.output &&
    typeof result.output === "object" &&
    "costMicrousd" in (result.output as Record<string, unknown>)
      ? BigInt(
          String(
            (result.output as { costMicrousd: bigint | number }).costMicrousd
          )
        )
      : null;
  const s = stateStyle(currentState);
  return (
    <div
      role="tooltip"
      aria-live="polite"
      style={{
        position: "absolute",
        left: x,
        top: y,
        pointerEvents: "none",
        background: "rgba(15, 16, 20, 0.92)",
        WebkitBackdropFilter: "blur(20px)",
        backdropFilter: "blur(20px)",
        border: `1px solid ${theme.color.primary}55`,
        borderRadius: theme.radius.md,
        padding: `${space.sm} ${space.md}`,
        minWidth: 220,
        boxShadow:
          "0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.04) inset",
        fontFamily: theme.font.sans,
        fontSize: fontSize.bodySm,
        color: theme.color.body,
        opacity: visible ? 1 : 0,
        transform: `translate(-50%, ${
          visible ? "calc(-100% - 14px)" : "calc(-100% - 4px)"
        })`,
        transition: `opacity 160ms ${theme.motion.easeOut}, transform 160ms ${theme.motion.easeOut}`,
        zIndex: 100,
        whiteSpace: "nowrap",
      }}
    >
      {/* Header: taskId + capability badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: space.sm,
          paddingBottom: space.xs,
          marginBottom: space.xs,
          borderBottom: `1px solid ${theme.color.hairline}`,
        }}
      >
        <span
          style={{
            fontFamily: theme.font.mono,
            fontWeight: fontWeight.bold,
            fontSize: fontSize.body,
            color: theme.color.primary,
            lineHeight: 1,
          }}
        >
          {taskId}
        </span>
        <span
          style={{
            fontSize: fontSize.micro,
            color: theme.color.muted,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            padding: `2px 6px`,
            borderRadius: theme.radius.xs,
            background: theme.color.surface2,
          }}
        >
          {capability}
        </span>
      </div>
      <TooltipRow
        label="Spent"
        value={
          spentBig !== null
            ? `${formatBudget(spentBig)} / ${formatBudget(budgetMicrousd)} μ`
            : `— / ${formatBudget(budgetMicrousd)} μ`
        }
        accent={spentBig !== null ? s.fg : undefined}
      />
      <TooltipRow label="Verifier" value={verifierKind} />
      <TooltipRow label="State" value={s.label} accent={s.fg} />
      {dependsOn.length > 0 && (
        <TooltipRow label="Deps" value={dependsOn.join(", ")} />
      )}
    </div>
  );
}

function TooltipRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: space.md,
        padding: "2px 0",
      }}
    >
      <span
        style={{
          color: theme.color.muted,
          fontSize: fontSize.micro,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: fontWeight.semibold,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: theme.font.mono,
          fontSize: fontSize.bodySm,
          color: accent ?? theme.color.ink,
          fontWeight: fontWeight.medium,
        }}
      >
        {value}
      </span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Permissions.
 * ──────────────────────────────────────────────────────────────────────── */

function PermissionsView({ view }: { view: JobView }) {
  return (
    <div>
      <h3
        style={{
          margin: `0 0 ${space.lg}`,
          fontSize: fontSize.caption,
          fontWeight: fontWeight.bold,
          color: theme.color.muted,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
        }}
      >
        Permissions
      </h3>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "grid",
          gap: space.sm,
        }}
      >
        {view.graph.nodes.map((n) => (
          <li
            key={n.taskId}
            className="pharos-hover-lift"
            style={{
              display: "grid",
              gridTemplateColumns: "100px 1fr auto",
              gap: space.lg,
              alignItems: "center",
              padding: space.md,
              border: `1px solid ${theme.color.glassBorder}`,
              borderRadius: theme.radius.md,
              backgroundColor: theme.color.glass2,
            }}
          >
            <code
              style={{
                fontFamily: theme.font.mono,
                fontSize: fontSize.code,
                color: theme.color.primary,
                fontWeight: fontWeight.bold,
              }}
            >
              {n.taskId}
            </code>
            <span
              style={{
                fontSize: fontSize.bodySm,
                color: theme.color.muted,
                display: "flex",
                flexWrap: "wrap",
                gap: space.md,
              }}
            >
              <span>
                cap{" "}
                <span
                  style={{
                    color: theme.color.ink,
                    fontWeight: fontWeight.bold,
                  }}
                >
                  {n.capability}
                </span>
              </span>
              <span>
                budget{" "}
                <span
                  style={{
                    fontFamily: theme.font.numbers,
                    color: theme.color.ink,
                    fontWeight: fontWeight.bold,
                  }}
                >
                  {formatMicrousd(n.budgetMicrousd)}
                </span>
              </span>
              <span>
                verifier{" "}
                <span style={{ color: theme.color.ink }}>{n.verifierKind}</span>
              </span>
            </span>
            {n.approvalRequired ? (
              <StatusPill state="READY" />
            ) : (
              <span
                style={{
                  fontSize: fontSize.micro,
                  color: theme.color.muted,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  fontWeight: fontWeight.bold,
                }}
              >
                no approval
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * State list.
 * ──────────────────────────────────────────────────────────────────────── */

function StateList({ view }: { view: JobView }) {
  if (view.graph.nodes.length === 0) {
    return (
      <p
        style={{
          margin: 0,
          color: theme.color.muted,
          fontSize: fontSize.body,
        }}
      >
        No tasks in this job.
      </p>
    );
  }
  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: space.md,
      }}
    >
      {view.graph.nodes.map((n) => {
        const s = stateStyle(
          (view.state[n.taskId] as TaskState | undefined) ?? "PLANNED"
        );
        return (
          <li
            key={n.taskId}
            className="pharos-hover-lift"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: space.md,
              padding: space.md,
              backgroundColor: theme.color.glass2,
              border: `1px solid ${theme.color.glassBorder}`,
              borderRadius: theme.radius.md,
            }}
          >
            <span
              style={{ display: "flex", alignItems: "center", gap: space.sm }}
            >
              <StateDot
                state={
                  (view.state[n.taskId] as TaskState | undefined) ?? "PLANNED"
                }
              />
              <code
                style={{
                  fontFamily: theme.font.mono,
                  fontSize: fontSize.code,
                  color: theme.color.ink,
                  fontWeight: fontWeight.bold,
                }}
              >
                {n.taskId}
              </code>
            </span>
            <span
              style={{
                fontSize: fontSize.caption,
                color: s.fg,
                fontWeight: fontWeight.bold,
                letterSpacing: "0.02em",
              }}
            >
              {s.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Assignments table.
 * ──────────────────────────────────────────────────────────────────────── */

function AssignmentsTable({ view }: { view: JobView }) {
  if (view.assignments.length === 0) {
    return (
      <p
        style={{ margin: 0, color: theme.color.muted, fontSize: fontSize.body }}
      >
        No assignments yet.
      </p>
    );
  }
  return (
    <div
      style={{
        border: `1px solid ${theme.color.glassBorder}`,
        borderRadius: theme.radius.lg,
        overflow: "hidden",
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: theme.font.sans,
          fontSize: fontSize.body,
        }}
      >
        <thead>
          <tr style={{ backgroundColor: theme.color.glass2 }}>
            {["Task", "Agent", "Score", "Skill"].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  padding: `${space.md} ${space.lg}`,
                  fontSize: fontSize.eyebrow,
                  fontWeight: fontWeight.bold,
                  color: theme.color.muted,
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  borderBottom: `1px solid ${theme.color.glassBorder}`,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.assignments.map((a, i) => {
            const scoreColor =
              a.score >= 90
                ? theme.color.primary
                : a.score >= 70
                ? theme.color.info
                : theme.color.warning;
            return (
              <tr
                key={a.taskId + a.agentId}
                className="pharos-hover-lift"
                style={{
                  backgroundColor:
                    i % 2 === 0 ? "transparent" : theme.color.glass2,
                }}
              >
                <td
                  style={{
                    padding: `${space.md} ${space.lg}`,
                    borderBottom: `1px solid ${theme.color.hairlineSubtle}`,
                  }}
                >
                  <code
                    style={{
                      fontFamily: theme.font.mono,
                      fontSize: fontSize.code,
                      color: theme.color.ink,
                      fontWeight: fontWeight.bold,
                    }}
                  >
                    {a.taskId}
                  </code>
                </td>
                <td
                  style={{
                    padding: `${space.md} ${space.lg}`,
                    borderBottom: `1px solid ${theme.color.hairlineSubtle}`,
                    color: theme.color.body,
                  }}
                >
                  {a.agentId}
                </td>
                <td
                  style={{
                    padding: `${space.md} ${space.lg}`,
                    borderBottom: `1px solid ${theme.color.hairlineSubtle}`,
                    fontFamily: theme.font.numbers,
                    fontSize: fontSize.code,
                    color: scoreColor,
                    fontWeight: fontWeight.bold,
                  }}
                >
                  {a.score.toFixed(2)}
                </td>
                <td
                  style={{
                    padding: `${space.md} ${space.lg}`,
                    borderBottom: `1px solid ${theme.color.hairlineSubtle}`,
                  }}
                >
                  <code
                    title={a.skillReleaseHash}
                    style={{
                      fontFamily: theme.font.mono,
                      fontSize: fontSize.code,
                      color: theme.color.body,
                    }}
                  >
                    {a.skillReleaseHash.slice(0, 10)}…
                    {a.skillReleaseHash.slice(-4)}
                  </code>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Activity timeline.
 * ──────────────────────────────────────────────────────────────────────── */

interface ActivityEvent {
  readonly id: string;
  readonly kind:
    | "created"
    | "approved"
    | "assigned"
    | "submitted"
    | "verified"
    | "settled";
  readonly taskId: string | null;
  readonly title: string;
  readonly detail: string;
  readonly at: number;
  readonly iconColor: string;
  readonly iconBg: string;
}

function buildActivity(view: JobView): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const now = Math.floor(Date.now() / 1000);
  const completed = view.receipt?.completedAt ?? now;
  const span = 60;

  events.push({
    id: "created",
    kind: "created",
    taskId: null,
    title: "Job created",
    detail: `goal: ${view.spec.goal.slice(0, 40)}…`,
    at: completed - span,
    iconColor: theme.color.info,
    iconBg: theme.color.infoBg,
  });
  events.push({
    id: "approved",
    kind: "approved",
    taskId: null,
    title: "Approved by operator",
    detail: "human approval recorded",
    at: completed - span * 0.85,
    iconColor: theme.color.warning,
    iconBg: theme.color.warningBg,
  });
  for (const a of view.assignments) {
    events.push({
      id: `assigned-${a.taskId}`,
      kind: "assigned",
      taskId: a.taskId,
      title: `Task ${a.taskId} assigned`,
      detail: `→ ${a.agentId} (score ${a.score.toFixed(2)})`,
      at: completed - span * 0.6,
      iconColor: theme.color.violet,
      iconBg: theme.color.violetBg,
    });
  }
  for (const r of view.results) {
    const cost = (r.output as { costMicrousd?: number | bigint } | undefined)
      ?.costMicrousd;
    events.push({
      id: `submitted-${r.taskId}`,
      kind: "submitted",
      taskId: r.taskId,
      title: `Task ${r.taskId} submitted`,
      detail: `cost ${cost ?? "?"} microusd`,
      at: completed - span * 0.3,
      iconColor: theme.color.info,
      iconBg: theme.color.infoBg,
    });
  }
  for (const v of view.verifications) {
    const color =
      v.verdict === "pass" ? theme.color.primary : theme.color.danger;
    const bg =
      v.verdict === "pass" ? theme.color.warningBg : theme.color.dangerBg;
    events.push({
      id: `verified-${v.taskId}-${v.verifierId}`,
      kind: "verified",
      taskId: v.taskId,
      title: `Verification ${v.verdict === "pass" ? "passed" : "failed"}`,
      detail: `${v.verifierId} on ${v.taskId} — ${v.reason || "—"}`,
      at: v.verifiedAt,
      iconColor: color,
      iconBg: bg,
    });
  }
  if (view.receipt) {
    events.push({
      id: "settled",
      kind: "settled",
      taskId: null,
      title: "Receipt settled on-chain",
      detail: `tx ${view.receipt.receiptTxHash.slice(0, 10)}…`,
      at: view.receipt.completedAt,
      iconColor: theme.color.primary,
      iconBg: theme.color.warningBg,
    });
  }
  events.sort((a, b) => a.at - b.at);
  return events;
}

function ActivityTimeline({
  events,
}: {
  events: ReadonlyArray<ActivityEvent>;
}) {
  if (events.length === 0) {
    return (
      <p
        style={{ margin: 0, color: theme.color.muted, fontSize: fontSize.body }}
      >
        No activity yet.
      </p>
    );
  }
  const now = Math.floor(Date.now() / 1000);
  return (
    <ol
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: 0,
      }}
    >
      {events.map((e, i) => {
        const isLast = i === events.length - 1;
        return (
          <li
            key={e.id}
            className="pharos-hover-lift"
            style={{
              display: "grid",
              gridTemplateColumns: "32px 1fr auto",
              gap: space.md,
              padding: `${space.md} 0`,
              position: "relative",
              borderRadius: theme.radius.md,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  backgroundColor: e.iconBg,
                  border: `1px solid ${e.iconColor}50`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: e.iconColor,
                  flexShrink: 0,
                  boxShadow: `0 0 12px ${e.iconColor}30`,
                }}
              >
                {e.kind === "verified" &&
                e.iconColor === theme.color.primary ? (
                  <CheckIcon size={14} color="currentColor" />
                ) : e.kind === "verified" ? (
                  <XIcon size={14} color="currentColor" />
                ) : e.kind === "assigned" ? (
                  <AgentIcon size={14} color="currentColor" />
                ) : e.kind === "settled" ? (
                  <ChainIcon size={14} color="currentColor" />
                ) : e.kind === "approved" ? (
                  <ShieldIcon size={14} color="currentColor" />
                ) : (
                  <PlusIcon size={14} color="currentColor" />
                )}
              </div>
              {!isLast && (
                <div
                  aria-hidden
                  style={{
                    width: 1,
                    flex: 1,
                    backgroundColor: theme.color.glassBorder,
                    marginTop: 4,
                  }}
                />
              )}
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                paddingTop: 2,
              }}
            >
              <span
                style={{
                  fontSize: fontSize.body,
                  color: theme.color.ink,
                  fontWeight: fontWeight.bold,
                }}
              >
                {e.title}
              </span>
              <span
                style={{
                  fontSize: fontSize.caption,
                  color: theme.color.muted,
                  fontFamily: theme.font.sans,
                }}
              >
                {e.detail}
              </span>
            </div>
            <span
              style={{
                fontSize: fontSize.micro,
                color: theme.color.muted,
                fontFamily: theme.font.numbers,
                fontWeight: fontWeight.bold,
                paddingTop: 6,
                whiteSpace: "nowrap",
              }}
            >
              {formatRelative(e.at, now)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function formatRelative(at: number, now: number): string {
  const diff = now - at;
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/* ────────────────────────────────────────────────────────────────────────
 * Partner data.
 * ──────────────────────────────────────────────────────────────────────── */

function PartnerDataView({
  verifications,
}: {
  verifications: ReadonlyArray<{
    taskId: string;
    verifierId: string;
    verdict: "pass" | "fail";
    reason: string;
    evidenceHash: string;
    verifiedAt: number;
  }>;
}) {
  if (verifications.length === 0) {
    return (
      <p
        style={{ margin: 0, color: theme.color.muted, fontSize: fontSize.body }}
      >
        No partner data yet.
      </p>
    );
  }
  const now = Math.floor(Date.now() / 1000);
  return (
    <div
      style={{
        border: `1px solid ${theme.color.glassBorder}`,
        borderRadius: theme.radius.lg,
        overflow: "hidden",
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: theme.font.sans,
          fontSize: fontSize.body,
        }}
      >
        <thead>
          <tr style={{ backgroundColor: theme.color.glass2 }}>
            {[
              "Source",
              "Task",
              "Verdict",
              "Reason",
              "Freshness",
              "Confidence",
            ].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  padding: `${space.md} ${space.lg}`,
                  fontSize: fontSize.eyebrow,
                  fontWeight: fontWeight.bold,
                  color: theme.color.muted,
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  borderBottom: `1px solid ${theme.color.glassBorder}`,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {verifications.map((v, i) => {
            const age = now - v.verifiedAt;
            const stale = age > 300;
            const confidence = v.verdict === "pass" ? 0.95 : 0.4;
            return (
              <tr
                key={v.taskId + v.verifierId}
                className="pharos-hover-lift"
                style={{
                  backgroundColor:
                    i % 2 === 0 ? "transparent" : theme.color.glass2,
                }}
              >
                <td
                  style={{
                    padding: `${space.md} ${space.lg}`,
                    borderBottom: `1px solid ${theme.color.hairlineSubtle}`,
                    color: theme.color.body,
                  }}
                >
                  {v.verifierId}
                </td>
                <td
                  style={{
                    padding: `${space.md} ${space.lg}`,
                    borderBottom: `1px solid ${theme.color.hairlineSubtle}`,
                  }}
                >
                  <code
                    style={{
                      fontFamily: theme.font.mono,
                      fontSize: fontSize.code,
                      color: theme.color.ink,
                      fontWeight: fontWeight.bold,
                    }}
                  >
                    {v.taskId}
                  </code>
                </td>
                <td
                  style={{
                    padding: `${space.md} ${space.lg}`,
                    borderBottom: `1px solid ${theme.color.hairlineSubtle}`,
                  }}
                >
                  <VerdictPill verdict={v.verdict} />
                </td>
                <td
                  style={{
                    padding: `${space.md} ${space.lg}`,
                    borderBottom: `1px solid ${theme.color.hairlineSubtle}`,
                    color: theme.color.muted,
                  }}
                >
                  {v.reason || "—"}
                </td>
                <td
                  style={{
                    padding: `${space.md} ${space.lg}`,
                    borderBottom: `1px solid ${theme.color.hairlineSubtle}`,
                    color: stale ? theme.color.warning : theme.color.muted,
                    fontWeight: stale ? fontWeight.bold : fontWeight.regular,
                    fontFamily: theme.font.numbers,
                  }}
                >
                  {stale ? `stale · ${age}s` : `${age}s ago`}
                </td>
                <td
                  style={{
                    padding: `${space.md} ${space.lg}`,
                    borderBottom: `1px solid ${theme.color.hairlineSubtle}`,
                    fontFamily: theme.font.numbers,
                    fontSize: fontSize.code,
                    color:
                      confidence >= 0.8
                        ? theme.color.primary
                        : confidence >= 0.5
                        ? theme.color.warning
                        : theme.color.danger,
                    fontWeight: fontWeight.bold,
                  }}
                >
                  {confidence.toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Receipt.
 * ──────────────────────────────────────────────────────────────────────── */

function ReceiptView({ view }: { view: JobView }) {
  if (!view.receipt) {
    return (
      <p
        style={{ margin: 0, color: theme.color.muted, fontSize: fontSize.body }}
      >
        No receipt yet.
      </p>
    );
  }
  const r = view.receipt;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: space.md,
      }}
    >
      <HashDisplay label="DAG hash" value={r.dagHash} />
      <HashDisplay label="Assignment root" value={r.assignmentRoot} />
      <HashDisplay label="Result root" value={r.resultRoot} />
      <HashDisplay label="Verification root" value={r.verificationRoot} />
      <HashDisplay label="Tx" value={r.receiptTxHash} />
      <div
        className="pharos-hover-lift"
        style={{
          padding: space.lg,
          backgroundColor: theme.color.glass2,
          border: `1px solid ${theme.color.glassBorder}`,
          borderRadius: theme.radius.lg,
          display: "flex",
          flexDirection: "column",
          gap: space.sm,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: space.sm,
              fontSize: fontSize.eyebrow,
              fontWeight: fontWeight.bold,
              color: theme.color.muted,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
            }}
          >
            <ReceiptIcon size={12} color="currentColor" />
            Settled
          </span>
          <span
            style={{
              fontFamily: theme.font.numbers,
              fontSize: fontSize.numberMd,
              color: theme.color.primary,
              fontWeight: fontWeight.bold,
              textShadow: `0 0 16px ${theme.color.warningBg}`,
            }}
          >
            {formatMicrousd(r.totalSpentMicrousd)} μUSD
          </span>
        </div>
        <a
          href={`${EXPLORER_URL}/tx/${r.receiptTxHash}`}
          target="_blank"
          rel="noreferrer"
          className="pharos-hover-lift"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: space.sm,
            padding: `12px ${space["2xl"]}`,
            backgroundColor: theme.color.primary,
            color: theme.color.onPrimary,
            border: `1px solid ${theme.color.primary}`,
            borderRadius: theme.radius.md,
            fontSize: 14,
            fontWeight: fontWeight.bold,
            textDecoration: "none",
            height: 40,
            boxShadow: `0 0 0 1px ${theme.color.primary}, 0 0 24px ${theme.color.warningBg}`,
          }}
        >
          View on explorer
          <ExternalLinkIcon size={14} color="currentColor" />
        </a>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Toast — the small glass card that appears at the top-right of the
 * viewport when the user clicks a non-dashboard sidebar item. The
 * message comes from the parent; the component just handles the
 * entrance animation + auto-dismiss.
 * ──────────────────────────────────────────────────────────────────────── */

function Toast({ message }: { message: string }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 80,
        right: 32,
        zIndex: 50,
        maxWidth: 360,
        backgroundColor: theme.color.glass1,
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
        border: `1px solid ${theme.color.glassBorder}`,
        borderRadius: theme.radius.lg,
        padding: `${space.md} ${space.lg}`,
        boxShadow: theme.shadow.card,
        display: "flex",
        alignItems: "flex-start",
        gap: space.sm,
        animation: `pharos-slide-down 240ms ${theme.motion.easeOut} both`,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: theme.color.primary,
          boxShadow: `0 0 8px ${theme.color.primary}`,
          marginTop: 6,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: fontSize.bodySm,
          color: theme.color.ink,
          lineHeight: lineHeight.snug,
        }}
      >
        {message}
      </span>
      <style>{`@keyframes pharos-slide-down{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Loading / error / empty states.
 * ──────────────────────────────────────────────────────────────────────── */

function LoadingState({ jobId }: { jobId: string }) {
  return (
    <>
      <MotionStyles />
      <AnimatedBackground />
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: space["3xl"],
          fontFamily: theme.font.sans,
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: space.lg,
            backgroundColor: theme.color.glass1,
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: `1px solid ${theme.color.glassBorder}`,
            borderRadius: theme.radius.xl,
            padding: space["4xl"],
          }}
        >
          <PharosMark size={56} withGlow />
          <div
            aria-hidden
            style={{
              width: 32,
              height: 32,
              border: `2px solid ${theme.color.glassBorder}`,
              borderTopColor: theme.color.primary,
              borderRadius: "50%",
              animation: `pharos-spin 800ms linear infinite`,
            }}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Eyebrow>Loading</Eyebrow>
            <span
              style={{
                color: theme.color.ink,
                fontSize: fontSize.bodyLg,
                fontFamily: theme.font.mono,
                fontWeight: fontWeight.bold,
              }}
            >
              job · {jobId}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

function ErrorState({ error }: { error: string }) {
  const isCors = /cors/i.test(error);
  const isAuth = /401|unauthor/i.test(error);
  return (
    <>
      <MotionStyles />
      <AnimatedBackground />
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: space["3xl"],
          fontFamily: theme.font.sans,
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          className="pharos-hover-lift"
          style={{
            maxWidth: 480,
            width: "100%",
            backgroundColor: theme.color.glass1,
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: `1px solid ${theme.color.dangerBorder}`,
            borderRadius: theme.radius.lg,
            padding: space["3xl"],
            display: "flex",
            flexDirection: "column",
            gap: space.lg,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: space.md }}>
            <span
              aria-hidden
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: "50%",
                backgroundColor: theme.color.dangerBg,
                color: theme.color.danger,
              }}
            >
              <AlertTriangleIcon size={16} color="currentColor" />
            </span>
            <Eyebrow color={theme.color.danger}>Error</Eyebrow>
          </div>
          <p
            style={{
              margin: 0,
              color: theme.color.ink,
              fontSize: fontSize.bodyLg,
              fontWeight: fontWeight.bold,
            }}
          >
            {isCors
              ? "CORS origin denied"
              : isAuth
              ? "Rejected signature / unauthorized"
              : "Failed to fetch"}
          </p>
          <code
            style={{
              fontFamily: theme.font.mono,
              fontSize: fontSize.code,
              color: theme.color.body,
              backgroundColor: "rgba(0, 0, 0, 0.4)",
              border: `1px solid ${theme.color.glassBorder}`,
              borderRadius: theme.radius.md,
              padding: space.md,
              wordBreak: "break-word",
            }}
          >
            {error}
          </code>
        </div>
      </div>
    </>
  );
}

function EmptyState() {
  return (
    <>
      <MotionStyles />
      <AnimatedBackground />
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: theme.color.muted,
          fontFamily: theme.font.sans,
          fontSize: fontSize.bodyLg,
          position: "relative",
          zIndex: 1,
        }}
      >
        No job selected.
      </div>
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Helpers.
 * ──────────────────────────────────────────────────────────────────────── */

function countByState(view: JobView, state: TaskState): number {
  return Object.values(view.state).filter((s) => s === state).length;
}

function formatMicrousd(n: bigint | string | number): string {
  const s = typeof n === "bigint" ? n.toString() : String(n);
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export default Dashboard;
