# Clip screen: watch + edit mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The clip screen gets a clean watch mode (Editar · Salvar · Enviar, hold = 2x) and an edit mode with a sideways tool bar (Foco, Velocidade, Som, Zoom, Girar) whose panel sits above the always-visible cut; Cancelar undoes, Concluir keeps.

**Architecture:** The route keeps the data, player, export job and Modo Foco wiring and switches between two presentational components, `ClipWatch` and `ClipEdit`. Tools are a list (`EDIT_TOOLS`) of `{ id, label, icon, Panel }`; each panel gets one typed `ToolContext`. An edit session snapshots `edit` + `trim` on entry. Gestures gain a watch-mode profile (no pinch, hold handler supplied by the screen).

**Tech Stack:** React Native, expo-router, expo-video, react-native-reanimated, Jest + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-10-23-clip-editor-layout-design.md` (§n = spec section, Dn = decision n).

## Global Constraints

- Copy pt-BR exactly as spec §3. Keep existing accessibility labels so behaviour tests carry over: `Voltar`, `Nome do clipe`, `Apagar clipe`, `Salvar na galeria` (text `Salvar`), `Compartilhar` (text `Enviar`), `Velocidade 0.5x|1x|1.5x|2x`, `Som`, `Voltar zoom para 1x`, `Girar vídeo`, `Modo Foco` (switch), `Pausar`/`Reproduzir`. New: `Editar`, `Cancelar`, `Concluir`, tool buttons labelled by tool name.
- Tool order: `focus`, `speed`, `sound`, `zoom`, `rotate`; first entry opens `focus` (D3); last tool remembered in module memory (not persisted).
- Watch hold = 2x preview only (D11): `playbackRate 2`, muted; badge text `2x`; release restores `applyPlayback(edit.speed, edit.muted)`.
- Edit hold = whole video only while Modo Foco follows (today's behaviour). Pinch only in edit mode (D7). Swipe between clips only in watch mode.
- No full-screen mode (D6): `openFull`, `full`, `ExpandIcon`/`CloseIcon` use and the `FocusChip` component are removed.
- No optional chaining in new TypeScript. Never run git write commands; commit steps are proposals. Tests: `cd app && NODE_PATH=$HOME/jestbind/node_modules npx jest <paths>` (linked shell) or `npx jest` on the Mac.

## Review Focus

- Cancelar after a pinch that turned Modo Foco off must bring Modo Foco back on and the zoom back to none (both are in `edit`): Task 2 test.
- A clip deleted or swiped away while in edit mode must not keep a stale snapshot: the session is per clip id — Task 2 test (`begin` again on a new id).
- Holding for 2x on a clip whose edit is 0.5x and muted must return to 0.5x muted, not 1x with sound: Task 1/5 test.
- Android back with no change leaves edit mode without asking; with a change asks: Task 5 test.
- An export started from watch mode right after Concluir uses the kept edit (cache key changes): Task 5 test (existing "exports only once" test adapted).

---

### Task 1: Gestures — watch profile

**Files:** Modify `app/src/share/useZoomGesture.ts`, `app/src/share/ZoomableVideo.tsx`; Test `app/src/share/__tests__/useZoomGesture.test.tsx`, `app/src/share/__tests__/ZoomableVideo.test.tsx`

**Interfaces — Produces:**
- `useZoomGesture` prop `pinch?: boolean` (default `true`): when `false`, moves never call `onChange` (tap, swipe, hold still work).
- `ZoomableVideo` props `pinch?: boolean` (passed through) and `onHold?: (down: boolean) => void`: when given it receives the hold instead of the built-in "whole video" peek, and the hold works whether or not the picture follows.

- [ ] Step 1: failing tests — `pinch: false`: a two-finger spread calls no `onChange` and no `onCommit`; a one-finger flick still swipes. `ZoomableVideo` with `onHold`: the gesture's hold reaches `onHold(true)`/`onHold(false)` (render with a stubbed `useZoomGesture` capture or drive the real one via the test helper).
- [ ] Step 2: run → fail. Step 3: implement. Step 4: run → pass.
- [ ] Step 5: Commit checkpoint `feat(clip): watch-mode gesture profile (no pinch, external hold)`

### Task 2: Edit session

**Files:** Create `app/src/clip/editSession.ts`; Test `app/src/clip/__tests__/editSession.test.ts`

**Interfaces — Produces:**
- `type EditSnapshot = { clipId: string; edit: Clip['edit']; trim: Clip['trim'] }`
- `beginEdit(clip: Clip): EditSnapshot`; `hasChanges(snapshot: EditSnapshot, clip: Clip): boolean` (deep compare of `readEdit(edit)` and `trim`); `restorePatch(snapshot): { edit: Clip['edit']; trim: Clip['trim'] }` (exactly what to pass to `repo.updateClip`).
- `type ToolId = 'focus' | 'speed' | 'sound' | 'zoom' | 'rotate'`; `lastTool(): ToolId` (default `'focus'`), `rememberTool(id: ToolId): void`.

- [ ] Step 1: failing tests — no change → `hasChanges` false; trim, speed, muted, zoom, rotation, focus off each → true; `restorePatch` of a snapshot taken with focus on and no zoom, after a pinch hand-over (`zoom` set, `focus: false`), gives `edit` without zoom/focus keys; `edit: undefined` snapshot restores `edit: undefined`; `lastTool` is `focus` until `rememberTool('speed')`.
- [ ] Steps 2–4: fail → implement → pass. Step 5: Commit checkpoint `feat(clip): edit session snapshot`

### Task 3: Tools and panels

**Files:** Create `app/src/clip/tools.tsx` (list + `ToolContext` type), `app/src/clip/panels/FocusPanel.tsx`, `SpeedPanel.tsx`, `SoundPanel.tsx`, `ZoomPanel.tsx`, `RotatePanel.tsx`, `app/src/clip/ToolBar.tsx`; icons added to `app/src/components/icons.tsx` (`FocusIcon`, `SpeedIcon`, `SoundIcon`, `ZoomIcon`, `EditIcon` — stroke SVG like the existing ones; `RotateIcon` exists). Test `app/src/clip/__tests__/panels.test.tsx`, `app/src/clip/__tests__/ToolBar.test.tsx`

**Interfaces — Produces:**
- `type FocusUi = 'on' | 'off' | 'preparing' | 'unavailable'`
- `type ToolContext = { edit: Edit; setEdit(patch: Partial<Edit>): void; focus: FocusUi; toggleFocus(): void; resetZoom(): void; turn(): void }`
- `EDIT_TOOLS: { id: ToolId; label: string; icon: (color: string) => ReactNode; Panel: (p: { ctx: ToolContext }) => ReactNode }[]` labels `Foco`, `Velocidade`, `Som`, `Zoom`, `Girar`.
- `ToolBar({ open: ToolId, focusOn: boolean, onOpen(id) })` — horizontal `ScrollView`, buttons `accessibilityRole="tab"`, selected state, lime dot on Foco when `focusOn`.

- [ ] Step 1: failing tests — each panel shows its title and sentence (spec §3.2, exact); Speed buttons `Velocidade 2x` call `setEdit({ speed: 2 })`; Sound `Som` toggles `muted` and is disabled with the off-speed sentence when speed ≠ 1; Zoom shows `N.Nx` and `Voltar zoom para 1x` calls `resetZoom` (button absent at 1x); Rotate `Girar vídeo` calls `turn`; Focus: `on` → checked switch named `Modo Foco` calling `toggleFocus`, hint text; `preparing` → `Preparando o enquadramento…`, switch disabled; `unavailable` → `Modo Foco indisponível para esse clipe.`, no switch. ToolBar: order, selected tab, dot.
- [ ] Steps 2–4. Step 5: Commit checkpoint `feat(clip): edit tools and panels`

### Task 4: Watch and edit frames

**Files:** Create `app/src/clip/ClipWatch.tsx`, `app/src/clip/ClipEdit.tsx`, `app/src/clip/WatchProgress.tsx`; Test `app/src/clip/__tests__/ClipWatch.test.tsx`, `app/src/clip/__tests__/ClipEdit.test.tsx`

**Interfaces — Produces (presentational; the route passes data and callbacks):**
- `ClipWatch({ video: ReactNode, name, placeholder, onName, onNameDone, onBack, onDelete, focusTag: 'on' | 'preparing' | undefined, onFocusTag, notice?, position?, progress: ReactNode, onEdit, onSave, onShare, busy, saving, sharing, fast: boolean })` — `fast` shows the `2x` badge.
- `WatchProgress({ player, trim, playing, onTogglePlay, onSeek(ms) })` — thin bar inside the cut, scrub by drag (reuses `Playhead`'s PanResponder approach).
- `ClipEdit({ video: ReactNode, onCancel, onDone, panel: ReactNode, cut: ReactNode, toolBar: ReactNode })`.

- [ ] Step 1: failing tests — Watch: labels/texts of §3.1, `Editar` calls `onEdit`, `Salvar na galeria`/`Compartilhar` buttons (texts `Salvar`/`Enviar`) call through and show busy states, tag texts and tap, `2x` badge only when `fast`, position line. Edit: `Cancelar`, `EDITAR`, `Concluir` call through; slots render.
- [ ] Steps 2–4. Step 5: Commit checkpoint `feat(clip): watch and edit frames`

### Task 5: Route integration

**Files:** Modify `app/src/app/clip/[id].tsx` (mode state, session, tools, hold-2x, Android back via `BackHandler`, remove full screen and `FocusChip`), delete `app/src/components/FocusChip.tsx` + its test; Modify `app/src/app/__tests__/clip.test.tsx` (enter edit mode where a test edits: helper `edit = () => pressAction('Editar')`), `app/src/app/__tests__/deleteGameStack.test.tsx` if needed.

**Interfaces — Consumes:** Tasks 1–4.

- [ ] Step 1: adapt existing tests to the new flow (no behaviour change; the full-screen test is replaced) and add: opens in watch (no tool bar); `Editar` opens on Foco, then on the last tool; `Cancelar` restores (speed changed then cancelled → `updateClip` with the snapshot); `Concluir` keeps; Android back (`BackHandler` mock) in edit with no change leaves, with a change shows `Descartar alterações?`; hold in watch → `player.playbackRate` 2 and muted, release → back to the clip's 0.5x muted; pinch hand-over / intro / Modo Foco tests now through the Foco panel and the watch tag; swipe (`onSwipe`) passed only in watch.
- [ ] Step 2: run → the new ones fail. Step 3: implement. Step 4: full suite, `tsc`, `eslint` on touched files → green.
- [ ] Step 5: Commit checkpoint `feat(clip): watch + edit mode with tool bar`

### Task 6: Device check and review

- [ ] Victor builds and checks on the phone: watch/edit switch, each tool, Cancelar/Concluir, hold 2x, swipe between clips, Modo Foco hold in edit, exports.
- [ ] Final whole-change review (fresh reviewer), fix Critical/Important with tests, deferred minors to `docs/superpowers/backlog.md`.
