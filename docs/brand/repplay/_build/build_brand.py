#!/usr/bin/env python3
"""Regenerates every Repplay brand asset from geometry.json.

    python3 build_brand.py                                  # default slogan
    python3 build_brand.py --slogan "NENHUM LANCE PERDIDO." # any other slogan

Needs: fonttools, pillow, rsvg-convert (brew install librsvg).
Google Chrome is optional (only used for the guide preview PNG).
The symbol is built from exact geometry (lines + arcs); the wordmark was traced from the
approved artwork and smoothed. Slogan letters are Manrope Medium, converted to outlines.
"""
import argparse, io, json, os, shutil, subprocess, sys
from pathlib import Path
from PIL import Image
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

HERE = Path(__file__).resolve().parent
OUT = HERE.parent
GEO = json.loads((HERE / 'geometry.json').read_text())
FONT = HERE / 'fonts' / 'Manrope_500Medium.ttf'

# ---- brand tokens ---------------------------------------------------------------------------
INK, PAPER, LIME, OLIVE, WHITE = '#0B0B09', '#F3EDE1', '#CFEA79', '#5F7D0B', '#FFFFFF'
SCHEMES = {  # name -> (main, accent)
    'fundo-claro':  (INK, OLIVE),
    'fundo-escuro': (PAPER, LIME),
    'preto':        (INK, INK),
    'branco':       (WHITE, WHITE),
}

# ---- helpers --------------------------------------------------------------------------------
def rsvg(svg, out, w=None, h=None, fmt='png'):
    cmd = ['rsvg-convert', '-f', fmt, '-o', str(out)]
    if w: cmd += ['-w', str(int(round(w)))]
    if h: cmd += ['-h', str(int(round(h)))]
    subprocess.run(cmd, input=svg.encode(), check=True)

def measure(inner, vb=(-200, -200, 2400, 900), scale=2):
    """tight bounding box (user units) of some SVG markup, found by rasterising it"""
    x, y, w, h = vb
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}">{inner}</svg>'
    buf = io.BytesIO(); p = subprocess.run(['rsvg-convert', '-w', str(int(w * scale))], input=svg.encode(), capture_output=True, check=True)
    im = Image.open(io.BytesIO(p.stdout)).convert('RGBA')
    bb = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    return (x + bb[0] / scale, y + bb[1] / scale, x + bb[2] / scale, y + bb[3] / scale)

def N(v): return ('%.2f' % v).rstrip('0').rstrip('.')

# ---- slogan outlines --------------------------------------------------------------------------
def slogan_path(text, x_left, cap_top, cap_h, width):
    font = TTFont(FONT); gs = font.getGlyphSet(); cmap = font.getBestCmap(); upem = font['head'].unitsPerEm
    cap = font['OS/2'].sCapHeight; k = cap_h / cap
    names = [cmap[ord(c)] for c in text]
    adv = [font['hmtx'][n][0] * k for n in names]
    def ink(n):
        pen = SVGPathPen(gs); gs[n].draw(pen); return pen
    # natural ink extents of first/last glyph, to align ink (not advance box) to x_left / x_left+width
    from fontTools.pens.boundsPen import BoundsPen
    def bounds(n):
        bp = BoundsPen(gs); gs[n].draw(bp); return bp.bounds
    first = bounds(names[0]); last = next((bounds(n) for n in reversed(names) if bounds(n)), None)
    lsb = first[0] * k
    last_rsb = adv[-1] - last[2] * k
    natural = sum(adv) - lsb - last_rsb
    gaps = len(text) - 1
    track = (width - natural) / gaps
    base = cap_top + cap_h; x = x_left - lsb; d = ''
    for n, a in zip(names, adv):
        pen = SVGPathPen(gs, ntos=lambda v: N(v))
        tp = TransformPen(pen, (k, 0, 0, -k, x, base)); gs[n].draw(tp); d += pen.getCommands()
        x += a + track
    return d

# ---- artwork pieces (all in the 1600x492 source canvas) ---------------------------------------
M = GEO['mark']; W = GEO['word']
WORD_X0, WORD_X1 = 524.8, 1516.0
SLOGAN_CAP_TOP, SLOGAN_CAP_H, SLOGAN_W = 389.0, 25.5, 758.0

def mark_parts(compact=False):
    keys = ['T1', 'G', 'R'] if compact else ['T1', 'G', 'T2', 'R']
    return [(M[k], 'accent' if k == 'G' else 'ink', '') for k in keys]

def word_parts():
    return [(W['ink'], 'ink', ' fill-rule="evenodd"'), (W['green'], 'accent', '')]

def paint(parts, scheme, transform=''):
    main, acc = SCHEMES[scheme] if isinstance(scheme, str) else scheme
    g = ''.join(f'<path fill="{acc if role == "accent" else main}"{extra} d="{d}"/>' for d, role, extra in parts)
    return f'<g transform="{transform}">{g}</g>' if transform else g

def raw(parts, transform=''):
    return paint(parts, ('#000', '#000'), transform)

class Art:
    """a lockup = list of (parts, transform); knows its own tight bbox"""
    def __init__(self, items): self.items = items; self._bb = None
    def markup(self, scheme): return ''.join(paint(p, scheme, t) for p, t in self.items)
    @property
    def bb(self):
        if self._bb is None:
            self._bb = measure(''.join(raw(p, t) for p, t in self.items), vb=(-400, -400, 3200, 1600))
        return self._bb
    def svg(self, scheme, title, pad=0.0):
        x0, y0, x1, y1 = self.bb; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad
        w, h = x1 - x0, y1 - y0
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{N(x0)} {N(y0)} {N(w)} {N(h)}" width="{N(w)}" height="{N(h)}" role="img" aria-label="{title}">'
                f'<title>{title}</title>{self.markup(scheme)}</svg>')

def build_arts(slogan):
    sp = [(slogan_path(slogan, WORD_X0, SLOGAN_CAP_TOP, SLOGAN_CAP_H, SLOGAN_W), 'ink', '')]
    sp_full = [(slogan_path(slogan, WORD_X0, SLOGAN_CAP_TOP, SLOGAN_CAP_H, WORD_X1 - WORD_X0), 'ink', '')]
    full = Art([(mark_parts(False), '')])
    mx0, my0, mx1, my1 = full.bb
    wd = Art([(word_parts(), '')])
    wx0, wy0, wx1, wy1 = wd.bb
    arts = {
        'simbolo': full,
        'palavra': wd,
        'palavra-slogan': Art([(word_parts(), ''), (sp, '')]),
        'horizontal': Art([(mark_parts(False), ''), (word_parts(), '')]),
        'horizontal-slogan': Art([(mark_parts(False), ''), (word_parts(), ''), (sp, '')]),
    }
    # stacked: symbol (scaled) centred above the wordmark
    s = 1.25; mw, mh = (mx1 - mx0) * s, (my1 - my0) * s; ww = wx1 - wx0
    mt = f'translate({N((wx0 + ww / 2) - mw / 2 - mx0 * s)} {N(-my0 * s)}) scale({s})'
    wy_shift = mh + 96 - wy0
    wt = f'translate(0 {N(wy_shift)})'
    st_slogan = slogan_path(slogan, WORD_X0 + (ww - SLOGAN_W) / 2, SLOGAN_CAP_TOP, SLOGAN_CAP_H, SLOGAN_W)
    arts['vertical'] = Art([(mark_parts(False), mt), (word_parts(), wt)])
    arts['vertical-slogan'] = Art([(mark_parts(False), mt), (word_parts(), wt), ([(st_slogan, 'ink', '')], wt)])
    return arts

LABELS = {
    'simbolo': 'Repplay símbolo', 'palavra': 'Repplay logotipo',
    'palavra-slogan': 'Repplay logotipo com slogan', 'horizontal': 'Repplay logo horizontal',
    'horizontal-slogan': 'Repplay logo horizontal com slogan', 'vertical': 'Repplay logo vertical',
    'vertical-slogan': 'Repplay logo vertical com slogan',
}

def write(path, data, mode='w'):
    path.parent.mkdir(parents=True, exist_ok=True)
    (path.write_bytes if mode == 'wb' else path.write_text)(data)

# ---- logos ------------------------------------------------------------------------------------
def build_logos(arts):
    for name, art in arts.items():
        for sch in SCHEMES:
            svg = art.svg(sch, f'{LABELS[name]} ({sch.replace("-", " ")})')
            base = f'repplay-{name}-{sch}'
            write(OUT / 'logo/svg' / f'{base}.svg', svg)
            (OUT / 'logo/pdf').mkdir(parents=True, exist_ok=True); (OUT / 'logo/png').mkdir(parents=True, exist_ok=True)
            rsvg(svg, OUT / 'logo/pdf' / f'{base}.pdf', fmt='pdf')
            x0, y0, x1, y1 = art.bb; ar = (x1 - x0) / (y1 - y0)
            for px in (512, 1024, 2048):
                if ar >= 1: rsvg(svg, OUT / 'logo/png' / f'{base}-{px}w.png', w=px)
                else: rsvg(svg, OUT / 'logo/png' / f'{base}-{px}h.png', h=px)

# ---- canvases (icons, banners, social) ----------------------------------------------------------
def place(art, scheme, W, H, cx, cy, max_w, max_h):
    x0, y0, x1, y1 = art.bb; bw, bh = x1 - x0, y1 - y0
    s = min(max_w / bw, max_h / bh)
    tx, ty = cx - (x0 + bw / 2) * s, cy - (y0 + bh / 2) * s
    return f'<g transform="translate({N(tx)} {N(ty)}) scale({s:.5f})">{art.markup(scheme)}</g>'

def canvas(W, H, bg, placed, radius=0, title=''):
    r = f' rx="{N(radius)}"' if radius else ''
    back = f'<rect width="{W}" height="{H}" fill="{bg}"{r}/>' if bg else ''
    t = f'<title>{title}</title>' if title else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{t}{back}{"".join(placed)}</svg>'

def png(svg, path, w=None, h=None, flatten=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    rsvg(svg, path, w=w, h=h)
    if flatten:  # opaque RGB (App Store icons must not have an alpha channel)
        im = Image.open(path).convert('RGBA'); bg = Image.new('RGBA', im.size, flatten); bg.alpha_composite(im); bg.convert('RGB').save(path)

def ico(entries, path):
    """entries: list of (size, png bytes) -> .ico with PNG payloads"""
    import struct
    head = struct.pack('<HHH', 0, 1, len(entries)); off = 6 + 16 * len(entries); dirs = b''; data = b''
    for size, b in entries:
        dirs += struct.pack('<BBBBHHII', size % 256, size % 256, 0, 0, 1, 32, len(b), off + len(data)); data += b
    path.write_bytes(head + dirs + data)

def build_icons(arts):
    comp = full = arts['simbolo']
    A = OUT / 'icones'
    sq = lambda size, bg, art, scheme, frac, radius=0, dy=0: canvas(size, size, bg, [place(art, scheme, size, size, size / 2, size / 2 + dy, frac * size, frac * size)], radius)
    on_dark = 'fundo-escuro'
    # --- iOS ---
    png(sq(1024, INK, comp, on_dark, .72), A / 'app/ios/repplay-ios-1024.png', 1024, flatten=INK)
    png(sq(1024, LIME, comp, 'preto', .72), A / 'app/ios/repplay-ios-1024-lima.png', 1024, flatten=LIME)
    png(sq(1024, '#000000', comp, ('#FFFFFF', '#9A9A9A'), .72), A / 'app/ios/repplay-ios-1024-tinted.png', 1024, flatten='#000000')
    # --- Android (adaptive: foreground must live inside the central 66%) ---
    png(sq(1024, None, comp, on_dark, .52), A / 'app/android/repplay-adaptive-foreground-1024.png', 1024)
    png(canvas(1024, 1024, INK, []), A / 'app/android/repplay-adaptive-background-1024.png', 1024)
    png(sq(1024, None, comp, ('#FFFFFF', '#FFFFFF'), .52), A / 'app/android/repplay-adaptive-monochrome-1024.png', 1024)
    png(sq(512, INK, comp, on_dark, .72), A / 'app/android/repplay-play-store-512.png', 512, flatten=INK)
    png(sq(96, None, comp, ('#FFFFFF', '#FFFFFF'), .88), A / 'app/android/repplay-notification-96.png', 96)
    # --- splash (the app is always dark: transparent PNG over the ink background) ---
    png(sq(1024, None, full, on_dark, .72), A / 'app/repplay-splash-icon-1024.png', 1024)
    # --- web ---
    W_ = A / 'web'; rad = .2237
    def fav(size):
        frac = .88 if size <= 16 else .82 if size <= 32 else .78
        return sq(size, INK, comp, on_dark, frac, radius=size * rad)
    write(W_ / 'favicon.svg', sq(64, INK, comp, on_dark, .76, radius=64 * rad).replace('<svg ', '<svg ', 1))
    pngs = {}
    for size in (16, 32, 48, 64):
        png(fav(size), W_ / f'favicon-{size}.png', size); pngs[size] = (W_ / f'favicon-{size}.png').read_bytes()
    ico([(16, pngs[16]), (32, pngs[32]), (48, pngs[48])], W_ / 'favicon.ico')
    png(sq(180, INK, comp, on_dark, .72), W_ / 'apple-touch-icon-180.png', 180, flatten=INK)
    png(sq(192, INK, comp, on_dark, .74, radius=192 * rad), W_ / 'icon-192.png', 192)
    png(sq(512, INK, comp, on_dark, .74, radius=512 * rad), W_ / 'icon-512.png', 512)
    png(sq(512, INK, comp, on_dark, .58), W_ / 'icon-maskable-512.png', 512, flatten=INK)
    write(W_ / 'safari-pinned-tab.svg', sq(64, None, comp, ('#000', '#000'), .90))
    write(W_ / 'site.webmanifest', json.dumps({
        'name': 'Repplay', 'short_name': 'Repplay', 'background_color': INK, 'theme_color': INK, 'display': 'standalone',
        'icons': [{'src': 'icon-192.png', 'sizes': '192x192', 'type': 'image/png'},
                  {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png'},
                  {'src': 'icon-maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'}]}, indent=2) + '\n')
    write(W_ / 'head-snippet.html', """<!-- paste inside <head>; adjust the base path to wherever you host these files -->
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon-180.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="mask-icon" href="/safari-pinned-tab.svg" color="#0B0B09">
<meta name="theme-color" content="#0B0B09">
<meta property="og:image" content="/og-1200x630-escuro.png">
<meta name="twitter:card" content="summary_large_image">
""")

def build_social(arts):
    S = OUT / 'social'; hs, vs, comp = arts['horizontal-slogan'], arts['vertical-slogan'], arts['simbolo']
    hz = arts['horizontal']
    dark, light = 'fundo-escuro', 'fundo-claro'
    def banner(name, W, H, bg, art, scheme, mw, mh, bgmark=None):
        png(canvas(W, H, bg, [place(art, scheme, W, H, W / 2, H / 2, mw * W, mh * H)]), S / name, W)
    # avatars (circle-safe)
    for nm, bg, sch in (('escuro', INK, dark), ('lima', LIME, 'preto'), ('claro', PAPER, light)):
        png(canvas(1024, 1024, bg, [place(comp, sch, 1024, 1024, 512, 512, .62 * 1024, .62 * 1024)]), S / f'repplay-avatar-1024-{nm}.png', 1024)
    # link previews + banners
    banner('repplay-og-1200x630-escuro.png', 1200, 630, INK, hs, dark, .68, .56)
    banner('repplay-og-1200x630-claro.png', 1200, 630, PAPER, hs, light, .68, .56)
    banner('repplay-twitter-header-1500x500-escuro.png', 1500, 500, INK, hs, dark, .58, .64)
    banner('repplay-linkedin-banner-1584x396-escuro.png', 1584, 396, INK, hz, dark, .50, .56)
    banner('repplay-facebook-cover-1640x624-escuro.png', 1640, 624, INK, hs, dark, .46, .50)
    banner('repplay-youtube-banner-2560x1440-escuro.png', 2560, 1440, INK, hs, dark, .36, .26)
    # feed / stories / slides
    banner('repplay-instagram-post-1080x1350-escuro.png', 1080, 1350, INK, vs, dark, .64, .50)
    banner('repplay-instagram-post-1080x1350-lima.png', 1080, 1350, LIME, vs, 'preto', .64, .50)
    banner('repplay-instagram-story-1080x1920-escuro.png', 1080, 1920, INK, vs, dark, .66, .36)
    banner('repplay-instagram-story-1080x1920-lima.png', 1080, 1920, LIME, vs, 'preto', .66, .36)
    banner('repplay-slide-capa-1920x1080-escuro.png', 1920, 1080, INK, hs, dark, .46, .40)
    banner('repplay-slide-capa-1920x1080-claro.png', 1920, 1080, PAPER, hs, light, .46, .40)
    # e-mail signature (light backgrounds)
    for px in (240, 480):
        rsvg(hz.svg(light, LABELS['horizontal']), S / f'repplay-email-assinatura-{px}w.png', w=px)

# ---- tokens, README, guide ----------------------------------------------------------------------
def hex2rgb(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
def cmyk(h):
    r, g, b = [v / 255 for v in hex2rgb(h)]; k = 1 - max(r, g, b)
    if k >= 1: return (0, 0, 0, 100)
    return tuple(round(100 * v) for v in ((1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k))

COLORS = [
    ('Ink', INK, 'Fundo escuro, texto e símbolo sobre fundo claro.'),
    ('Paper', PAPER, 'Texto e símbolo sobre fundo escuro; fundo quente alternativo.'),
    ('Lima', LIME, 'Acento sobre fundo escuro (o triângulo play). Nunca sobre branco: contraste insuficiente.'),
    ('Oliva', OLIVE, 'O acento da versão para fundo claro (triângulo play).'),
]

def build_tokens():
    write(OUT / 'cores.json', json.dumps({n.lower(): {'hex': h, 'rgb': hex2rgb(h), 'cmyk_aprox': cmyk(h)} for n, h, _ in COLORS}, indent=2) + '\n')
    write(OUT / 'cores.css', ':root {\n' + ''.join(f'  --repplay-{n.lower()}: {h};\n' for n, h, _ in COLORS) + '}\n')

SLOGANS = [
    ('Seu lance. De novo.', 'Recomendado', 'Diz “replay” sem repetir a palavra (o nome já tem o jogo de letras). Duas frases curtas, ritmo de narração esportiva, serve para qualquer esporte.', 'Your play. Again.'),
    ('Nenhum lance perdido.', 'Alternativa', 'Promessa direta e fácil de provar: o app existe para isso. Mais “utilidade” que “emoção”.', 'Never miss a play.'),
    ('O lance volta.', 'Alternativa', 'A mais curta (14 letras), boa em ícone e story. Remete ao conceito antigo do app (“o lance voltou”).', 'The play is back.'),
    ('Toque. Reveja. Comemore.', 'Alternativa', 'Mostra o uso em três passos. Boa para landing page e anúncio, pesada para assinatura de logo.', 'Tap. Replay. Celebrate.'),
    ('Todo lance tem volta.', 'Alternativa', 'Jogo de palavras com o ditado “tudo tem volta”. Mais bem-humorada; arrisca ser lida como ameaça.', 'Every play comes back.'),
]
WHY_NOT = ('“Já estava gravando.” descreve a tecnologia (um buffer sempre ligado), não o que a pessoa ganha. Fora de contexto soa como aviso de câmera/vigilância, '
           'e não cita o lance, o esporte nem o replay. É boa como mensagem de onboarding, não como assinatura da marca.')

def build_readme(slogan):
    rows = '\n'.join(f'| {t} | {tag} | {why} | {en} |' for t, tag, why, en in SLOGANS)
    colors = '\n'.join(f'| {n} | `{h}` | {hex2rgb(h)} | {cmyk(h)} | {use} |' for n, h, use in COLORS)
    write(OUT / 'README.md', f"""# Repplay: kit de marca

Gerado por `_build/build_brand.py` a partir da marca aprovada. Slogan atual nos arquivos: **{slogan}**
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
{colors}

CMYK é conversão matemática, não referência de gráfica. Peça prova de cor e Pantone equivalente ao fornecedor antes de imprimir em escala.
O app usa o mesmo lima do logo (`{LIME}`): o acento da interface (`colors.accent`, em `app/src/theme/tokens.ts`) foi alinhado a ele.

## Regras rápidas

1. Fundo claro: versão `fundo-claro` ou `preto`. Fundo escuro: `fundo-escuro` ou `branco`. Em foto ou cor chapada: `preto` ou `branco`, o que tiver mais contraste.
2. Lima nunca sobre branco ou claro.
3. Área de proteção: metade da altura do símbolo em todos os lados.
4. Tamanho mínimo: horizontal 96 px / 25 mm; vertical 80 px; símbolo 24 px (16 px só em favicon).
5. Não esticar, girar, recolorir, aplicar sombra ou contorno.

## Slogan

{WHY_NOT}

| Slogan | Papel | Por quê | Em inglês (lojas) |
|---|---|---|---|
{rows}

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
""")

def build_guide(arts, slogan):
    def img(path, cls='', alt=''): return f'<img class="{cls}" src="{path}" alt="{alt}">'
    def ratio(name): x0, y0, x1, y1 = arts[name].bb; return (x1 - x0) / (y1 - y0)
    L = lambda n, sch: f'logo/svg/repplay-{n}-{sch}.svg'
    specimens = [('fundo-claro', '#FFFFFF', 'Fundo claro'), ('fundo-escuro', INK, 'Fundo escuro'), ('preto', LIME, 'Preto (sobre lima ou cor clara)'), ('branco', OLIVE, 'Branco (sobre cor escura ou foto)')]
    spec_html = ''.join(f'<figure class="spec" style="background:{bg}">{img(L("horizontal-slogan", sch))}<figcaption style="color:{"#fff" if bg in (INK, OLIVE) else INK}">{lab}<br><code>-{sch}</code></figcaption></figure>' for sch, bg, lab in specimens)
    fmt_html = ''
    for n, lab in [('horizontal', 'Horizontal'), ('vertical', 'Vertical'), ('palavra', 'Logotipo'), ('simbolo', 'Símbolo (logo reduzida)')]:
        fmt_html += f'<figure class="fmt"><div class="box">{img(L(n, "fundo-claro"))}</div><div class="box dark">{img(L(n, "fundo-escuro"))}</div><figcaption><b>{lab}</b><br><code>repplay-{n}-…</code></figcaption></figure>'
    color_html = ''.join(f'<div class="sw"><div class="chip" style="background:{h}{";border:1px solid #d9d6cc" if h == PAPER else ""}"></div><b>{n}</b><code>{h}</code><span>RGB {", ".join(map(str, hex2rgb(h)))}</span><span>CMYK aprox. {", ".join(map(str, cmyk(h)))}</span><p>{u}</p></div>' for n, h, u in COLORS)
    slog_html = ''.join(f'<tr class="{"pick" if tag == "Recomendado" else ""}"><td><b>{t}</b><br><small>{tag}</small></td><td>{why}</td><td>{en}</td></tr>' for t, tag, why, en in SLOGANS)
    sizes_html = ''.join(f'<div class="sz">{img(L(n, "fundo-claro"), "", "")}<code>{lab}</code></div>' for n, lab in [])
    # misuse (CSS-based demos on the horizontal logo)
    mis = [('Não estique', 'transform:scaleX(1.45)'), ('Não gire', 'transform:rotate(-12deg)'), ('Não use sombra', 'filter:drop-shadow(6px 6px 4px rgba(0,0,0,.5))'),
           ('Não recolora', 'filter:hue-rotate(200deg) saturate(2.4)'), ('Não reduza o contraste', 'opacity:.28'), ('Não aplique contorno', 'filter:drop-shadow(0 0 0 #f0f) drop-shadow(1px 0 0 #f0f) drop-shadow(-1px 0 0 #f0f) drop-shadow(0 1px 0 #f0f) drop-shadow(0 -1px 0 #f0f)')]
    mis_html = ''.join(f'<figure class="mis"><div class="box"><img src="{L("horizontal", "fundo-claro")}" style="{st}" alt=""></div><figcaption>{c}</figcaption></figure>' for c, st in mis)
    mis_html += f'<figure class="mis"><div class="box" style="background:#fff">{img(L("horizontal", "fundo-escuro"))}</div><figcaption>Não use lima/paper sobre branco</figcaption></figure>'
    icon_files = [('icones/app/ios/repplay-ios-1024.png', 'iOS'), ('icones/app/ios/repplay-ios-1024-lima.png', 'iOS (lima)'),
                  ('icones/app/ios/repplay-ios-1024-tinted.png', 'iOS tinted'), ('icones/app/android/repplay-adaptive-foreground-1024.png', 'Android foreground'), ('icones/app/android/repplay-adaptive-monochrome-1024.png', 'Android monocromático'),
                  ('icones/web/icon-512.png', 'PWA 512'), ('icones/web/apple-touch-icon-180.png', 'apple-touch 180'), ('social/repplay-avatar-1024-lima.png', 'Avatar lima')]
    icons_html = ''.join(f'<figure class="ic"><div class="icbox">{img(p)}</div><figcaption>{l}</figcaption></figure>' for p, l in icon_files)
    fav_html = ''.join(f'<figure class="fv"><img src="icones/web/favicon-{s}.png" width="{s}" height="{s}" alt=""><figcaption>{s} px</figcaption></figure>' for s in (16, 32, 48, 64))
    soc = ['social/repplay-og-1200x630-escuro.png', 'social/repplay-og-1200x630-claro.png', 'social/repplay-twitter-header-1500x500-escuro.png', 'social/repplay-linkedin-banner-1584x396-escuro.png']
    soc_html = ''.join(f'<figure class="so">{img(p)}<figcaption>{Path(p).stem.replace("repplay-", "")}</figcaption></figure>' for p in soc)
    soc2 = ['social/repplay-instagram-post-1080x1350-escuro.png', 'social/repplay-instagram-post-1080x1350-lima.png', 'social/repplay-instagram-story-1080x1920-escuro.png', 'social/repplay-instagram-story-1080x1920-lima.png']
    soc2_html = ''.join(f'<figure class="so2">{img(p)}<figcaption>{Path(p).stem.replace("repplay-", "")}</figcaption></figure>' for p in soc2)
    cs = ratio('horizontal'); cs_w = 420; cs_h = cs_w / cs; pad = cs_h * .5
    html = f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Repplay: guia de marca</title>
<style>
:root {{ --ink:{INK}; --paper:{PAPER}; --lime:{LIME}; --olive:{OLIVE}; --bg:#F6F3EA; --fg:#14150F; --muted:#5E6158; --rule:#DAD6C9; --surface:#FFFFFF; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--bg); color:var(--fg); font:15px/1.6 Manrope, system-ui, -apple-system, "Segoe UI", sans-serif; }}
main {{ max-width:1080px; margin:0 auto; padding:48px 20px 96px; display:flex; flex-direction:column; gap:64px; }}
h1,h2,h3 {{ margin:0; line-height:1.1; letter-spacing:-.01em; }}
h2 {{ font-size:28px; }} h3 {{ font-size:17px; }}
p {{ margin:0; max-width:70ch; }} code {{ font:12.5px ui-monospace, Menlo, monospace; background:rgba(0,0,0,.06); padding:1px 6px; border-radius:4px; }}
section {{ display:flex; flex-direction:column; gap:20px; }}
.eyebrow {{ font-size:12px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); }}
.hero {{ background:var(--ink); border-radius:20px; padding:64px 32px; display:grid; place-items:center; gap:24px; }}
.hero img {{ width:min(100%, 640px); height:auto; }}
.hero p {{ color:#BDB9AB; text-align:center; max-width:52ch; }}
.grid2 {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:16px; }}
figure {{ margin:0; }} figcaption {{ font-size:12.5px; color:var(--muted); margin-top:8px; }}
.spec {{ border-radius:14px; padding:32px 28px 18px; border:1px solid var(--rule); }} .spec img {{ width:100%; height:auto; display:block; margin-bottom:20px; }}
.fmt {{ display:grid; grid-template-columns:1fr 1fr; gap:12px; align-items:stretch; }} .fmt figcaption {{ grid-column:1/-1; margin-top:0; }}
.fmts {{ display:flex; flex-direction:column; gap:22px; }}
.box {{ background:#fff; border:1px solid var(--rule); border-radius:12px; padding:22px; display:grid; place-items:center; min-height:150px; }} .box.dark {{ background:var(--ink); border-color:var(--ink); }}
.box img {{ max-width:100%; max-height:130px; height:auto; width:auto; }}
.swatches {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:16px; }} .sw {{ display:flex; flex-direction:column; gap:4px; font-size:13px; }}
.sw .chip {{ height:92px; border-radius:12px; margin-bottom:6px; }} .sw p {{ font-size:13px; color:var(--muted); margin-top:4px; }}
.clear {{ background:#fff; border:1px solid var(--rule); border-radius:14px; padding:32px; display:grid; place-items:center; }}
.clear .frame {{ padding:{pad:.0f}px; background:repeating-linear-gradient(45deg, rgba(95,125,11,.10) 0 6px, transparent 6px 12px); outline:1.5px dashed {OLIVE}; }}
.clear .frame img {{ width:{cs_w}px; max-width:60vw; display:block; background:#fff; outline:1px solid rgba(0,0,0,.18); }}
.mins {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; }} .min {{ background:#fff; border:1px solid var(--rule); border-radius:12px; padding:14px; display:flex; flex-direction:column; gap:10px; align-items:flex-start; font-size:13px; }}
.misuse {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:14px; }} .mis .box {{ min-height:120px; overflow:hidden; position:relative; }} .mis .box img {{ max-height:70px; }}
.mis figcaption::before {{ content:"✕ "; color:#B4300A; font-weight:700; }}
.icons {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:14px; }} .icbox {{ background:#3a3a36; border-radius:12px; padding:10px; }} .ic img {{ width:100%; display:block; border-radius:22%; }}
.favs {{ display:flex; gap:24px; align-items:end; background:#fff; border:1px solid var(--rule); border-radius:12px; padding:20px; }} .fv img {{ image-rendering:auto; display:block; }}
.so img, .so2 img {{ width:100%; height:auto; display:block; border-radius:10px; border:1px solid var(--rule); }}
.sorow {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:16px; }} .sorow2 {{ display:grid; grid-template-columns:repeat(4,1fr); gap:14px; }}
@media (max-width:720px) {{ .sorow2 {{ grid-template-columns:repeat(2,1fr); }} .fmt {{ grid-template-columns:1fr; }} }}
.tablewrap {{ overflow-x:auto; background:#fff; border:1px solid var(--rule); border-radius:12px; }} table {{ border-collapse:collapse; width:100%; min-width:640px; font-size:14px; }}
th,td {{ text-align:left; padding:12px 14px; border-bottom:1px solid var(--rule); vertical-align:top; }} th {{ font-size:11.5px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); }} tr:last-child td {{ border:0; }} tr.pick td {{ background:#EEF5D0; }} small {{ color:var(--muted); }}
.note {{ background:#fff; border-left:4px solid var(--olive); padding:14px 18px; border-radius:0 10px 10px 0; font-size:14px; }}
</style></head>
<body><main>

<header class="hero">{img(L("horizontal-slogan", "fundo-escuro"), "", "Repplay")}<p>Guia de marca: logos, símbolo, cores, ícones e regras de uso. Slogan nos arquivos: <b style="color:#F3EDE1">{slogan}</b></p></header>

<section><div class="eyebrow">01 · Logo principal</div><h2>Quatro versões de cor</h2>
<p>Cada formato existe nestas quatro versões. A escolha depende só do fundo.</p><div class="grid2">{spec_html}</div></section>

<section><div class="eyebrow">02 · Formatos</div><h2>Do logo completo ao ícone</h2>
<p>A logo reduzida é o símbolo sem o nome, igual ao do logo completo. Use-a quando o espaço não comporta o nome: favicon, ícone do app, avatar.</p><div class="fmts">{fmt_html}</div></section>

<section><div class="eyebrow">03 · Cores</div><h2>Ink, paper e um acento</h2><div class="swatches">{color_html}</div>
<div class="note">O app usa o mesmo lima do logo (<code>{LIME}</code>): o acento da interface foi alinhado a ele.</div></section>

<section><div class="eyebrow">04 · Respiro e tamanho mínimo</div><h2>Área de proteção</h2>
<p>Deixe livre, em todos os lados, metade da altura do símbolo.</p><div class="clear"><div class="frame">{img(L("horizontal", "fundo-claro"))}</div></div>
<div class="mins">
<div class="min"><img src="{L('horizontal','fundo-claro')}" width="96" alt=""><span>Horizontal: 96 px / 25 mm</span></div>
<div class="min"><img src="{L('horizontal-slogan','fundo-claro')}" width="180" alt=""><span>Com slogan: 180 px / 45 mm</span></div>
<div class="min"><img src="{L('vertical','fundo-claro')}" width="80" alt=""><span>Vertical: 80 px / 20 mm</span></div>
<div class="min"><img src="{L('simbolo','fundo-claro')}" width="24" alt=""><span>Símbolo: 24 px (16 px só em favicon)</span></div>
</div></section>

<section><div class="eyebrow">05 · Uso incorreto</div><h2>O que evitar</h2><div class="misuse">{mis_html}</div></section>

<section><div class="eyebrow">06 · Ícones</div><h2>App, web e favicon</h2><div class="icons">{icons_html}</div>
<div class="favs">{fav_html}</div></section>

<section><div class="eyebrow">07 · Social e marketing</div><h2>Banners, posts e stories</h2><div class="sorow">{soc_html}</div><div class="sorow2">{soc2_html}</div></section>

<section><div class="eyebrow">08 · Slogan</div><h2>“Já estava gravando.” precisa de substituto</h2>
<p>{WHY_NOT}</p>
<div class="tablewrap"><table><thead><tr><th>Slogan</th><th>Por quê</th><th>EN (lojas)</th></tr></thead><tbody>{slog_html}</tbody></table></div>
<p>Para testar outro: <code>python3 _build/build_brand.py --slogan "NENHUM LANCE PERDIDO."</code></p></section>

<section><div class="eyebrow">09 · Tipografia</div><h2>Logotipo desenhado, texto em Manrope</h2>
<p>O logotipo “repplay” é desenho próprio, entregue em curvas: nunca digite o nome em outra fonte. O slogan usa Manrope Medium em caixa alta com espaçamento largo. Textos de apoio: Manrope; títulos de interface: Barlow Condensed (como já está no app).</p></section>

</main></body></html>"""
    write(OUT / 'guia-de-marca.html', html)

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--slogan', default='SEU LANCE. DE NOVO.')
    ap.add_argument('--only', default='all', help='logos | icons | guide | all')
    a = ap.parse_args()
    if not shutil.which('rsvg-convert'): sys.exit('rsvg-convert not found (brew install librsvg)')
    arts = build_arts(a.slogan)
    if a.only in ('all', 'logos'): build_logos(arts)
    if a.only in ('all', 'icons'): build_icons(arts); build_social(arts)
    if a.only in ('all', 'guide'): build_tokens(); build_readme(a.slogan); build_guide(arts, a.slogan)
    print('ok')
