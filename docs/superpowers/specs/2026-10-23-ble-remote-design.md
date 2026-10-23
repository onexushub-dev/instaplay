# Phone remote over Bluetooth LE — design

Date: 2026-10-23 · Status: draft, awaiting approval · Supersedes the transport part of `2026-10-19-phone-remote-design.md`

## 1. Why

The phone remote runs on Multipeer Connectivity (MPC). In the field the first connection works, but once the link drops the remote does not come back, even with the camera phone recording. Known causes and context:

- MPC is unreliable on iOS 26 when Wi-Fi is on but not joined to a network (the normal case at a court): invitations go `connecting → notConnected`, sometimes for ~20 tries (Apple forums thread 803339, DTS).
- MPC is deprecated (Xcode 27, TN3213). No fix is promised.
- Our code reuses one `MCSession` after a drop, and the remote side does not restart when the app returns to the foreground.

The Bluetooth remote (volume-button HID) has been very stable in tests. Two iPhones can't use that HID path, but Bluetooth LE between our two apps has the same radio, the same short range (4–5 m is ideal) and a connection model the system keeps alive.

## 2. Goals / non-goals

Goals
- A paired remote reconnects by itself, at any time, including in the middle of a recording, with no action on either phone.
- The link survives the remote's screen locking or the app going to the background for a while.
- Works on every supported iPhone (the XR included; Wi-Fi Aware needs iPhone 12+, so it is out).
- Same JS API and events as today, so screens change only in their texts.
- Existing pairings keep working (same trusted keys in the Keychain).

Non-goals (this spec)
- Multi-camera recording (section 11 only reserves room for it).
- Remote without the app (web link, App Clip): later.
- Android.

## 3. Roles and transport

| | Camera phone | Remote phone |
|---|---|---|
| BLE role | Peripheral (`CBPeripheralManager`) | Central (`CBCentralManager`) |
| Advertises | Service UUID only (no device name, no ids) | — |
| Max links | 4 remotes (`TrustedPeers.limit`) | 1 camera now (list-shaped for later) |

GATT service `LANCE Remote` (128-bit UUID, fixed):
- `rx` — write with response, remote → camera. Ordered and acknowledged.
- `tx` — notify, camera → remote.
- `psm` — read: the L2CAP PSM for the preview channel (section 8).

No BLE link-layer pairing: requiring encryption on a characteristic shows the iOS system "Bluetooth Pairing Request" dialog. Security is done in the app (section 5), like today.

## 4. Framing

Messages stay the JSON of `RemoteMessage` / `RemoteHello` (unchanged, tested). Some exceed one ATT packet (`paired` with names), so a small frame layer sits under them: `[version:1][msgId:2][index:1][count:1][payload…]`, chunk size from `maximumWriteValueLength` / the notify MTU. The receiver reassembles, drops incomplete messages after 2 s, and caps a message at 4 KB. Lives in Core (`BleFrames`), unit-tested.

## 5. Security

Today the pair key travels inside an MPC session encrypted by MPC. BLE without link encryption can be sniffed, so:

Pairing (QR secret or 6-digit code)
1. Both sides make an ephemeral Curve25519 key pair and exchange public keys.
2. Each side sends `HMAC(secret, "pair" | transcript)` where the transcript is both public keys, both ids, both nonces. The camera checks it with the existing `PairingOffer` rules (2 min, 5 attempts, reservation, release on drop).
3. Shared key = HKDF(ECDH, salt: transcript). The camera sends `paired` sealed with it (ChaChaPoly). A passive sniffer learns nothing; an active attacker must guess the code online, limited to 5 tries.

Reconnect (replaces the timestamped proof, so clock differences no longer matter)
1. Camera sends a random 16-byte challenge on `tx` when a central subscribes.
2. Remote answers `HMAC(pairKey, "reconnect" | challenge | remoteId | hostId)`.
3. Session key = HKDF(pairKey, challenge | remote nonce). Every later message is sealed (ChaChaPoly, counter nonce per direction, so replays are refused).

Unknown remote → `unpaired` as today. Wrong proof → silent refusal, never "forget".
Crypto and handshake states live in Core (`BleHandshake`), unit-tested with fixed vectors.

## 6. Reconnection

Remote (central), the part that fixes the field bug:
- The camera's peripheral identifier is remembered after the first link. On any drop the remote calls `connect(peripheral)` again at once. A pending connect never times out in CoreBluetooth and completes as soon as the camera is in range and advertising.
- In parallel it scans for the service UUID (a camera that reinstalled or rebooted gets a new identifier). The first match that passes the handshake wins; the other attempt is cancelled.
- `UIBackgroundModes: bluetooth-central` plus state restoration (`CBCentralManagerOptionRestoreIdentifierKey`) keep the link and the pending connect alive while the remote is locked or in the background.
- When the app comes back to the front: if not connected, restart the scan (the pending connect stays).
- No retry timers that create new sessions: CoreBluetooth owns the link, so there is no "stale session" problem.

Camera (peripheral):
- Advertises while the app is open (any screen), as the MPC host does today. It is in the foreground while recording, so advertising is full rate.
- Heartbeat: `state` every 5 s to each linked remote, as today, so the remote's `STALE_AFTER` logic keeps working. A drop is also seen through the subscription ending.
- `bluetooth-peripheral` background mode: not needed (recording stops when the camera app leaves the front).

Expected reconnect time after the phones come back in range: about 1–3 s (to be measured in the spike).

## 7. JS surface

Unchanged function names and events (`remoteHost*`, `remoteController*`, `onRemoteStatus`, `onRemotePairing`, `onRemoteCheck`, `onRemoteState`, `onRemoteResult`, preview frames). Changes:
- `link: 'denied'` also covers "Bluetooth off" and "Bluetooth permission refused", with a new `reason` field (`off | unauthorized`) so the screens can say which.
- `RequirementsChecklist`: "Bluetooth ligado nos dois celulares" and "LANCE aberto nos dois celulares, perto um do outro (até ~5 m)". Wi-Fi and Local Network lines go away.
- Info.plist: `NSBluetoothAlwaysUsageDescription`; `NSLocalNetworkUsageDescription`/`NSBonjourServices` removed once MPC is gone.

## 8. Camera preview on the remote

Today: 480 px JPEG, quality 0.5, 4 fps (≈ 80–120 KB/s) over MPC. Plan: an L2CAP channel (`CBL2CAPChannel`, PSM published in `psm`), opened only while the preview is visible, carrying sealed, length-prefixed frames. The spike measures throughput between the 16 Pro Max and the XR at 5 m:
- ≥ 120 KB/s steady: keep 480 px / 4 fps.
- 40–120 KB/s: 360 px / 3 fps (the watch preview settings).
- Less: preview falls back to Wi-Fi peer-to-peer (Network framework, `includePeerToPeer`), only while the preview is on. Separate decision, not in this plan.
Commands never wait behind frames (they use GATT, the frames use L2CAP).

## 9. Plan

0. Spike (device only, throwaway screen): advertise, connect, write/notify, drop and reconnect (walk away, lock the remote, start a recording), L2CAP throughput. Victor runs it; go/no-go on the numbers.
1. Core: `BleFrames`, `BleHandshake` (pair + reconnect + sealing), reconnect policy as a pure state machine. `swift test`.
2. iOS glue: `BleRemoteHost` (peripheral) and `BleRemoteController` (central) with the same public API as `RemoteHost` / `RemoteController`; the module switches to them. Logs in both (subsystem `LANCE`).
3. Preview over L2CAP (per the spike result).
4. JS: status reasons, checklist texts, tests.
5. Remove MPC code, Bonjour keys and the Local Network text.

## 10. Field checklist

1. Pair by QR and by code; existing pairing still works after the update (no new pairing).
2. Start recording, walk the remote out of range and back: reconnects within a few seconds, Save works, recording never stopped.
3. Lock the remote for 1 min, unlock: already connected.
4. Switch to another app on the remote and back: connected.
5. Turn Bluetooth off/on on each phone: clear message, then reconnects.
6. Two to four remotes on one camera at the same time.
7. Preview: smooth enough, and Save still instant while it runs.
8. 2-hour recording with a remote linked: no drop; note battery on both phones.

## 11. Room for multi-camera (future)

Not built now, but v1 of the protocol keeps it possible:
- `save` carries a `triggerId` (UUID) and the remote's timestamp, so several cameras can save "the same" moment and the clips can be grouped later.
- `ping`/`pong` carry timestamps, so each side can estimate the clock offset (NTP-style); cameras can then cut on a shared timeline.
- The remote's host store is a list; the "one camera" rule is a limit, not a data shape.
Video files never travel over BLE: joining angles needs Wi-Fi peer-to-peer or the cloud, decided in that feature's own spec.

## 12. Risks

- Swift/CoreBluetooth cannot be compiled or tested in the assistant's environment: every native step needs a device build by Victor.
- L2CAP throughput may not carry the preview (section 8 fallback).
- iOS may still end a background central link after a long time; the pending connect brings it back when the app returns.
