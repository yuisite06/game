// Estado compartilhado entre a interface (DOM) e o jogo (Phaser)
export const state = {
  sex: 'menino',
  name: '',
  started: false,
  paused: false,          // true durante diálogo/card
  keys: new Set(),
  lastAxis: 'x',
  stick: { x: 0, y: 0 },
  action: false,          // botão de interação (E / A) pressionado neste frame
  found: new Set(),
  totalMurais: 3,
};
export function getMove() {
  if (state.paused) return { x: 0, y: 0 };
  const k = state.keys;
  let x = (k.has('ArrowRight') || k.has('d') ? 1 : 0) - (k.has('ArrowLeft') || k.has('a') ? 1 : 0);
  let y = (k.has('ArrowDown') || k.has('s') ? 1 : 0) - (k.has('ArrowUp') || k.has('w') ? 1 : 0);
  if (x === 0 && y === 0) {
    const s = state.stick;
    if (Math.hypot(s.x, s.y) > 0.3) {
      if (Math.abs(s.x) >= Math.abs(s.y)) x = Math.sign(s.x); else y = Math.sign(s.y);
    }
  } else if (x !== 0 && y !== 0) {
    if (state.lastAxis === 'x') y = 0; else x = 0;   // andar em 4 direções, estilo FireRed
  }
  return { x, y };
}
export function consumeAction() { const a = state.action; state.action = false; return a; }
