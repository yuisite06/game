# Pixel da Quebrada

RPG 2D em pixel art (visual estilo Pokémon FireRed) sobre arte periférica.
Phaser 3 + Vite · Supabase (cards) · GitHub + Vercel (deploy).

## Rodar local
```bash
npm install
npm run dev        # abre em http://localhost:5173
```
Controles: setas/WASD = andar · E = interagir (montar/descer da moto, ver mural) · no celular: joystick + botão A.

## O que já tem
- Tela inicial: escolher Mano/Mina, digitar o nome, iniciar → tutorial em caixa de diálogo
- Mapa 50x36 tiles baseado no teu esboço (rua principal em curva, praça, vielas, becos sem saída B1/B2, viela A, quadra)
- Moto (E monta/desce, só anda na rua) · bola que chuta/desliza/quica na quadra
- Cachorro que corre atrás da moto, fica pra trás e volta pro lugar
- Luz do ponto de ônibus piscando (mau contato)
- 3 murais (becos B1, B2 e fim da viela A) que abrem card + pergunta

## Supabase (cards)
1. Crie o projeto no Supabase e rode `supabase/schema.sql` no SQL Editor.
2. Insira 3 linhas em `cards` com `mural_id` = `mural-1`, `mural-2`, `mural-3`.
3. Copie `.env.example` para `.env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
Sem o Supabase configurado, o jogo usa cards de exemplo (`src/cards.js`).

## Deploy
```bash
git init && git add . && git commit -m "pixel da quebrada"
# crie o repo no GitHub e dê push
```
Na Vercel: Import do repo → framework Vite (build `npm run build`, saída `dist`) → adicione as 2 variáveis `VITE_SUPABASE_*` em Settings > Environment Variables.

## Editar o mapa
O mapa é gerado por `tools/gen_map.py` (retângulos de chão + lista de casas/props) e salvo em `src/mapdata.json`.
```bash
python3 tools/gen_map.py     # regenera o mapa + mapa_preview.png
```
Legenda do chão: `#` asfalto · `-`/`|` faixa · `c` calçada/praça · `p` piso rachado · `g` grama · `d` terra · `b` bueiro · `o` poça · `s` escada.

## Peças
As imagens originais estão em `raw/`. `tools/build_assets.py` e `tools/build_sprites.py` recortam, tiram o fundo branco e geram tudo em `public/assets/` (tile de 32px = 16px base ×2).
```bash
PYTHONPATH=tools python3 tools/build_sprites.py
```

## Pista de skate (fim da rua principal)
Mapa estendido pra 74x36 (a rua segue reto até o fim). Pista de 20x13 tiles em x53,y17, entrada virada pra rua. As 2 casas do fim da rua (rosa e azul), o poste de luz e o poste de fios dali foram removidos. Rapaziada conversando no canto de baixo à esquerda.
```bash
python3 tools/build_skatepark.py   # recorta raw/Pista.png -> public/assets/props/skate_*.png
python3 tools/add_skatepark.py     # encaixa no mapdata.json (roda 1x; NÃO rodar gen_map.py depois, ele apaga a pista)
```
