# Pagamentos com RevenueCat: plano grátis com limites, Passe Avulso e Pro

> Revisado em 2026-10-23: nova estratégia de venda (gravações ilimitadas no plano grátis, com limites de clipe; o pago libera os limites). Substitui a versão de 2026-10-22 (primeira gravação grátis, pagar antes da segunda). Plano de implementação: `docs/superpowers/plans/2026-10-23-payments-free-limits.md`.

## Objetivo
Ligar a cobrança do spec principal (`2026-10-17-lance-design.md`, seção 6) ao app:
- **Plano grátis:** grava quantas vezes quiser e salva quantos clipes quiser. Limites: clipe de no máximo **15 s**, **sem som** (o clipe não tem trilha de áudio), **HD (720p)** na captura e na exportação, e só três gatilhos: **toque na tela, gesto e voz**.
- **Plano pago** (Pro mensal ou Passe Avulso): libera tudo o que o grátis limita — duração do clipe acima de 15 s (as opções de corte/buffer de cada modo, como hoje), som, **Full HD (1080p)** na captura e na exportação, e os gatilhos **Apple Watch, controle Bluetooth e celular controle**.
- Todo o resto vale para os dois planos: câmera lenta, edição (corte, velocidade, zoom, giro), exportação, compartilhamento, todas as lentes.

Princípio: **a experiência do usuário vem primeiro. O app nunca bloqueia uma gravação e nunca perde um lance por causa de pagamento.** Nada pago é pedido durante a gravação.

## Decisões

**Marcus, 2026-10-20 (continuam valendo):**
- **Só RevenueCat** sobre Apple IAP e Google Play Billing. Sem Stripe e sem arquitetura híbrida por ora.
- **Sem backend e sem login na v1.** Usuário anônimo (ID do RevenueCat). Login pode vir depois, como convite opcional após a compra do Pro (`Purchases.logIn()` junta o histórico anônimo).
- **Moeda e preço vêm sempre da loja.** O país da conta da Apple/Google decide a moeda, independente do idioma do aparelho; o app mostra só o texto de preço da loja/RevenueCat e nunca converte nem fixa símbolo. Nenhum valor nem símbolo de moeda em código ou catálogo. Os valores em R$ deste spec são os preços do Brasil.
- **Paywall do RevenueCat**, hospedado e montado no painel, exibido com `RevenueCatUI.presentPaywall()`. O app não chama `purchasePackage`.
- **O Passe é validado no aparelho** (resultado da compra + `nonSubscriptionTransactions`), sem servidor.

**Marcus, 2026-10-23 (nova estratégia):**
- **Produtos:** `pro_monthly` — Pro mensal, **R$ 14,90** (era 19,90), entitlement `pro`, **7 dias grátis** configurados nas lojas (o paywall informa o teste), sem plano anual. `single_pass` — Passe Avulso, consumível, **R$ 4,90**, libera tudo em **uma gravação**.
- **Uma oferta só:** `default` (Passe + Pro) atende todos os pontos de entrada. A oferta `pro_only` e `showProPaywall` saem.
- **`Session.paid: boolean`**, decidido no **início** da sessão (Pro ativo, ou um crédito consumido) e nunca recalculado. O plano de uma sessão é `session.paid ? 'paid' : 'free'`. Substitui o plano calculado na hora por `tierFor`/`passTransactionId`: se o Pro acabar depois, as sessões gravadas no Pro continuam pagas (os clipes já nasceram em Full HD com som). `passTransactionId` continua na sessão como registro do crédito gasto.
- **O Passe é um crédito comprado antes de gravar.** Os clipes nascem limitados (720p, sem som, 15 s), então um Passe não melhora uma gravação já feita. No início de cada sessão:
  1. Pro ativo → sessão paga, nenhum crédito gasto;
  2. senão, existe crédito → consome o mais antigo, sessão paga;
  3. senão → sessão grátis.
  A preparação mostra a linha "Seu Passe Avulso será usado nesta gravação." quando o próximo início vai consumir um crédito.
- **Mantidos do modelo anterior (invariantes que custaram caro):** a store de pagamentos, o crédito (`availableCredit`), o livro-razão `lance:v1:spentPasses` (só cresce; apagar a gravação não devolve o Passe), a compra pendente única (uma compra não explicada pelo snapshot ocupa o único lugar de pendência e nenhum outro paywall vende enquanto ela não se explica), a restauração que nunca cria crédito e a leitura antes da restauração.
- **Saem:** o portão de início (`startGate`, `'needsPayment'`, `'startBlocked'`), a marca de primeira sessão (`isFirstSessionUsed`, `lance:v1:firstSessionUsed`), o paywall do "Começar gravação" e a nova tentativa automática da preparação, o cartão "Gravação no plano grátis" do resumo e seu botão, a trava de 0.5x no editor (câmera lenta é grátis), `pro_only`/`showProPaywall`/`openProPaywall`, `tierFor`, o tipo `Tier` com `'pass'`, a ligação de um Passe a uma sessão já gravada (`showPaywall(sessionId)`, `setSessionPass`).
- **A marca "feito com LANCE" fica em todo vídeo exportado, nos dois planos** (o Marcus vai redesenhá-la depois). A regra antiga "pago exporta sem marca" foi apagada.
- **Story sai do app.** Ver "Fim do Story".

**Histórico:** 2026-10-20 — 10 lances liberados por jogo, do 11º em diante bloqueados. 2026-10-22 — primeira gravação grátis e sem limite, pagamento antes da segunda. 2026-10-23 — grátis ilimitado com limites de clipe (este spec). Nenhuma versão foi publicada; dados antigos só existem em aparelhos de desenvolvimento.

## Fora do escopo
Login e contas, backend e webhooks, pagamento web (Stripe), link externo, paywall próprio, Customer Center, testes A/B, promoções e cupons, pacotes de Passes, plano anual, melhorar uma gravação já feita, redesenho da marca d'água, Wear OS.

## Regras de plano

| | Grátis | Pago (Pro ou Passe) |
|---|---|---|
| Gravações | ilimitadas | ilimitadas (Passe: a gravação em que foi consumido) |
| Clipes por gravação | ilimitados | ilimitados |
| Duração do clipe (corte e buffer) | no máximo 15 s | a do modo (hoje: corte 30 s, buffer 60 s) |
| Som no clipe | não (sem trilha de áudio) | sim (desligável na preparação) |
| Captura e exportação | HD 720p | Full HD 1080p |
| Gatilhos | tela, gesto, voz | + Apple Watch, controle Bluetooth, celular controle |
| Câmera lenta, edição, compartilhar, lentes, zoom | sim | sim |
| Marca "feito com LANCE" na exportação | sim | sim |

- **Plano do próximo início** (`nextPlan`) = `'paid'` se o Pro está ativo ou há crédito disponível; senão `'free'`. Usado pela preparação (câmera, travas, linha do Passe) e pelos gatilhos fora de gravação.
- **Plano de uma sessão** = `session.paid`. Sessões gravadas antes desta mudança (sem o campo) leem `paid = passTransactionId !== undefined`; nada é regravado.
- **Limites de captura** (`captureConfig(settings, plan)`, função pura), aplicados ao abrir a câmera:
  - grátis: qualidade HD na mesma taxa do modo (`1080p60 → 720p60`, `1080p30 → 720p30`), `cutSeconds = min(corte do modo, 15)`, `bufferSeconds = min(buffer do modo, 15)`, `audio = false`;
  - pago: o que o modo e as escolhas do jogador dizem (`effectiveSettings`), com `audio = settings.audio` (padrão ligado).
  - 720p60 mantém a câmera lenta (grátis) suave. Superaquecido, o nativo continua caindo para 720p30 nos dois planos.
- **Exportação** (`exportOptions(plan, edit, trim)`): grátis 720x1280, sem som, e o trecho nunca passa de 15 s (se passar, mantém os 15 s finais); pago 1080x1920. Marca sempre.
- **Gatilhos pagos** (`PAID_TRIGGERS = watch, remote, phone`; `triggerAllowed(source, plan)`). A trava é sobre **ligar** o gatilho, nunca sobre um toque: durante uma gravação vale `session.paid` (fixo); fora dela, `nextPlan`. Um toque de gatilho pago que chega durante a gravação sempre vira lance. Na prática:
  - **Relógio:** o celular diz ao relógio se o Salvar funciona (`watchSetSaveAllowed`, já existe); sem permissão o botão dá lugar a "Disponível no Premium"; tempo, contagem, Começar/Parar e o widget continuam.
  - **Celular controle:** o mesmo, por uma mensagem nova (`saveAllowed` no estado enviado ao controle; ausente = permitido). Parear, Começar/Parar e a imagem da câmera continuam em todos os planos.
  - **Controle Bluetooth:** o app só escuta as teclas de volume numa sessão paga; numa grátis, as teclas voltam a ser volume.
- **Começar pelo relógio ou pelo celular controle** funciona em todos os planos (começar não é gatilho de lance); o plano é decidido no início como qualquer outro.

## Experiência

**Preparação:**
- "Começar gravação" sempre começa. Nenhum paywall nesse botão.
- Com crédito e sem Pro: linha discreta acima do botão, "Seu Passe Avulso será usado nesta gravação." Sem nada ou com Pro: nenhuma linha.
- Nova seção **"Clipe"** nas configurações (sheet aberto), com três escolhas em chips:
  - **Duração:** "15 s" e "<corte do modo> s" (hoje 30 s);
  - **Qualidade:** "HD" e "Full HD";
  - **Som do clipe:** "Sem som" e "Com som".
  No grátis o valor grátis aparece selecionado e o valor pago tem cadeado e o selo "Premium"; tocar nele abre o paywall `default` (`openPaywall(t)`; sem sessão, o parâmetro de sessão saiu). No pago as duas opções de cada linha são escolhas do jogador, salvas por modo (`cutSeconds`, `quality`, `audio`).
- Blocos de gatilho **Controle Bluetooth, Relógio e Conectar um celular controle**: no grátis, cadeado + selo "Premium" + "Disponível no Premium"; tocar abre o paywall `default`. "Usar este celular como controle" fica livre (o plano que conta é o do celular da câmera).
- Depois de comprar ou restaurar, a opção simplesmente fica disponível: nada começa sozinho. A câmera reabre com a configuração paga quando o plano do próximo início muda (e volta para a grátis se o Pro acabar antes de começar).
- Cancelar/fechar o paywall: nada muda, sem alerta. Erro: o aviso curto de sempre (`payments.paywallError`).

**Durante a gravação:** nada de pagamento, sem notas de plano. A barra "Últimos Ns prontos" mostra o buffer da sessão (15 no grátis). Um Pro que vence no meio não muda nada nessa sessão. A câmera nunca é reaberta durante a gravação por mudança de plano.

**Depois da gravação:** resumo sem cartão de plano. Editor igual para os dois planos (corte, 0.5x/1.5x/2x, zoom, giro, salvar na galeria, compartilhar). Numa sessão grátis o botão de som fica desligado em "Sem som" (o clipe não tem áudio) e a janela de corte é de 15 s. "Restaurar compras" continua em "Minhas gravações".

## Fim do Story
O Story (templates Placar/Minimal/Arena/Treino/Recorde pessoal, o fluxo "Postar no Story" e suas telas) sai do produto. No código de hoje sobra:
- Nativo: `InstagramStory.swift`, `InstagramStory.kt`, a função `shareToInstagramStory` (iOS, Android, `ReplayCameraModule.ts`, `ReplayCamera.ts`), o `<queries>` do Instagram e o `FileProvider` + `replay_file_paths.xml` do Android (só o Instagram usava), `LSApplicationQueriesSchemes: instagram-stories` e `extra.metaAppId` no `app.json`.
- JS: `ShareOverlay` (nome, comentários e `SAFE_BOTTOM` justificados pelo Instagram), testes que procuram `story-*`.
- O registro de modos e os catálogos já não têm templates nem textos de Story (removidos antes); nada a fazer lá além da varredura.

Fica: o editor, a exportação no quadro vertical 9:16 com faixas (como hoje), "Salvar na galeria" e a folha de compartilhar do sistema (`expo-sharing`).

**Marca d'água depois do Story:** um caminho só. `src/share/ExportOverlay.tsx` (o antigo `ShareOverlay`, sem a prop `watermark`) desenha faixas e degradê e sempre inclui `src/share/MadeWithMark.tsx`, o único lugar que desenha a marca. O mesmo componente faz a prévia do editor e, capturado em PNG, a camada da exportação. Redesenhar a marca = mexer só em `MadeWithMark.tsx`. `ExportOptions.watermark` sai.

## Arquitetura (`app/src/payments/`)

| Unidade | Função |
|---|---|
| `client.ts` | `PaymentsClient`: `configure`, `getSnapshot`, `onSnapshot`, `restore`, `showPaywall()` (sempre a oferta `default`). |
| `revenuecatClient.ts` | Implementação com `react-native-purchases` e `-ui`. Único arquivo que importa o SDK. |
| `fakeClient.ts` | Cliente falso para Jest e desenvolvimento sem loja. |
| `snapshot.ts` | `customerInfo` → `Snapshot { proActive, passTransactions[{id, productId, purchasedAt}] }`. |
| `rules.ts` | Puras: `availableCredit`, `creditCount`, `startPlan({ proActive, credit })` → `StartDecision`, `planOf(decision)`, `sessionPlan(session)`, `detectPurchase`. |
| `limits.ts` | Puras: `FREE_MAX_SECONDS = 15`, `hdQuality(q)`, `captureConfig(settings, plan)`, `PAID_TRIGGERS`, `triggerAllowed(source, plan)`. |
| `store.ts` | `payments`: snapshot, `peekStart()`/`startDecision()` (nunca bloqueiam), `nextPlan()`, `credits()`, `showPaywall()`, `restore()`. |
| `feedback.ts` | `openPaywall(t)`, `restorePurchases(t)`. |

- `type Plan = 'free' | 'paid'`; `type StartDecision = { kind: 'pro' } | { kind: 'credit'; passTransactionId } | { kind: 'free' }`.
- `usePlan(sessionId?)` (em `src/share/entitlement.ts`, troca `useEntitlement`): com sessão, `sessionPlan`; sem sessão, `nextPlan()`. Re-renderiza com a store e com o repo.
- `useReplaySession`: `start(mode)` devolve `'started' | 'failed' | 'busy'`. Decide o plano antes de abrir a câmera, abre a câmera com `captureConfig`, decide de novo logo antes de criar a sessão e, se o plano mudou, reabre a câmera com o novo antes de criar a sessão (a sessão nunca fica com `paid` diferente da câmera). O crédito só é gasto em `repo.startSession`.
- `prepare(mode, plan)`: a chave da câmera aberta inclui qualidade, buffer e som; não faz nada fora de `idle`/`ended` (nunca reabre durante a gravação).
- Nativo `startSession({ lens, zoom, maxQuality, bufferSeconds, audio })` — `audio` novo, padrão `true`; `Quality` ganha `'720p60'`.
- Chaves públicas por variável de ambiente (`.env.local`), lidas em `app.config.js`: `appl_…`, `goog_…`, `test_…` (só debug). Nunca chave secreta.

## Áudio e voz (nativo)
- **iOS hoje:** `CaptureController` liga o microfone na sessão de captura (se autorizado) e entrega as amostras a dois lugares: o `SegmentWriter` (trilha de áudio do clipe) e o `VoiceTrigger` (reconhecimento offline de "salvar"/"gravar"). A voz **depende do microfone da captura**, não da trilha do clipe.
- **Plano:** o microfone continua na captura nos dois planos (a voz é grátis); só o `SegmentWriter` deixa de ter trilha de áudio quando `audio = false` (`withAudio: capture.hasAudio && clipAudio`). A regra fica pura no Core (`CapturePlan`, testada com `swift test`), junto com o alvo de formato (`720p60 → 1280@60`).
- **Android hoje:** `SegmentEncoder` sempre grava áudio (`AudioRecord`) e o muxer espera o formato de áudio antes de começar cada pedaço; voz não existe no Android. **Plano:** `withAudio = false` não cria `AudioRecord` nem trilha de áudio, e o muxer começa só com o vídeo. 720p60 onde a câmera oferecer, senão 30.
- **Riscos:** (1) no iOS o indicador de microfone continua aceso no grátis (já acontece hoje); (2) uma reconfiguração térmica recria o writer e precisa manter `clipAudio`; (3) o pedaço de 2 s faz o arquivo salvo ter até ~16 s com buffer de 15 s — o limite de 15 s é garantido pelo corte e pela exportação; (4) só um aparelho confirma: clipe grátis sem trilha de áudio, voz funcionando no grátis, 720p60 real, muxer Android sem áudio, exportação de clipe sem áudio. O Swift Core roda com `swift test`; os módulos iOS/Android não compilam neste ambiente.

## Dados
- `Session.paid?: boolean` (gravado por `repo.startSession`; ausente só em sessões antigas). `Session.passTransactionId?` gravado quando um crédito é consumido.
- `repo.startSession(sport, now, { paid, passTransactionId? })`: grava a sessão e, com `passTransactionId`, o põe em `spentPasses`, num único `changed()`.
- MMKV `lance:v1:spentPasses`: só cresce; `deleteSession` não mexe. A migração dos `passTransactionId` existentes continua.
- `lance:v1:firstSessionUsed` deixa de ser lida e escrita (o valor velho fica no MMKV, ignorado).
- `ModeSettings` ganha `audio: boolean` (padrão `true`) e `quality` aceita `'720p60' | '720p30'` (escolha "HD" do pago).

## Fluxo de compra
1. Ponto de entrada (cadeado de uma opção paga na preparação) → `openPaywall(t)` → `payments.showPaywall()` abre a oferta `default`.
2. `purchased`: a store lê o snapshot novo; o Pro muda o plano; o Passe vira crédito. Se o snapshot atrasar, a compra fica pendente (sem sessão) e se explica no próximo `onSnapshot`; `startDecision()` relê antes de decidir enquanto há pendência.
3. `restored` / "Restaurar compras": volta o Pro; Passes que aparecem por restauração vão para `spentPasses`, nunca viram crédito.
4. O listener `onCustomerInfo` atualiza; `nextPlan` muda; a preparação destrava e a câmera reabre. Nada é liberado dentro do callback da compra.

## Erros e situações-limite

| Situação | Comportamento |
|---|---|
| Cancela ou fecha o paywall | Nada muda, sem alerta. |
| Compra falha | Aviso curto, nada muda. |
| Compra conclui mas o snapshot atrasa | Pendência única; o início relê; se o crédito ainda não apareceu, a sessão começa grátis e o Passe continua crédito para a próxima. Nunca cobra duas vezes. |
| Duplo toque em "Começar gravação" | Só um início (`'busy'`); no máximo um crédito gasto. |
| Dois créditos | Cada início pago gasta só o mais antigo. |
| Pro ativo e crédito | Pro: o crédito não é gasto. |
| Pro vence entre a preparação e o início | O início decide `free`, reabre a câmera em HD sem som e começa grátis. |
| Pro vence no meio da gravação | Nada muda nessa sessão (paga até "Encerrar"). |
| Plano muda durante a gravação (Pro vence, crédito chega) | A câmera não reabre; vale para a próxima. |
| Sem rede e sem snapshot | Começa grátis (nunca bloqueia). Créditos só valem com snapshot. |
| Falha ao ler o repo/store na decisão | Começa grátis; nenhum crédito gasto. |
| Câmera falha ao começar (`LOW_STORAGE` etc.) | Nenhuma sessão, nenhum crédito gasto. |
| Apagar uma gravação paga com Passe | O Passe continua em `spentPasses`. |
| Toque de gatilho pago numa sessão grátis (relógio/celular controle com estado antigo) | Vira lance. |
| Sessão antiga sem `paid` | `paid = !!passTransactionId`. |

## Testes
- **Jest:** `availableCredit`, `startPlan` (Pro sem gastar; crédito; grátis), `sessionPlan` (com e sem `paid`), `captureConfig` (grátis: 720p na taxa do modo, 15/15, sem som; pago: o modo + `audio`), `triggerAllowed`, `exportOptions` (720x1280 sem som e ≤ 15 s; 1080x1920; sem `watermark`), repo (`paid` gravado, crédito no ledger, apagar não devolve, sem marca de primeira sessão), store (nunca bloqueia, Pro não gasta, restauração não cria crédito, pendente sem sessão), `useReplaySession` (grátis grava ilimitado com corte/buffer em 15 s e sem som; pago com Pro ou crédito gasto uma vez; mudança de plano antes do início reabre a câmera; durante a gravação não reabre; Bluetooth só em sessão paga), preparação (travas, paywall nas travas, destrava após compra sem começar, linha do Passe), editor e `ExportOverlay` (marca em todos os planos), varredura de Story.
- **Swift Core (`swift test`):** `CapturePlan` (720p60, áudio do writer vs. microfone), `RemoteMessage.state` com `saveAllowed`, `BufferPlan` com 15 s.
- **Aparelho:** sandbox da Apple e license tester do Google; checklist do plano (Tarefa 11).

## Critérios de aceite
1. Sem compra: grava várias vezes sem paywall; clipes de no máximo 15 s, 720p, sem trilha de áudio; voz, gesto e tela salvam; relógio, controle Bluetooth e celular controle não salvam (Salvar trocado por "Disponível no Premium"; volume é volume).
2. Os cadeados da preparação abrem o paywall do painel com a tabela Grátis × Premium e o teste de 7 dias; cancelar não muda nada.
3. Comprar o Passe: a linha "Seu Passe Avulso será usado nesta gravação." aparece, a câmera reabre em Full HD com som; a próxima gravação sai paga e consome o crédito; a seguinte volta ao grátis.
4. Assinar o Pro: todas as gravações saem pagas sem gastar créditos; se o Pro acabar, a próxima sai grátis e a em andamento não muda.
5. Apagar uma gravação paga com Passe não devolve o crédito; "Restaurar compras" em instalação limpa devolve o Pro e não cria crédito.
6. Toda exportação tem a marca "feito com LANCE"; grátis em 720p, pago em 1080p.
7. Nenhum resto de Story no app (varredura do plano).
8. `npm test`, `npx tsc --noEmit`, `npx expo lint` e `swift test` (Core) passam.

## Passos fora do código (Marcus)
1. App Store Connect e Play Console: contratos de apps pagos, dados bancários e fiscais; `pro_monthly` (assinatura mensal) e `single_pass` (consumível).
2. **Mudar o preço do `pro_monthly` para R$ 14,90** (Brasil) nas duas lojas e revisar os outros países. Manter o teste grátis de 7 dias (Apple: oferta introdutória "Teste grátis", 1 semana; Google: oferta de teste de 7 dias no plano base, "novos clientes"; RevenueCat Test Store: "Free trial" 7 dias). Quem tem direito ao teste é decidido pela loja.
3. RevenueCat: entitlement `pro`, oferta `default` com os dois pacotes e um paywall publicado. **A oferta `pro_only` não é mais necessária** (pode ser arquivada).
4. **Texto do paywall** (builder, pt-BR e en):
   - Tabela **Grátis × Premium**: Duração do clipe "15 s" × "conforme o modo"; Som "Sem som" × "Com som"; Resolução "HD" × "Full HD"; Gatilhos "Toque, gesto e voz" × "+ Apple Watch, controle Bluetooth e celular controle".
   - **Pro Mensal:** "7 dias grátis, depois {{ product.price_per_period }}" / "7 days free, then {{ product.price_per_period }}", só para quem tem direito (texto condicional de oferta introdutória; conferir os nomes das variáveis no builder). Sem preço fixo no texto.
   - **Passe Avulso:** "Uma gravação" / "One recording", com o preço da variável da loja.
   - Nenhuma promessa de reembolso.
5. **Reembolso:** antes de publicar, conferir as regras da Apple (o usuário pede à Apple) e do Google (pelo Play, e pelo desenvolvedor em até 48h); decidir só depois se algum texto de suporte vai para a página do app.
6. Meta App ID / Instagram: nada a configurar (o Story saiu).
7. Chaves públicas em `app/.env.local`; build de desenvolvimento novo (módulos nativos mudaram).

## Riscos
- **Limites que não convencem:** grátis ilimitado pode converter menos que pagar antes da segunda gravação. Medir a conversão do paywall por ponto de entrada (cadeado de som, Full HD, duração, gatilho) e a volta em 30 dias.
- **Crédito validado no aparelho:** aparelho adulterado pode forjar créditos. Aceito na v1. Créditos não passam para outro aparelho.
- **Instalação nova recebendo Passes antigos sem restauração:** conferir no sandbox; se acontecer, marcar como usados os Passes do primeiro snapshot da instalação.
- **Compra com atraso + início imediato** (sobretudo pelo relógio): a sessão pode começar grátis e o Passe ficar para a próxima. Aceito; a linha do Passe mostra quando ele está pronto.
- **Áudio nativo** (ver "Áudio e voz"): só o aparelho confirma.
- O paywall hospedado tem o layout que o builder permite. Comissões das lojas (~15%) e do RevenueCat reduzem a margem; não afetam o design.
