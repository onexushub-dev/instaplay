# Teste de campo: Etapa 0 (buffer + gesto)

Objetivo: decidir se o `ReplayCamera` aguenta um jogo real antes de construir o app (spec §9).

## Status (2026-10-17)

Adiado por decisão do Marcus para seguir com o Plano 2. **Precisa rodar antes de qualquer piloto com jogadores.**

Já conferido no iPhone 16 Pro (iOS 27.1):
- salvar cedo/tarde, clipes 1080p60 com áudio começando em 0
- rotação correta em pé e deitado
- buffer ~77 MB/min a 10 Mbps
- gesto X na horizontal a ~3 m (3/3)

Plano 2 (telas + gatilhos): fluxo completo conferido no iPhone em 2026-10-18 — boas-vindas → posicionar → salvar por tela/gesto/controle → desfazer → fim de jogo → player.

Plano 3 (editor, Story, Meus jogos): conferido no iPhone em 2026-10-18 — prévia e templates (Placar/Minimal/Arena) sobre vídeo em pé, galeria. Instagram direto aguarda o ID de app da Meta.

Plano 4 (modos Quadra e Academia): conferido no iPhone em 2026-10-18 — painel de preparação recolhível, guia de moldura na Academia (1x, gesto desligado, voz, buffer 120 s, corte 60 s), Story Treino/Recorde com exercício e carga; Quadra mantém 0.5x, gesto e 60 s.

Plano 5 (Apple Watch): conferido no iPhone 16 Pro e no Apple Watch Series 10 em 2026-10-19 — botão Salvar, vibração e aviso verde "Salvo" ao confirmar, câmera ao vivo em tela cheia com toque em qualquer lugar para salvar, bloco Relógio na preparação. Wear OS fica para a etapa do Android.

Ainda falta:
- **Android inteiro**: nenhum aparelho testado
- gesto a 5–8 m e contagem de falsos positivos (V de comemoração)
- conferências 3, 4, 5, 7 e 8 abaixo
- o teste de 2h ao sol
- remover o evento de diagnóstico `onGestureDebug` antes do app final

## Preparação

- Builds de release instaladas em **um iPhone** e **um Android intermediário**:
  - iOS: `cd app && npx expo run:ios --configuration Release --device` (requer Xcode 26.4+)
  - Android: `cd app && npx expo run:android --variant release --device`
- Bateria em 100%, pelo menos 2 GB livres, modo avião desligado.
- Quadra de areia, **sol direto**, celular preso no alambrado ou na haste, atrás da linha de fundo, na altura do ombro, na horizontal.

## Conferências rápidas antes do jogo (por aparelho, ~15 min)

1. **Salvar cedo:** Iniciar, salvar aos 10s → clipe de ~10s que toca.
2. **Salvar tarde:** esperar 3 min, salvar → clipe de 58–60s que **começa a tocar na hora** (sem tela preta no início) e dura o que o painel mostra.
3. **Fim do clipe:** filmar um cronômetro, salvar → o último quadro fica a até 1s depois do toque (iOS) ou até 0,5s (Android).
4. **Gravação contínua:** salvar 3 vezes seguidas filmando o cronômetro → o clipe seguinte não tem "buraco" logo após cada salvamento.
5. **Som:** bater palmas na frente da câmera → som e imagem sincronizados.
6. **Gesto na horizontal:** celular preso na horizontal, X a ~8 m → salva. Braços para cima sem cruzar, 5 vezes → não salva. Segurar o X por 4s → salva só uma vez.
7. **Microfone negado (iOS):** negar o microfone nos Ajustes → os salvamentos continuam funcionando (clipe sem som).
8. **Calor (iOS):** Xcode → Devices → Condition → Thermal State: Serious → painel mostra 720p30 e continua gravando.

## Protocolo (por aparelho)

1. Abrir o app, tocar em **Iniciar** e conferir que o painel mostra "gravando".
2. Jogar normalmente por **2h**.
3. A cada ~5 min, um jogador faz o **X** (braços cruzados acima da cabeça, ~1s) a ~8 m do celular. São **24 X** no total. Anotar o horário de cada um.
4. Anotar todo salvamento que **não** veio de um X deliberado (falso positivo).
5. Uma vez a cada 30 min, conferir no painel o "buffer MB (máx)" e a temperatura.
6. Depois de 2h, tocar em **Parar** e copiar os números do painel.
7. Abrir 3 clipes salvos ao acaso: precisam tocar, ter ~60s e conter o X perto do fim.

## Critérios para seguir (todos)

| Critério | Meta |
|---|---|
| Gravação contínua | sem queda em 2h |
| X detectados | ≥ 22 de 24 |
| Falsos gatilhos | ≤ 2 em 2h |
| Buffer em disco | ≤ 100 MB o tempo todo |
| Calor | nenhum desligamento forçado (720p30 é aceitável) |

## Resultados

| Aparelho | SO | Duração | X detectados /24 | Falsos gatilhos | Buffer máx (MB) | Pico térmico | Observações |
|---|---|---|---|---|---|---|---|
| | | | | | | | |
| | | | | | | | |

**Veredito:** _seguir_ / _ajustar_ (se ajustar: qual critério falhou e qual alternativa da spec usar, como só 720p no Android ou gesto com confirmação).
