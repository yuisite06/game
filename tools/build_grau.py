import numpy as np, sys, os
from PIL import Image
from seg import load_mask, bands

F = 0.178   # escala (mesma pra moto normal e grau)

def cut(im, fg, box):
    x0,y0,x1,y1 = box
    a = np.array(im)[y0:y1+1, x0:x1+1]
    m = fg[y0:y1+1, x0:x1+1]
    rgba = np.dstack([a, (m*255).astype(np.uint8)])
    return rgba

def shrink(rgba, f):
    h, w = rgba.shape[:2]
    nw, nh = max(1, round(w*f)), max(1, round(h*f))
    al = rgba[:,:,3:4].astype(np.float32)/255
    pm = rgba[:,:,:3].astype(np.float32)*al
    pre = np.dstack([pm, al*255]).astype(np.float32)
    ims = [Image.fromarray(pre[:,:,i], 'F').resize((nw, nh), Image.LANCZOS) for i in range(4)]
    ch = [np.array(i) for i in ims]
    A = np.clip(ch[3], 0, 255)
    a01 = A/255
    rgb = np.stack([np.where(a01>0.01, ch[i]/np.maximum(a01,0.01), 0) for i in range(3)], axis=2)
    out = np.dstack([np.clip(rgb,0,255), np.where(A>110, 255, 0)]).astype(np.uint8)   # borda limpa, sem meio-transparente
    return Image.fromarray(out, 'RGBA')

def bbox_trim(img):
    bb = img.getchannel('A').getbbox(); return img.crop(bb)

def rear_x(img):
    a = np.array(img.getchannel('A')) > 0
    ys = np.where(a.any(axis=1))[0]; ymax = ys.max()
    cols = np.where(a[max(0,ymax-2):ymax+1].any(axis=0))[0]
    # primeiro grupo de colunas = roda de tras
    start = cols[0]; end = start
    for c in cols[1:]:
        if c - end > 2: break
        end = c
    return (start+end)/2

def run(src, name, outdir, force=None):
    im, fg = load_mask(src)
    rows = bands(fg.sum(axis=1) > 2, 8)
    assert len(rows) == 4, rows
    frames = []
    for (y0,y1) in rows:
        cols = bands(fg[y0:y1+1].sum(axis=0) > 2, 8)
        assert len(cols) == 3, cols
        for (x0,x1) in cols:
            frames.append(bbox_trim(shrink(cut(im, fg, (int(x0),int(y0),int(x1),int(y1))), F)))
    normal_side = frames[0:3]; grau = frames[9:12]
    # roda de tras da moto normal, em relacao ao centro do frame (que e onde o jogo desenha)
    ref = np.mean([rear_x(f) - f.width/2 for f in normal_side])
    place = []   # (x esquerdo relativo ao centro da celula)
    for g in grau:
        place.append(ref - rear_x(g))
    half = max(max(-p for p in place), max(p + g.width for p, g in zip(place, grau)))
    half = int(np.ceil(half)) + 1
    cw = half*2
    chh = max(g.height for g in grau) + 1
    if force: cw, chh = force
    sheet = Image.new('RGBA', (cw*3, chh), (0,0,0,0))
    for i,(g,p) in enumerate(zip(grau, place)):
        x = int(round(i*cw + cw/2 + p)); y = chh - g.height
        sheet.alpha_composite(g, (x, y))
    sheet.save(os.path.join(outdir, f'{name}_grau.png'))
    print(name, 'celula', cw, 'x', chh, 'ref', round(ref,1), 'normal side sizes', [f.size for f in normal_side], 'grau sizes', [g.size for g in grau])
    return cw, chh

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    os.makedirs(out, exist_ok=True)
    a = run('/mnt/user-data/uploads/1793497529207_image.png', 'menino_moto', out)
    b = run('/mnt/user-data/uploads/1793497536809_image.png', 'menina_moto', out)
    f = (max(a[0], b[0]), max(a[1], b[1]))
    run('/mnt/user-data/uploads/1793497529207_image.png', 'menino_moto', out, f)
    run('/mnt/user-data/uploads/1793497536809_image.png', 'menina_moto', out, f)
    print('CELULA FINAL', f)