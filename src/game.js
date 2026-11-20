import Phaser from 'phaser';
import map from './mapdata.json';
import { state, getMove, consumeAction } from './state.js';
import { showDialog, setHint, updateHud, openMural, setRidingUI, setJuggleUI } from './ui.js';

const T = map.T;
const ROAD = new Set(['#', '-', '|', 'b', 'o']);          // moto só anda aqui
const TILE_KEY = { '#':'asfalto', '-':'asfalto_faixa_h', '|':'asfalto_faixa', c:'calcada', p:'piso_rachado', g:'grama', d:'terra', b:'bueiro', o:'poca', s:'escada' };
const WALK = 92, RIDE = 215, SKATE = 140, DOG_SPEED = 150, DOG_RETURN = 85;
const JUG = { PER: 0.7, JANELA: 0.62, LIMITE: 1.12 };   // embaixadinha: tempo de cada toque (s) e janela de acerto
// ---- MULTIDÃO: mexe aqui pra ajustar ----
const CROWD_MAX = 600;                                          // máximo de gente
const CROWD_FRASES = ['UAU!', 'JOGADOR NÚMERO 1!', 'PRÓXIMO NEYMAR!'];
const CROWD_TONS = [0x050507, 0x15151b, 0x24242c, 0x33333d];    // preto -> cinza escuro (cor chapada)
// ---- EQUIPE DA TV: mexe aqui pra ajustar ----
const CAM_FRASE = 'ESSA CENA TEM QUE IR PRA TV!';
const HELI = { W: 103, H: 86, ALT: 62, VOLTA_RX: 54, VOLTA_RY: 30, ENTRA: 2.2, VOLTA: 2.6, POUSA: 0.9, BOBE: 4.5, SAI: 2.4, PX: 100, PY: -25 };  // ALT = altura da hélice sobre a sombra (px)

// ---- limpa postes: nada colado em ponto de ônibus e luz nunca em cima de fio ----
(function limpaPostes() {
  const FIO_W = 96, FIO_H = 44, M = 24;
  const pontos = map.pontos || [{ ...map.ponto }];
  const livre = (nx, py) => { const ch = (map.ground[py] || '')[nx]; return !!ch && 'cpd'.includes(ch); };
  // 1) tira fio perto de ponto de ônibus (mesma calçada, até 4 tiles)
  map.fios = map.fios.filter((f) => !pontos.some((p) => Math.abs(f.y * T + FIO_H - p.y * T) < 20 && Math.abs(p.x - (f.x + 1.5)) <= 4));
  // 2) poste de luz nunca perto de ponto (2 tiles) nem em cima de fio
  const pertoPonto = (nx, py) => pontos.some((p) => p.y - 1 === py && Math.abs(p.x - nx) <= 2);
  const fioDe = (cx, base) => map.fios.find((f) => Math.abs(f.y * T + FIO_H - base) < 20 && cx > f.x * T - M && cx < f.x * T + FIO_W + M);
  const orig = map.postes;
  map.postes = orig.map(([x, y]) => {
    const base = (y + 1) * T, f = fioDe(x * T + T / 2, base);
    if (pertoPonto(x, y)) return null;
    if (!f) return [x, y];
    for (const nx of [f.x + 4, f.x - 2]) {
      if (livre(nx, y) && !pertoPonto(nx, y) && !fioDe(nx * T + T / 2, base) && !orig.some(([ox, oy]) => oy === y && ox !== x && Math.abs(ox - nx) < 3)) return [nx, y];
    }
    return null;
  }).filter(Boolean);
})();

// ---- separa poste de luz do poste de fios (nunca um em cima do outro) ----
(function separaPostes() {
  const FIO_W = 96, FIO_H = 44, M = 24;
  const livre = (nx, py) => { const ch = (map.ground[py] || '')[nx]; return !!ch && 'cpd'.includes(ch); };
  const fioDe = (cx, base) => map.fios.find((f) => Math.abs(f.y * T + FIO_H - base) < 20 && cx > f.x * T - M && cx < f.x * T + FIO_W + M);
  const orig = map.postes;
  map.postes = orig.map(([x, y]) => {
    const base = (y + 1) * T, f = fioDe(x * T + T / 2, base);
    if (!f) return [x, y];
    for (const nx of [f.x + 4, f.x - 2]) {
      if (livre(nx, y) && !fioDe(nx * T + T / 2, base) && !orig.some(([ox, oy]) => oy === y && ox !== x && Math.abs(ox - nx) < 3)) return [nx, y];
    }
    return null;
  }).filter(Boolean);
})();

// ---- DIA: brilho dos pontos de ônibus ----
const DIA = {
  glowAlpha: 0,          // brilho das luzes dos pontos (0 = sem brilho, só troca o sprite)
};

const TOUCH = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

// moto: folha normal 52x48 / folha do grau 62x45 (mesmo centro e mesmo chão)
const MOTO_W = 52, MOTO_H = 48, GRAU_W = 62, GRAU_H = 45;

export class GameScene extends Phaser.Scene {
  constructor() { super('game'); }

  // ---------------------------------------------------------------- preload
  preload() {
    ['asfalto','asfalto_faixa','asfalto_faixa_h','calcada','piso_rachado','grama','terra','bueiro','poca','escada']
      .forEach((n) => this.load.image('t_' + n, `assets/tiles/${n}.png`));
    ['casa_azul','casa_amarela','casa_rosa','casa_verde','casa_tijolo','muro_verde','muro_rosa','muro_amarelo','quadra','bar_ze','padaria','ponto_aceso','ponto_apagado','varal','fio','caixa_dagua','skate_base','skate_frente','skate_rampa_e','skate_rampa_d','skate_caixote','skate_rampinha','skate_corrimao']
      .forEach((n) => this.load.image(n, `assets/props/${n}.png`));
    ['poste_apagado','moto_parada','bola'].forEach((n) => this.load.image(n, `assets/sprites/${n}.png`));
    ['menino','menina'].forEach((n) => this.load.spritesheet(n, `assets/sprites/${n}.png`, { frameWidth: 32, frameHeight: 44 }));
    ['menino_moto','menina_moto'].forEach((n) => this.load.spritesheet(n, `assets/sprites/${n}.png`, { frameWidth: MOTO_W, frameHeight: MOTO_H }));
    ['menino_grau','menina_grau'].forEach((n) => this.load.spritesheet(n, `assets/sprites/${n}.png`, { frameWidth: GRAU_W, frameHeight: GRAU_H }));
    ['menino_skate','menina_skate'].forEach((n) => this.load.spritesheet(n, `assets/sprites/${n}.png`, { frameWidth: 48, frameHeight: 55 }));
    this.load.image('skate_chao', 'assets/props/skate_chao.png');
    ['menino','menina'].forEach((sx) => ['ollie','kickflip','handplant'].forEach((t) => this.load.spritesheet(`${sx}_${t}`, `assets/sprites/${sx}_${t}.png`, { frameWidth: 50, frameHeight: 60 })));
    this.load.spritesheet('cachorro', 'assets/sprites/cachorro.png', { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('cachorro_sentado', 'assets/sprites/cachorro_sentado.png', { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('cameraman', 'assets/sprites/cameraman.png', { frameWidth: 40, frameHeight: 46 });
    this.load.spritesheet('helicoptero', 'assets/sprites/helicoptero.png', { frameWidth: HELI.W, frameHeight: HELI.H });
    this.load.image('heli_sombra', 'assets/sprites/helicoptero_sombra.png');
  }

  // ----------------------------------------------------------------- create
  create() {
    const W = map.W * T, H = map.H * T;
    this.physics.world.setBounds(0, 0, W, H);
    this.cameras.main.setBounds(0, 0, W, H);
    this.cameras.main.setBackgroundColor('#0d0818');
    this.solids = this.physics.add.staticGroup();

    this.buildGround(W, H);
    this.buildWorld();
    this.buildSkate();
    this.buildNav();
    this.buildAnims();
    this.buildPlayer();
    this.buildMoto();
    this.buildBall();
    this.buildGoals();
    this.buildDog();
    this.buildCrowd();
    this.buildHeli();
    this.buildBrilho();
    this.buildBusLight();

    this.physics.add.collider(this.player, this.solids);
    if (this.rampSolids) this.physics.add.collider(this.player, this.rampSolids, null, () => !this.skating);
    this.dogs.forEach((d) => this.physics.add.collider(d.sprite, this.solids));
    this.physics.add.overlap(this.player, this.ball, () => this.kick());

    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.cameras.main.roundPixels = true;
    this.scene.pause();                          // espera a tela inicial
    this.game.events.once('start-game', () => this.startGame());
  }

  startGame() {
    this.scene.resume();
    this.player.setTexture(state.sex);
    this.setPlayerBody(false);
    this.nameLabel.setText(state.name);
    this.setIdle();
    showDialog([
      `Fala, ${state.name}! Chegou na quebrada. Aqui cada muro conta uma história.`,
      'Anda com as SETAS ou WASD. No celular, usa o joystick.',
      'Tem uma MOTO parada na rua. Chega perto e aperta E (ou o botão A) pra montar. Ela só anda na rua.',
      'De moto, segura ESPAÇO (ou o botão A) pra dar GRAU! Pra descer, aperta E (ou o botão B). Aí dá pra explorar as vielas.',
      'Na quadra tem uma BOLA: é só encostar pra chutar. Cuidado: se tu passar de moto, o cachorro vem atrás!',
      'Teu objetivo: achar os 3 MURAIS nas vielas sem saída e descobrir a história de cada artista.',
    ]);
  }

  // ----------------------------------------------------------------- mundo
  buildGround(W, H) {
    const tex = this.textures.createCanvas('ground', W, H); const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;
    map.ground.forEach((row, y) => [...row].forEach((ch, x) => {
      ctx.drawImage(this.textures.get('t_' + TILE_KEY[ch]).getSourceImage(), x * T, y * T);
    }));
    tex.refresh();
    this.add.image(0, 0, 'ground').setOrigin(0).setDepth(-10);
    this.add.image(map.quadra.x * T, map.quadra.y * T, 'quadra').setOrigin(0).setDepth(-9);
    this.court = new Phaser.Geom.Rectangle(map.quadra.x * T + 8, map.quadra.y * T + 8, map.quadra.w * T - 16, map.quadra.h * T - 16);
  }

  block(x, y, w, h) {
    const z = this.add.zone(x + w / 2, y + h / 2, w, h);
    this.physics.world.enable(z, Phaser.Physics.Arcade.STATIC_BODY);
    this.solids.add(z); return z;
  }
  // parede da curva da rampa grande: só quem está de skate atravessa
  blockRamp(x, y, w, h) {
    if (!this.rampSolids) this.rampSolids = this.physics.add.staticGroup();
    const z = this.add.zone(x + w / 2, y + h / 2, w, h);
    this.physics.world.enable(z, Phaser.Physics.Arcade.STATIC_BODY);
    this.rampSolids.add(z); return z;
  }

  buildWorld() {
    map.houses.forEach((h) => {
      this.add.image(h.x * T, h.y * T, h.k).setOrigin(0).setDepth((h.y + 4) * T);
      this.block(h.x * T, h.y * T, 3 * T, 4 * T);
      if (h.tank) this.add.image(h.x * T + 52, h.y * T + 4, 'caixa_dagua').setOrigin(0.5, 1).setDepth((h.y + 4) * T + 1);
    });
    this.murais = map.murais.map((m) => {
      this.add.image(m.x * T, m.y * T, m.k).setOrigin(0).setDepth((m.y + 2) * T);
      this.block(m.x * T, m.y * T, 2 * T, 2 * T);
      const mark = this.add.text(m.x * T + T, m.y * T + 6, '!', { fontFamily: 'monospace', fontSize: '14px', fontStyle: 'bold', color: '#ffd23f', stroke: '#000', strokeThickness: 4 })
        .setOrigin(0.5, 1).setResolution(2).setDepth(20000);
      this.tweens.add({ targets: mark, y: mark.y - 6, yoyo: true, repeat: -1, duration: 500 });
      return { id: m.id, mark, rect: new Phaser.Geom.Rectangle(m.x * T - 22, m.y * T - 22, 2 * T + 44, 2 * T + 44) };
    });
    map.postes.forEach(([x, y]) => {
      const cx = x * T + T / 2, by = (y + 1) * T;
      this.add.image(cx, by, 'poste_apagado').setOrigin(0.5, 1).setDepth(by);
      this.block(cx - 6, by - 8, 12, 8);
    });
    // pontos de ônibus (vários). Se o mapa for antigo, cai no ponto único.
    const pontos = map.pontos || [{ ...map.ponto, modo: 'pisca' }];
    this.buses = pontos.map((p) => {
      const px = p.x * T + T / 2, pb = p.y * T, modo = p.modo || 'pisca';
      const img = this.add.image(px, pb, modo === 'apagado' ? 'ponto_apagado' : 'ponto_aceso').setOrigin(0.5, 1).setDepth(pb);
      this.block(px - 30, pb - 16, 60, 14);
      return { img, px, pb, modo, glow: null };
    });
    map.varais.forEach((v) => this.add.image(v.x * T, v.y * T, 'varal').setOrigin(0).setDepth(9000));
map.fios.forEach((f) => this.add.image(f.x * T, f.y * T, 'fio').setOrigin(0).setDepth(f.y * T + 44));
  }

  // ------------------------------------------------- PISTA DE SKATE (fim da rua)
  // Peças geradas por tools/build_skatepark.py. Posições: map.skate.layout (relativas ao canto da pista).
  buildSkate() {
    const sk = map.skate; if (!sk) return;
    const L = sk.layout, ox = sk.x * T, oy = sk.y * T, PW = L.PW, PH = L.PH, bh = L.bh, sw = L.sw;
    this.add.image(ox, oy, 'skate_base').setOrigin(0).setDepth(-9);
    this.add.image(ox, oy + PH - bh, 'skate_frente').setOrigin(0).setDepth(oy + PH);          // muro da frente cobre quem passa atrás
    // fração da peça que é "sólida" (a parte de cima fica livre pra passar por trás)
    const SOL = { rampa_e: 0.35, rampa_d: 0.35, caixote: 0.4, rampinha: 0.35, corrimao: 0.45 };
    Object.entries(L.pecas).forEach(([k, p]) => {
      this.add.image(ox + p.x, oy + p.y, 'skate_' + k).setOrigin(0).setDepth(oy + p.y + p.h);
      if (k === 'rampa_e' || k === 'rampa_d') {
        // rampa grande: frente e faixa de cima sempre sólidas; a curva só deixa passar quem está de skate
        this.block(ox + p.x + 2, oy + p.y + 160, p.w - 4, p.h - 160);
        this.block(ox + p.x + 2, oy + p.y + 55, p.w - 4, 8);
        this.blockRamp(ox + p.x + 2, oy + p.y + 63, p.w - 4, 97);
        return;
      }
      const top = p.h * SOL[k];
      this.block(ox + p.x + 2, oy + p.y + top, p.w - 4, p.h - top);
    });
    // muros: fundo, laterais e frente (com a entrada aberta no meio)
    this.block(ox, oy, PW, bh + 4);
    this.block(ox, oy, sw, PH); this.block(ox + PW - sw, oy, sw, PH);
    this.block(ox, oy + PH - bh + 6, L.gap[0], bh);
    this.block(ox + L.gap[1], oy + PH - bh + 6, PW - L.gap[1], bh);
    this.buildSkateGang(ox, oy);
    this.skateItem = this.add.image(ox + 320, oy + 350, 'skate_chao').setOrigin(0.5, 1).setDepth(oy + 350);
  }
  // rapaziada parada conversando (usa os sprites do Mano/Mina com cores diferentes)
  buildSkateGang(ox, oy) {
    const g = [
      { x: 92,  y: 348, tex: 'menino', fr: 6, flip: false, tint: 0xffe3b8 },
      { x: 142, y: 344, tex: 'menina', fr: 6, flip: true,  tint: 0xb8c8ff },
      { x: 118, y: 330, tex: 'menino', fr: 0, flip: false, tint: 0xffb8b8 },
      { x: 118, y: 368, tex: 'menina', fr: 3, flip: false, tint: 0xb8ffd0 },
    ];
    this.gang = g.map((n) => {
      const x = ox + n.x, y = oy + n.y;
      const s = this.add.sprite(x, y, n.tex, n.fr).setOrigin(0.5, 1).setDepth(y).setFlipX(n.flip).setTint(n.tint);
      this.block(x - 6, y - 8, 12, 8);
      return { s, x, y };
    });
    const FALAS = ['mano...', 'viu aquele corte?', 'KKKKK', 'bora andar?', 'ontem eu caí feio', 'quem vai primeiro?', 'sem chance', 'tá pesado hoje'];
    this.time.addEvent({ delay: 2800, loop: true, callback: () => {
      const v = this.cameras.main.worldView;
      const vis = this.gang.filter((n) => Phaser.Geom.Rectangle.Contains(v, n.x, n.y));
      if (state.started && vis.length) this.gangSay(Phaser.Math.RND.pick(vis), Phaser.Math.RND.pick(FALAS));
    } });
  }
  gangSay(n, txt) {
    const t = this.add.text(0, 0, txt, { fontFamily: 'monospace', fontSize: '8px', fontStyle: 'bold', color: '#111111' }).setOrigin(0.5).setResolution(2);
    const w = t.width + 10, h = t.height + 6;
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 4).fillTriangle(-3, h / 2 - 1, 3, h / 2 - 1, 0, h / 2 + 4);
    g.lineStyle(1, 0x000000, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 4);
    const b = this.add.container(n.x, n.y - 56, [g, t]).setDepth(20000);
    this.tweens.add({ targets: b, y: b.y - 10, alpha: 0, delay: 1400, duration: 700, onComplete: () => b.destroy() });
  }

  // ------------------------------------------- navegação do cachorro (ruas)
  buildNav() {
    const { W, H } = map;
    this.navBlock = new Uint8Array(W * H);
    const mark = (x0, y0, w, h) => {
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x >= 0 && y >= 0 && x < W && y < H) this.navBlock[y * W + x] = 1;
    };
    map.houses.forEach((h) => mark(h.x, h.y, 3, 4));
    map.murais.forEach((m) => mark(m.x, m.y, 2, 2));
    if (map.skate) mark(map.skate.x, map.skate.y, map.skate.w, map.skate.h);   // pista de skate: ninguém de fora entra
    map.postes.forEach(([x, y]) => mark(x, y, 1, 1));
    this.buses.forEach((b) => mark(Math.floor(b.px / T) - 1, Math.floor((b.pb - 16) / T), 3, 1));
  }
  // caminho mais barato (rua custa 1, calçada 2, resto 4): o cachorro prefere a rua
  findPath(sx, sy, gx, gy) {
    const { W, H } = map, N = W * H;
    const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
    if (!inb(sx, sy) || !inb(gx, gy)) return null;
    const start = sy * W + sx, goal = gy * W + gx;
    const dist = new Float32Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
    const cost = (i) => { const ch = map.ground[(i / W) | 0][i % W]; return ROAD.has(ch) ? 1 : ch === 'c' ? 2 : 4; };
    const open = [start]; dist[start] = 0;
    while (open.length) {
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (dist[open[k]] < dist[open[bi]]) bi = k;
      const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      if (done[cur]) continue;
      done[cur] = 1;
      if (cur === goal) break;
      const cx = cur % W, cy = (cur / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (!inb(nx, ny)) continue;
        const ni = ny * W + nx;
        if (done[ni] || (this.navBlock[ni] && ni !== goal)) continue;
        const nd = dist[cur] + cost(ni);
        if (nd < dist[ni]) { dist[ni] = nd; prev[ni] = cur; open.push(ni); }
      }
    }
    if (!done[goal]) return null;
    const path = [];
    for (let i = goal; i !== -1; i = prev[i]) path.push(i);
    path.reverse(); path.shift();                       // tira o tile onde ele já está
    return path;
  }

  // ------------------------------------------------------------- animações
  buildAnims() {
    const a = (key, tex, frames, rate) => this.anims.create({ key, frames: frames.map((f) => ({ key: tex, frame: f })), frameRate: rate, repeat: -1 });
    ['menino', 'menina'].forEach((t) => {
      a(`${t}-down`, t, [1, 0, 2, 0], 8); a(`${t}-up`, t, [4, 3, 5, 3], 8); a(`${t}-side`, t, [7, 6, 8, 6], 8);
      a(`${t}_moto-side`, `${t}_moto`, [0, 1, 2, 1], 12); a(`${t}_moto-down`, `${t}_moto`, [3, 4, 5, 4], 12); a(`${t}_moto-up`, `${t}_moto`, [6, 7, 8, 7], 12);
      a(`${t}_skate-down`, `${t}_skate`, [1, 0, 2, 0], 6); a(`${t}_skate-up`, `${t}_skate`, [4, 3, 5, 3], 6); a(`${t}_skate-side`, `${t}_skate`, [7, 6, 8, 6], 6);
    });
    a('cameraman-down', 'cameraman', [1, 0, 2, 0], 8); a('cameraman-up', 'cameraman', [4, 3, 5, 3], 8); a('cameraman-side', 'cameraman', [7, 6, 8, 6], 8);
    this.anims.create({ key: 'heli-voa', frames: [0, 1, 2, 3].map((f) => ({ key: 'helicoptero', frame: f })), frameRate: 16, repeat: -1 });
    a('dog-down', 'cachorro', [0, 1, 2, 1], 11); a('dog-up', 'cachorro', [3, 4, 5, 4], 11); a('dog-side', 'cachorro', [6, 7, 8, 7], 11);
  }

  // ---------------------------------------------------------------- jogador
  buildPlayer() {
    this.player = this.physics.add.sprite(map.start.x * T + T / 2, map.start.y * T + T - 4, 'menino', 0).setOrigin(0.5, 1);
    this.player.setCollideWorldBounds(true);
    this.facing = 'down'; this.riding = false; this.skating = false; this.trick = null; this.prevKeys = new Set(); this.lift = 0; this.rampV = 0; this.carryX = 0; this.sideDir = 'right'; this.wheelie = 0;
    this.nameLabel = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '8px', color: '#fff', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5, 1).setResolution(2).setDepth(20000);
  }
  // corpo de colisão sempre centrado embaixo do sprite (serve pra qualquer tamanho de frame)
  setPlayerBody(riding) {
    const b = this.player.body, [bw, bh] = riding === 'skate' ? [14, 8] : riding ? [20, 10] : [12, 8], l = this.lift || 0;
    b.setSize(bw, bh); b.setOffset((this.player.width - bw) / 2, this.player.height - bh + l);
    this.player.setOrigin(0.5, 1 + l / this.player.height);   // l = altura na rampa (só visual, o corpo fica no chão)
  }
  setLift(l) {
    l = Math.round(l);
    if (l !== (this.lift || 0)) { this.lift = l; this.setPlayerBody(this.skating || this.trick ? 'skate' : this.riding); }
  }
  ensureMotoTex() {
    const key = `${state.sex}_moto`;
    if (this.player.texture.key !== key) { this.player.anims.stop(); this.player.setTexture(key, 0); this.setPlayerBody(true); }
  }
  ensureSkateTex() {
    const key = `${state.sex}_skate`;
    if (this.player.texture.key !== key) { this.player.anims.stop(); this.player.setTexture(key, 0); this.setPlayerBody('skate'); }
  }
  // faixa da curva/plataforma da rampa grande (m = folga nas laterais, só pra profundidade)
  rampAt(x, y, m = 0) {
    const sk = map.skate; if (!sk) return null;
    const L = sk.layout, ox = sk.x * T, oy = sk.y * T;
    for (const k of ['rampa_e', 'rampa_d']) {
      const r = L.pecas[k], e = k === 'rampa_e';
      const x0 = ox + r.x + 2, x1 = ox + r.x + r.w - 2, y0 = oy + r.y + 63, y1 = oy + r.y + 160;
      if (x < x0 - m || x > x1 + m || y < y0 || y > y1) continue;
      const xd = e ? ox + r.x + 55 : ox + r.x + r.w - 55;
      const u = Phaser.Math.Clamp(e ? (x1 - x) / (x1 - xd) : (x - x0) / (xd - x0), 0, 1);
      const inside = x >= x0 && x <= x1;
      return { u, dir: e ? 1 : -1, flip: !e, lift: inside ? 40 * u * u : 0, yMax: oy + r.y + 160 - 56 * u * u, depth: oy + r.y + r.h + 1, deck: inside && u >= 1 };
    }
    return null;
  }
  // plataforma de cima da rampa grande: { flip, ... } ou null
  deckAt(x, y) { const r = this.rampAt(x, y); return r && r.deck ? r : null; }
  startTrick(name, flip) {
    const DUR = { ollie: 0.55, kickflip: 0.7, handplant: 1.2 };
    this.trick = { name, t: 0, dur: DUR[name], lock: name === 'handplant', flip: flip === undefined ? this.sideDir === 'left' : flip };
    this.player.anims.stop(); this.player.setTexture(`${state.sex}_${name}`, 0); this.setPlayerBody('skate');
    this.player.setFlipX(this.trick.flip);
  }
  updateTrick(dt) {
    const tr = this.trick, p = this.player;
    tr.t += dt;
    if (tr.t >= tr.dur) { this.trick = null; this.ensureSkateTex(); this.setIdle(); return; }
    p.setFlipX(tr.flip); p.setFrame(Math.min(5, Math.floor(tr.t / tr.dur * 6)));
  }
  takeOrDropSkate() {
    if (this.trick || this.rampAt(this.player.x, this.player.y)) return;
    const p = this.player;
    if (!this.skating) {
      this.skating = true; this.skateItem.setVisible(false);
      this.ensureSkateTex(); this.setIdle();
    } else {
      this.skating = false;
      this.skateItem.setPosition(p.x, p.y).setDepth(p.y).setVisible(true);
      p.anims.stop(); p.setTexture(state.sex); this.setPlayerBody(false); this.setIdle();
    }
  }
  setIdle() {
    const kind = this.facing === 'left' || this.facing === 'right' ? 'side' : this.facing;
    // a folha a pé é (frente, costas, lado); a de moto é (lado, frente, costas)
    if (this.riding) this.ensureMotoTex(); else if (this.skating) this.ensureSkateTex();
    const row = this.riding ? { side: 0, down: 1, up: 2 }[kind] : { down: 0, up: 1, side: 2 }[kind];
    this.player.anims.stop(); this.player.setFrame(row * 3);
    this.player.setFlipX(this.facing === 'left');
  }

  // -------------------------------------------------------------------- moto
  buildMoto() {
    this.moto = this.add.image(map.moto.x * T + T / 2, map.moto.y * T + T - 2, 'moto_parada').setOrigin(0.5, 1);
  }
  mountOrDismount() {
    this.wheelie = 0;
    if (!this.riding) {
      this.riding = true; this.moto.setVisible(false);
      this.player.setPosition(this.moto.x, this.moto.y);
      this.player.setTexture(`${state.sex}_moto`); this.setPlayerBody(true); this.setIdle();
    } else {
      this.riding = false;
      this.moto.setPosition(this.player.x, this.player.y).setVisible(true);
      const horiz = this.facing === 'left' || this.facing === 'right';
      this.player.setPosition(this.player.x + (horiz ? 0 : 22), this.player.y + (horiz ? 22 : 0));
      this.player.setTexture(state.sex); this.setPlayerBody(false); this.setIdle();
    }
    setRidingUI(this.riding);
    // desceu: quem estava atrás vai embora. Montou: quem estiver perto vem atrás de novo
    this.dogs.forEach((d) => {
      const dist = Phaser.Math.Distance.Between(d.sprite.x, d.sprite.y, this.player.x, this.player.y);
      if (d.chase && this.riding && dist < 170) { d.state = 'chase'; d.t = 0; d.path = null; d.repath = 0; }
      else if (!this.riding && d.state === 'chase') { d.state = 'return'; d.t = 0; d.path = null; d.repath = 0; }
    });
  }
  roadAt(x, y) {
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    return ROAD.has((map.ground[ty] || '')[tx]);
  }
  // quantos dos 4 cantos da moto estão no asfalto (4 = totalmente na rua)
  roadScore(x, y) { return [[-8, 0], [8, 0], [-8, -8], [8, -8]].filter(([dx, dy]) => this.roadAt(x + dx, y + dy)).length; }

  // -------------------------------------------------------------------- bola
  buildBall() {
    const b = { x: map.quadra.x + map.quadra.w / 2, y: map.quadra.y + map.quadra.h / 2 };   // centro exato da quadra
    this.ball = this.physics.add.sprite(b.x * T, b.y * T, 'bola').setCircle(5, 0, 0);
    this.ball.setBounce(0.85).setCollideWorldBounds(true);
    this.ball.body.setBoundsRectangle(new Phaser.Geom.Rectangle(this.court.x - 16, this.court.y, this.court.width + 32, this.court.height));
    this.ball.body.useDamping = true; this.ball.setDrag(0.3, 0.3);
    this.lastKick = 0;
  }
  kick() {
    if (this.time.now - this.lastKick < 120) return;
    this.lastKick = this.time.now;
    this.crowdCheer();
    const p = this.player, v = Math.hypot(p.body.velocity.x, p.body.velocity.y);
    const ang = Phaser.Math.Angle.Between(p.x, p.y - 4, this.ball.x, this.ball.y);
    const sp = Math.max(150, v * 1.7 + 80);
    this.ball.setVelocity(Math.cos(ang) * sp, Math.sin(ang) * sp);
  }
    // ---------------------------------------------------------------- traves e gol
  buildGoals() {
    const q = map.quadra, qx = q.x * T, qy = q.y * T;
    const g = this.add.graphics().setDepth(-8);
    const CREME = 0xefe6c8, REDE = 0x2a2a36, MALHA = 0x5a5a70, BORDA = 0x1a1a22;
    const gol = (x0, x1, boca, backEsq) => {
      g.fillStyle(REDE, 1).fillRect(qx + x0, qy + 80, x1 - x0, 32);
      g.fillStyle(MALHA, 1);
      for (let x = x0; x < x1; x += 4) g.fillRect(qx + x, qy + 80, 1, 32);
      for (let y = 80; y < 112; y += 4) g.fillRect(qx + x0, qy + y, x1 - x0, 1);
      g.fillStyle(CREME, 1);
      g.fillRect(qx + x0, qy + 80, x1 - x0, 2); g.fillRect(qx + x0, qy + 110, x1 - x0, 2);
      g.fillRect(backEsq ? qx + x0 : qx + x1 - 2, qy + 80, 2, 32);
      [79, 109].forEach((y) => {
        g.fillStyle(BORDA, 1).fillRect(qx + boca - 2, qy + y - 1, 5, 6);
        g.fillStyle(CREME, 1).fillRect(qx + boca - 1, qy + y, 3, 4);
      });
    };
    gol(-8, 12, 12, true);        // gol da esquerda
    gol(274, 296, 274, false);    // gol da direita

    // paredes invisíveis: só deixam a bola e o jogador entrarem pela boca do gol
    this.goalWalls = this.physics.add.staticGroup();
    [[-8, 8, 20, 74], [-8, 110, 20, 74], [274, 8, 22, 74], [274, 110, 22, 74]].forEach(([x, y, w, h]) => {
      const z = this.add.zone(qx + x + w / 2, qy + y + h / 2, w, h);
      this.physics.world.enable(z, Phaser.Physics.Arcade.STATIC_BODY);
      this.goalWalls.add(z);
    });
    this.physics.add.collider(this.ball, this.goalWalls);
    this.physics.add.collider(this.player, this.goalWalls);
    this.goalLock = false;
  }
  checkGoal() {
    if (this.goalLock || this.juggling) return;
    const q = map.quadra, qx = q.x * T, qy = q.y * T, b = this.ball;
    const naBoca = b.y > qy + 82 && b.y < qy + 110;
    if (naBoca && (b.x < qx + 6 || b.x > qx + q.w * T - 6)) this.goal();
  }
  goal() {
    this.goalLock = true;
    state.gols = (state.gols || 0) + 1; updateHud();
    this.cameras.main.shake(180, 0.004);
    const t = this.add.text(this.ball.x, this.ball.y - 20, 'GOL!', { fontFamily: 'monospace', fontSize: '16px', fontStyle: 'bold', color: '#ffd23f', stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5).setResolution(2).setDepth(20000);
    this.tweens.add({ targets: t, y: t.y - 22, alpha: 0, duration: 1200, onComplete: () => t.destroy() });
    this.time.delayedCall(1400, () => {            // bola volta pro centro
      this.ball.setPosition((map.quadra.x + map.quadra.w / 2) * T, (map.quadra.y + map.quadra.h / 2) * T).setVelocity(0, 0);
      this.goalLock = false;
    });
  }
  // ---------------------------------------------------------------- embaixadinha (ritmo)
  updateJuggle(dt) {
    const p = this.player, b = this.ball;
    const pedido = state.juggle; state.juggle = false;
    if (!this.juggling) {
      const perto = !this.riding && !this.skating && !state.paused && Phaser.Math.Distance.Between(p.x, p.y - 6, b.x, b.y) < 44;
      if (perto !== this.nearBall) { this.nearBall = perto; setJuggleUI(perto); }
      if (pedido && perto && !this.goalLock) this.startJuggle();
      return;
    }
    const { PER, JANELA, LIMITE } = JUG;
    this.jugPh += dt / PER;                                   // 0 = bola subiu, 1 = bola nos pés
    const naJanela = this.jugPh >= JANELA && this.jugPh <= LIMITE;
    if (pedido) {
      if (naJanela) { this.jugN++; this.jugPh = 0; this.jugText.setText(`${this.jugN}`); }   // acertou: bola sobe de novo
      else return this.stopJuggle(true);                       // apertou cedo demais: caiu
    } else if (this.jugPh > LIMITE) return this.stopJuggle(true);   // passou do tempo: caiu
    const x = Math.min(this.jugPh, 1), h = 4 * x * (1 - x);   // 0 -> 1 -> 0
    b.setPosition(p.x, p.y - 4 - h * 30).setScale(1 + h * 0.25).setDepth(p.y + 1);
    this.jugShadow.setPosition(p.x, p.y - 1).setScale(1 - h * 0.4).setDepth(p.y)
      .setFillStyle(naJanela ? 0xffd23f : 0x000000, naJanela ? 0.85 : 0.35);
    if (!(p.body.velocity.x || p.body.velocity.y)) p.setFrame([1, 0, 2, 0][Math.floor(this.time.now / 125) % 4]);
    this.jugText.setPosition(p.x, p.y - 56);
  }
  startJuggle() {
    this.juggling = true; this.jugPh = 0; this.jugN = 1;
    this.crowdCheer();
    this.ball.setVelocity(0, 0); this.ball.body.enable = false;
    this.jugShadow = this.add.ellipse(0, 0, 9, 4, 0x000000, 0.35);
    this.jugText = this.add.text(0, 0, '1', { fontFamily: 'monospace', fontSize: '14px', fontStyle: 'bold', color: '#ffd23f', stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5, 1).setResolution(2).setDepth(20000);
    this.nearBall = true; setJuggleUI(true);
  }
  stopJuggle(caiu) {
    if (!this.juggling) return;
    this.juggling = false;
    const p = this.player, b = this.ball, n = this.jugN;
    const d = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[this.facing] || [0, 1];
    b.setScale(1); b.body.enable = true;
    b.body.reset(p.x + d[0] * 16, p.y - 4 + d[1] * 12);         // bola cai na frente dele
    b.setVelocity(d[0] * 40, d[1] * 40);
    this.jugShadow.destroy(); this.jugText.destroy();
    this.nearBall = false; setJuggleUI(false);
    const t = this.add.text(p.x, p.y - 56, caiu ? `CAIU! ${n} TOQUES` : `${n} TOQUES`, { fontFamily: 'monospace', fontSize: '10px', fontStyle: 'bold', color: caiu ? '#ff4fa3' : '#3de0c8', stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5, 1).setResolution(2).setDepth(20000);
    this.tweens.add({ targets: t, y: t.y - 16, alpha: 0, duration: 1200, onComplete: () => t.destroy() });
  }

  // ---------------------------------------------------------------- cachorros
  buildDog() {
    // 1º cachorro: posição do mapa. Os outros: mexe aqui pra mudar lugar/cor/velocidade
    const b = { x: map.dog.x, y: map.dog.y };
    const lista = [
      { x: b.x, y: b.y, tint: 0x8f6a52, vel: 1, cool: 0, sit: 0, chase: true },        // marrom chocolate
      { x: b.x + 1, y: b.y, tint: 0xd9b38c, vel: 0.9, cool: 0.8, sit: 1, chase: true },   // caramelo
      { x: b.x + 2, y: b.y, tint: null, vel: 1, cool: 0, sit: 2, chase: false },          // preto (só fica sentado)
      { x: b.x + 3, y: b.y, tint: null, vel: 1, cool: 0, sit: 3, chase: false },          // preto e branco (só fica sentado)
    ];
    this.dogs = lista.map((c) => {
      const home = new Phaser.Math.Vector2(c.x * T + T / 2, c.y * T + T - 2);
      const sprite = this.physics.add.sprite(home.x, home.y, 'cachorro', 6).setOrigin(0.5, 1);
      sprite.body.setSize(14, 8).setOffset(9, 24);
      return { sprite, home, tint: c.tint, sit: c.sit, chase: c.chase, vel: c.vel, state: 'home', t: 0, cool: c.cool, lastBark: 0, path: null, repath: 0 };
    });
  }
  dogFace(d, vx, vy) {
    const s = d.sprite;
    if (d.tint) s.setTint(d.tint); else s.clearTint();
    if (Math.abs(vx) > Math.abs(vy)) { s.setFlipX(vx > 0); s.anims.play('dog-side', true); }
    else { s.setFlipX(false); s.anims.play(vy > 0 ? 'dog-down' : 'dog-up', true); }
  }
  bark(d) {
    const s = d.sprite;
    const t = this.add.text(s.x, s.y - 30, Phaser.Math.RND.pick(['AU!', 'AU AU!', 'AUU!']), { fontFamily: 'monospace', fontSize: '8px', color: '#ffd23f', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5).setResolution(2).setDepth(20000);
    this.tweens.add({ targets: t, y: t.y - 14, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }
  dogTile(d) { return [Math.floor(d.sprite.x / T), Math.floor((d.sprite.y - 4) / T)]; }
  wp(i) { return { x: (i % map.W) * T + T / 2, y: ((i / map.W) | 0) * T + T - 4 }; }
  dogGo(d, tx, ty, speed) {
    const s = d.sprite, ang = Math.atan2(ty - s.y, tx - s.x);
    const vx = Math.cos(ang) * speed, vy = Math.sin(ang) * speed;
    s.setVelocity(vx, vy); this.dogFace(d, vx, vy);
  }
  // segue o caminho tile a tile. Devolve false quando acabou.
  dogFollow(d, speed) {
    const s = d.sprite;
    while (d.path && d.path.length) {
      const w = this.wp(d.path[0]);
      if (Math.hypot(w.x - s.x, w.y - s.y) < 6) { d.path.shift(); continue; }
      this.dogGo(d, w.x, w.y, speed); return true;
    }
    return false;
  }
  updateDog(d, dt) {
    const s = d.sprite, p = this.player;
    const dist = Phaser.Math.Distance.Between(s.x, s.y, p.x, p.y);
    d.cool -= dt;
    if (d.state === 'home') {
      s.setVelocity(0); s.anims.stop(); s.clearTint(); s.setFlipX(false); s.setTexture('cachorro_sentado', d.sit);
      if (d.chase && this.riding && d.cool <= 0 && dist < 170 && Math.hypot(p.body.velocity.x, p.body.velocity.y) > 120) {
        d.state = 'chase'; d.t = 0; d.path = null; d.repath = 0;
      }
    } else if (d.state === 'chase') {
      d.t += dt; d.repath -= dt;
      if (d.repath <= 0) {                                 // refaz o caminho até o jogador
        const [dx, dy] = this.dogTile(d);
        d.path = this.findPath(dx, dy, Math.floor(p.x / T), Math.floor((p.y - 4) / T));
        d.repath = 0.4;
      }
      if (dist < 48 || !this.dogFollow(d, DOG_SPEED * d.vel)) this.dogGo(d, p.x, p.y, DOG_SPEED * d.vel);   // perto: vai direto
      if (this.time.now - d.lastBark > 650) { d.lastBark = this.time.now; this.bark(d); }
      if (dist > 330 || d.t > 9 || (!this.riding && dist < 40)) {
        d.state = 'return'; d.t = 0; d.path = null; d.repath = 0;
      }
    } else {                                               // volta pro lugar dele PELA RUA
      d.t += dt; d.repath -= dt;
      const dd = Math.hypot(d.home.x - s.x, d.home.y - s.y);
      if (dd < 5 || d.t > 40) { s.setPosition(d.home.x, d.home.y); d.state = 'home'; d.cool = 5; d.path = null; return; }
      if (!d.path || d.repath <= 0) {
        const [dx, dy] = this.dogTile(d);
        d.path = this.findPath(dx, dy, Math.floor(d.home.x / T), Math.floor((d.home.y - 4) / T));
        d.repath = 1.5;
      }
      if (!this.dogFollow(d, DOG_RETURN)) this.dogGo(d, d.home.x, d.home.y, DOG_RETURN);
    }
    s.setDepth(s.y);
  }

  // ------------------------------------------------------------------ multidão
  buildCrowd() {
    const q = map.quadra, qx = q.x * T, qy = q.y * T, qw = q.w * T, qh = q.h * T;
    // lugares: colados na quadra e nas traves, nunca por cima (corpo inteiro: ~24x44)
    const cour = new Phaser.Geom.Rectangle(qx - 10, qy - 2, qw + 20, qh + 4);
    const outer = new Phaser.Geom.Rectangle(cour.x - 90, cour.y - 90, cour.width + 180, cour.height + 180);
    this.crowdBlock = Uint8Array.from(this.navBlock);                            // casas/postes/pontos + a quadra inteira
    for (let y = q.y; y < q.y + q.h; y++) for (let x = q.x; x < q.x + q.w; x++) this.crowdBlock[y * map.W + x] = 1;
    const bloq = (x, y) => { const tx = Math.floor(x / T), ty = Math.floor(y / T); return tx < 0 || ty < 0 || tx >= map.W || ty >= map.H || this.crowdBlock[ty * map.W + tx]; };
    const cel = {};
    const tomDe = (x, y) => {                                                    // grupos de ~3 pessoas com o mesmo tom
      const k = `${Math.floor(x / 40)},${Math.floor(y / 26)}`;
      if (cel[k] === undefined) cel[k] = Phaser.Math.RND.pick([0, 0, 1, 1, 2, 3]);
      return Phaser.Math.Clamp(cel[k] + Phaser.Math.RND.pick([-1, 0, 0, 0, 0, 0, 0, 1]), 0, 3);
    };
    const camX = Math.round(qx + qw / 2), camY = qy + qh + 26;                  // câmera man: embaixo da quadra, no meio
    const lugares = [];
    for (let row = 0, fy = outer.y; fy <= outer.bottom + 50; row++, fy += 8) {
      for (let fx = outer.x + (row % 2 ? 6 : 0); fx <= outer.right; fx += 12) {
        const x = Math.round(fx + Phaser.Math.Between(-2, 2)), y = Math.round(fy + Phaser.Math.Between(-1, 1));
        if (x < 14 || x > map.W * T - 14 || y < 46 || y > map.H * T - 2) continue;
        if (Phaser.Geom.Intersects.RectangleToRectangle(new Phaser.Geom.Rectangle(x - 12, y - 44, 24, 44), cour)) continue;   // corpo inteiro fora da quadra
        if (Math.abs(x - camX) < 34 && y > camY - 8 && y < camY + 56) continue;                                                // ninguém na frente do câmera man
        if (!Phaser.Geom.Rectangle.Contains(outer, x, y - 16)) continue;
        const ch = (map.ground[Math.floor((y - 4) / T)] || '')[Math.floor(x / T)];
        if (!ch || !'cpdgo'.includes(ch) || bloq(x, y - 4) || bloq(x, y - 40)) continue;
        lugares.push({ x, y, d: Math.hypot(Math.max(qx - x, 0, x - (qx + qw)), Math.max(qy - y, 0, y - (qy + qh))) });
      }
    }
    lugares.sort((a, b) => a.d - b.d);
    const camMan = {                                                             // câmera man da TV: chega andando, para olhando pra quadra e grava
      cam: true, sx: camX, sy: camY, x: camX, y: camY, s: null, state: 'gone', route: [], ri: 0, wait: 0, t: 0, speed: 0, jump: 0, vx: 0, vy: 0,
      tex: 'cameraman', tom: 0, fr: 3, flip: false, sc: 1, jx: 0, jy: 0, ph: 0, bobA: 0, bobF: 5,
    };
    this.crowd = {
      state: 'hidden', lastSay: 0,                                               // hidden -> entering -> watching -> leaving -> hidden
      members: [camMan, ...lugares.slice(0, CROWD_MAX).map((l) => {
        // cada um olha pra quadra: de frente (norte), de costas (sul) ou de lado (leste/oeste)
        const ox = l.x < qx ? qx - l.x : l.x > qx + qw ? l.x - (qx + qw) : 0;
        const oy = l.y < qy ? qy - l.y : l.y > qy + qh ? l.y - (qy + qh) : 0;
        let fr = 0, flip = false;
        if (ox > oy) { fr = 6; flip = l.x > qx + qw; }
        else fr = l.y < qy ? 0 : 3;
        return {
          sx: l.x, sy: l.y, x: l.x, y: l.y, s: null, state: 'gone', route: [], ri: 0, wait: 0, t: 0, speed: 0, jump: 0, vx: 0, vy: 0,
          tex: Phaser.Math.RND.pick(['menino', 'menina']), tom: tomDe(l.x, l.y), fr, flip, sc: Phaser.Math.FloatBetween(0.95, 1.04),
          jx: Phaser.Math.Between(-5, 5), jy: Phaser.Math.Between(-2, 2),
          ph: Math.random() * 6.28, bobA: Phaser.Math.RND.pick([0, 0, 0.8, 1.2]), bobF: Phaser.Math.Between(5, 9),
        };
      })],
    };
  }
  crowdView(margem) {
    const v = this.cameras.main.worldView;
    return new Phaser.Geom.Rectangle(v.x - margem, v.y - margem, v.width + margem * 2, v.height + margem * 2);
  }
  // mapa de distância até a rua mais perto (calcula uma vez só). Quadra, casas e postes são parede.
  crowdField() {
    if (this.crowdDist) return this.crowdDist;
    const { W, H } = map, dist = new Int16Array(W * H).fill(-1), fila = [];
    for (let i = 0; i < W * H; i++) {
      if ('#-|'.includes(map.ground[(i / W) | 0][i % W]) && !this.crowdBlock[i]) { dist[i] = 0; fila.push(i); }
    }
    for (let h = 0; h < fila.length; h++) {
      const cur = fila[h], cx = cur % W, cy = (cur / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (dist[ni] < 0 && !this.crowdBlock[ni]) { dist[ni] = dist[cur] + 1; fila.push(ni); }
      }
    }
    return (this.crowdDist = dist);
  }
  // rota do lugar até a rua (lista de tiles). Nunca passa pela quadra nem por casa.
  crowdRoute(tx, ty) {
    const f = this.crowdField(), { W, H } = map, rota = [];
    let cur = ty * W + tx;
    if (f[cur] < 0) return null;
    while (f[cur] > 0 && rota.length < 200) {
      const cx = cur % W, cy = (cur / W) | 0;
      let best = -1, bd = f[cur];
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (f[ni] >= 0 && f[ni] < bd) { bd = f[ni]; best = ni; }
      }
      if (best < 0) break;
      rota.push(best); cur = best;
    }
    return rota;
  }
  // tocou na bola
  crowdCheer() {
    const st = this.crowd.state;
    if (st === 'hidden') this.crowdShow();
    else if (st === 'watching') this.crowdShout(false);
  }
  // eles entram pela rua, vindo de fora da tela, e ocupam os lugares
  crowdShow() {
    const c = this.crowd, vb = this.crowdView(56);
    c.state = 'entering'; this.heliStart();
    c.members.forEach((m) => {
      const r = this.crowdRoute(Math.floor(m.sx / T), Math.floor((m.sy - 4) / T));
      m.route = r ? r.reverse() : [];
      let k = 0;                                                                 // começa no 1º ponto da rota que já está perto da tela
      while (k < m.route.length) { const w = this.wp(m.route[k]); if (Phaser.Geom.Rectangle.Contains(vb, w.x + m.jx, w.y + m.jy - 22)) break; k++; }
      if (k >= m.route.length) { m.ri = m.route.length; m.x = m.sx; m.y = m.sy; }
      else { const w = this.wp(m.route[k]); m.ri = k + 1; m.x = w.x + m.jx; m.y = w.y + m.jy; }
      m.state = 'wait-in'; m.wait = Phaser.Math.FloatBetween(0, 1.6); m.speed = Phaser.Math.Between(110, 150); m.t = 0; m.jump = 0;
    });
  }
  // E: manda a galera embora. Saem pela rua e somem.
  crowdLeave() {
    const c = this.crowd; c.state = 'leaving'; this.heliLeave();
    c.members.forEach((m) => {
      if (m.state !== 'stand') return;
      m.route = this.crowdRoute(Math.floor(m.sx / T), Math.floor((m.sy - 4) / T)) || [];
      m.ri = 0; m.t = 0; m.state = 'wait-out'; m.wait = Phaser.Math.FloatBetween(0, 1.2); m.speed = Phaser.Math.Between(120, 170);
    });
  }
  // sprite do menino/menina pintado de cor chapada (só a silhueta, com pés)
  crowdSpawn(m) {
    m.s = this.add.sprite(m.x, m.y, m.tex, m.fr).setOrigin(0.5, 1).setDepth(m.y).setScale(m.sc).setFlipX(m.flip);
    if (!m.cam) m.s.setTintFill(CROWD_TONS[m.tom]);                              // a galera é silhueta; o câmera man tem cor
    m.state = 'enter';
  }
  crowdFace(m) { m.s.anims.stop(); m.s.setFrame(m.fr).setFlipX(m.flip); }   // parado: olha pra quadra
  crowdAnim(m) {                                                              // andando: anima na direção que está indo
    const k = Math.abs(m.vx) > Math.abs(m.vy) ? 'side' : m.vy > 0 ? 'down' : 'up';
    m.s.setFlipX(k === 'side' && m.vx < 0);
    m.s.anims.play(`${m.tex}-${k}`, true);
  }
  crowdMove(m, tx, ty, dt) {
    const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy), passo = m.speed * dt;
    if (d <= passo) { m.x = tx; m.y = ty; return true; }
    m.vx = dx / d; m.vy = dy / d;
    m.x += m.vx * passo; m.y += m.vy * passo; return false;
  }
  crowdShout(first) {
    const c = this.crowd, now = this.time.now;
    if (!first && now - c.lastSay < 1200) return;
    c.lastSay = now;
    const vb = this.crowdView(0);
    const vis = Phaser.Utils.Array.Shuffle(c.members.filter((m) => !m.cam && m.state === 'stand' && Phaser.Geom.Rectangle.Contains(vb, m.x, m.y)));
    const frases = Phaser.Utils.Array.Shuffle([...CROWD_FRASES]);
    vis.slice(0, 4).forEach((m, i) => this.time.delayedCall(i * 160, () => { if (m.s) this.crowdSay(m, frases[i % frases.length]); }));
  }
  crowdSay(m, txt, hold = 500) {
    const t = this.add.text(0, 0, txt, { fontFamily: 'monospace', fontSize: '8px', fontStyle: 'bold', color: '#111111' }).setOrigin(0.5).setResolution(2);
    const w = t.width + 10, h = t.height + 6;
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 4).fillTriangle(-3, h / 2 - 1, 3, h / 2 - 1, 0, h / 2 + 4);
    g.lineStyle(1, 0x000000, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 4);
    const b = this.add.container(m.x, m.y - 56, [g, t]).setDepth(20000);
    this.tweens.add({ targets: b, y: b.y - 12, alpha: 0, delay: hold, duration: 900, onComplete: () => b.destroy() });
    m.jump = 0.25;                                                               // pulinho
  }
  crowdUpdate(dt) {
    const c = this.crowd;
    if (c.state === 'hidden') return;
    dt = Math.min(dt, 0.05);
    const p = this.player, q = map.quadra, qx = q.x * T, qy = q.y * T, agora = this.time.now / 1000;
    // enquanto tiver multidão o jogador fica preso na quadra
    const px = Phaser.Math.Clamp(p.x, qx - 6, qx + q.w * T + 6), py = Phaser.Math.Clamp(p.y, qy + 12, qy + q.h * T - 2);
    if (px !== p.x) { p.x = px; p.setVelocityX(0); }
    if (py !== p.y) { p.y = py; p.setVelocityY(0); }
    const vb = this.crowdView(56);
    let vivos = 0, parados = 0;
    c.members.forEach((m) => {
      if (m.state === 'gone') return;
      vivos++;
      if (m.state === 'wait-in') { m.wait -= dt; if (m.wait > 0) return; this.crowdSpawn(m); }
      else if (m.state === 'wait-out') { m.wait -= dt; if (m.wait <= 0) m.state = 'leave'; }
      else if (m.state === 'enter') {
        const w = m.ri < m.route.length ? this.wp(m.route[m.ri]) : null;
        if (this.crowdMove(m, w ? w.x + m.jx : m.sx, w ? w.y + m.jy : m.sy, dt)) {
          if (w) m.ri++; else { m.state = 'stand'; m.s.setDepth(m.sy); this.crowdFace(m); if (m.cam) this.crowdSay(m, CAM_FRASE, 2200); }
        }
      } else if (m.state === 'leave') {
        m.t += dt;
        const w = m.ri < m.route.length ? this.wp(m.route[m.ri]) : null;
        if (!w || (m.t > 0.4 && !Phaser.Geom.Rectangle.Contains(vb, m.x, m.y - 22))) {   // chegou na rua ou saiu da tela: some
          m.s.destroy(); m.s = null; m.state = 'gone'; vivos--; return;
        }
        if (this.crowdMove(m, w.x + m.jx, w.y + m.jy, dt)) m.ri++;
      }
      if (m.state === 'stand') parados++;
      if (m.s) {
        const andando = m.state === 'enter' || m.state === 'leave';
        if (andando) this.crowdAnim(m);
        const bob = andando ? 0 : (Math.sin(agora * m.bobF + m.ph) * 0.5 + 0.5) * m.bobA;
        if (m.jump > 0) m.jump -= dt;
        const pulo = m.jump > 0 ? Math.sin(Math.PI * (1 - m.jump / 0.25)) * 6 : 0;
        if (andando) m.s.setDepth(m.y);
        m.s.setPosition(m.x, m.y - bob - pulo);
      }
    });
    if (c.state === 'entering' && vivos > 0 && parados === vivos) { c.state = 'watching'; this.crowdShout(true); }
    if (c.state === 'leaving' && vivos === 0) c.state = 'hidden';
  }
  // ------------------------------------------------------- helicóptero da TV
  // entra voando, dá uma voltinha sobre a quadra, paira subindo/descendo devagar e para. Quando a galera sai, ele vai embora.
  buildHeli() { this.heli = { st: 'off', t: 0, gx: 0, gy: 0, fx: 0, fy: 0, spr: null, sh: null }; }
  heliStart() {
    const h = this.heli, q = map.quadra;
    if (h.st !== 'off' && h.st !== 'sai') return;
    if (h.st === 'off') {
      const v = this.cameras.main.worldView;
      h.gx = v.right + 100; h.gy = (q.y + q.h / 2) * T - 120;
      h.spr = this.add.sprite(h.gx, h.gy - HELI.ALT, 'helicoptero', 0).setOrigin(0.5, 0.75).setDepth(19000);
      h.sh = this.add.image(h.gx, h.gy, 'heli_sombra').setAlpha(0.4).setDepth(-7);
      h.spr.anims.play('heli-voa');
    }
    h.fx = h.gx; h.fy = h.gy; h.t = 0; h.st = 'entra';
  }
  heliLeave() {
    const h = this.heli;
    if (h.st === 'off' || h.st === 'sai') return;
    h.fx = h.gx; h.fy = h.gy; h.t = 0; h.st = 'sai';
  }
  heliUpdate(dt) {
    const h = this.heli;
    if (h.st === 'off') return;
    dt = Math.min(dt, 0.05); h.t += dt;
    const q = map.quadra, cx = (q.x + q.w / 2) * T, cy = (q.y + q.h / 2) * T;
    const sm = (u) => u * u * (3 - 2 * u), lerp = (a, b, u) => a + (b - a) * u;
    const P0 = { x: cx + HELI.VOLTA_RX, y: cy }, R = { x: cx + HELI.PX, y: cy + HELI.PY };   // R = onde ele para (canto superior direito)
    let alt = HELI.ALT;
    if (h.st === 'entra') {
      const u = Math.min(h.t / HELI.ENTRA, 1), e = 1 - (1 - u) * (1 - u);
      h.gx = lerp(h.fx, P0.x, e); h.gy = lerp(h.fy, P0.y, e);
      if (u >= 1) { h.st = 'volta'; h.t = 0; }
    } else if (h.st === 'volta') {
      const u = Math.min(h.t / HELI.VOLTA, 1), th = Math.PI * 2 * sm(u);
      h.gx = cx + HELI.VOLTA_RX * Math.cos(th); h.gy = cy + HELI.VOLTA_RY * Math.sin(th);
      if (u >= 1) { h.st = 'pousa'; h.t = 0; }
    } else if (h.st === 'pousa') {
      const u = sm(Math.min(h.t / HELI.POUSA, 1));
      h.gx = lerp(P0.x, R.x, u); h.gy = lerp(P0.y, R.y, u);
      if (u >= 1) { h.st = 'bobe'; h.t = 0; }
    } else if (h.st === 'bobe') {
      const u = Math.min(h.t / HELI.BOBE, 1);
      alt += 7 * (1 - u) * Math.sin(h.t * 3.4);                                  // sobe e desce cada vez menos
      h.gx = R.x; h.gy = R.y;
      if (u >= 1) h.st = 'para';
    } else if (h.st === 'para') { h.gx = R.x; h.gy = R.y; }
    else if (h.st === 'sai') {
      const u = Math.min(h.t / HELI.SAI, 1), e = u * u, v = this.cameras.main.worldView;
      h.gx = lerp(h.fx, v.x - 140, e); h.gy = lerp(h.fy, h.fy - 70, e);
      if (u >= 1) { h.spr.destroy(); h.sh.destroy(); h.spr = h.sh = null; h.st = 'off'; return; }
    }
    h.spr.setPosition(Math.round(h.gx), Math.round(h.gy - alt));
    h.sh.setPosition(Math.round(h.gx), Math.round(h.gy)).setScale(1 - (alt - HELI.ALT) * 0.01);
  }

  buildBrilho() {
    const gt = this.textures.createCanvas('brilho', 64, 64), gc = gt.getContext();
    const g2 = gc.createRadialGradient(32, 32, 0, 32, 32, 32);
    g2.addColorStop(0, 'rgba(255,225,150,1)'); g2.addColorStop(1, 'rgba(255,160,60,0)');
    gc.fillStyle = g2; gc.fillRect(0, 0, 64, 64); gt.refresh();
  }

  // ------------------------------------------------ luz dos pontos (mau contato)
  buildBusLight() {
    this.buses.forEach((b) => {
      b.glow = this.add.image(b.px, b.pb - 30, 'brilho').setScale(1.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(30002).setAlpha(0);
      const set = (on) => { b.img.setTexture(on ? 'ponto_aceso' : 'ponto_apagado'); b.glow.setAlpha(on ? DIA.glowAlpha : 0); };
      if (b.modo === 'apagado') return set(false);
      if (b.modo === 'aceso') return set(true);
      const run = () => {
        const steps = []; const n = Phaser.Math.Between(3, 6);
        for (let i = 0; i < n; i++) { steps.push([false, Phaser.Math.Between(50, 130)]); steps.push([true, Phaser.Math.Between(40, 110)]); }
        steps.push([true, Phaser.Math.Between(1500, 3600)]);              // fica acesa um tempo
        if (Math.random() < 0.4) { steps.push([false, Phaser.Math.Between(90, 220)]); steps.push([true, Phaser.Math.Between(500, 1400)]); }
        const go = (i) => { if (i >= steps.length) return run(); set(steps[i][0]); this.time.delayedCall(steps[i][1], () => go(i + 1)); };
        go(0);
      };
      set(true);
      this.time.delayedCall(Phaser.Math.Between(0, 2500), run);          // cada ponto pisca no seu tempo
    });
  }

  // ------------------------------------------------------------------ update
  update(_, delta) {
    const dt = delta / 1000, p = this.player, mv = getMove();
    if (this.juggling && (this.riding || this.skating || state.paused)) this.stopJuggle(false);
    const speed = this.riding ? RIDE : this.skating ? SKATE : WALK;
    let vx = mv.x * speed, vy = mv.y * speed;

    // GRAU: segura ESPAÇO (ou botão A no celular) de moto
    const heldGrau = this.riding && !state.paused && (state.keys.has(' ') || state.btnA);
    this.wheelie = Phaser.Math.Clamp(this.wheelie + (heldGrau ? 4 : -5) * dt, 0, 1);

    if (this.riding) {                                    // moto só na rua (mas deixa sair se estiver travada na beira)
      const here = this.roadScore(p.x, p.y);
      const okMove = (nx, ny) => { const s = this.roadScore(nx, ny); return s === 4 || (here < 4 && s > here); };
      if (vx && !okMove(p.x + vx * dt, p.y)) vx = 0;
      if (vy && !okMove(p.x, p.y + vy * dt)) vy = 0;
    }
    // RAMPA GRANDE: sobe devagar, solta e desce sozinho (acelerando), sai com embalo
    const ri = this.skating && !this.trick ? this.rampAt(p.x, p.y) : null;
    if (ri) {
      if (p.y > ri.yMax) p.y = ri.yMax;       // a curva afunila: não deixa descer pra dentro da frente
      if (mv.x !== 0 && Math.sign(mv.x) === -ri.dir) { this.rampV = 0; vx = -ri.dir * SKATE * (1 - 0.65 * ri.u); }   // empurrando pro topo
      else {
        if (ri.deck && mv.x === ri.dir) this.rampV = Math.max(this.rampV, 60);                                          // drop-in
        const g = ri.deck ? (mv.x === ri.dir ? 0.4 : 0) : ri.u + 0.1;
        this.rampV = g > 0 ? Math.min(this.rampV + 380 * g * dt, 260) : 0;
        vx = ri.dir * this.rampV; this.rampDir = ri.dir;
      }
    } else {
      if (this.rampV > 0) { this.carryX = this.rampDir * this.rampV; this.rampV = 0; }
      if (this.carryX) { vx += this.carryX; this.carryX *= Math.max(0, 1 - 2.2 * dt); if (Math.abs(this.carryX) < 8) this.carryX = 0; }
    }
    if (this.trick && this.trick.lock) { vx = 0; vy = 0; }
    p.setVelocity(vx, vy);

    if (mv.x || mv.y) this.facing = mv.x ? (mv.x > 0 ? 'right' : 'left') : (mv.y > 0 ? 'down' : 'up');
    if (mv.x) this.sideDir = mv.x > 0 ? 'right' : 'left';

    const vertical = this.facing === 'up' || this.facing === 'down';

    if (this.trick) {
      // manobra: o frame é desenhado em updateTrick
    } else if (this.riding && this.wheelie > 0.02) {
      if (vertical) {
        // grau pra cima/baixo: usa a moto de costas/frente e estica (fake de top-down)
        this.ensureMotoTex();
        const row = this.facing === 'up' ? 2 : 1;      // folha da moto: lado, frente, costas
        p.anims.stop(); p.setFrame(row * 3 + 1); p.setFlipX(false);
        const w = this.wheelie;
        p.setScale(1 + 0.06 * w, 1 + 0.22 * w);
      } else {
        // grau de lado (o que já existia)
        p.setScale(1);
        const f = this.wheelie < 0.34 ? 0 : this.wheelie < 0.67 ? 1 : 2;
        const key = `${state.sex}_grau`;
        if (p.texture.key !== key) { p.anims.stop(); p.setTexture(key, f); this.setPlayerBody(true); }
        p.setFrame(f); p.setFlipX(this.sideDir === 'left');
      }
    } else {
      p.setScale(1);
      if (this.riding) this.ensureMotoTex(); else if (this.skating) this.ensureSkateTex();
      if (mv.x || mv.y) {
        const kind = mv.x ? 'side' : this.facing;
        p.setFlipX(this.facing === 'left');
        if (vx || vy) p.anims.play(`${this.riding ? state.sex + '_moto' : this.skating ? state.sex + '_skate' : state.sex}-${kind}`, true); else this.setIdle();
      } else this.setIdle();
    }

    // manobras de skate: B ollie · N kickflip · M handplant (só em cima da rampa grande)
    const tap = (k) => state.keys.has(k) && !this.prevKeys.has(k);
    if (this.skating && !this.trick && !state.paused) {
      const deck = this.deckAt(p.x, p.y);
      if (tap('b')) this.startTrick('ollie');
      else if (tap('n')) this.startTrick('kickflip');
      else if (tap('m') && deck) this.startTrick('handplant', deck.flip);
    }
    this.prevKeys = new Set(state.keys);
    if (this.trick) this.updateTrick(dt);

    // dica de interação + ação (E / A / B)
    let hint = null, target = null;
    if (this.riding) hint = 'E: descer • ESPAÇO: grau';
    else {
      if (this.skating) { hint = TOUCH ? 'E: largar o skate' : this.deckAt(p.x, p.y) ? 'M: handplant • B: ollie • N: kickflip • E: largar' : 'B: ollie • N: kickflip • E: largar'; target = 'skate'; }
      else if (this.skateItem && Phaser.Math.Distance.Between(p.x, p.y, this.skateItem.x, this.skateItem.y - 4) < 34) { hint = 'E: pegar o skate'; target = 'skate'; }
      else if (Phaser.Math.Distance.Between(p.x, p.y, this.moto.x, this.moto.y) < 38) { hint = 'E: montar na moto'; target = 'moto'; }
      const m = this.murais.find((m) => Phaser.Geom.Rectangle.Contains(m.rect, p.x, p.y - 4));
      if (m) { hint = 'E: ver o mural'; target = m; }
    }
    if (this.juggling) hint = 'ESPAÇO: toca quando a sombra brilhar';
    else if (!hint && !this.riding && this.nearBall) hint = 'ESPAÇO: embaixadinha';
    else if (!hint && !this.riding && this.crowd.state === 'watching') hint = 'E: mandar a galera embora';
    setHint(state.paused ? null : hint);
    if (consumeAction() && !state.paused && !this.juggling) {
      if (this.riding) this.mountOrDismount();
      else if (target === 'skate') this.takeOrDropSkate();
      else if (target === 'moto') this.mountOrDismount();
      else if (target) this.openMural(target);
      else if (this.crowd.state === 'watching' && state.actionSrc === 'e') this.crowdLeave();
    }

    // bola: para quando fica bem lenta
    const bv = this.ball.body.velocity; if (Math.hypot(bv.x, bv.y) < 6) this.ball.setVelocity(0);
    this.ball.setDepth(this.ball.y);
    this.checkGoal();
    this.updateJuggle(dt);

    this.dogs.forEach((d) => this.updateDog(d, dt));
    this.crowdUpdate(dt);
    this.heliUpdate(dt);
    const rp = this.skating || this.trick ? this.rampAt(p.x, p.y, 24) : null;
    this.setLift(this.skating && rp ? rp.lift : 0);
    p.setDepth(rp ? rp.depth : p.y); this.nameLabel.setPosition(p.x, p.y - (this.lift || 0) - (this.riding ? 50 + 12 * this.wheelie : this.skating ? 54 : 46)).setVisible(true);
    this.moto.setDepth(this.moto.y);
  }

  openMural(m) {
    openMural(m.id, () => {
      state.found.add(m.id); m.mark.destroy(); updateHud();
      if (state.found.size === state.totalMurais) {
        showDialog([`Aí, ${state.name}! Tu achou os 3 murais da quebrada.`, 'Cada muro conta uma história, e agora tu sabe três delas. 🎉']);
      }
    });
  }
}