# Pagamentos com RevenueCat: primeira gravação grátis, Passe Avulso e Pro

> Revisado em 2026-10-22: nova estratégia de venda (primeira gravação grátis e sem limite; da segunda em diante paga-se antes de começar; Passe Avulso vira crédito). Substitui o modelo de 10 lances liberados por jogo com lances bloqueados.

## Objetivo
Ligar a cobrança do spec principal (`2026-10-17-lance-design.md`, seção 6) ao app:
- **A primeira gravação (sessão) do aparelho é grátis e sem limite de lances.**
- **Da segunda em diante**, o usuário precisa do **Passe Avulso** (R$ 4,90, consumível, vale para uma sessão — jogo ou treino) ou do **Pro** (R$ 19,90/mês, com 7 dias grátis para quem tem direito) **antes de começar**. O paywall aparece no botão "Começar gravação" da preparação, fora de qualquer gravação.

Princípio: **a experiência do usuário vem primeiro. O app nunca para de gravar e nunca perde um lance por causa de pagamento.** Nada pago é pedido durante a gravação; a cobrança acontece antes de a sessão existir.

Este spec substitui o paywall "no 6º lance, com a gravação por trás" (seção 3.5) e a validade de 4h do Passe (seção 6) do spec principal, e também o modelo de 2026-10-20 (10 lances liberados por jogo, do 11º em diante bloqueados).

## Decisões
**Marcus, 2026-10-20 (continuam valendo):**
- **Só RevenueCat** sobre Apple IAP e Google Play Billing. Sem Stripe e sem arquitetura híbrida por ora.
- **Sem backend e sem login na v1.** Usuário anônimo (ID do RevenueCat); nenhuma compra exige conta. Login pode vir depois, como convite opcional após a compra do Pro (`Purchases.logIn()` junta o histórico anônimo).
- **Moeda e preço vêm sempre da loja.** O país da conta da Apple/Google decide a moeda (BR: BRL, EUA: USD), independente do idioma do aparelho; o app mostra só o texto de preço devolvido pela loja/RevenueCat e nunca converte nem fixa símbolo. Os valores em R$ citados neste spec são os preços do Brasil; os preços dos outros países são definidos nas lojas.
- **Paywall do RevenueCat**, hospedado e montado no painel, exibido com `RevenueCatUI.presentPaywall()`. Se o resultado não for bom, troca-se por paywall próprio sem mexer nas regras de plano.
- **O Passe é validado no aparelho** (resultado da compra + `nonSubscriptionTransactions`), sem servidor.

**Marcus, 2026-10-22 (nova estratégia):**
- **Primeira sessão grátis e sem limite.** A marca de "primeira sessão usada" é persistida no aparelho (MMKV, chave `lance:v1:firstSessionUsed`) e gravada quando a primeira sessão **começa**. Não é derivada das sessões existentes: apagar o jogo não devolve a sessão grátis. Reinstalar o app zera a marca (risco aceito na v1, sem login).
- **Paga-se antes da segunda sessão.** O botão "Começar gravação" da preparação decide (ver "Portão de início"). O paywall nunca aparece durante a gravação.
- **O Passe Avulso é um crédito.** Uma compra de `single_pass` (entrada em `nonSubscriptionTransactions`) que ainda não está ligada a nenhuma sessão é um **crédito disponível**. Começar uma sessão sem Pro consome o crédito mais antigo, gravando o id da transação em `Session.passTransactionId` na criação da sessão.
  - Comprado num contexto de sessão (resumo ou editor da primeira sessão, grátis, via `showPaywall(sessionId)`), o Passe se liga na hora àquela sessão (comportamento que já existe).
  - Comprado na preparação (sem sessão), fica como crédito até o próximo início.
  - Créditos são validados no aparelho; um crédito não usado não viaja para outro aparelho (aceito).
- **Um Passe usado nunca volta a ser crédito.** Os ids de Passe já ligados ficam numa lista persistida que só cresce (`lance:v1:spentPasses`), independente das sessões: apagar a sessão paga não devolve o crédito. Na primeira leitura, a lista é completada com os `passTransactionId` das sessões existentes (migração).
- **Restauração não cria crédito.** Transações de Passe que aparecem por uma restauração (botão do paywall ou "Restaurar compras") entram direto na lista de usados. "Restaurar compras" serve para o Pro.
- **Pro mensal com 7 dias grátis**, configurado nas lojas (oferta introdutória da Apple; oferta de teste grátis no plano base do Google). O paywall informa o teste ("7 dias grátis, depois …" com as variáveis do paywall). Quem tem direito ao teste é decidido pela loja/RevenueCat, nunca pelo app. O app não promete reembolso.
- **Produtos e ofertas:** `pro_monthly` (assinatura, entitlement `pro`) e `single_pass` (consumível). Ofertas: `default` (Passe + Pro) e `pro_only` (só o Pro, usada pela trava do relógio na preparação).
- **Lances bloqueados deixam de existir.** Saem `Clip.locked`, `isClipLocked`, `shouldLockOnSave`, `FREE_CLIPS`, as notas "último grátis"/"libere no fim do jogo", a etiqueta BLOQUEADO, o aviso de bloqueados em "Minhas gravações", o cartão de bloqueados do resumo e a tela de lance bloqueado do editor. Clipes antigos com `locked: true` passam a ser lances normais (o campo é ignorado).
- **Relógio como gatilho: só Pro**, também na primeira sessão (regra de 2026-10-21 mantida, agora escrita como `tier === 'pro'`).

## Fora do escopo
Login e contas, backend e webhooks, pagamento web (Stripe), link externo, paywall próprio, Customer Center, testes A/B, promoções e cupons, venda de pacotes de Passes, usar um crédito já comprado para liberar uma sessão antiga (o botão do resumo sempre abre o paywall), templates de Story (ainda não existem no código; quando existirem, o template pago abre o mesmo paywall do editor).

## Regras de plano

| | Primeira sessão (grátis) | Passe (esta sessão) | Pro |
|---|---|---|---|
| Começar a sessão | sim, sem pagar | consome 1 crédito no início (ou foi comprado no resumo/editor da primeira sessão) | sim |
| Lances por sessão | sem limite | sem limite | sem limite |
| Exportação | 720p, com marca | 1080p 60fps, sem marca | 1080p 60fps, sem marca |
| Câmera lenta (0.5x) | não | sim | sim |
| Templates de Story | 1 | todos | todos |
| Relógio como gatilho | não | não | sim |

- **Plano de uma sessão** = `pro` se o entitlement `pro` está ativo; senão `pass` se `session.passTransactionId` existe; senão `free`. Pro vale para todas as sessões; o Passe só para a sessão a que está ligado. O plano é calculado na hora: se o Pro acabar, as sessões sem Passe voltam às regras do grátis na exportação (e mostram o botão "Liberar"); a gravação em andamento não muda.
- **Na prática, `free` só ocorre na primeira sessão** ou numa sessão gravada no Pro depois que a assinatura acabou.
- **Portão de início** (`startGate`, função pura), avaliado ao tocar "Começar gravação":
  1. primeira sessão ainda não usada → começa grátis;
  2. senão, Pro ativo → começa;
  3. senão, existe crédito disponível → começa e liga o crédito mais antigo à sessão;
  4. senão → abre o paywall `default` sem sessão. A sessão não começa.
- **Crédito disponível** (`availableCredit`, função pura) = a transação `single_pass` de menor `purchasedAt` cujo id não está na lista de usados. Enquanto uma compra feita num contexto de sessão espera ser ligada (atraso do SDK), só contam como crédito as transações que já existiam antes daquele paywall: a compra nova é da sessão que a pediu.
- **Relógio como gatilho:** `watchTriggerAllowed(tier) = tier === 'pro'`, sempre com o plano global (sem sessão). A trava é sobre *ligar* o gatilho, nunca sobre um toque durante a gravação: o celular avisa o relógio quando a gravação começa e, até ela acabar, não tira a permissão (um Pro que vence no meio da sessão continua salvando pelo relógio); um toque do relógio que chega durante a gravação sempre vira lance. Sem Pro, o botão Salvar do relógio dá lugar a "Disponível no Pro" (tempo, contagem, Começar/Parar, câmera e widget continuam funcionando). Os outros gatilhos (voz, gesto, controle Bluetooth, celular controle, tela) valem em todos os planos. O relógio não entra nos benefícios do paywall `default`.

## Experiência
**Preparação ("Começar gravação"):**
- Primeira sessão: uma linha discreta sob o botão, "Primeira gravação grátis, sem limite de clipes." Tocar começa na hora.
- Com Pro: nada muda, começa na hora.
- Com crédito: a linha diz "Você tem 1 Passe Avulso." (plural para mais); tocar começa e consome um.
- Sem nada: a linha diz "Para gravar de novo, escolha o Passe Avulso ou o Pro."; tocar abre o paywall `default` (Passe pré-selecionado + Pro com "7 dias grátis, depois …").
  - Comprou (Pro ou Passe) ou restaurou o Pro: o app reavalia o portão uma vez e, se liberado, **começa sozinho** (o usuário já tinha pedido para começar). Se a compra ainda não apareceu (atraso do SDK), fica na preparação; quando o crédito/Pro chegar pelo listener, a linha muda e o usuário toca de novo. Nunca começa sozinho depois, fora desse retorno imediato do paywall.
  - "Agora não"/fechar/cancelar: fica na preparação, sem alerta, câmera ligada.
  - Erro (sem rede, loja indisponível, oferta ausente): o aviso curto de sempre (`payments.paywallError`) e fica na preparação.
- Início pelo relógio ou pelo celular controle quando o portão pede pagamento: o app traz a preparação para a frente e **não começa nem abre o paywall** (o jogador está longe do celular).

**Durante a gravação:** nada de pagamento. Sem contador de grátis, sem notas, sem bloqueio. Um Pro que vence no meio não muda nada nessa sessão.

**Depois da gravação (sessão com plano `free`):**
- Resumo: um cartão discreto "Esta gravação está no plano grátis: 720p com a marca e sem câmera lenta." com o botão "Liberar HD e recursos", que abre o paywall `default` com `showPaywall(sessionId)`: o Passe comprado aí se liga a esta sessão; o Pro libera tudo. Sessões `pass`/`pro` não mostram o cartão.
- Editor: tocar em 0.5x numa sessão `free` abre o mesmo paywall da sessão (`showPaywall(sessionId)`) e não muda a velocidade. 1.5x/2x funcionam em todos os planos.
- "Minhas gravações": sem avisos de plano. "Restaurar compras" continua no rodapé.

## Arquitetura (`app/src/payments/`)

| Unidade | Função |
|---|---|
| `client.ts` | Interface `PaymentsClient`: `configure`, `getSnapshot`, `onSnapshot`, `restore`, `showPaywall(offering?)` (sem oferta, a `default`; com oferta, aquela, e erro se ela não existir). |
| `revenuecatClient.ts` | Implementação real com `react-native-purchases` e `react-native-purchases-ui`. Único arquivo que importa o SDK. |
| `fakeClient.ts` | Cliente falso para Jest e para desenvolvimento sem loja. |
| `snapshot.ts` | Converte `customerInfo` em `Snapshot { proActive, passTransactions[{id, productId, purchasedAt}] }`. |
| `rules.ts` | Funções puras: `tierFor(snapshot, session)`, `availableCredit(snapshot, spent)`, `startGate({ firstSessionUsed, proActive, credit })`, `detectPurchase(before, after)`, `watchTriggerAllowed(tier)`. |
| `store.ts` | Store singleton (`payments`): snapshot atual, `tierFor(sessionId?)`, `startDecision()` (assíncrono, para começar), `peekStart()` (síncrono, para a linha de status), `showPaywall(sessionId?)`, `showProPaywall()`, `restore()`, `credits()`. |
| `feedback.ts` | `openPaywall(sessionId \| undefined, t)`, `openProPaywall(t)`, `restorePurchases(t)`: abrem e mostram o aviso de erro. |

- `useEntitlement(sessionId?)` (em `src/share/entitlement.ts`) devolve `{ tier }` com `Tier = 'free' | 'pass' | 'pro'`. Sem `sessionId` só reconhece `pro`.
- `exportOptions(tier, …)`: 1080x1920 e `watermark: false` quando `tier !== 'free'`; 720x1280 e `watermark: true` no `free`.
- `useReplaySession.start(mode)` devolve `'started' | 'needsPayment' | 'failed' | 'busy'` e recebe por dependência `startDecision()`; a preparação abre o paywall quando recebe `'needsPayment'`. O portão é conferido antes de abrir a câmera e de novo logo antes de criar a sessão (o plano pode mudar no meio).
- Chaves públicas por variável de ambiente (`.env.local`, fora do git), lidas em `app.config.js` para `extra`: `appl_…` (iOS), `goog_…` (Android) e `test_…` (Test Store, só em builds de debug). Nunca chave secreta no app.

## Dados
- `Session.passTransactionId?: string` (já existe). Gravado na criação da sessão (crédito) ou depois (compra no resumo/editor).
- MMKV `lance:v1:firstSessionUsed`: `'1'` depois que a primeira sessão começou. Gravado por `repo.startSession`, junto com a sessão.
- MMKV `lance:v1:spentPasses`: lista de ids de Passe já usados (ligados a sessão ou vindos de restauração). Só cresce; `deleteSession` não mexe nela.
- `Clip.locked` sai do tipo. Valores antigos gravados ficam no MMKV e são ignorados. Sem migração destrutiva.

## Fluxo de compra
1. **Na preparação (sem sessão):** "Começar gravação" → `startGate` pede pagamento → `openPaywall(undefined, t)` → `payments.showPaywall()` abre a oferta `default`. O paywall faz a compra sozinho; o app não chama `purchasePackage`.
2. Em `purchased`/`restored`, a store lê o snapshot novo e notifica. Passe novo comprado fica como crédito; Passe que aparece em `restored` vai para a lista de usados. A preparação chama `start` de novo uma vez; o portão encontra o Pro ou o crédito e a sessão começa ligando o crédito.
3. **Num contexto de sessão** (resumo/editor de uma sessão `free`): `showPaywall(S)`; em `purchased`, `detectPurchase(antes, depois)` encontra a transação nova e grava `passTransactionId` em `S` (e na lista de usados). Se o snapshot atrasar, a ligação fica pendente e se resolve no próximo `onSnapshot` (lógica existente).
4. O listener `onCustomerInfo` atualiza o snapshot; `tierFor`/`startDecision` recalculam e a interface muda. Nada é liberado dentro do callback da compra.
5. **Paywall só do Pro** (relógio na preparação): o bloco do Relógio, travado com cadeado e selo "Pro", chama `payments.showProPaywall()`, que abre a oferta `pro_only`. Oferta ausente ou erro: o aviso curto de sempre. A compra muda o plano pelo mesmo listener.
6. "Restaurar compras": no paywall e em "Minhas gravações" (obrigatório no iOS). Restaura o Pro. Passes não são restaurados como crédito.

## Erros e situações-limite

| Situação | Comportamento |
|---|---|
| Usuário cancela ou fecha o paywall | Volta à preparação sem alerta; a sessão não começa. |
| Compra falha (recusada, sem rede, loja indisponível) | Aviso curto (`payments.paywallError`), fica na preparação. |
| Compra conclui mas o snapshot atrasa | Fica na preparação; o crédito/Pro chega pelo listener e o próximo toque começa. Nunca cobra duas vezes por um início. |
| Duplo toque em "Começar gravação" | Só um início/paywall por vez (`start` devolve `'busy'`; a store devolve `'cancelled'` a um segundo paywall aberto). |
| Dois créditos | Cada início consome só o mais antigo; o outro continua disponível. |
| Plano muda durante o início (Pro vence, crédito ligado no resumo) | O portão é reavaliado logo antes de criar a sessão; se agora pede pagamento, volta à preparação com `'needsPayment'`. |
| Sem rede ao abrir | Usa o último `customerInfo` guardado pelo SDK. Sem nenhum snapshot: a primeira sessão começa normalmente; da segunda em diante não dá para começar (o paywall não abre sem loja) — risco aceito. Sessão com `passTransactionId` vale o que está gravado. |
| Pro vence no meio da gravação | Nada muda nessa sessão: gravação, lances e relógio continuam até "Encerrar". |
| Apagar a primeira sessão | `firstSessionUsed` continua gravado; a próxima sessão pede pagamento. |
| Apagar uma sessão paga com Passe | O Passe continua na lista de usados; não vira crédito. |
| Início pelo relógio/celular controle sem pagamento | Traz a preparação para a frente, não começa nem abre o paywall. |
| App reinicia | `passTransactionId`, `firstSessionUsed` e `spentPasses` no MMKV mantêm tudo. |
| Paywall sem oferta/preço | O RevenueCat mostra o layout padrão. O aceite exige o paywall do painel. |
| Câmera falha ao começar (inclusive pouco espaço, `LOW_STORAGE`) | Nenhuma sessão é criada, então nenhum crédito é consumido e a marca de primeira sessão não é gravada (ambos só acontecem em `repo.startSession`). Um Passe comprado no paywall do início fica como crédito. |

## Testes
- **Jest (unitários):** `tierFor` (grátis, Passe, Pro; Pro vence Passe), `availableCredit` (nenhum, o mais antigo de dois, ignora usados e outros produtos), `startGate` (as quatro saídas, primeira sessão vence tudo), `detectPurchase`, `watchTriggerAllowed` (só Pro), `snapshot` com `customerInfo` simulado, `exportOptions` por plano, repo (`firstSessionUsed` gravado no início e mantido após apagar a sessão; `spentPasses` só cresce e migra dos `passTransactionId`), store (crédito comprado sem sessão; Passe de restauração não vira crédito; compra pendente de uma sessão não vira crédito de outra), `useReplaySession` (primeira sessão com lances sem limite; segunda bloqueada sem pagamento e liberada por Pro/crédito; crédito consumido uma vez e ligado; Pro que vence no meio não interrompe), tela de preparação (paywall cancelado fica na preparação; compra começa sozinha; erro mostra aviso; sem snapshot não começa a segunda).
- **Desenvolvimento:** Test Store do RevenueCat (chave `test_`), com compra bem-sucedida, falha, cancelamento e teste grátis.
- **Aparelho:** sandbox da Apple e license tester do Google, no iOS e no Android. Conferir no painel do RevenueCat (visão Sandbox) que a transação aparece para o `appUserID` certo e que uma instalação nova não traz Passes antigos como crédito sem restauração.

## Critérios de aceite
1. A primeira gravação começa sem paywall, aceita mais de 10 lances e nenhum aparece bloqueado; nada de pagamento aparece durante a gravação.
2. Na segunda gravação, sem Pro e sem crédito, "Começar gravação" abre o paywall do painel (não o padrão) com o teste de 7 dias informado; cancelar deixa na preparação.
3. Comprar o Passe na preparação começa a gravação e grava o `passTransactionId` nela; a exportação sai em 1080p sem marca, inclusive depois de reiniciar o app; a gravação seguinte pede pagamento de novo.
4. Assinar o Pro (com ou sem teste) libera todos os inícios; se a assinatura acabar, a próxima gravação pede pagamento e a que estava em andamento não para.
5. Apagar a primeira gravação não devolve a gravação grátis.
6. No resumo da primeira gravação, "Liberar HD e recursos" vende um Passe que vale só para ela.
7. "Restaurar compras" em instalação limpa devolve o Pro e não cria crédito de Passe.
8. `npm test`, `npx tsc --noEmit` e `npx expo lint` passam.

## Passos fora do código (Marcus)
1. App Store Connect e Play Console: contratos de apps pagos, dados bancários e fiscais; produtos `pro_monthly` (assinatura mensal) e `single_pass` (consumível).
2. **Teste grátis de 7 dias no `pro_monthly`:**
   - RevenueCat Test Store: marcar "Free trial" (7 dias) no produto `pro_monthly`.
   - Apple: oferta introdutória "Teste grátis", 1 semana, no grupo de assinatura do `pro_monthly` (por país/região de venda).
   - Google: no plano base mensal, oferta de teste grátis de 7 dias com elegibilidade "novos clientes".
   - Quem tem direito ao teste é decidido pela loja; o app não guarda nada sobre isso.
3. RevenueCat: projeto, apps iOS e Android, Test Store, entitlement `pro`, oferta `default` com os dois pacotes (Passe pré-selecionado), oferta `pro_only` só com o Pro (para o relógio), um paywall publicado no builder para cada oferta.
4. **Texto do paywall:** informar o teste no pacote Pro com variáveis do builder, só para quem tem direito (texto condicional de oferta introdutória), por exemplo "{{ product.offer_period_with_unit }} grátis, depois {{ product.price_per_period }}" / "{{ product.offer_period_with_unit }} free, then {{ product.price_per_period }}" (conferir os nomes exatos das variáveis no builder). Nada de preço fixo no texto. O Passe: "Vale para uma gravação." / "Good for one recording."
5. **Reembolso:** não prometer nada no paywall. Antes de publicar, conferir as regras de reembolso da Apple (o usuário pede à Apple) e do Google (reembolso pelo Play, e pelo desenvolvedor em até 48h) e só então decidir se algum texto de suporte vai para a página do app.
6. Chaves públicas em `app/.env.local`.
7. Build de desenvolvimento novo (módulos nativos): `react-native-purchases` e `react-native-purchases-ui` não rodam no Expo Go. Alvo atual do iOS: 16.4 (o paywall pede 15+). Android: `minSdkVersion` 24+.

## Riscos
- **Reinstalar dá outra primeira gravação grátis** (marca local, sem login). Aceito na v1; rever com login ou com um marcador no RevenueCat (atributo do assinante) se o abuso aparecer nas métricas.
- **Sem rede e sem snapshot, não dá para começar a segunda gravação** (o paywall precisa da loja). O SDK guarda o último `customerInfo`, então isso só acontece em aparelho que nunca leu a loja. Aceito.
- **Crédito validado no aparelho:** um aparelho adulterado pode forjar créditos de R$ 4,90. Aceito na v1. Créditos não usados não passam para outro aparelho.
- **Uma instalação nova poderia receber Passes antigos sem restauração** (se a loja/RevenueCat transferir o histórico ao configurar). Conferir no sandbox; se acontecer, a store passa a marcar como usados os Passes já presentes no primeiro snapshot da instalação.
- **Pagar antes de experimentar a segunda vez pode afastar quem gostou da primeira.** A aposta é que a primeira gravação completa e sem limite convence mais do que 10 lances. Medir a conversão do paywall da segunda gravação e a volta em 30 dias.
- O paywall hospedado tem o layout que o builder do RevenueCat permite.
- Comissão das lojas (~15%) e RevenueCat (1% acima de ~US$ 2.500 de receita mensal, a confirmar no site deles) reduzem a margem; não afetam o design.
