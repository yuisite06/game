"""Recorta a pista de skate (raw/Pista.png) e monta as peças em public/assets/props/skate_*.png
Uso (na raiz):  python3 tools/build_skatepark.py
Pista final: 20x13 tiles (640x416). Chão aberto no meio; rampas nas laterais, muro em volta."""
import numpy as np, json
from PIL import Image
from scipy import ndimage as ndi

OUT = 'public/assets/props/'
S = 0.40                      # escala das peças (arte original 1344px -> jogo)
PW, PH = 20 * 32, 13 * 32     # pista inteira
src = Image.open('raw/Pista.png').convert('RGB')
A = np.array(src).astype(int)

def floorlike(a):
    mx, mn = a.max(axis=2), a.min(axis=2)
    return (((mx - mn) < 34) & (mx > 105) & (mx < 235)) | (mn >= 225)

def cutout(box, clear=None):
    x0, y0, x1, y1 = box
    a = A[y0:y1, x0:x1]
    fl = floorlike(a)
    if clear:                      # tira o muro de trás (bege/preto, não laranja) dentro dessa faixa
        cx0, cy0, cx1, cy1 = clear
        mx, mn = a.max(axis=2), a.min(axis=2)
        reg = np.zeros(fl.shape, bool); reg[cy0-y0:cy1-y0, cx0-x0:cx1-x0] = True
        fl = fl | (reg & ((mx - mn) < 70))
    lab, n = ndi.label(fl)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge))
    bg = ndi.binary_opening(bg, iterations=1) | (bg & ~ndi.binary_dilation(~bg, iterations=1))
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    # fica só com o maior bloco (tira lixo solto)
    l2, n2 = ndi.label(alpha > 0)
    if n2 > 1:
        sizes = ndi.sum(alpha > 0, l2, range(1, n2 + 1)); alpha = np.where(l2 == (1 + int(np.argmax(sizes))), 255, 0).astype(np.uint8)
    alpha = ndi.binary_fill_holes(alpha > 0).astype(np.uint8) * 255
    return Image.fromarray(np.dstack([a.astype(np.uint8), alpha]), 'RGBA')

def shrink(im, s=S):
    w, h = max(1, round(im.width * s)), max(1, round(im.height * s))
    im = im.resize((w, h), Image.BOX); a = np.array(im); a[:, :, 3] = np.where(a[:, :, 3] > 110, 255, 0)
    return Image.fromarray(a, 'RGBA')

pieces = {
  'rampa_e':   (76, 108, 400, 528),
  'rampa_d':   (948, 108, 1278, 528),
  'caixote':   (486, 196, 718, 278),
  'rampinha':  (800, 196, 942, 282),
  'corrimao':  (490, 586, 838, 654),
}
P = {}
clears = {'rampa_e': (228, 160, 400, 204), 'rampa_d': (948, 160, 1130, 204), 'rampinha': (800, 196, 942, 203)}
for k, b in pieces.items():
    P[k] = shrink(cutout(b, clears.get(k))); P[k].save(OUT + f'skate_{k}.png'); print(k, P[k].size)

# ---------- chão: pedaço liso da arte, espelhado em blocos ----------
best = None
for y in range(290, 540, 20):
    for x in range(420, 1000, 20):
        w = A[y:y+190, x:x+190]
        if w.shape[0] < 190 or w.shape[1] < 190: continue
        if (((w.max(axis=2)-w.min(axis=2))<50)&(w.max(axis=2)>105)&(w.max(axis=2)<235)).mean() < 0.97: continue
        sd = w.std()
        if best is None or sd < best[0]: best = (sd, x, y)
print('chão', best)
_, bx, by = best
patch = shrink(Image.fromarray(A[by:by+190, bx:bx+190].astype(np.uint8)).convert('RGBA'), 0.55)
pw, ph = patch.size
floor = Image.new('RGBA', (PW, PH))
for j in range(-(-PH // ph)):
    for i in range(-(-PW // pw)):
        t = patch
        if i % 2: t = t.transpose(Image.FLIP_LEFT_RIGHT)
        if j % 2: t = t.transpose(Image.FLIP_TOP_BOTTOM)
        floor.alpha_composite(t, (i * pw, j * ph))

def decal(box, s=S):
    return shrink(cutout(box), s)
# grafites e marcas do chão (da arte original)
decals = [((818, 318, 934, 388), 330, 190), ((208, 586, 334, 668), 70, 300)]
for box, x, y in decals:
    try: floor.alpha_composite(decal(box, 0.42), (x, y))
    except Exception as e: print('decal falhou', e)

# ---------- muros ----------
bl = src.crop((290, 696, 432, 758)).convert('RGBA'); blk = bl.resize((round(142 * S), round(62 * S)), Image.BOX)
side = src.crop((36, 546, 70, 630)).convert('RGBA'); sd_ = side.resize((round(34 * S), round(84 * S)), Image.BOX)
def nowhite(im):
    a = np.array(im); a[(a[:, :, :3].min(axis=2) >= 235), 3] = 0; return Image.fromarray(a, 'RGBA')
blk, sd_ = nowhite(blk), nowhite(sd_)
bw, bh = blk.size; sw, sh = sd_.size
base = floor.copy()
for x in range(0, PW, bw): base.alpha_composite(blk, (x, 0))                  # muro de trás (fundo)
for y in range(bh, PH, sh):
    base.alpha_composite(sd_, (0, y)); base.alpha_composite(sd_.transpose(Image.FLIP_LEFT_RIGHT), (PW - sw, y))
frente = Image.new('RGBA', (PW, bh))                                          # muro da frente (fica NA FRENTE do jogador)
GAP = (PW // 2 - 48, PW // 2 + 48)
for x in range(0, PW, bw):
    if x + bw <= GAP[0] or x >= GAP[1]: frente.alpha_composite(blk, (x, 0))
fa = np.array(frente); xs = np.arange(PW)[None, :]
fa[:, (np.arange(PW) >= GAP[0]) & (np.arange(PW) < GAP[1]), 3] = 0
frente = Image.fromarray(fa, 'RGBA')

# ---------- peças em cima da base (sombra leve) ----------
layout = {   # x,y = canto de cima-esquerda dentro da pista
  'rampa_e':  (sw, 62), 'rampa_d': (PW - sw - P['rampa_d'].width, 62),
  'caixote':  (250, bh + 28), 'rampinha': (410, bh + 38), 'corrimao': (398, 312),
}
base.save(OUT + 'skate_base.png'); frente.save(OUT + 'skate_frente.png')
json.dump({'PW': PW, 'PH': PH, 'bh': bh, 'sw': sw, 'gap': GAP,
           'pecas': {k: {'x': layout[k][0], 'y': layout[k][1], 'w': P[k].width, 'h': P[k].height} for k in layout}},
          open('tools/skatepark_layout.json', 'w'), indent=1)
print('ok', layout)
