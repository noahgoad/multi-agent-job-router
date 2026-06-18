# tools/video — project intro video

Self-contained pipeline that turns the project README, the
on-chain proof, and a narration script into an MP4 with voice-over
and motion graphics. Two languages are supported out of the box.

## Outputs

- `pharos-intro-final.mp4` — Vietnamese voice, vi-VN-NamMinhNeural,
  1m43s, ~10 MB.
- `pharos-intro-en-final.mp4` — English voice, en-US-AriaNeural,
  3m02s, ~14 MB. More scenes + more motion than the Vietnamese cut.
- `index.html` — Vietnamese composition (smaller, simpler).
- `index-en.html` — English composition (the new richer cut).
- `assets/narration_full.wav` — concatenated Vietnamese voice-over.
- `assets/narration_en_full.wav` — concatenated English voice-over.
- `assets/audio/01_hook.wav` … `14_close.wav` — the 14 Vietnamese
  segments that the script splits into.
- `assets/audio-en/01_hook.wav` … `20_close.wav` — the 20 English
  segments.

## Reproducing the build

1. Install FFmpeg + FFprobe to a directory on `PATH` (e.g. `C:\ffmpeg\`).
   The HyperFrames CLI shells out to both.
2. Install Edge TTS: `pip install edge-tts`.
3. Generate the voice-over: `python tools/generate_narration.py` (Vietnamese)
   or `python tools/generate_narration_en.py` (English).
4. Render: `npx --yes hyperframes render --quality high -c index-en.html -o pharos-intro-en.mp4`.
5. Mux audio + video: see the inline ffmpeg command below.

```bash
# 1. Voice-over (writes 20 wavs + concatenates to assets/narration_en_full.wav)
python tools/generate_narration_en.py

# 2. Render the English HTML composition to MP4 (no audio, ~5 min)
npx --yes hyperframes render --quality high \
  --project-dir tools/video \
  -c index-en.html \
  -o tools/video/pharos-intro-en.mp4

# 3. Mux the voice-over into the rendered MP4
ffmpeg -y -i pharos-intro-en.mp4 -i assets/narration_en_full.wav \
  -c:v copy -c:a aac -b:a 192k -shortest pharos-intro-en-final.mp4
```

For the Vietnamese cut, replace the script and audio with the
`-vi` versions and use `index.html` as the composition.

## Why these tools

- **HyperFrames** (`heygen-com/hyperframes`) is the renderer. It treats
  the HTML as the source of truth — every visual element is a `clip`
  with a `data-start` / `data-duration` / `data-track-index`, GSAP
  timelines are paused and registered on `window.__timelines`, and the
  CLI drives a headless Chrome to capture frames at 30 fps, then
  stitches them into an MP4 with ffmpeg.
- **Edge TTS** (`edge-tts`) is the voice. It's free, runs locally
  (well, calls Microsoft's endpoint, no API key). The Vietnamese voice
  `vi-VN-NamMinhNeural` is good for naturalness but has no emotion
  controls; we use rate cues for prosody. The English voice
  `en-US-AriaNeural` is naturally expressive ("Positive, Confident"
  persona) and supports per-segment `rate` / `pitch` prosody.
  We tried `<mstts:express-as style="...">` SSML for stronger
  emotion but the free endpoint returns 50-second WAVs full of
  silence when that extension is active, so we drop down to plain
  text with prosody. See the long comment at the top of
  `tools/generate_narration_en.py` for the full debugging story.
- Edge TTS rate-limits aggressively; both scripts back off
  exponentially on `NoAudioReceived` and sleep between segments.

## Limits / known sharp edges

- The free Vietnamese and English voices are good but neither is
  as expressive as a paid TTS (ElevenLabs, Azure Neural). For
  richer emotion, swap the provider inside
  `tools/generate_narration*.py` — the rest of the pipeline
  (composition, render, mux) does not change.
- The composition is locked to the script's segment durations.
  Re-recording requires re-laying out the timeline in
  `index.html` / `index-en.html`.
- Lint still warns about a few things (per-scene `id` requirements,
  GSAP overlapping tweens). They are non-fatal; the renderer
  continues and the video plays fine.
- The CLI's `npx --yes hyperframes render` calls FFprobe, so
  `ffprobe` must be on `PATH` separately from `ffmpeg` on Windows.
