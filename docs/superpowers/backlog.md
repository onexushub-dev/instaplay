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

## Gesto, voz e avisos (revisão de 2026-10-18)
- Miniatura usa sempre o quadro do primeiro corte; depois de editar o corte ela não acompanha (aceitável).
- Voz: ~1–2s de fala se perdem a cada reinício de 50s; um comando bem na virada pode passar.
- Gesto: com muita gente no quadro, os 4 maiores são analisados; jogadores do lado de lá podem ficar de fora.
- Android: a ultra-wide geralmente não tem flash e não há alternativa (sem piscada na 0.5x).
- Android: `applyTorch` reconstrói a requisição de captura à mão; compartilhar um único construtor com `open()`.
- iOS: a troca de saída para o alto-falante a cada som pode mudar o microfone usado quando há fone Bluetooth.
- Bloco "Voz" não detecta permissão de fala revogada nos Ajustes.

## Editor, Story e Meus jogos (revisão de 2026-10-18)
- Erros de salvar na galeria/compartilhar (depois de exportar) aparecem como "Não foi possível preparar o vídeo".
- Alças do corte se sobrepõem no mínimo de 3s; a do fim fica por cima e a do início é difícil de pegar.
- `renameSession` com id desconhecido lança erro (a interface já evita).
- Android: overlay some em silêncio se o PNG não decodificar; sem redimensionar em proporções fracionárias; `durationMs` pode vir indefinido do Transformer.
- Android: FileProvider genérico pode conflitar com outra biblioteca no futuro (usar uma subclasse própria).
- iOS: corte que começa depois do fim real da mídia vira erro genérico.
- Jogos não encerrados aparecem em "Meus jogos" com 0 min gravados.

## Plano 4 (modos de uso) — minors adiados
- Template do Story é global: escolher Treino num Story de academia faz o próximo Story de quadra voltar para Placar (guardar por grupo de modo).
- Trocar Quadra ↔ Academia sempre cai no primeiro modo do grupo (lembrar o último modo de cada grupo).
- Dois modos com o rótulo "Outro" (quadra e academia) — diferenciar nas listas e no Story.
- `TEMPLATES` (só quadra) em `story/templates.ts` não é mais usado — remover.
- Android `ReplayEngine.kt`: `ring`/`windowSeconds` trocados na thread do engine e lidos no `saveExecutor` sem `@Volatile`.
- Story de academia pode ter até 120 s: confirmar no aparelho se o Instagram aceita ou divide.
- Clipes de academia ficam com ~90 MB (120 s inteiros) e o espaço livre só é checado no início do jogo.

## Plano 5 (Apple Watch) — adiados
- Web: `ReplayCameraModule.web.ts` não tem `watchSync`; o `SessionProvider` quebra no web (antes só a tela de preparação). Só importa se o web virar alvo.
- Acessibilidade do relógio: o alvo de toque em tela cheia anuncia só "Salvar" no VoiceOver.
- Medir no aparelho: calor do iPhone e quadros descartados com a câmera do relógio ligada por 5 min (o `CIImage` segura um buffer de captura enquanto codifica o JPEG).
- Build: `@bacons/apple-targets` 5.0.0 exige CocoaPods ≥ 1.17 (máquinas de build/EAS também); `deploymentTarget` 11.0 deixa de fora Series 4/5.
- Rodar o app do relógio pelo Xcode reinstala o app do iPhone em Debug: colocar a configuração Run do esquema "LANCE Watch" em Release.
- Quando o iPhone mata o app com o relógio em alcance, um toque no relógio ainda tenta abrir o app em segundo plano (a mensagem pode chegar antes do módulo estar pronto); hoje a tela do relógio vira "Sem conexão" em até 12 s.
- Câmera ocupada por outro app (ligação de vídeo no Meet/FaceTime): o iOS devolve -11800 e a tela só diz "A gravação parou: erro na câmera". Mostrar "A câmera está em uso por outro app. Encerre a ligação e tente de novo." quando o erro vier logo ao abrir.
