# Multi-camera recording — design (future)

Date: 2026-10-23 · Status: idea recorded, not scheduled · Depends on: `2026-10-23-ble-remote-design.md`

## 1. What

Up to 4 iPhones film the same game from different angles. One tap on Save (remote phone, camera screen, watch, gesture,
voice, Bluetooth remote) saves the same moment on every camera, with clips of the same length, grouped as one play
with several angles.

## 2. Topology: a star around the main camera

```
Remote ──1:1── Main camera ──┬── Camera 2
                             ├── Camera 3
                             └── Camera 4
```

- The remote stays exactly as today: one camera (the main one), same link, same messages.
- The main camera is the only one that decides: it receives every trigger and fans it out.
- Secondary cameras are a new role, separate from "remote": their own pairing ("Adicionar câmera"), their own trusted
  list, up to 3. The one-remote rule (BLE spec section 15) does not count them.
- Rejected for now: the remote talking to the 4 cameras directly. It would change the remote side (one camera per
  remote) and every trigger source on the main phone would still need the fan-out.

## 3. Link

Reuse the BLE stack as is: the main camera already serves several centrals. A secondary camera connects like a remote
(pending connect + scan, handshake, sealed session), with a new handshake kind (`BleLinkKind.camera`) and its own
trusted list. Pairing reuses the QR/code offer, opened from "Adicionar câmera".

New messages (main → secondary unless noted):
- `follow(start)` / `follow(stop)`: start or end recording together with the main camera.
- `saveAt(triggerId, at)`: save the window ending at `at` (main camera's clock), same clip length as the main one.
- `clipSaved(triggerId, clipId, durationMs)` (secondary → main): the angle exists.
- `ping`/`pong` with timestamps: clock offset.

## 4. Same moment on every camera

- Clock offset: NTP-style over BLE (send time, receive time, round trip; keep the lowest-RTT samples). BLE round trips
  measured ~55–70 ms, so offsets of a few ms are realistic.
- Each secondary converts `at` to its own clock and cuts its buffer there (`SegmentRing` already saves by time).
- Segment granularity: today a save waits for the segment holding the trigger to close; all cameras do the same, so the
  windows line up to within the offset error.
- Fine alignment (later, optional): audio cross-correlation between angles when grouping.

## 5. Getting the angles together

Video does not fit BLE (24 KB/s measured). Options, to decide in this feature's plan:
1. Peer-to-peer Wi-Fi (Network framework, like the preview): secondaries send each clip to the main camera after the
   save, in the background, while the game goes on. No internet needed.
2. Each phone keeps its clips; grouping happens later (end of game, or via the cloud/account).

## 6. Screens (sketch)

- Main camera, setup: "Câmeras" tile (count connected), "Adicionar câmera" with the same pairing flow and list
  (Verificar / Remover), like the remote list.
- Secondary camera: "Usar como câmera extra" → its own simple screen: preview, framing guide, connection state, "Gravando
  com {main}".
- Clip screen: angle switcher; export one angle or a split/sequence.

## 7. Risks and open questions

- Battery and heat on 4 phones recording 1080p for a long game (thermal fallback already exists per phone).
- Storage: each phone keeps its own buffer; transferred angles add up on the main phone.
- Fan-out latency vs. the 3 s trigger debounce: one trigger id per play keeps it to one clip per camera.
- BLE: main camera serving 1 remote + 3 cameras = 4 centrals, inside what the stack already does.
- Same app on all phones: status events must keep a `side`/role (lesson from the remote "Reconectando" bug).

## 8. Phases (when scheduled)

0. Spike: two cameras, `saveAt` over BLE, measure the time difference of the same event in both clips.
1. Secondary camera role + pairing + follow start/stop.
2. Synchronized save + grouping on the main phone (angles listed per play).
3. Clip transfer over peer-to-peer Wi-Fi.
4. Clip screen with angles, export.
