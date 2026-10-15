// Teste unitário para o motor do Penalty Kick (penalty-kick.js)
const fs = require('fs');
const path = require('path');

let fail = 0;
function ok(cond, msg) {
  if (cond) console.log('  ok  - ' + msg);
  else { console.log('  FAIL- ' + msg); fail++; }
}

const PenaltyKick = require('./penalty-kick.js');

console.log('[1] PenaltyKick: Inicialização da Engine');
ok(!!PenaltyKick && typeof PenaltyKick.PenaltyKickGame === 'function', 'Classe PenaltyKick.PenaltyKickGame disponível');

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
    ellipse: () => {},
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
    setLineDash: () => {},
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

const canvas = criarCanvasMock();
let hudDados = null;
const game = new PenaltyKick.PenaltyKickGame(canvas, {
  onHudUpdate: (info) => { hudDados = info; }
});

ok(game.state === 'start', 'Estado inicial é start');
ok(game.goal && game.goal.width === 7.32 && game.goal.height === 2.44, 'Dimensões oficiais da trave (7.32m x 2.44m)');

console.log('\n[2] PenaltyKick: Ciclo de Partida e Projeção 3D');
game.startNewMatch();
ok(game.state === 'striker_aim', 'Partida inicia na vez do atacante (striker_aim)');
ok(game.role === 'striker', 'Função inicial é striker');
ok(game.round === 1, 'Inicia na rodada 1');

// Teste da projeção 3D
const projMarcaPenalti = game.project(0, 0, 0);
ok(projMarcaPenalti.scale > 0 && projMarcaPenalti.y > 0, 'Marca do pênalti projetada com sucesso');

const projTrave = game.project(0, 2.44, 10.5);
ok(projTrave.scale > 0 && projTrave.y < projMarcaPenalti.y, 'Travessão projetado em perspectiva correta');

console.log('\n[3] PenaltyKick: Física da Bola, Chute e Defesa');
// Executa chute mirando no centro do gol
game.kickPlayerShot(0, -150, 0.25);
ok(game.ball.inFlight === true, 'Bola entrou em voo (inFlight = true)');
ok(game.ball.vz > 0, 'Velocidade vetorial frontal Z positiva rumo ao gol');

// Avança física até a bola alcançar a linha do gol
for (let i = 0; i < 20; i++) {
  game.update(0.05);
}
ok(game.ball.z >= game.goal.z || game.ball.result !== null, 'Bola viajou até a trave e registrou resultado (' + game.ball.result + ')');

// Teste de Renderização
let renderOk = true;
try {
  game.render();
} catch (e) {
  renderOk = false;
  console.error(e);
}
ok(renderOk, 'Renderização do estádio 3D, trave e bola executou sem erros');

console.log('\n=========================================');
console.log(fail === 0 ? 'PENALTY KICK: TODOS OS TESTES PASSARAM COM SUCESSO' : fail + ' TESTES FALHARAM');
process.exit(fail === 0 ? 0 : 1);
