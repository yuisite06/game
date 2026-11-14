import { state } from './state.js';
import { loadCard } from './cards.js';

const $ = (id) => document.getElementById(id);
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// ---------- teclado ----------
const norm = (k) => (k.length === 1 ? k.toLowerCase() : k);
window.addEventListener('keydown', (e) => {
  if (document.activeElement === $('name')) { if (e.key === 'Enter') $('start').click(); return; }
  const k = norm(e.key);
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
  if (['ArrowLeft','ArrowRight','a','d'].includes(k)) state.lastAxis = 'x';
  if (['ArrowUp','ArrowDown','w','s'].includes(k)) state.lastAxis = 'y';
  state.keys.add(k);
  if (!e.repeat) {
    if (k === ' ') pressAction('space');                       // espaço: interage a pé, dá GRAU de moto
    else if (k === 'e' || k === 'Enter') pressAction('e');     // E: interage / desce da moto
  }
});
window.addEventListener('keyup', (e) => state.keys.delete(norm(e.key)));
window.addEventListener('blur', () => { state.keys.clear(); state.btnA = false; });

// ---------- ação (E / ESPAÇO / botões A e B) ----------
let dialogDone = null, dialogLines = [], dialogIdx = 0;
export function pressAction(src = 'e') {
  if (!$('dialog').classList.contains('hidden')) return nextDialog();
  if (!$('card').classList.contains('hidden')) return;
  if (src === 'space' && state.riding) return;     // de moto, espaço/A = grau (o jogo lê a tecla segurada)
  state.action = true;
}

// o jogo avisa quando monta/desce da moto (mostra ou esconde o botão B no celular)
export function setRidingUI(riding) {
  state.riding = riding;
  const b = $('btnB'); if (b) b.classList.toggle('hidden', !(isTouch && riding));
}

// ---------- diálogo estilo GBA ----------
export function showDialog(lines, done) {
  dialogLines = lines; dialogIdx = 0; dialogDone = done || null;
  state.paused = true; $('dialog').classList.remove('hidden'); typeLine();
}
let typer = null;
function typeLine() {
  const full = dialogLines[dialogIdx]; const el = $('dialog-text'); let i = 0;
  clearInterval(typer); el.textContent = '';
  typer = setInterval(() => { el.textContent = full.slice(0, ++i); if (i >= full.length) clearInterval(typer); }, 22);
}
function nextDialog() {
  const full = dialogLines[dialogIdx];
  if ($('dialog-text').textContent.length < full.length) { clearInterval(typer); $('dialog-text').textContent = full; return; }
  if (++dialogIdx < dialogLines.length) return typeLine();
  $('dialog').classList.add('hidden'); state.paused = false;
  const cb = dialogDone; dialogDone = null; if (cb) cb();
}
$('dialog').addEventListener('pointerdown', (e) => { e.preventDefault(); nextDialog(); });

// ---------- HUD ----------
export function setHint(text) {
  const h = $('hint'); if (!text) return h.classList.add('hidden');
  let t = text;
  if (isTouch) t = state.riding ? text.replace('E:', 'B:').replace('ESPAÇO:', 'A:') : text.replace(/^E:/, 'A:');
  h.textContent = t; h.classList.remove('hidden');
}
export function updateHud() {
  $('hud-name').textContent = state.name;
  $('hud-murais').textContent = `MURAIS ${state.found.size}/${state.totalMurais}`;
}

// ---------- card do mural ----------
export async function openMural(muralId, onClose) {
  const c = await loadCard(muralId); if (!c) return onClose && onClose();
  state.paused = true;
  $('card-title').textContent = c.title; $('card-artist').textContent = c.artist; $('card-text').textContent = c.text;
  const quiz = $('card-quiz'), opts = $('card-options'), fb = $('card-feedback');
  opts.innerHTML = ''; fb.textContent = '';
  if (c.question && c.options) {
    quiz.classList.remove('hidden'); $('card-question').textContent = c.question;
    c.options.forEach((o, i) => {
      const b = document.createElement('button'); b.textContent = o;
      b.onclick = () => {
        const ok = i === c.answer; b.classList.add(ok ? 'ok' : 'no');
        fb.textContent = ok ? 'Mandou bem! +1 ponto.' : 'Quase! Tenta de novo.';
        if (ok) [...opts.children].forEach((x) => (x.disabled = true));
      };
      opts.appendChild(b);
    });
  } else quiz.classList.add('hidden');
  $('card').classList.remove('hidden');
  $('card-close').onclick = () => { $('card').classList.add('hidden'); state.paused = false; onClose && onClose(); };
}

// ---------- joystick + botões A e B ----------
function setupTouch() {
  if (!isTouch) return;
  $('touch').classList.remove('hidden');
  const stick = $('stick'), knob = $('knob'); let id = null;
  const move = (e) => {
    const r = stick.getBoundingClientRect(); const R = r.width / 2;
    let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R); const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / R, ny = dy / R; state.stick = { x: nx, y: ny };
    state.lastAxis = Math.abs(nx) >= Math.abs(ny) ? 'x' : 'y';
  };
  const end = () => { id = null; knob.style.transform = ''; state.stick = { x: 0, y: 0 }; };
  stick.addEventListener('pointerdown', (e) => { id = e.pointerId; stick.setPointerCapture(id); move(e); e.preventDefault(); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
  stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);

  // A: interage a pé / segura pra dar GRAU de moto
  const A = $('btnA');
  A.addEventListener('pointerdown', (e) => {
    e.preventDefault(); try { A.setPointerCapture(e.pointerId); } catch (_) {}
    state.btnA = true; pressAction('space');
  });
  const upA = () => { state.btnA = false; };
  A.addEventListener('pointerup', upA); A.addEventListener('pointercancel', upA); A.addEventListener('lostpointercapture', upA);

  // B: descer da moto (só aparece de moto)
  const B = $('btnB');
  if (B) B.addEventListener('pointerdown', (e) => { e.preventDefault(); pressAction('e'); });
}

// ---------- tela inicial ----------
export function setupTitle(onStart) {
  let sex = 'menino';
  const saved = JSON.parse(localStorage.getItem('pdq') || '{}');
  if (saved.name) $('name').value = saved.name;
  if (saved.sex) sex = saved.sex;
  const chars = [...document.querySelectorAll('.char')];
  const paint = () => chars.forEach((c) => c.classList.toggle('selected', c.dataset.sex === sex));
  chars.forEach((c) => c.addEventListener('click', () => { sex = c.dataset.sex; paint(); }));
  paint();
  $('start').addEventListener('click', () => {
    const name = $('name').value.trim() || (sex === 'menino' ? 'Mano' : 'Mina');
    state.sex = sex; state.name = name; state.started = true;
    localStorage.setItem('pdq', JSON.stringify({ sex, name }));
    $('title').classList.add('hidden'); $('hud').classList.remove('hidden'); updateHud(); setupTouch();
    onStart();
  });
}