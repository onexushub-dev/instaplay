# Batch Save/Share and Simple Compilation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From a recording's selection mode, save or share many clips at once, and compile the selected clips into one video (paid).

**Architecture:** One pure job builder (`clipExportJob`) shared by the clip screen, the batch and the compilation; a batch runner that exports clips (2 at a time, cache-aware) through the existing native `exportClip`; two new native functions, `shareFiles` (many files, one sheet) and `concatVideos` (passthrough join of identical exports).

**Tech Stack:** Expo / React Native (expo-router, expo-media-library, react-native-view-shot), TypeScript, Jest + @testing-library/react-native; Swift (AVFoundation, ReplayCore SwiftPM package); Kotlin (MediaExtractor/MediaMuxer, JUnit core tests).

**Spec:** `docs/superpowers/specs/2026-10-24-batch-share-and-compilation-design.md`

## Global Constraints

- No optional chaining (`?.`) in new or changed code; explicit checks instead.
- Never run git write commands; the "Commit" steps are for Victor (suggest the message, he runs it).
- All user-facing text through i18n keys in `src/i18n/locales/en.ts` and `pt-BR.ts`; `noHardcodedPortuguese.test.ts` must pass.
- Batch Salvar/Enviar free on every plan; Compilar paid (`plan === 'paid'`), free plan → `openPaywall(t)`.
- Compilation: majority orientation, tie → first clip's; hard cuts; chronological order; ≥ 2 clips.
- `EXPORT_CONCURRENCY = 2` (one constant, can go back to 1).
- Tests run on the device shell: `cd app && export NODE_PATH=$HOME/jestbind/node_modules; npx jest <paths>`; also `npx tsc --noEmit -p .` and `npx eslint <files>`.
- PanResponder/RNTL rules already known: `await act(async …)`, mock vars prefixed `mock`.

## Review Focus

1. A clip deleted (file missing) while a batch runs → counted as failed and named; the others still finish. (Task 4 test.)
2. Leaving the recording screen mid-batch → no state updates after unmount, temporary files removed. (Task 8 test.)
3. Clips that were muted or not at 1x next to clips with sound in one compilation → the join must not fail; silent gap. (Task 6 Core tests.)
4. Selecting, then deleting from another screen (clip screen) so a picked id no longer exists → picked list drops it; counts stay right. (Task 8 test.)
5. Exporting the same clip from the clip screen right after a batch → cache hit, no second export; and a cache entry whose file was removed → re-export. (Task 2 tests.)

---

### Task 1: One clip's export job (`clipExportJob`) and compilation orientation

**Files:**
- Create: `app/src/share/clipExport.ts`
- Test: `app/src/share/__tests__/clipExport.test.ts`
- Modify: `app/src/app/clip/[id].tsx` (build `options`/`frame`/`layout` with `clipExportJob`)

**Interfaces:**
- Consumes: `clipStage(tier, edit, trim, videoSize, focusReady)` from `src/clip/stage.ts`; `exportOptions`; `readFocusFile`.
- Produces:
  - `type Orientation = 'portrait' | 'landscape'`
  - `type ClipJob = { options: Omit<ExportClipOptions, 'overlayPngPath' | 'background' | 'clipPath'>; frame: {width:number;height:number}; layout: ReturnType<typeof frameLayout>; key: string; watermark: boolean }`
  - `clipExportJob(clip: Clip, plan: Plan, videoSize: {width:number;height:number}, orientation?: Orientation): ClipJob`
  - `compilationOrientation(shapes: {width:number;height:number}[]): Orientation` (shapes already turned by each clip's rotation)
  - `clipShapeOf(clip: Clip): Promise<{width:number;height:number}>` — `knownShape(path)` or thumbnail + `Image.getSize` + `rememberShape`.

- [ ] **Step 1: Write the failing tests**
  - `clipExportJob matches what the clip screen exports`: vertical 1080×1920 clip, free plan, trim 30000–60000, speed 2, no zoom → `options` has `width 720, height 1280, startMs 30000, endMs 60000, speed 2, muted false`, `crop undefined`, `rotation 0`; `watermark true`.
  - `Modo Foco ready: the framing file goes along` → with `clip.focus = {status:'ready', file:'/c.focus.json'}` and `readFocusFile` mocked to a track → `options.focus` equals `{ path: '/c.focus.json', aspect: 'portrait' }`; with `readFocusFile` → `undefined`, `options.focus` undefined.
  - `forced orientation: a vertical clip in a landscape compilation` → `clipExportJob(vertical, 'free', 1080×1920, 'landscape').frame` equals `{ width: 1280, height: 720 }` and `layout.video.width < 1280` (bands at the sides).
  - `the same look gives the same key, any edit change a new one` → same inputs equal keys; changing `edit.speed` changes `key`.
  - `compilationOrientation`: `[v, v, l]` → `'portrait'`; `[l, v]` → `'landscape'` (tie, first); `[l, l, v]` → `'landscape'`.

- [ ] **Step 2: Run** `npx jest src/share/__tests__/clipExport.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** in `clipExport.ts`. `key = JSON.stringify([clip.path, options, layout, watermark])`. The `watermark` is what `ShareOverlay` gets today on the clip screen (read it from `exportOptions`/plan the same way the screen does).

- [ ] **Step 4: Switch the clip screen** to `clipExportJob(clip, plan, videoSize)` for `options`, `frame`, `layout`; keep its behaviour (all clip tests stay green).

- [ ] **Step 5: Run** `npx jest src/share src/app/__tests__/clip.test.tsx` → PASS; tsc and eslint clean.

- [ ] **Step 6: Commit (Victor)** `refactor(share): one export job builder for clip screen, batch and compilation`

---

### Task 2: Shared export cache; exports cleared once per app start

**Files:**
- Create: `app/src/share/exportCache.ts`
- Test: `app/src/share/__tests__/exportCache.test.ts`
- Modify: `app/src/app/clip/[id].tsx` (use the cache; stop clearing on mount and deleting on unmount), `app/src/app/_layout.tsx` (clear once at start)

**Interfaces:**
- Produces:
  - `cachedExport(key: string): string | undefined` — path only if the file still exists
  - `rememberExport(key: string, path: string): void`
  - `forgetExport(path: string): void` (removes the entry and the file)
  - `clearExportsFolder(): void` — deletes `Paths.cache/exports/*` and empties the map
  - `forgetAllExportsForTests(): void`

- [ ] **Step 1: Failing tests**
  - `a remembered export is found while its file exists` (mock `expo-file-system` `File.exists` true) → `cachedExport('k')` = path.
  - `a removed file is a miss` (exists false) → `undefined`, and the entry is dropped.
  - `clearExportsFolder empties the folder and the map`.
  - In `clip.test.tsx`: `an export made before (same look) is reused: Salvar then Compartilhar exports once` (already exists — keep green) and `opening the clip screen no longer clears the exports folder` (Directory.list not called on mount).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; the clip screen's `ensureExport` uses `cachedExport(job.key)` / `rememberExport`; remove `clearOldExports()` and the unmount deletion from the clip screen; call `clearExportsFolder()` once in `_layout.tsx` (module-level guard so a re-render does not repeat it).
- [ ] **Step 4: Run** `npx jest src/share src/app` → PASS.
- [ ] **Step 5: Commit (Victor)** `feat(share): export cache shared across screens, cleared at app start`

---

### Task 3: Overlay capture off screen (`OverlayCapturer`)

**Files:**
- Create: `app/src/share/OverlayCapturer.tsx`
- Test: `app/src/share/__tests__/OverlayCapturer.test.tsx`

**Interfaces:**
- Consumes: `ShareOverlay` (`frame`, `layout`, `scale`, `watermark`), `captureOverlay(ref)`.
- Produces: `useOverlayCapturer(): { element: ReactElement; capture(job: Pick<ClipJob,'frame'|'layout'|'watermark'>): Promise<string> }` — `element` is mounted once (hidden, off screen at `scale = 1 / PixelRatio.get()`, same as the clip screen's offscreen copy); `capture` renders the job, waits for layout, captures, resolves the PNG path. Calls are queued (one at a time); consecutive calls with equal `frame`+`layout`+`watermark` return the previous PNG without capturing again.

- [ ] **Step 1: Failing tests** (mock `captureOverlay` to resolve `'/o1.png'`, `'/o2.png'`…):
  - `capture renders the job and returns its PNG` → resolves `'/o1.png'`; the rendered `ShareOverlay` got the job's `frame`.
  - `the same look twice is captured once` → two calls, `captureOverlay` called once, both `'/o1.png'`.
  - `two different looks are captured in order` → `'/o1.png'`, `'/o2.png'`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit (Victor)** `feat(share): capture the app mark for clips that are not on screen`

---

### Task 4: Batch runner (`runBatch`)

**Files:**
- Create: `app/src/share/batchExport.ts`
- Test: `app/src/share/__tests__/batchExport.test.ts`

**Interfaces:**
- Consumes: `clipExportJob`, `clipShapeOf` (Task 1), `cachedExport`/`rememberExport` (Task 2), `capture` (Task 3).
- Produces:
  - `export const EXPORT_CONCURRENCY = 2`
  - `type BatchResult = { done: { clip: Clip; path: string }[]; failed: { clip: Clip; reason: 'export' | 'missing' }[]; timing: { totalMs: number; perClipMs: number[]; concurrency: number } }`
  - `runBatch(o: { clips: Clip[]; plan: Plan; orientation?: Orientation; concurrency?: number; capture: (job) => Promise<string>; exportClip: (opts: ExportClipOptions) => Promise<ExportedClip>; shapeOf?: (clip: Clip) => Promise<Size>; onProgress: (done: number, total: number) => void; signal: { cancelled: boolean } }): Promise<BatchResult>`
  - Each export gets `background: colors.ground`; the overlay PNG is removed after its export.

- [ ] **Step 1: Failing tests** (fake `exportClip` with controllable promises):
  - `results keep the recording's order even when a later clip finishes first`.
  - `runs at most 2 exports at a time` (count in-flight).
  - `progress counts finished clips: 1/3, 2/3, 3/3`.
  - `a cached look is not exported again` (`rememberExport(key, '/old.mp4')` + file exists → `exportClip` not called for it; `done` has `/old.mp4`).
  - `a failing clip is reported and the others finish` (`reason 'export'`).
  - `a clip whose file is gone is reported as missing` (Review Focus 1; `reason 'missing'`, `exportClip` not called).
  - `cancel stops starting new clips; a clip finishing after cancel is removed and not returned`.
  - `forced orientation reaches every job` (`orientation: 'landscape'` → every `exportClip` call has `width > height`).
  - `timing reports concurrency and one entry per exported clip`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (a small pool: start up to `concurrency` jobs, start the next as one ends; size lookup and overlay capture of the next job run while others encode). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit (Victor)** `feat(share): batch export runner, two at a time, cache-aware`

---

### Task 5: Native `shareFiles` (iOS + Android)

**Files:**
- Modify: `app/modules/replay-camera/ios/ReplayCameraModule.swift`, create `app/modules/replay-camera/ios/MultiShare.swift`
- Modify: `app/modules/replay-camera/android/src/main/java/expo/modules/replaycamera/ReplayCameraModule.kt`, create `MultiShare.kt`
- Modify: `app/modules/replay-camera/src/ReplayCameraModule.ts`, `src/ReplayCamera.ts`, `src/ReplayCameraModule.web.ts`
- Test: `app/modules/replay-camera/src/__tests__/shareFiles.test.ts`

**Interfaces:**
- Produces: `shareFiles(paths: string[]): Promise<'shared' | 'dismissed'>` exported from `modules/replay-camera`.
  - iOS: `UIActivityViewController(activityItems: [URL])` on the main queue from the top view controller; iPad `popoverPresentationController.sourceView` = root view centre; resolves on `completionWithItemsHandler` (`completed` → `'shared'`).
  - Android: `Intent.ACTION_SEND_MULTIPLE`, type `video/mp4`, `EXTRA_STREAM` = `ArrayList<Uri>` from `FileProvider.getUriForFile(activity, "${packageName}.replaycamera.files", file)` (the authority `InstagramStory.kt` uses), `FLAG_GRANT_READ_URI_PERMISSION`, `Intent.createChooser`; resolves `'shared'` when the chooser opens (Android gives no result).
  - Web stub rejects.
- [ ] **Step 1: Failing JS test**: `shareFiles passes the plain paths through to the native module` (mock `requireNativeModule`).
- [ ] **Step 2–4:** implement JS binding + native; run test → PASS; tsc clean.
- [ ] **Step 5: Device check (Victor)**: share 3 clips to WhatsApp and to Fotos "Salvar 3 vídeos".
- [ ] **Step 6: Commit (Victor)** `feat(native): share many files in one sheet`

---

### Task 6: Native `concatVideos` with a tested timeline (iOS + Android)

**Files:**
- Create: `app/modules/replay-camera/ios/Core/Sources/ReplayCore/ConcatPlan.swift`, test `ios/Core/Tests/ReplayCoreTests/ConcatPlanTests.swift`
- Create: `app/modules/replay-camera/ios/VideoConcat.swift`; modify `ReplayCameraModule.swift`
- Create: `android/.../core/ConcatPlan.kt`, test `android/src/test/java/expo/modules/replaycamera/core/ConcatPlanTest.kt`
- Create: `android/.../VideoConcat.kt`; modify `ReplayCameraModule.kt`
- Modify: JS binding files as in Task 5; test `src/__tests__/concatVideos.test.ts`

**Interfaces:**
- Core (both languages, same shape): `struct ConcatPart { videoUs: Int64; audioUs: Int64? }` → `ConcatPlan.layout(parts) -> [ConcatPlacement]` with `ConcatPlacement { startUs: Int64; videoUs: Int64; audio: AudioPlacement }` where `audio` is `.track(startUs, durationUs)` (clipped to the part's video length) or `.silent`; plus `ConcatPlan.totalUs(parts)`.
- Produces: `concatVideos(paths: string[], outPath: string): Promise<{ path: string; durationMs: number }>`.
  - iOS: `AVMutableComposition` (one video + one audio track), insert each part at `startUs`, video track `preferredTransform` from the first part; `AVAssetExportSession(preset: AVAssetExportPresetPassthrough)`, `.mp4`. Error `CONCAT_MISMATCH` if a part's natural size differs from the first.
  - Android: one `MediaMuxer` (MPEG_4), tracks from the first part's formats; for each part copy samples with `presentationTimeUs + startUs`; audio only when the part has it. Error `CONCAT_MISMATCH` if video width/height/mime differ.
- [ ] **Step 1: Failing Core tests** (Swift and Kotlin, same cases):
  - `parts follow each other`: parts 2 s, 3 s → starts 0, 2 000 000; total 5 000 000.
  - `a part without sound leaves a silent gap and the next sound lands at its own start`: [2 s with audio, 3 s silent, 1 s with audio] → audio placements `.track(0, 2s)`, `.silent`, `.track(5s, 1s)`.
  - `audio longer than its video is cut to the video`: video 2 s, audio 2.1 s → `.track(0, 2s)`.
- [ ] **Step 2:** Victor runs `swift test` (Core) and the Gradle unit test → FAIL. **Step 3:** implement Core + native. **Step 4:** Victor runs → PASS.
- [ ] **Step 5: Failing JS test** `concatVideos passes paths and destination through` → implement binding → PASS.
- [ ] **Step 6: Commit (Victor)** `feat(native): join exported clips without re-encoding`

---

### Task 7: Progress card for batches and the new texts

**Files:**
- Modify: `app/src/components/ExportProgress.tsx`, `app/src/i18n/locales/en.ts`, `pt-BR.ts`
- Test (create): `app/src/components/__tests__/ExportProgress.test.tsx`

**Interfaces:**
- Produces: `ExportJob = { kind: 'save' | 'share' | 'compile'; stage: 'preparing' | 'joining' | 'delivering'; step?: { done: number; total: number } }`; `ExportProgress` gains optional `onCancel?: () => void` (shows a "Cancelar" button; the card stops being `pointerEvents="none"` only when `onCancel` is given).
- New keys (en / pt-BR), exact pt-BR copy:
  - `summary.save` "Salvar (%{count})", `summary.share` "Enviar (%{count})", `summary.compile` "Compilar", `summary.more` "Mais", `summary.compileLocked` "Compilar é do plano pago", `summary.compileNeedsTwo` "Escolha pelo menos 2 clipes para compilar."
  - `batch.preparing` "Preparando %{done} de %{total}…", `batch.joining` "Juntando os clipes…", `batch.saved` "%{count} clipes salvos na galeria.", `batch.partial` "%{done} de %{total} prontos. Não saíram: %{names}.", `batch.compiled` "Compilação pronta", `batch.compileTooFew` "Sobrou menos de 2 clipes para compilar."
  - English equivalents in `en.ts` (catalog test enforces same keys/placeholders).
- [ ] **Step 1: Failing tests**: `a batch shows "Preparando 2 de 5…"`; `joining shows "Juntando os clipes…"`; `with onCancel there is a Cancelar button that calls it`; existing single-clip titles unchanged.
- [ ] **Step 2–4:** implement → PASS; `src/i18n` tests PASS.
- [ ] **Step 5: Commit (Victor)** `feat(share): batch progress card and texts`

---

### Task 8: Recording screen — Salvar / Enviar / Compilar / Mais

**Files:**
- Modify: `app/src/app/session/[id].tsx`
- Create: `app/src/share/useBatchActions.ts` (the three flows, so the screen stays readable)
- Test: `app/src/app/__tests__/session.test.tsx` (existing suite; add a `describe('batch')`), `app/src/share/__tests__/useBatchActions.test.tsx`

**Interfaces:**
- Consumes: `runBatch`, `EXPORT_CONCURRENCY` (Task 4), `useOverlayCapturer` (Task 3), `compilationOrientation`, `clipShapeOf` (Task 1), `shareFiles`, `concatVideos` (Tasks 5–6), `forgetExport` (Task 2), `ExportProgress` (Task 7), `openPaywall`, `requestPermissionsAsync`/`Asset.create`.
- Produces: `useBatchActions(sessionId: string): { job: ExportJob | undefined; result: BatchSummary | undefined; save(clips: Clip[]); share(clips: Clip[]); compile(clips: Clip[]); cancel(); overlay: ReactElement }` with `BatchSummary = { kind: 'save'|'share'|'compile'; done: number; total: number; failedNames: string[]; compiledPath?: string; timing: BatchResult['timing'] }`.
  - Save: permission (`clip.noPhotos` when denied) → `runBatch` → `Asset.create` each → `repo.updateClip(id, { savedAt })` each.
  - Share: `runBatch` → `shareFiles(paths)` → `repo.updateClip(id, { sharedAt })` each when `'shared'`.
  - Compile: `plan !== 'paid'` → `openPaywall(t)` and stop; `< 2` → notice `summary.compileNeedsTwo`; shapes → `compilationOrientation` → `runBatch({ orientation })` → `< 2 done` → `batch.compileTooFew` → `concatVideos(paths, Paths.cache/exports/compilation-<ts>.mp4)` → summary with `compiledPath`; the summary card offers Salvar / Enviar for it; the compiled file is removed after delivery or when the card closes.
  - Unmount mid-run: `signal.cancelled = true`, no setState after unmount, temporary files removed.
  - `__DEV__`: the summary shows `timing` ("5 clipes · 41,2 s · 2 por vez").
- [ ] **Step 1: Failing tests** (`session.test.tsx`, with `runBatch`, `shareFiles`, `concatVideos`, `openPaywall` mocked):
  - `selecting shows Salvar (N), Enviar (N), Compilar and Mais; Apagar is under Mais`.
  - `Salvar exports the picked clips in order and saves each to Photos` → `Asset.create` called with each path; summary "2 clipes salvos na galeria.".
  - `Enviar opens one share sheet with every picked clip`.
  - `Compilar on the free plan opens the paywall and makes nothing`.
  - `Compilar with one clip says to pick at least 2`.
  - `Compilar joins the exports in order in the majority orientation and offers Salvar / Enviar`.
  - `a partial failure names the clip that did not come out` → "4 de 5 prontos. Não saíram: Clipe #3.".
  - `leaving the screen mid-batch cancels it and removes temporary files` (Review Focus 2).
  - `a picked clip deleted elsewhere is dropped from the selection and the counts` (Review Focus 4).
- [ ] **Step 2:** Run → FAIL. **Step 3:** implement `useBatchActions` + screen. **Step 4:** Run the whole suite → PASS; tsc and eslint clean.
- [ ] **Step 5: Commit (Victor)** `feat(session): save, share or compile many clips at once`

---

### Task 9: Verification and device script

- [ ] **Step 1:** Full suite, `npx tsc --noEmit -p .`, `npx eslint` on every changed file → all clean.
- [ ] **Step 2:** Independent review of the whole change against the spec.
- [ ] **Step 3: Device script for Victor** (development build): recording with 5 clips — one Modo Foco, one hand zoom, one 2x, one turned to landscape, one plain.
  1. Salvar (5): all in Fotos, each like its single save; note the timing line.
  2. Enviar (3) to WhatsApp: one message with 3 videos.
  3. Compilar (5) on the paid plan: one vertical video, the landscape clip with bands, the 2x part silent, hard cuts; then Enviar.
  4. Compilar right after Salvar: almost instant (cache).
  5. Set `EXPORT_CONCURRENCY = 1`, repeat step 1; compare times and how warm the phone gets → decide D7.
  6. Free plan: Compilar shows the lock and opens the paywall.
