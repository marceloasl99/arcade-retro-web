// Teste unitário para o motor do Pac-Man (pacman.js)
const fs = require('fs');
const path = require('path');

let fail = 0;
function ok(cond, msg) {
  if (cond) console.log('  ok  - ' + msg);
  else { console.log('  FAIL- ' + msg); fail++; }
}

const Pacman = require('./pacman.js');

console.log('[1] Pacman: Inicialização da Engine');
ok(!!Pacman && typeof Pacman.PacmanGame === 'function', 'Classe Pacman.PacmanGame disponível');
ok(Pacman.COLS === 28 && Pacman.ROWS === 36, 'Dimensões autênticas do labirinto (28 cols x 36 rows)');

// Simulação de Mock Canvas 2D
function criarCanvasMock() {
  const ctx = {
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    rect: () => {},
    fill: () => {},
    stroke: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    clearRect: () => {},
    fillText: () => {},
    strokeText: () => {},
    measureText: (txt) => ({ width: (txt || '').length * 8 }),
    setTransform: () => {},
    scale: () => {},
    translate: () => {},
    rotate: () => {},
    fillStyle: '#000',
    strokeStyle: '#fff',
    lineWidth: 1,
    font: '10px monospace',
    textAlign: 'left',
    textBaseline: 'top',
    shadowColor: 'transparent',
    shadowBlur: 0
  };

  return {
    getContext: () => ctx,
    width: 560,
    height: 720,
    focus: () => {},
    addEventListener: () => {}
  };
}

const canvas = criarCanvasMock();
let hudDados = null;
const game = new Pacman.PacmanGame(canvas, {
  onHudUpdate: (info) => { hudDados = info; }
});

ok(game.state === 'start', 'Estado inicial é start');
ok(game.grid.length === 36 && game.grid[0].length === 28, 'Matriz do grid gerada com 36x28');
ok(game.dotsRemaining > 200, 'Labirinto populado com pontos (> 200 dots)');

console.log('\n[2] Pacman: Ciclo de Jogo, Pac-Man e os 4 Fantasmas');
game.startNewGame();
ok(game.state === 'playing', 'Jogo inicia em playing');
ok(game.lives === 3, 'Inicia com 3 vidas');
ok(game.ghosts.length === 4, '4 fantasmas presentes no jogo');

const ghostIds = game.ghosts.map(g => g.id);
ok(ghostIds.includes('blinky') && ghostIds.includes('pinky') && ghostIds.includes('inky') && ghostIds.includes('clyde'),
   'Todos os 4 fantasmas clássicos presentes (Blinky, Pinky, Inky, Clyde)');

console.log('\n[3] Pacman: Movimentação, Alimentação e IA');
const dotsAntes = game.dotsRemaining;
const scoreAntes = game.score;

// Posicionar Pac-Man diretamente sobre um ponto (linha 22, col 1)
game.pacman.x = 1.0;
game.pacman.y = 22.0;
game.update(0.1);

ok(game.dotsRemaining < dotsAntes, 'Pac-Man consome ponto no labirinto');
ok(game.score > scoreAntes, 'Pontuação incrementa ao comer ponto');

// Teste de Energizer & Frightened Mode
game.triggerFrightenedMode();
ok(game.frightenedTimer > 0, 'Frightened timer ativado');
ok(game.ghosts.every(g => g.mode === 'frightened' || g.mode === 'eaten'), 'Todos os fantasmas entram em modo vulnerável (frightened)');

// Teste de Renderização
let renderOk = true;
try {
  game.render();
} catch (e) {
  renderOk = false;
  console.error(e);
}
ok(renderOk, 'Renderização completa em Canvas 2D executou sem erros');

console.log('\n=========================================');
console.log(fail === 0 ? 'PACMAN: TODOS OS TESTES PASSARAM COM SUCESSO' : fail + ' TESTES FALHARAM');
process.exit(fail === 0 ? 0 : 1);
