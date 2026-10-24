# Modo Foco spike detections (2026-10-23)

Per-frame detections from the throwaway spike in `../../specs/2026-10-23-focus-mode-design.md`, kept as test fixtures for
`FocusPath`. Every 2nd frame of a 30 fps clip was analysed (`step: 2`, `i` = frame index).

- `W`, `H`: video size in pixels (display orientation); `n`: frame count.
- `frames[].d[]`: `k` = `p` (person) or `b` (ball), `c` = confidence, `box` = `[x1, y1, x2, y2]` in pixels, origin top-left.

Detector: Ultralytics YOLO11s at 1280 px (spike only; the app uses Apple Vision, see the spec). One file per test video;
both framings (landscape and portrait) are computed from the same detections. The name starts with how the video was
recorded:

| File | Video | Size |
|---|---|---|
| `landscape-basketball-stream.json` | basketball, screen recording of a live stream, cropped | 1920x1080 |
| `landscape-basketball-halfcourt.json` | basketball half-court practice, screen recording, cropped | 1920x1080 |
| `landscape-volleyball.json` | indoor volleyball, Repplay export via WhatsApp | 1024x576 |
| `portrait-beach-tennis.json` | beach tennis, Repplay export via WhatsApp | 576x1024 |
| `portrait-basketball-app-motion.json` | small basketball court, Repplay export, more movement | 1080x1920 |
| `portrait-basketball-app-still.json` | same court, Repplay export, calmer play | 1080x1920 |

Known traps: balls lying on the sand in `portrait-beach-tennis`, spectators in the stands in
`landscape-basketball-stream`, orange objects on the wall in both `portrait-basketball-app-*`.
