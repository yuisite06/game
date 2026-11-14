import numpy as np, json, os
from PIL import Image, ImageDraw
from slice import load, components

T = 32  # tamanho do tile no jogo (base 16 x2)
OUT = 'public/assets'

def crop(rgba, box):
    x0,y0,x1,y1 = [int(v) for v in box]
    return Image.fromarray(rgba[y0:y1, x0:x1], 'RGBA')

def shrink(im, w=None, h=None):
    if w is None: w = max(1, round(im.width * h / im.height))
    if h is None: h = max(1, round(im.height * w / im.width))
    im = im.resize((w, h), Image.BOX)
    a = np.array(im)
    a[:,:,3] = np.where(a[:,:,3] > 110, 255, 0)  # borda dura, sem serrilhado
    return Image.fromarray(a, 'RGBA')

def order(boxes, rowtol=100):
    return sorted(boxes, key=lambda t: (round(t[1] / rowtol), t[0]))

# ---------- RUAS (tiles 32x32) ----------
rg = load('Ruas'); rb = order(components(rg))
names = ['asfalto','asfalto_faixa','calcada','terra','piso_rachado','grama','quadra','escada','bueiro','poca']
tiles = {}
for n, b in zip(names, rb):
    tiles[n] = shrink(crop(rg, b), T, T).convert('RGBA')
    tiles[n].save(f'{OUT}/tiles/{n}.png')
# faixa na horizontal
tiles['asfalto_faixa_h'] = tiles['asfalto_faixa'].rotate(90)
tiles['asfalto_faixa_h'].save(f'{OUT}/tiles/asfalto_faixa_h.png')
tiles['escada_h'] = tiles['escada'].rotate(90); tiles['escada_h'].save(f'{OUT}/tiles/escada_h.png')

# quadra: piso liso gerado (sem as linhas/bordas do tile original)
q = np.array(tiles['quadra'])
base = np.median(q[(q[:,:,:3].sum(axis=2) < 600)][:, :3], axis=0)
rng = np.random.default_rng(7)
noise = np.kron(rng.integers(-5, 6, (T//2, T//2)), np.ones((2,2), dtype=int))
flat = np.dstack([np.clip(base[i] + noise, 0, 255) for i in range(3)] + [np.full((T,T),255)]).astype(np.uint8)
plain = Image.fromarray(flat, 'RGBA'); plain.save(f'{OUT}/tiles/quadra_lisa.png')
CW, CH = 9, 6
court = Image.new('RGBA', (CW*T, CH*T))
for i in range(CW):
    for j in range(CH): court.paste(plain, (i*T, j*T))
d = ImageDraw.Draw(court); L = (236, 228, 200, 255)
d.rectangle([6, 6, CW*T-7, CH*T-7], outline=L, width=2)
d.line([CW*T//2, 6, CW*T//2, CH*T-7], fill=L, width=2)
d.ellipse([CW*T//2-26, CH*T//2-26, CW*T//2+26, CH*T//2+26], outline=L, width=2)
for x0, x1 in ((6, 44), (CW*T-45, CW*T-7)):
    d.rectangle([x0, CH*T//2-30, x1, CH*T//2+30], outline=L, width=2)
gx = [(2, 12), (CW*T-14, CW*T-3)]
for a, b in gx:
    d.rectangle([a, CH*T//2-14, b, CH*T//2+14], fill=(60,60,70,255))
court.save(f'{OUT}/props/quadra.png')

# ---------- CASAS (peças) ----------
if True:
    pass
cg = load('Casas'); cbs = order(components(cg), 110)
cn = ['p_tijolo','p_azul','p_amarela','p_rosa','p_verde',
      'p_concreto','porta_madeira','porta_ferro','janela_grade','janela_cortina','muro_topo',
      'telhado','caixa_dagua','varal','fio',
      'garagem','muro_tijolo','muro_verde','muro_amarelo','muro_rosa']
pieces = {}
for n, b in zip(cn, cbs):
    pieces[n] = crop(cg, b)

W = 3*T
def wall(name): return shrink(pieces[name], W, 2*T)   # parede 3x2 tiles (inclui platibanda)
def paste(dst, im, x, y): dst.alpha_composite(im, (x, y))

def make_house(fname, wall_name, door, win):
    # 3 tiles de largura, 4 de altura: telhado (1.5) + parede (2) ... compacto 3x4
    img = Image.new('RGBA', (W, 4*T), (0,0,0,0))
    roof = shrink(pieces['telhado'], W, 2*T)
    paste(img, roof, 0, 0)
    paste(img, wall(wall_name), 0, 2*T)
    dr = shrink(pieces[door], None, round(T*1.35)); paste(img, dr, W - dr.width - 6, 4*T - dr.height)
    img.save(f'{OUT}/props/{fname}.png')
    return fname

houses = [
 make_house('casa_azul','p_azul','porta_madeira','janela_cortina'),
 make_house('casa_amarela','p_amarela','porta_ferro','janela_grade'),
 make_house('casa_rosa','p_rosa','porta_madeira','janela_grade'),
 make_house('casa_verde','p_verde','porta_ferro','janela_cortina'),
]
# casa de tijolo aparente (inacabada)
img = Image.new('RGBA', (W, 4*T), (0,0,0,0))
paste(img, shrink(pieces['telhado'], W, 2*T), 0, 0)
paste(img, wall('p_tijolo'), 0, 2*T)
dr = shrink(pieces['garagem'], None, round(T*1.35)); paste(img, dr, W-dr.width-4, 4*T-dr.height)
img.save(f'{OUT}/props/casa_tijolo.png')
# muros com grafite (viram os 3 murais interativos)
for n in ['muro_verde','muro_amarelo','muro_rosa','muro_tijolo']:
    shrink(pieces[n], 2*T, 2*T).save(f'{OUT}/props/{n}.png')
# adereços
shrink(pieces['caixa_dagua'], None, round(T*1.1)).save(f'{OUT}/props/caixa_dagua.png')
shrink(pieces['varal'], 2*T).save(f'{OUT}/props/varal.png')
fio = np.array(shrink(pieces['fio'], 3*T)); fio[(fio[:,:,:3] > 225).all(axis=2), 3] = 0
Image.fromarray(fio, 'RGBA').save(f'{OUT}/props/fio.png')

# ---------- CENÁRIO ----------
sg = load('Cenario'); sb = components(sg)
print('cenario comps', len(sb))
# arquivo grande, recortes por linha: [moto frente, moto costas, moto lado a, moto lado b, bola],
# cachorro (frente x3, costas x3, lado direita x3, lado esquerda x3), poste aceso/apagado, ponto aceso/apagado
rows = {}
for b in sb: rows.setdefault(round(((b[1]+b[3])/2)/100), []).append(b)
for k in sorted(rows): print(k, [ (int(x[0]),int(x[1]),int(x[2]),int(x[3])) for x in sorted(rows[k])])
json.dump({str(k): [[int(v) for v in x] for x in sorted(rows[k])] for k in rows}, open('tools/cenario_boxes.json','w'))
