"""Encaixa a PISTA DE SKATE no mapa SEM regerar as casas (edita src/mapdata.json direto).
- estende o mapa pra direita (+24 tiles): a rua principal segue reto até o fim
- tira as 2 casas do fim da rua (rosa x43 e azul x46), o poste de luz e o poste de fios dali
- registra a pista (20x13 tiles) em map.skate
Roda 1x:  python3 tools/build_skatepark.py && python3 tools/add_skatepark.py
OBS: não roda gen_map.py depois (ele regera o mapa e apaga a pista)."""
import json, random
d = json.load(open('src/mapdata.json'))
if d.get('skate'):
    raise SystemExit('pista já está no mapa')
EXTRA, W0 = 24, d['W']
rng = random.Random(21)
g = d['ground']
for y in range(d['H']):
    if y <= 16:   row = ''.join(rng.choices('pgd', [70, 22, 8])[0] for _ in range(EXTRA))
    elif y <= 29: row = 'p' * EXTRA
    elif y == 30: row = 'c' * EXTRA
    elif y in (31, 33): row = '#' * EXTRA
    elif y == 32: row = ''.join('-' if (W0 + i) % 2 == 0 else '#' for i in range(EXTRA))
    else:         row = 'g' * EXTRA
    g[y] += row
d['W'] = W0 + EXTRA
def put(x0, y0, x1, y1, ch):
    for y in range(y0, y1 + 1):
        g[y] = g[y][:x0] + ch * (x1 - x0 + 1) + g[y][x1 + 1:]
put(43, 26, 52, 29, 'c')        # onde ficavam as 2 casas: calçada ligando a rua à pista
put(50, 22, 52, 24, 'c')        # a rua de cima termina na calçada
put(53, 17, 72, 29, 'c')        # chão da pista
d['houses'] = [h for h in d['houses'] if (h['x'], h['y']) not in [(43, 26), (46, 26)]]
d['postes'] = [p for p in d['postes'] if p != [45, 30]]
d['fios'] = [f for f in d['fios'] if not (f['x'] == 44 and f['y'] == 29.6)]
d['skate'] = {'x': 53, 'y': 17, 'w': 20, 'h': 13, 'layout': json.load(open('tools/skatepark_layout.json'))}
json.dump(d, open('src/mapdata.json', 'w'), ensure_ascii=False, indent=1)
print('ok: mapa', d['W'], 'x', d['H'], '| casas', len(d['houses']), '| postes', len(d['postes']), '| fios', len(d['fios']))
