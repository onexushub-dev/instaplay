# Pagamentos com RevenueCat: Passe da Sessão e Pro

## Objetivo
Ligar a cobrança do spec principal (`2026-10-17-lance-design.md`, seção 6) ao app: plano grátis com 5 lances por jogo, **Passe da Sessão** (R$ 4,90, compra avulsa vinculada à sessão (jogo ou treino) em que foi comprada) e **Pro** (R$ 19,90/mês). Hoje `useEntitlement()` devolve `'pro'` fixo e tudo está liberado.

Princípio: **a experiência do usuário vem primeiro. O app nunca para de gravar e nunca perde um lance por causa de pagamento.** Cobra-se pela entrega do lance (ver, exportar), não pela captura.

Este spec substitui o paywall "no 6º lance, com a gravação por trás" (seção 3.5) e a validade de 4h do Passe (seção 6) do spec principal.

## Decisões (Marcus, 2026-10-20)
- **Só RevenueCat** sobre Apple IAP e Google Play Billing. Sem Stripe e sem arquitetura híbrida por ora.
- **Sem backend e sem login na v1.** Usuário anônimo (ID do RevenueCat); nenhuma compra exige conta. Login pode vir depois, como convite opcional após a compra do Pro (`Purchases.logIn()` junta o histórico anônimo).
- **Ao atingir o limite grátis, a gravação continua.** Do 6º lance em diante os lances são salvos e ficam bloqueados. Nenhum paywall aparece durante a gravação.
- **O paywall aparece só fora da gravação**: no resumo do jogo, ao abrir um lance bloqueado e no editor (câmera lenta, templates). Pagar libera todos os lances do jogo de uma vez.
- **Moeda e preço vêm sempre da loja.** O país da conta da Apple/Google decide a moeda (BR: BRL, EUA: USD), independente do idioma do aparelho; o app mostra só o texto de preço devolvido pela loja/RevenueCat e nunca converte nem fixa símbolo. Os valores em R$ citados neste spec são os preços do Brasil; os preços dos outros países são definidos nas lojas. O app será internacionalizado (pt-BR e en-US) em subprojeto próprio antes das telas novas de pagamento.
- **Paywall do RevenueCat**, hospedado e montado no painel, exibido com `RevenueCatUI.presentPaywall()`. Se o resultado não for bom, troca-se por paywall próprio sem mexer nas regras de plano.
- **O Passe fica ligado ao jogo (sessão) de onde o paywall foi aberto, para sempre.** Pode ser comprado dias depois, em "Meus jogos".
- **O Passe é validado no aparelho** (resultado da compra + `nonSubscriptionTransactions`), sem servidor.

## Fora do escopo
Login e contas, backend e webhooks, pagamento web (Stripe), link externo, paywall próprio, Customer Center, testes A/B, promoções e cupons, limite máximo de lances bloqueados por jogo (a trava de espaço existente já protege o aparelho).

## Regras de plano

| | Grátis | Passe (este jogo) | Pro |
|---|---|---|---|
| Lances salvos por jogo | sem limite de captura; 5 liberados, do 6º em diante bloqueados | todos liberados | todos liberados |
| Exportação | 720p, com marca | 1080p 60fps, sem marca | 1080p 60fps, sem marca |
| Câmera lenta | não | sim | sim |
| Templates de Story | 1 | todos | todos |

- **Plano de um jogo** = `pro` se o entitlement `pro` está ativo; senão `pass` se `session.passTransactionId` existe; senão `free`. Pro vale para todos os jogos; o Passe só para o jogo em que foi comprado.
- **`Clip.locked`** é gravado no salvamento: `true` quando o plano do jogo é `free` e já existem 5 lances liberados nele. Um lance está *efetivamente bloqueado* quando `clip.locked && plano do jogo === 'free'`. Assim comprar o Passe ou assinar o Pro libera tudo sem atualizar lances um a um, e lances gravados no Pro continuam liberados se a assinatura acabar.
- Produtos: `pro_monthly` (assinatura, entitlement `pro`) e `session_pass` (consumível, vinculado à sessão — jogo ou treino — em que foi comprado; não gera entitlement, por isso o Passe é guardado na `Session`).

## Experiência
**Durante o jogo (nada bloqueia, nada pausa):**
- Lance #5: "Lance #5 salvo · último grátis".
- Lance #6 em diante: "Lance #6 salvo · libere no fim do jogo". A vibração do relógio é a mesma de sempre.

**Depois do jogo:**
- Resumo: cartão "7 lances guardados · 2 bloqueados" com as miniaturas e o botão "Liberar", que abre o paywall.
- "Meus jogos": jogos com lances bloqueados mostram o aviso; tocar em um lance bloqueado abre o paywall.
- Editor: tocar em câmera lenta ou em template pago abre o paywall (o Passe da Sessão ou o Pro libera).
- "Agora não" fecha o paywall sem perda. Pode-se liberar a qualquer momento.

## Arquitetura (`app/src/payments/`)

| Unidade | Função |
|---|---|
| `client.ts` | Interface `PaymentsClient`: `configure`, `getCustomerInfo`, `onCustomerInfo`, `restore`, `showPaywall`. |
| `revenuecatClient.ts` | Implementação real com `react-native-purchases` e `react-native-purchases-ui`. Único arquivo que importa o SDK. |
| `fakeClient.ts` | Cliente falso para Jest e para desenvolvimento sem loja. |
| `snapshot.ts` | Converte `customerInfo` em `Snapshot { proActive, passTransactions[{id, productId, purchasedAt}] }`. |
| `rules.ts` | Funções puras: `tierFor(snapshot, session)`, `isClipLocked(clip, tier)`, `shouldLockOnSave(tier, unlockedCount)`, `detectPurchase(before, after)`. |
| `PaymentsProvider.tsx` | Configura o SDK uma vez, assina o listener, guarda o snapshot e expõe o cliente. |

- `useEntitlement(sessionId?)` (continua em `src/share/entitlement.ts`) devolve `{ tier }` com `Tier = 'free' | 'pass' | 'pro'`. Sem `sessionId` só reconhece `pro`.
- `exportOptions(tier, …)`: 1080x1920 e `watermark: false` quando `tier !== 'free'` (hoje a marca é sempre `true` e a resolução só depende de `'pro'`).
- Chaves públicas por variável de ambiente (`.env.local`, fora do git), lidas em `app.config.js` para `extra`: `appl_…` (iOS), `goog_…` (Android) e `test_…` (Test Store, só em builds de debug). Nunca chave secreta no app.

## Dados
- `Session` ganha `passTransactionId?: string`.
- `Clip` ganha `locked?: boolean`.
- Sem migração destrutiva: campos opcionais; lances antigos valem como não bloqueados.

## Fluxo de compra
1. O usuário toca em "Liberar" (ou em um lance bloqueado, ou em um recurso pago) num jogo `S`. O app chama `showPaywall(S)`.
2. O paywall (oferta `default`: Passe pré-selecionado + Pro; "Agora não" fecha) faz a compra sozinho. O app não chama `purchasePackage`.
3. Em `purchased`/`restored`, `detectPurchase(antes, depois)` compara os snapshots: `proActive` novo → Pro; transação nova em `passTransactions` → grava `passTransactionId` em `S`.
4. O listener `onCustomerInfo` atualiza o snapshot; `tierFor` recalcula e a interface muda. Nada é liberado dentro do callback da compra.
5. "Restaurar compras": no paywall e em Ajustes (obrigatório no iOS). Restaura o Pro. O Passe é por jogo local e já fica gravado no aparelho; não é restaurado em outro aparelho.

## Erros e situações-limite

| Situação | Comportamento |
|---|---|
| Usuário cancela a compra | Volta ao app sem alerta. |
| Compra falha (recusada, sem rede, loja indisponível) | Mensagem curta e novo paywall possível. Nenhuma liberação. |
| Sem rede ao abrir | Usa o último `customerInfo` guardado pelo SDK. Sem nenhum snapshot, o plano é grátis, exceto jogo com `passTransactionId` (vale o que está gravado). |
| Duplo toque em comprar | O paywall bloqueia o segundo toque durante a compra. |
| App reinicia | `passTransactionId` na `Session` (MMKV) mantém o Passe. |
| Paywall sem oferta/preço | O RevenueCat mostra o layout padrão. O aceite exige o paywall do painel. |
| Muito espaço usado por lances bloqueados | A trava de espaço do spec principal (bloqueia "Começar jogo" abaixo de ~500 MB e avisa durante o jogo) continua valendo. |

## Testes
- **Jest (unitários):** `tierFor` (grátis, Passe, Pro; Pro vence Passe), `isClipLocked`, `shouldLockOnSave` (5 liberados, 6º bloqueado, Pro e Passe nunca bloqueiam), `detectPurchase` (Pro, Passe, nada novo, restauração), `snapshot` com `customerInfo` simulado, `exportOptions` por plano. Tudo com `fakeClient`.
- **Desenvolvimento:** Test Store do RevenueCat (chave `test_`), com compra bem-sucedida, falha e cancelamento.
- **Aparelho:** sandbox da Apple e license tester do Google, no iOS e no Android. Conferir no painel do RevenueCat (visão Sandbox) que a transação aparece para o `appUserID` certo.

## Critérios de aceite
1. O 6º lance e os seguintes são salvos e ficam bloqueados; a gravação não para e nada de pagamento aparece durante o jogo.
2. O resumo mostra os lances bloqueados e o botão "Liberar" abre o paywall com o layout do painel (não o padrão).
3. Comprar o Passe libera todos os lances daquele jogo em 1080p sem marca, inclusive depois de reiniciar o app e dias depois, sem afetar outros jogos.
4. Assinar o Pro libera tudo; cancelar a assinatura volta ao plano grátis para novos lances e mantém liberados os lances gravados no Pro.
5. Cancelar a compra não mostra erro e não trava a tela.
6. "Restaurar compras" em instalação limpa devolve o Pro.
7. `npm test` e `npm run lint` passam.

## Passos fora do código (Marcus)
1. App Store Connect e Play Console: contratos de apps pagos, dados bancários e fiscais; produtos `pro_monthly` (assinatura mensal) e `session_pass` (consumível).
2. RevenueCat: projeto, apps iOS e Android, Test Store, entitlement `pro`, oferta `default` com os dois pacotes, paywall criado no builder e publicado.
3. Chaves públicas em `app/.env.local`.
4. Build de desenvolvimento novo (módulos nativos): `react-native-purchases` e `react-native-purchases-ui` não rodam no Expo Go. Alvo atual do iOS: 16.4 (o paywall pede 15+). Confirmar no plano o `minSdkVersion` do Android (o paywall pede 24+).

## Riscos
- O paywall hospedado não mostra o número do lance, e seu layout é o que o builder do RevenueCat permite.
- Perde-se a compra por impulso no instante do 6º lance; a aposta é converter no resumo, com as miniaturas dos lances bloqueados à vista. Medir a conversão do paywall do fim do jogo e rever se ficar abaixo da meta.
- Passe validado no aparelho: um aparelho adulterado pode burlar o limite de um jogo de R$ 4,90. Aceito na v1.
- Lances bloqueados ocupam espaço no aparelho até o usuário pagar ou apagar o jogo.
- Comissão das lojas (~15%) e RevenueCat (1% acima de ~US$ 2.500 de receita mensal, a confirmar no site deles) reduzem a margem; não afetam o design.
