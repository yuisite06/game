import Phaser from 'phaser';
import { GameScene } from './game.js';
import { setupTitle } from './ui.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 480,           // 15 x 10 tiles de 32px (visão estilo FireRed)
  height: 320,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#0d0818',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [GameScene],
});

// o jogo carrega nos bastidores; o mundo só "acorda" depois da tela inicial
setupTitle(() => game.events.emit('start-game'));
window.__game = game;   // útil pra depurar no console
