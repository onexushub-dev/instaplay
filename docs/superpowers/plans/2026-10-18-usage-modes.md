# Usage Modes (Plano 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Esporte" becomes "Modo": each mode is a preset (positioning guide, tip, lens, triggers, buffer, default cut, quality, Story templates) read from one registry, with Quadra and Academia groups, and the player's changes remembered per mode.

**Architecture:** A pure TypeScript registry (`src/modes/registry.ts`) describes every mode. `effectiveSettings(mode, prefs)` merges a mode's defaults with the player's per-mode overrides; every screen and the session controller read settings only through it. The native module learns two new session parameters (buffer length, quality) so the gym can keep 2 minutes. Story templates and texts are chosen per mode group.

**Tech Stack:** as in Plans 2–3 (Expo SDK 58, React 19.3, MMKV, react-native-svg, native Swift/Kotlin module).

**Spec:** `docs/superpowers/specs/2026-10-17-lance-design.md` — "Ordem de entrega", item 4 (Plano 4).

## Global Constraints

- **Modes** (id · group · label):
  - Quadra: `beachTennis` Beach tennis · `futevolei` Futevôlei · `voleiPraia` Vôlei de praia · `outro` Outro (quadra)
  - Academia: `musculacao` Musculação · `crossfit` Crossfit · `funcional` Funcional · `outroAcademia` Outro (academia)
- **Defaults per group** (each mode may override):

  | Setting | Quadra | Academia |
  |---|---|---|
  | guide | `court` | `person` |
  | tip | `Atrás da linha de fundo, na altura do ombro` | `No chão ou no tripé, a 2–3 m, de lado para o exercício` |
  | lens | `ultraWide` | `wide` |
  | gesture (braços para cima) | on | **off** |
  | voice | off | on (only if speech permission granted and the phone supports it; else off) |
  | buffer | 60 s | 120 s |
  | default cut | last 30 s | last 60 s |
  | quality | `1080p60` | `1080p30` (keeps a 120 s buffer under ~100 MB) |
  | Story templates | Placar, Minimal, Arena | Treino, Recorde, Minimal |
  | Story field | `Nome da arena (opcional)` | `Exercício e carga (opcional)` |

- **Data compatibility:** `Session.sport` keeps its name and existing values; its type widens from `Sport` to `ModeId` (a superset). Old sessions and prefs keep working with no migration. Old global prefs (`lens`, `gestureEnabled`, `voiceEnabled`) are read as overrides for **Quadra** modes only, then new changes go to `prefs.modeSettings[modeId]`.
- **Cut limits:** `clampTrim` max = the mode's buffer (60 s quadra, 120 s academia); min stays 3 s.
- Copy in pt-BR exactly as written here and in each task. Tokens/components from Plans 2–3. Touch targets ≥ 44 pt.
- Native changes → `pod install`; Release build team `2J67Z98LDX`; `xcrun devicectl` install.

## Review Focus

1. **Existing games/clips from before modes** → listed, labelled and exported exactly as before (old `sport` values are valid mode ids). → Task 1 `old sessions keep their label`.
2. **Switching modes mid-setup** → camera reopens with the new mode's lens and buffer; triggers follow the new mode; no stale gesture on in a gym mode. → Task 2 `switching mode reapplies lens, buffer and triggers`.
3. **A gym mode with voice on but speech permission denied/unsupported** → voice shown off with the reason, never silently "on". → Task 5 test.
4. **120 s buffer** → saves a clip up to 120 s, default cut last 60 s, editor allows up to 120 s. → Tasks 3–4 tests + device check.
5. **Per-mode override isolation** → turning the gesture on in Musculação doesn't turn it on in Crossfit or Beach tennis. → Task 1 `overrides are per mode`.

---

### Task 1: Mode registry and effective settings

**Files:**
- Create: `app/src/modes/registry.ts`, `app/src/modes/__tests__/registry.test.ts`
- Modify: `app/src/data/schema.ts` (`ModeId`, `Session.sport: ModeId`, `Prefs.mode: ModeId`, `Prefs.modeSettings?: Partial<Record<ModeId, Partial<ModeSettings>>>`), `app/src/components/format.ts` (`SPORT_LABEL` → `MODE_LABEL` covering every mode; keep the old name as an alias)

**Interfaces (produced):**
```ts
type ModeGroup = 'quadra' | 'academia';
type Guide = 'court' | 'person' | 'none';
type ModeSettings = { lens: 'ultraWide' | 'wide'; gestureEnabled: boolean; voiceEnabled: boolean;
  bufferSeconds: 60 | 120; cutSeconds: number; quality: '1080p60' | '1080p30' };
type Mode = { id: ModeId; group: ModeGroup; label: string; guide: Guide; tip: string;
  defaults: ModeSettings; storyTemplates: TemplateId[]; storyField: string };
MODES: Mode[]; modeById(id: ModeId): Mode; modesIn(group: ModeGroup): Mode[];
effectiveSettings(mode: ModeId, prefs: Prefs): ModeSettings;
withModeOverride(prefs: Prefs, mode: ModeId, patch: Partial<ModeSettings>): Partial<Prefs>; // returns the prefs patch
```

- [ ] **Step 1: Write the failing tests:** `every mode has a label, group, guide and tip`; `gym modes default the gesture off and buffer 120s`; `court modes default to ultra-wide, 60s, gesture on`; `overrides are per mode` (Review Focus 5); `old global prefs apply to court modes only`; `old sessions keep their label` (`MODE_LABEL.beachTennis === 'Beach tennis'`, `outro` → `Outro`).
- [ ] **Step 2:** `npx jest src/modes src/data` → FAIL → implement → PASS.
- [ ] **Step 3: Commit** `feat(app): mode registry with per-mode settings`

---

### Task 2: Session and native follow the mode

**Files:**
- Modify: `app/modules/replay-camera/src/ReplayCamera.types.ts` (`SessionOptions.bufferSeconds?: number`), iOS `ReplayEngine.swift` (ring capacity from `bufferSeconds`, recreated at each start; `windowSeconds` per session), Android `ReplayEngine.kt` (same), both `ReplayCameraModule` (`SessionOptions.bufferSeconds` field, default 60)
- Modify: `app/src/session/useReplaySession.ts` (`prepare(mode)` instead of `prepare(lens)`; uses `effectiveSettings`), `app/src/session/__tests__/useReplaySession.test.tsx`
- Create: `ios/Core/Sources/ReplayCore/BufferPlan.swift` + test; `android/.../core/BufferPlan.kt` + test — `segments(forSeconds:segmentSeconds:)` (60 s / 1 s → 60; 120 s / 2 s → 60)

- [ ] **Step 1: Write the failing tests:** JS `prepare opens the camera with the mode's lens, quality and buffer` (`startSession({ lens: 'wide', maxQuality: '1080p30', bufferSeconds: 120 })` for `musculacao`); `switching mode reapplies lens, buffer and triggers` (Review Focus 2: stop + start; gesture/voice from the new mode at `start`); Swift/Kotlin `BufferPlan` tests.
- [ ] **Step 2:** Run → FAIL → implement → PASS (`npx jest`, `swift test`, `./gradlew :replay-camera:testDebugUnitTest`).
- [ ] **Step 3:** iOS type-check, Android compile.
- [ ] **Step 4: Commit** `feat: the camera session follows the mode (lens, quality, buffer)`

---

### Task 3: Clips and editor follow the mode

**Files:**
- Modify: `app/src/data/repo.ts` (`addClip` takes `cutMs`, default 30 000), `app/src/session/useReplaySession.ts` (passes the mode's `cutSeconds`), `app/src/story/trim.ts` (`clampTrim(..., maxMs = 60_000)`), `app/src/app/clip/[id].tsx` (max from the session's mode; copy `-120s` for gym clips comes from the clip length already)

- [ ] **Step 1: Write the failing tests:** `addClip with a 60s cut on a 120s clip` → `{ startMs: 60000, endMs: 120000 }`; `clampTrim allows up to 120s when asked`; editor test `a gym clip allows a 90s cut`.
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3: Commit** `feat(app): default cut and cut limits from the mode`

---

### Task 4: Setup screen — mode picker, guide, tip, per-mode triggers

**Files:**
- Modify: `app/src/app/setup.tsx`, `app/src/app/__tests__/setup.test.tsx`
- Create: `app/src/components/PersonGuide.tsx`, `app/src/components/PositionGuide.tsx` (`guide` → `CourtGuide` | `PersonGuide` | nothing)

**Copy:** section `MODO` with a two-option switch `Quadra` / `Academia` and the chips of that group; tip from the mode; trigger tiles show the **effective** settings and write **per-mode** overrides; voice tile when the mode wants voice but permission is missing: `Toque para permitir`.

- [ ] **Step 1: Write the failing tests:** `switching to Academia shows gym modes and the person guide tip`; `choosing Musculação stores the mode and reopens the camera with the 1x lens` (`prepare('musculacao')`); `the gesture tile reflects the mode default (off in gym)`; `toggling the gesture in a gym mode stores a per-mode override`; `a gym mode without speech permission shows 'Toque para permitir'` (Review Focus 3).
- [ ] **Step 2:** FAIL → implement → PASS. `PersonGuide` = dashed accent standing silhouette centred, ~70 % of the preview height, `react-native-svg`.
- [ ] **Step 3:** tsc, lint clean. **Commit** `feat(app): choose a mode on setup with its own guide and triggers`

---

### Task 5: Story templates per mode group

**Files:**
- Modify: `app/src/story/templates.ts` (`TemplateId` adds `treino`, `recorde`; `templatesFor(group)`), `app/src/story/StoryOverlay.tsx` (styles for the two new templates), `app/src/app/story/[clipId].tsx` (chips and field label from the session's mode; field value stored as `prefs.arenaName` for quadra, `prefs.workoutNote` for academia), tests

**Template texts:** **treino** top `[MODE LABEL CAPS, '17 OUT']`, bottom `['TREINO', note]`; **recorde** top `[MODE LABEL CAPS]`, bottom `['RECORDE PESSOAL', note]`.

- [ ] **Step 1: Write the failing tests:** `treino/recorde texts`; `a gym clip offers Treino, Recorde and Minimal with the exercise field`; `a court clip still offers Placar, Minimal and Arena`.
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3: Commit** `feat(app): gym Story templates`

---

### Task 6: Recording hint per mode and on-device check

**Files:**
- Modify: `app/src/components/RecordingPanel.tsx` (sub-hint lists only the triggers on in this mode, e.g. `Últimos 120s prontos · ou diga “salvar” · ou use o controle`), test; `docs/superpowers/field-test-etapa0.md` (status line)

- [ ] **Step 1: Write the failing test:** `the hint lists the triggers on in this mode and the buffer length`. FAIL → implement → PASS.
- [ ] **Step 2:** `pod install`, Release build, install.
- [ ] **Step 3:** On the iPhone: pick Musculação → person guide + 1x + gesture off + voice on → start → say "salvar" after a ~90 s set → clip ~120 s, cut last 60 s → editor allows 90 s → Story offers Treino/Recorde with "Supino · 100 kg". Switch back to Beach tennis → court guide, 0.5x, gesture on, 60 s.
- [ ] **Step 4:** Record the result; **Commit** `docs: Plan 4 verified on iPhone`.
