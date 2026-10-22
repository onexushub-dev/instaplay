# 5 gravações grátis por mês com limites, Passe como crédito, Pro mensal e anual, fim do Story — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Revisão final de 2026-10-23:** o modelo mudou depois das Tarefas 1–3 (feitas: `7225217`, `6c8379d`, `98dd602`). O grátis passa a ter **5 gravações por mês calendário** e o "Começar gravação" bloqueia a 6ª com o paywall; entra o `pro_annual`. As Tarefas 1–3 ficam como estão (o que o modelo novo muda nelas é feito nas Tarefas 4 e 5); as Tarefas 4–13 foram reescritas.

**Goal:** Trocar "primeira gravação grátis, pagar antes da segunda" por: 5 gravações grátis por mês (contador local), cada uma com clipe de até 15 s, sem som, HD 720p e só os gatilhos tela/gesto/voz; o pago (Pro mensal/anual ativo ou Passe consumido no início) dá gravações ilimitadas que não contam nas 5, duração do modo, som, Full HD e relógio/controle Bluetooth/celular controle. Esgotadas as 5, "Começar gravação" abre o paywall e, depois de uma compra, começa uma vez sozinho; o início remoto bloqueado não começa e avisa no remoto. Remover o Story; a marca "feito com LANCE" fica em toda exportação.

**Architecture:** O plano de cada sessão é decidido uma vez no início (`StartDecision` → `Session.paid`) e nunca recalculado. Regras puras em `app/src/payments/rules.ts` (decisão do início, com o contador do mês) e `app/src/payments/limits.ts` (o que cada plano captura, exporta e quais gatilhos liga). O contador mensal é um registro próprio no repo (`lance:v1:freeCount:YYYY-MM`), somado dentro de `repo.startSession` só para sessões grátis. A store ganha o relógio injetado e `{ kind: 'blocked' }`. `useReplaySession` abre a câmera com `captureConfig(settings, plan)`; a preparação mantém a câmera no plano do próximo início (`nextPlan`) e trata o início bloqueado. O nativo ganha `audio` em `startSession`, `720p60`, e `saveAllowed`/`startAllowed` no estado enviado ao relógio e ao celular controle.

**Tech Stack:** Expo 58 / React Native 0.88, TypeScript, Jest (`jest-expo`, `@testing-library/react-native`), MMKV, `react-native-purchases(-ui)`, Swift (módulo `replay-camera` + pacote `ios/Core` testável com `swift test`, app do relógio em `app/targets/watch`), Kotlin (Android, não compila aqui).

**Spec:** `docs/superpowers/specs/2026-10-20-payments-revenuecat-design.md` (revisão final de 2026-10-23) e as seções 3.2, 3.5, 3.6, 3.9 e 6 de `docs/superpowers/specs/2026-10-17-lance-design.md`.

## Global Constraints
- Produtos: `single_pass` (consumível), `pro_monthly` e `pro_annual` (entitlement `pro`, 7 dias grátis nas lojas nas duas). Uma oferta só: `default` (pacotes Anual, Mensal, `single_pass`). O app não conhece ids de assinatura: Pro = entitlement `pro`. Nenhum preço, valor ou símbolo de moeda em código ou catálogo.
- `FREE_RECORDINGS_PER_MONTH = 5`. Contador: chave `lance:v1:freeCount:<monthKey(now)>`, `monthKey` = `YYYY-MM` da data **local** do aparelho; só o mês corrente é lido; chaves velhas ignoradas. Sobe +1 dentro de `repo.startSession` só com `paid: false`, no mesmo `changed()`. Nunca desce (apagar sessão não mexe). Não é derivado das sessões.
- Decisão do início, nesta ordem: Pro ativo → `{kind:'pro'}` (não gasta crédito, não conta); crédito → `{kind:'credit', passTransactionId}` (o mais antigo, não conta); `freeUsed < 5` → `{kind:'free'}`; senão `{kind:'blocked'}`. **Falha (qualquer exceção ao ler repo/store) decide `{kind:'free'}`** — abre para o jogador; o limite pode ser ultrapassado com o armazenamento falhando (aceito, está no spec). Comentários e testes dizem "falha decide grátis", não "nunca bloqueia".
- `planOf` é `switch` exaustivo: `pro`/`credit` → `'paid'`; `free`/`blocked` → `'free'`. `nextPlan`, `usePlan()` e a trava do relógio nunca dão `'paid'` para `blocked`.
- `StartResult = 'started' | 'blocked' | 'failed' | 'busy'`. `'needsPayment'` sai do tipo, do código e do catálogo e não volta.
- `FREE_MAX_SECONDS = 15`. Grátis: `quality = hdQuality(modo)`, `cutSeconds = min(corte, 15)`, `bufferSeconds = min(buffer, 15)`, `audio = false`. Pago: `effectiveSettings` com `audio = settings.audio` (padrão `true`).
- Exportação: grátis 720x1280, `muted: true`, trecho ≤ 15 000 ms; pago 1080x1920. Quadro 9:16 com faixas nos dois (pergunta em aberto no spec; não mudar). A marca vai em **todos** os planos, desenhada só em `MadeWithMark.tsx`.
- Gatilhos pagos: `watch`, `remote` (Bluetooth), `phone` (celular controle). Grátis: `screen`, `gesture`, `voice`. Trava o **ligar**, nunca um toque: um evento de gatilho pago que chega durante a gravação vira lance.
- `session.paid` nunca muda depois de `repo.startSession`. Sessão sem `paid` (antiga) = `passTransactionId !== undefined`.
- Invariantes da store mantidos: pendência única, compra não explicada nunca vira crédito de outro, restauração nunca cria crédito, leitura antes de restaurar, `spentPasses` só cresce.
- Paywall **só fora da gravação**: os cadeados da preparação e o "Começar gravação" com `'blocked'`, sempre `openPaywall(t)` (oferta `default`). Nenhum paywall vindo de início remoto. Depois de um cadeado, nada começa sozinho; depois do paywall do início bloqueado, **uma** nova tentativa automática se o resultado for `'purchased'`/`'restored'`.
- A câmera nunca reabre com `phase` em `'starting'` (fora do próprio `start`), `'recording'` ou `'stopping'`.
- Selo das opções travadas: `Premium` (pt e en). Textos novos nos dois catálogos (`app/src/i18n/locales/pt-BR.ts`, `en.ts`), mesmas chaves (`src/i18n/__tests__/catalogs.test.ts` confere), plurais `{ one, other }` com `%{count}`; inglês americano natural.
- Em `app/`: `npx jest <caminho>`; antes de cada commit `npx tsc --noEmit` e `npx expo lint`. Swift Core: `cd app/modules/replay-camera/ios/Core && swift test`. Nunca iniciar o servidor de desenvolvimento.
- Commits direto em `feat/payments-revenuecat`. Toda mensagem termina com linha em branco e `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Fora deste plano: login, backend, contador no servidor, painel do RevenueCat/lojas (spec, "Passos fora do código"), redesenho da marca, quadro da exportação, Wear OS.

## Review Focus
1. **6ª gravação do mês e a nova tentativa única:** `blocked` → paywall → `'purchased'` com o snapshot atrasado → a nova tentativa relê, continua `blocked`, não abre outro paywall e não entra em laço; quando o listener entrega o Passe, a linha de status muda e o próximo toque começa pago (Tarefas 5 e 8).
2. **O contador sobe exatamente uma vez por sessão grátis realmente começada:** câmera falhando, segunda decisão `blocked`, duplo toque (`'busy'`) e sessões pagas não contam; apagar jogos não devolve vaga (Tarefas 4 e 6).
3. **Virada do mês e falha de armazenamento:** um `blocked` mostrado na preparação some ao voltar ao app num mês novo (`recheckMonth`); o toque decide com o relógio da hora; qualquer exceção decide `free` (Tarefas 5 e 8).
4. **Início remoto bloqueado:** relógio e celular controle não começam, nenhum paywall abre, o remoto mostra a nota do limite mensal e **nunca** "Abra o LANCE no iPhone"; um Começar com estado velho recebe o estado reenviado (Tarefas 7 e 9).
5. **Pro vence entre a preparação e o início:** a câmera aberta em Full HD com som é reaberta em HD sem som antes de criar a sessão (`paid: false`, contador +1) ou, com o mês esgotado, o início volta a `idle` sem sessão (Tarefa 6).
6. **Duplo toque em "Começar gravação" com um crédito** (ou toque + início remoto): uma sessão, um crédito gasto, o segundo `start` dá `'busy'` (Tarefa 6).
7. **Corrida de reabertura quando o plano muda:** compra/expiração notifica durante `start` ou durante a gravação; o efeito da preparação não reabre a câmera fora de `idle`/`ended` (Tarefas 6 e 8).
8. **Sessões gravadas antes desta mudança** (sem `paid`, clipes 1080p com som): abrem, editam e exportam conforme `sessionPlan`, sem regravar dados; não entram no contador (Tarefas 2 e 11).

---

## File Structure
- Create `app/src/payments/limits.ts` (feito), `app/src/share/MadeWithMark.tsx`, `app/modules/replay-camera/ios/Core/Sources/ReplayCore/CapturePlan.swift` (+ `Tests/ReplayCoreTests/CapturePlanTests.swift`)
- Rename `app/src/share/ShareOverlay.tsx` → `ExportOverlay.tsx` (+ teste); `app/src/session/useWatchTriggerGate.ts` → `useSaveGate.ts` (+ teste)
- Modify `app/src/payments/{types,rules,limits,store,feedback,index,useStartPreview}.ts`, `app/src/share/{entitlement,exportOptions}.ts`
- Modify `app/src/data/{schema,repo}.ts`, `app/src/session/{reducer,useReplaySession,SessionContext,RemoteStartListener}.ts(x)`
- Modify `app/src/app/{_layout,setup,remote,games}.tsx`, `app/src/app/session/[id].tsx`, `app/src/app/clip/[id].tsx`, `app/src/components/{TriggerTile,RecordingPanel}.tsx`
- Modify `app/modules/replay-camera/{src/*.ts, ios/*.swift, ios/Core/..., android/src/main/...}`, `app/targets/watch/{ContentView,WatchLink,WatchModel,WatchMessage}.swift`, `app/targets/watch/Localizable.xcstrings`, `app/app.json`
- Delete `app/modules/replay-camera/ios/InstagramStory.swift`, `.../android/.../InstagramStory.kt`, `.../android/src/main/res/xml/replay_file_paths.xml`
- Modify `app/src/i18n/locales/{pt-BR,en}.ts`

---

### Task 1: Regras puras — plano do início, plano da sessão, limites e gatilhos ✅ FEITA (`7225217`)

**Files:**
- Create: `app/src/payments/limits.ts`, `app/src/payments/__tests__/limits.test.ts`
- Modify: `app/src/payments/types.ts`, `app/src/payments/rules.ts`, `app/modules/replay-camera/src/ReplayCamera.types.ts` (só o tipo `Quality`), `app/src/data/schema.ts` (só `ModeSettings`)
- Test: `app/src/payments/__tests__/rules.test.ts`

**Interfaces (como entregue):**
- `types.ts`: `type Plan = 'free' | 'paid'`; `StartDecision = { kind: 'pro' } | { kind: 'credit'; passTransactionId: string } | { kind: 'free' }`.
- `rules.ts`: `startPlan({ proActive, credit? })`, `planOf(d)`, `sessionPlan(s)`; `availableCredit`, `creditCount`, `detectPurchase`.
- `limits.ts`: `FREE_MAX_SECONDS = 15`, `CaptureConfig`, `hdQuality`, `captureConfig(settings, plan)`, `PAID_TRIGGERS`, `triggerAllowed`.
- `Quality` com `'720p60'`; `ModeSettings.audio` (padrão `true`).

**Ajustes do modelo final (feitos na Tarefa 4, não aqui):** `startPlan` ganha `freeUsed` e `{kind:'blocked'}`; `planOf` vira `switch` exaustivo; `captureConfig` grátis usa `bufferSeconds = min(buffer do modo, 15)` (hoje fixa 15; mesmo resultado nos modos atuais, mas o spec diz `min`).

- [x] **Step 1: Write the failing tests.**
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** → PASS; chamadores mínimos.
- [x] **Step 5: Commit** `feat(payments): plan per start and per session, free capture limits and paid triggers`.

### Task 2: Dados — `Session.paid`, sem marca de primeira sessão, ledger mantido ✅ FEITA (`6c8379d`)

**Files:**
- Modify: `app/src/data/schema.ts`, `app/src/data/repo.ts`
- Test: `app/src/data/__tests__/repo.test.ts`

**Interfaces (como entregue):**
- `Session.paid?: boolean`; `repo.startSession(sport, now, { paid, passTransactionId? })` — grava `paid`, `passTransactionId` e o ledger, um único `changed()`.
- Removidos: `repo.isFirstSessionUsed`, a chave `lance:v1:firstSessionUsed`, `repo.setSessionPass`. Mantidos: `spentPasses()` (com a migração), `spendPasses(ids)`.

**Ajuste do modelo final (Tarefa 4):** `startSession` também soma o contador mensal quando `paid: false`; novo `repo.freeCount(now)`. O teste "startSession does not write the first-session marker" contém o literal `firstSessionUsed`; a varredura da Tarefa 13 o ignora (ou o teste passa a montar a chave por concatenação).

- [x] **Step 1–4.**
- [x] **Step 5: Commit** `refactor(data): session paid flag set at start; drop the first-session marker`.

### Task 3: Store — decisão de início, uma oferta só, plano por sessão ✅ FEITA (`98dd602`)

**Files:**
- Modify: `app/src/payments/{store.ts, feedback.ts, client.ts, revenuecatClient.ts, fakeClient.ts, types.ts, useStartPreview.ts}`, `app/src/share/entitlement.ts`
- Test: `app/src/payments/__tests__/{store,feedback,revenuecatClient}.test.ts`, `app/src/share/__tests__/entitlement.test.tsx`

**Interfaces (como entregue):**
- `createPaymentsStore(client, repo: Pick<Repo, 'getSession' | 'spentPasses' | 'spendPasses'>)`: `peekStart()`, `startDecision()` (relê sem snapshot ou com pendência; exceção → `free`), `nextPlan()`, `credits()`, `showPaywall()` (sem parâmetro, nunca rejeita), `restore()`.
- `client.showPaywall()` sem oferta (a atual, `default`); `Tier`, `PRO_ONLY_OFFERING`, `tierFor`, `showProPaywall`, `openProPaywall`, `useEntitlement` removidos.
- `feedback.ts`: `openPaywall(t)`. `usePlan(sessionId?)` em `src/share/entitlement.ts`. `useStartPreview(): { decision, credits }`.

**Ajustes do modelo final (Tarefa 5):** a store passa a poder decidir `blocked` (com o contador e um relógio injetado); os comentários "never blocks" mudam para "a failure decides free". O resto (invariantes, corridas fixadas em `describe('races')`) continua valendo. A correção do `planOf` exaustivo que a revisão da Tarefa 3 pediu é coberta pela Tarefa 4 se ainda não estiver no branch.

- [x] **Step 1–4.**
- [x] **Step 5: Commit** `refactor(payments): start decision never blocks; one default offering; plan per session`.

### Task 4: Regras e dados do limite mensal — `blocked`, `monthKey`, contador no repo

**Files:**
- Modify: `app/src/payments/{types,rules,limits}.ts`, `app/src/data/repo.ts`
- Test: `app/src/payments/__tests__/{rules,limits}.test.ts`, `app/src/data/__tests__/repo.test.ts`

**Interfaces:**
- `types.ts`: `StartDecision = { kind: 'pro' } | { kind: 'credit'; passTransactionId: string } | { kind: 'free' } | { kind: 'blocked' }`.
- `rules.ts`:
  - `FREE_RECORDINGS_PER_MONTH = 5`
  - `monthKey(now: number): string` — `YYYY-MM` da data local (`new Date(now).getFullYear()`, `getMonth() + 1` com dois dígitos).
  - `startPlan(input: { proActive: boolean; credit?: PassTransaction; freeUsed: number }): StartDecision` — Pro → `pro`; crédito → `credit`; `freeUsed < 5` → `free`; senão `blocked`.
  - `planOf(d)`: `switch (d.kind)` exaustivo (`const _never: never = d` no `default`); `blocked` → `'free'`.
  - `freeLeft(freeUsed: number): number` = `max(0, 5 - freeUsed)`.
- `limits.ts`: `captureConfig(..., 'free').bufferSeconds = Math.min(settings.bufferSeconds, FREE_MAX_SECONDS)`.
- `repo.ts`:
  - chave `freeCount: (month: string) => \`lance:v1:freeCount:${month}\``;
  - `freeCount(now: number): number` — lê a chave do mês de `now`; ausente, ilegível ou não-inteiro ≥ 0 → `0`;
  - `startSession(sport, now, plan)`: com `plan.paid === false` grava `freeCount(now) + 1` na chave do mês de `now`, antes do único `changed()`. Com `paid: true` não mexe.
  - `deleteSession`/`deleteClip` não mexem no contador.

- [ ] **Step 1: Write the failing tests.** `rules.test.ts`:
  - `startPlan({proActive:true, credit:A, freeUsed:5})` → `{kind:'pro'}` (Pro ignora o contador e não gasta crédito); `({false, A, 5})` → `credit` (crédito vale com o mês esgotado); `({false, undefined, 0})` e `(…4)` → `free`; `(…5)` e `(…6)` → `blocked`.
  - `planOf({kind:'blocked'}) === 'free'`; os outros três como antes.
  - `monthKey`: `new Date(2026, 0, 5).getTime()` → `'2026-01'`; `new Date(2026, 11, 31, 23, 59).getTime()` → `'2026-12'`; `new Date(2027, 0, 1, 0, 0).getTime()` → `'2027-01'` (horário local, construído com o construtor local para o teste não depender do fuso).
  - `freeLeft(0)=5`, `freeLeft(4)=1`, `freeLeft(7)=0`.
  `limits.test.ts`: `captureConfig({...court, bufferSeconds: 10}, 'free').bufferSeconds === 10`.
  `repo.test.ts`:
  - `startSession('quadra', t, {paid:false})` duas vezes → `freeCount(t) === 2`; assinantes notificados uma vez por início.
  - `startSession(…, {paid:true})` e `{paid:true, passTransactionId}` → `freeCount` não muda.
  - **Apagar não devolve vaga:** `deleteSession` das duas → `freeCount(t)` ainda `2`.
  - **Mês novo:** `t2` no mês seguinte → `freeCount(t2) === 0`; o valor de `t` continua no KV (não é apagado).
  - Valor corrompido na chave (`'abc'`, `'-3'`) → `freeCount` = 0 e o próximo início grava `1`.
  - Sessões antigas no KV (sem contador) não contam: `freeCount` = 0.
- [ ] **Step 2: Run** `npx jest src/payments/__tests__/rules.test.ts src/payments/__tests__/limits.test.ts src/data/__tests__/repo.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Chamadores de `startPlan` (só `store.decide`) passam `freeUsed: 0` provisoriamente; a Tarefa 5 liga o contador. Onde `StartDecision` é tratado com `switch`/`if` (setup, `useStartPreview`), só o mínimo para compilar.
- [ ] **Step 4: Run** o mesmo → PASS; `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(payments): five free recordings per calendar month; blocked start decision`.

### Task 5: Store — relógio injetado, contador, `blocked`, virada do mês

**Files:**
- Modify: `app/src/payments/{store.ts, index.ts, useStartPreview.ts}`, `app/src/app/_layout.tsx` (listener de `AppState`), `app/src/share/entitlement.ts` (só comentário, se preciso)
- Test: `app/src/payments/__tests__/{store,useStartPreview}.test.ts(x)`, `app/src/share/__tests__/entitlement.test.tsx`

**Interfaces:**
- Consumes: `startPlan`, `planOf`, `freeLeft`, `monthKey`, `FREE_RECORDINGS_PER_MONTH` (T4); `repo.freeCount` (T4).
- `createPaymentsStore(client, repo: Pick<Repo, 'getSession' | 'spentPasses' | 'spendPasses' | 'freeCount'>, now: () => number = Date.now)`.
- `decide()`: `startPlan({ proActive, credit, freeUsed: repo.freeCount(now()) })`; guarda `lastMonth = monthKey(now())`; qualquer exceção → `{kind:'free'}` (comentário: "a storage failure decides free: it never stops a player from recording, and can let the monthly cap through").
- `peekStart()`, `startDecision()` (mesma releitura de hoje) podem devolver `blocked`. `nextPlan()` = `planOf(decide())` (`'free'` com `blocked`).
- Novo `freeLeft(): number` = `freeLeft(repo.freeCount(now()))`, exceção → `FREE_RECORDINGS_PER_MONTH`.
- Novo `recheckMonth(): void` — se `monthKey(now()) !== lastMonth`, notifica.
- `index.ts`: `createPaymentsStore(client, repo)` (o padrão `Date.now`).
- `_layout.tsx`: `AppState.addEventListener('change', s => s === 'active' && payments.recheckMonth())`, montado uma vez junto do `payments.start()`.
- `useStartPreview(): { decision: StartDecision; credits: number; freeLeft: number }` — continua assinando store e repo (o contador vive no repo, então um início grátis re-renderiza).

- [ ] **Step 1: Write the failing tests** (`store.test.ts`; repo em memória ganha `freeCount` ajustável; `now` falso):
  - Sem Pro, sem crédito, `freeCount = 4` → `peekStart()` = `free`, `freeLeft()` = 1; `= 5` → `blocked`, `nextPlan()` = `'free'`, `freeLeft()` = 0.
  - Pro com `freeCount = 9` → `pro`; crédito com `9` → `credit`.
  - **Falha decide grátis:** `repo.freeCount` lançando com `9` "real" → `peekStart()` e `startDecision()` = `free` (renomear os títulos antigos "never blocks" para "a failure decides free").
  - **Compra atrasada no início bloqueado:** `freeCount = 5`, `showPaywall()` → `purchased` sem a transação no snapshot → `startDecision()` relê e dá `blocked` sem lançar; o listener entrega `tx-2` → `peekStart()` = `credit`.
  - Restauração trazendo só Passes antigos com `freeCount = 5` → continua `blocked` (restauração não cria crédito).
  - **Virada do mês:** `now` em 31/jan com `freeCount(jan) = 5` → `blocked`; `now` passa para 1/fev → `recheckMonth()` notifica uma vez e `peekStart()` = `free`; `recheckMonth()` de novo no mesmo mês não notifica.
  - `useStartPreview.test.tsx`: `freeLeft` muda de 5 para 4 quando o repo notifica um início grátis.
  - `entitlement.test.tsx`: `usePlan()` = `'free'` com `blocked`.
  - Os testes de `describe('races')` continuam passando sem mudança de expectativa (todos com `freeCount = 0`).
- [ ] **Step 2: Run** `npx jest src/payments src/share/__tests__/entitlement.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(payments): the store counts the month's free recordings and can block a start`.

### Task 6: Início da sessão — plano, limites de captura, crédito, contador e bloqueio

**Files:**
- Modify: `app/src/session/{useReplaySession.ts, reducer.ts, SessionContext.tsx}`
- Test: `app/src/session/__tests__/{useReplaySession.test.tsx, reducer.test.ts}`

**Interfaces:**
- Consumes: `StartDecision`, `planOf` (T4), `captureConfig`, `CaptureConfig`, `triggerAllowed` (T1), `repo.startSession` (T2/T4), `payments.startDecision` (T5).
- Produces:
  - `StartResult = 'started' | 'blocked' | 'failed' | 'busy'` (`'needsPayment'` sai). `SessionDeps.startDecision` com comentário novo (Pro, crédito, grátis do mês, ou bloqueado).
  - Ação `startBlocked` **fica** no reducer: volta `phase` de `'starting'` para `idle` (ou `ended`, como estava) sem erro, câmera mantida.
  - `prepare(mode: ModeId, plan: Plan): Promise<boolean>` — abre a câmera com `captureConfig(effectiveSettings(mode, prefs), plan)`; chave `quality|buffer|audio` (contínuo) ou `lens|quality|buffer|audio`; passa `audio` a `camera.startSession`. Fora de `start`, com `phase` em `'starting' | 'recording' | 'stopping'` resolve `true` sem tocar na câmera.
  - Ação `started` leva `paid: boolean` e `bufferSeconds: number`; `ReplayState` ganha `paid?: boolean` e `bufferSeconds?: number` (limpos em `reset`/`stopped`).
  - `SessionOptions` (TS) ganha `audio?: boolean` (o nativo é a Tarefa 7).
  - O corte de cada `save` usa o `cutSeconds` do `CaptureConfig` guardado no início (ref).
  - `deps.useRemote(phase === 'recording' && triggerAllowed('remote', state.paid ? 'paid' : 'free'), …)`.

- [ ] **Step 1: Write the failing tests** (`useReplaySession.test.tsx`; `fakeDeps.startDecision` ajustável, repo real em memória):
  - **Bloqueado não toca em nada:** `{kind:'blocked'}` → `start` = `'blocked'`; nenhum `dispatch` de `startRequested` (fase continua `idle`), `camera.startSession` não chamado, nenhuma sessão, `freeCount` igual.
  - **Bloqueado na segunda decisão:** 1ª `'pro'`, 2ª `'blocked'` → `'blocked'`, fase `idle`, nenhuma sessão, contador igual, câmera continua aberta.
  - **Grátis com limites e contador:** `{kind:'free'}` → `'started'`; `camera.startSession` com `{ maxQuality: '720p60', bufferSeconds: 15, audio: false }`; 12 `save` → 12 clipes com `trim` ≤ 15 000 ms; sessão `paid: false`; `repo.freeCount(now)` = 1; `state.bufferSeconds === 15`.
  - **Pago pelo Pro:** `startSession` com `{ '1080p60', 60, audio: true }`, sessão `paid: true`, `spentPasses()` vazio, `freeCount` = 0.
  - **Crédito gasto uma vez e não conta:** `{kind:'credit', passTransactionId:'tx-1'}` → `paid: true`, `passTransactionId: 'tx-1'`, `spentPasses()` = `{tx-1}`, `freeCount` = 0.
  - **Câmera falha não conta:** `{kind:'free'}` com `LOW_STORAGE` → `'failed'`, nenhuma sessão, `freeCount` = 0; com `{kind:'credit'}` → `spentPasses()` vazio.
  - **Plano muda antes do início reabre a câmera:** `prepare('quadra','free')` abre HD; `startDecision` → `'pro'` → `stopSession`/`startSession` com Full HD+som antes de criar a sessão.
  - **Pro vence entre a 1ª e a 2ª decisão:** 1ª `'pro'`, 2ª `'free'` → reabre em HD sem som, `paid: false`, `freeCount` = 1.
  - **Duplo toque:** dois `start` sem `await` com `{kind:'free'}` → `'started'` + `'busy'`; uma sessão; `freeCount` = 1. O mesmo com crédito → um id no ledger.
  - **Durante a gravação não reabre:** gravando, `prepare('quadra', 'free')` numa sessão paga não toca na câmera.
  - **Bluetooth só em sessão paga**; **toque pago numa sessão grátis vira lance** (`onTrigger` `{source:'watch'}` → 1 clipe).
  - Apagar os testes de `'needsPayment'`/primeira sessão.
  `reducer.test.ts`: `started` guarda `paid` e `bufferSeconds`; `startBlocked` volta de `starting` para `idle` sem erro.
- [ ] **Step 2: Run** `npx jest src/session` → FAIL.
- [ ] **Step 3: Implement** `start`:

```ts
// decide → (blocked: stop here) → open camera for that plan → decide again → reopen if the plan changed → create the session.
let decision = await safeDecision();             // never throws: failures are { kind: 'free' }
if (decision.kind === 'blocked') return 'blocked'; // nothing touched: the setup screen opens the paywall
dispatch({ type: 'startRequested' });
if (!(await openCamera(sport, planOf(decision)))) { /* startFailed, 'failed' */ }
const again = await safeDecision();
if (again.kind === 'blocked') { dispatch({ type: 'startBlocked' }); return 'blocked'; }
if (planOf(again) !== planOf(decision) && !(await openCamera(sport, planOf(again)))) { /* startFailed */ }
decision = again;                                 // the session always matches the camera that is open
const config = captureConfig(effectiveSettings(sport, prefs), planOf(decision));
const session = deps.repo.startSession(sport, deps.now(), {   // counts a free session, spends a credit
  paid: planOf(decision) === 'paid',
  ...(decision.kind === 'credit' ? { passTransactionId: decision.passTransactionId } : {}),
});
```
  `openCamera` é o corpo atual de `prepare` sem a guarda de fase; `prepare` = guarda + `openCamera`. `setup.tsx` só para compilar: `!== 'needsPayment'` → `!== 'blocked'` (a Tarefa 8 reescreve).
- [ ] **Step 4: Run** `npx jest src/session` → PASS; `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(session): the start decision sets capture limits, spends a credit or counts a free recording, or blocks`.

### Task 7: Nativo — clipe sem áudio, 720p60, `saveAllowed` e `startAllowed` nos remotos

**Files:**
- Create: `app/modules/replay-camera/ios/Core/Sources/ReplayCore/CapturePlan.swift`, `.../Tests/ReplayCoreTests/CapturePlanTests.swift`
- Modify: `ios/{CaptureController,ReplayEngine,ReplayCameraModule,RemoteHost,WatchBridge}.swift`, `ios/Core/Sources/ReplayCore/{RemoteMessage,WatchMessage}.swift` (e a cópia `app/targets/watch/WatchMessage.swift`, idêntica), `ios/Core/Tests/ReplayCoreTests/{RemoteMessageTests,WatchMessageTests,BufferPlanTests}.swift`, `android/src/main/java/expo/modules/replaycamera/{ReplayCameraModule,ReplayEngine,SegmentEncoder,CaptureController}.kt`, `src/{ReplayCamera.ts, ReplayCameraModule.ts, ReplayCameraModule.web.ts, ReplayCamera.types.ts}`, `app/src/app/remote.tsx`, `app/src/i18n/locales/{pt-BR,en}.ts`
- Test: `swift test` (Core), `app/modules/replay-camera/src/__tests__/*`, `app/src/app/__tests__/remote.test.tsx`

**Interfaces:**
- Core: `public enum CapturePlan { static func target(quality: String) -> (width: Int32, fps: Double); static func writerHasAudio(micInput: Bool, clipAudio: Bool) -> Bool }` — `"1080p60"→(1920,60)`, `"1080p30"→(1920,30)`, `"720p60"→(1280,60)`, outros `(1280,30)`. `CaptureController.target(for:)` chama `CapturePlan.target`.
- Core: `RemoteMessage.state(recording:clipCount:startedAt:saveAllowed:startAllowed:)` e `WatchMessage.state(…, saveAllowed:, startAllowed:)`; payload com as chaves; decode sem a chave ou com tipo errado → `true`.
- iOS: `SessionOptions.audio: Bool = true`; `ReplayEngine.start(…, audio:)` guarda `clipAudio`; `startWriter` usa `withAudio: CapturePlan.writerHasAudio(micInput: capture.hasAudio, clipAudio: clipAudio)` (também após reconfiguração térmica). O microfone continua na captura e alimenta `voice` nos dois planos.
- iOS: `Function("remoteSetSaveAllowed")`, `Function("remoteSetStartAllowed")`, `Function("watchSetStartAllowed")` (o `watchSetSaveAllowed` existe). `RemoteHost` e `WatchBridge` repetem o último estado com as duas chaves. **Começar com estado velho:** ao receber `.start` com `startAllowed == false`, reenviam o último estado na hora (além de emitir `onRemoteStart`, que o JS ignora com `'blocked'`).
- Android: `SessionOptions.audio = true`; `SegmentEncoder(…, withAudio: Boolean)`: sem áudio não cria `AudioRecord`/encoder de áudio nem trilha; o muxer começa só com o vídeo. `CaptureController`: `"720p60"` → 1280x720 a 60 se a faixa existir. `remoteSet*Allowed`/`watchSetStartAllowed` no-op.
- TS: `SessionOptions.audio?: boolean`, `remoteSetSaveAllowed(allowed)`, `remoteSetStartAllowed(allowed)`, `watchSetStartAllowed(allowed)`; `onRemoteState` com `saveAllowed?` e `startAllowed?`.
- `remote.tsx`: `saveAllowed === false` → Salvar dá lugar a `remote.premiumOnly`; `startAllowed === false` e sem gravação → Começar dá lugar a `remote.freeLimit`, e um "Começando…" pendente termina sem o aviso de falha. Começar/Parar e a imagem continuam nos outros casos.
- Chaves (pt-BR | en): `remote.premiumOnly` `Disponível no Premium` | `Available with Premium`; `remote.freeLimit` `As gravações grátis deste mês acabaram. Escolha um plano no celular da câmera.` | `This month's free recordings are used up. Choose a plan on the camera phone.`

- [ ] **Step 1: Write the failing tests.** `CapturePlanTests`: os quatro alvos; `writerHasAudio(true,false) == false` (**voz mantém o microfone, o clipe fica sem áudio**); `(true,true) == true`; `(false,true) == false`. `BufferPlanTests`: `segments(forSeconds: 15, segmentSeconds: 2) == 8`. `RemoteMessageTests` e `WatchMessageTests`: `.state` com as duas chaves; decode sem elas → `true/true`; `"startAllowed":"no"` → `true`. `remote.test.tsx`: `saveAllowed:false` mostra `Disponível no Premium` e tocar não envia save; `startAllowed:false` mostra a nota do limite, sem Começar; com "Começando…" pendente, chegar `startAllowed:false` troca pela nota e não mostra a falha de início; sem as chaves, como hoje.
- [ ] **Step 2: Run** `cd app/modules/replay-camera/ios/Core && swift test` e `npx jest src/app/__tests__/remote.test.tsx` → FAIL.
- [ ] **Step 3: Implement** o Core e a ligação iOS/Android/TS acima.
- [ ] **Step 4: Run** `swift test` → PASS; `npx jest src/app/__tests__/remote.test.tsx modules` → PASS; `npx tsc --noEmit`. Anotar no relatório: iOS/Android não compilam aqui; ficam para a Tarefa 13 (aparelho).
- [ ] **Step 5: Commit** `feat(camera): clips without an audio track, 720p60, and tell remotes whether Save and Start are allowed`.

### Task 8: Preparação — linha de status, início bloqueado com paywall e nova tentativa, opções do clipe travadas

**Files:**
- Modify: `app/src/app/setup.tsx`, `app/src/components/TriggerTile.tsx` (só o comentário do selo), `app/src/i18n/locales/{pt-BR,en}.ts`
- Test: `app/src/app/__tests__/setup.test.tsx`

**Interfaces:**
- Consumes: `usePlan()`, `useStartPreview()` (`decision`, `freeLeft`) (T5), `openPaywall(t)`, `payments.recheckMonth()` (T5), `prepare(mode, plan)` e `StartResult` (T6), `withModeOverride` (`cutSeconds`, `quality`, `audio`), `FREE_RECORDINGS_PER_MONTH`.
- `onStart` (o `busy` ref do duplo toque fica):

```ts
if ((await session.start(modeId)) !== 'blocked') return;
const outcome = await openPaywall(t);              // cancel: silent; error: the usual short notice
// One retry right after a purchase or restore: the player already asked to start. It re-reads the store; if the
// purchase has not shown up yet it is still 'blocked' and nothing else opens (the status line updates later).
if (outcome === 'purchased' || outcome === 'restored') await session.start(modeId);
```
- `useFocusEffect(() => payments.recheckMonth())` (virada do mês com a preparação aberta por baixo de outra tela).
- Linha de status (`startNote`): `pro` → nada; `credit` → `setup.passWillBeUsed`; `free` → `setup.freeLeft` com `count: freeLeft`; `blocked` → `setup.freeUsedUp` com `limit: FREE_RECORDINGS_PER_MONTH`.
- Efeito da câmera: `if (live) void prepare(modeId, plan)` com `plan = usePlan()` nas dependências.
- Nova seção `setup.clip` com três linhas de `Chip`: duração (`15 s` | `${modeDefaults.cutSeconds} s`), qualidade (`HD` | `Full HD`), som (`setup.clipMuted` | `setup.clipSound`). No `free`: valor grátis selecionado; o pago com cadeado + `Premium` e `onPress={() => void openPaywall(t)}` (sem começar nada depois). No `paid`: grava `withModeOverride`. O `Chip` ganha `lockedBadge?: string`, como o `TriggerTile`.
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
| `setup.freeLeft` | `{ one: 'Resta %{count} gravação grátis este mês', other: 'Restam %{count} gravações grátis este mês' }` | `{ one: '%{count} free recording left this month', other: '%{count} free recordings left this month' }` |
| `setup.freeUsedUp` | `Suas %{limit} gravações grátis deste mês acabaram. Escolha um plano ou o Passe Avulso.` | `Your %{limit} free recordings for this month are used up. Choose a plan or a Single Pass.` |

  Saem: `setup.firstFree`, `setup.passCredits`, `setup.needsPayment`, `setup.watchProBadge`, `setup.watchProOnly`.

- [ ] **Step 1: Write the failing tests** (mock de `../../payments` com `peekStart`, `credits`, `freeLeft`, `nextPlan`, `recheckMonth`, `subscribe`, `version`; de `../../payments/feedback` com `openPaywall`):
  - Linha de status: `free` com `freeLeft` 5 → `Restam 5 gravações grátis este mês`; 1 → `Resta 1 gravação grátis este mês`; `credit` → a linha do Passe; `pro` → nenhuma; `blocked` → `Suas 5 gravações grátis deste mês acabaram. Escolha um plano ou o Passe Avulso.`
  - **Começar com plano livre:** `session.start` → `'started'`; `openPaywall` nunca chamado; duplo toque → `start` uma vez.
  - **Bloqueado + cancelar:** `start` → `'blocked'` → `openPaywall` uma vez → `'cancelled'` → `start` chamado só uma vez, sem alerta.
  - **Bloqueado + comprar:** `'purchased'` → `start` chamado de novo exatamente uma vez; se a segunda devolver `'blocked'`, `openPaywall` **não** é chamado de novo. O mesmo com `'restored'`. `'error'` → sem nova tentativa.
  - **Virada do mês:** ao ganhar foco, `recheckMonth` é chamado.
  - Cadeados: no `free`, `30 s`, `Full HD`, `Com som` com selo `Premium`; tocar em `Full HD` chama `openPaywall` uma vez, não muda as prefs e não chama `session.start` mesmo com `'purchased'`.
  - **Destrava depois da compra:** o mock passa a `'paid'` e notifica → sem selos; tocar em `Com som`/`Sem som` grava `audio` por modo.
  - **Câmera segue o plano:** `prepare` com `('quadra','free')` e, após a notificação, `('quadra','paid')`.
  - Os testes antigos de `firstFree`/`passCredits`/`needsPayment` saem.
- [ ] **Step 2: Run** `npx jest src/app/__tests__/setup.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx jest src/app/__tests__/setup.test.tsx src/i18n` → PASS; `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(setup): monthly free count, blocked start opens the paywall and retries once; clip options locked on free`.

### Task 9: Gatilhos pagos e início remoto bloqueado — relógio, controle Bluetooth, celular controle

**Files:**
- Modify: `app/src/session/{SessionContext.tsx, useWatchTriggerGate.ts → useSaveGate.ts, RemoteStartListener.tsx}`, `app/src/app/setup.tsx`, `app/targets/watch/{ContentView,WatchLink,WatchModel}.swift`, `app/targets/watch/Localizable.xcstrings`
- Test: `app/src/session/__tests__/{useSaveGate,RemoteStartListener}.test.tsx`, `app/src/app/__tests__/setup.test.tsx`, `ios/Core/Tests` (se `WatchModel.startOutcome` estiver no Core; senão, teste do alvo do relógio onde existir)

**Interfaces:**
- Consumes: `triggerAllowed` (T1), `usePlan()`, `useStartPreview()` (T5), `state.paid` (T6), `remoteSetSaveAllowed`, `remoteSetStartAllowed`, `watchSetStartAllowed` (T7).
- `useSaveGate(recording, allowed, send)` (lógica de `nextWatchGate`, renomeada `nextSaveGate`), usada duas vezes no `SessionProvider`: relógio com `camera.watchSetSaveAllowed`, celular controle com `camera.remoteSetSaveAllowed`. `allowed = recording ? triggerAllowed(src, state.paid ? 'paid' : 'free') : triggerAllowed(src, nextPlan)`.
- `SessionProvider` envia `startAllowed = peekStart().kind !== 'blocked'` (só muda fora de gravação; gravando, mantém o último) a `watchSetStartAllowed` e `remoteSetStartAllowed` quando muda.
- `RemoteStartListener`: `router.navigate('/setup')` e `session.start(...)`; com `'blocked'` não faz mais nada (nunca `openPaywall`). Comentário: "a blocked remote start brings the setup forward; the remote shows the monthly note".
- Setup: blocos `Controle Bluetooth`, `Relógio`, `Conectar um celular controle` no `free` com `lockedBadge={t('setup.premium')}`, `lockedHint={t('setup.premiumOnly')}`, `onPress={() => void openPaywall(t)}`; no `paid` como hoje. O teste de tecla de volume da preparação só liga no `paid`. O resumo recolhido não conta um gatilho travado como ligado.
- Relógio: `ProOnlyNote` → `PremiumOnlyNote` ("Available with Premium"/"Disponível no Premium", acessibilidade incluída). `WatchLink` guarda `startAllowed` do estado; `idleView` com `startAllowed == false` mostra `FreeLimitNote` ("Free recordings used up this month" / "Choose a plan on your iPhone."; pt: "Gravações grátis do mês acabaram" / "Escolha um plano no iPhone.") no lugar de "Start recording". `WatchModel.startOutcome` ganha `.blocked` (estado recebido depois do pedido com `startAllowed == false`): limpa `starting`, sem `markStartFailed`, sem `PhoneClosedView`.

- [ ] **Step 1: Write the failing tests.** `useSaveGate.test.tsx` (renomeado): fora de gravação segue o `allowed`; gravando, `allowed` que cai para `false` só é enviado ao fim (mantido); começar com crédito → um único envio. `SessionContext`/teste do provider: `blocked` → `watchSetStartAllowed(false)` e `remoteSetStartAllowed(false)`; voltar a `free` → `true`. `RemoteStartListener.test.tsx`: `start` → `'blocked'` navega para `/setup`, não chama `openPaywall`, nenhuma sessão. `setup.test.tsx`: no `free` os três blocos mostram `Premium` e abrem `openPaywall` sem `router.push('/devices'|'/pairing')`; no `paid` navegam; `Usar este celular como controle` nunca tem selo. Relógio: `startOutcome(askedAt:…, recording:false, startAllowed:false)` → `.blocked`; estado sem a chave → como hoje.
- [ ] **Step 2: Run** `npx jest src/session src/app/__tests__/setup.test.tsx` (e `swift test` se aplicável) → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npx tsc --noEmit`. O alvo do relógio não compila aqui: anotar para a Tarefa 13.
- [ ] **Step 5: Commit** `feat(triggers): watch, Bluetooth and phone remote are paid; a blocked remote start says so on the remote`.

### Task 10: Fim do Story

**Files:**
- Delete: `app/modules/replay-camera/ios/InstagramStory.swift`, `app/modules/replay-camera/android/src/main/java/expo/modules/replaycamera/InstagramStory.kt`, `app/modules/replay-camera/android/src/main/res/xml/replay_file_paths.xml`
- Modify: `ios/ReplayCameraModule.swift` e `android/.../ReplayCameraModule.kt` (função `shareToInstagramStory`), `android/src/main/AndroidManifest.xml` (`<queries>` e o `provider`), `src/{ReplayCamera.ts, ReplayCameraModule.ts, ReplayCameraModule.web.ts, ReplayCamera.types.ts}` (função e comentário "Story template bands"), `app/app.json` (`LSApplicationQueriesSchemes` e `extra.metaAppId`)
- Create: `app/src/share/MadeWithMark.tsx`; rename `app/src/share/ShareOverlay.tsx` → `ExportOverlay.tsx`, `__tests__/ShareOverlay.test.tsx` → `ExportOverlay.test.tsx`
- Modify: `app/src/share/exportOptions.ts`, `app/src/app/clip/[id].tsx` (import, comentários "Instagram"/"Story"), `app/src/app/__tests__/clip.test.tsx`

**Interfaces:**
- `MadeWithMark({ scale }: { scale: number })` — o único lugar que desenha "feito com LANCE" (`share.madeWith`); `ExportOverlay` (props `frame`, `layout`, `scale`, sem `watermark`) desenha faixas, degradê e sempre `MadeWithMark`. Quadro 9:16 sem mudança. `SAFE_BOTTOM` com o mesmo valor, comentário "keeps the mark clear of app UI drawn over the bottom of a shared vertical video".
- `ExportOptions.watermark` sai.

- [ ] **Step 1: Write the failing tests.** `ExportOverlay.test.tsx`: renderiza `feito com LANCE` sempre. Varredura em `app/src/share/__tests__/noStory.test.ts`: lê com `fs` os arquivos de `src/` e `modules/replay-camera/{src,ios,android/src}` (pulando `__tests__`) e `app.json`, e falha se algum contém `/instagram|\bstor(y|ies)\b|metaAppId/i`. Apagar as asserções antigas `story-top-block`/`story-bottom-block` e `queryByText(/Story/)`.
- [ ] **Step 2: Run** `npx jest src/share` → FAIL.
- [ ] **Step 3: Implement** as remoções e o rename. `expo-sharing` e `expo-media-library` continuam sendo "Compartilhar" e "Salvar na galeria".
- [ ] **Step 4: Run** `npx jest src/share src/app/__tests__/clip.test.tsx` → PASS; `npx tsc --noEmit`; `swift test` (Core).
- [ ] **Step 5: Commit** `refactor(share): remove Story; one made-with mark on every export`.

### Task 11: Editor, resumo e exportação por `session.paid`

**Files:**
- Modify: `app/src/share/exportOptions.ts`, `app/src/app/clip/[id].tsx`, `app/src/app/session/[id].tsx`, `app/src/app/setup.tsx` (só a prop do `RecordingPanel`), `app/src/i18n/locales/{pt-BR,en}.ts`
- Test: `app/src/share/__tests__/exportOptions.test.ts`, `app/src/app/__tests__/{clip,session}.test.tsx`

**Interfaces:**
- Consumes: `usePlan(sessionId)` (T3), `captureConfig`, `FREE_MAX_SECONDS` (T1), `state.bufferSeconds` (T6).
- `exportOptions(plan: Plan, edit: Clip['edit'], trim: Clip['trim']): ExportOptions` — `free`: 720x1280, `muted: true`, e se `endMs - startMs > 15_000` então `startMs = endMs - 15_000`; `paid`: 1080x1920, `muted` como hoje. Sem `watermark`. O `type Tier` local da Tarefa 3 sai.
- Editor: `maxMs = captureConfig(effectiveSettings(session.sport, prefs), plan).bufferSeconds * 1000`; velocidades sem trava (0.5x livre; o `openPaywall` do editor sai); botão de som numa sessão `free` mostra `clip.muted` e fica desabilitado.
- Resumo: sai o cartão `freeCard` (`summary.freeTitle`, `summary.freeNote`, `summary.upgrade`) e o import de `openPaywall`. Nenhum contador mensal no resumo.
- `RecordingPanel bufferSeconds={session.state.bufferSeconds ?? settings.bufferSeconds}`.

- [ ] **Step 1: Write the failing tests.** `exportOptions.test.ts`: `free` → 720x1280 `muted:true`; `paid` → 1080x1920; trecho de 20 s no `free` → 15 s finais; nenhum resultado tem `watermark`. `clip.test.tsx`: sessão `{paid:false}` exporta 720x1280 com a marca; `{paid:true}` exporta 1080x1920 com a marca; sessão antiga com `passTransactionId` e sem `paid` exporta 1080x1920; `0.5x` numa sessão grátis altera o `edit` e não chama `openPaywall`; botão de som numa sessão grátis desabilitado. `session.test.tsx`: nenhuma sessão mostra `Gravação no plano grátis` nem `Liberar HD e recursos`.
- [ ] **Step 2: Run** `npx jest src/share src/app/__tests__/clip.test.tsx src/app/__tests__/session.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Remover as três chaves `summary.*` dos dois catálogos.
- [ ] **Step 4: Run** → PASS; `npx jest src/i18n`.
- [ ] **Step 5: Commit** `feat(editor): export quality and sound by session plan; slow motion free; mark on every plan`.

### Task 12: Catálogos e docs

**Files:**
- Modify: `app/src/i18n/locales/{pt-BR,en}.ts`, `app/targets/watch/Localizable.xcstrings`, `docs/superpowers/specs/2026-10-20-payments-revenuecat-design.md` (só se algo divergiu)
- Test: `app/src/i18n/__tests__/*`

- [ ] **Step 1: Varredura das chaves.** `grep -rn "firstFree\|passCredits\|needsPayment\|watchProBadge\|watchProOnly\|freeTitle\|freeNote\|summary.upgrade\|lastFreeNote\|lockedNote" app/src` → nada. Conferir o inglês das chaves novas (Tarefas 7, 8, 9): natural, sem "Pro" onde o Passe também vale, plural correto (`1 free recording left this month`). O relógio tem as duas línguas para `PremiumOnlyNote` e `FreeLimitNote`.
- [ ] **Step 2: Run** `npx jest src/i18n` → PASS (mesmas chaves, sem português fora dos catálogos).
- [ ] **Step 3:** Se alguma decisão de implementação divergiu do spec, atualizar o spec agora.
- [ ] **Step 4: Commit** `chore(i18n): monthly free count and free-plan limits copy in every catalog` (pular se não houver mudança).

### Task 13: Verificação final e checklist de aparelho

**Files:** nenhum novo (ajustes só se algo falhar).

- [ ] **Step 1: Varredura.** Em `app/`: `grep -rnE "startGate|needsPayment|isFirstSessionUsed|showProPaywall|openProPaywall|pro_only|PRO_ONLY|tierFor|useEntitlement|setSessionPass|watermark|'pass'|never blocks" src modules targets` → nada; `grep -rn "firstSessionUsed" src` → só o teste da Tarefa 2 (aceito) ou nada. `grep -rniwE "instagram|story|stories|metaAppId" src modules/replay-camera/{src,ios,android/src} app.json targets` → nada. `grep -rn "R\\$\|US\\$\|14,90\|99,90\|4,90" src targets` → nada. `grep -rn "pro_monthly\|pro_annual" src` → nada (o app só conhece o entitlement).
- [ ] **Step 2: Run** `npx jest`, `npx tsc --noEmit`, `npx expo lint`, `cd modules/replay-camera/ios/Core && swift test` → tudo verde.
- [ ] **Step 3: Aparelho (build de desenvolvimento novo, Test Store `test_`; iOS e Android), instalação limpa:**
  1. Grátis: 5 gravações seguidas sem paywall, a linha contando "Restam 5… 1"; 12+ clipes numa delas; cada clipe ≤ 15 s; arquivo **sem trilha de áudio**; captura 720p (60 fps onde houver); a **voz salva** (iOS); gesto e tela salvam.
  2. 6ª gravação: linha "Suas 5 gravações grátis deste mês acabaram…"; "Começar gravação" abre o paywall (Anual, Mensal, Passe; tabela Grátis × Premium; 7 dias grátis nas duas assinaturas) e não começa; cancelar fica na preparação sem alerta; comprar o Passe começa uma gravação paga sozinha, uma vez.
  3. Com o mês esgotado: Começar pelo relógio e pelo celular controle não começa, não abre paywall, traz a preparação; o relógio mostra "Gravações grátis do mês acabaram" (nunca "Abra o LANCE no iPhone") e o controle a nota do limite.
  4. Apagar gravações grátis não devolve vagas; adiantar a data do aparelho para o mês seguinte e voltar ao app → "Restam 5" sem reabrir a preparação (risco do relógio documentado).
  5. Grátis: relógio e celular controle mostram "Disponível no Premium" no Salvar; teclas de volume do controle Bluetooth mudam o volume.
  6. Cadeados de 30 s, Full HD, Com som e dos três gatilhos abrem o paywall; comprar destrava sem começar.
  7. Passe com o mês livre: linha do Passe, prévia reabre em Full HD; gravar → clipes de 30 s com som, 1080p; o contador do mês não muda; a seguinte volta ao grátis.
  8. Pro Mensal e Pro Anual (sandbox): gravações pagas sem gastar crédito e sem contar; expirado, a próxima segue o contador.
  9. Apagar a gravação paga com Passe: o crédito não volta. Reinstalar e "Restaurar compras": volta o Pro, nenhum crédito, contador zerado (risco aceito).
  10. Exportação: marca nos dois planos; grátis 720p, pago 1080p; 9:16; câmera lenta no grátis.
  11. Android: muxer sem áudio grava e salva; exportação de clipe sem áudio funciona (`setRemoveAudio`).
  12. Superaquecimento (se reproduzível): cai para 720p30 e o clipe grátis continua sem áudio.
- [ ] **Step 4:** Confirmar os critérios de aceite 1–10 do spec e reportar. Divergência = ajustar o spec no mesmo commit do ajuste.
- [ ] **Step 5: Commit** de qualquer ajuste (`fix(payments): …`).
