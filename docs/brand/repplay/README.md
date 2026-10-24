# Repplay: kit de marca

Gerado por `_build/build_brand.py` a partir da marca aprovada. Slogan atual nos arquivos: **SEU LANCE. DE NOVO.**
Abra `guia-de-marca.html` para ver tudo montado.

## Estrutura

| Pasta | O que tem |
|---|---|
| `logo/svg` | Todos os logos em vetor, sem fundo, recorte justo. Fonte-mestre para qualquer uso. |
| `logo/png` | Os mesmos logos em PNG transparente (512, 1024 e 2048 px na dimensão maior). |
| `logo/pdf` | Os mesmos logos em PDF vetorial, para gráfica e apresentações. |
| `icones/app` | Ícone iOS (1024), Android adaptive (foreground, background, monocromático), Play Store, notificação, splash. |
| `icones/web` | favicon (svg, ico, 16/32/48/64), apple-touch, ícones PWA, máscara maskable, manifest e snippet de `<head>`. |
| `social` | Avatares, OG 1200x630, banners (X, LinkedIn, Facebook, YouTube), posts e stories, capa de slide, assinatura de e-mail. |
| `cores.css`, `cores.json` | Cores da marca. |

## Nomes dos logos

`repplay-<formato>-<versão>.<ext>`

- **formato**: `simbolo` (a logo reduzida: o símbolo sem o nome), `palavra` (só o logotipo), `horizontal`, `vertical`; cada um existe também com `-slogan`.
- **versão**: `fundo-claro` (tinta + oliva), `fundo-escuro` (paper + lima), `preto`, `branco`.

## Quando usar cada formato

- **horizontal**: padrão. Site, cabeçalho, documentos, apresentações.
- **vertical**: capas, stories, embalagem, assinatura em espaços quadrados.
- **palavra**: quando o símbolo já aparece ao lado (rodapé de landing, texto corrido).
- **símbolo** (logo reduzida): o logo sem o nome, idêntico ao símbolo do logo completo, com o retroceder, o play e o R. Favicon, ícone do app, avatar, notificação, selos, bordados, splash.
- **com slogan**: só a partir de 180 px de largura. Abaixo disso, use sem slogan.

## Cores

| Nome | HEX | RGB | CMYK aprox. | Uso |
|---|---|---|---|---|
| Ink | `#0B0B09` | (11, 11, 9) | (0, 0, 18, 96) | Fundo escuro, texto e símbolo sobre fundo claro. |
| Paper | `#F3EDE1` | (243, 237, 225) | (0, 2, 7, 5) | Texto e símbolo sobre fundo escuro; fundo quente alternativo. |
| Lima | `#D6F23F` | (214, 242, 63) | (12, 0, 74, 5) | Acento sobre fundo escuro (o triângulo play). Nunca sobre branco: contraste insuficiente. |
| Oliva | `#5F7D0B` | (95, 125, 11) | (24, 0, 91, 51) | O acento da versão para fundo claro (triângulo play). |

CMYK é conversão matemática, não referência de gráfica. Peça prova de cor e Pantone equivalente ao fornecedor antes de imprimir em escala.
O app usa o mesmo lima do logo (`#D6F23F`): o acento da interface (`colors.accent`, em `app/src/theme/tokens.ts`) foi alinhado a ele.

## Regras rápidas

1. Fundo claro: versão `fundo-claro` ou `preto`. Fundo escuro: `fundo-escuro` ou `branco`. Em foto ou cor chapada: `preto` ou `branco`, o que tiver mais contraste.
2. Lima nunca sobre branco ou claro.
3. Área de proteção: metade da altura do símbolo em todos os lados.
4. Tamanho mínimo: horizontal 96 px / 25 mm; vertical 80 px; símbolo 24 px (16 px só em favicon).
5. Não esticar, girar, recolorir, aplicar sombra ou contorno.

## Slogan

“Já estava gravando.” descreve a tecnologia (um buffer sempre ligado), não o que a pessoa ganha. Fora de contexto soa como aviso de câmera/vigilância, e não cita o lance, o esporte nem o replay. É boa como mensagem de onboarding, não como assinatura da marca.

| Slogan | Papel | Por quê | Em inglês (lojas) |
|---|---|---|---|
| Seu lance. De novo. | Recomendado | Diz “replay” sem repetir a palavra (o nome já tem o jogo de letras). Duas frases curtas, ritmo de narração esportiva, serve para qualquer esporte. | Your play. Again. |
| Nenhum lance perdido. | Alternativa | Promessa direta e fácil de provar: o app existe para isso. Mais “utilidade” que “emoção”. | Never miss a play. |
| O lance volta. | Alternativa | A mais curta (14 letras), boa em ícone e story. Remete ao conceito antigo do app (“o lance voltou”). | The play is back. |
| Toque. Reveja. Comemore. | Alternativa | Mostra o uso em três passos. Boa para landing page e anúncio, pesada para assinatura de logo. | Tap. Replay. Celebrate. |
| Todo lance tem volta. | Alternativa | Jogo de palavras com o ditado “tudo tem volta”. Mais bem-humorada; arrisca ser lida como ameaça. | Every play comes back. |

Para trocar o slogan e regerar tudo:

```
pip install fonttools pillow && brew install librsvg
python3 _build/build_brand.py --slogan "NENHUM LANCE PERDIDO."
```

## Notas técnicas

- O símbolo foi reconstruído com geometria exata (retas e arcos, cantos arredondados). O logotipo foi vetorizado a partir da arte aprovada e suavizado; as letras são curvas, sem fonte.
- O slogan usa Manrope Medium (a mesma fonte de texto do app), caixa alta, espaçamento largo, convertida em curvas.
- Removi o “TM” da arte original. Se registrar a marca, acrescente ® ou ™ conforme o caso.
- Faça busca de anterioridade no INPI e em lojas de app antes de investir em material impresso. Isto não é parecer jurídico.
