# Pagamentos com RevenueCat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cobrar o Passe do Jogo (R$ 4,90) e o Pro (R$ 19,90/mês) pelo RevenueCat sem nunca parar a gravação: do 6º clipe em diante os clipes ficam salvos e bloqueados, e o paywall aparece só fora da gravação.

**Architecture:** Módulo `app/src/payments/` com regras puras (`rules.ts`), uma interface `PaymentsClient` (RevenueCat real e falso para testes) e um store singleton (`payments`) no mesmo estilo de `repo` (`subscribe`/`version`). `useEntitlement(sessionId?)` lê o store. O bloqueio é gravado em `Clip.locked` no salvamento e é *efetivo* só enquanto o plano do jogo é `free`.

**Tech Stack:** Expo 58 / React Native 0.88, TypeScript, Jest (`jest-expo`), MMKV, `react-native-purchases` e `react-native-purchases-ui` (exigem build de desenvolvimento).

**Spec:** `docs/superpowers/specs/2026-10-20-payments-revenuecat-design.md` (e a seção 3.5 revisada de `2026-10-17-lance-design.md`).

## Global Constraints
- Produtos: `pro_monthly` (assinatura), `game_pass` (consumível). Entitlement: `pro`. Oferta: `default`.
- 5 clipes liberados por jogo (`FREE_CLIPS = 5`). Do 6º em diante `locked: true`.
- Plano do jogo: `pro` se entitlement ativo; senão `pass` se `session.passTransactionId`; senão `free`. Pro vence Passe.
- Bloqueio efetivo = `clip.locked && plano do jogo === 'free'`.
- Free exporta 720x1280 com marca; Passe/Pro exportam 1080x1920 sem marca. Câmera lenta (velocidade < 1x) só no Passe/Pro.
- O app **não** chama `purchasePackage`; o paywall do RevenueCat faz a compra. Nada é liberado dentro do callback da compra: o snapshot atualizado é que muda o plano.
- Nenhum paywall, modal de compra ou chamada a `showPaywall` durante `state.phase === 'recording'`.
- `Purchases.configure` uma única vez por abertura do app. Só chaves públicas no app (`appl_…`, `goog_…`, `test_…`), lidas de `app/.env.local` (fora do git); a chave `test_` só em `__DEV__`.
- Moeda e preço vêm sempre da loja (App Store/Google Play via RevenueCat): nenhum símbolo de moeda nem valor fixo no código; o país da conta da loja decide a moeda, o idioma do aparelho decide só o idioma.
- Textos de interface: as Tarefas 6–8 só começam depois do subprojeto de internacionalização (pt-BR e en-US); os textos novos usam chaves de tradução. Cópias de referência em pt-BR (UI diz "clipe"): nota do 5º clipe `Último clipe grátis deste jogo.`; nota do bloqueado `Guardado. Libere no fim do jogo.`
- Rodar `npx expo lint` e `npx tsc --noEmit` (em `app/`) antes de concluir cada tarefa. Testes: `npx jest <caminho>` em `app/`.
- Mensagens de commit terminam com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Fora deste plano: templates de Story (não existem no código ainda), login, backend, tela de Ajustes.

## Pré-requisitos (Marcus, fora do código)
Spec, seção "Passos fora do código": produtos nas lojas, projeto/apps/entitlement/oferta/paywall no RevenueCat, chaves em `app/.env.local` (`LANCE_RC_IOS_KEY`, `LANCE_RC_ANDROID_KEY`, `LANCE_RC_TEST_KEY`). As Tarefas 1–3 e 5–8 não precisam disso; a Tarefa 4 e a verificação final precisam.

## Review Focus
1. Fronteira dos 5 clipes: o 5º sai liberado e o 6º bloqueado; desfazer o 5º libera o próximo (Tarefa 6).
2. Passe do jogo A não libera o jogo B, e uma restauração/compra sem transação nova não liga nada (Tarefas 1 e 3).
3. Compra concluída mas falha ao ler o snapshot: o Passe é ligado quando o próximo snapshot chegar, sem cobrar duas vezes (Tarefa 3).
4. Assinatura Pro acaba: clipes gravados no Pro seguem liberados; clipes bloqueados antes seguem bloqueados (Tarefas 1 e 6).
5. Abrir um clipe bloqueado direto pela rota `/clip/[id]` não permite exportar (Tarefa 8); duplo toque em "Liberar" não abre dois paywalls (Tarefa 3).

---

## File Structure
- Create `app/src/payments/{types.ts, rules.ts, snapshot.ts, client.ts, fakeClient.ts, store.ts, revenuecatClient.ts, index.ts}` e `app/src/payments/__tests__/{rules,snapshot,store}.test.ts`
- Create `app/__mocks__/react-native-purchases.ts`, `app/__mocks__/react-native-purchases-ui.ts` (mocks automáticos de Jest)
- Modify `app/src/data/{schema.ts, repo.ts}`, `app/src/share/{entitlement.ts, exportOptions.ts}`, `app/src/session/{reducer.ts, useReplaySession.ts, SessionContext.tsx}`
- Modify `app/src/components/{SavedOverlay.tsx, RecordingPanel.tsx, ClipCard.tsx, GameCard.tsx}`, `app/src/app/{_layout.tsx, games.tsx, session/[id].tsx, clip/[id].tsx}`, `app/app.config.js`

---

### Task 1: Tipos e regras puras de plano

**Files:**
- Create: `app/src/payments/types.ts`, `app/src/payments/rules.ts`
- Test: `app/src/payments/__tests__/rules.test.ts`

**Interfaces:**
- Produces (`types.ts`): `type Tier = 'free' | 'pass' | 'pro'`; `type PassTransaction = { id: string; productId: string; purchasedAt: number }`; `type Snapshot = { proActive: boolean; passTransactions: PassTransaction[] }`; `const EMPTY_SNAPSHOT: Snapshot`; constantes `FREE_CLIPS = 5`, `PRO_ENTITLEMENT = 'pro'`, `PASS_PRODUCT_ID = 'game_pass'`.
- Produces (`rules.ts`): `tierFor(snapshot: Snapshot, session?: { passTransactionId?: string }): Tier`; `isClipLocked(clip: { locked?: boolean }, tier: Tier): boolean`; `shouldLockOnSave(tier: Tier, unlockedCount: number): boolean`; `detectPurchase(before: Snapshot, after: Snapshot): { pro: boolean; passTransactionId?: string }`.

- [ ] **Step 1: Write the failing tests** em `rules.test.ts`:
  - `tierFor`: `proActive` + sessão com passe → `'pro'`; só `passTransactionId` → `'pass'`; nada → `'free'`; sem sessão e sem Pro → `'free'`.
  - `isClipLocked`: `({locked:true}, 'free')` → `true`; `({locked:true}, 'pass')` e `'pro'` → `false`; `({}, 'free')` → `false`.
  - `shouldLockOnSave`: `('free',4)` → `false`; `('free',5)` → `true`; `('free',9)` → `true`; `('pass',99)` e `('pro',99)` → `false`.
  - `detectPurchase`: vazio→`proActive` → `{pro:true}`; antes `[A]` depois `[A,B]` → `{pro:false, passTransactionId:'B'}`; antes igual a depois → `{pro:false}` (sem `passTransactionId`); `proActive` já `true` antes e depois → `pro:false`; duas novas → a de maior `purchasedAt`.
- [ ] **Step 2: Run** `npx jest src/payments/__tests__/rules.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3: Implement** `types.ts` e `rules.ts` com as assinaturas acima (funções puras, sem imports de React/SDK).
- [ ] **Step 4: Run** o mesmo teste → PASS.
- [ ] **Step 5: Commit** `feat(payments): plan rules`.

### Task 2: Dados — passe na sessão e clipe bloqueado

**Files:**
- Modify: `app/src/data/schema.ts` (`Session.passTransactionId?: string`, `Clip.locked?: boolean`), `app/src/data/repo.ts`
- Test: `app/src/data/__tests__/repo.test.ts`

**Interfaces:**
- Consumes: `Session`, `Clip`.
- Produces (`repo`): `setSessionPass(id: string, transactionId: string): Session | undefined` (grava, chama `changed()`, `undefined` se o jogo não existe); `unlockedClipCount(sessionId: string): number` (clipes existentes com `locked !== true`); `lockedCount(sessionId: string): number` (clipes existentes com `locked === true`). `addClip` já aceita `locked` pelo tipo.

- [ ] **Step 1: Write the failing tests** (usar `setup()` do arquivo): `setSessionPass` persiste e notifica assinantes; em jogo inexistente devolve `undefined`; `addClip({..., locked:true})` persiste `locked`; `unlockedClipCount` e `lockedCount` contam só clipes cujo arquivo existe (`fakeFiles`) e respeitam `deleteClip`.
- [ ] **Step 2: Run** `npx jest src/data/__tests__/repo.test.ts` → FAIL.
- [ ] **Step 3: Implement** os campos do schema e os três métodos no `createRepo` (mesmo padrão de `renameSession`).
- [ ] **Step 4: Run** → PASS (inclui testes antigos).
- [ ] **Step 5: Commit** `feat(data): pass transaction on sessions and locked clips`.

### Task 3: Snapshot, cliente e store de pagamentos

**Files:**
- Create: `app/src/payments/{snapshot.ts, client.ts, fakeClient.ts, store.ts}`
- Test: `app/src/payments/__tests__/{snapshot,store}.test.ts`

**Interfaces:**
- Consumes: Tarefa 1 (`Snapshot`, `tierFor`, `detectPurchase`, `EMPTY_SNAPSHOT`), Tarefa 2 (`repo.getSession`, `repo.setSessionPass`).
- Produces (`snapshot.ts`): `type CustomerInfoLike = { entitlements: { active: Record<string, unknown> }; nonSubscriptionTransactions: { transactionIdentifier: string; productIdentifier: string; purchaseDateMillis: number }[] }`; `toSnapshot(info: CustomerInfoLike): Snapshot` (só transações com `productIdentifier === PASS_PRODUCT_ID`; `proActive` = `PRO_ENTITLEMENT in entitlements.active`).
- Produces (`client.ts`): `type PaywallOutcome = 'purchased' | 'restored' | 'cancelled' | 'error'`; `interface PaymentsClient { configure(): void; getSnapshot(): Promise<Snapshot>; onSnapshot(fn: (s: Snapshot) => void): () => void; showPaywall(): Promise<PaywallOutcome>; restore(): Promise<Snapshot> }`.
- Produces (`fakeClient.ts`): `createFakeClient()` com `snapshot`, `nextOutcome`, `failSnapshot` ajustáveis e `emit(s: Snapshot)`.
- Produces (`store.ts`): `createPaymentsStore(client: PaymentsClient, repo: Pick<Repo, 'getSession' | 'setSessionPass'>)` → `{ start(): void; getSnapshot(): Snapshot; subscribe(fn): () => void; version(): number; tierFor(sessionId?: string): Tier; showPaywall(sessionId: string): Promise<PaywallOutcome>; restore(): Promise<boolean> }`.

- [ ] **Step 1: Write the failing tests.**
  `snapshot.test.ts`: `toSnapshot` ignora produtos que não são o Passe; `proActive` verdadeiro só com entitlement `pro`.
  `store.test.ts` (com `createFakeClient` e um repo em memória): `start()` carrega o snapshot e `onSnapshot` atualiza e notifica; `tierFor('s1')` = `'pass'` com `passTransactionId`, `'pro'` com `proActive`, `'free'` sem nada; `getSnapshot` falhando → `tierFor` devolve `'free'` sem lançar e `'pass'` para jogo com passe; `showPaywall('s1')` com resultado `purchased` e transação nova `tx-2` chama `repo.setSessionPass('s1','tx-2')` e depois `tierFor('s1')==='pass'` e `tierFor('s2')==='free'`; `cancelled` não liga nada; `restored` sem transação nova não liga nada; **falha ao ler o snapshot após `purchased`**: não lança, e quando `emit` entrega o snapshot com a transação nova, o passe é ligado a `s1`; segunda chamada a `showPaywall` enquanto a primeira está aberta devolve `'cancelled'` sem chamar o cliente de novo; `restore()` devolve `true` quando `proActive` ficou ativo.
- [ ] **Step 2: Run** `npx jest src/payments` → FAIL.
- [ ] **Step 3: Implement** os quatro arquivos. Na store: guardar `current` e um `pendingBind?: { sessionId; before }` em memória; após `purchased`/`restored` buscar o snapshot novo, aplicar `detectPurchase(before, after)` e ligar o passe; se a leitura falhar, manter `pendingBind` e resolver no próximo `onSnapshot`. Notificar assinantes após ligar o passe.
- [ ] **Step 4: Run** `npx jest src/payments` → PASS.
- [ ] **Step 5: Commit** `feat(payments): client interface, snapshot and store`.

### Task 4: Cliente RevenueCat real e ligação no app

**Files:**
- Create: `app/src/payments/revenuecatClient.ts`, `app/src/payments/index.ts`, `app/__mocks__/react-native-purchases.ts`, `app/__mocks__/react-native-purchases-ui.ts`
- Modify: `app/package.json` (via `npx expo install react-native-purchases react-native-purchases-ui`), `app/app.config.js`, `app/src/app/_layout.tsx`

**Interfaces:**
- Consumes: `PaymentsClient`, `toSnapshot`, `createPaymentsStore`, `repo` de `../data/mmkv`.
- Produces: `createRevenueCatClient(): PaymentsClient`; `export const payments` em `src/payments/index.ts` (o store singleton).

- [ ] **Step 1: Install** as duas libs com `npx expo install` (nunca `npm add`) e conferir em `node_modules/react-native-purchases` os nomes reais dos campos de `CustomerInfo.nonSubscriptionTransactions` (ajustar `CustomerInfoLike` se diferirem).
- [ ] **Step 2: Add mocks** de Jest em `app/__mocks__/` (módulos com `configure`, `getCustomerInfo`, `addCustomerInfoUpdateListener`, `restorePurchases` e, no `-ui`, `presentPaywall` e `PAYWALL_RESULT`) para que qualquer teste de tela que importe `src/payments` carregue sem código nativo.
- [ ] **Step 3: Implement `createRevenueCatClient`**: `configure()` lê as chaves de `Constants.expoConfig.extra.revenueCat` (`ios`, `android`, `test`); em `__DEV__` usa `test` se existir, senão a da plataforma; sem chave nenhuma, não configura e `getSnapshot` devolve `EMPTY_SNAPSHOT`. `showPaywall` usa `RevenueCatUI.presentPaywall({ displayCloseButton: true })` e mapeia `PURCHASED→'purchased'`, `RESTORED→'restored'`, `CANCELLED→'cancelled'`, demais→`'error'`. `onSnapshot` usa `addCustomerInfoUpdateListener` e devolve a função que remove o listener.
- [ ] **Step 4: Wire**: `app.config.js` passa `extra.revenueCat` a partir de `LANCE_RC_IOS_KEY`, `LANCE_RC_ANDROID_KEY`, `LANCE_RC_TEST_KEY` (e documenta no cabeçalho); `index.ts` cria o `payments`; `_layout.tsx` chama `payments.start()` uma vez na montagem.
- [ ] **Step 5: Verify** `npx jest` (suíte inteira, deve passar com os mocks), `npx tsc --noEmit`, `npx expo lint`. Em aparelho: gerar build de desenvolvimento (`npx expo run:ios` / `run:android`), abrir o app e conferir no log nativo `Purchases is configured`. Confirmar o `minSdkVersion` do Android (paywall pede 24+) e, se menor, registrar a correção como pendência para o Marcus antes de seguir.
- [ ] **Step 6: Commit** `feat(payments): RevenueCat client and app wiring`.

### Task 5: `useEntitlement` e exportação por plano

**Files:**
- Modify: `app/src/share/entitlement.ts`, `app/src/share/exportOptions.ts`
- Test: `app/src/share/__tests__/exportOptions.test.ts`, novo `app/src/share/__tests__/entitlement.test.tsx`

**Interfaces:**
- Consumes: `payments` (Tarefa 4), `Tier` (Tarefa 1).
- Produces: `useEntitlement(sessionId?: string): { tier: Tier }` (re-renderiza quando o store notifica); `exportOptions(tier: Tier, edit, trim)` com `width/height` 1080x1920 e `watermark: false` quando `tier !== 'free'`, 720x1280 e `watermark: true` quando `free`. `Tier` passa a ser reexportado de `payments/types`.

- [ ] **Step 1: Write the failing tests.** `exportOptions.test.ts`: trocar "the app mark is always on" por três casos (`free` → `watermark:true`; `pass` e `pro` → `watermark:false`) e acrescentar `pass` exporta 1080x1920. `entitlement.test.tsx` com `renderHook` e `payments` mockado: `useEntitlement('s1')` devolve `payments.tierFor('s1')` e atualiza depois do `notify` do store.
- [ ] **Step 2: Run** os dois arquivos → FAIL.
- [ ] **Step 3: Implement** o hook com `useSyncExternalStore(payments.subscribe, payments.version)` e a nova lógica de `exportOptions`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(payments): entitlement hook and export options per tier`.

### Task 6: Bloquear no salvamento e avisar durante o jogo

**Files:**
- Modify: `app/src/session/{reducer.ts, useReplaySession.ts, SessionContext.tsx}`, `app/src/components/{SavedOverlay.tsx, RecordingPanel.tsx}`
- Test: `app/src/session/__tests__/{reducer,useReplaySession}.test.ts*`, `app/src/components/__tests__/RecordingPanel.test.tsx`

**Interfaces:**
- Consumes: `shouldLockOnSave`, `FREE_CLIPS` (Tarefa 1), `repo.unlockedClipCount`, `addClip` (Tarefa 2), `payments.tierFor` (Tarefa 4).
- Produces: `SessionDeps.tierFor(sessionId: string): Tier`; ação `saved` e `lastSaved` ganham `locked: boolean` e `lastFree: boolean`; `SavedOverlay` aceita `note?: string` (substitui a dica quando presente).

- [ ] **Step 1: Write the failing tests.**
  `useReplaySession.test`: `fakeDeps` ganha `tierFor`. Com `'free'`: cinco `save` seguidos gravam clipes sem `locked`, o sexto grava `locked: true`; `state.lastSaved.lastFree` é `true` no 5º e `locked` é `true` no 6º; desfazer o 5º e salvar de novo grava um clipe liberado; com `'pro'` e `'pass'` o 6º **não** é bloqueado; a gravação segue em `phase: 'recording'` depois do 6º (nada para).
  `reducer.test`: `saved` guarda `locked` e `lastFree` em `lastSaved`.
  `RecordingPanel.test`: no 5º mostra `Último clipe grátis deste jogo.`; no bloqueado mostra `Guardado. Libere no fim do jogo.`; antes disso mostra a dica atual.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** em `save()`: `const tier = deps.tierFor(sessionId)`; `const locked = shouldLockOnSave(tier, deps.repo.unlockedClipCount(sessionId))`; `lastFree = tier === 'free' && !locked && unlockedCount + 1 === FREE_CLIPS`; passar `locked` ao `addClip`. `SessionContext` injeta `tierFor: payments.tierFor`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(payments): lock clips past the free limit without stopping the recording`.

### Task 7: Resumo, cartões e "Minhas gravações"

**Files:**
- Modify: `app/src/components/{ClipCard.tsx, GameCard.tsx}`, `app/src/app/{session/[id].tsx, games.tsx}`
- Test: `app/src/app/__tests__/{session,games}.test.tsx`

**Interfaces:**
- Consumes: `isClipLocked` (Tarefa 1), `repo.lockedCount` (Tarefa 2), `payments.tierFor/showPaywall/restore` (Tarefa 4), `useEntitlement` (Tarefa 5).
- Produces: `ClipCard` prop `locked?: boolean` (etiqueta `BLOQUEADO`, `accessibilityLabel` termina com `, bloqueado`); `GameCard` prop `lockedClips?: number` (detalhe acrescenta ` · N bloqueados`).

- [ ] **Step 1: Write the failing tests.**
  `session.test`: com plano `free` e 2 clipes `locked`, mostra `2 clipes bloqueados` e o botão `Liberar clipes`; tocar nele chama `payments.showPaywall('s1')`; tocar em um clipe bloqueado chama `showPaywall` e **não** navega; clipe liberado navega para `/clip/<id>`; com plano `pass`/`pro` o cartão não aparece e nenhum clipe é tratado como bloqueado; "Postar um clipe" fica desabilitado se todos os clipes estão bloqueados.
  `games.test`: jogo `free` com 2 bloqueados mostra `2 bloqueados`; jogo `pass` não mostra; o botão `Restaurar compras` chama `payments.restore()`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** as telas (mock de `../../payments` nos testes; manter os mocks existentes de `mmkv`). Texto do cartão: `Guardados, mas bloqueados. Libere com o Passe do Jogo ou o Pro.` O botão `Restaurar compras` fica no rodapé de `games.tsx` (não há tela de Ajustes ainda).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(payments): unlock entry points in summary and games list`.

### Task 8: Editor — clipe bloqueado e câmera lenta

**Files:**
- Modify: `app/src/app/clip/[id].tsx`
- Test: `app/src/app/__tests__/clip.test.tsx`

**Interfaces:**
- Consumes: `useEntitlement(sessionId)` (Tarefa 5), `isClipLocked` (Tarefa 1), `payments.showPaywall` (Tarefa 4).
- Produces: a rota exporta um componente que escolhe entre `LockedClip` e o editor atual (renomeado `ClipEditor`), para manter a ordem dos hooks.

- [ ] **Step 1: Write the failing tests** (mock de `../../payments`): clipe `locked` com plano `free` mostra `Este clipe está bloqueado` e o botão `Liberar`, sem botões de salvar/compartilhar nem exportação (`exportClip` não é chamado); `Liberar` chama `showPaywall(clip.sessionId)`; com plano `pro` o mesmo clipe abre o editor; no plano `free`, tocar em `0.5x` chama `showPaywall` e **não** altera `edit.speed` (`repo.updateClip` não é chamado); `1.5x`/`2x` funcionam no `free`; no `pro` `0.5x` altera o `edit`. Ajustar os testes existentes para o plano `pro` onde esperam 1080p.
- [ ] **Step 2: Run** `npx jest src/app/__tests__/clip.test.tsx` → FAIL.
- [ ] **Step 3: Implement** o wrapper de rota com `LockedClip`, usando `useEntitlement(clip.sessionId)`; no `SPEEDS.map`, quando `speed < 1 && tier === 'free'` o `onPress` chama `void payments.showPaywall(clip.sessionId)`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(payments): gate locked clips and slow motion in the editor`.

### Task 9: Verificação final e teste em aparelho

**Files:** nenhum novo (ajustes só se algo falhar).

- [ ] **Step 1: Run** `npx jest`, `npx tsc --noEmit`, `npx expo lint` em `app/` → tudo verde.
- [ ] **Step 2: Test Store (iOS e Android, build de desenvolvimento, chave `test_`)**: gravar 6 clipes (o 6º fica bloqueado, a gravação continua, a nota aparece); encerrar; no resumo tocar `Liberar clipes`; comprar o Passe → os 6 clipes liberam e exportam em 1080p sem marca; repetir com o Pro; cancelar e falhar a compra não mostram erro nem travam.
- [ ] **Step 3: Sandbox (aparelho real)**: Apple sandbox e license tester do Google; conferir no painel do RevenueCat (visão Sandbox) a transação no `appUserID` certo; "Restaurar compras" em instalação limpa devolve o Pro.
- [ ] **Step 4: Confirmar** os critérios de aceite 1–7 do spec e reportar o resultado (incluindo o `minSdkVersion` conferido na Tarefa 4).
- [ ] **Step 5: Commit** de qualquer ajuste (`fix(payments): …`).
