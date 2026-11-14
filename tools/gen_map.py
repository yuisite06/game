"""Gera src/mapdata.json (ASCII do chão + objetos) e mapa_preview.png.

Uso:  python3 tools/gen_map.py [seed]
      O seed muda a "bagunça" (casas, vãos, lotes, postes). Testa 1, 2, 3... até curtir.

Legenda do chão:  # asfalto   - faixa(h)   | faixa(v)   c calçada/praça   p piso rachado/lote
                  g grama     d terra      b bueiro     o poça      s escada (v)
Objetos: casas, murais, postes, pontos de ônibus, quadra, etc.

O que é fixo: ruas, praça, quadra, INÍCIO, moto, cachorro, pontos de ônibus, posição dos 3 murais.
O que é sorteado: casas (vãos, deslocamentos, cores, tijolo aparente), lotes baldios, desgaste do
chão, postes, fios, varais e a forma das vielas.
O script confere sozinho se dá pra chegar nos 3 murais, na praça e na quadra.

MUDANÇAS DESTA VERSÃO
- Rua nova: a rua de baixo continua pra direita (x 25..49, linhas 31..33).
- 4 pontos de ônibus espalhados (lista PONTOS). Cada um pisca, fica aceso ou apagado.
- Os "fios" (poste + fio) não ficam mais no meio da rua nem na frente de ponto de ônibus.
- Postes de luz nunca nascem perto de ponto de ônibus.
"""
import json, os, sys, random
from collections import deque
from PIL import Image

W, H, T = 50, 36, 32
SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 7

START = (3, 32)
MURAIS = [
    {'k': 'muro_verde',   'x': 0,  'y': 15, 'id': 'mural-1'},
    {'k': 'muro_rosa',    'x': 30, 'y': 15, 'id': 'mural-2'},
    {'k': 'muro_amarelo', 'x': 15, 'y': 0,  'id': 'mural-3'},
]
# Pontos de ônibus: (x, y) = onde fica o "pé" do ponto (y = linha de cima da rua). O primeiro é o original.
# modo: 'pisca' (mau contato), 'aceso' (sempre ligado) ou 'apagado' (queimou)
PONTOS = [
    {'x': 10, 'y': 31, 'modo': 'pisca'},     # rua de baixo (original)
    {'x': 18, 'y': 31, 'modo': 'apagado'},   # rua de baixo, perto da viela C
    {'x': 31, 'y': 22, 'modo': 'aceso'},     # rua de cima, calçada norte
    {'x': 40, 'y': 31, 'modo': 'pisca'},     # rua nova (leste)
]
# vielas / becos (retângulos x0,y0,x1,y1). Mais de um retângulo = viela com "dobra".
CORREDORES = {
    'A':  [(15, 1, 16, 8), (16, 7, 17, 11)],     # viela A (norte), com dobra
    'C':  [(15, 20, 16, 30)],                    # viela C (praça -> rua)
    'B1': [(2, 15, 7, 16), (6, 16, 9, 17)],      # beco sem saída oeste (dobra pra baixo)
    'B2': [(22, 15, 29, 16), (26, 17, 27, 18)],  # beco sem saída leste (com bolsão)
    'F':  [(38, 9, 39, 21)],                     # viela vertical pra quadra
}
ESCADAS = [(15, 29, 16, 29), (15, 5, 16, 5), (38, 15, 39, 15)]

# faixas onde as casas podem nascer: (y da fileira, x inicial, x final onde a casa pode terminar)
FILEIRAS = [
    (1, 0, 14), (6, 0, 14), (11, 0, 14), (17, 0, 14), (22, 0, 14), (26, 0, 14),
    (1, 17, 32), (6, 17, 32),
    (11, 22, 37), (11, 40, 49), (17, 22, 37), (17, 40, 49),
    (22, 17, 20), (26, 17, 20),
    (26, 26, 49),                 # entre a rua de cima e a rua nova (linhas 26..29)
    (1, 44, 49), (6, 44, 49),
]
CORES = ['casa_azul', 'casa_amarela', 'casa_rosa', 'casa_verde', 'casa_tijolo']
PESOS = [18, 18, 18, 18, 28]   # tijolo aparente (casa inacabada) aparece mais

ASFALTO = '#-|bo'


def build(rng):
    g = [['p'] * W for _ in range(H)]

    def rect(ch, x0, y0, x1, y1):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if 0 <= x < W and 0 <= y < H:
                    g[y][x] = ch

    # --- ruas (asfalto) ---
    rect('#', 0, 31, 24, 33)     # rua principal
    rect('#', 22, 22, 24, 33)    # curva sobe
    rect('#', 22, 22, 49, 24)    # rua de cima (direita)
    rect('#', 25, 31, 49, 33)    # RUA NOVA: a rua de baixo segue pra direita
    road = [[g[y][x] == '#' for x in range(W)] for y in range(H)]
    sidewalk = []
    for y in range(H):
        for x in range(W):
            if g[y][x] == 'p' and any(0 <= x + dx < W and 0 <= y + dy < H and road[y + dy][x + dx]
                                     for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
                g[y][x] = 'c'
                sidewalk.append((x, y))
    # faixa central
    for x in range(0, 22):  g[32][x] = '-' if x % 2 == 0 else '#'
    for y in range(23, 31): g[y][23] = '|' if y % 2 == 0 else '#'
    for x in range(24, 50): g[23][x] = '-' if x % 2 == 0 else '#'
    for x in range(25, 50): g[32][x] = '-' if x % 2 == 0 else '#'
    g[32][22] = g[32][23] = '#'

    # --- praça ---
    rect('c', 10, 12, 21, 19)
    for (a, b, c_, d_) in [(10, 12, 11, 13), (20, 12, 21, 13), (10, 18, 11, 19), (20, 18, 21, 19)]:
        rect('g', a, b, c_, d_)
    rect('d', 14, 14, 17, 17)                  # miolo de terra batida
    rect('c', 33, 2, 43, 9)                    # entorno da quadra

    # --- vielas ---
    reservado = set()
    corr_cells = set()
    for rs in CORREDORES.values():
        for (x0, y0, x1, y1) in rs:
            rect('p', x0, y0, x1, y1)
            for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1):
                    reservado.add((x, y)); corr_cells.add((x, y))
    for (x0, y0, x1, y1) in ESCADAS:
        rect('s', x0, y0, x1, y1)
    for m in MURAIS:
        for y in range(m['y'], m['y'] + 2):
            for x in range(m['x'], m['x'] + 2):
                reservado.add((x, y))
    rect('g', 18, 26, 21, 29); rect('g', 0, 34, 12, 35); rect('g', 26, 34, 49, 35)

    # --- área limpa em volta dos pontos de ônibus ---
    limpo = set()
    for p in PONTOS:
        for x in range(p['x'] - 2, p['x'] + 3):
            for y in range(p['y'] - 2, p['y'] + 1):
                limpo.add((x, y))

    # --- desgaste: calçada, praça, quadra ---
    for (x, y) in sidewalk:
        if g[y][x] != 'c' or (x, y) in reservado or (x, y) in limpo:
            continue
        r = rng.random()
        if r < 0.15:   g[y][x] = 'p'
        elif r < 0.19: g[y][x] = 'd'
    for y in range(12, 20):
        for x in range(10, 22):
            if g[y][x] == 'c' and rng.random() < 0.12:
                g[y][x] = 'p'
    for y in range(2, 10):
        for x in range(33, 44):
            if g[y][x] == 'c' and not (34 <= x <= 42 and 3 <= y <= 8) and rng.random() < 0.12:
                g[y][x] = 'p'

    # --- bueiros e poças no asfalto ---
    for (x, y) in [(5, 32), (14, 33), (29, 23), (41, 24), (23, 28), (31, 33), (45, 31)]: g[y][x] = 'b'
    for (x, y) in [(9, 33), (36, 24), (23, 26), (37, 33)]: g[y][x] = 'o'
    asf = [(x, y) for y in range(H) for x in range(W)
           if g[y][x] == '#' and y != 32 and not (y == 23 and x >= 24) and not (x == 23 and 23 <= y <= 30)
           and not (x <= 10 and 31 <= y <= 33)]
    rng.shuffle(asf)
    for i, (x, y) in enumerate(asf[:10]):
        g[y][x] = 'b' if i < 4 else 'o'

    # --- casas ---
    ocupado = set()
    for m in MURAIS:
        for y in range(m['y'], m['y'] + 2):
            for x in range(m['x'], m['x'] + 2):
                ocupado.add((x, y))

    def livre(x, y):
        return (0 <= x < W and 0 <= y < H and g[y][x] in 'pg'
                and (x, y) not in reservado and (x, y) not in ocupado)

    def cabe(x, y):
        return all(livre(xx, yy) for yy in range(y, y + 4) for xx in range(x, x + 3))

    houses = []
    for (fy, xi, xf) in FILEIRAS:
        x = xi + rng.choice([0, 0, 1, 2])
        ultima = None
        while x + 3 <= xf + 1:
            dy0 = rng.choice([0, 0, 0, 0, 0, 1, -1, 1, -1])
            tentativas = [dy0] if dy0 == 0 else [dy0, 0]
            colocou = False
            if rng.random() > 0.05:      # 5% de chance de pular e deixar vão
                for dy in tentativas:
                    if cabe(x, fy + dy):
                        k = rng.choices(CORES, PESOS)[0]
                        while k == ultima:
                            k = rng.choices(CORES, PESOS)[0]
                        ultima = k
                        houses.append({'k': k, 'x': x, 'y': fy + dy, 'tank': rng.random() < 0.35})
                        for yy in range(fy + dy, fy + dy + 4):
                            for xx in range(x, x + 3):
                                ocupado.add((xx, yy))
                        colocou = True
                        break
            if colocou:
                r = rng.random()
                gap = 0 if r < 0.66 else 1 if r < 0.82 else 2 if r < 0.91 else 3 if r < 0.96 else rng.randint(4, 6)
                x += 3 + gap
            else:
                x += 1

    # --- lotes baldios: terra, mato e poça onde não tem casa nem viela ---
    lote = [(x, y) for y in range(H) for x in range(W) if g[y][x] == 'p'
            and (x, y) not in reservado and (x, y) not in ocupado]
    if lote:
        for _ in range(40):
            cx, cy = rng.choice(lote)
            r = rng.randint(1, 3)
            ch = rng.choices(['d', 'g'], [55, 45])[0]
            for (x, y) in lote:
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r and rng.random() < 0.85:
                    g[y][x] = ch
        for (x, y) in lote:
            if g[y][x] == 'p' and rng.random() < 0.05:
                g[y][x] = 'o'
    # vielas: só poça e bueiro (pra não arriscar bloquear a passagem)
    for (x, y) in corr_cells:
        if g[y][x] == 'p':
            r = rng.random()
            if r < 0.025:   g[y][x] = 'o'
            elif r < 0.035: g[y][x] = 'b'

    # --- postes de luz (irregulares, alguns faltando; nunca perto de ponto de ônibus) ---
    def perto_de_ponto(x, y_rua):
        return any(p['y'] == y_rua and abs(x - p['x']) <= 2 for p in PONTOS)

    postes = []
    x = 3 + rng.randint(0, 2)
    while x <= 22:                                   # calçada norte da rua de baixo (linha 30)
        if (not perto_de_ponto(x, 31) and not (14 <= x <= 17) and g[30][x] in 'cpd' and rng.random() < 0.8):
            postes.append((x, 30))
        x += 6 + rng.randint(0, 3)
    x = 27 + rng.randint(0, 2)
    while x <= 48:                                   # calçada norte da rua nova (linha 30)
        if not perto_de_ponto(x, 31) and g[30][x] in 'cpd' and rng.random() < 0.85:
            postes.append((x, 30))
        x += 6 + rng.randint(0, 3)
    x = 26 + rng.randint(0, 2)
    while x <= 48:                                   # calçada sul da rua de cima (linha 25)
        if g[25][x] in 'cpd' and rng.random() < 0.85:
            postes.append((x, 25))
        x += 6 + rng.randint(0, 3)
    if rng.random() < 0.85:
        postes.append((21, 22))

    # --- fios (poste + fio, sprite "fio"). Altura do sprite ~1,34 tile:
    #     y = 29.6 -> pé na linha 30 (calçada da rua de baixo / rua nova)
    #     y = 20.6 -> pé na linha 21 (calçada norte da rua de cima)
    #     Só entram onde as 3 casas do vão são calçada de verdade, longe de pontos de ônibus. ---
    def calcada(linha, x0):
        return all(0 <= xx < W and g[linha][xx] in 'cpd' for xx in range(x0, x0 + 3))

    def longe_de_ponto(fx, linha_rua):
        return all(not (p['y'] == linha_rua and (fx - 3 <= p['x'] <= fx + 4)) for p in PONTOS)

    fios = []
    for (px, py) in postes:
        if rng.random() >= 0.5:
            continue
        fx = px - 1
        if py == 30 and calcada(30, fx) and longe_de_ponto(fx, 31):
            fios.append({'x': fx, 'y': 29.6})
        elif py == 25 and calcada(21, fx) and longe_de_ponto(fx, 22):
            fios.append({'x': fx, 'y': 20.6})
    # um fio fixo na rua de cima, longe do ponto (se der)
    for fx in (35, 44, 27):
        if calcada(21, fx) and longe_de_ponto(fx, 22):
            fios.append({'x': fx, 'y': 20.6}); break
    vistos = set(); fios2 = []
    for f in fios:
        key = (f['x'], f['y'])
        if key not in vistos:
            vistos.add(key); fios2.append(f)
    fios = fios2

    cand_varal = [(15, 3), (15, 6), (16, 9), (15, 23), (15, 26), (38, 12), (38, 17)]
    varais = [{'x': x, 'y': y} for (x, y) in rng.sample(cand_varal, 4)]

    data = dict(W=W, H=H, T=T, ground=[''.join(r) for r in g], houses=houses, murais=MURAIS, postes=postes,
                ponto={'x': PONTOS[0]['x'], 'y': PONTOS[0]['y']}, pontos=PONTOS,
                quadra={'x': 34, 'y': 3, 'w': 9, 'h': 6},
                start={'x': 3, 'y': 32}, moto={'x': 8, 'y': 32}, dog={'x': 13, 'y': 34}, bola={'x': 38.5, 'y': 5.5},
                varais=varais, fios=fios, bueiro_nota='')
    return data, ocupado


def valida(data, ocupado):
    """Jogador ~2x2 tiles (conservador): confere se dá pra chegar nos murais, na praça e na quadra."""
    bloq = set(ocupado)
    def ok(x, y):
        return all(0 <= x + dx < W and 0 <= y + dy < H and (x + dx, y + dy) not in bloq
                   for dx in (0, 1) for dy in (0, 1))
    sx, sy = START
    if not ok(sx, sy): return False
    vis = {(sx, sy)}; fila = deque([(sx, sy)])
    while fila:
        x, y = fila.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (x + dx, y + dy)
            if n not in vis and 0 <= n[0] < W - 1 and 0 <= n[1] < H - 1 and ok(*n):
                vis.add(n); fila.append(n)
    for m in data['murais']:
        achou = any(m['x'] - 3 <= px <= m['x'] + 2 and m['y'] - 3 <= py <= m['y'] + 2 for (px, py) in vis)
        if not achou: return False
    return (14, 15) in vis and (38, 6) in vis


def main():
    for tentativa in range(300):
        rng = random.Random(SEED * 1000 + tentativa)
        data, ocupado = build(rng)
        if valida(data, ocupado):
            break
    else:
        raise SystemExit('Não achei um layout válido, tenta outro seed.')
    if tentativa:
        print(f'(seed {SEED}: precisei de {tentativa + 1} tentativas pra todos os murais ficarem alcançáveis)')

    os.makedirs('src', exist_ok=True)
    open('src/mapdata.json', 'w').write(json.dumps(data, ensure_ascii=False, indent=1))
    print('ok', len(data['houses']), 'casas,', len(data['pontos']), 'pontos de ônibus,', len(data['fios']), 'fios, seed', SEED)

    # --- preview ---
    A = 'public/assets/'
    if not os.path.exists(A + 'tiles/asfalto.png'):
        print('assets não encontrados, pulei o mapa_preview.png')
        return
    g = data['ground']; houses = data['houses']; murais = data['murais']; postes = data['postes']
    tile = {'#': 'asfalto', '-': 'asfalto_faixa_h', '|': 'asfalto_faixa', 'c': 'calcada', 'p': 'piso_rachado',
            'g': 'grama', 'd': 'terra', 'b': 'bueiro', 'o': 'poca', 's': 'escada'}
    im = Image.new('RGBA', (W * T, H * T))
    for y in range(H):
        for x in range(W):
            im.alpha_composite(Image.open(A + 'tiles/' + tile[g[y][x]] + '.png').convert('RGBA'), (x * T, y * T))
    qd = data['quadra']; im.alpha_composite(Image.open(A + 'props/quadra.png'), (qd['x'] * T, qd['y'] * T))
    items = []
    for h in houses: items.append(((h['y'] + 4) * T, A + 'props/' + h['k'] + '.png', h['x'] * T, h['y'] * T))
    for m in murais: items.append(((m['y'] + 2) * T, A + 'props/' + m['k'] + '.png', m['x'] * T, m['y'] * T))
    for (x, y) in postes:
        p = Image.open(A + 'sprites/poste_apagado.png')
        items.append(((y + 1) * T, A + 'sprites/poste_apagado.png', x * T + 16 - p.width // 2, (y + 1) * T - p.height))
    for pt in data['pontos']:
        p = Image.open(A + 'props/ponto_aceso.png')
        items.append((pt['y'] * T, A + 'props/ponto_aceso.png',
                      pt['x'] * T - p.width // 2 + 16, pt['y'] * T - p.height))
    for f in data['fios']:
        if os.path.exists(A + 'props/fio.png'):
            p = Image.open(A + 'props/fio.png')
            items.append((9000, A + 'props/fio.png', f['x'] * T, f['y'] * T))
    for _, f, x, y in sorted(items): im.alpha_composite(Image.open(f).convert('RGBA'), (int(x), int(y)))
    s = Image.open(A + 'sprites/menino.png').crop((0, 0, 32, 44))
    im.alpha_composite(s, (data['start']['x'] * T, data['start']['y'] * T + 32 - 44))
    s = Image.open(A + 'sprites/moto_parada.png'); im.alpha_composite(s, (data['moto']['x'] * T, data['moto']['y'] * T + 24))
    im.convert('RGB').save('mapa_preview.png')
    im.convert('RGB').resize((W * 16, H * 16), Image.NEAREST).save('mapa_preview_small.png')


main()