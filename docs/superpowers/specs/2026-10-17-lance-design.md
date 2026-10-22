# LANCE — Design (v1)

> Nome provisório. Data: 2026-10-17. Status: aguardando revisão.
> Mockups: https://claude.ai/artifact/2Cj7DeSydAkeWGADELpFKw

## 1. Objetivo

Levar para o celular do praticante o sistema de "replay" que algumas quadras oferecem com câmera fixa e botão físico. O celular, preso na grade ou na areia, grava o jogo inteiro, mas guarda só os lances que o jogador escolher. O lance vai para o Instagram Stories em dois toques.

- **Público inicial:** praticantes de esportes de areia (beach tennis, futevôlei, vôlei de praia). O app funciona em qualquer esporte de quadra (opção "Outro").
- **Princípios:** sem cadastro, abre direto na câmera, "dois toques até o Story", app leve e rápido.

## 2. Decisões tomadas

| Tema | Decisão |
|---|---|
| Plataforma | React Native + Expo (New Architecture, Hermes), iOS e Android |
| Gatilhos v1 | Botão na tela, controle Bluetooth, gesto corporal (braços em X), smartwatch (Apple Watch + Wear OS) |
| Buffer | Janela móvel de 60s. O que sai da janela é apagado na hora. Só os lances salvos ficam no celular |
| Corte padrão | Últimos 30s até o gatilho, ajustável depois dentro dos 60s |
| Dados | Só no celular, sem login. Modelo preparado para login futuro |
| Receita | Primeira gravação grátis e sem limite; da segunda em diante, Passe Avulso (R$4,90, uma sessão — jogo ou treino) ou Pro (R$19,90/mês, 7 dias grátis), pagos antes de começar. Kit físico de fixação opcional, vendido fora do app |
| Câmera | Módulo nativo próprio `ReplayCamera` (Expo Modules), sem VisionCamera |

## 3. Experiência do usuário

Fluxo: **Boas-vindas → Posicionar câmera → Gravando → Lance salvo (repete) → Fim de jogo → Editor → Story.** O paywall aparece antes de começar a segunda gravação (e quando o usuário pede um recurso pago numa gravação grátis), nunca durante a gravação.

### 3.1 Boas-vindas (só na primeira vez)
- Promessa: "Grave o jogo inteiro. Guarde só o lance."
- Os 3 passos: prender o celular → fazer o gatilho → postar.
- Aviso de privacidade e memória: "Só os lances que você salvar ficam no seu celular. O resto é apagado automaticamente."
- Um botão: "Permitir câmera e começar". Sem cadastro.

### 3.2 Posicionar câmera
- Preview em tela cheia com o contorno da quadra como guia e o nível do horizonte.
- Seletor de lente 0.5x / 1x (ultra-wide como padrão quando houver).
- Dica: "Atrás da linha de fundo, na altura do ombro".
- Esporte: Beach tennis, Futevôlei, Vôlei de praia, Outro.
- Status dos gatilhos: Tela (sempre ativa), Gesto X (ativo/inativo), Controle (conectado/não), Relógio (pareado/"Toque para parear").
- Botão "Começar gravação". Bloqueado se houver menos de ~500 MB livres. Da segunda gravação em diante, sem Pro e sem Passe disponível, abre o paywall antes de começar (seção 3.5).

### 3.3 Gravando
- A tela escurece para economizar bateria, mas a gravação continua.
- Topo: indicador REC, tempo de jogo, temperatura.
- Centro: contador de lances. Tocar em qualquer lugar salva o lance.
- Barra "Últimos 60s prontos · o resto é apagado".
- Indicadores dos gatilhos remotos.
- "Segure para encerrar o jogo" (toque longo, para evitar encerrar por engano).
- Calor: o app reduz sozinho para 720p/30 e mostra o aviso "Celular quente… coloque na sombra".

### 3.4 Lance salvo (feedback de ~2s)
- Borda e flash na cor de destaque, som curto, vibração no relógio.
- "Lance #N salvo · via <origem> · últimos 30s".
- Botão "Desfazer".

### 3.5 Primeira gravação grátis e paywall (revisado em 2026-10-22)
- A primeira gravação do aparelho é grátis e sem limite de lances (exporta em 720p com selo, sem câmera lenta, 1 template).
- Da segunda em diante, "Começar gravação" exige o Pro ativo ou um Passe Avulso disponível (comprado e ainda não usado). Sem nenhum dos dois, abre o paywall (Passe Avulso R$4,90 pré-selecionado ou Pro R$19,90/mês com 7 dias grátis); comprando, a gravação começa; fechando, nada começa.
- A gravação nunca para por causa do plano e nenhum paywall aparece durante a gravação. Não há lances bloqueados.
- No resumo e no editor da gravação grátis, "Liberar HD e recursos" e a câmera lenta abrem o paywall; o Passe comprado ali vale para aquela gravação.
- Pagamento pela App Store / Google Play. Detalhes em `2026-10-20-payments-revenuecat-design.md`.

### 3.6 Relógio (watchOS e Wear OS)
- Uma tela só: tempo + número de lances e um botão grande "Salvar lance".
- O relógio como gatilho é só do Pro (também na primeira gravação). Sem Pro o botão dá lugar a "Disponível no Pro" e o resto continua. Detalhes em `2026-10-20-payments-revenuecat-design.md`.
- Vibração quando o lance é confirmado.

### 3.7 Fim de jogo
- Resumo: tempo gravado, número de lances, espaço realmente usado, e a mensagem "o restante do jogo já foi apagado".
- Grade de lances (miniatura, duração, horário, origem do gatilho).
- Botões "Novo jogo" e "Postar um lance".

### 3.8 Editor do lance
- Preview com play.
- Linha do tempo de 60s com a janela de corte ajustável (padrão: últimos 30s).
- Ferramentas: Corte, Câmera lenta (Passe/Pro), Som.
- Botão "Próximo: Story".

### 3.9 Postar no Story
- Prévia 9:16 com template: esporte, data/hora, título, local opcional.
- Templates: Placar, Minimal, Arena (o plano grátis tem 1).
- Plano grátis: selo "feito com LANCE" + 720p. Passe/Pro: HD sem selo.
- "Postar no Story" abre o Instagram direto no editor de Stories.
- Também há "Salvar na galeria" e "Compartilhar" (folha de compartilhar do sistema).

### 3.10 Gesto
- Braços cruzados em X acima da cabeça, mantidos por ~1s. É um gesto deliberado, para não confundir com comemoração.
- Funciona para qualquer pessoa enquadrada.

### 3.11 Identidade visual (proposta dos mockups)
- Fundo escuro (#0F100D), texto areia-claro (#F3EFE4).
- Destaque lima "bola de tênis" (#D6F23F); vermelho/laranja para REC e alertas.
- Títulos em Barlow Condensed (estilo placar), texto em Manrope.
- Alvos de toque ≥44px e alto contraste para uso sob sol forte.

## 4. Arquitetura

```
┌──────────── JS (Expo Router + React) ─────────────┐
│ Telas · estado do jogo · paywall · editor · share │
└──────────────▲───────────────────┬────────────────┘
          eventos                   comandos
┌──────────────┴───────────────────▼────────────────┐
│ ReplayCamera (Expo Module nativo, Swift/Kotlin)   │
│ • Captura + preview + lente                       │
│ • Codificador → pedaços de 2s → anel de 30 (60s)  │
│ • Detector de gesto X (Apple Vision / ML Kit)     │
│ • Controle Bluetooth (tecla de volume)            │
│ • Ponte com o relógio (WatchConnectivity / Wear   │
│   Data Layer)                                     │
│ • Temperatura → reduz qualidade                   │
│ • Exportação (AVFoundation / Media3 Transformer)  │
└───────────────────────────────────────────────────┘
Apps de relógio: watchOS (SwiftUI, via expo-apple-targets) · Wear OS (Compose)
```

### 4.1 Stack
- Expo (SDK mais recente), New Architecture, Hermes, Expo Router.
- Reanimated (feedback e editor de corte), MMKV (metadados), RevenueCat (compras).
- Integração "Sharing to Stories" do Instagram (exige Facebook App ID), com a folha de compartilhar do sistema como alternativa.
- Analytics de eventos anônimos (ferramenta a definir no plano).
- EAS Build / EAS Update.

### 4.2 Interface do `ReplayCamera` (JS ↔ nativo)
- **Comandos:**
  - `startSession({ lens, maxQuality })`
  - `stopSession()`
  - `saveClip({ source, at })` → `{ clipPath, durationMs }`
  - `exportClip({ clipPath, trim, slowmo, template, resolution, watermark })` → `{ outputPath }`
  - `setGestureEnabled(bool)`
- **Eventos:**
  - `onTrigger({ source, at })`: vindo de gesto, controle ou relógio
  - `onThermalChange({ level, degraded })`
  - `onInterrupted()` / `onResumed()`
  - `onError({ code })`

### 4.3 Buffer
- Gravação contínua em pedaços de ~2s (MP4 fragmentado) numa pasta temporária. É mantido um anel de 30 pedaços (60s).
- O pedaço que sai da janela é apagado imediatamente. O espaço em uso fica fixo em ~75 MB (1080p60).
- Salvar um lance = juntar os pedaços da janela atual num MP4, sem recodificar.
- Encerrar o jogo, ou abrir o app depois de ele ter fechado inesperadamente, limpa a pasta temporária.

### 4.4 Barramento de gatilhos
- Toda origem (tela, gesto, controle, relógio) chama `salvarLance(origem, momento)`.
- Trava de 3s entre salvamentos, para que dois gatilhos quase juntos não salvem o lance em dobro.

### 4.5 Exportação
- Recodifica aplicando corte, câmera lenta, template, resolução e selo de acordo com o plano.
- A gravação é sempre na qualidade máxima suportada. O plano só limita o que sai na exportação.

## 5. Dados (no celular)

```
UsuárioAnônimo { id: uuid, criadoEm, revenueCatId }
Sessão         { id: uuid, esporte, início, fim, passeTransaçãoId? }
Lance          { id: uuid, sessãoId, criadoEm, origem: tela|gesto|controle|relógio,
                 arquivo, corte: { início, fim } }
Pagamentos     { primeiraSessãoUsada, passesUsados: [transaçãoId] }
Preferências   { lente, duraçãoPadrão: 30, gestoAtivo, relógioPareado }
```

- Os IDs são UUIDs gerados no aparelho, para facilitar o login futuro. O RevenueCat junta o histórico anônimo com a conta quando ela existir.
- Os vídeos ficam na pasta do app. A galeria recebe sempre uma cópia exportada.

## 6. Monetização

| Regra | Grátis | Passe Avulso (R$4,90) | Pro (R$19,90/mês) |
|---|---|---|---|
| Começar uma gravação | Só a primeira do aparelho | Uma gravação por Passe | Todas |
| Lances por gravação | Sem limite | Sem limite | Sem limite |
| Exportação | 720p | 1080p 60fps | 1080p 60fps |
| Selo/marca d'água | Sim | Não | Não |
| Câmera lenta | Não | Sim | Sim |
| Templates de Story | 1 | Todos | Todos |
| Relógio como gatilho | Não | Não | Sim |
| Validade | A primeira gravação, para sempre | A gravação a que foi ligado, para sempre | Mensal (7 dias grátis para quem tem direito) |

- O Passe é uma compra avulsa (consumível) pela loja e funciona como crédito: comprado na preparação, é consumido ao começar a próxima gravação; comprado no resumo/editor da gravação grátis, vale para ela. Ligado a uma gravação, continua valendo se o app reiniciar e nunca volta a ser crédito.
- A primeira gravação grátis é marcada no aparelho quando começa; apagar a gravação não a devolve (reinstalar sim, risco aceito sem login).
- Conteúdo digital é vendido só pelas compras da loja (Apple/Google). O kit físico é vendido fora do app (link externo, Pix).
- Hipótese a verificar: decisões regulatórias no Brasil (CADE vs. Apple) que permitam pagamento externo.

## 7. Erros e situações-limite

| Situação | Comportamento |
|---|---|
| Ligação / app em segundo plano | A gravação pausa, os lances salvos são mantidos e o buffer recomeça ao voltar |
| Superaquecimento | Reduz para 720p/30 e avisa. Em nível crítico, encerra com segurança e mantém os lances |
| Pouco espaço | Bloqueia "Começar jogo" abaixo de ~500 MB e avisa durante o jogo |
| Permissão negada | A tela explica o motivo e leva aos ajustes |
| Relógio/controle desconectado | O indicador fica cinza e os outros gatilhos continuam funcionando |
| Instagram não instalado | Usa a folha de compartilhar do sistema |
| App fechado inesperadamente | Limpa a pasta temporária ao abrir e mantém os lances já salvos |

## 8. Testes

- **JS (unitários):** trava de gatilhos, regras do Passe e do Pro, primeira gravação grátis e portão de início, estado da sessão.
- **Nativo:** testes do anel de pedaços (descarte e junção), em aparelho real.
- **Campo:** sessões de 2h ao sol, num iPhone e num Android intermediário.

## 9. Etapas

- **Etapa 0, spike (~1 semana):** buffer de 60s + gesto X por 2h ao sol em 2 aparelhos. Critério para seguir: sem queda da gravação, gesto com poucos falsos positivos, aquecimento sob controle.
- **Etapa 1, MVP:** tudo das seções 3 a 8.
- **Fora da v1:**
  - login, nuvem, compartilhar com parceiros e convite de amigos;
  - multi-ângulo, resumo automático do jogo, ranking "Lance da Semana";
  - arenas (B2B) e patrocínio nos templates;
  - loja do kit dentro do app.

### Ordem de entrega (atualizada em 2026-10-18)

Decisão do Marcus: entregar todas as funcionalidades antes de cobrar.

1. Plano 1: motor de câmera (feito)
2. Plano 2: telas, gatilhos e armazenamento (feito)
3. Plano 3: editor, Story, nome do jogo e "Meus jogos"
4. Plano 4: modos de uso baseados em predefinições. "Esporte" vira "Modo", agrupado em **Quadra** (beach tennis, futevôlei, vôlei de praia, outro) e **Academia** (musculação, crossfit, funcional, outro). Cada modo é uma entrada de um único registro de predefinições, que o resto do app só lê:
   - guia de posicionamento desenhado sobre a câmera (quadra em perspectiva, silhueta de pessoa, nenhum) e a dica em texto;
   - lente padrão (0.5x quadra, 1x academia);
   - gatilhos ligados por padrão (academia: voz, controle e tela; gesto "braços para cima" desligado, pois exercícios acima da cabeça o disparariam);
   - buffer e corte padrão (quadra 60s / 30s; academia 2 min / 60s);
   - templates e textos do Story (quadra: Placar, Minimal, Arena; academia: Treino, Recorde pessoal, Minimal, com exercício e carga).
   Ajustes que o usuário fizer ficam salvos por modo. Novos modos (skate, corrida, dança, família) = nova entrada no registro.
5. Plano 5: apps de relógio
6. Android no aparelho e teste de campo
7. Último: pagamento e assinatura (seção 6). Até lá tudo fica liberado; `useEntitlement()` é o único ponto que decide o que é pago, e hoje responde "pro".

## 10. Métricas de sucesso (metas iniciais são hipóteses)

| Métrica | Meta |
|---|---|
| % de jogos com ≥1 lance salvo | > 70% |
| Lances postados / salvos | > 30% |
| Uso por gatilho | descobrir |
| Conversão do paywall da segunda gravação | > 5% |
| Volta em 30 dias | > 25% |

## 11. Lançamento

- 2–3 arenas de beach tennis da região como piloto.
- Kit de presente para os primeiros jogadores, em troca de feedback e de Stories marcando o app.

## 12. Questões em aberto

- Nome definitivo do app.
- Ferramenta de analytics.
- Fornecedor e design do kit físico (clipe para alambrado + haste para areia, com quebra-sol).
