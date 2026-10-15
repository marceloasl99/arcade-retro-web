// Teste unitário para o motor do Defender (defender.js)
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let fail = 0;
function ok(cond, msg) {
  if (cond) console.log('  ok  - ' + msg);
  else { console.log('  FAIL- ' + msg); fail++; }
}

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
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
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
    width: 800,
    height: 600,
    focus: () => {},
    addEventListener: () => {}
  };
}

const Defender = require('./defender.js');

console.log('\n[1] Defender: Inicialização da Engine');
ok(!!Defender && typeof Defender.DefenderGame === 'function', 'Classe Defender.DefenderGame disponível');

const canvas = criarCanvasMock();
let hudDados = null;
const game = new Defender.DefenderGame(canvas, {
  onHudUpdate: (info) => { hudDados = info; }
});

ok(game.state === 'start', 'Estado inicial é start');
ok(game.mundoLargura === 4800, 'Largura do mundo é 4800 wrap-around');
ok(game.terreno && game.terreno.length > 50, 'Terreno montanhoso gerado proceduralmente');

console.log('\n[2] Defender: Ciclo de Início de Missão e Entidades');
game.startNewGame();
ok(game.state === 'playing', 'Jogo inicia em playing');
ok(game.wave === 1, 'Primeira onda é 1');
ok(game.vidas === 3, 'Inicia com 3 vidas');
ok(game.smartBombs === 3, 'Inicia com 3 smart bombs');
ok(game.humanos.length === 10, 'Inicia com 10 humanóides no solo');
ok(game.aliens.length > 0, 'Alienígenas spawnados na wave 1');

console.log('\n[3] Defender: Atualização física, disparos e wrap-around');
const posInicialX = game.jogador.x;
game.teclas.thrust = true;
game.atualizar(0.1);
ok(game.jogador.vx !== 0, 'Propulsão (thrust) gera aceleração horizontal na nave');

game.teclas.disparo = true;
game.atualizar(0.05);
ok(game.lasers.length > 0, 'Disparo gera laser');

// Teste de Smart Bomb
game.inimigos.push({
  tipo: "lander",
  x: game.cameraX + 200,
  y: 200,
  vx: 0,
  vy: 0,
  largura: 22,
  altura: 18,
  pontos: 150,
  vida: 1
});
const qtdAliensAntes = game.aliens.length;
game.teclas.smartBomb = true;
game.atualizar(0.05);
ok(game.smartBombs === 2, 'Smart bomb decrementa estoque');
ok(game.aliens.length < qtdAliensAntes, 'Smart bomb aniquila alienígenas na tela');

// Teste de Renderização sem erros
let desenhouOk = true;
try {
  game.desenhar();
} catch (e) {
  desenhouOk = false;
  console.error(e);
}
ok(desenhouOk, 'Renderização do canvas (scanner radar, estrelas, terreno, HUD) executou sem exceções');

console.log('\n=========================================');
console.log(fail === 0 ? 'DEFENDER: TODOS OS TESTES PASSARAM COM SUCESSO' : fail + ' TESTES FALHARAM');
process.exit(fail === 0 ? 0 : 1);
