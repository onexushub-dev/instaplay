# Pagamentos com RevenueCat: Passe do Jogo e Pro

## Objetivo
Ligar a cobrança do spec principal (seção 6 de `2026-10-17-lance-design.md`) ao app: plano grátis com 5 lances por jogo, **Passe do Jogo** (R$ 4,90, compra avulsa por sessão) e **Pro** (R$ 19,90/mês). Hoje `useEntitlement()` devolve `'pro'` fixo e tudo está liberado.

## Decisões (tomadas com o Marcus em 2026-10-20)
- **Só RevenueCat** sobre Apple IAP e Google Play Billing. Sem Stripe e sem arquitetura híbrida por ora.
- **Sem backend e sem login na v1.** O usuário é anônimo (ID do RevenueCat). Nenhuma compra exige conta. Login pode vir depois, como convite opcional após a compra do Pro (`Purchases.logIn()` junta o histórico anônimo).
- **Paywall do RevenueCat** (hospedado, montado no painel e exibido com `RevenueCatUI.presentPaywall()`). Se o resultado não for bom, troca-se por paywall próprio sem mexer nas regras de plano.
- **O Passe fica ligado à sessão para sempre.** Os lances daquela sessão exportam em HD, sem marca d'água, mesmo depois que ela termina. A janela de 4h só limita quanto tempo novos lances saem como ilimitados.
- **O Passe é validado no aparelho** (resultado da compra + `nonSubscriptionTransactions`), sem servidor.

## Fora do escopo
Login e contas, backend e webhooks, pagamento web (Stripe), link externo para pagar, paywall próprio, Customer Center, testes A/B, promoções e cupons.

## Regras de plano

| | Grátis | Passe (esta sessão) | Pro |
|---|---|---|---|
| Lances por jogo | 5; do 6º em diante ficam salvos e bloqueados | ilimitado por 4h após a compra | ilimitado |
| Exportação | 720p, com marca | 1080p 60fps, sem marca | 1080p 60fps, sem marca |
| Câmera lenta | não | sim | sim |
| Templates de Story | 1 | todos | todos |

- **Bloqueio é derivado.** `Clip.locked` é gravado no salvamento (`true` quando o plano da sessão é grátis e já existem 5 lances). Um lance está *efetivamente bloqueado* quando `clip.locked && plano da sessão do lance === 'free'`. Assim comprar o Passe ou assinar o Pro libera tudo sem atualizar lances um a um, e lances gravados no Pro continuam liberados se a assinatura acabar.
- **Plano de uma sessão** = `pro` se o entitlement `pro` está ativo; senão `pass` se `session.passTransactionId` existe; senão `free`.
- **Novos lances como ilimitados com o Passe:** só enquanto `agora - session.passPurchasedAt <= 4h` e a sessão não foi encerrada. Depois disso, novos lances da sessão contam como grátis (a regra dos 5 lances volta a valer só para eles; os já pagos seguem em HD).
- Produtos: `lance_pro_monthly` (assinatura, entitlement `pro`) e `lance_game_pass` (consumível). Entitlement não é concedido ao consumível; por isso o Passe é guardado na `Session`.

## Arquitetura (`app/src/payments/`)

| Unidade | Função |
|---|---|
| `client.ts` | Interface `PaymentsClient`: `configure`, `getCustomerInfo`, `onCustomerInfo`, `restore`, `showPaywall`. |
| `revenuecatClient.ts` | Implementação real com `react-native-purchases` e `react-native-purchases-ui`. Único arquivo que importa o SDK. |
| `fakeClient.ts` | Cliente falso para Jest e para desenvolvimento sem loja. |
| `snapshot.ts` | Converte `customerInfo` em `Snapshot { proActive, passTransactions[{id, productId, purchasedAt}] }`. |
| `rules.ts` | Funções puras: `tierFor(snapshot, session)`, `isClipLocked(clip, tier)`, `canSaveUnlimited(session, tier, now)`, `detectPurchase(before, after)`. |
| `PaymentsProvider.tsx` | Configura o SDK uma vez, assina o listener, guarda o snapshot e expõe o cliente. |

- `useEntitlement(sessionId?)` (continua em `src/share/entitlement.ts`) devolve `{ tier }` com `Tier = 'free' | 'pass' | 'pro'`. Sem `sessionId` só reconhece `pro`.
- `exportOptions(tier, …)`: resolução 1080x1920 e `watermark: false` quando `tier !== 'free'` (hoje a marca é sempre `true` e a resolução só depende de `'pro'`).
- Chaves públicas por variável de ambiente (`.env.local`, fora do git), lidas em `app.config.js` para `extra`: `appl_…` (iOS), `goog_…` (Android) e `test_…` (Test Store, só em builds de debug). Nunca chave secreta no app.

## Dados
- `Session` ganha `passTransactionId?: string` e `passPurchasedAt?: number`.
- `Clip` ganha `locked?: boolean`.
- Sem migração destrutiva: campos opcionais; lances antigos valem como não bloqueados.

## Fluxo
1. Ao salvar um lance, se o plano da sessão é `free` e já há 5 lances, o lance é salvo com `locked: true` e o app chama `showPaywall()`.
2. O paywall (oferta `default`: Passe pré-selecionado + Pro; "Agora não" fecha) faz a compra sozinho. O app não chama `purchasePackage`.
3. Em `purchased`/`restored`, `detectPurchase(antes, depois)` compara os snapshots: `proActive` novo → Pro; transação nova em `passTransactions` → grava `passTransactionId` e `passPurchasedAt` na sessão em andamento.
4. O listener `onCustomerInfo` atualiza o snapshot; `tierFor` recalcula e a interface muda. Nada é liberado dentro do callback da compra.
5. "Agora não": o lance fica salvo e bloqueado. `showPaywall()` abre de novo a partir de "Meus jogos" ou do editor. Esses são os mesmos pontos que exigem plano para câmera lenta e templates.
6. "Restaurar compras": no paywall e em Ajustes (obrigatório no iOS). Restaura o Pro; um Passe restaurado em outro aparelho não religa a uma sessão, pois o Passe é por sessão local.

## Erros e situações-limite

| Situação | Comportamento |
|---|---|
| Usuário cancela a compra | Volta ao app sem alerta. |
| Compra falha (pagamento recusado, sem rede, loja indisponível) | Mensagem curta e novo `showPaywall()` possível. Nenhuma liberação. |
| Sem rede ao abrir | Usa o último `customerInfo` guardado pelo SDK. Sem nenhum snapshot, o plano é grátis, exceto sessão com `passTransactionId` (vale o que está gravado). |
| Duas compras seguidas | O paywall bloqueia o segundo toque durante a compra. |
| App reinicia no meio da sessão | `passTransactionId` na `Session` (MMKV) mantém o Passe. |
| Paywall sem oferta/preço | O RevenueCat mostra o layout padrão. A verificação de aceite exige o paywall do painel. |
| **Gravação durante a compra** | Abrir o paywall e a folha da loja **não pode pausar a gravação nem apagar o buffer**. Se o estado `inactive` do app disparar a pausa do spec 7, ignorar `inactive` e pausar só em `background`. Teste obrigatório em aparelho. |

## Testes
- **Jest (unitários):** `tierFor` (grátis, Passe, Pro, Pro vence Passe), `isClipLocked`, `canSaveUnlimited` (limite de 4h e sessão encerrada), `detectPurchase` (Pro, Passe, nada novo, restauração), `snapshot` com `customerInfo` simulado, regra dos 5 lances ao salvar, `exportOptions` por plano. Tudo com `fakeClient`.
- **Desenvolvimento:** Test Store do RevenueCat (chave `test_`), com compra bem-sucedida, falha e cancelamento.
- **Aparelho:** sandbox da Apple e license tester do Google, no iOS e no Android. Conferir no painel do RevenueCat (visão Sandbox) que a transação aparece para o `appUserID` certo.

## Critérios de aceite
1. O 6º lance fica salvo e bloqueado e abre o paywall com o layout do painel (não o padrão).
2. Comprar o Passe libera todos os lances da sessão em 1080p sem marca, inclusive depois de encerrar o jogo e reiniciar o app.
3. Assinar o Pro libera tudo; cancelar a assinatura volta ao plano grátis para novas sessões e mantém liberados os lances gravados no Pro.
4. Cancelar a compra não mostra erro e não trava a tela.
5. "Restaurar compras" em instalação limpa devolve o Pro.
6. Abrir o paywall e concluir uma compra não interrompe a gravação em andamento.
7. `npm test` e `npm run lint` passam.

## Passos fora do código (Marcus)
1. App Store Connect e Play Console: contratos de apps pagos, dados bancários e fiscais; produtos `lance_pro_monthly` (assinatura mensal) e `lance_game_pass` (consumível).
2. RevenueCat: projeto, apps iOS e Android, Test Store, entitlement `pro`, oferta `default` com os dois pacotes, paywall criado no builder e publicado.
3. Chaves públicas em `app/.env.local`.
4. Build de desenvolvimento novo (módulos nativos): `react-native-purchases` e `react-native-purchases-ui` não rodam no Expo Go. Alvo atual do iOS: 16.4 (o paywall pede 15+). Confirmar no plano o `minSdkVersion` do Android (o paywall pede 24+).

## Riscos
- O texto "O lance #N já está guardado" vira título fixo no paywall hospedado, que não aceita o número do lance.
- O paywall é modal, não o painel inferior com a gravação ao fundo do spec original.
- Passe validado no aparelho: um aparelho adulterado pode burlar o limite de um jogo de R$ 4,90. Aceito na v1.
- Comissão das lojas (~15%) e RevenueCat (1% acima de ~US$ 2.500 de receita mensal, a confirmar no site deles) reduzem a margem; não afetam o design.
