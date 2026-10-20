# Watch Control and Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start/stop recordings from the Apple Watch and keep the watch in sync (no flapping, instant state on wrist raise) via a workout session.

**Architecture:** Pure rules live in `WatchModel` (tested with `swift test`). `WatchMessage` gains `.start`/`.stop`; the phone bridge maps them to the existing `onRemoteStart`/`onRemoteStop` events. A new `WorkoutKeeper` runs an `HKWorkoutSession` while the phone records; `WatchLink` caches state and applies an offline grace.

**Tech Stack:** Swift/SwiftUI (watchOS 11), WatchConnectivity, HealthKit, Expo apple-targets, XCTest via `swift test` in `app/modules/replay-camera/ios/Core`.

**Spec:** `docs/superpowers/specs/2026-10-20-watch-control-and-sync-design.md`

## Global Constraints
- `app/targets/watch/WatchMessage.swift` is a symlink to `ReplayCore/WatchMessage.swift`; `WatchModel.swift` is symlinked into the ReplayCore tests. Edit the real files only.
- Workout session activity type `.other`; no live metrics/builder collection.
- Start/stop payloads: `["cmd": "start"]`, `["cmd": "stop"]`.
- `offlineGrace` = 10 s; existing `heartbeat` 5 s, `staleAfter` 12 s.
- UI copy in Portuguese, matching `ContentView.swift`.
- Stop requires press-and-hold (no single-tap stop).

## Review Focus
- Start sent while the phone is already recording → phone ignores it (no second recording).
- Stop/start sent while unreachable → no send, failure haptic, no crash.
- Unreachable for < 10 s during a recording → screen stays `.recording`, not `.offline`.
- Recording ends (or state goes stale) while the workout session runs → session always ends (no orphan session draining battery).
- Malformed/unknown `cmd` payloads → decode returns nil, nothing emitted.

---

### Task 1: Protocol — `.start` and `.stop`

**Files:**
- Modify: `app/modules/replay-camera/ios/Core/Sources/ReplayCore/WatchMessage.swift`
- Test: `app/modules/replay-camera/ios/Core/Tests/ReplayCoreTests/WatchMessageTests.swift`

**Interfaces:**
- Produces: `WatchMessage.start`, `WatchMessage.stop` (watch → phone), payload `["cmd": "start"|"stop"]`, decoded by `WatchMessage.decode`.

- [ ] **Step 1: Failing tests** in `WatchMessageTests`: `testStartStopKeys` (`.start.payload["cmd"] == "start"`, `.stop.payload["cmd"] == "stop"`), round-trip through `decode`, and `decode(["cmd": "delete"])` still nil.
- [ ] **Step 2:** Run `cd app/modules/replay-camera/ios/Core && swift test --filter WatchMessageTests`. Expected: compile FAIL (no `.start`).
- [ ] **Step 3:** Add the cases and extend the `cmd` switch in `payload`/`decode`; update the doc comments.
- [ ] **Step 4:** Re-run; Expected: PASS.
- [ ] **Step 5:** Commit `feat(watch): start/stop messages`.

### Task 2: Pure rules in `WatchModel`

**Files:**
- Modify: `app/targets/watch/WatchModel.swift`
- Test: `app/modules/replay-camera/ios/Core/Tests/ReplayCoreTests/WatchModelTests.swift`

**Interfaces:**
- Produces:
  - `static let offlineGrace = 10.0`
  - `static func screen(recording:reachable:clipCount:startedAtMs:stateAge:unreachableFor: Double) -> WatchScreen` (replaces the old signature; `.offline` when recording and (`stateAge > staleAfter` or `!reachable && unreachableFor >= offlineGrace`))
  - `static func workoutWanted(recording: Bool, stale: Bool) -> Bool` (true only when recording and not stale)
  - `static func canStart(recording: Bool, reachable: Bool) -> Bool` (idle and reachable)
  - `static func canStop(recording: Bool, reachable: Bool) -> Bool` (recording and reachable)

- [ ] **Step 1: Failing tests:** update existing `screen` tests for the new argument; add `testShortDropoutKeepsRecording` (unreachable 4 s → `.recording`), `testLongDropoutIsOffline` (unreachable 10 s → `.offline`), `testStaleStateIsOfflineEvenIfReachable`, `testWorkoutWantedOnlyWhileFreshRecording`, `testCanStartOnlyIdleAndReachable`, `testCanStopOnlyRecordingAndReachable`.
- [ ] **Step 2:** `swift test --filter WatchModelTests`. Expected: FAIL.
- [ ] **Step 3:** Implement as listed in Interfaces.
- [ ] **Step 4:** Re-run; Expected: PASS.
- [ ] **Step 5:** Commit `feat(watch): offline grace and command rules`.

### Task 3: Phone bridge routes start/stop

**Files:**
- Modify: `app/modules/replay-camera/ios/WatchBridge.swift` (`session(_:didReceiveMessage:)`)

**Interfaces:**
- Consumes: `WatchMessage.start/.stop` (Task 1). Produces events `onRemoteStart` / `onRemoteStop` with `[:]` body (already declared in `ReplayCamera.types.ts`).

- [ ] **Step 1:** Add `case .start?: emit?("onRemoteStart", [:])` and `case .stop?: emit?("onRemoteStop", [:])`.
- [ ] **Step 2:** Verify JS side already ignores `onRemoteStart` while recording (`src/app/setup.tsx:160`); if it does not, add the guard there with a jest test in `src/app/__tests__`. Run `cd app && npx jest src/app` ; Expected: PASS.
- [ ] **Step 3:** Commit `feat(watch): phone handles watch start/stop`.

### Task 4: `WorkoutKeeper` (watch)

**Files:**
- Create: `app/targets/watch/WorkoutKeeper.swift`
- Modify: `app/targets/watch/expo-target.config.js` (add `'HealthKit'` to `frameworks`; HealthKit entitlement; `NSHealthShareUsageDescription` / `NSHealthUpdateUsageDescription` strings in Portuguese; `UIBackgroundModes: ['workout-processing']`)

**Interfaces:**
- Produces: `final class WorkoutKeeper { func setActive(_ on: Bool) }` — idempotent; `true` requests HealthKit authorization once and starts an `HKWorkoutSession` (`.other`, no builder); `false` ends it and is safe when none exists.

- [ ] **Step 1:** Implement `WorkoutKeeper` with `HKHealthStore.startWorkoutSession`-style API (`HKWorkoutSession(healthStore:configuration:)`, `startActivity(with:)`, `end()`); errors are swallowed (sync degrades to today's behavior).
- [ ] **Step 2:** Update `expo-target.config.js` as above; run `cd app && npx expo prebuild --platform ios --no-install` and confirm the watch target lists HealthKit and the usage strings.
- [ ] **Step 3:** Commit `feat(watch): workout session keeper`.

### Task 5: `WatchLink` wiring (cache, grace, commands, workout)

**Files:**
- Modify: `app/targets/watch/WatchLink.swift`

**Interfaces:**
- Consumes: `WatchModel.screen(...unreachableFor:)`, `workoutWanted`, `canStart`, `canStop` (Task 2); `WatchMessage.start/.stop` (Task 1); `WorkoutKeeper` (Task 4).
- Produces: `func sendStart()`, `func sendStop()` for the UI.

- [ ] **Step 1:** Track `unreachableSince: Date?` (set in `refresh()` when `!isReachable`, cleared when reachable); pass `unreachableFor` to `WatchModel.screen`.
- [ ] **Step 2:** In `refresh()` call `keeper.setActive(WatchModel.workoutWanted(recording: recording, stale: stateAge > WatchModel.staleAfter))` so the session always ends when recording ends or goes stale.
- [ ] **Step 3:** On `activationDidCompleteWith` and when the scene becomes active, apply `receivedApplicationContext` immediately (cached state shown at once). Keep the 2 s aging timer.
- [ ] **Step 4:** Implement `sendStart()` / `sendStop()`: guard with `canStart/canStop`, `.failure` haptic when unreachable, otherwise `sendMessage(WatchMessage.start/.stop.payload, ...)` with the same error handler as `sendSave`.
- [ ] **Step 5:** Commit `feat(watch): cached state, offline grace, workout session`.

### Task 6: UI — Gravar and hold-to-stop

**Files:**
- Modify: `app/targets/watch/ContentView.swift`

**Interfaces:**
- Consumes: `WatchLink.sendStart()`, `sendStop()`.

- [ ] **Step 1:** Idle screen: `Message("Comece a gravar no iPhone")` becomes the message plus a "Gravar" button (same style as `SaveButton`) calling `link.sendStart`; hide the button text hint when unreachable ("Sem conexão com o iPhone").
- [ ] **Step 2:** Recording screen (non-camera): add a "Parar" control with `.onLongPressGesture(minimumDuration: 1)` calling `link.sendStop`; a short tap shows a hint "Segure para parar". Keep Save and camera toggle unchanged; update the `#Preview`s.
- [ ] **Step 3:** Build: `cd app && npx expo run:ios` or Xcode build of the watch scheme succeeds.
- [ ] **Step 4:** Commit `feat(watch): start and hold-to-stop controls`.

### Task 7: Full verification

- [ ] **Step 1:** `cd app/modules/replay-camera/ios/Core && swift test`; Expected: all pass.
- [ ] **Step 2:** `cd app && npx jest`; Expected: all pass.
- [ ] **Step 3:** On a real watch, check: raise wrist after 30 s idle returns to the app showing the current time/count with no "sem conexão"; start from watch then stop from watch; start while phone already recording does nothing; battery over about 1 h. Report results (these cannot be run in the simulator).
