# Repplay: clip screen layout — watch + edit mode with a tool bar (design)

> Date: 2026-10-23. Status: approved (Victor, 2026-10-23). Scope: the clip screen (`src/app/clip/[id].tsx`), iPhone and Android alike.
> Origin: edits are spread over four places (top bar, side column, bottom panel, gestures) and more are coming (Modo
> Foco just landed; scoreboard, text, ball, angles later). Victor compared 3 layouts on the design canvas "Editor Repplay —
> 3 layouts de edição" and chose a mix of A (tool bar) and B (separate edit mode): artboards `AB-Assistir`,
> `AB-Velocidade`, `AB-Foco`.

## 1. Goal

- **Watching** a clip is clean: the video as large as the screen allows and only Editar, Salvar, Enviar.
- **Editing** happens in one place: an edit mode with a horizontal tool bar; the chosen tool's panel sits right above it,
  with its name, one plain sentence and its controls. The cut (trim bar + play) is always visible while editing.
- A new edit is one more entry in a tool list, not a new place on the screen.

Success looks like: every edit that exists today is reachable in edit mode in at most two taps; nothing about the result
changes (exports, watermark, Modo Foco, trims behave as now); a new tool needs only its panel component and one list entry.

Non-goals: new edits (scoreboard, text…), changing the export, changing gestures' meaning (pinch zoom, tap to play,
swipe between clips, hold to see the whole video), the remote or recording screens.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| 1 | Two modes on the same route: `watch` (default) and `edit`. | Same player, no remount, no video reload when switching. |
| 2 | Tools, in order: **Foco, Velocidade, Som, Zoom, Girar**. There is no "Corte" tool: the trim bar is always shown in edit mode, labelled "Corte: 0:30" as today. | The cut is the edit everyone makes; a tool for it would hide it. |
| 3 | Entering edit mode opens the tool last used in this app session; the first time, **Foco**. | Showcases Modo Foco; keeps the flow for repeated edits. |
| 4 | Edits apply live, as today. **Cancelar** restores the clip's `edit` and `trim` as they were when edit mode opened; **Concluir** keeps them. Both return to watch. | Live preview stays; cancel is a real undo. |
| 5 | Android back in edit mode = Cancelar; when something changed it asks first ("Descartar alterações?" · Descartar / Continuar editando). iOS has no back gesture on this screen already. | No silent loss of edits. |
| 6 | The separate full-screen mode goes away: watch mode is already the large view. | One fewer mode; the full-screen button existed to give the pinch room, and the pinch now lives in edit mode. |
| 7 | Pinch zoom works only in edit mode. Watch mode: tap = play/pause, swipe = next/previous clip, **hold = 2x while the finger is down** (decision 11). Edit mode: tap = play/pause, pinch = zoom, hold = whole video (Modo Foco on); swipe between clips is off. | A pinch is an edit; swiping away mid-edit would lose context. |
| 8 | Watch mode keeps: back, clip name (tap to rename, as today), delete (top right), the "Modo Foco" tag when it is on (tap = enter edit mode on Foco), the "2 de 3" position, a thin progress bar with play, and Editar · Salvar · **Enviar** (lime). | Matches `AB-Assistir`. |
| 9 | Salvar/Enviar exist only in watch mode. | One clear moment to share: after editing. |
| 10 | Modo Foco's "preparando" state shows in the tag (watch) and in the Foco panel (edit) instead of the old chip. The first-time intro caption shows in watch mode. | The chip moves into the new places. |
| 11 | Watch mode, like Instagram Reels: holding a finger on the video plays at 2x (sound off, as any speed ≠ 1) with a small `2x` badge; lifting it returns to the clip's own speed and sound. Preview only: the clip's edit and the export are untouched. (Victor, 2026-10-23.) | Fast way to skim a long clip. |

## 3. Screens (copy pt-BR, exact)

### 3.1 Watch (`AB-Assistir`)
- Top: Voltar · name field (placeholder `Clipe #N · HH:MM`) · Apagar clipe.
- Under the top bar, left: tag `Modo Foco` (lime dot) when on; `Modo Foco · preparando` while analysing; nothing otherwise.
- Bottom panel: notice line (as today) · `N de M · deslize para trocar` when there are siblings · play/pause + progress bar
  (scrubbable, inside the cut) · three buttons: `Editar` (pencil), `Salvar` (download), `Enviar` (share, lime).
- Video: the export frame fitted to the screen, as the preview today.

### 3.2 Edit (`AB-Velocidade`, `AB-Foco`)
- Top: `Cancelar` · `EDITAR` · `Concluir` (lime pill).
- Video: fitted between the top bar and the panel (smaller than in watch), same preview with the overlay.
- Tool panel (above the cut): title (Barlow Condensed, upper case), one sentence (muted), controls:
  - **Foco** — `Modo Foco` · `A câmera acompanha o lance, com zoom quando a jogada se concentra.` · switch (off/on);
    hint row `Mantenha o dedo pressionado no vídeo para ver o clipe original`. Preparing: `Preparando o enquadramento…` with a spinner and the
    switch disabled. No framing (`none`/`failed`/turned video): `Modo Foco indisponível para esse clipe.` and no switch.
  - **Velocidade** — `Escolha a velocidade de reprodução do clipe.` · 0.5x 1x 1.5x 2x.
  - **Som** — `Ative ou desative o som do clipe.` · `Com som` / `Sem som` (disabled with `Fora de 1x o vídeo sai sem som.` when speed ≠ 1).
  - **Zoom** — `Pince o vídeo para aproximar. Com zoom manual o Modo Foco desliga.` · current `N.Nx` and `Voltar a 1x`.
  - **Girar** — `Para um vídeo gravado de lado.` · `Girar 90°`.
- Cut row: play/pause · trim bar with playhead (today's `TrimBar` + `Playhead`) · cut length.
- Tool bar (bottom, scrolls sideways): icon + name; the open tool is lime; Foco shows a lime dot when on.

## 4. Structure

`src/app/clip/[id].tsx` (896 lines) splits by responsibility:

| Unit | Does |
|---|---|
| `src/app/clip/[id].tsx` | Route: loads the clip, owns player, edit state, export job; renders `ClipWatch` or `ClipEdit`. |
| `src/clip/ClipWatch.tsx` | Watch mode UI (3.1). |
| `src/clip/ClipEdit.tsx` | Edit mode frame: top bar, video slot, panel slot, cut row, tool bar. |
| `src/clip/tools.ts` | `EDIT_TOOLS: EditTool[]` — `{ id, label, icon, Panel }` in order. Adding a tool = one entry. |
| `src/clip/panels/*.tsx` | `FocusPanel`, `SpeedPanel`, `SoundPanel`, `ZoomPanel`, `RotatePanel`; each gets a typed `ToolContext` (edit, setEdit, focus state, zoom actions). |
| `src/clip/useEditSession.ts` | Snapshot on enter, `cancel()` restores `edit` + `trim`, `changed` flag, last tool in session. Pure parts tested. |

Kept as they are: `ZoomableVideo`, `useFocusFraming`, `TrimBar`, `Playhead`, `ShareOverlay`, `exportOptions`, `focusQueue`.
`FocusChip` is replaced by the watch tag and the Foco panel.

## 5. Testing

- `useEditSession`: snapshot, cancel restores trim and edit (zoom, speed, focus), `changed` false/true, last tool.
- Watch screen: buttons and labels, tag states, Editar opens edit on Foco the first time and on the last tool after,
  Salvar/Enviar export as today (existing export tests move here), swipe and position line.
- Edit screen: tool bar order and selection; each panel's controls write the same `edit` as today (existing speed, sound,
  zoom, rotate, Modo Foco tests move to their panels); Cancelar restores; Concluir keeps; Android back asks only when changed.
- Existing behaviour tests (trim, delete, rename, Modo Foco hand-over, intro, deleteGameStack) keep passing, moved where
  their UI moved.

## 6. Risks

- The clip screen tests are many (53) and tied to today's layout: moving them is most of the work; behaviour must not change.
- Losing the full-screen mode: landscape clips are smaller in watch mode on a portrait phone than in full screen. If that
  hurts, a later "tap the landscape video to watch it sideways" can come back as its own change.
