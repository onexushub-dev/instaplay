# LANCE: camera zoom (design)

> Date: 2026-10-21. Status: awaiting review. Scope: iPhone only (Android keeps today's two-lens behaviour).
> Origin: the setup screen has two buttons, 0.5x and 1x. They are two different physical cameras, so changing one restarts the
> whole camera session and empties the buffer. The player cannot zoom the way the iPhone Camera app does.

## 1. Goal

On the positioning screen the player frames the shot like in the iPhone Camera app:
- **Pinch** with two fingers on the preview to zoom continuously, with a bubble showing the value while the fingers are down.
- **One round button** (top right) that shows only the current zoom ("1x"). Each tap goes to the next step: 0.5x → 1x → 2x → 5x → 0.5x.
- The zoom is saved per mode and used for the next game. **It is locked while recording** (decision: safety; no button or gesture in the recording panel).

Success looks like:
- Going from 0.5x to 1x by pinching has no black frame, no restart and no empty buffer.
- The recorded clips show exactly the framing the preview showed.
- Players who saved "ultra-wide" or "wide" before keep the same framing (0.5x and 1x).

Non-goals: Android pinch zoom (an adapter later), zoom while recording, telephoto lenses, tap to focus, the editor's zoom (separate feature).

## 2. Facts that shape the design

| Fact | Consequence |
|---|---|
| `CaptureController.configure(lens:)` picks `builtInUltraWideCamera` or `builtInWideAngleCamera` and rebuilds the session. | Today's zoom change = full restart. A continuous zoom needs one device that covers both. |
| iPhones with an ultra-wide offer `builtInDualWideCamera`: one virtual device. Its `videoZoomFactor` 1.0 is the ultra-wide, and `virtualDeviceSwitchOverVideoZoomFactors` (normally `[2.0]`) is where it hands over to the wide. | User zoom = device factor ÷ first switch-over (0.5x = 1.0, 1x = 2.0). Above 1x the zoom is a digital crop. |
| The video data output and the preview layer both receive the zoomed frames. | The buffer records what the player sees, with no extra work. |
| `ReplayEngine` reconfigures the camera on a thermal change using the stored lens. | The engine must keep the zoom and reapply it there too. |
| The rear torch blink falls back to the wide camera because the ultra-wide has none. The virtual device has a torch. | The "saved" blink also works at 0.5x without the fallback. |
| iPhones without an ultra-wide (XR, SE) have no dual-wide device. | Range is 1x to 5x there, and the cycle skips 0.5x. |

## 3. Design

### 3.1 Zoom model (`src/modes/zoom.ts`, pure functions)

```
ZOOM_STEPS = [0.5, 1, 2, 5]
ZoomRange  = { min: number; max: number; continuous: boolean }   // from the native side
```
- `clampZoom(z, range)`: keeps `z` inside `[min, max]`.
- `nextZoomStep(current, range)`: the first step above `current` (tolerance 0.05) inside the range, else the first step at or above `min`. From 1.3x it goes to 2x; from 5x it goes back to the first step.
- `formatZoom(z)`: "0.5x", "1x", "1.3x" (one decimal, no trailing ".0").
- `pinchZoom(base, ratio, range)`: `clampZoom(base * ratio, range)`.
- `zoomFromLens('ultraWide' | 'wide')`: 0.5 or 1. `lensFor(zoom)`: `zoom < 1 ? 'ultraWide' : 'wide'` (kept for Android and the old session options).

### 3.2 Settings and migration

- `ModeSettings.lens` is replaced by `ModeSettings.zoom: number`. Defaults: Quadra/court 0.5, Academia 1 (same framing as today's lenses).
- `Prefs.lens` (global, from before modes) stays in the type as legacy and is read only by `effectiveSettings`.
- `effectiveSettings` resolves `zoom` in this order: the mode override's `zoom`, then the override's old `lens` (via `zoomFromLens`), then the legacy `Prefs.lens` (Quadra group only), then the mode default. No stored data is rewritten; old values keep working and a new save writes `zoom`.
- `withModeOverride` writes `zoom` (never `lens`).

### 3.3 Native API (iOS)

```
getZoomRange(): ZoomRange                      // sync; no session needed
setZoom(factor: number, animated: boolean): void
SessionOptions = { lens, zoom?, maxQuality, bufferSeconds? }
```
- `getZoomRange`: dual-wide present → `{ min: 0.5, max: 5, continuous: true }`; wide only → `{ min: 1, max: 5, continuous: true }`. Android and web: `{ min: 0.5, max: 1, continuous: false }` (today's behaviour).
- `CaptureController` picks the device from `zoom`: dual-wide when it exists, else wide (for `lens` only when `zoom` is absent). After the format is applied it sets `videoZoomFactor = zoom × switchOver` (clamped to what the active format allows, `maxAvailableVideoZoomFactor`).
- `setZoom` stores the wanted zoom in the capture controller (so the next start and the thermal reconfiguration reuse it) and, when running, applies it under `lockForConfiguration`. `animated` uses `ramp(toVideoZoomFactor:withRate:)` (button taps); the pinch sets the factor directly.
- `ReplayEngine` keeps `zoom` next to `lens` and passes it to every `configure` call.
- The format search (`applyFormat`) is unchanged: 16:9 at 1920 width and the best frame rate the virtual device offers. **Risk to validate on a device:** that the dual-wide device keeps 1080p60 (otherwise 1080p30 is what we get, silently).

### 3.4 Session

`prepare` currently reopens the camera when `lens|quality|buffer` changes.
- Continuous zoom (iOS): the key is `quality|buffer`, so a zoom change never reopens the camera. `startSession` receives `zoom` as its initial value.
- Not continuous (Android, web): the key keeps the lens: `lensFor(zoom)|quality|buffer`, so the lens still reopens the camera.
- The setup screen applies zoom changes with `setZoom` and saves them with `updateMode({ zoom })` when the gesture ends or the button is tapped.

### 3.5 Setup screen

- Top right: a round **ZoomButton** (48 pt, accent fill, bold value, `accessibilityLabel` "Zoom 1x", hint "Toque para mudar o zoom"). It replaces the two-button pill.
- The pinch area is a transparent view over the camera and under the controls (`PanResponder`, claims the gesture only when two fingers are down, so taps on the sheet and the guide are untouched). While pinching, the button shows the live value and a bubble appears above the sheet; it fades after 800 ms.
- The value is saved when the fingers lift. Reduced motion: no fade, the bubble just disappears.
- During recording (`RecordingPanel`) nothing changes: no button, no gesture.
- `useIsFocused` rules are unchanged: leaving the screen releases the camera as today.

### 3.6 Copy

"1x" style values only; no extra labels. Accessibility: the button announces the new value after each tap.

## 4. Files

New: `src/modes/zoom.ts`, `src/components/ZoomButton.tsx`, `src/components/ZoomBubble.tsx`, `src/camera/useCameraPinch.ts`.
Changed: `src/data/schema.ts`, `src/modes/registry.ts`, `src/session/useReplaySession.ts`, `src/app/setup.tsx`, `src/app/spike.tsx`;
module JS (`ReplayCamera.ts`, `ReplayCamera.types.ts`, `ReplayCameraModule.ts`, `ReplayCameraModule.web.ts`, `index.ts`);
iOS (`CaptureController.swift`, `ReplayEngine.swift`, `ReplayCameraModule.swift`); Android (`ReplayCameraModule.kt`: `getZoomRange` and a no-op `setZoom`, plus accepting `zoom` in the options).
Tests updated: registry, setup, useReplaySession, module, repo (the `lens` fixtures).

## 5. Order of work

1. **JS side, fully tested here:** zoom functions, migration, session key, ZoomButton, pinch hook, module JS API (with a guard so a native build without `setZoom` does not crash).
2. **iOS native:** dual-wide device, `setZoom`, `getZoomRange`, engine zoom memory. The development machine used by Claude cannot build Swift, so this part is written but **not compiled or run by Claude**: it needs your Xcode build and the device checklist below.

## 6. Errors and edge cases

- Device without ultra-wide: range starts at 1; a saved 0.5 is clamped to 1 on read.
- Saved zoom above the range: clamped.
- `setZoom` before the session is running: remembered and applied at start.
- Thermal fallback (720p30 reconfiguration): zoom is reapplied after the new format.
- Pinch while the camera is still opening: the value is kept and applied when the session starts.
- Lens locked while recording: the setup controls are not rendered then.

## 7. Testing

- Pure: `zoom.test.ts` (steps from every value, formatting, clamping, lens mapping); registry migration (old `lens` in the override, legacy `Prefs.lens`, new `zoom`, defaults).
- Session: key without zoom when continuous, with lens when not; `startSession` receives `zoom` and `lens`.
- Setup: the button shows the saved value, cycles 0.5 → 1 → 2 → 5 → 0.5, calls `setZoom` and saves; a pinch changes the live value and saves on release; no zoom controls while recording.
- `npx tsc --noEmit` and lint on the touched files.
- **Device checklist (iPhone with ultra-wide):** 1080p60 holds (check the recorded clip's frame rate); pinch from 0.5x to 1x is seamless; torch blinks at 0.5x; a clip shows the framing of the preview; thermal fallback keeps the zoom; XR/SE or iPad shows 1x–5x with no 0.5x.

## 8. Open points

- Max zoom 5x is an assumption (image quality drops fast in a digital crop); change `ZOOM_STEPS` and the range if you want another cap.
- Confirm 1080p60 on the virtual device (section 3.3). If it fails, the fallback is: keep the physical lenses (today's model) and only replace the two buttons by the single progressive button, without pinch.
