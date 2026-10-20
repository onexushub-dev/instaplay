# LANCE: second iPhone as a remote (design)

> Date: 2026-10-19. Status: awaiting review. Scope: iPhone to iPhone only. Android comes later.
> Origin: field test on a sand court (2026-10-19). Gestures and voice were unreliable with music and a phone 3-4 m away, while the
> Bluetooth remote and the Apple Watch worked. Not everybody owns either, but everybody has a second phone.

## 1. Goal

A second iPhone running LANCE acts as a big "Salvar" button for the phone that is filming. One tap on the remote saves the lance
exactly like a tap on the screen, the watch or a Bluetooth remote.

Success looks like:
- Pairing takes under a minute, with no typing in the normal path, and nobody is left wondering which phone does what.
- After the first pairing, the remote reconnects by itself whenever both apps are open.
- A tap on the remote becomes a saved clip through the existing pipeline (trigger bus, 3 s debounce, signal on save), and the
  remote confirms the result with a vibration.

Non-goals (this phase): Android, live camera preview on the remote, the remote working while LANCE is in the background,
internet relays, AirPods, more than one camera phone per remote at the same time.

## 2. Decisions already taken

| Topic | Decision |
|---|---|
| Platforms | iPhone to iPhone only. Android is a follow-up. |
| Transport | Apple MultipeerConnectivity (Bluetooth + peer-to-peer Wi-Fi, no internet, encrypted), behind a small `RemoteTransport` interface so Android can add Bluetooth LE later. |
| Pairing | QR code as the main path, 6-digit code as the fallback, then a remembered "trusted pair". |
| QR reading | By the iPhone's own Camera app on the remote phone, which opens LANCE through the existing `lance://` scheme. No in-app scanner. |
| Clarity | The pairing screen must say, in plain words, to use the **Camera app of the remote phone** (section 6.2). |
| App | Same app, two roles: Camera (default) and Remote. |
| Trigger | A new trigger source `phone`, next to `screen`, `gesture`, `remote`, `watch`, `voice`. |

## 3. Architecture

Pure logic lives in `ReplayCore` (SwiftPM, tested with `swift test`). Everything that needs Multipeer, Keychain or CoreImage is a thin
layer on top. JS only sees the module API and events.

| Unit | Where | Purpose | Depends on |
|---|---|---|---|
| `RemoteMessage` | Core | Wire format between the two phones (encode/decode, malformed input returns nil). Mirrors `WatchMessage`. | Foundation |
| `PairingOffer` | Core | One pairing attempt on the camera phone: secret, 6-digit code, expiry, wrong-attempt counter and lock. | Foundation, clock |
| `RemoteProof` | Core | HMAC-SHA256 proofs for pairing and reconnecting, with a timestamp window. | CryptoKit |
| `TrustedPeers` | Core | The list of trusted pairs (add, replace, remove, lookup) behind a `PeerKeyStore` protocol. | none |
| `remoteScreen` | `src/remote` (TypeScript) | Pure function for what the remote screen shows (searching, waiting, recording, stale, denied). Mirrors `WatchModel`, but lives in TypeScript because the remote screen is a React Native screen. | none |
| `RemoteLink` | iOS glue | Multipeer advertiser/browser/session, Keychain `PeerKeyStore`, QR image from CoreImage. Not unit-testable. | the Core units |
| Module API + events | `ReplayCameraModule` | Exposes the link to JS (section 7). | `RemoteLink` |
| JS screens | `src/app` | Pairing sheet, `/pair`, `/remote`, the "Celular" tile. | module API |

The camera phone's `RemoteLink` turns a received `save` into the existing `onTrigger({ source: 'phone', at })` event, the same path
`WatchBridge` uses. Nothing in the save pipeline changes.

## 4. Roles and entry points

- **Camera** (default): today's flow. The setup screen gets a "Celular" tile (section 6.1).
- **Remote**: the home screen gets a secondary button, "Usar este celular como controle", which opens `/remote`.
  - With no pair yet, `/remote` shows how to pair (section 6.2, remote side).
  - With a pair, it searches for that camera phone and shows the big button.

## 5. Pairing and trust

### 5.1 Pairing (camera phone starts it)

1. The camera phone opens the pairing sheet. It creates a `PairingOffer`: 128-bit `secret`, 6-digit `code`, `hostId` (stable random id
   of this phone), `hostName`, valid for 120 s.
2. It advertises on Multipeer service type `lance-remote`, marked as "pairing".
3. The sheet shows a QR with `lance://pair?h=<hostId>&s=<secret, base64url>&n=<hostName>` and the code.
4. Remote phone, QR path: the Camera app reads the QR and opens LANCE on `/pair`. Code path: the user types the code in `/remote`.
5. The remote phone invites the camera phone, sending a proof: `HMAC(secret or code, "pair" | timestamp | remoteId)`. Over the QR path it
   knows `hostId` and picks that host. Over the code path it tries every phone that is advertising "pairing".
6. The camera phone checks the proof and the 120 s window. A wrong proof counts as an attempt; after 5 the offer is locked and the
   sheet asks for a new code.
7. On success, over the encrypted session, the camera phone sends a fresh 256-bit `pairKey` plus its `hostId` and `hostName`. Both phones
   store the pair (id, name, `pairKey`) in the **Keychain**. The sheet and `/pair` show success.

### 5.2 Reconnecting (no QR)

While LANCE is open on the camera phone's setup or recording screens and at least one pair exists, it advertises. A remote that has the
pair, with `/remote` open, browses and invites with `HMAC(pairKey, "reconnect" | timestamp | remoteId)`. The camera phone accepts only a
known `remoteId` with a valid proof inside a 60 s window. Everybody else is ignored without any prompt.

### 5.3 Managing pairs

The pairing sheet lists the paired remotes ("Controles pareados") with a remove action. Removing deletes the key on the camera phone;
when that remote next tries to reconnect, the camera phone answers `unpaired` (it does not know that `remoteId`), and only then does the remote delete its own entry and show "Este controle não está mais pareado". A failed proof alone (for example clock skew) never deletes a pair; it shows "Sem conexão".
Pairing the same remote again replaces its key.

### 5.4 Threat model

The only thing a remote can do is ask for a save. No video or file ever travels to the remote; it receives only the recording state.
The risk is a nearby stranger pressing Salvar, i.e. a nuisance, not a data leak. So: the session is encrypted, the QR path uses a
128-bit secret, the code path is limited by the 120 s window and 5 attempts (a 6-digit code is weak against someone sniffing the
invitation, which is accepted for this threat model), and trusted pairs use a 256-bit key.

## 6. User experience

All user-facing text is Brazilian Portuguese. Texts below are the intended copy.

### 6.1 Camera phone

- Setup screen: a new tile **"Celular"** next to Voz, Braços, Controle and Relógio. Status: "Nenhum controle pareado",
  "Pareado: <nome>" or "Conectado: <nome>". Tapping it opens the pairing sheet.
- Pairing sheet, in this order:
  1. Title: "Parear um celular como controle".
  2. Instruction (required, always visible, above the QR): **"No celular que vai ser o controle, abra o app Câmera do iPhone (o da
     câmera normal) e aponte para este código. Depois toque em 'Abrir no LANCE'."**
  3. The QR.
  4. Fallback: "Não leu? Abra o LANCE no controle, toque em 'Usar este celular como controle' e digite o código:" and the code, big.
  5. "Válido por 1:59" countdown and "Gerar novo código".
  6. "O LANCE precisa estar instalado no celular controle."
  7. The list of paired remotes with "Remover". With 4 remotes already paired, the sheet says "Limite de 4 controles. Remova um para parear outro." and offers no new code.

### 6.2 Remote phone

- With no pair, `/remote` shows: "Para parear: no celular da câmera, toque no tile 'Celular'. Depois, **abra o app Câmera deste
  iPhone** e aponte para o código que aparecer lá. Se preferir, digite o código abaixo." and a 6-digit input.
- `/pair` (opened by the Camera app): "Conectando a <nome>…", then "Pronto! Este celular agora controla <nome>", then it goes to `/remote`.
  Errors: expired ("Código vencido. Peça um novo no celular da câmera."), locked ("Muitas tentativas. Gere um novo código."),
  not found ("Não encontrei o celular da câmera. Chegue mais perto e confira se o LANCE está aberto lá.").
- `/remote`, screen states (from `RemoteLinkModel`):
  - searching: "Procurando <nome>…"
  - connected, game not started: "Conectado a <nome>. Aguardando o jogo começar." (button disabled)
  - recording: clock and count ("12:34 · 3 lances") and a huge **SALVAR** button.
  - after a tap: a short "Salvo!" in green with a vibration, or "Não salvou" in red with another vibration.
  - stale (no news for 12 s): "Sem conexão com <nome>", button disabled, keeps searching.
  - Local Network denied: "Libere a rede local nos Ajustes para usar o controle." with a button to open Settings.
- The screen stays awake while `/remote` is open. The remote must stay in the foreground: iOS suspends the link otherwise.

## 7. Module API and events (names are indicative; the plan fixes them)

Functions on `ReplayCamera`: start/stop hosting a pairing offer (returns the QR url, code, expiry, and a QR image path), submit a code
or a scanned offer from the remote, start/stop the controller role, send `save`, list and remove trusted pairs, and push the
recording state to the remote (like `watchSync`).

Events: `onRemoteStatus` (the `RemoteLinkModel` state for the UI), `onRemotePairing` (progress and errors), and the existing
`onTrigger` with `source: 'phone'`.

`TriggerSource` gains `'phone'` (label "Celular"). Android keeps its own union values and ignores the new one.

## 8. Wire messages

Encoded as dictionaries like `WatchMessage`, over the Multipeer session (reliable):
- remote to camera: `{cmd: "save"}`
- camera to remote: `{recording, clipCount, startedAt?}` (state, repeated every 5 s while recording), `{result: "saved" | "failed"}`,
  `{paired: {hostId, hostName, pairKey}}` (only during pairing), `{unpaired: true}`
- unknown or malformed messages are dropped: a stray message must never save a clip.

## 9. Platform configuration

`app.json` / `app.config.js` iOS `infoPlist` gains `NSLocalNetworkUsageDescription` (pt-BR text explaining the link to the camera phone)
and `NSBonjourServices` with `_lance-remote._tcp` and `_lance-remote._udp`. The `lance` scheme already exists. No new JavaScript
dependency: the QR image is made natively and the remote needs no camera permission of its own.

## 10. Errors and edge cases

- Remote taps Salvar while the camera phone is not recording: the button is disabled; if a message still arrives, the camera phone drops it
  before it reaches the trigger bus, so it neither saves nor uses up the 3 s debounce.
- Camera app killed or locked: the remote goes stale after 12 s and reconnects by itself when the app returns.
- Two remotes tapping within 3 s: the existing bus drops the second one. Up to 4 trusted pairs and 4 simultaneous connections.
- Bluetooth or Wi-Fi off, or Local Network denied: surfaced as a state with the right instruction, never a silent failure.
- The QR opens LANCE while the remote phone is mid-pairing or already paired: the new pairing replaces the old one for that camera phone.
- Clock skew between the phones larger than 60 s makes reconnects fail; both are network-synced in practice, and the failure shows
  as "Sem conexão" with a retry.

## 11. Testing

Core (`swift test`, run on a Mac):
- `RemoteMessage`: round trip of every case; malformed and unknown payloads return nil.
- `PairingOffer`: valid proof inside the window; expired; wrong proof counts an attempt; lock after 5; new offer resets; code and secret differ.
- `RemoteProof`: reconnect proof accepted; tampered, wrong key, wrong id and out-of-window timestamp rejected.
- `TrustedPeers`: add, replace on re-pair, remove, lookup, the limit of 4.

JavaScript (the repo's existing test runner, native module mocked): `remoteScreen` (searching, waiting, recording, stale after 12 s, recovery, denied); `TriggerSource` and label for `phone`; the "Celular" tile statuses; `/pair` parameter parsing (valid,
expired, malformed link); `/remote` states and button enabled only while recording; the pairing sheet contains the Camera-app
instruction text of section 6.1 and the remote's no-pair screen contains the one of section 6.2.

On two physical iPhones (cannot be automated), checklist for the field test:
1. The Camera app reads the QR and offers "Abrir no LANCE" (assumption to confirm on device; the code path is the fallback).
2. Pair by QR, by code, with a wrong code 5 times, with an expired code.
3. Quit and reopen each app: it reconnects without a QR.
4. Tap Salvar at 5, 10 and 20 m: clip saved, remote vibrates, latency feels instant.
5. Remove a pair on the camera phone and confirm the remote notices.
6. Local Network denied, then allowed.

## 12. Follow-ups

Android transport (Bluetooth LE) behind `RemoteTransport`; the remote working in the background; live preview on the remote;
showing the remote as the trigger source in the clip list; copy for the onboarding mentioning the remote.
