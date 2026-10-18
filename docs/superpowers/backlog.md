# Backlog técnico

Itens adiados nas revisões finais. Nada aqui bloqueia o uso, mas vale resolver antes do piloto.

## Plano 1 — ReplayCamera
- Capacidade do buffer por número de segmentos; preferir descarte por tempo.
- iOS: start/stopRunning na mesma fila das amostras.
- Android: qualquer pausa da activity (bloqueio de tela, diálogos) zera o buffer.
- Android: ultra-wide acessível só por zoom < 1 em câmera lógica não é usada.
- Android: prévia esticada (TextureView sem transformação).
- Remover o evento de diagnóstico `onGestureDebug` e a rota `/spike` antes da loja.

## Plano 2 — telas e gatilhos
- Erros nativos que não são de calor aparecem todos como "erro na câmera" (LOW_STORAGE no meio do jogo deveria dizer pouco espaço).
- Toque duplo em "Desfazer" pode descontar dois lances; toque duplo em "Começar jogo" pode iniciar duas vezes.
- Voltar (Android) na tela de erro ou durante o encerramento pergunta de novo se quer encerrar.
- `onError` fora da gravação marca a sessão como encerrada na tela de posicionar.
- Ícones de gatilho na gravação aparecem ativos mesmo com o gesto desligado.
- CAMERA_PERMISSION na tela de posicionar não tem botão "Abrir Ajustes".
- `SavedOverlay` sem `accessibilityViewIsModal`.
- Miniatura: player vaza se a geração nunca terminar; cache guarda clipes apagados.
- Loop do player para se a mídia for mais curta que `durationMs`.
- Repositório: `endSession` com id desconhecido, JSON corrompido, dependência de `this`.
- Promessas sem tratamento (onboarding, háptico).
- Debounce do barramento atravessa jogos.
- Android: abrir a câmera antes da superfície da prévia estar pronta pode deixar a prévia preta — verificar no aparelho.
