# Generate the English narration audio with Edge TTS.
#
# Edge TTS gives us two English voices that are expressive on their
# own: `en-US-AriaNeural` (Female, "Positive, Confident" persona)
# and `en-US-GuyNeural` (Male, "Friendly, Approachable" persona).
# We use Aria because she's the more cinematic of the two for
# product intros.
#
# Why no SSML <mstts:express-as>?
#   We tried wrapping each segment in a minimal SSML document with
#   `mstts:express-as style="..."` to switch emotion per scene
#   (cheerful, empathetic, sad, hopeful, …). The result was a 20×
#   slowdown — 9 seconds of text became a 50-second file, almost
#   entirely silence with random sub-second blips. The audio
#   stream is real but the timing model is broken when style
#   extensions are active on a free endpoint. We fall back to
#   plain text with per-segment `rate` / `pitch` prosody; Aria's
#   natural persona covers the emotion.
#
# Edge TTS rate-limits aggressively per session token. The
# "NoAudioReceived" error fires on consecutive calls within ~3s, so
# we sleep between requests and retry with exponential backoff.
# viem-style streams can only be iterated once, so each retry
# constructs a fresh `Communicate`.

import asyncio
import io
import sys

import edge_tts

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

VOICE = "en-US-AriaNeural"

OUT_DIR = "D:/pharos-future-ideas/04-multi-agent-job-router/tools/video/assets/audio-en"
SLEEP_BETWEEN = 3  # seconds, to stay below Edge TTS rate limit


# Script: 6 scenes that map 1:1 to the video timeline.
# Each tuple is (filename, text, rate, pitch).
# Aria is naturally expressive; the per-segment prosody shifts
# pacing and emphasis, the voice itself carries the rest.
SEGMENTS = [
    # Scene 1: 0-15s — Hook
    (
        "01_hook.wav",
        "Welcome to Pharos Multi-Agent Job Router. A coordination layer for AI agents, anchored on the Pharos Atlantic blockchain.",
        "+0%",
        "+0Hz",
    ),
    (
        "02_hook.wav",
        "Built for a world where many models collaborate on the same problem, and someone has to be the coordinator.",
        "-3%",
        "-1Hz",
    ),
    # Scene 2: 15-32s — Problem
    (
        "03_problem.wav",
        "But coordinating AI agents is hard. Which one is trustworthy? How do you verify a result? Who is accountable when something goes wrong?",
        "+0%",
        "+0Hz",
    ),
    (
        "04_problem.wav",
        "Centralized coordinators are a single point of failure. Self-managed agents cannot agree on a shared source of truth.",
        "-3%",
        "-2Hz",
    ),
    (
        "05_problem.wav",
        "Pharos Job Router answers both problems with one design.",
        "+5%",
        "+2Hz",
    ),
    # Scene 3: 32-55s — Architecture
    (
        "06_arch.wav",
        "Under the hood, the project is a TypeScript monorepo with six core packages and two services. Every piece is independently tested.",
        "+0%",
        "+0Hz",
    ),
    (
        "07_arch.wav",
        "Policy enforces least-privilege rules and reserves a budget before any task runs. Workflow compiles your job spec into a directed acyclic graph.",
        "-2%",
        "+0Hz",
    ),
    (
        "08_arch.wav",
        "Registry tracks every agent with a CertiK-verified skill release and a signed heartbeat. Routing scores each agent on capability, trust, cost, and latency.",
        "+0%",
        "+0Hz",
    ),
    (
        "09_arch.wav",
        "Orchestrator runs the graph in dependency order. The verifier checks every result with at least two independent methods, then aggregates the verdicts.",
        "+0%",
        "+0Hz",
    ),
    # Scene 4: 55-78s — Workflow
    (
        "10_workflow.wav",
        "Each job flows through five stages. First, the compiler turns your spec into a graph of tasks. Second, the router picks an agent for each.",
        "-2%",
        "+0Hz",
    ),
    (
        "11_workflow.wav",
        "Third, the orchestrator walks the graph. Write and financial operations pause for a human-in-the-loop approval.",
        "+0%",
        "+0Hz",
    ),
    (
        "12_workflow.wav",
        "Fourth, the verifier runs hash, schema, and deterministic checks against the worker's output. Disagreements trigger bounded retries.",
        "-2%",
        "+0Hz",
    ),
    (
        "13_workflow.wav",
        "Fifth, the final receipt is anchored to the Pharos Atlantic chain. Anyone can verify the job end to end, no trusted intermediary required.",
        "+0%",
        "+0Hz",
    ),
    # Scene 5: 78-95s — Demo
    (
        "14_demo.wav",
        "Here is what a real run looks like. The dashboard receives a four-task job and one click later, the system is at work.",
        "+0%",
        "+0Hz",
    ),
    (
        "15_demo.wav",
        "Each task gets a CertiK-verified agent, runs to completion, passes the verifier, and writes to the chain. The receipt is final.",
        "-2%",
        "+0Hz",
    ),
    (
        "16_demo.wav",
        "Open the Pharos Atlantic explorer. Paste the receipt hash. See the whole history, from the first task to the final anchor.",
        "+0%",
        "+0Hz",
    ),
    # Scene 6: 95-110s — Closing (no MIT, no test count, no chainId)
    (
        "17_close.wav",
        "The next generation of AI agents deserves better coordination. Not faster. Better.",
        "-3%",
        "-2Hz",
    ),
    (
        "18_close.wav",
        "Transparent where it counts. Verifiable by anyone, anywhere. Anchored not in trust, but in math.",
        "-3%",
        "-1Hz",
    ),
    (
        "19_close.wav",
        "The demo is live. The code is open. Click the link in the description and see it run.",
        "+5%",
        "+2Hz",
    ),
    (
        "20_close.wav",
        "Or fork the repository. Deploy your own coordinator. The future of multi-agent systems is yours to build.",
        "+0%",
        "+0Hz",
    ),
]


async def save_with_retry(
    text: str,
    path: str,
    attempts: int = 8,
) -> None:
    """Save with retry on Edge TTS rate limiting. The 'NoAudioReceived'
    error fires on consecutive calls within ~3s; the upstream service
    rate-limits per session token, so retries with backoff reliably
    succeed. Each attempt constructs a fresh `Communicate` because
    viem-style streams can only be iterated once. Backoff is
    aggressive (10s, 20s, 40s, ...) because the rate-limit window
    is long."""
    for attempt in range(attempts):
        comm = edge_tts.Communicate(text, VOICE)
        try:
            await comm.save(path)
            return
        except edge_tts.exceptions.NoAudioReceived:
            if attempt == attempts - 1:
                raise
            wait = 10 * (2**attempt)
            print(
                f"  rate-limited, retrying in {wait}s (attempt {attempt + 1}/{attempts})"
            )
            await asyncio.sleep(wait)


async def main() -> None:
    for i, (filename, text, rate, pitch) in enumerate(SEGMENTS):
        out_path = f"{OUT_DIR}/{filename}"
        # Pass `rate` and `pitch` as constructor kwargs so Aria gets
        # per-segment prosody without us having to drop into SSML.
        # (Using SSML with `<mstts:express-as>` on this free endpoint
        # produces 50-second WAVs with mostly silence — see the
        # long-form comment at the top of this file.)
        await save_with_retry_kwargs(text, out_path, rate=rate, pitch=pitch)
        print(f"wrote {out_path}")
        if i < len(SEGMENTS) - 1:
            await asyncio.sleep(SLEEP_BETWEEN)


async def save_with_retry_kwargs(
    text: str,
    path: str,
    rate: str,
    pitch: str,
    attempts: int = 8,
) -> None:
    for attempt in range(attempts):
        comm = edge_tts.Communicate(text, VOICE, rate=rate, pitch=pitch)
        try:
            await comm.save(path)
            return
        except edge_tts.exceptions.NoAudioReceived:
            if attempt == attempts - 1:
                raise
            wait = 10 * (2**attempt)
            print(
                f"  rate-limited, retrying in {wait}s (attempt {attempt + 1}/{attempts})"
            )
            await asyncio.sleep(wait)


asyncio.run(main())
