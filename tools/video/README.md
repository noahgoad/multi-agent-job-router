# tools/video — project intro video

Self-contained pipeline that turns the project README, the
on-chain proof, and a Vietnamese script into a 1m43s MP4 with
voice-over, motion graphics, and a clean dark theme.

## Outputs

- `pharos-intro-final.mp4` — the final video, 1920x1080, 30 fps,
  1m43s, ~10 MB, AAC mono voice-over.
- `pharos-intro.mp4` — HyperFrames' raw render (no audio).
- `index.html` — the composition. Re-renderable.
- `assets/narration_full.wav` — concatenated Edge TTS voice-over.
- `assets/audio/01_hook.wav` … `14_close.wav` — the 14 individual
  TTS segments that the script splits into. Useful for fine-tuning
  a single line without regenerating the whole track.

## Reproducing the build

1. Install FFmpeg + FFprobe to a directory on `PATH` (e.g. `C:\ffmpeg\`).
   The HyperFrames CLI shells out to both.
2. Install Edge TTS: `pip install edge-tts`.
3. Generate the voice-over: `python tools/generate_narration.py`.
4. Render: `npx --yes hyperframes render --quality high -o pharos-intro.mp4`.
5. Mux audio + video: see `tools/video/merge.sh` (or the inline ffmpeg
   command below).

```bash
# 1. Voice-over (writes 14 wavs + concatenates to assets/narration_full.wav)
python tools/generate_narration.py

# 2. Render the HTML composition to MP4 (no audio, ~2-3 min)
npx --yes hyperframes render --quality high \
  --project-dir tools/video \
  -o tools/video/pharos-intro.mp4

# 3. Mux the voice-over into the rendered MP4
ffmpeg -y -i pharos-intro.mp4 -i assets/narration_full.wav \
  -c:v copy -c:a aac -b:a 192k -shortest pharos-intro-final.mp4
```

## Why these tools

- **HyperFrames** (`heygen-com/hyperframes`) is the renderer. It treats
  the HTML as the source of truth — every visual element is a `clip`
  with a `data-start` / `data-duration` / `data-track-index`, GSAP
  timelines are paused and registered on `window.__timelines`, and the
  CLI drives a headless Chrome to capture frames at 30 fps, then
  stitches them into an MP4 with ffmpeg.
- **Edge TTS** (`edge-tts`) is the voice. It's free, runs locally
  (well, calls Microsoft's endpoint, no API key), and supports the
  two Vietnamese voices `vi-VN-NamMinhNeural` (male) and
  `vi-VN-HoaiMyNeural` (female). Edge TTS rate-limits aggressively;
  `tools/generate_narration.py` backs off exponentially on
  `NoAudioReceived` and sleeps 3s between segments.

## Limits / known sharp edges

- The voice is the free Microsoft Vietnamese voice, which is good
  but not as expressive as a paid TTS (ElevenLabs, Azure Neural).
  Per-segment `rate` cues (the `tuning` field in the script) shift
  the pacing but cannot change emotion.
- The composition is locked to the script's segment durations.
  Re-recording requires re-laying out the timeline in `index.html`.
- Lint still warns about a few things (per-scene `id` requirements,
  GSAP overlapping tweens). They are non-fatal; the renderer
  continues and the video plays fine.
- The CLI's `npx --yes hyperframes render` calls FFprobe, so
  `ffprobe` must be on `PATH` separately from `ffmpeg` on Windows.
