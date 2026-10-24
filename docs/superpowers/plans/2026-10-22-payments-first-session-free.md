# Primeira gravação grátis, pagar antes da segunda, Passe como crédito — Implementation Plan

> **Superseded** em 2026-10-23 por `2026-10-23-payments-free-limits.md` (plano grátis com limites no lugar da primeira gravação grátis).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o modelo "10 clipes liberados por jogo, do 11º em diante bloqueados" por: a primeira gravação do aparelho é grátis e sem limite; da segunda em diante o usuário precisa do Pro ativo ou de um Passe Avulso disponível (crédito) **antes** de começar, e o paywall abre no botão "Começar gravação" da preparação. Clipes bloqueados deixam de existir.

**Architecture:** As regras continuam puras em `app/src/payments/rules.ts` (novas: `availableCredit`, `creditCount`, `startGate`). O `repo` (MMKV) ganha a marca `firstSessionUsed` e a lista `spentPasses` (Passes já usados, só cresce), gravadas por `repo.startSession`. O store `payments` ganha `startDecision()` (assíncrono, para começar) e `peekStart()` (síncrono, para a linha de status), `showPaywall(sessionId?)` sem sessão (compra vira crédito) e trata restauração como "nunca crédito". `useReplaySession.start` consulta o portão antes de abrir a câmera e de novo antes de criar a sessão, e devolve `'needsPayment'`; a preparação abre o paywall e, se houve compra, chama `start` mais uma vez. Depois, as Tarefas 6–8 removem toda a mecânica de clipe bloqueado e trocam a entrada do resumo por "Liberar HD e recursos" só em sessão `free`.

**Tech Stack:** Expo 58 / React Native 0.88, TypeScript, Jest (`jest-expo`, `@testing-library/react-native`), MMKV, `react-native-purchases` / `react-native-purchases-ui` (já instalados).

**Spec:** `docs/superpowers/specs/2026-10-20-payments-revenuecat-design.md` (revisado em 2026-10-22) e a seção 3.5 de `docs/superpowers/specs/2026-10-17-lance-design.md`.

## Global Constraints
- Produtos: `pro_monthly` (assinatura, entitlement `pro`, 7 dias grátis configurados nas lojas) e `single_pass` (consumível). Ofertas: `default` (Passe + Pro) e `pro_only` (só Pro, trava do relógio). Nada disso muda no código além do que as tarefas dizem.
- **Portão de início**, nesta ordem: primeira sessão não usada → começa grátis; Pro ativo → começa; crédito disponível → começa e liga o crédito **mais antigo** (`purchasedAt`) à sessão; senão → `'needsPayment'` (paywall `default` sem sessão).
- **Crédito** = transação `single_pass` em `snapshot.passTransactions` cujo id não está em `repo.spentPasses()`. Um id entra em `spentPasses` quando é ligado a uma sessão (`startSession` com passe ou `setSessionPass`) ou quando aparece por restauração. A lista só cresce; `deleteSession` não mexe nela.
- **Primeira sessão:** `repo.startSession` grava `lance:v1:firstSessionUsed = '1'` sempre. Nunca derivar de sessões existentes. Apagar sessões não volta atrás.
- Crédito e marca só mudam dentro de `repo.startSession`: se a câmera falhar antes, nada é consumido.
- Nenhum paywall, modal de compra ou chamada a `showPaywall`/`openPaywall` durante `state.phase === 'recording'`, e nenhum vindo do início remoto (relógio/celular controle).
- O app **não** chama `purchasePackage`; o paywall do RevenueCat faz a compra. Moeda e preço vêm sempre da loja: nenhum valor nem símbolo de moeda em código ou catálogo.
- Planos de exportação inalterados: `free` 720x1280 com marca, sem 0.5x; `pass`/`pro` 1080x1920 sem marca, com 0.5x. Relógio como gatilho só `pro` (plano global, sem sessão).
- Métodos do store são closures (sem `this`): são passados soltos (`tierFor: payments.tierFor`, `startDecision: payments.startDecision`).
- Textos novos nos dois catálogos (`app/src/i18n/locales/pt-BR.ts` e `en.ts`, mesmas chaves e marcadores — `i18n/__tests__/catalogs.test.ts` confere). Inglês americano natural. A UI diz "clipe"/"gravação" ("clip"/"recording"); texto que nomear jogo/treino usa `%{what}` com `t(\`modes.what.${group}\`)`.
- Em `app/`: testes `npx jest <caminho>`; antes de cada commit `npx tsc --noEmit` e `npx expo lint`. Nunca iniciar o servidor de desenvolvimento.
- Commits direto no branch atual (`feat/payments-revenuecat`). Toda mensagem termina com a linha em branco e `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Fora deste plano: templates de Story (não existem no código), login, backend, tela de Ajustes, mudanças no painel do RevenueCat/lojas (Marcus, spec "Passos fora do código").

## Review Focus
1. **Duplo toque em "Começar gravação"** (e toque + início remoto ao mesmo tempo): só um `start` corre (`'busy'` para o segundo), só um paywall abre, e no máximo um crédito é consumido (Tarefas 4 e 5).
2. **Compra concluída depois que o paywall fechou** (atraso do SDK): a preparação não começa sozinha mais tarde; o crédito aparece pelo listener e o próximo toque o usa. Uma compra pendente feita no resumo de S1 não pode virar crédito consumido por uma sessão nova (Tarefa 3).
3. **Dois créditos:** cada início consome só o mais antigo; o segundo continua disponível e a linha de status conta certo (Tarefas 1, 2 e 5).
4. **Restauração:** "Restaurar compras" ou o botão de restaurar do paywall nunca transforma Passes antigos em crédito nem os liga a uma sessão; o Pro restaurado libera o início (Tarefa 3).
5. **Plano muda durante o início:** o Pro vence ou um crédito é gasto entre o primeiro portão e a criação da sessão; o segundo portão manda (`startBlocked`, `'needsPayment'`), e um Pro que vence **durante** a gravação não muda nada nela (Tarefa 4).

---

## File Structure
- Modify `app/src/payments/{types.ts, rules.ts, store.ts, feedback.ts}`, tests `app/src/payments/__tests__/{rules,store,feedback}.test.ts`
- Create `app/src/payments/useStartPreview.ts`
- Modify `app/src/data/{schema.ts, repo.ts}`, test `app/src/data/__tests__/repo.test.ts`
- Modify `app/src/session/{reducer.ts, useReplaySession.ts, SessionContext.tsx, RemoteStartListener.tsx}`, tests `app/src/session/__tests__/{reducer.test.ts, useReplaySession.test.tsx, RemoteStartListener.test.tsx}`
- Modify `app/src/app/{setup.tsx, games.tsx, session/[id].tsx, clip/[id].tsx}`, tests `app/src/app/__tests__/{setup,games,session,clip}.test.tsx`
- Modify `app/src/components/{RecordingPanel.tsx, SavedOverlay.tsx, ClipCard.tsx, GameCard.tsx}`, tests `app/src/components/__tests__/{RecordingPanel,ClipCard}.test.tsx`
- Modify `app/src/i18n/locales/{pt-BR.ts, en.ts}`

---

### Task 1: Regras puras — crédito, portão de início, relógio só Pro

**Files:**
- Modify: `app/src/payments/types.ts`, `app/src/payments/rules.ts`
- Test: `app/src/payments/__tests__/rules.test.ts`

**Interfaces:**
- Produces (`types.ts`): `type StartDecision = { kind: 'firstSession' } | { kind: 'pro' } | { kind: 'credit'; passTransactionId: string } | { kind: 'paywall' }`.
- Produces (`rules.ts`):
  - `availableCredit(snapshot: Snapshot, spent: ReadonlySet<string>): PassTransaction | undefined` — o `single_pass` de menor `purchasedAt` fora de `spent` (empate: o primeiro da lista).
  - `creditCount(snapshot: Snapshot, spent: ReadonlySet<string>): number`.
  - `startGate(input: { firstSessionUsed: boolean; proActive: boolean; credit?: PassTransaction }): StartDecision`.
  - `watchTriggerAllowed(tier: Tier): boolean` passa a ser `tier === 'pro'`.
- `isClipLocked`, `shouldLockOnSave` e `FREE_CLIPS` **ficam** até a Tarefa 8 (ainda são importados).

- [ ] **Step 1: Write the failing tests** em `rules.test.ts` (acrescentar; manter os de `tierFor` e `detectPurchase`):
  - `availableCredit`: snapshot vazio → `undefined`; `[B(t=2), A(t=1)]` sem gastos → `A`; com `spent={A}` → `B`; com `spent={A,B}` → `undefined`; transação de outro `productId` é ignorada.
  - `creditCount`: `[A,B]` com `spent={A}` → `1`.
  - `startGate`: `{firstSessionUsed:false, proActive:false}` → `{kind:'firstSession'}`; `{firstSessionUsed:false, proActive:true, credit:A}` → `'firstSession'` (a grátis vem primeiro e não gasta nada); `{true, true, A}` → `{kind:'pro'}` (Pro não gasta crédito); `{true, false, A}` → `{kind:'credit', passTransactionId:'A'}`; `{true, false}` → `{kind:'paywall'}`.
  - `watchTriggerAllowed`: `'pro'` → `true`; `'pass'` e `'free'` → `false` (substitui o teste antigo que aceitava `'pass'`).
- [ ] **Step 2: Run** `npx jest src/payments/__tests__/rules.test.ts` → FAIL.
- [ ] **Step 3: Implement**:

```ts
// rules.ts (acréscimos)
export function availableCredit(snapshot: Snapshot, spent: ReadonlySet<string>): PassTransaction | undefined {
  return snapshot.passTransactions
    .filter((t) => t.productId === PASS_PRODUCT_ID && !spent.has(t.id))
    .reduce<PassTransaction | undefined>((a, b) => (a === undefined || b.purchasedAt < a.purchasedAt ? b : a), undefined);
}

export function creditCount(snapshot: Snapshot, spent: ReadonlySet<string>): number {
  return snapshot.passTransactions.filter((t) => t.productId === PASS_PRODUCT_ID && !spent.has(t.id)).length;
}

/** Decides "Começar gravação": the first session is free, then Pro, then the oldest unused Pass, else the paywall. */
export function startGate(input: { firstSessionUsed: boolean; proActive: boolean; credit?: PassTransaction }): StartDecision {
  if (!input.firstSessionUsed) return { kind: 'firstSession' };
  if (input.proActive) return { kind: 'pro' };
  if (input.credit) return { kind: 'credit', passTransactionId: input.credit.id };
  return { kind: 'paywall' };
}

/** The watch as a save trigger is Pro only (global tier). Gates turning it on, never a tap mid-recording. */
export function watchTriggerAllowed(tier: Tier): boolean {
  return tier === 'pro';
}
```
- [ ] **Step 4: Run** o mesmo teste → PASS. Rodar também `npx jest src/session/__tests__/useWatchTriggerGate.test.tsx src/app/__tests__/setup.test.tsx` (o relógio já usava o plano global; devem continuar verdes).
- [ ] **Step 5: Commit** `feat(payments): start gate and Pass credit rules; watch trigger Pro only`.

### Task 2: Dados — marca da primeira sessão e Passes usados

**Files:**
- Modify: `app/src/data/repo.ts`
- Test: `app/src/data/__tests__/repo.test.ts`

**Interfaces:**
- Consumes: `Session`.
- Produces (`repo`):
  - `isFirstSessionUsed(): boolean` — lê `lance:v1:firstSessionUsed === '1'`.
  - `startSession(sport: Sport, now: number, passTransactionId?: string): Session` — além do que já faz: grava a marca `'1'`; com `passTransactionId`, grava-o na sessão e chama `spendPasses([id])`. Tudo antes do `changed()` único.
  - `spentPasses(): Set<string>` — lê `lance:v1:spentPasses` (JSON `string[]`). Se a chave não existe (migração), monta a lista com os `passTransactionId` das sessões existentes, grava e devolve.
  - `spendPasses(ids: string[]): void` — junta sem repetir, grava e chama `changed()` só se algo mudou.
  - `setSessionPass(id, tx)` passa a chamar também `spendPasses([tx])` (só se a sessão existe).

- [ ] **Step 1: Write the failing tests** (usar o `setup()` do arquivo):
  - `isFirstSessionUsed()` é `false` num repo novo e `true` depois de `startSession`.
  - **apagar a primeira sessão não reseta a marca:** `startSession` → `deleteSession(id)` → `isFirstSessionUsed()` continua `true`.
  - `startSession('quadra', 1, 'tx-1')` grava `passTransactionId: 'tx-1'` e `spentPasses()` contém `tx-1`; sem o terceiro argumento a sessão não tem `passTransactionId`.
  - `deleteSession` de uma sessão com passe mantém o id em `spentPasses()`.
  - `setSessionPass('s', 'tx-2')` põe `tx-2` em `spentPasses()`; em sessão inexistente não põe.
  - Migração: KV com uma sessão antiga `{passTransactionId:'old'}` e sem a chave `spentPasses` → `spentPasses()` contém `old` e a chave passa a existir.
  - `spendPasses(['a','a','b'])` guarda `a` e `b` uma vez; chamar de novo com `['a']` não notifica assinantes.
- [ ] **Step 2: Run** `npx jest src/data/__tests__/repo.test.ts` → FAIL.
- [ ] **Step 3: Implement** no `createRepo`, com as chaves novas em `key` (`firstSessionUsed: 'lance:v1:firstSessionUsed'`, `spentPasses: 'lance:v1:spentPasses'`). A marca é gravada com `kv.set(key, '1')` (não JSON). Manter `unlockedClipCount`/`lockedCount` por enquanto (saem na Tarefa 7).
- [ ] **Step 4: Run** → PASS (inclui os testes antigos).
- [ ] **Step 5: Commit** `feat(data): first-session marker and spent Pass ledger`.

### Task 3: Store — paywall sem sessão, crédito, restauração e decisão de início

**Files:**
- Modify: `app/src/payments/store.ts`, `app/src/payments/feedback.ts`
- Test: `app/src/payments/__tests__/store.test.ts`, `app/src/payments/__tests__/feedback.test.ts`

**Interfaces:**
- Consumes: Tarefa 1 (`availableCredit`, `creditCount`, `startGate`, `StartDecision`), Tarefa 2 (`isFirstSessionUsed`, `spentPasses`, `spendPasses`, `setSessionPass`).
- Produces (`createPaymentsStore(client, repo: Pick<Repo, 'getSession' | 'setSessionPass' | 'isFirstSessionUsed' | 'spentPasses' | 'spendPasses'>)`):
  - `showPaywall(sessionId?: string): Promise<PaywallOutcome>` — com `sessionId`, igual a hoje (liga o Passe novo comprado àquela sessão); sem `sessionId`, abre a oferta `default` e, em `purchased`/`restored`, lê o snapshot novo (ou usa o atual se a leitura falhar) e notifica. Nada é ligado: o Passe comprado fica como crédito.
  - Em `restored` (com ou sem sessão) e em `restore()`: os ids de Passe novos em relação ao snapshot de antes vão para `repo.spendPasses` e **nunca** são ligados a uma sessão. Se o "antes" é desconhecido (`current === null`), todos os Passes do snapshot restaurado que ainda não estão gastos vão para `spendPasses`.
  - `peekStart(): StartDecision` — síncrono, com o snapshot atual (ou `EMPTY_SNAPSHOT`).
  - `startDecision(): Promise<StartDecision>` — se ainda não há snapshot, tenta uma leitura (`apply`) antes; leitura falhando → decide com o vazio (primeira sessão passa; a segunda dá `'paywall'`). Nunca lança.
  - `credits(): number` — `creditCount` com os mesmos gastos de `peekStart`.
  - **Gastos efetivos** (usados por `peekStart`, `startDecision`, `credits` e `resolvePending`) = `repo.spentPasses()` ∪ (se há `pending`) os ids do snapshot atual que **não** estavam em `pending.before` — a compra que espera ligação a S1 não é crédito de ninguém.
  - Remover o `Set` em memória `bound`: o livro-razão do repo o substitui (`resolvePending` considera `pending.before` ∪ `repo.spentPasses()` como conhecidos).
- Produces (`feedback.ts`): `openPaywall(sessionId: string | undefined, t: TFunction): Promise<PaywallOutcome>` — agora devolve o resultado (o aviso de erro continua igual).

- [ ] **Step 1: Write the failing tests** em `store.test.ts` (o repo em memória do arquivo ganha `isFirstSessionUsed`, `spentPasses`, `spendPasses`; ajustar os testes existentes ao novo tipo sem mudar o que eles afirmam, exceto onde dito):
  - `showPaywall()` sem sessão com `purchased` e transação nova `tx-2`: nenhum `setSessionPass`, `credits()` = 1, `peekStart()` = `{kind:'credit', passTransactionId:'tx-2'}` (com `isFirstSessionUsed` = `true`).
  - Dois créditos `tx-1(t=1)`, `tx-2(t=2)`: `peekStart()` escolhe `tx-1`; depois de `spendPasses(['tx-1'])`, escolhe `tx-2`; `credits()` vai de 2 a 1.
  - `peekStart()`: primeira sessão não usada → `'firstSession'` mesmo com Pro; Pro → `'pro'`; nada → `'paywall'`.
  - `startDecision()` sem snapshot carregado e `getSnapshot` com Pro → `'pro'` (lê antes de decidir); com `failSnapshot` e primeira sessão usada → `'paywall'` sem lançar; com `failSnapshot` e primeira sessão livre → `'firstSession'` (**offline/sem snapshot**).
  - **Restauração não cria crédito:** antes `[]`, `restore()` traz `[old]` → `spentPasses` contém `old`, `credits()` = 0, nenhum `setSessionPass`; `showPaywall('s1')` com `restored` e Passe novo → não liga a `s1` e o põe em `spentPasses` (substitui o comportamento antigo de ligar em `restored`); `restore()` com Pro devolve `true` e `peekStart()` = `'pro'`.
  - Crédito comprado antes continua crédito depois de uma restauração que não traz nada novo.
  - **Compra pendente não vira crédito de outra sessão:** primeira sessão usada, snapshot `[tx-1]` com `tx-1` já gasto; `showPaywall('s1')` → `purchased` com o snapshot ainda sem transação nova (atraso do SDK, como no teste existente "purchased with no new transaction yet") → `credits()` = 0 e `peekStart()` = `'paywall'`. Agora o caso difícil: com o `pending` ainda aberto, `client.snapshot` passa a `[tx-1, tx-2]` mas o listener ainda não emitiu e `startDecision()` lê esse snapshot fresco → `tx-2` é ligada a `s1` pelo `apply` (e gasta), e a decisão é `'paywall'`, nunca `{kind:'credit', passTransactionId:'tx-2'}`.
  - Segunda chamada a `showPaywall()` (sem sessão) enquanto a primeira está aberta devolve `'cancelled'` sem chamar o cliente.
  - `feedback.test.ts`: `openPaywall(undefined, t)` chama `payments.showPaywall(undefined)` e devolve o resultado; `'error'` mostra `payments.paywallError`.
- [ ] **Step 2: Run** `npx jest src/payments` → FAIL.
- [ ] **Step 3: Implement.** Pontos de atenção:
  - Em `showPaywall`, só criar `pending` quando há `sessionId` e o resultado é `purchased`. `restored` nunca cria `pending`; calcula os Passes novos e chama `repo.spendPasses`.
  - `startDecision`/`peekStart` montam `startGate({ firstSessionUsed: repo.isFirstSessionUsed(), proActive: snap.proActive, credit: availableCredit(snap, gastosEfetivos()) })`.
  - Todos os métodos como funções do objeto retornado sem `this`.
- [ ] **Step 4: Run** `npx jest src/payments` → PASS.
- [ ] **Step 5: Commit** `feat(payments): paywall without a session, Pass credits and restore never credits`.

### Task 4: Portão no início da sessão

**Files:**
- Modify: `app/src/session/{reducer.ts, useReplaySession.ts, SessionContext.tsx, RemoteStartListener.tsx}`
- Test: `app/src/session/__tests__/{reducer.test.ts, useReplaySession.test.tsx, RemoteStartListener.test.tsx}`

**Interfaces:**
- Consumes: `StartDecision` (Tarefa 1), `repo.startSession(sport, now, passTransactionId?)` (Tarefa 2), `payments.startDecision` (Tarefa 3).
- Produces:
  - `SessionDeps.startDecision: () => Promise<StartDecision>` (o `tierFor` continua até a Tarefa 6).
  - `export type StartResult = 'started' | 'needsPayment' | 'failed' | 'busy'`; `start(sport: Sport): Promise<StartResult>`.
  - Ação `{ type: 'startBlocked' }` no reducer: volta a `{ ...initialState, camera: state.camera }` (como `startFailed`, sem erro).

- [ ] **Step 1: Write the failing tests.**
  `useReplaySession.test.tsx` — `fakeDeps` ganha `startDecision: jest.fn(async () => ({ kind: 'firstSession' }))` ajustável e passa a usar o repo real em memória (já usa):
  - Primeira sessão (`'firstSession'`): `start` → `'started'`, `repo.isFirstSessionUsed()` = `true`, sessão sem `passTransactionId`.
  - **Primeira sessão sem limite:** 12 `save` seguidos gravam 12 clipes, `state.clipCount === 12`, `phase === 'recording'`. (Com `tierFor` `'free'`, este teste ainda pode ver `locked` até a Tarefa 6 — por isso afirme só contagem e fase aqui; a Tarefa 6 acrescenta "nenhum `locked`".)
  - **Segunda sessão bloqueada:** `startDecision` → `'paywall'`: `start` → `'needsPayment'`, `camera.startSession` **não** é chamado, nenhuma sessão nova no repo, `phase` continua `'idle'`.
  - **Liberada pelo Pro:** `'pro'` → `'started'`, sessão sem passe.
  - **Liberada por crédito e consumido uma vez:** `{kind:'credit', passTransactionId:'tx-1'}` → sessão com `passTransactionId:'tx-1'` e `repo.spentPasses()` contém `tx-1`.
  - **Plano muda durante o início:** `startDecision` devolve `'pro'` na 1ª chamada e `'paywall'` na 2ª → `'needsPayment'`, `phase` volta a `'idle'`, nenhuma sessão criada.
  - **Duplo toque:** duas chamadas a `start` sem `await` entre elas → uma dá `'started'`, a outra `'busy'`; só uma sessão no repo; `startDecision` com crédito: só um `tx` gasto.
  - Câmera falha (`startSession` rejeita com `LOW_STORAGE`) → `'failed'`, `isFirstSessionUsed()` continua `false`.
  - **Pro vence no meio:** começa com `'pro'`; depois `startDecision` passa a `'paywall'` e `tierFor` a `'free'`; três `save` gravam três clipes e `phase` segue `'recording'`; `camera.stopSession` não é chamado.
  `reducer.test.ts`: `startBlocked` depois de `startRequested` volta a `phase: 'idle'` mantendo `camera`.
  `RemoteStartListener.test.tsx`: com `session.start` resolvendo `'needsPayment'`, o listener navega para `/setup` e não chama `openPaywall` (mock de `../../payments/feedback`).
- [ ] **Step 2: Run** `npx jest src/session` → FAIL.
- [ ] **Step 3: Implement** em `useReplaySession`:

```ts
const startingRef = useRef(false);
const start = useCallback(
  async (sport: Sport): Promise<StartResult> => {
    const phase = stateRef.current.phase;
    if (startingRef.current || phase === 'starting' || phase === 'recording' || phase === 'stopping') return 'busy';
    startingRef.current = true;
    try {
      // Payment is settled before the camera work: nothing paid is ever asked once recording.
      if ((await deps.startDecision()).kind === 'paywall') return 'needsPayment';
      dispatch({ type: 'startRequested' });
      if (!(await prepare(sport))) {
        dispatch({ type: 'startFailed', code: cameraError.current ?? 'CAMERA_UNAVAILABLE' });
        return 'failed';
      }
      // The tier can change while the camera opens (Pro lapsing, a credit spent elsewhere): this check decides.
      const decision = await deps.startDecision();
      if (decision.kind === 'paywall') {
        dispatch({ type: 'startBlocked' });
        return 'needsPayment';
      }
      gameMode.current = sport;
      // ...gesto e voz como hoje...
      const session = deps.repo.startSession(sport, deps.now(), decision.kind === 'credit' ? decision.passTransactionId : undefined);
      dispatch({ type: 'started', sessionId: session.id, startedAt: session.startedAt });
      return 'started';
    } finally {
      startingRef.current = false;
    }
  },
  [deps, prepare],
);
```
  `SessionContext.tsx`: `startDecision: payments.startDecision` em `appDeps`. `RemoteStartListener.tsx`: sem mudança de lógica além de um comentário ("a remote start that needs payment does nothing: the paywall only opens from the setup button"); o teste fixa o comportamento.
- [ ] **Step 4: Run** `npx jest src/session` → PASS; `npx jest src/app/__tests__/setup.test.tsx` (o botão ainda chama `session.start`).
- [ ] **Step 5: Commit** `feat(session): start gate — first session free, Pro or a Pass credit from the second on`.

### Task 5: Preparação — paywall no "Começar gravação" e linha de status

**Files:**
- Create: `app/src/payments/useStartPreview.ts`
- Modify: `app/src/app/setup.tsx`, `app/src/i18n/locales/{pt-BR.ts, en.ts}`
- Test: `app/src/app/__tests__/setup.test.tsx`

**Interfaces:**
- Consumes: `session.start` → `StartResult` (Tarefa 4), `openPaywall(undefined, t)` (Tarefa 3), `payments.peekStart/credits/subscribe/version`, `repo.subscribe/version`.
- Produces: `useStartPreview(): { decision: StartDecision; credits: number }` (re-renderiza com `useSyncExternalStore` no `payments` **e** no `repo`, porque a marca e os gastos moram no repo).
- Chaves novas (`setup`):

| chave | pt-BR | en |
|---|---|---|
| `setup.firstFree` | `Primeira gravação grátis, sem limite de clipes.` | `Your first recording is free, with unlimited clips.` |
| `setup.passCredits` | `{ one: 'Você tem %{count} Passe Avulso.', other: 'Você tem %{count} Passes Avulsos.' }` | `{ one: 'You have %{count} Single Pass.', other: 'You have %{count} Single Passes.' }` |
| `setup.needsPayment` | `Para gravar de novo, escolha o Passe Avulso ou o Pro.` | `To record again, get a Single Pass or go Pro.` |

- [ ] **Step 1: Write the failing tests** em `setup.test.tsx`. O arquivo já mocka `../../session/SessionContext` (`useSession.mockReturnValue(value)`): dar a esse valor um `start: jest.fn()` controlável. Acrescentar mock de `../../payments` com `peekStart`, `credits`, `subscribe`, `version` (e o que `useEntitlement` já usa: `tierFor`), mock de `../../payments/feedback` com `openPaywall: jest.fn()` e `openProPaywall: jest.fn()`, e `subscribe`/`version` no `repo` mockado de `../../data/mmkv`:
  - `peekStart` `'firstSession'` → mostra `Primeira gravação grátis, sem limite de clipes.`; `'credit'` com `credits()`=2 → `Você tem 2 Passes Avulsos.`; `'paywall'` → `Para gravar de novo, escolha o Passe Avulso ou o Pro.`; `'pro'` → nenhuma das três.
  - Tocar `Começar gravação` com `start` → `'started'`: `openPaywall` não é chamado.
  - `start` → `'needsPayment'` e `openPaywall` → `'cancelled'`: **paywall cancelado mantém na preparação** — `start` chamado uma vez, nenhuma navegação, nenhum alerta.
  - `'needsPayment'` e `openPaywall` → `'purchased'`: `start` é chamado de novo **uma** vez; se a 2ª também der `'needsPayment'` (atraso), não abre outro paywall.
  - `'needsPayment'` e `'restored'`: igual a `'purchased'`.
  - `'needsPayment'` e `'error'`: `start` não é chamado de novo (o alerta é do `openPaywall`, já testado).
  - **Duplo toque:** dois `press` seguidos com `start` pendente → `start` chamado uma vez (o botão fica bloqueado por um `useRef` enquanto o fluxo corre).
- [ ] **Step 2: Run** `npx jest src/app/__tests__/setup.test.tsx` → FAIL.
- [ ] **Step 3: Implement**:

```tsx
const busy = useRef(false);
async function onStart() {
  if (busy.current) return;
  busy.current = true;
  try {
    if ((await session.start(modeId)) !== 'needsPayment') return;
    const outcome = await openPaywall(undefined, t);
    // One retry right after a purchase: the player already asked to start. A purchase that shows up later
    // (SDK lag) only changes the status line; the next tap starts.
    if (outcome === 'purchased' || outcome === 'restored') await session.start(modeId);
  } finally {
    busy.current = false;
  }
}
```
  Linha de status: `<Text>` discreto (mesmo estilo de nota do sheet) acima do botão, a partir de `useStartPreview()`. As chaves vão nos dois catálogos, no bloco `setup`.
  *Por que começar sozinho:* o toque em "Começar gravação" já é o pedido; pedir outro toque logo após pagar é atrito sem ganho. Começar sozinho só nesse retorno imediato do paywall evita gravações que começam do nada minutos depois.
- [ ] **Step 4: Run** `npx jest src/app/__tests__/setup.test.tsx src/i18n` → PASS.
- [ ] **Step 5: Commit** `feat(setup): paywall at Começar gravação from the second recording on`.

### Task 6: Remover o bloqueio na gravação

**Files:**
- Modify: `app/src/session/{useReplaySession.ts, reducer.ts, SessionContext.tsx}`, `app/src/components/{RecordingPanel.tsx, SavedOverlay.tsx}`, `app/src/i18n/locales/{pt-BR.ts, en.ts}`
- Test: `app/src/session/__tests__/{useReplaySession.test.tsx, reducer.test.ts}`, `app/src/components/__tests__/RecordingPanel.test.tsx`

**Interfaces:**
- Removes: `SessionDeps.tierFor`; `locked`/`lastFree` da ação `saved` e de `lastSaved`; prop `note` de `SavedOverlay` (só era usada pelas notas de pagamento — confirmar com `grep -rn "note=" app/src/components`); prop `group` de `RecordingPanel` se ficar sem uso (e no único chamador, `app/src/app/setup.tsx`); chaves `payments.lastFreeNote` e `payments.lockedNote`.

- [ ] **Step 1: Write the failing tests.**
  `useReplaySession.test.tsx`: apagar os testes do 10º/11º clipe (`lastFree`, `locked`, "desfazer o 10º"); acrescentar **"primeira sessão: o 11º e o 12º clipe são gravados sem `locked`"** (`repo.listClips(id).every(c => !('locked' in c))`) e "`state.lastSaved` não tem `locked` nem `lastFree`". `fakeDeps` perde `tierFor`.
  `reducer.test.ts`: `saved` sem `locked`/`lastFree`.
  `RecordingPanel.test.tsx`: apagar os testes das notas; acrescentar "depois de salvar, mostra a dica de sempre (nunca `Último clipe grátis` nem `Guardado. Libere`)".
- [ ] **Step 2: Run** `npx jest src/session src/components` → FAIL (tipos/expectativas antigas).
- [ ] **Step 3: Implement**: em `save()` remover `tier`, `unlocked`, `locked`, `lastFree` e o spread de `locked` no `addClip`; remover os imports de `shouldLockOnSave`/`FREE_CLIPS`/`Tier`; tirar `tierFor` de `appDeps`. Remover as duas chaves dos dois catálogos.
- [ ] **Step 4: Run** `npx jest src/session src/components src/i18n` → PASS.
- [ ] **Step 5: Commit** `refactor(payments): no locked clips while recording`.

### Task 7: Remover o bloqueio dos dados e das listas

**Files:**
- Modify: `app/src/data/{schema.ts, repo.ts}`, `app/src/components/GameCard.tsx`, `app/src/app/games.tsx`, `app/src/i18n/locales/{pt-BR.ts, en.ts}`
- Test: `app/src/data/__tests__/repo.test.ts`, `app/src/app/__tests__/games.test.tsx`

**Interfaces:**
- Removes: `Clip.locked` (o comentário do tipo some; valores antigos no MMKV são ignorados), `repo.unlockedClipCount`, `repo.lockedCount`, prop `GameCard.lockedClips`, o cálculo `lockedClips` e o `useSyncExternalStore` de `payments` em `games.tsx` (se ficar sem uso; `restorePurchases` continua), chave `games.lockedDetail`.

- [ ] **Step 1: Write the failing tests / adjust.** `repo.test.ts`: apagar os testes de `unlockedClipCount`/`lockedCount`/`locked` persistido; acrescentar "um clipe antigo gravado com `locked: true` aparece em `listClips` normalmente" (escrever o JSON direto no KV). `games.test.tsx`: trocar "jogo free com 2 bloqueados mostra `2 bloqueados`" por "nenhum jogo mostra `bloqueado`, em qualquer plano"; manter "Restaurar compras chama `payments.restore()`" (via `restorePurchases`).
- [ ] **Step 2: Run** `npx jest src/data src/app/__tests__/games.test.tsx` → FAIL.
- [ ] **Step 3: Implement** as remoções desta tarefa: `Clip.locked`, os dois métodos do repo, `GameCard.lockedClips`, o cálculo em `games.tsx` e `games.lockedDetail`. **Não** tocar ainda em `session/[id].tsx`, `clip/[id].tsx`, na prop `ClipCard.locked` nem em `summary.lockedTag/lockedA11y` (saem na Tarefa 8, junto com o resumo); eles continuam compilando porque `isClipLocked` recebe `{ locked?: boolean }` estrutural, que `Clip` sem o campo satisfaz. Por isso o `ClipCard.test.tsx` só muda na Tarefa 8.
- [ ] **Step 4: Run** `npx jest src/data src/components src/app src/i18n` → PASS; `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `refactor(data): drop locked clips from storage and the games list`.

### Task 8: Resumo e editor — "Liberar HD e recursos" na sessão grátis

**Files:**
- Modify: `app/src/app/session/[id].tsx`, `app/src/app/clip/[id].tsx`, `app/src/components/ClipCard.tsx`, `app/src/payments/{rules.ts, types.ts}`, `app/src/i18n/locales/{pt-BR.ts, en.ts}`
- Test: `app/src/app/__tests__/{session,clip}.test.tsx`, `app/src/components/__tests__/ClipCard.test.tsx`, `app/src/payments/__tests__/rules.test.ts`

**Interfaces:**
- Consumes: `useEntitlement(sessionId)`, `openPaywall(sessionId, t)`.
- Removes: cartão de bloqueados (`lockedCount`, estilos `lockedCard/lockedTitle/lockedNote`) e o desvio de toque em clipe bloqueado no resumo; `LockedClip` e o wrapper de rota no editor (a rota volta a exportar o editor direto); o filtro de swipe que pulava bloqueados (o swipe passa por todos os clipes da sessão); prop `ClipCard.locked`; `isClipLocked`, `shouldLockOnSave`, `FREE_CLIPS` (e seus testes); chaves `summary.lockedClips`, `summary.lockedNote`, `summary.unlock`, `summary.lockedTag`, `summary.lockedA11y`, `clip.locked`, `clip.unlock`.
- Produces (chaves `summary`):

| chave | pt-BR | en |
|---|---|---|
| `summary.freeTitle` | `Gravação no plano grátis` | `Free plan recording` |
| `summary.freeNote` | `720p com a marca e sem câmera lenta. O Passe Avulso libera tudo nesta gravação.` | `720p with the watermark and no slow motion. A Single Pass unlocks everything for this recording.` |
| `summary.upgrade` | `Liberar HD e recursos` | `Unlock HD and more` |

- [ ] **Step 1: Write the failing tests.**
  `session.test.tsx`: com `tierFor` `'free'` mostra `Gravação no plano grátis` e o botão `Liberar HD e recursos`; tocar nele chama `payments.showPaywall('s1')` (via `openPaywall`); com `'pass'` e `'pro'` o cartão não aparece; tocar em qualquer clipe navega para `/clip/<id>` (inclusive um clipe antigo com `locked: true` no plano `free`); "Postar um clipe" fica habilitado com clipes (apagar o teste "todos bloqueados").
  `clip.test.tsx`: apagar os testes de `LockedClip`; um clipe com `locked: true` no plano `free` abre o editor e exporta em 720x1280 com marca; no `free`, `0.5x` chama `showPaywall(clip.sessionId)` e não chama `repo.updateClip`; no `pro`/`pass`, `0.5x` altera o `edit`; `1.5x`/`2x` funcionam no `free`; o swipe vai para o próximo clipe mesmo se ele tiver `locked: true`. **Exportação por plano:** `free` → `exportOptions` 720x1280 `watermark:true`; `pass` e `pro` → 1080x1920 `watermark:false` (os testes de `src/share/__tests__/exportOptions.test.ts` continuam verdes sem mudança).
  `rules.test.ts`: apagar os testes de `isClipLocked`/`shouldLockOnSave`.
  `ClipCard.test.tsx`: apagar os casos de `locked`; o rótulo de acessibilidade nunca termina com `, bloqueado` e não há etiqueta `BLOQUEADO`.
- [ ] **Step 2: Run** `npx jest src/app/__tests__/session.test.tsx src/app/__tests__/clip.test.tsx src/components src/payments` → FAIL.
- [ ] **Step 3: Implement.** No resumo, o cartão novo fica no lugar do de bloqueados, com o mesmo estilo (renomear `lockedCard` → `freeCard` etc.) e `Button` secundário `onPress={() => void openPaywall(id, t)}`. Nunca renderizar o cartão enquanto `state.phase === 'recording'` (o resumo só existe depois de encerrar; um comentário basta). No editor, o `SPEEDS.map` mantém `speed < 1 && tier === 'free' ? void openPaywall(clip.sessionId, t) : setEdit({ speed })`.
- [ ] **Step 4: Run** o mesmo conjunto → PASS; depois `npx jest src/i18n` (chaves iguais nos dois catálogos).
- [ ] **Step 5: Commit** `feat(payments): unlock HD from a free recording's summary and editor; drop locked clip screens`.

### Task 9: Verificação final, varredura e teste com a Test Store

**Files:** nenhum novo (ajustes só se algo falhar; docs só se o comportamento divergir do spec).

- [ ] **Step 1: Varredura.** Em `app/`: `grep -rnE "isClipLocked|shouldLockOnSave|FREE_CLIPS|lastFree|unlockedClipCount|lockedCount|lockedClips|lockedNote|lastFreeNote|LockedClip|\.locked\b" src` → nenhum resultado. `grep -rn -i "locked" src` só pode mostrar o selo do relógio (`TriggerTile` `lockedBadge`/`lockedHint`, `setup.tsx`), `remote.failLocked`/`pair.tsx` e o teste de clipe antigo com `locked: true`. Nenhum preço ou símbolo de moeda em `src/i18n/locales` (`grep -n "R\\$\|US\\$\|\\$[0-9]" src/i18n/locales`).
- [ ] **Step 2: Run** `npx jest`, `npx tsc --noEmit`, `npx expo lint` → tudo verde.
- [ ] **Step 3: Test Store (build de desenvolvimento, chave `test_`, iOS e Android)**, instalação limpa:
  1. Primeira gravação: começa sem paywall; gravar 12+ clipes; nada de pagamento aparece; resumo mostra "Gravação no plano grátis"; exporta 720p com marca; 0.5x abre o paywall.
  2. Apagar essa gravação em "Minhas gravações"; voltar à preparação: a linha diz "Para gravar de novo…".
  3. "Começar gravação" → paywall com o teste de 7 dias informado no Pro → "Agora não": fica na preparação.
  4. De novo → comprar o Passe → a gravação começa sozinha; exportar sai 1080p sem marca; encerrar; a próxima pede pagamento de novo.
  5. Comprar o Passe e fechar sem começar (ex.: compra com atraso): a linha mostra "Você tem 1 Passe Avulso."; tocar começa e o consome.
  6. Assinar o Pro (teste grátis) → começa; iniciar outras gravações sem paywall; relógio libera o Salvar.
  7. Início pelo relógio/celular controle sem pagamento: a preparação vem para a frente, nada começa, nenhum paywall.
  8. Compra falhando e cancelada: sem travar; falha mostra o aviso.
- [ ] **Step 4: Sandbox (aparelho real):** Apple sandbox e license tester do Google; conferir no painel do RevenueCat (visão Sandbox) as transações no `appUserID` certo; reinstalar e "Restaurar compras": volta o Pro, a linha **não** mostra Passes como crédito. Anotar se uma instalação nova, **sem** restaurar, recebe Passes antigos no primeiro snapshot (risco do spec); se sim, reportar ao Marcus antes de publicar.
- [ ] **Step 5: Confirmar** os critérios de aceite 1–8 do spec e reportar o resultado. Se algum comportamento ficou diferente do spec, ajustar o spec no mesmo commit do ajuste.
- [ ] **Step 6: Commit** de qualquer ajuste (`fix(payments): …`).
