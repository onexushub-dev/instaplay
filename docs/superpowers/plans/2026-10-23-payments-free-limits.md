# Plano grátis com limites, Passe como crédito e fim do Story — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar "primeira gravação grátis, pagar antes da segunda" por: gravações ilimitadas no grátis com clipe de até 15 s, sem som, HD 720p e só os gatilhos tela/gesto/voz; o pago (Pro ou Passe consumido no início) libera duração do modo, som, Full HD e relógio/controle Bluetooth/celular controle. Remover o Story do app; a marca "feito com LANCE" fica em toda exportação.

**Architecture:** O plano de cada sessão é decidido uma vez no início (`StartDecision` → `Session.paid`) e nunca recalculado. Regras puras em `app/src/payments/rules.ts` (plano) e `app/src/payments/limits.ts` (o que cada plano captura, exporta e quais gatilhos liga). `useReplaySession` abre a câmera com `captureConfig(settings, plan)`, e a preparação mantém a câmera no plano do próximo início (`nextPlan`). O nativo ganha `audio` em `startSession` (o microfone continua para a voz; só a trilha do clipe some) e `720p60`.

**Tech Stack:** Expo 58 / React Native 0.88, TypeScript, Jest (`jest-expo`, `@testing-library/react-native`), MMKV, `react-native-purchases(-ui)`, Swift (módulo `replay-camera` + pacote `ios/Core` testável com `swift test`), Kotlin (Android, não compila aqui).

**Spec:** `docs/superpowers/specs/2026-10-20-payments-revenuecat-design.md` (revisado em 2026-10-23) e as seções 3.5, 3.9 e 6 de `docs/superpowers/specs/2026-10-17-lance-design.md`.

## Global Constraints
- Produtos: `pro_monthly` (entitlement `pro`, 7 dias grátis nas lojas) e `single_pass` (consumível). Uma oferta só: `default`. Nenhum preço, valor ou símbolo de moeda em código ou catálogo.
- `FREE_MAX_SECONDS = 15`. Grátis: `quality = hdQuality(modo)` (`1080p60→720p60`, `1080p30→720p30`, 720p fica), `cutSeconds = min(corte, 15)`, `bufferSeconds = min(buffer, 15)`, `audio = false`. Pago: `effectiveSettings` com `audio = settings.audio` (padrão `true`).
- Exportação: grátis 720x1280, `muted: true`, trecho ≤ 15 000 ms; pago 1080x1920. A marca vai em **todos** os planos.
- Gatilhos pagos: `watch`, `remote` (Bluetooth), `phone` (celular controle). Grátis: `screen`, `gesture`, `voice`. Trava o **ligar**, nunca um toque: um evento de gatilho pago que chega durante a gravação vira lance.
- Plano no início, nesta ordem: Pro ativo → `{kind:'pro'}` (não gasta crédito); crédito → `{kind:'credit', passTransactionId}` (o mais antigo); senão `{kind:'free'}`. Nunca bloqueia; qualquer falha decide `'free'`.
- `session.paid` nunca muda depois de `repo.startSession`. Sessão sem `paid` (antiga) = `passTransactionId !== undefined`.
- Invariantes da store mantidos: pendência única, compra não explicada nunca vira crédito de outro, restauração nunca cria crédito, leitura antes de restaurar, `spentPasses` só cresce.
- Nenhum paywall durante a gravação nem vindo de início remoto. Pontos de entrada: só os cadeados da preparação, sempre `openPaywall(t)` (oferta `default`). Depois de comprar, nada começa sozinho.
- A câmera nunca reabre com `phase` em `'starting'` (fora do próprio `start`), `'recording'` ou `'stopping'`.
- Selo das opções travadas: `Premium` (pt e en). Textos novos nos dois catálogos (`app/src/i18n/locales/pt-BR.ts`, `en.ts`), mesmas chaves (`src/i18n/__tests__/catalogs.test.ts` confere); inglês americano natural.
- Em `app/`: `npx jest <caminho>`; antes de cada commit `npx tsc --noEmit` e `npx expo lint`. Swift Core: `cd app/modules/replay-camera/ios/Core && swift test`. Nunca iniciar o servidor de desenvolvimento.
- Commits direto em `feat/payments-revenuecat`. Toda mensagem termina com linha em branco e `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Fora deste plano: login, backend, painel do RevenueCat/lojas (spec, "Passos fora do código"), redesenho da marca, Wear OS.

## Review Focus
1. **Comprar o Passe e começar pelo relógio/celular controle antes de a loja mostrar a compra:** a sessão começa grátis sem erro, nada é cobrado duas vezes e o Passe continua crédito para a próxima (Tarefa 3, teste "pendente sem snapshot começa grátis e mantém o crédito").
2. **Pro vence entre a preparação e o início:** a câmera aberta em Full HD com som é reaberta em HD sem som antes de criar a sessão, e a sessão sai `paid: false` (Tarefa 4).
3. **Duplo toque em "Começar gravação" com um crédito** (ou toque + início remoto): uma sessão, um crédito gasto, o segundo `start` dá `'busy'` (Tarefa 4).
4. **Corrida de reabertura quando o plano muda:** compra/expiração notifica durante `start` ou durante a gravação; o efeito da preparação não reabre a câmera fora de `idle`/`ended`, e duas reaberturas seguidas terminam na configuração do último plano (Tarefas 4 e 6).
5. **Sessões gravadas antes desta mudança** (sem `paid`, com ou sem `passTransactionId`, clipes 1080p com som): abrem, editam e exportam conforme `sessionPlan`, sem quebrar e sem regravar dados (Tarefas 2 e 9).

---

## File Structure
- Create `app/src/payments/limits.ts` (+ `__tests__/limits.test.ts`), `app/src/share/MadeWithMark.tsx`, `app/modules/replay-camera/ios/Core/Sources/ReplayCore/CapturePlan.swift` (+ `Tests/ReplayCoreTests/CapturePlanTests.swift`)
- Rename `app/src/share/ShareOverlay.tsx` → `ExportOverlay.tsx` (+ teste)
- Modify `app/src/payments/{types,rules,store,feedback,client,revenuecatClient,fakeClient,useStartPreview}.ts`, `app/src/share/{entitlement,exportOptions}.ts`
- Modify `app/src/data/{schema,repo}.ts`, `app/src/session/{reducer,useReplaySession,SessionContext,RemoteStartListener,useWatchTriggerGate}.ts(x)`
- Modify `app/src/app/{setup,remote,games}.tsx`, `app/src/app/session/[id].tsx`, `app/src/app/clip/[id].tsx`, `app/src/components/{TriggerTile,RecordingPanel}.tsx`
- Modify `app/modules/replay-camera/{src/*.ts, ios/*.swift, ios/Core/..., android/src/main/...}`, `app/targets/watch/{ContentView.swift, Localizable.xcstrings}`, `app/app.json`
- Delete `app/modules/replay-camera/ios/InstagramStory.swift`, `.../android/.../InstagramStory.kt`, `.../android/src/main/res/xml/replay_file_paths.xml`
- Modify `app/src/i18n/locales/{pt-BR,en}.ts`

---

### Task 1: Regras puras — plano do início, plano da sessão, limites e gatilhos

**Files:**
- Create: `app/src/payments/limits.ts`, `app/src/payments/__tests__/limits.test.ts`
- Modify: `app/src/payments/types.ts`, `app/src/payments/rules.ts`, `app/modules/replay-camera/src/ReplayCamera.types.ts` (só o tipo `Quality`), `app/src/data/schema.ts` (só `ModeSettings`)
- Test: `app/src/payments/__tests__/rules.test.ts`

**Interfaces:**
- Produces (`types.ts`): `type Plan = 'free' | 'paid'`; `StartDecision = { kind: 'pro' } | { kind: 'credit'; passTransactionId: string } | { kind: 'free' }` (substitui o antigo). `Tier`, `PRO_ONLY_OFFERING` ficam até a Tarefa 3.
- Produces (`rules.ts`): `startPlan(input: { proActive: boolean; credit?: PassTransaction }): StartDecision`; `planOf(d: StartDecision): Plan` (`free` só para `{kind:'free'}`); `sessionPlan(s: { paid?: boolean; passTransactionId?: string }): Plan`. `availableCredit`, `creditCount`, `detectPurchase` ficam. `startGate` e `watchTriggerAllowed` saem (os chamadores mudam nas Tarefas 3 e 7; até lá deixe `watchTriggerAllowed` como está se ainda for importado).
- Produces (`limits.ts`):
  - `FREE_MAX_SECONDS = 15`
  - `type CaptureConfig = { quality: Quality; bufferSeconds: number; cutSeconds: number; audio: boolean }`
  - `hdQuality(q: Quality): Quality`
  - `captureConfig(settings: ModeSettings, plan: Plan): CaptureConfig`
  - `PAID_TRIGGERS: readonly TriggerSource[] = ['watch', 'remote', 'phone']`; `triggerAllowed(source: TriggerSource, plan: Plan): boolean`
- `Quality = '1080p60' | '1080p30' | '720p60' | '720p30'`. `ModeSettings.quality: Quality`, `ModeSettings.audio: boolean`, `ModeSettings.bufferSeconds: number`; `COURT.defaults.audio = true`, `GYM.defaults.audio = true` (`app/src/modes/registry.ts`).

- [ ] **Step 1: Write the failing tests.** `limits.test.ts`:
  - `captureConfig(COURT defaults, 'free')` → `{ quality: '720p60', bufferSeconds: 15, cutSeconds: 15, audio: false }`; GYM (`1080p30`, 120/60) → `{ '720p30', 15, 15, false }`.
  - `captureConfig({...court, cutSeconds: 10}, 'free').cutSeconds === 10` (mínimo, não fixo).
  - `captureConfig(court, 'paid')` → `{ '1080p60', 60, 30, true }`; com `audio: false` → `audio: false`; com `quality: '720p30'` → `'720p30'`.
  - `hdQuality`: `1080p60→720p60`, `1080p30→720p30`, `720p60→720p60`.
  - `triggerAllowed`: `screen/gesture/voice` → `true` nos dois planos; `watch/remote/phone` → `false` no `free`, `true` no `paid`.
  `rules.test.ts` (substituir os testes de `startGate`/`watchTriggerAllowed`):
  - `startPlan({proActive:true, credit:A})` → `{kind:'pro'}` (**crédito não gasto com Pro**); `{false, A}` → `{kind:'credit', passTransactionId:'A'}`; `{false}` → `{kind:'free'}`.
  - `planOf` dos três; `sessionPlan({paid:true})='paid'`, `({paid:false, passTransactionId:'x'})='free'`, `({passTransactionId:'x'})='paid'`, `({})='free'`.
- [ ] **Step 2: Run** `npx jest src/payments/__tests__/rules.test.ts src/payments/__tests__/limits.test.ts` → FAIL.
- [ ] **Step 3: Implement** as funções acima. `effectiveSettings` não muda (o `audio` vem dos defaults e das escolhas salvas).
- [ ] **Step 4: Run** o mesmo → PASS. Para o commit compilar (`npx tsc --noEmit`), nos chamadores do tipo antigo (store, `useReplaySession`, `setup.tsx`, `useStartPreview`) faça só o mínimo: `startGate` → `startPlan`, ramos de `'firstSession'`/`'paywall'` removidos. O comportamento novo desses arquivos é das Tarefas 3–6.
- [ ] **Step 5: Commit** `feat(payments): plan per start and per session, free capture limits and paid triggers`.

### Task 2: Dados — `Session.paid`, sem marca de primeira sessão, ledger mantido

**Files:**
- Modify: `app/src/data/schema.ts`, `app/src/data/repo.ts`
- Test: `app/src/data/__tests__/repo.test.ts`

**Interfaces:**
- Produces: `Session.paid?: boolean`; `repo.startSession(sport: Sport, now: number, plan: { paid: boolean; passTransactionId?: string }): Session` — grava `paid` sempre, `passTransactionId` e `spendPasses([id])` quando houver, um único `changed()`.
- Removes: `repo.isFirstSessionUsed`, a escrita de `lance:v1:firstSessionUsed`, a chave em `key`, `repo.setSessionPass` (nenhum Passe se liga a sessão gravada).
- Keeps: `spentPasses()` (com a migração), `spendPasses(ids)`.

- [ ] **Step 1: Write the failing tests:**
  - `startSession('quadra', 1, { paid: false })` → sessão com `paid: false`, sem `passTransactionId`.
  - `startSession('quadra', 1, { paid: true, passTransactionId: 'tx-1' })` → `paid: true`, `passTransactionId: 'tx-1'`, `spentPasses()` contém `tx-1`; assinantes notificados uma vez.
  - **Apagar uma gravação nunca devolve o Passe:** `deleteSession` da anterior → `spentPasses()` ainda contém `tx-1`.
  - `startSession` não grava `lance:v1:firstSessionUsed` (`kv.getString` é `undefined`).
  - Sessão antiga escrita direto no KV `{id, sport, startedAt, passTransactionId:'old'}` é lida por `getSession` sem `paid` e a migração põe `old` no ledger.
  - Apagar os testes de `isFirstSessionUsed` e `setSessionPass`.
- [ ] **Step 2: Run** `npx jest src/data/__tests__/repo.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Chamadores de `startSession` (só `useReplaySession`) passam `{ paid: decision.kind !== 'free', ...(credit ? { passTransactionId } : {}) }` provisoriamente; a Tarefa 4 fecha isso.
- [ ] **Step 4: Run** `npx jest src/data` → PASS; `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `refactor(data): session paid flag set at start; drop the first-session marker`.

### Task 3: Store — decisão de início que nunca bloqueia, uma oferta só

**Files:**
- Modify: `app/src/payments/{store.ts, feedback.ts, client.ts, revenuecatClient.ts, fakeClient.ts, types.ts, useStartPreview.ts}`, `app/src/share/entitlement.ts`
- Test: `app/src/payments/__tests__/{store,feedback,revenuecatClient}.test.ts`, `app/src/share/__tests__/entitlement.test.tsx`

**Interfaces:**
- Consumes: `startPlan`, `planOf`, `sessionPlan`, `availableCredit`, `creditCount` (Tarefa 1); `repo.spentPasses/spendPasses/getSession` (Tarefa 2).
- Produces (`createPaymentsStore(client, repo: Pick<Repo, 'getSession' | 'spentPasses' | 'spendPasses'>)`):
  - `peekStart(): StartDecision` e `startDecision(): Promise<StartDecision>` — com `startPlan`; qualquer exceção → `{kind:'free'}`. `startDecision` relê o snapshot quando não há snapshot ou há pendência (como hoje).
  - `nextPlan(): Plan` = `planOf(peekStart())`; `credits(): number`.
  - `showPaywall(): Promise<PaywallOutcome>` — sem `sessionId`; a pendência guarda só `{ before }`; o resto (pré-leitura, `dropped`, `applyRestored`) igual.
  - Removes: `tierFor`, `showProPaywall`, `restoreBefore` só se ficar sem uso (o `restore()` continua lendo antes), o ramo de ligar Passe a sessão em `resolvePending`.
- `client.showPaywall(): Promise<PaywallOutcome>` sem parâmetro de oferta (RevenueCat: oferta atual). `PRO_ONLY_OFFERING`, `Tier` saem de `types.ts`.
- `feedback.ts`: `openPaywall(t: TFunction): Promise<PaywallOutcome>` (sem sessão, não há mais o primeiro parâmetro); `openProPaywall` sai.
- `src/share/entitlement.ts`: `usePlan(sessionId?: string): Plan` — com sessão, `sessionPlan(repo.getSession(id) ?? {})`; sem sessão, `payments.nextPlan()`. Assina `payments` **e** `repo` (`useSyncExternalStore`). `useEntitlement` sai.
- `useStartPreview(): { decision: StartDecision; credits: number }` fica (agora sem `'firstSession'`/`'paywall'`).

- [ ] **Step 1: Write the failing tests** (`store.test.ts`; o repo em memória perde `isFirstSessionUsed`/`setSessionPass`):
  - Sem snapshot e `failSnapshot` → `startDecision()` = `{kind:'free'}` sem lançar; `repo.spentPasses` lançando → `peekStart()` = `{kind:'free'}`.
  - Pro + crédito `tx-1` → `peekStart()` = `{kind:'pro'}`, `credits()` = 1, `nextPlan()` = `'paid'`.
  - Dois créditos `tx-1(t=1)`, `tx-2(t=2)` → escolhe `tx-1`; após `spendPasses(['tx-1'])`, `tx-2`.
  - `showPaywall()` com `purchased` e `tx-2` novo → `credits()` = 1, `nextPlan()` = `'paid'`.
  - **Pendente sem snapshot começa grátis e mantém o crédito:** `showPaywall()` → `purchased` com o snapshot ainda sem a transação → `startDecision()` relê, continua sem ela → `{kind:'free'}`; depois o listener entrega `tx-2` → `peekStart()` = `{kind:'credit', passTransactionId:'tx-2'}`.
  - **Restauração não cria crédito:** `restore()` trazendo `[old]` → `spentPasses` contém `old`, `credits()` = 0; `showPaywall()` com `restored` idem.
  - Segunda `showPaywall()` com a primeira aberta → `'cancelled'`; com pendência não explicada e leitura falhando → `'error'` (invariante mantido).
  - `client.showPaywall` é chamado sem argumentos.
  `feedback.test.ts`: `openPaywall(t)` devolve o resultado; `'error'` mostra `payments.paywallError`. `entitlement.test.tsx`: `usePlan('s1')` = `'paid'` para sessão `{paid:true}` mesmo com o Pro inativo; `usePlan()` muda de `'free'` para `'paid'` quando a store notifica um crédito.
- [ ] **Step 2: Run** `npx jest src/payments src/share/__tests__/entitlement.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Atualizar os chamadores de `useEntitlement`/`openPaywall`/`openProPaywall` só no mínimo para compilar (eles são reescritos nas Tarefas 6, 7 e 9): `setup.tsx` (`openProPaywall(t)` → `openPaywall(t)`), `session/[id].tsx` e `clip/[id].tsx` (`useEntitlement(id).tier` → `usePlan(id)` comparando com `'free'`), `SessionContext.tsx`.
- [ ] **Step 4: Run** `npx jest src/payments src/share` → PASS; `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `refactor(payments): start decision never blocks; one default offering; plan per session`.

### Task 4: Início da sessão aplica o plano e gasta o crédito

**Files:**
- Modify: `app/src/session/{useReplaySession.ts, reducer.ts, SessionContext.tsx, RemoteStartListener.tsx}`
- Test: `app/src/session/__tests__/{useReplaySession.test.tsx, reducer.test.ts, RemoteStartListener.test.tsx}`

**Interfaces:**
- Consumes: `StartDecision`, `planOf` (T1), `captureConfig`, `CaptureConfig`, `triggerAllowed` (T1), `repo.startSession(sport, now, plan)` (T2), `payments.startDecision` (T3).
- Produces:
  - `StartResult = 'started' | 'failed' | 'busy'`; ação `startBlocked` sai do reducer.
  - `prepare(mode: ModeId, plan: Plan): Promise<boolean>` — abre a câmera com `captureConfig(effectiveSettings(mode, prefs), plan)`; chave `quality|buffer|audio` (contínuo) ou `lens|quality|buffer|audio`; passa `audio` a `camera.startSession`. Fora de `start`, com `phase` em `'starting' | 'recording' | 'stopping'` resolve `true` sem tocar na câmera.
  - Ação `started` passa a levar `paid: boolean` e `bufferSeconds: number`; `ReplayState` ganha `paid?: boolean` e `bufferSeconds?: number` (limpos em `reset`/`stopped` como o resto).
  - `SessionOptions` (TS) ganha `audio?: boolean` (o nativo é a Tarefa 5; o TS só repassa).
  - O corte de cada `save` usa o `cutSeconds` do `CaptureConfig` guardado no início (ref), não `effectiveSettings`.
  - `deps.useRemote(phase === 'recording' && triggerAllowed('remote', plan da sessão), …)`.

- [ ] **Step 1: Write the failing tests** (`useReplaySession.test.tsx`; `fakeDeps.startDecision` ajustável, repo real em memória):
  - **Grátis grava ilimitado com limites:** `{kind:'free'}` → `start` = `'started'`; `camera.startSession` recebeu `{ maxQuality: '720p60', bufferSeconds: 15, audio: false }`; 12 `save` → 12 clipes; cada clipe com `trim.endMs - trim.startMs <= 15_000`; sessão `paid: false`; `state.bufferSeconds === 15`.
  - **Pago pelo Pro:** `{kind:'pro'}` → `startSession` com `{ '1080p60', 60, audio: true }`, sessão `paid: true` sem `passTransactionId`, `spentPasses()` vazio.
  - **Crédito gasto uma vez:** `{kind:'credit', passTransactionId:'tx-1'}` → `paid: true`, `passTransactionId: 'tx-1'`, `spentPasses()` = `{tx-1}`.
  - **Plano muda antes do início reabre a câmera:** `prepare('quadra','free')` abre HD; `startDecision` → `'pro'` → `stopSession` e `startSession` com Full HD+som antes de criar a sessão; sessão `paid: true`.
  - **Pro vence entre a 1ª e a 2ª decisão:** 1ª `'pro'`, 2ª `'free'` → a câmera reabre em HD sem som, sessão `paid: false`.
  - **Duplo toque com crédito:** dois `start` sem `await` → `'started'` + `'busy'`; uma sessão; `spentPasses()` com um id.
  - **Durante a gravação não reabre:** gravando, `prepare('quadra', 'free')` numa sessão paga não chama `stopSession`/`startSession`.
  - Câmera falha (`LOW_STORAGE`) com `{kind:'credit'}` → `'failed'`, nenhuma sessão, `spentPasses()` vazio.
  - **Bluetooth só em sessão paga:** `useRemote` recebe `enabled=false` gravando numa sessão grátis e `true` numa paga.
  - **Toque pago numa sessão grátis vira lance:** evento `onTrigger` `{source:'watch'}` gravando grátis → 1 clipe.
  - Apagar os testes de `'needsPayment'`/`startBlocked`/primeira sessão.
  `reducer.test.ts`: `started` guarda `paid` e `bufferSeconds`. `RemoteStartListener.test.tsx`: início remoto chama `session.start` e nunca `openPaywall` (o comentário de "needs payment" sai).
- [ ] **Step 2: Run** `npx jest src/session` → FAIL.
- [ ] **Step 3: Implement** `start`:

```ts
// decide → open camera for that plan → decide again → reopen if the plan changed → create the session.
let decision = await safeDecision();             // never throws: failures are { kind: 'free' }
dispatch({ type: 'startRequested' });
if (!(await openCamera(sport, planOf(decision)))) { /* startFailed, 'failed' */ }
const again = await safeDecision();
if (planOf(again) !== planOf(decision) && !(await openCamera(sport, planOf(again)))) { /* startFailed */ }
decision = again;                                 // the session always matches the camera that is open
const config = captureConfig(effectiveSettings(sport, prefs), planOf(decision));
const session = deps.repo.startSession(sport, deps.now(), {
  paid: planOf(decision) === 'paid',
  ...(decision.kind === 'credit' ? { passTransactionId: decision.passTransactionId } : {}),
});
```
  `openCamera` é o corpo atual de `prepare` sem a guarda de fase; `prepare` = guarda + `openCamera`.
- [ ] **Step 4: Run** `npx jest src/session` → PASS; `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(session): the plan decided at start sets capture limits and spends a credit once`.

### Task 5: Nativo — clipe sem áudio, 720p60 e `saveAllowed` do celular controle

**Files:**
- Create: `app/modules/replay-camera/ios/Core/Sources/ReplayCore/CapturePlan.swift`, `.../Tests/ReplayCoreTests/CapturePlanTests.swift`
- Modify: `ios/{CaptureController,ReplayEngine,ReplayCameraModule,RemoteHost}.swift`, `ios/Core/Sources/ReplayCore/RemoteMessage.swift`, `ios/Core/Tests/ReplayCoreTests/{RemoteMessageTests,BufferPlanTests}.swift`, `android/src/main/java/expo/modules/replaycamera/{ReplayCameraModule,ReplayEngine,SegmentEncoder,CaptureController}.kt`, `src/{ReplayCamera.ts, ReplayCameraModule.ts, ReplayCameraModule.web.ts, ReplayCamera.types.ts}`, `app/src/app/remote.tsx`, `app/src/i18n/locales/{pt-BR,en}.ts`
- Test: `swift test` (Core), `app/modules/replay-camera/src/__tests__/*`, `app/src/app/__tests__/remote.test.tsx`

**Interfaces:**
- Produces (Core): `public enum CapturePlan { static func target(quality: String) -> (width: Int32, fps: Double); static func writerHasAudio(micInput: Bool, clipAudio: Bool) -> Bool }` — `"1080p60"→(1920,60)`, `"1080p30"→(1920,30)`, `"720p60"→(1280,60)`, outros `(1280,30)`. `CaptureController.target(for:)` passa a chamar `CapturePlan.target`.
- Produces (Core): `RemoteMessage.state(recording:clipCount:startedAt:saveAllowed:)`; payload com a chave `saveAllowed`; decode sem a chave ou com tipo errado → `true` (como `WatchMessage`).
- Produces (iOS): `SessionOptions.audio: Bool = true`; `ReplayEngine.start(…, audio:)` guarda `clipAudio`; `startWriter` usa `withAudio: CapturePlan.writerHasAudio(micInput: capture.hasAudio, clipAudio: clipAudio)` (também após reconfiguração térmica). O microfone continua entrando na captura e `capture.onAudio` continua alimentando `voice` nos dois planos. `Function("remoteSetSaveAllowed") { (allowed: Bool) in RemoteHost.shared.setSaveAllowed(allowed) }` — `RemoteHost` repete o último estado com `saveAllowed` para todo controle conectado (mesmo padrão de `WatchBridge.setSaveAllowed`).
- Produces (Android): `SessionOptions.audio = true`; `SegmentEncoder(…, withAudio: Boolean)`: sem áudio não cria `AudioRecord`/encoder de áudio nem trilha, e o muxer começa só com o vídeo. `CaptureController`: `"720p60"` → 1280x720 a 60 se a faixa existir. `remoteSetSaveAllowed` no-op (sem celular controle no Android).
- Produces (TS): `Quality` com `'720p60'` (T1), `SessionOptions.audio?: boolean`, `remoteSetSaveAllowed(allowed: boolean): void`, `onRemoteState` com `saveAllowed?: boolean`.
- Produces (remote.tsx): com `saveAllowed === false`, o botão Salvar dá lugar a `remote.premiumOnly` (`Disponível no Premium` / `Available with Premium`); Começar/Parar e a imagem continuam.

- [ ] **Step 1: Write the failing tests.** `CapturePlanTests`: os quatro alvos; `writerHasAudio(micInput: true, clipAudio: false) == false` (**voz mantém o microfone, o clipe fica sem áudio**); `(true,true) == true`; `(false,true) == false`. `BufferPlanTests`: `segments(forSeconds: 15, segmentSeconds: 2) == 8`. `RemoteMessageTests`: chaves de `.state` incluem `saveAllowed`; decode de `["recording":true,"clipCount":1]` → `saveAllowed: true`; `"saveAllowed":"no"` → `true`. `remote.test.tsx`: estado com `saveAllowed:false` mostra `Disponível no Premium` e não chama o envio de save ao tocar; sem a chave, Salvar como hoje.
- [ ] **Step 2: Run** `cd app/modules/replay-camera/ios/Core && swift test` e `npx jest src/app/__tests__/remote.test.tsx` → FAIL.
- [ ] **Step 3: Implement** o Core e a ligação iOS/Android/TS acima. `useReplaySession` (T4) já passa `audio`; nada mais em JS além de `remote.tsx` e das chaves.
- [ ] **Step 4: Run** `swift test` → PASS; `npx jest src/app/__tests__/remote.test.tsx modules` → PASS; `npx tsc --noEmit`. Anotar no relatório: iOS/Android não compilam aqui; ficam para a Tarefa 11 (aparelho).
- [ ] **Step 5: Commit** `feat(camera): record clips without an audio track, 720p60, and tell remotes whether Save is allowed`.

### Task 6: Preparação — opções do clipe travadas, paywall nas travas, linha do Passe, câmera no plano do próximo início

**Files:**
- Modify: `app/src/app/setup.tsx`, `app/src/components/TriggerTile.tsx` (só o comentário do selo), `app/src/i18n/locales/{pt-BR,en}.ts`
- Test: `app/src/app/__tests__/setup.test.tsx`

**Interfaces:**
- Consumes: `usePlan()` (T3), `useStartPreview()` (T3), `openPaywall(t)` (T3), `prepare(mode, plan)` e `StartResult` (T4), `withModeOverride` (`cutSeconds`, `quality`, `audio`).
- `onStart` volta a ser só `void session.start(modeId)` (sem paywall, sem nova tentativa; o `busy` ref do duplo toque fica).
- Efeito da câmera: `if (live) void prepare(modeId, plan)` com `plan = usePlan()` nas dependências.
- Nova seção `setup.clip` com três linhas de `Chip`: duração (`15 s` | `${modeDefaults.cutSeconds} s`), qualidade (`HD` | `Full HD`), som (`setup.clipMuted` | `setup.clipSound`). No `free`: valor grátis selecionado; o pago com cadeado + `Premium` e `onPress={() => void openPaywall(t)}`. No `paid`: grava `withModeOverride` (`cutSeconds`, `quality: hdQuality(default)` ou o default, `audio`). O `Chip` ganha `lockedBadge?: string` (cadeado + selo), como o `TriggerTile`.
- Chaves (pt-BR | en):

| chave | pt-BR | en |
|---|---|---|
| `setup.clip` | `CLIPE` | `CLIP` |
| `setup.clipLength` | `Duração` | `Length` |
| `setup.seconds` | `%{seconds} s` | `%{seconds}s` |
| `setup.quality` | `Qualidade` | `Quality` |
| `setup.hd` | `HD` | `HD` |
| `setup.fullHd` | `Full HD` | `Full HD` |
| `setup.clipAudio` | `Som do clipe` | `Clip sound` |
| `setup.clipMuted` | `Sem som` | `No sound` |
| `setup.clipSound` | `Com som` | `With sound` |
| `setup.premium` | `Premium` | `Premium` |
| `setup.premiumOnly` | `Disponível no Premium` | `Available with Premium` |
| `setup.passWillBeUsed` | `Seu Passe Avulso será usado nesta gravação.` | `Your Single Pass will be used for this recording.` |

  Saem: `setup.firstFree`, `setup.passCredits`, `setup.needsPayment`, `setup.watchProBadge`, `setup.watchProOnly`.

- [ ] **Step 1: Write the failing tests** (mock de `../../payments` com `peekStart`, `credits`, `nextPlan`, `subscribe`, `version`; de `../../payments/feedback` com `openPaywall`):
  - `nextPlan` `'free'`: aberta a sheet, `30 s`, `Full HD` e `Com som` têm o selo `Premium`; tocar em `Full HD` chama `openPaywall` uma vez e não muda as prefs.
  - **Destrava depois da compra:** o mock passa a `'paid'` e notifica → sem selos; tocar em `Com som`/`Sem som` grava `audio` por modo; `session.start` **não** é chamado.
  - **Plano muda antes do início reabre a câmera:** `prepare` chamado com `('quadra','free')` e, após a notificação, com `('quadra','paid')`.
  - `peekStart` `{kind:'credit'}` → mostra `Seu Passe Avulso será usado nesta gravação.`; `'pro'` e `'free'` → não mostra.
  - Tocar `Começar gravação` chama `session.start('quadra')` e nunca `openPaywall`, em qualquer plano; duplo toque → `start` uma vez.
  - Os testes antigos de status `firstFree`/`needsPayment`/paywall cancelado/retry saem.
- [ ] **Step 2: Run** `npx jest src/app/__tests__/setup.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** A linha usa o estilo `startNote` existente.
- [ ] **Step 4: Run** `npx jest src/app/__tests__/setup.test.tsx src/i18n` → PASS.
- [ ] **Step 5: Commit** `feat(setup): clip length, quality and sound locked on the free plan; Pass line; camera follows the next plan`.

### Task 7: Gatilhos pagos — relógio, controle Bluetooth e celular controle

**Files:**
- Modify: `app/src/session/{SessionContext.tsx, useWatchTriggerGate.ts}`, `app/src/app/setup.tsx`, `app/targets/watch/{ContentView.swift, Localizable.xcstrings}`
- Test: `app/src/session/__tests__/useWatchTriggerGate.test.tsx`, `app/src/app/__tests__/setup.test.tsx`

**Interfaces:**
- Consumes: `triggerAllowed` (T1), `usePlan()` (T3), `state.paid` (T4), `remoteSetSaveAllowed` (T5).
- `useWatchTriggerGate` vira `useSaveGate(recording, allowed, send)` (mesma lógica de `nextWatchGate`, renomeada `nextSaveGate`), usada duas vezes no `SessionProvider`: relógio com `camera.watchSetSaveAllowed` e celular controle com `camera.remoteSetSaveAllowed`. `allowed = recording ? triggerAllowed(src, state.paid ? 'paid' : 'free') : triggerAllowed(src, nextPlan)`.
- Setup: blocos `Controle Bluetooth`, `Relógio` e `Conectar um celular controle` no `free` com `lockedBadge={t('setup.premium')}`, `lockedHint={t('setup.premiumOnly')}` e `onPress={() => void openPaywall(t)}`; no `paid` como hoje. O teste de tecla de volume da preparação (`useVolumeRemote(live && phase==='idle', …)`) só liga no `paid`. O resumo recolhido não conta como ligado um gatilho travado.
- Relógio: "Available with Pro"/"Disponível no Pro" → "Available with Premium"/"Disponível no Premium" (`ProOnlyNote` → `PremiumOnlyNote`, rótulo de acessibilidade incluído).

- [ ] **Step 1: Write the failing tests.** `useWatchTriggerGate.test.tsx` (renomear o arquivo para `useSaveGate.test.tsx`): fora de gravação segue o `allowed`; gravando, um `allowed` que cai para `false` não é enviado até a gravação acabar (existente, mantido); **começar com crédito**: `allowed` `true` antes (crédito) e `true` durante (sessão paga) → um único envio. `setup.test.tsx`: no `free` os três blocos mostram `Premium` e abrem `openPaywall`, e `router.push('/devices')`/`('/pairing')` não é chamado; no `paid` navegam como hoje; `Usar este celular como controle` nunca tem selo.
- [ ] **Step 2: Run** `npx jest src/session src/app/__tests__/setup.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(triggers): watch, Bluetooth remote and phone remote are paid; gate turning them on, never a tap`.

### Task 8: Fim do Story

**Files:**
- Delete: `app/modules/replay-camera/ios/InstagramStory.swift`, `app/modules/replay-camera/android/src/main/java/expo/modules/replaycamera/InstagramStory.kt`, `app/modules/replay-camera/android/src/main/res/xml/replay_file_paths.xml`
- Modify: `ios/ReplayCameraModule.swift` e `android/.../ReplayCameraModule.kt` (função `shareToInstagramStory`), `android/src/main/AndroidManifest.xml` (`<queries>` e o `provider`), `src/{ReplayCamera.ts, ReplayCameraModule.ts, ReplayCameraModule.web.ts, ReplayCamera.types.ts}` (função e comentário "Story template bands"), `app/app.json` (`LSApplicationQueriesSchemes` e `extra.metaAppId`)
- Create: `app/src/share/MadeWithMark.tsx`; rename `app/src/share/ShareOverlay.tsx` → `ExportOverlay.tsx`, `__tests__/ShareOverlay.test.tsx` → `ExportOverlay.test.tsx`
- Modify: `app/src/share/exportOptions.ts`, `app/src/app/clip/[id].tsx` (import, comentários "Instagram"/"Story"), `app/src/app/__tests__/clip.test.tsx`

**Interfaces:**
- Produces: `MadeWithMark({ scale }: { scale: number })` — o único lugar que desenha "feito com LANCE" (`share.madeWith`); `ExportOverlay` (props `frame`, `layout`, `scale`, sem `watermark`) desenha faixas, degradê e sempre `MadeWithMark`. `SAFE_BOTTOM` fica com o mesmo valor, comentário "keeps the mark clear of app UI drawn over the bottom of a shared vertical video".
- `ExportOptions.watermark` sai (o `exportOptions` da Tarefa 9 já não o tem; aqui só não passe mais a prop).

- [ ] **Step 1: Write the failing tests.** `ExportOverlay.test.tsx`: renderiza `feito com LANCE` sempre (não há prop para tirar). Um teste de varredura em `app/src/share/__tests__/noStory.test.ts`: lê com `fs` os arquivos de `src/` e `modules/replay-camera/{src,ios,android/src}` (pulando pastas `__tests__`) e `app.json`, e falha se algum contém `/instagram|\bstor(y|ies)\b|metaAppId/i`. Apagar as asserções antigas `story-top-block`/`story-bottom-block` e `queryByText(/Story/)` (a varredura as substitui).
- [ ] **Step 2: Run** `npx jest src/share` → FAIL.
- [ ] **Step 3: Implement** as remoções e o rename. Conferir que `expo-sharing` e `expo-media-library` continuam sendo o caminho de "Compartilhar" e "Salvar na galeria".
- [ ] **Step 4: Run** `npx jest src/share src/app/__tests__/clip.test.tsx` → PASS; `npx tsc --noEmit`; `cd app/modules/replay-camera/ios/Core && swift test`.
- [ ] **Step 5: Commit** `refactor(share): remove Story; one made-with mark on every export`.

### Task 9: Editor, resumo e exportação por `session.paid`

**Files:**
- Modify: `app/src/share/exportOptions.ts`, `app/src/app/clip/[id].tsx`, `app/src/app/session/[id].tsx`, `app/src/app/setup.tsx` (só a prop do `RecordingPanel`), `app/src/i18n/locales/{pt-BR,en}.ts`
- Test: `app/src/share/__tests__/exportOptions.test.ts`, `app/src/app/__tests__/{clip,session}.test.tsx`

**Interfaces:**
- Consumes: `usePlan(sessionId)` (T3), `captureConfig`, `FREE_MAX_SECONDS` (T1), `state.bufferSeconds` (T4).
- Produces: `exportOptions(plan: Plan, edit: Clip['edit'], trim: Clip['trim']): ExportOptions` — `free`: 720x1280, `muted: true`, e se `endMs - startMs > 15_000` então `startMs = endMs - 15_000`; `paid`: 1080x1920, `muted` como hoje. Sem `watermark`.
- Editor: `maxMs = captureConfig(effectiveSettings(session.sport, prefs), plan).bufferSeconds * 1000`; velocidades sem trava (0.5x livre); botão de som numa sessão `free` mostra `clip.muted` e fica desabilitado.
- Resumo: sai o cartão `freeCard` (`summary.freeTitle`, `summary.freeNote`, `summary.upgrade`) e o import de `openPaywall`.
- `RecordingPanel bufferSeconds={session.state.bufferSeconds ?? settings.bufferSeconds}`.

- [ ] **Step 1: Write the failing tests.** `exportOptions.test.ts`: **qualidade por `session.paid`** — `free` → 720x1280 `muted:true`; `paid` → 1080x1920; trecho de 20 s no `free` → 15 s finais; nenhum resultado tem `watermark`. `clip.test.tsx`: sessão `{paid:false}` exporta 720x1280 e a prévia mostra `feito com LANCE`; sessão `{paid:true}` exporta 1080x1920 **e também mostra a marca**; sessão antiga com `passTransactionId` e sem `paid` exporta 1080x1920; `0.5x` numa sessão grátis altera o `edit` e não chama `openPaywall`; o botão de som numa sessão grátis está desabilitado. `session.test.tsx`: nenhuma sessão mostra `Gravação no plano grátis` nem `Liberar HD e recursos`.
- [ ] **Step 2: Run** `npx jest src/share src/app/__tests__/clip.test.tsx src/app/__tests__/session.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Remover as três chaves `summary.*` dos dois catálogos.
- [ ] **Step 4: Run** → PASS; `npx jest src/i18n`.
- [ ] **Step 5: Commit** `feat(editor): export quality and sound by session plan; slow motion free; mark on every plan`.

### Task 10: Catálogos e docs

**Files:**
- Modify: `app/src/i18n/locales/{pt-BR,en}.ts`, `docs/superpowers/specs/2026-10-20-payments-revenuecat-design.md` (só se algo divergiu)
- Test: `app/src/i18n/__tests__/*`

- [ ] **Step 1: Varredura das chaves.** `grep -rn "firstFree\|passCredits\|needsPayment\|watchProBadge\|watchProOnly\|freeTitle\|freeNote\|summary.upgrade\|lastFreeNote\|lockedNote" app/src` → nada. Conferir que o inglês das chaves novas (Tarefas 5, 6) é natural ("Available with Premium", "Your Single Pass will be used for this recording.") e que nenhum texto diz "Pro" onde o Passe também vale.
- [ ] **Step 2: Run** `npx jest src/i18n` → PASS (mesmas chaves, sem português fora dos catálogos).
- [ ] **Step 3:** Se alguma decisão de implementação divergiu do spec, atualizar o spec agora.
- [ ] **Step 4: Commit** `chore(i18n): free-plan limits copy in both catalogs` (pular se não houver mudança).

### Task 11: Verificação final e checklist de aparelho

**Files:** nenhum novo (ajustes só se algo falhar).

- [ ] **Step 1: Varredura.** Em `app/`: `grep -rnE "startGate|needsPayment|startBlocked|isFirstSessionUsed|firstSessionUsed|showProPaywall|openProPaywall|pro_only|PRO_ONLY|tierFor|useEntitlement|setSessionPass|watermark|'pass'" src modules targets` → nada. `grep -rniwE "instagram|story|stories|metaAppId" src modules/replay-camera/{src,ios,android/src} app.json targets` → nada. `grep -n "R\\$\|US\\$" src/i18n/locales` → nada.
- [ ] **Step 2: Run** `npx jest`, `npx tsc --noEmit`, `npx expo lint`, `cd modules/replay-camera/ios/Core && swift test` → tudo verde.
- [ ] **Step 3: Aparelho (build de desenvolvimento novo, Test Store `test_`; iOS e Android), instalação limpa:**
  1. Grátis: gravar 3 vezes seguidas sem paywall; 12+ clipes; cada clipe ≤ 15 s; arquivo salvo **sem trilha de áudio** (abrir no Fotos após exportar: sem som); captura 720p (60 fps onde houver); a **voz salva** no grátis (iOS); gesto e tela salvam.
  2. Grátis: relógio mostra "Disponível no Premium"; celular controle mostra o mesmo e Começar/Parar funcionam; teclas de volume do controle Bluetooth mudam o volume e não salvam.
  3. Preparação: cadeados de 30 s, Full HD, Com som e dos três gatilhos abrem o paywall do painel (tabela Grátis × Premium, teste de 7 dias no Pro); cancelar não muda nada.
  4. Comprar o Passe: a linha "Seu Passe Avulso será usado nesta gravação." aparece, os cadeados somem, a prévia reabre em Full HD; gravar → clipes de 30 s com som, 1080p; a gravação seguinte é grátis.
  5. Assinar o Pro com um crédito sobrando: grava pago sem gastar o crédito; com o Pro expirado (sandbox), a próxima gasta o crédito.
  6. Apagar a gravação paga com Passe: o crédito não volta. Reinstalar e "Restaurar compras": volta o Pro, nenhum crédito.
  7. Exportação: marca "feito com LANCE" nos dois planos; grátis 720p, pago 1080p; câmera lenta no grátis.
  8. Android: muxer sem áudio grava e salva; exportação de clipe sem trilha de áudio funciona (`setRemoveAudio`).
  9. Superaquecimento (se reproduzível): cai para 720p30 e o clipe grátis continua sem áudio.
- [ ] **Step 4:** Confirmar os critérios de aceite 1–8 do spec e reportar. Divergência = ajustar o spec no mesmo commit do ajuste.
- [ ] **Step 5: Commit** de qualquer ajuste (`fix(payments): …`).
