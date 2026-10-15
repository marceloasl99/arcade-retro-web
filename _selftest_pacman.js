// Teste unitário e de integração para o motor do Pac-Man (pacman.js)
const fs = require('fs');
const path = require('path');

let fail = 0;
function ok(cond, msg) {
  if (cond) console.log('  ok  - ' + msg);
  else { console.log('  FAIL- ' + msg); fail++; }
}

const Pacman = require('./pacman.js');

console.log('[1] Pacman: Inicialização da Engine e Grid Sem Áreas Mortas');
ok(!!Pacman && typeof Pacman.PacmanGame === 'function', 'Classe Pacman.PacmanGame disponível');
ok(Pacman.COLS === 28 && Pacman.ROWS === 30, 'Dimensões autênticas 28 cols x 30 rows (sem faixas pretas mortas)');
ok(Array.isArray(Pacman.LEVEL_CONFIGS) && Pacman.LEVEL_CONFIGS.length === 10, 'Sistema de progressão com 10 estágios definidos');

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
    height: 600,
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
ok(game.width === 560 && game.height === 600, 'Canvas ajustado para 560x600 (proporção 0.9333)');
ok(game.grid.length === 30 && game.grid[0].length === 28, 'Matriz do grid 30x28 sem linhas vazias excedentes');
ok(game.dotsRemaining >= 230, 'Labirinto populado com pontos autênticos (dots = ' + game.dotsRemaining + ')');

console.log('\n[2] Pacman: Ciclo de Jogo, Pac-Man e os 4 Fantasmas');
game.startNewGame();
ok(game.state === 'playing', 'Jogo inicia em playing');
ok(game.lives === 3, 'Inicia com 3 vidas');
ok(game.level === 1, 'Inicia na fase 1');
ok(game.currentConfig.fruit.symbol === '🍒', 'Fase 1 possui bônus de Cereja (100 PTS)');
ok(hudDados && hudDados.fruitSymbol === '🍒' && (hudDados.stageTheme.includes('AZUL') || hudDados.stageTheme.includes('BLUE')), 'HUD notificado com frutas e tema da fase 1');
ok(game.ghosts.length === 4, '4 fantasmas presentes no jogo');

// Teste de posições de spawn
ok(game.pacman.x === 13.5 && game.pacman.y === 22, 'Pac-Man spawna em posição livre x=13.5, y=22');
const blinky = game.ghosts.find(g => g.id === 'blinky');
ok(blinky && blinky.x === 13.5 && blinky.y === 11 && !blinky.house, 'Blinky spawna fora da casa em y=11');

console.log('\n[3] Pacman: Movimentação, Alimentação e Túnel de Fuga');
const dotsAntes = game.dotsRemaining;
const scoreAntes = game.score;

// Posicionar Pac-Man diretamente sobre um ponto (linha 20, col 1)
game.pacman.x = 1.0;
game.pacman.y = 20.0;
game.update(0.1);

ok(game.dotsRemaining < dotsAntes, 'Pac-Man consome ponto no labirinto');
ok(game.score > scoreAntes, 'Pontuação incrementa ao comer ponto');

// Teste do Túnel de fuga (linha 14)
game.pacman.x = -0.6;
game.pacman.y = 14.0;
game.pacman.dir = Pacman.DIR_LEFT;
game.update(0.05);
ok(game.pacman.x > 25, 'Pac-Man faz wrap lateral perfeito no túnel (x=' + game.pacman.x + ')');

console.log('\n[4] Pacman: Revisão de Todas as Fases (Progressão de Nível)');
// Testar transição para Fases 2, 3, 5, 8 e 10
const estagiosTestar = [
  { lvl: 2, fruit: '🍓', pts: 300 },
  { lvl: 3, fruit: '🍊', pts: 500 },
  { lvl: 5, fruit: '🍎', pts: 700 },
  { lvl: 7, fruit: '🍈', pts: 1000 },
  { lvl: 8, fruit: '🚀', pts: 2000 },
  { lvl: 9, fruit: '🔔', pts: 3000 },
  { lvl: 10, fruit: '🗝️', pts: 5000 }
];

estagiosTestar.forEach(t => {
  game.initLevel(t.lvl);
  const cfg = game.currentConfig;
  ok(cfg.fruit.symbol === t.fruit && cfg.fruit.points === t.pts,
     `Fase ${t.lvl}: Fruta ${cfg.fruit.symbol} ${cfg.fruit.name} vale ${cfg.fruit.points} pts`);
  ok(cfg.wallFill && cfg.wallStroke, `Fase ${t.lvl}: Tema de cor único configurado (${cfg.themeName})`);
});

console.log('\n[5] Pacman: Cruise Elroy e Renderização');
game.initLevel(1);
const blinkyInitSpeed = game.ghosts.find(g => g.id === 'blinky').speed;
game.dotsRemaining = 8; // Menos de 10 dots ativa Cruise Elroy 2
game.update(0.05);
const blinkyElroySpeed = game.ghosts.find(g => g.id === 'blinky').speed;
ok(blinkyElroySpeed > blinkyInitSpeed, 'Cruise Elroy ativa aumento de velocidade no Blinky com poucos pontos');

// Teste de Renderização
let renderOk = true;
try {
  game.render();
} catch (e) {
  renderOk = false;
  console.error(e);
}
ok(renderOk, 'Renderização completa com temas neon por fase executou sem erros');

console.log('\n=========================================');
console.log(fail === 0 ? 'PACMAN: TODOS OS TESTES PASSARAM COM SUCESSO' : fail + ' TESTES FALHARAM');
process.exit(fail === 0 ? 0 : 1);
