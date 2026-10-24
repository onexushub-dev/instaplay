# Paywall Repplay: ficha para o painel do RevenueCat

Aplicar na oferta `default` (Paywalls, no painel). Valores do kit de marca (`docs/brand/repplay/`) e de `app/src/theme/tokens.ts`.

## O que muda em relação à versão atual

| Elemento | Hoje | Repplay |
|---|---|---|
| Fundo da página | azul-marinho `#0F1226`-ish | **Ink `#0B0B09`** |
| Cartões e planos (fundo) | azul acinzentado | **Surface `#1B1D18`** |
| Plano selecionado (borda e fundo) | borda ciano, fundo azul | borda **Lima `#CFEA79`** 2 px, fundo Surface |
| Selo "SAVE 19%" | ciano com texto escuro | fundo **Lima**, texto **Ink** |
| Ícones dos benefícios | ciano sobre azul | **Lima** sobre Surface |
| Botão "Go Pro" | **vermelho coral** | fundo **Lima**, texto **Ink** |
| Texto principal | branco | **Paper `#F3EDE1`** |
| Texto secundário | cinza azulado | **Muted `#A9A79C`** |
| Links (Restore, Terms, Privacy) | cinza | **Muted** |
| Título | sans arredondada | **Barlow Condensed 700/800**, caixa alta, entrelinha 1.05 |
| Corpo, preços, rótulos | sans | **Manrope** 400/600/700 |

Por que o botão não pode ser vermelho: no app, o vermelho-laranja (`rec`, `#FF5A36`) significa só "gravando". Um botão de compra nessa cor lê como alerta e quebra a regra do kit de usar um único acento.

## Cores (todas do kit)

| Papel | Nome | HEX |
|---|---|---|
| Fundo | Ink | `#0B0B09` |
| Cartão / plano | Surface | `#1B1D18` |
| Contorno em repouso | Border | `#3A3D34` |
| Texto | Paper | `#F3EDE1` |
| Texto secundário | Muted | `#A9A79C` |
| Acento (botão, selo, ícones, plano selecionado) | Lima | `#CFEA79` |
| Texto sobre o acento | Ink | `#0B0B09` |

Nunca usar Lima sobre fundo branco ou claro (regra do kit).

## Contraste (WCAG, calculado)

| Par | Razão |
|---|---|
| Paper sobre Ink | 16,9:1 |
| Paper sobre Surface | 14,6:1 |
| Lima sobre Ink | 14,7:1 |
| Ink sobre Lima (botão e selo) | 14,7:1 |
| Muted sobre Ink | 8,2:1 |
| Muted sobre Surface | 7,0:1 |
| Border sobre Ink | 1,8:1, só decorativo: o plano selecionado se distingue por Lima, não pela borda cinza |

Todos os textos passam de 7:1.

## Forma

Raios do app: plano e cartão 14, botão 16, chip e selo 20, folha 24. Espaçamento de 4, 8, 12, 16, 20, 24. Botão com altura mínima de 52 e largura total.

## Hero (imagem do topo)

Manter a foto escura de quadra, mas escurecer a base até Ink `#0B0B09` na emenda com o conteúdo, sem o recorte azulado. A foto atual é de skate; o app é de esportes de quadra e areia (beach tennis, futevôlei, vôlei de praia), então troque por uma foto desses esportes, com câmera no tripé, aspecto cru de celular e sem acabamento de banco de imagens (direção do brief).

## Texto

O texto atual está só em inglês e usa "clips", enquanto o app usa "gravações" e "lances". Em pt-BR:

| Local | Texto |
|---|---|
| Título | GRAVE SEM LIMITES |
| Subtítulo | 5 gravações grátis por mês. O Pro não tem limite. |
| Benefício 1 | **Gravações ilimitadas**: sem teto mensal. Grave quando quiser. |
| Benefício 2 | **Clipes longos, Full HD e som**: passe de 15 segundos e fique com o áudio. |
| Benefício 3 | **Comece do pulso ou do controle**: Apple Watch, Bluetooth e celular controle. |
| Plano anual | Anual · SEU PREÇO LOCAL/ano · destaque "7 dias grátis" |
| Plano mensal | Mensal · cancele quando quiser · "7 dias grátis" |
| Passe avulso | Passe Avulso · uma gravação Pro, sem assinatura |
| Botão | Começar 7 dias grátis (assinaturas) |
| Rodapé | Renova sozinho. Cancele quando quiser. Restaurar · Termos · Privacidade |

Preço e moeda vêm sempre da loja; não escrever valores no painel. O selo de economia ("SAVE 19%") só pode aparecer se o painel calcular a diferença sozinho. O desconto do plano anual de R$ 99,90 contra 12 mensalidades de R$ 14,90 é de 44%, então o 19% atual não bate com o spec (os preços da imagem, US$ 69,99 e US$ 9,99, parecem ser de teste).

## Observações

1. A imagem mostra Anual US$ 69,99, Mensal US$ 9,99 e Passe US$ 2,99. O spec fixa R$ 99,90, R$ 14,90 e R$ 4,90 para o Brasil. Confira se as lojas têm os preços certos antes de publicar.
2. O texto "Go Pro" e "Pro" devem seguir o nome do plano no app. Os cadeados do app já usam "Pro".
3. Depois de publicar, abrir o paywall no aparelho (`presentPaywall`) e conferir o botão, o selo e os ícones, porque o preview do painel nem sempre mostra a fonte real.
