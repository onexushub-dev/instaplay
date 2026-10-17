# ReplayCamera Foundation (Etapa 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Expo app and build the native `ReplayCamera` module (60s rolling buffer, save clip, X-arms gesture, thermal events) with a spike screen, so it can be field-tested for 2h in the sun on an iPhone and a mid-range Android.

**Architecture:** One local Expo Module (`modules/replay-camera`) owns the camera, encoder and buffer on each platform. Pure logic (segment ring, gesture classifier, hold tracker, storage guard) lives in platform-free files with unit tests. AVFoundation / Camera2 + MediaCodec glue sits on top and is verified on device. JS gets a thin typed wrapper and a native preview view.

**Tech Stack:** Expo (latest SDK, New Architecture, Hermes), Expo Router, Expo Modules API (Swift / Kotlin), AVFoundation + Vision (iOS), Camera2 + MediaCodec + MediaMuxer + ML Kit Pose Detection (Android), Jest, XCTest via SwiftPM, JUnit.

**Spec:** `docs/superpowers/specs/2026-10-17-lance-design.md` (sections 4.2, 4.3, 7, 9)

## Global Constraints

- Buffer window: **60s**, made of **2s segments**, ring capacity **30**. A segment that leaves the window is deleted immediately.
- Max capture: **1080p 60fps**, ultra-wide (0.5x) by default when available.
- Thermal degrade: at iOS `ProcessInfo.ThermalState.serious` / Android `THERMAL_STATUS_SEVERE` or above → **720p 30fps** plus an `onThermalChange` event with `degraded: true`.
- Gesture: both wrists above the nose **and** forearms crossed (X), held for **≥1.0s**. Cooldown after a trigger: **3s**.
- Saving a clip **copies** the segments to a new file. A saved clip never references ring files.
- Temp segments live in `<cache>/replay-buffer/`. They are wiped on `stopSession()` and at every `startSession()` (orphans from a crash).
- `startSession()` refuses with code `LOW_STORAGE` when free space is **< 500 MB**.
- Saved clips live in `<documents>/clips/<uuid>.mp4`.
- Native interface names, exactly as the spec defines them (4.2): `startSession({ lens, maxQuality })`, `stopSession()`, `saveClip({ source, at })` → `{ clipPath, durationMs }`, `setGestureEnabled(bool)`, events `onTrigger`, `onThermalChange`, `onInterrupted`, `onResumed`, `onError`. `exportClip` is out of scope here (Plan 3).
- App lives in `app/` at the repo root. All commands below run from `/Users/marcus/Documents/lance/app` unless stated.

## Review Focus

1. **Save in the first seconds of a game** (less than 60s buffered) → the clip contains what exists, and `durationMs` reflects it. No error. → Task 2 `test_snapshotWithFewSegments`.
2. **App killed mid-game** → orphan segments are wiped on the next `startSession()`, so they never accumulate. → Task 2 `test_purgeOrphansRemovesLeftoverFiles`.
3. **Ring keeps running after a save** → evicting every segment that went into a clip does not break the saved file. → Task 2 `test_savedClipSurvivesEviction`.
4. **Trigger right after the play** → the clip ends at the trigger, not at the last 2s boundary. The current segment is force-cut on save. → Task 5 / Task 7 device check "clip ends within 0.5s of trigger".
5. **Celebration (arms up, not crossed) or a single arm raised** → no trigger. → Task 3 `test_armsUpNotCrossed_isFalse`, `test_oneArmUp_isFalse`.

---

### Task 1: Scaffold the app and the local module

**Files:**
- Create: `app/` (from `create-expo-app`), `app/modules/replay-camera/` (from `create-expo-module --local`)
- Modify: `app/app.json` (name `LANCE`, slug `lance`, `ios.bundleIdentifier` / `android.package` = `app.lance.mobile`, camera permission strings in pt-BR)
- Create: `.gitignore` at the repo root (node_modules, ios/, android/, .expo)

**Interfaces:**
- Produces: a dev-client build that runs on device, with a `ReplayCamera` module stub importable as `import ReplayCamera from '../modules/replay-camera'`.

- [ ] **Step 1:** `cd /Users/marcus/Documents/lance && npx create-expo-app@latest app` → Expected: `app/` with Expo Router + TypeScript.
- [ ] **Step 2:** `npx expo install expo-dev-client` and `npx create-expo-module@latest --local replay-camera` (answer: name `ReplayCamera`, package `expo.modules.replaycamera`) → Expected: `modules/replay-camera/{ios,android,src}`.
- [ ] **Step 3:** Set the `app.json` fields above. Permission copy: camera `"O LANCE usa a câmera para gravar seus lances."`, microphone `"O LANCE grava o som dos seus lances."`.
- [ ] **Step 4:** `npx expo prebuild --clean && npx expo run:ios --device` (and `run:android --device`) → Expected: the template app opens on both phones.
- [ ] **Step 5:** Add Jest: `npx expo install jest-expo jest @types/jest --dev`, `"test": "jest"` in package.json, `"jest": {"preset": "jest-expo"}`. Run `npm test -- --passWithNoTests` → PASS.
- [ ] **Step 6: Commit** `chore: scaffold Expo app and local replay-camera module`

---

### Task 2: Segment ring and storage guard (pure logic, both platforms)

**Files:**
- Create: `modules/replay-camera/ios/Core/Package.swift` (SwiftPM package `ReplayCore`, Foundation only, macOS 13 for `swift test`)
- Create: `modules/replay-camera/ios/Core/Sources/ReplayCore/SegmentRing.swift`, `StorageGuard.swift`
- Create: `modules/replay-camera/ios/Core/Tests/ReplayCoreTests/SegmentRingTests.swift`, `StorageGuardTests.swift`
- Modify: `modules/replay-camera/ios/ReplayCamera.podspec` (add `Core/Sources/**/*.swift` to `source_files`, exclude `Core/Tests`)
- Create: `modules/replay-camera/android/src/main/java/expo/modules/replaycamera/core/SegmentRing.kt`, `StorageGuard.kt`
- Create: `modules/replay-camera/android/src/test/java/expo/modules/replaycamera/core/SegmentRingTest.kt`, `StorageGuardTest.kt`
- Modify: `modules/replay-camera/android/build.gradle` (`testImplementation 'junit:junit:4.13.2'`)

**Interfaces (identical shape on both platforms):**
- `struct Segment { url: URL/File; startTime: Double /* s since session start */; duration: Double }`
- `class SegmentRing(capacity: Int = 30, fileOps: FileOps)`
  - `append(_ s: Segment)`: evicts and deletes the oldest when over capacity
  - `snapshot(lastSeconds: Double = 60) -> [Segment]`: segments overlapping `[newestEnd - lastSeconds, newestEnd]`, oldest first
  - `copyClip(lastSeconds: Double, to dest: URL, concat: ([Segment], URL) throws -> Void) throws -> Double`: calls `concat` and returns the total duration in seconds
  - `clear()`: deletes every file
  - `static purgeOrphans(dir: URL, fileOps: FileOps)`: deletes everything in `dir`
- `protocol FileOps { delete(url); list(dir) -> [URL]; exists(url) -> Bool }` (a fake in tests)
- `StorageGuard.check(freeBytes: Int64) throws`: throws `ReplayError.lowStorage` (Kotlin: `LowStorageException`) when `freeBytes < 500 * 1024 * 1024`

- [ ] **Step 1: Write the failing tests** (Swift shown; mirror them 1:1 in Kotlin with the same names)

```swift
func test_appendBeyondCapacityEvictsAndDeletesOldest() {
  let ops = FakeFileOps(); let ring = SegmentRing(capacity: 30, fileOps: ops)
  for i in 0..<31 { ring.append(seg(i)) }           // seg(i): start = 2*i, duration 2
  XCTAssertEqual(ring.snapshot(lastSeconds: 600).count, 30)
  XCTAssertEqual(ops.deleted, [url(0)])
}
func test_snapshotReturnsLast60s() {
  let ring = SegmentRing(capacity: 30, fileOps: FakeFileOps())
  for i in 0..<30 { ring.append(seg(i)) }
  XCTAssertEqual(ring.snapshot(lastSeconds: 60).map(\.startTime).first, 0)
  XCTAssertEqual(ring.snapshot(lastSeconds: 10).count, 5)
}
func test_snapshotWithFewSegments() {
  let ring = SegmentRing(capacity: 30, fileOps: FakeFileOps())
  for i in 0..<3 { ring.append(seg(i)) }
  XCTAssertEqual(try ring.copyClip(lastSeconds: 60, to: dest, concat: { _, _ in }), 6, accuracy: 0.001)
}
func test_savedClipSurvivesEviction() {
  let ops = FakeFileOps(); let ring = SegmentRing(capacity: 30, fileOps: ops)
  for i in 0..<30 { ring.append(seg(i)) }
  _ = try ring.copyClip(lastSeconds: 60, to: dest, concat: { _, d in ops.created.append(d) })
  for i in 30..<60 { ring.append(seg(i)) }
  XCTAssertFalse(ops.deleted.contains(dest))
}
func test_clearDeletesAll() { /* 5 appended → clear() → ops.deleted.count == 5, snapshot empty */ }
func test_purgeOrphansRemovesLeftoverFiles() { /* fake dir lists 3 urls → purgeOrphans → all 3 deleted */ }
func test_storageGuard() {
  XCTAssertThrowsError(try StorageGuard.check(freeBytes: 499 * 1024 * 1024))
  XCTAssertNoThrow(try StorageGuard.check(freeBytes: 500 * 1024 * 1024))
}
```

- [ ] **Step 2:** Run `cd modules/replay-camera/ios/Core && swift test` → FAIL (types not defined). Android: after `npx expo prebuild`, `cd android && ./gradlew projects` to find the module project name (expected `:replay-camera`), then `./gradlew :replay-camera:testDebugUnitTest` → FAIL.
- [ ] **Step 3:** Implement `SegmentRing` and `StorageGuard` in Swift and Kotlin. Use a plain array/`ArrayDeque`. Thread safety: guard every public method with a serial queue (Swift) / `@Synchronized` (Kotlin). Capture and save run on different threads.
- [ ] **Step 4:** Run both test commands → PASS.
- [ ] **Step 5: Commit** `feat(replay-camera): segment ring and storage guard`

---

### Task 3: X-gesture classifier and hold tracker (pure logic, both platforms)

**Files:**
- Create: `ios/Core/Sources/ReplayCore/XGesture.swift`, `ios/Core/Tests/ReplayCoreTests/XGestureTests.swift`
- Create: `android/.../core/XGesture.kt`, `android/src/test/.../core/XGestureTest.kt`

**Interfaces:**
- `struct Pose { leftWrist, rightWrist, leftShoulder, rightShoulder, nose: Point? }`. `Point { x, y, confidence }` is in image coordinates, with y growing downward.
- `XGesture.isX(_ p: Pose, minConfidence: Double = 0.3) -> Bool`
- `class HoldTracker(holdSeconds: Double = 1.0, cooldownSeconds: Double = 3.0)` with `update(isX: Bool, at t: Double) -> Bool`, which returns `true` exactly once when the pose has been held continuously for ≥ holdSeconds and is outside the cooldown.

Classifier rule (mirror-independent, so front and back camera behave the same):

```
all 5 points present with confidence >= minConfidence, else false
wristsUp  = leftWrist.y < nose.y && rightWrist.y < nose.y
crossed   = sign(leftWrist.x - rightWrist.x) != sign(leftShoulder.x - rightShoulder.x)
return wristsUp && crossed
```

- [ ] **Step 1: Write the failing tests** (same names in Kotlin)

```swift
func test_crossedArmsAboveHead_isTrue()    // shoulders L.x=60,R.x=40; wrists L.x=45,R.x=55, both y < nose.y
func test_armsUpNotCrossed_isFalse()       // wrists L.x=65,R.x=35 above nose (celebration)
func test_oneArmUp_isFalse()               // right wrist below nose
func test_lowConfidence_isFalse()          // nose confidence 0.1
func test_holdFiresOnceAfter1s() {
  let h = HoldTracker()
  XCTAssertFalse(h.update(isX: true, at: 0.0)); XCTAssertFalse(h.update(isX: true, at: 0.8))
  XCTAssertTrue(h.update(isX: true, at: 1.0));  XCTAssertFalse(h.update(isX: true, at: 1.4))
}
func test_brokenHoldResets() { /* true@0, false@0.5, true@0.6, true@1.4 → false; true@1.6 → true */ }
func test_cooldownBlocksFor3s() { /* fire at 1.0; release; hold again 1.5→2.6 → false (cooldown until 4.0); hold 4.0→5.0 → true */ }
```

- [ ] **Step 2:** `swift test` and `./gradlew :replay-camera:testDebugUnitTest` → FAIL.
- [ ] **Step 3:** Implement `XGesture` and `HoldTracker` on both platforms.
- [ ] **Step 4:** Both test commands → PASS.
- [ ] **Step 5: Commit** `feat(replay-camera): X gesture classifier and hold tracker`

---

### Task 4: JS interface and preview view

**Files:**
- Modify: `modules/replay-camera/src/ReplayCamera.types.ts`, `src/ReplayCameraModule.ts`, `src/ReplayCameraView.tsx`, `index.ts`
- Create: `modules/replay-camera/src/__tests__/ReplayCamera.test.ts`

**Interfaces (produced, used by Task 7 and Plan 2):**

```ts
export type Lens = 'ultraWide' | 'wide';
export type Quality = '1080p60' | '720p30';
export type TriggerSource = 'screen' | 'gesture' | 'remote' | 'watch';
export type ReplayErrorCode = 'LOW_STORAGE' | 'CAMERA_PERMISSION' | 'CAMERA_UNAVAILABLE' | 'ENCODER_FAILED' | 'NO_SESSION';
export type ReplayEvents = {
  onTrigger: (e: { source: TriggerSource; at: number }) => void;          // at = ms since epoch
  onThermalChange: (e: { level: 'nominal' | 'fair' | 'serious' | 'critical'; degraded: boolean }) => void;
  onInterrupted: () => void;
  onResumed: () => void;
  onError: (e: { code: ReplayErrorCode; message: string }) => void;
};
startSession(opts: { lens: Lens; maxQuality: Quality }): Promise<void>
stopSession(): Promise<void>
saveClip(opts: { source: TriggerSource; at: number }): Promise<{ clipPath: string; durationMs: number }>
setGestureEnabled(enabled: boolean): void
export function ReplayCameraView(props: ViewProps): JSX.Element   // native preview, fills its frame
```

- [ ] **Step 1: Write the failing test:** mock `requireNativeModule` and assert that `saveClip({source:'screen', at: 1})` forwards the same object and resolves `{clipPath, durationMs}`, and that `startSession` rejects with `code: 'LOW_STORAGE'` when native rejects with it.
- [ ] **Step 2:** `npm test -- ReplayCamera` → FAIL.
- [ ] **Step 3:** Write the types and wrapper exactly as above. Replace the template's example functions in Swift/Kotlin `ReplayCameraModule` with stubs that reject `NO_SESSION`. Declare `Events("onTrigger","onThermalChange","onInterrupted","onResumed","onError")` and a `View(ReplayCameraView)`.
- [ ] **Step 4:** `npm test -- ReplayCamera` → PASS. `npx tsc --noEmit` → no errors.
- [ ] **Step 5: Commit** `feat(replay-camera): typed JS interface and preview view`

---

### Task 5: iOS capture, buffer and save

**Files:**
- Create: `modules/replay-camera/ios/CaptureController.swift` (AVCaptureSession, device/lens/format, preview layer)
- Create: `modules/replay-camera/ios/SegmentWriter.swift` (AVAssetWriter → fMP4 segments)
- Create: `modules/replay-camera/ios/ClipConcat.swift` (init segment + media segments → `.mp4`)
- Modify: `modules/replay-camera/ios/ReplayCameraModule.swift`, `ReplayCameraView.swift`

**Interfaces:**
- Consumes: `SegmentRing`, `StorageGuard` (Task 2); the JS contract (Task 4).
- Produces: working `startSession` / `stopSession` / `saveClip` and the preview on iOS.

- [ ] **Step 1:** `CaptureController`: pick `.builtInUltraWideCamera` for `ultraWide` (fall back to `.builtInWideAngleCamera`), choose an active format of 1920x1080 at 60fps (fall back to 30), audio input, and `AVCaptureVideoDataOutput` + `AVCaptureAudioDataOutput` on one serial queue.
- [ ] **Step 2:** `SegmentWriter`: `AVAssetWriter(contentType: .mpeg4Movie)` with `outputFileTypeProfile = .mpeg4AppleHLS`, `preferredOutputSegmentInterval = .indefinite`, `initialSegmentStartTime` = first sample time, H.264 with keyframes every 1s (`AVVideoMaxKeyFrameIntervalDurationKey: 1`). A 2s timer calls `flushSegment()`. The `assetWriter(_:didOutputSegmentData:segmentType:segmentReport:)` delegate writes `.initialization` data to `replay-buffer/init.mp4` and each `.separable` segment to `replay-buffer/<n>.m4s`, then calls `ring.append`. **Verify first:** `flushSegment()` requires the next appended sample to be a sync sample. If the writer's own encoder doesn't guarantee that, encode with `VTCompressionSession` (force a keyframe with `kVTEncodeFrameOptionKey_ForceKeyFrame` right after each flush) and append compressed samples to a passthrough input (`outputSettings: nil`).
- [ ] **Step 3:** `saveClip`: call `flushSegment()` first, so the clip ends at the trigger, wait for that segment's delegate callback, then `ring.copyClip(lastSeconds: 60, to: documents/clips/<uuid>.mp4, concat: ClipConcat.concat)`. `ClipConcat.concat` writes `init.mp4` bytes followed by each `.m4s` in order. Resolve `{clipPath, durationMs}`.
- [ ] **Step 4:** `startSession`: check camera permission (`CAMERA_PERMISSION`), `StorageGuard.check(volumeAvailableCapacityForImportantUsage)`, `SegmentRing.purgeOrphans(replay-buffer/)`, then start. `stopSession`: stop the writer and call `ring.clear()`.
- [ ] **Step 5: Device check (iPhone):** run the spike screen from Task 7 (or a temporary button). Start, wait 90s, save → the clip plays in Files/QuickTime, lasts 58–60s, and its last frame is within 0.5s of the button press (film a phone stopwatch). Save at 10s → a ~10s clip. Watch `replay-buffer/` in the Xcode container: it never exceeds 31 files.
- [ ] **Step 6: Commit** `feat(replay-camera): iOS capture, rolling buffer and saveClip`

---

### Task 6: Android capture, buffer and save

**Files:**
- Create: `android/.../CaptureController.kt` (Camera2: lens pick, 1080p60 or fallback, preview Surface + encoder input Surface)
- Create: `android/.../SegmentEncoder.kt` (MediaCodec H.264 + AAC → one MediaMuxer `.mp4` per segment)
- Create: `android/.../ClipConcat.kt` (concatenate segment MP4s with MediaExtractor + MediaMuxer, no re-encode)
- Modify: `android/.../ReplayCameraModule.kt`, `ReplayCameraView.kt`

**Interfaces:** same as Task 5, for Android.

- [ ] **Step 1:** `CaptureController`: pick the ultra-wide by the smallest focal length among back cameras (`LENS_INFO_AVAILABLE_FOCAL_LENGTHS`). Use 1920x1080 with a 60fps range if `CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES` contains [60,60], else 30. Two output surfaces: `ReplayCameraView`'s `TextureView` and `encoder.createInputSurface()`.
- [ ] **Step 2:** `SegmentEncoder`: `KEY_I_FRAME_INTERVAL = 1`. Every 2s, and immediately on save, request a sync frame (`PARAMETER_KEY_REQUEST_SYNC_FRAME`). When the next keyframe arrives, stop the current `MediaMuxer` (`replay-buffer/<n>.mp4`), call `ring.append`, and start a new muxer with that keyframe first. Audio: AAC `MediaCodec` from `AudioRecord`, written to the same muxer, with timestamps from the same clock.
- [ ] **Step 3:** `saveClip`: force a cut (Step 2), wait for the segment to close, then `ring.copyClip(60, files/clips/<uuid>.mp4, ClipConcat::concat)`. `ClipConcat` remuxes the samples of each segment in order, offsetting presentation times by the accumulated duration.
- [ ] **Step 4:** `startSession` / `stopSession`: same rules as iOS (permission, `StatFs(cacheDir).availableBytes` → `StorageGuard`, `purgeOrphans`, `clear`).
- [ ] **Step 5: Device check (Android mid-range):** same checks as Task 5 Step 5. Also confirm there is no visible jump between segments in the saved clip.
- [ ] **Step 6: Commit** `feat(replay-camera): Android capture, rolling buffer and saveClip`

---

### Task 7: Gesture, thermal, interruptions and spike screen

**Files:**
- Create: `ios/GestureDetector.swift` (`VNDetectHumanBodyPoseRequest` on frames sampled at 5 fps → `Pose` → `XGesture` + `HoldTracker`)
- Create: `android/.../GestureDetector.kt` (ML Kit `PoseDetection` stream mode at 5 fps from an `ImageReader` 640x360 third surface → same logic). Add `com.google.mlkit:pose-detection` to the module `build.gradle`. If the device rejects 3 surfaces at 1080p60 (stream-combination limit), drop the `ImageReader` and sample `textureView.getBitmap(640, 360)` at 5 fps instead.
- Modify: both `ReplayCameraModule` files (thermal observers, interruption observers, `setGestureEnabled`, events)
- Create: `app/app/index.tsx` (spike screen; replace the template's tabs), `app/app/_layout.tsx` (single Stack)
- Create: `docs/superpowers/field-test-etapa0.md` (protocol + results table)

**Interfaces:**
- Consumes: Tasks 2–6.
- Produces: the `onTrigger({source:'gesture'})` event (which calls `saveClip` from JS in the spike), `onThermalChange`, `onInterrupted` / `onResumed`.

- [ ] **Step 1:** Gesture on both platforms: when `HoldTracker.update` returns true, emit `onTrigger({ source: 'gesture', at: Date.now() })`. Only run while `setGestureEnabled(true)` is set (default true).
- [ ] **Step 2:** Thermal: iOS `ProcessInfo.thermalStateDidChangeNotification`; Android `PowerManager.addThermalStatusListener` (API 29+, otherwise skip). At ≥ serious/SEVERE, reconfigure to 720p30 (close the current segment first, so the ring stays continuous) and emit `{level, degraded: true}`. Do not restore 1080p until `stopSession`. At `critical` (Android `THERMAL_STATUS_CRITICAL`+), call `stopSession()` (saved clips are untouched) and emit `{level: 'critical', degraded: true}` followed by `onError({code: 'ENCODER_FAILED', message: 'thermal'})`, so the UI can explain why it stopped.
- [ ] **Step 3:** Interruptions: iOS `AVCaptureSession.wasInterruptedNotification` / `interruptionEndedNotification`; Android camera `onDisconnected` and the app lifecycle pause/resume. On interrupt: `ring.clear()` and emit `onInterrupted`. On resume: restart capture and emit `onResumed`. Saved clips are untouched.
- [ ] **Step 4:** Spike screen `app/app/index.tsx`: full-screen `ReplayCameraView`; Start/Stop; a large "Salvar" button; on `onTrigger` call `saveClip`. Show live values: elapsed time, clips saved, last `durationMs`, trigger count by source, thermal level, and the total size of `replay-buffer/` (via `expo-file-system`, refreshed every 5s). Keep the screen awake with `expo-keep-awake`.
- [ ] **Step 5: Device check:** stand ~8m away. Arms crossed above the head for 1s → one save. Arms up without crossing, for 5 tries → no save. Hold the X for 4s → one save only (cooldown). Simulate heat (Xcode → Devices → Condition → Thermal State: Serious) → 720p30 with the event shown.
- [ ] **Step 6:** Write `docs/superpowers/field-test-etapa0.md` with the protocol: 2h session per device, in direct sun, on a sand court; 1 deliberate X every ~5 min (24 total); log every save. Pass criteria (spec §9): no recording drop in 2h; ≥ 22/24 X detected; ≤ 2 false triggers in 2h; `replay-buffer/` ≤ 100 MB the whole time; no forced shutdown from heat. Leave a results table per device: device, OS, duration, X detected/24, false triggers, max buffer MB, thermal peak, notes.
- [ ] **Step 7: Commit** `feat(replay-camera): gesture trigger, thermal degrade, interruptions and spike screen`

---

### Task 8: Field test and go/no-go

**Files:**
- Modify: `docs/superpowers/field-test-etapa0.md` (results)

- [ ] **Step 1:** Install release builds: `npx expo run:ios --configuration Release --device` and `npx expo run:android --variant release --device`.
- [ ] **Step 2:** Run the protocol from Task 7 Step 6 on both devices.
- [ ] **Step 3:** Fill in the results table and write one line of verdict: **go** (all criteria pass) or **adjust** (name which criterion failed and the fallback the spec allows: 720p-only on Android, gesture with confirmation).
- [ ] **Step 4: Commit** `docs: Etapa 0 field test results`
