# Apple Watch: start/stop control and resilient sync

## Goal
Make the watch usable as a full remote during a game, like the phone remote:
1. Start a new recording and end the current one from the watch (keeping Save and the camera view).
2. Fix sync: raising the wrist shows the current state immediately, without reopening the app or waiting for sync, and the link stops flapping between connected/disconnected.

## Current behaviour (why it flaps)
- Watch state depends on `WCSession.isReachable`. When the wrist drops, watchOS suspends the app; on raise it must reactivate and wait for reachability plus the next phone state message. `WatchModel.screen` shows `.offline` (or `.idle`) in the meantime.
- `WatchBridge` (phone) heartbeats state every 5 s; the watch calls state older than `staleAfter` (12 s) offline.

## Decision
Run an `HKWorkoutSession` on the watch for exactly as long as the phone is recording. watchOS keeps a workout app running in the background and returns to it on wrist raise, which is the "fitness app" behaviour requested. Chosen with the user over a no-HealthKit cache/reconnect-only approach, which cannot beat suspension.

## Design

### 1. Watch lifecycle (sync)
- New `WorkoutKeeper` (watch target): starts an `HKWorkoutSession` (activity type `.other`; no live builder/metrics, to keep battery cost low) when a `state(recording: true)` is applied; ends it when the recording ends or the state goes stale/offline for good.
- Start trigger when the app is not running: the phone already pushes `updateApplicationContext`; the app starts the session on first activation with `recording == true`. If watchOS does not launch the app from the context update, the first raise is a one-time manual open (known limitation; verify on device).
- `WatchLink` caches the last state (also persisted via `receivedApplicationContext`) and renders it at once on activation instead of waiting for a new message.
- Offline grace: `.offline` appears only after the phone has been unreachable for `offlineGrace` (~10 s), so brief flickers do not change the screen. `staleAfter` stays tied to `heartbeat`; both live in `WatchModel` and are tuned together.
- Phone `WatchBridge` also pushes state on `sessionReachabilityDidChange` / watch activation (already does) and keeps the 5 s heartbeat while recording.

### 2. Controls
- Idle screen: "Gravar" button → `WatchMessage.start`. Disabled with "Sem conexão com o iPhone" when unreachable. No effect if the phone is already recording (same rule as `RemoteMessage.start`).
- Recording screen: Stop via press-and-hold (or confirm) → `WatchMessage.stop`, so a mis-tap cannot end a game. Save (tap) and camera view are unchanged.
- Protocol: `WatchMessage` gains `.start` and `.stop` (`["cmd": "start"|"stop"]`), in both `ReplayCore/WatchMessage.swift` and `targets/watch/WatchMessage.swift`; `WatchMessageTests` pins the keys.
- Phone: `WatchBridge.didReceiveMessage` emits the existing `onRemoteStart` / `onRemoteStop` events, so JS handles them on the same path as the phone remote. No new JS surface.

### 3. Testing and risks
- Pure rules in `WatchModel` (offline grace, when to start/end the workout session, which commands are allowed in which screen) are covered by `swift test` in ReplayCore.
- Config: add `HealthKit` to `frameworks` in `targets/watch/expo-target.config.js`, the HealthKit capability/entitlement, and `NSHealthShareUsageDescription` / `NSHealthUpdateUsageDescription` strings; `UIBackgroundModes: workout-processing` on the watch target.
- Device-only checks (cannot be verified in simulator): wrist-raise returns to app; session starts after a phone-initiated recording; battery over a ~1 h game; App Review justification for HealthKit use.

## Out of scope
Recording on the watch itself, health metrics, complications.
