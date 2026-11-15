# Recorta as folhas de skate (raw/skate/*.png) e gera os sprites em public/assets/sprites/
#   {sexo}_skate.png      grade 3x3: linhas (frente, costas, lado) x colunas (parado, empurra1, empurra2)
#   {sexo}_ollie.png / _kickflip.png / _handplant.png   6 frames em linha
import numpy as np, os
from PIL import Image
from seg import load_mask, bands
from build_grau import cut, shrink, bbox_trim

F = 0.17
RAW = 'raw/skate'
OUT = 'public/assets/sprites'

def frames_from(path, rows, cols):
    im, fg = load_mask(path)
    rs = bands(fg.sum(axis=1) > 2, 8)
    assert len(rs) == rows, (path, rs)
    out = []
    for (y0, y1) in rs:
        cs = bands(fg[y0:y1+1].sum(axis=0) > 2, 8)
        assert len(cs) == cols, (path, cs)
        for (x0, x1) in cs:
            out.append(bbox_trim(shrink(cut(im, fg, (int(x0), int(y0), int(x1), int(y1))), F)))
    return out

def anchor_x(img):
    a = np.array(img.getchannel('A')) > 0
    ys = np.where(a.any(axis=1))[0]; ymax = ys.max()
    cols = np.where(a[max(0, ymax-3):ymax+1].any(axis=0))[0]
    return (cols.min() + cols.max()) / 2

def sheet(frames, cols, cw=None, ch=None):
    half = int(np.ceil(max(max(anchor_x(f), f.width - anchor_x(f)) for f in frames))) + 1
    cw = cw or half * 2; ch = ch or max(f.height for f in frames) + 1
    rows = (len(frames) + cols - 1) // cols
    sh = Image.new('RGBA', (cw*cols, ch*rows), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        x = (i % cols) * cw + int(round(cw/2 - anchor_x(f))); y = (i // cols) * ch + ch - f.height
        sh.alpha_composite(f, (x, y))
    return sh, cw, ch

def strip_frames(path):
    # 6 frames na mesma linha: mantem a altura relativa (chao comum) pra ver o pulo
    im, fg = load_mask(path)
    cs = bands(fg.sum(axis=0) > 2, 8)
    assert len(cs) == 6, (path, cs)
    ys = np.where(fg.any(axis=1))[0]; gy1 = ys.max()
    out = []
    for (x0, x1) in cs:
        col = fg[:, x0:x1+1]; yy = np.where(col.any(axis=1))[0]
        f = bbox_trim(shrink(cut(im, fg, (int(x0), int(yy.min()), int(x1), int(yy.max()))), F))
        lift = round((gy1 - yy.max()) * F)           # quanto o frame esta acima do chao
        out.append((f, lift))
    return out

def with_lift(items):
    H = max(f.height + l for f, l in items)
    fr = []
    for f, l in items:
        c = Image.new('RGBA', (f.width, H), (0, 0, 0, 0)); c.alpha_composite(f, (0, H - f.height - l)); fr.append(c)
    return fr

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    walk = {}
    for sx in ('menino', 'menina'):
        g = frames_from(f'{RAW}/{sx}_andar.png', 3, 3)
        g = [g[i*3 + j] for i in range(3) for j in (1, 0, 2)]          # coluna 0 = parado
        walk[sx] = g
    allw = [f for g in walk.values() for f in g]
    cw = int(np.ceil(max(max(anchor_x(f), f.width - anchor_x(f)) for f in allw))) * 2 + 2
    chh = max(f.height for f in allw) + 1
    for sx, g in walk.items():
        s, _, _ = sheet(g, 3, cw, chh); s.save(f'{OUT}/{sx}_skate.png')
    print('SKATE andar celula', cw, 'x', chh)
    tr = {}
    for sx in ('menino', 'menina'):
        for t in ('ollie', 'kickflip', 'handplant'):
            tr[(sx, t)] = with_lift(strip_frames(f'{RAW}/{sx}_{t}.png'))
    tw = int(np.ceil(max(max(anchor_x(f), f.width - anchor_x(f)) for v in tr.values() for f in v))) * 2 + 2
    th = max(f.height for v in tr.values() for f in v) + 1
    for (sx, t), v in tr.items():
        s, _, _ = sheet(v, 6, tw, th); s.save(f'{OUT}/{sx}_{t}.png')
    print('MANOBRAS celula', tw, 'x', th)