import Phaser from 'phaser';
import map from './mapdata.json';
import { state, getMove, consumeAction } from './state.js';
import { showDialog, setHint, updateHud, openMural, setRidingUI } from './ui.js';

const T = map.T;
const ROAD = new Set(['#', '-', '|', 'b', 'o']);          // moto só anda aqui
const TILE_KEY = { '#':'asfalto', '-':'asfalto_faixa_h', '|':'asfalto_faixa', c:'calcada', p:'piso_rachado', g:'grama', d:'terra', b:'bueiro', o:'poca', s:'escada' };
const WALK = 92, RIDE = 215, DOG_SPEED = 150, DOG_RETURN = 85;

// ---- FIM DE TARDE: mexe aqui pra ajustar o clima ----
const TARDE = {
  tint: 0xffc08f,        // cor que "multiplica" a imagem (mais claro = menos efeito)
  vigInner: 'rgba(255,150,70,0)',     // centro da vinheta
  vigOuter: 'rgba(70,20,80,0.5)',     // bordas da vinheta (roxo escuro)
  glowAlpha: 0.45,       // brilho das luzes dos pontos de ônibus
};

// moto: folha normal 52x48 / folha do grau 62x45 (mesmo centro e mesmo chão)
const MOTO_W = 52, MOTO_H = 48, GRAU_W = 62, GRAU_H = 45;

export class GameScene extends Phaser.Scene {
  constructor() { super('game'); }

  // ---------------------------------------------------------------- preload
  preload() {
    ['asfalto','asfalto_faixa','asfalto_faixa_h','calcada','piso_rachado','grama','terra','bueiro','poca','escada']
      .forEach((n) => this.load.image('t_' + n, `assets/tiles/${n}.png`));
    ['casa_azul','casa_amarela','casa_rosa','casa_verde','casa_tijolo','muro_verde','muro_rosa','muro_amarelo','quadra','ponto_aceso','ponto_apagado','varal','fio','caixa_dagua']
      .forEach((n) => this.load.image(n, `assets/props/${n}.png`));
    ['poste_apagado','moto_parada','bola'].forEach((n) => this.load.image(n, `assets/sprites/${n}.png`));
    ['menino','menina'].forEach((n) => this.load.spritesheet(n, `assets/sprites/${n}.png`, { frameWidth: 32, frameHeight: 44 }));
    ['menino_moto','menina_moto'].forEach((n) => this.load.spritesheet(n, `assets/sprites/${n}.png`, { frameWidth: MOTO_W, frameHeight: MOTO_H }));
    ['menino_grau','menina_grau'].forEach((n) => this.load.spritesheet(n, `assets/sprites/${n}.png`, { frameWidth: GRAU_W, frameHeight: GRAU_H }));
    this.load.spritesheet('cachorro', 'assets/sprites/cachorro.png', { frameWidth: 32, frameHeight: 32 });
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
    this.buildNav();
    this.buildAnims();
    this.buildPlayer();
    this.buildMoto();
    this.buildBall();
    this.buildDog();
    this.buildSunset();
    this.buildBusLight();

    this.physics.add.collider(this.player, this.solids);
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
    map.fios.forEach((f) => this.add.image(f.x * T, f.y * T, 'fio').setOrigin(0).setDepth(9000));
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
    });
    a('dog-down', 'cachorro', [0, 1, 2, 1], 11); a('dog-up', 'cachorro', [3, 4, 5, 4], 11); a('dog-side', 'cachorro', [6, 7, 8, 7], 11);
  }

  // ---------------------------------------------------------------- jogador
  buildPlayer() {
    this.player = this.physics.add.sprite(map.start.x * T + T / 2, map.start.y * T + T - 4, 'menino', 0).setOrigin(0.5, 1);
    this.player.setCollideWorldBounds(true);
    this.facing = 'down'; this.riding = false; this.sideDir = 'right'; this.wheelie = 0;
    this.nameLabel = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '8px', color: '#fff', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5, 1).setResolution(2).setDepth(20000);
  }
  // corpo de colisão sempre centrado embaixo do sprite (serve pra qualquer tamanho de frame)
  setPlayerBody(riding) {
    const b = this.player.body, [bw, bh] = riding ? [20, 10] : [12, 8];
    b.setSize(bw, bh); b.setOffset((this.player.width - bw) / 2, this.player.height - bh);
  }
  ensureMotoTex() {
    const key = `${state.sex}_moto`;
    if (this.player.texture.key !== key) { this.player.anims.stop(); this.player.setTexture(key, 0); this.setPlayerBody(true); }
  }
  setIdle() {
    const kind = this.facing === 'left' || this.facing === 'right' ? 'side' : this.facing;
    // a folha a pé é (frente, costas, lado); a de moto é (lado, frente, costas)
    if (this.riding) this.ensureMotoTex();
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
      if (this.riding && dist < 170) { d.state = 'chase'; d.t = 0; d.path = null; d.repath = 0; }
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
    const b = map.bola;
    this.ball = this.physics.add.sprite(b.x * T, b.y * T, 'bola').setCircle(5, 0, 0);
    this.ball.setBounce(0.85).setCollideWorldBounds(true);
    this.ball.body.setBoundsRectangle(this.court);
    this.ball.body.useDamping = true; this.ball.setDrag(0.3, 0.3);
    this.lastKick = 0;
  }
  kick() {
    if (this.time.now - this.lastKick < 120) return;
    this.lastKick = this.time.now;
    const p = this.player, v = Math.hypot(p.body.velocity.x, p.body.velocity.y);
    const ang = Phaser.Math.Angle.Between(p.x, p.y - 4, this.ball.x, this.ball.y);
    const sp = Math.max(150, v * 1.7 + 80);
    this.ball.setVelocity(Math.cos(ang) * sp, Math.sin(ang) * sp);
  }

  // ---------------------------------------------------------------- cachorros
  buildDog() {
    // 1º cachorro: posição do mapa. Os outros: mexe aqui pra mudar lugar/cor/velocidade
    const b = { x: map.dog.x, y: map.dog.y };
    const lista = [
      { x: b.x, y: b.y, tint: null, vel: 1, cool: 0 },
      { x: b.x + 1, y: b.y, tint: 0xd9b38c, vel: 0.9, cool: 0.8 },
    ];
    this.dogs = lista.map((c) => {
      const home = new Phaser.Math.Vector2(c.x * T + T / 2, c.y * T + T - 2);
      const sprite = this.physics.add.sprite(home.x, home.y, 'cachorro', 6).setOrigin(0.5, 1);
      sprite.body.setSize(14, 8).setOffset(9, 24);
      if (c.tint) sprite.setTint(c.tint);
      return { sprite, home, vel: c.vel, state: 'home', t: 0, cool: c.cool, lastBark: 0, path: null, repath: 0 };
    });
  }
  dogFace(d, vx, vy) {
    const s = d.sprite;
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
      s.setVelocity(0); s.anims.stop(); s.setFlipX(false); s.setFrame(6);
      if (this.riding && d.cool <= 0 && dist < 170 && Math.hypot(p.body.velocity.x, p.body.velocity.y) > 120) {
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

  // ------------------------------------------------------- fim de tarde (clima)
  buildSunset() {
    const cw = this.cameras.main.width, ch = this.cameras.main.height;
    // 1) multiplica tudo por uma cor quente
    this.add.rectangle(0, 0, cw, ch, TARDE.tint).setOrigin(0).setScrollFactor(0).setDepth(30000)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
    // 2) vinheta alaranjada -> roxa nas bordas
    const vt = this.textures.createCanvas('vinheta', cw, ch), vc = vt.getContext();
    const gr = vc.createRadialGradient(cw / 2, ch / 2, ch * 0.3, cw / 2, ch / 2, cw * 0.62);
    gr.addColorStop(0, TARDE.vigInner); gr.addColorStop(1, TARDE.vigOuter);
    vc.fillStyle = gr; vc.fillRect(0, 0, cw, ch); vt.refresh();
    this.add.image(0, 0, 'vinheta').setOrigin(0).setScrollFactor(0).setDepth(30001);
    // 3) textura de brilho pras luzes
    const gt = this.textures.createCanvas('brilho', 64, 64), gc = gt.getContext();
    const g2 = gc.createRadialGradient(32, 32, 0, 32, 32, 32);
    g2.addColorStop(0, 'rgba(255,225,150,1)'); g2.addColorStop(1, 'rgba(255,160,60,0)');
    gc.fillStyle = g2; gc.fillRect(0, 0, 64, 64); gt.refresh();
  }

  // ------------------------------------------------ luz dos pontos (mau contato)
  buildBusLight() {
    this.buses.forEach((b) => {
      b.glow = this.add.image(b.px, b.pb - 30, 'brilho').setScale(1.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(30002).setAlpha(0);
      const set = (on) => { b.img.setTexture(on ? 'ponto_aceso' : 'ponto_apagado'); b.glow.setAlpha(on ? TARDE.glowAlpha : 0); };
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
    const speed = this.riding ? RIDE : WALK;
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
    p.setVelocity(vx, vy);

    if (mv.x || mv.y) this.facing = mv.x ? (mv.x > 0 ? 'right' : 'left') : (mv.y > 0 ? 'down' : 'up');
    if (mv.x) this.sideDir = mv.x > 0 ? 'right' : 'left';

    const vertical = this.facing === 'up' || this.facing === 'down';

    if (this.riding && this.wheelie > 0.02) {
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
      if (this.riding) this.ensureMotoTex();
      if (mv.x || mv.y) {
        const kind = mv.x ? 'side' : this.facing;
        p.setFlipX(this.facing === 'left');
        if (vx || vy) p.anims.play(`${this.riding ? state.sex + '_moto' : state.sex}-${kind}`, true); else this.setIdle();
      } else this.setIdle();
    }

    // dica de interação + ação (E / A / B)
    let hint = null, target = null;
    if (this.riding) hint = 'E: descer • ESPAÇO: grau';
    else {
      if (Phaser.Math.Distance.Between(p.x, p.y, this.moto.x, this.moto.y) < 38) { hint = 'E: montar na moto'; target = 'moto'; }
      const m = this.murais.find((m) => Phaser.Geom.Rectangle.Contains(m.rect, p.x, p.y - 4));
      if (m) { hint = 'E: ver o mural'; target = m; }
    }
    setHint(state.paused ? null : hint);
    if (consumeAction() && !state.paused) {
      if (this.riding) this.mountOrDismount();
      else if (target === 'moto') this.mountOrDismount();
      else if (target) this.openMural(target);
    }

    // bola: para quando fica bem lenta
    const bv = this.ball.body.velocity; if (Math.hypot(bv.x, bv.y) < 6) this.ball.setVelocity(0);
    this.ball.setDepth(this.ball.y);

    this.dogs.forEach((d) => this.updateDog(d, dt));
    p.setDepth(p.y); this.nameLabel.setPosition(p.x, p.y - (this.riding ? 50 + 12 * this.wheelie : 46)).setVisible(true);
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