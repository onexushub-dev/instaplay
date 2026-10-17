# Teste de campo: Etapa 0 (buffer + gesto)

Objetivo: decidir se o `ReplayCamera` aguenta um jogo real antes de construir o app (spec §9).

## Preparação

- Builds de release instaladas em **um iPhone** e **um Android intermediário**:
  - iOS: `cd app && npx expo run:ios --configuration Release --device` (requer Xcode 26.4+)
  - Android: `cd app && npx expo run:android --variant release --device`
- Bateria em 100%, pelo menos 2 GB livres, modo avião desligado.
- Quadra de areia, **sol direto**, celular preso no alambrado ou na haste, atrás da linha de fundo, na altura do ombro, na horizontal.

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
