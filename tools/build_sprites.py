import numpy as np, json
from PIL import Image
from slice import load, components
from build_assets import crop, shrink, order, OUT, T

def sheet(frames, cw, ch, cols):
    rows = (len(frames) + cols - 1) // cols
    sh = Image.new('RGBA', (cw*cols, ch*rows), (0,0,0,0))
    for i, im in enumerate(frames):
        x = (i % cols) * cw + (cw - im.width)//2
        y = (i // cols) * ch + (ch - im.height)
        sh.alpha_composite(im, (x, y))
    return sh

def frames_from(name, factor, n=9, rowtol=100):
    g = load(name); bs = order(components(g), rowtol)[:n]
    out = []
    for b in bs:
        im = crop(g, b)
        out.append(shrink(im, max(1, round(im.width*factor)), max(1, round(im.height*factor))))
    return out

# personagens a pé: 3 linhas (frente, costas, lado direito) x 3 colunas (parado, passo1, passo2)
for name, key in (('Menino','menino'), ('Menina','menina')):
    fr = frames_from(name, 42/296)
    sheet(fr, 32, 44, 3).save(f'{OUT}/sprites/{key}.png')

# personagens de moto: linhas (lado direito, frente, costas) x 3 frames
for name, key in (('Mano_na_moto','menino_moto'), ('Mina_na_moto','menina_moto')):
    fr = frames_from(name, 0.155, 9)
    sheet(fr, 52, 48, 3).save(f'{OUT}/sprites/{key}.png')

# moto parada
mg = load('Moto'); mb = sorted(components(mg), key=lambda t: t[0])
shrink(crop(mg, mb[0]), 42).save(f'{OUT}/sprites/moto_parada.png')

# cenário
sg = load('Cenario')
def at(box, f, clear=False):
    im = crop(sg, box)
    if clear:
        a = np.array(im); a[(a[:,:,:3] > 238).all(axis=2), 3] = 0; im = Image.fromarray(a, 'RGBA')
    return shrink(im, max(1, round(im.width*f)), max(1, round(im.height*f)))
dogf = 0.15
dog = [at(b, dogf) for b in [(112,246,202,438),(317,246,406,438),(516,246,600,433),
                              (794,252,873,416),(962,252,1035,427),(1126,252,1204,422),
                              (78,494,253,609),(289,488,450,608),(485,493,638,613)]]
sheet(dog, 32, 32, 3).save(f'{OUT}/sprites/cachorro.png')
at((1340,66,1464,189), 0.085).save(f'{OUT}/sprites/bola.png')
at((101,673,312,945), 0.18).save(f'{OUT}/sprites/poste_aceso.png')
at((429,675,600,945), 0.18).save(f'{OUT}/sprites/poste_apagado.png')
at((706,698,996,915), 0.22, True).save(f'{OUT}/props/ponto_aceso.png')
at((1091,693,1380,915), 0.22, True).save(f'{OUT}/props/ponto_apagado.png')
print('ok')
