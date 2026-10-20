# Phone Remote ("Controle" on a second iPhone) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A second iPhone running LANCE becomes a big "SALVAR" button for the iPhone that is filming; a tap saves a clip exactly like a tap on the screen, the watch or a Bluetooth remote.

**Architecture:** The camera phone ("host") advertises over MultipeerConnectivity; the remote phone ("controller") finds it, proves it knows a shared secret or key, and sends `save`. The host turns that into the existing `onTrigger({ source: 'phone' })` event, so the trigger bus, saving, sound/flash and the clip list are unchanged. Pure logic (wire format, proofs, pairing offer, trusted list) lives in `ios/Core` with `swift test`; the remote screen's state is a TypeScript pure function; Multipeer, Keychain and QR rendering are thin Swift glue verified on two phones. Android is out of scope.

**Tech Stack:** Swift (SwiftPM `ReplayCore`, CryptoKit, MultipeerConnectivity, Security/Keychain, CoreImage), Expo Module `ReplayCamera`, expo-router, React Native, Jest + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-10-19-phone-remote-design.md` (the plan follows its section numbers as §n).

## Global Constraints

- **Scope:** iPhone to iPhone only. On Android (module functions missing) the "Celular" tile and the "Usar este celular como controle" button are hidden. No in-app QR scanner, no live preview on the remote, no background operation.
- **Transport:** MultipeerConnectivity, service type `lance-remote`, `encryptionPreference: .required`. Info.plist: `NSLocalNetworkUsageDescription` and `NSBonjourServices` = `["_lance-remote._tcp", "_lance-remote._udp"]`.
- **Pairing numbers (§5):** offer valid 120 s; 5 wrong attempts lock the offer; secret 16 random bytes; code 6 digits; `pairKey` 32 random bytes; proof = lowercase hex HMAC-SHA256 over `"<purpose>|<Int64 ms>|<remoteId>"`, accepted within ±60 s; at most 4 trusted peers; remote stale after 12 s without state; host repeats state every 5 s while recording.
- **QR link:** `lance://pair?h=<hostId>&s=<secret, base64url without padding>&n=<hostName, percent-encoded>`. The `lance` scheme already exists.
- **Trigger source:** `'phone'`, label `Celular`.
- **A failed proof never deletes a pair.** Only an explicit `unpaired` message from the host makes the remote forget it (§5.3).
- **Copy (pt-BR, exact):** the strings in spec §6.1 and §6.2, plus the 4-remote limit line added to §6.1. The pairing sheet instruction about the **Camera app of the remote phone** must always be visible above the QR.
- **Terminology:** "controle" for the remote phone, "celular da câmera" for the filming phone; "clipe" and "gravação" in new text.
- **Code style:** no optional chaining (`?.`) in new TypeScript (the user's IDE flags it); use explicit checks. Follow the existing patterns (`WatchMessage`, `WatchBridge`, `SOURCE_LABEL`).
- **Process:** TDD for Core and JS. The Jest and `swift test` runs happen on the user's Mac (this VM cannot run either); the executor writes test and code, then asks the user to run the command and paste the result. Never run git write commands: each "Commit checkpoint" step only proposes a message for the user to commit. New Swift files under `ios/` need `cd app/ios && pod install` before building.

## Review Focus

- Garbage from a stranger (malformed JSON, unknown keys, a `save` with extra junk, a hello with a bad `kind`) never saves a clip or crashes: Task 1 decode tests.
- Two remotes (or one remote double-tapping) within 3 s save one clip: Task 5 hook test.
- A `save` arriving while the camera phone is not recording saves nothing and does not use up the debounce: Task 5 hook test (the hook already gates `onTrigger`; the test pins it for `phone`).
- A wrong clock (proof outside ±60 s) is rejected as "Sem conexão", not as unpaired: Task 2 test plus Task 7 rule.
- An expired or locked offer cannot be revived by a correct proof; a new offer starts clean: Task 3 tests.
- A malformed or tampered QR link opens `/pair` with a clear error instead of a crash: Task 6 tests and Task 11 test.
- The controller screen with no pair shows how to pair instead of an empty screen: Task 11 test.
- A fifth trusted remote is refused with a clear message: Task 4 test and Task 10 test.

---

### Task 1: Wire format (`RemoteMessage`, `RemoteHello`)

**Files:**
- Create: `app/modules/replay-camera/ios/Core/Sources/ReplayCore/RemoteMessage.swift`
- Test: `app/modules/replay-camera/ios/Core/Tests/ReplayCoreTests/RemoteMessageTests.swift`

**Interfaces:**
- Produces:
  - `public enum RemoteMessage: Equatable { case save; case state(recording: Bool, clipCount: Int, startedAt: Double?); case result(saved: Bool); case paired(hostId: String, hostName: String, pairKey: Data); case unpaired; case refused(reason: Reason) }` with `public enum Reason: String { case expired, locked, wrong }` nested in `RemoteMessage`; and `RemoteMessage` has `public var payload: [String: Any]`, `public static func decode(_ payload: [String: Any]) -> RemoteMessage?`, `public var data: Data` (JSON of `payload`), `public static func decode(data: Data) -> RemoteMessage?`.
  - `public struct RemoteHello: Equatable { public enum Kind: String { case pair, reconnect }; public let kind: Kind; public let remoteId: String; public let remoteName: String; public let proof: String; public let at: Double }` with `public var data: Data`, `public static func decode(data: Data) -> RemoteHello?`. `at` is ms since 1970.

- [ ] **Step 1: Write the failing tests** in `RemoteMessageTests` (XCTest, `@testable import ReplayCore`, style of `WatchMessageTests`):
  - `testKeysAreFixed`: `.save.payload["cmd"] == "save"`; `.state` payload keys equal `["recording","clipCount","startedAt"]` (the same keys as `WatchMessage.state`); `.result(saved: true).payload["result"] == "saved"`, `false` gives `"failed"`; `.unpaired.payload["unpaired"] == true`; `.refused(reason: .locked).payload["refused"] == "locked"`; `.paired` payload has `"paired"` dictionary with keys `hostId`, `hostName`, `key` (base64 string).
  - `testRoundTrips`: every case (state with and without `startedAt`, both results, `.paired` with a 32-byte key) survives `decode(payload)` and `decode(data:)`; a `RemoteHello` of each `Kind` survives `data` then `decode(data:)`.
  - `testDecodeRejectsAnythingMalformed`: `[:]`, `["cmd":"delete"]`, `["recording":true,"clipCount":"3"]`, `["recording":true,"clipCount":-1]`, `["result":"maybe"]`, `["unpaired":false]`, `["refused":"other"]`, `paired` with a missing field, a key that is not base64, a key not 32 bytes; `decode(data: Data("[1,2]".utf8))`, `decode(data: Data("nope".utf8))`, and `RemoteHello` with `kind: "other"`, a missing `proof`, or a non-numeric `at` all return nil.

- [ ] **Step 2: Run** `cd app/modules/replay-camera/ios/Core && swift test --filter RemoteMessageTests`. Expected: build error, `RemoteMessage` not defined.

- [ ] **Step 3: Implement** both types in `RemoteMessage.swift` with the interfaces above, mirroring `WatchMessage.swift` (decode returns nil for anything unknown; `Int` and `Double` decode from JSON numbers). Keys: `hello` payload `{kind, remoteId, remoteName, proof, at}`.

- [ ] **Step 4: Run** the same command. Expected: `RemoteMessageTests` pass.

- [ ] **Step 5: Commit checkpoint** (user): `feat(remote): wire format for the phone remote`.

### Task 2: Proofs (`RemoteProof`)

**Files:**
- Create: `app/modules/replay-camera/ios/Core/Sources/ReplayCore/RemoteProof.swift`
- Test: `app/modules/replay-camera/ios/Core/Tests/ReplayCoreTests/RemoteProofTests.swift`

**Interfaces:**
- Produces: `public enum RemoteProof { public enum Purpose: String { case pair, reconnect }; public static let window = 60.0; public static func make(key: Data, purpose: Purpose, remoteId: String, at: Double) -> String; public static func verify(_ proof: String, key: Data, purpose: Purpose, remoteId: String, at: Double, now: Double) -> Bool }`. `at` and `now` are ms since 1970; `window` is seconds.

- [ ] **Step 1: Write the failing tests:**
  - `testKnownVectors`: key `Data("key".utf8)`, remoteId `"remote-1"`, at `1_700_000_000_000`: `.pair` gives `91384218a210d76de17540fd2bb2f7580ec1f998f8aadc966b67f8cf49ed1819`, `.reconnect` gives `78a813f8d7812c2c62d17ad5f50c76769e5c477e47c509fd8c1c04f02705d67c` (computed independently with Python `hmac`).
  - `testVerifyAcceptsInsideTheWindow`: `now` equal to `at`, `at + 59_000` and `at - 59_000` verify.
  - `testVerifyRejectsOutsideTheWindow`: `now = at + 61_000` and `at - 61_000` fail (clock skew).
  - `testVerifyRejectsAnyMismatch`: wrong key, other `remoteId`, other purpose, a proof with one character changed, an empty proof, and a proof of the wrong length all fail.

- [ ] **Step 2: Run** `swift test --filter RemoteProofTests`. Expected: build error, `RemoteProof` not defined.

- [ ] **Step 3: Implement** with CryptoKit `HMAC<SHA256>`; message `"\(purpose.rawValue)|\(Int64(at))|\(remoteId)"`; hex lowercase; compare in constant time (`HMAC.isValidAuthenticationCode` on the decoded bytes, or a manual XOR loop).

- [ ] **Step 4: Run** the same command. Expected: pass.

- [ ] **Step 5: Commit checkpoint** (user): `feat(remote): HMAC proofs for pairing and reconnecting`.

### Task 3: Pairing offer (`PairingOffer`)

**Files:**
- Create: `app/modules/replay-camera/ios/Core/Sources/ReplayCore/PairingOffer.swift`
- Test: `app/modules/replay-camera/ios/Core/Tests/ReplayCoreTests/PairingOfferTests.swift`

**Interfaces:**
- Consumes: `RemoteProof` (Task 2).
- Produces: `public struct PairingOffer { public static let validFor = 120.0; public static let maxAttempts = 5; public enum Verdict: Equatable { case accepted, wrongProof(attemptsLeft: Int), expired, locked }; public let hostId: String; public let hostName: String; public let secret: Data; public let code: String; public let createdAt: Double /* ms */; public private(set) var failedAttempts: Int; public init(hostId: String, hostName: String, secret: Data, code: String, createdAt: Double); public static func make(hostId: String, hostName: String, now: Double) -> PairingOffer; public mutating func check(proof: String, remoteId: String, at: Double, now: Double) -> Verdict; public func secondsLeft(now: Double) -> Double; public var qrURL: String }`.

- [ ] **Step 1: Write the failing tests** (a helper builds the proof with `RemoteProof.make(key:purpose: .pair, ...)`):
  - `testAcceptsAProofMadeWithTheSecret` and `testAcceptsAProofMadeWithTheCode` (key `Data(code.utf8)`).
  - `testAWrongProofCountsAnAttempt`: five wrong proofs return `.wrongProof(attemptsLeft: 4)` down to `0`; the sixth call, even with a correct proof, returns `.locked`.
  - `testExpiresAfter120Seconds`: a correct proof at `createdAt + 119_000` is accepted; at `createdAt + 121_000` returns `.expired`; `secondsLeft` is `120` at creation and `0` when expired, never negative.
  - `testALockedOrExpiredOfferStaysDead`: after `.locked`, a correct proof still returns `.locked`.
  - `testMakeProducesFreshSecretsAndCodes`: two `make` calls differ in `secret`; each `code` has 6 digits (leading zeros allowed); `failedAttempts == 0`.
  - `testQrURLIsPinned`: `hostId "h1"`, secret bytes `0...15`, name `"Quadra 1"` give exactly `lance://pair?h=h1&s=AAECAwQFBgcICQoLDA0ODw&n=Quadra%201` (the Task 6 TypeScript test parses this same string).

- [ ] **Step 2: Run** `swift test --filter PairingOfferTests`. Expected: build error.

- [ ] **Step 3: Implement.** Order inside `check`: expired, then locked, then verify (secret key, then code key); only a failed verify increments `failedAttempts`. `make` uses `SystemRandomNumberGenerator` (secret 16 bytes; code from a random `UInt32` modulo 1_000_000, zero-padded). `qrURL` percent-encodes `hostName` (`.urlQueryAllowed` minus `&=+`) and encodes the secret as base64url without padding.

- [ ] **Step 4: Run** the same command. Expected: pass.

- [ ] **Step 5: Commit checkpoint** (user): `feat(remote): pairing offer with expiry and attempt lock`.

### Task 4: Trusted peers (`TrustedPeers`)

**Files:**
- Create: `app/modules/replay-camera/ios/Core/Sources/ReplayCore/TrustedPeers.swift`
- Test: `app/modules/replay-camera/ios/Core/Tests/ReplayCoreTests/TrustedPeersTests.swift`

**Interfaces:**
- Produces: `public struct TrustedPeer: Equatable { public let id: String; public let name: String; public let key: Data; public init(id:name:key:) }`; `public protocol PeerKeyStore { func load() -> [TrustedPeer]; func save(_ peers: [TrustedPeer]) }`; `public final class TrustedPeers { public static let limit = 4; public init(store: PeerKeyStore); public var all: [TrustedPeer] { get }; public func peer(id: String) -> TrustedPeer?; @discardableResult public func add(_ peer: TrustedPeer) -> Bool; public func remove(id: String) }`. The same type serves the host (trusted remotes) and the controller (trusted hosts).

- [ ] **Step 1: Write the failing tests** with an in-memory `PeerKeyStore` fake:
  - `testAddedPeersSurviveANewInstance`.
  - `testAddingTheSameIdReplacesNameAndKey`: count stays 1.
  - `testTheFifthDistinctPeerIsRefused`: `add` returns false and `all` is unchanged; re-adding an existing id when full still returns true.
  - `testRemoveDeletesAndPersists`; `testUnknownIdIsNil`.

- [ ] **Step 2: Run** `swift test --filter TrustedPeersTests`. Expected: build error.

- [ ] **Step 3: Implement** (load once in `init`, save after every change).

- [ ] **Step 4: Run** the same command, then the whole suite `swift test`. Expected: all pass.

- [ ] **Step 5: Commit checkpoint** (user): `feat(remote): trusted peers list`.

### Task 5: JS module surface, `'phone'` source and session wiring

**Files:**
- Modify: `app/modules/replay-camera/src/ReplayCamera.types.ts`, `app/modules/replay-camera/src/ReplayCameraModule.ts`, `app/modules/replay-camera/src/ReplayCamera.ts`, `app/src/components/sourceLabel.ts`, `app/src/session/useReplaySession.ts`
- Test: `app/modules/replay-camera/src/__tests__/ReplayCamera.test.ts`, `app/src/session/__tests__/useReplaySession.test.tsx`, and the test that covers `SOURCE_LABEL` (or `app/src/components/__tests__` if none exists)

**Interfaces:**
- Produces (types, in `ReplayCamera.types.ts`):
  - `TriggerSource` gains `'phone'`.
  - `RemoteLink = 'idle' | 'searching' | 'connected' | 'denied'`; `RemotePeer = { id: string; name: string }`; `RemotePairing = { url: string; code: string; expiresAt: number; qrPath: string }`; `RemotePairFailure = 'expired' | 'locked' | 'notFound' | 'wrong' | 'denied' | 'full'`.
  - Events added to `ReplayCameraModuleEvents`: `onRemoteStatus: (e: { link: RemoteLink; peerName?: string; controllers?: number }) => void`; `onRemoteState: (e: { recording: boolean; clipCount: number; startedAt?: number }) => void`; `onRemoteResult: (e: { saved: boolean }) => void`; `onRemotePairing: (e: { phase: 'paired'; peer: RemotePeer } | { phase: 'failed'; reason: RemotePairFailure }) => void`.
- Produces (wrappers in `ReplayCamera.ts`, all optional on the native class like `findContentStart?`):
  - `isRemoteSupported(): boolean` (true when `ReplayCameraModule.remoteHostStart` is a function).
  - Camera role: `remoteHostStart(): void`, `remoteHostStop(): void`, `remoteHostBeginPairing(): RemotePairing | null`, `remoteHostEndPairing(): void`, `remoteHostPeers(): RemotePeer[]`, `remoteHostRemove(id: string): void`, `remoteSync(recording: boolean, clipCount: number, startedAt: number | null): void`, `remoteSignal(saved: boolean): void`.
  - Controller role: `remoteControllerStart(): void`, `remoteControllerStop(): void`, `remoteControllerHost(): RemotePeer | null`, `remoteControllerForget(): void`, `remoteControllerPairWithLink(hostId: string, secret: string, hostName: string): void`, `remoteControllerPairWithCode(code: string): void`, `remoteControllerSave(): void`.
  - When unsupported each wrapper is a no-op and returns `null` or `[]` where it returns a value.
- `SessionDeps.camera` gains `remoteSync` and `remoteSignal` (same shapes as the wrappers).

- [ ] **Step 1: Write the failing tests:**
  - `ReplayCamera.test.ts`: with a mock native that has the remote functions, `remoteControllerSave()` and `remoteHostBeginPairing()` forward to native and return its value; with a mock native lacking them, `isRemoteSupported()` is false, `remoteHostPeers()` returns `[]`, `remoteHostBeginPairing()` returns `null`, and none of the calls throws.
  - `SOURCE_LABEL.phone === 'Celular'`.
  - `useReplaySession.test.tsx` (extend the fake `camera` with `remoteSync` and `remoteSignal` jest.fns): an `onTrigger` event with `source: 'phone'` while recording saves a clip with `source: 'phone'`; a second `phone` trigger 1 s later saves nothing; a `phone` trigger while not recording saves nothing and a real trigger right after still saves (debounce not used up); `remoteSync` is called with the same state as `watchSync` whenever the watch one is; after a successful save `remoteSignal(true)` is called, after a failed one `remoteSignal(false)`.

- [ ] **Step 2: Run** `cd app && npx jest modules/replay-camera src/session src/components`. Expected: failures for the missing functions, label and calls.

- [ ] **Step 3: Implement** the types, the optional native declarations, the wrappers, the label, and in `useReplaySession.ts` call `deps.camera.remoteSync` in the same effect as `watchSync` and `deps.camera.remoteSignal` next to each `watchSignal`. No change to the `onTrigger` gating: it already handles any source. Wire the real `camera` dependency in `SessionContext.tsx` to pass the new wrappers (it imports the module namespace today; follow how `watchSync` reaches it).

- [ ] **Step 4: Run** `npx jest` (whole suite) and `node node_modules/typescript/bin/tsc --noEmit`. Expected: pass, exit 0.

- [ ] **Step 5: Commit checkpoint** (user): `feat(remote): module surface, phone trigger source and session wiring`.

### Task 6: Remote screen model and link parsers

**Files:**
- Create: `app/src/remote/remoteScreen.ts`, `app/src/remote/pairLink.ts`
- Test: `app/src/remote/__tests__/remoteScreen.test.ts`, `app/src/remote/__tests__/pairLink.test.ts`

**Interfaces:**
- Produces:
  - `remoteScreen.ts`: `export const STALE_AFTER = 12; export const SAVE_COOLDOWN = 3; export type RemoteScreen = { kind: 'denied' } | { kind: 'searching'; hostName: string | null } | { kind: 'waiting'; hostName: string } | { kind: 'recording'; hostName: string; clipCount: number; startedAt: number | null } | { kind: 'stale'; hostName: string }; export type RemoteInput = { link: RemoteLink; hostName: string | null; state: { recording: boolean; clipCount: number; startedAt: number | null; ageSec: number } | null }; export function remoteScreen(i: RemoteInput): RemoteScreen; export function canSave(nowMs: number, lastSaveMs: number | null): boolean`.
  - `pairLink.ts`: `export type PairLink = { hostId: string; secret: string; hostName: string }; export function parsePairLink(params: { h?: string; s?: string; n?: string }): PairLink | null; export function parseCode(input: string): string | null`.

- [ ] **Step 1: Write the failing tests:**
  - `remoteScreen`: `denied` wins over everything; `link: 'searching'` with no state gives `searching` (host name may be null); `connected` with no state yet gives `searching`; `connected` + `recording: false` gives `waiting`; `connected` + `recording: true`, `ageSec: 4` gives `recording` carrying count and start; `ageSec: 13` gives `stale` (recovers to `recording` when a fresh state arrives); `link: 'searching'` after a state was seen gives `stale`; `canSave` is true with `null`, false at 2 999 ms, true at 3 000 ms.
  - `parsePairLink`: `{ h: 'h1', s: 'AAECAwQFBgcICQoLDA0ODw', n: 'Quadra 1' }` returns the three fields (this string is the one pinned by the Swift `testQrURLIsPinned`); returns null for a missing or empty `h`, an `h` longer than 64 characters, a missing `s`, an `s` with `+`, `/` or `=`, an `s` that is not exactly 22 characters; a missing `n` falls back to `"Celular da câmera"`; a name over 40 characters is cut to 40.
  - `parseCode`: `'123456'` and `' 123 456 '` give `'123456'`; `'12345'`, `'1234567'`, `'abcdef'`, `''` give null.

- [ ] **Step 2: Run** `npx jest src/remote`. Expected: modules not found.

- [ ] **Step 3: Implement** both files as pure functions, no `?.`.

- [ ] **Step 4: Run** `npx jest src/remote`. Expected: pass.

- [ ] **Step 5: Commit checkpoint** (user): `feat(remote): remote screen model and pairing link parsers`.

### Task 7: Host glue (camera phone) in Swift

**Files:**
- Create: `app/modules/replay-camera/ios/RemoteHost.swift`, `app/modules/replay-camera/ios/KeychainPeerStore.swift`, `app/modules/replay-camera/ios/QRCode.swift`

**Interfaces:**
- Consumes: Tasks 1–4 (`RemoteMessage`, `RemoteHello`, `RemoteProof`, `PairingOffer`, `TrustedPeers`, `PeerKeyStore`).
- Produces:
  - `final class KeychainPeerStore: PeerKeyStore { init(account: String) }` (generic-password item per account, JSON of the peers, accessible after first unlock) and `enum DeviceIdentity { static var id: String { get }; static var name: String { get } }` (id: random UUID kept in the Keychain, created on first use; name: `UIDevice.current.name`).
  - `enum QRCode { static func png(for text: String) -> String? }` writes a CoreImage `CIQRCodeGenerator` image (scaled up, nearest-neighbour) to the caches folder and returns the path.
  - `final class RemoteHost: NSObject { static let shared: RemoteHost; var emit: ((String, [String: Any]) -> Void)?; func start(); func stop(); func beginPairing() -> (url: String, code: String, expiresAt: Double, qrPath: String)?; func endPairing(); var peers: [TrustedPeer] { get }; func remove(id: String); func sync(recording: Bool, clipCount: Int, startedAt: Double?); func signal(saved: Bool) }`.

- [ ] **Step 1: Implement `KeychainPeerStore`, `DeviceIdentity` and `QRCode`.**

- [ ] **Step 2: Implement `RemoteHost`** following `WatchBridge.swift` (singleton, `emit`, cached `lastState`, 5 s heartbeat timer while recording):
  - `start()` creates an `MCPeerID(displayName: DeviceIdentity.name)`, an `MCSession(encryptionPreference: .required)` and an `MCNearbyServiceAdvertiser(serviceType: "lance-remote")` with `discoveryInfo ["host": DeviceIdentity.id, "mode": "pairing" or "trusted"]`; it advertises only while there is an open offer or at least one trusted peer. `stop()` tears everything down.
  - `beginPairing()` returns nil when `peers.count == TrustedPeers.limit` (the UI shows the 4-remote line); otherwise stores a `PairingOffer.make(...)`, restarts advertising in `pairing` mode and returns url, code, `expiresAt` (ms) and the QR path from `QRCode.png`. `endPairing()` drops the offer.
  - `advertiser(_:didReceiveInvitationFromPeer:withContext:invitationHandler:)` decodes `RemoteHello` from the context (nil: decline). `.pair`: `offer.check(...)`; on `.accepted` accept, store `TrustedPeer(id: remoteId, name: remoteName, key: 32 random bytes)` in `TrustedPeers`, send `.paired(hostId:hostName:pairKey:)` once connected, drop the offer (the sheet refreshes from `peers`); for `.wrongProof`, `.expired` and `.locked` accept the connection anyway, send `.refused(reason: .wrong / .expired / .locked)` and disconnect, so the remote can say why. `.reconnect`: unknown `remoteId` → accept, send `.unpaired`, then disconnect that peer; known id with `RemoteProof.verify(... purpose: .reconnect ...)` true → accept; a failed proof → decline (never `unpaired`).
  - On `session(_:didReceive:fromPeer:)` decode `RemoteMessage`; only `.save` from a connected trusted peer emits `onTrigger` with `["source": "phone", "at": ms]`. Everything else is dropped.
  - `sync` caches and sends `.state` to all connected peers (reliable), heartbeat every 5 s while recording, and re-sends on every new connection; `signal` sends `.result` to connected peers.
  - Emit `onRemoteStatus` `{ link, controllers }` when connections change.

- [ ] **Step 3: Build check.** `cd app/ios && pod install`, then `xcodebuild`/Xcode build (or the Release build of Task 9). Expected: compiles. No unit test: this layer is verified on two phones (Task 12).

- [ ] **Step 4: Commit checkpoint** (user): `feat(remote): host side of the phone remote`.

### Task 8: Controller glue (remote phone) in Swift

**Files:**
- Create: `app/modules/replay-camera/ios/RemoteController.swift`

**Interfaces:**
- Consumes: Tasks 1–4, 7 (`KeychainPeerStore`, `DeviceIdentity`).
- Produces: `final class RemoteController: NSObject { static let shared: RemoteController; var emit: ((String, [String: Any]) -> Void)?; func start(); func stop(); var host: TrustedPeer? { get }; func forget(); func pair(hostId: String, secret: String, hostName: String); func pair(code: String); func save() }`.

- [ ] **Step 1: Implement** with `MCNearbyServiceBrowser(serviceType: "lance-remote")` and its own `MCSession(.required)`:
  - Trusted hosts are kept in `TrustedPeers(store: KeychainPeerStore(account: "lance.remote.hosts"))`; `host` is its first entry (the controller holds one host; pairing again replaces it).
  - `start()` browses; on `foundPeer` with `discoveryInfo["host"]` equal to the trusted host id, invites with a `.reconnect` `RemoteHello` (proof by `RemoteProof.make(key: pairKey, purpose: .reconnect, ...)`, `at` now in ms); it keeps searching and re-inviting while not connected. Emits `onRemoteStatus` `{ link: 'searching' | 'connected' | 'denied', peerName }`; a Local Network permission failure (browser `didNotStartBrowsing` with `NSNetServiceErrorDomain`/policy error) emits `denied`.
  - `pair(hostId:secret:hostName:)`: decode the base64url secret, browse for `discoveryInfo["host"] == hostId` and `mode == "pairing"`, invite with a `.pair` hello whose proof key is the secret. `pair(code:)`: invite every `mode == "pairing"` host found, key is `Data(code.utf8)`, stop at the first one that connects. Give up after 20 s with `onRemotePairing` `{ phase: 'failed', reason: 'notFound' }`; on `.refused(reason:)` emit `onRemotePairing` `{ phase: 'failed', reason }` with the same word.
  - On `.paired(hostId:hostName:pairKey:)` store `TrustedPeer(id: hostId, name: hostName, key: pairKey)`, emit `{ phase: 'paired', peer }`. On `.unpaired` call `forget()` and emit `onRemoteStatus` `{ link: 'idle' }` plus `onRemotePairing` `{ phase: 'failed', reason: 'denied' }` so the screen can say "Este controle não está mais pareado". On `.state` emit `onRemoteState`; on `.result` emit `onRemoteResult`.
  - `save()` sends `.save` to the connected host; it does nothing when not connected.

- [ ] **Step 2: Build check** as in Task 7. Expected: compiles.

- [ ] **Step 3: Commit checkpoint** (user): `feat(remote): controller side of the phone remote`.

### Task 9: Native module API and platform config

**Files:**
- Modify: `app/modules/replay-camera/ios/ReplayCameraModule.swift`, `app/app.json`

**Interfaces:**
- Consumes: Tasks 5, 7, 8 (names must match the TypeScript wrappers).
- Produces: the module `Events(...)` list gains `"onRemoteStatus", "onRemoteState", "onRemoteResult", "onRemotePairing"`; `Function`s `remoteHostStart`, `remoteHostStop`, `remoteHostBeginPairing` (returns `{ url, code, expiresAt, qrPath }` or nil), `remoteHostEndPairing`, `remoteHostPeers` (array of `{ id, name }`), `remoteHostRemove`, `remoteSync(recording, clipCount, startedAt?)`, `remoteSignal(saved)`, `remoteControllerStart`, `remoteControllerStop`, `remoteControllerHost` (`{ id, name }` or nil), `remoteControllerForget`, `remoteControllerPairWithLink(hostId, secret, hostName)`, `remoteControllerPairWithCode(code)`, `remoteControllerSave`. `OnCreate` sets `RemoteHost.shared.emit` and `RemoteController.shared.emit` like `WatchBridge.shared.emit`.
- `app.json` `ios.infoPlist` gains `NSLocalNetworkUsageDescription` ("O LANCE usa a rede local para conversar com o outro celular que serve de controle.") and `NSBonjourServices` (`["_lance-remote._tcp", "_lance-remote._udp"]`).

- [ ] **Step 1: Add the functions, events and `OnCreate` wiring** to the module, and the two Info.plist keys to `app.json` (`app.config.js` already spreads `ios`, so nothing else changes).

- [ ] **Step 2: Rebuild.** `cd app && npx expo prebuild --platform ios` is not needed for plist keys when using the existing flow? Run `npx expo prebuild --platform ios` (the plist is generated), then `cd ios && pod install`, then the Release build. Expected: Build Succeeded, app opens as before.

- [ ] **Step 3: Commit checkpoint** (user): `feat(remote): expose the remote link to JS and request local network access`.

### Task 10: Camera phone UI (tile and pairing sheet)

**Files:**
- Create: `app/src/app/pairing.tsx`
- Modify: `app/src/app/setup.tsx`
- Test: `app/src/app/__tests__/pairing.test.tsx`, `app/src/app/__tests__/setup.test.tsx`

**Interfaces:**
- Consumes: Task 5 wrappers and types.
- Produces: route `/pairing`; in `setup.tsx` a tile `Celular` (hidden when `!isRemoteSupported()`) with status `Nenhum controle pareado` / `Pareado: <nome>` (first peer; `N controles` when more) / `Conectado: <nome>` (from `onRemoteStatus` `link: 'connected'`), pressing it does `router.push('/pairing')`; the setup screen calls `remoteHostStart()` on focus and `remoteHostStop()` on blur (inside the existing `focused` effect pattern).

- [ ] **Step 1: Write the failing tests** (mock `../../../modules/replay-camera` as `setup.test.tsx` does; mock `expo-router`):
  - `setup.test.tsx`: tile `Celular, Nenhum controle pareado` when `remoteHostPeers` returns `[]`; `Celular, Pareado: iPhone da Ana` for one peer; pressing it calls `router.push('/pairing')`; tile absent when `isRemoteSupported` returns false; `remoteHostStart` called on mount and `remoteHostStop` on unmount.
  - `pairing.test.tsx`: renders the title `Parear um celular como controle`; the instruction `No celular que vai ser o controle, abra o app Câmera do iPhone (o da câmera normal) e aponte para este código. Depois toque em 'Abrir no LANCE'.` is present; the 6-digit code from `remoteHostBeginPairing` is shown; the fallback text `Não leu? Abra o LANCE no controle, toque em 'Usar este celular como controle' e digite o código:` and `O LANCE precisa estar instalado no celular controle.` are present; the countdown shows `Válido por 1:59` for an offer 119 s from expiry (fake timers, `expiresAt` from the mock) and `Gerar novo código` calls `remoteHostBeginPairing` again; listing two peers shows `Controles pareados` with a `Remover` button each, pressing one calls `remoteHostRemove(id)` and refreshes; when `remoteHostBeginPairing` returns null and four peers exist, `Limite de 4 controles. Remova um para parear outro.` shows and no code; leaving the screen calls `remoteHostEndPairing`.

- [ ] **Step 2: Run** `npx jest src/app/__tests__/setup.test.tsx src/app/__tests__/pairing.test.tsx`. Expected: failures (missing tile and route).

- [ ] **Step 3: Implement** the tile and `pairing.tsx` with the existing `Button`, `TriggerTile`, theme tokens and the instruction placed above the QR `Image` (`source={{ uri: 'file://' + qrPath }}`); the instruction text is always rendered, whatever the offer state.

- [ ] **Step 4: Run** the same command, then `npx jest` and `tsc --noEmit`. Expected: pass.

- [ ] **Step 5: Commit checkpoint** (user): `feat(remote): Celular tile and pairing sheet`.

### Task 11: Remote phone UI (`/remote`, `/pair`, entry button)

**Files:**
- Create: `app/src/app/remote.tsx`, `app/src/app/pair.tsx`
- Modify: `app/src/app/setup.tsx` (button "Usar este celular como controle" at the bottom of the expanded sheet, hidden when unsupported, `router.push('/remote')`)
- Test: `app/src/app/__tests__/remote.test.tsx`, `app/src/app/__tests__/pair.test.tsx`

**Interfaces:**
- Consumes: Tasks 5 and 6.
- Produces: routes `/remote` and `/pair` (the `lance://pair?...` link opens `/pair`; expo-router passes `h`, `s`, `n` as search params).

- [ ] **Step 1: Write the failing tests:**
  - `remote.test.tsx` (mock the module and `expo-keep-awake`, `expo-haptics`): with `remoteControllerHost` returning null the screen shows `Para parear: no celular da câmera, toque no tile 'Celular'. Depois, abra o app Câmera deste iPhone e aponte para o código que aparecer lá. Se preferir, digite o código abaixo.` and a 6-digit input; typing a valid code and pressing the confirm button calls `remoteControllerPairWithCode('123456')`; an invalid code (`12345`) disables the button. With a host: `Procurando iPhone da Ana…` while searching; after `onRemoteStatus` connected + `onRemoteState` not recording: `Conectado a iPhone da Ana. Aguardando o jogo começar.` and the SALVAR button disabled; recording: `12:34 · 3 lances`-style line (clock from `startedAt`, count) and an enabled button that calls `remoteControllerSave` and a second press within 3 s does not call it again; `onRemoteResult` `saved: true` shows `Salvo!` and a success haptic, `false` shows `Não salvou` and an error haptic; no state for 13 s (fake timers) shows `Sem conexão com iPhone da Ana` with the button disabled; `denied` shows `Libere a rede local nos Ajustes para usar o controle.` with a button that opens Settings (`Linking.openSettings`); `onRemotePairing` `reason: 'denied'` shows `Este controle não está mais pareado`; `remoteControllerStart` runs on mount, `remoteControllerStop` on unmount, and keep-awake is active while mounted.
  - `pair.test.tsx` (mock `useLocalSearchParams`): valid params call `remoteControllerPairWithLink('h1', 'AAECAwQFBgcICQoLDA0ODw', 'Quadra 1')` and show `Conectando a Quadra 1…`; an `onRemotePairing` `paired` event shows `Pronto! Este celular agora controla Quadra 1` and `router.replace('/remote')`; `failed` reasons show `Código vencido. Peça um novo no celular da câmera.` (`expired`), `Muitas tentativas. Gere um novo código.` (`locked`), `Não encontrei o celular da câmera. Chegue mais perto e confira se o LANCE está aberto lá.` (`notFound`); malformed params (missing `h`, bad `s`) show an error and never call native.

- [ ] **Step 2: Run** `npx jest src/app/__tests__/remote.test.tsx src/app/__tests__/pair.test.tsx`. Expected: modules not found.

- [ ] **Step 3: Implement** both screens using `remoteScreen`, `canSave`, `parsePairLink`, `parseCode` (Task 6), a one-second ticker for `ageSec` and the clock, and the entry button. The recording line uses the existing `format` helpers in `src/components/format.ts` where they fit; `Salvo!`/`Não salvou` clear after 2 s.

- [ ] **Step 4: Run** the same command, then `npx jest` and `tsc --noEmit`. Expected: pass.

- [ ] **Step 5: Commit checkpoint** (user): `feat(remote): remote phone screens`.

### Task 12: Full verification and two-phone field check

**Files:** none (verification; fix anything it finds as new red-green steps).

- [ ] **Step 1: Full automated run** on the Mac: `cd app/modules/replay-camera/ios/Core && swift test` and `cd app && npx jest && node node_modules/typescript/bin/tsc --noEmit`. Expected: all pass, 0 errors.

- [ ] **Step 2: Install on both iPhones.** `cd app/ios && pod install`, then `npx expo run:ios --configuration Release --device <UDID>` once per phone (each Mac signs its own phone; use the same bundle id on both).

- [ ] **Step 3: Run the spec §11 checklist on the two phones** and write the outcome of each line in a message: (1) the Camera app reads the QR and offers "Abrir no LANCE"; (2) pairing by QR, by code, with 5 wrong codes, with an expired code; (3) quit and reopen each app and it reconnects without a QR; (4) Salvar at 5, 10 and 20 m saves a clip and the remote vibrates; (5) removing the pair on the camera phone makes the remote say `Este controle não está mais pareado`; (6) Local Network denied then allowed. Expected: all six behave as the spec says; anything else becomes a bug to fix with a failing test first when it is in Core or JS.

- [ ] **Step 4: Copy follow-ups for the user to decide:** whether the onboarding line should mention the remote phone (spec §12).
