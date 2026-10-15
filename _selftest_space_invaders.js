// Testes automatizados do motor Space Invaders (space-invaders.js)
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const codigo = fs.readFileSync(path.join(__dirname, 'space-invaders.js'), 'utf8');

function novoJogo() {
  const store = {};
  const sandbox = {
    console, Math, Date, String, Number, Array, Object, JSON, parseInt, isNaN,
    Uint8Array, Uint16Array, Float32Array, Proxy, setTimeout: () => 0, requestAnimationFrame: () => 0,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(codigo, sandbox, { filename: 'space-invaders.js' });
  const canvas = {
    width: 480, height: 640, clientWidth: 480, clientHeight: 640, style: {},
    getContext: () => ({
      fillRect: () => {}, strokeRect: () => {}, fillText: () => {},
      beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {},
      save: () => {}, restore: () => {}, translate: () => {}
    })
  };
  const jogo = sandbox.criarSpaceInvaders(canvas, {});
  jogo.iniciar();
  return jogo;
}

let falhas = 0;
function testar(cond, msg) {
  if (cond) {
    console.log('  ok  - ' + msg);
  } else {
    console.log('  FALHA - ' + msg);
    falhas++;
  }
}

console.log('\n[1] Inicialização e Estrutura');
const J = novoJogo();
const dados = J.dados();
testar(dados.estado === 'title', 'inicia no estado de título');
testar(dados.pontos === 0, 'pontuação inicial zerada');
testar(dados.vidas === 3, 'inicia com 3 vidas');
testar(dados.onda === 1, 'inicia na onda 1');

console.log('\n[2] Início de Partida e 55 Invasores');
J.acao('comecar');
const dJogando = J.dados();
testar(dJogando.estado === 'playing', 'estado muda para playing ao começar');
const aliens = J._teste.aliens();
testar(aliens.length === 55, 'frota completa de 55 invasores (5 fileiras x 11 colunas)');

const squids = aliens.filter(a => a.tipo === 2);
const crabs = aliens.filter(a => a.tipo === 1);
const octos = aliens.filter(a => a.tipo === 0);
testar(squids.length === 11 && squids[0].pontos === 30, 'fileira superior: 11 Squids (30 pts cada)');
testar(crabs.length === 22 && crabs[0].pontos === 20, 'fileiras do meio: 22 Crabs (20 pts cada)');
testar(octos.length === 22 && octos[0].pontos === 10, 'fileiras inferiores: 22 Octopuses (10 pts cada)');

console.log('\n[3] 4 Bunkers de Defesa e Dano por Projétil');
const bunkers = J._teste.bunkers();
testar(bunkers.length > 50, `barreiras de proteção montadas com ${bunkers.length} blocos destrutíveis`);

// Encontra um bloco na base do bunker
const p = J._teste.player();
const blocoBase = bunkers.find(b => b.y >= 490);
p.x = blocoBase.x - p.w / 2 + blocoBase.w / 2;
p.cooldown = 0;
const hpTotalAntes = bunkers.reduce((acc, b) => acc + b.hp, 0);
J.entrada.disparar(true);
J.entrada.disparar(false);
for (let i = 0; i < 30; i++) J._teste.passo(1 / 60);
const hpTotalDepois = bunkers.reduce((acc, b) => acc + b.hp, 0);
testar(hpTotalDepois < hpTotalAntes, 'projétil corrói o bunker de proteção');

console.log('\n[4] Movimentação do Canhão e Limites da Tela');
const xIni = p.x;
J.entrada.esquerda(true);
for (let i = 0; i < 30; i++) J._teste.passo(1 / 60);
J.entrada.esquerda(false);
testar(p.x < xIni, `canhão se move para a esquerda (x: ${xIni} -> ${p.x.toFixed(1)})`);

// Anda muito para a esquerda para testar limite
for (let i = 0; i < 150; i++) {
  J.entrada.esquerda(true);
  J._teste.passo(1 / 60);
}
J.entrada.esquerda(false);
testar(p.x >= 16, `canhão respeita o limite esquerdo da tela (x: ${p.x})`);

console.log('\n[5] Disparo do Canhão e Colisão com Invasor');
// Posiciona o canhão logo abaixo do alienígena inferior da coluna mais à esquerda
// Remove temporariamente qualquer bloco de bunker no caminho da coluna 0
const alienAlvo = aliens.find(a => a.row === 4 && a.col === 0 && a.vivo);
p.x = alienAlvo.x + (alienAlvo.w - p.w) / 2;
p.y = 574;
p.cooldown = 0;
// Limpa blocos de bunker nesta coluna de teste para testar impacto no alien
const bks = J._teste.bunkers();
for (let i = bks.length - 1; i >= 0; i--) {
  if (Math.abs(bks[i].x - alienAlvo.x) < 20) bks.splice(i, 1);
}

const pontosAntes = J.dados().pontos;
J.entrada.disparar(true);
J.entrada.disparar(false);
testar(J._teste.tirosPlayer().length === 1, 'projétil laser disparado pelo canhão');

// Avança física até o tiro atingir o alien
for (let i = 0; i < 60; i++) J._teste.passo(1 / 60);
testar(!alienAlvo.vivo, 'invasor atingido e eliminado');
testar(J.dados().pontos === pontosAntes + alienAlvo.pontos, `pontuação creditada (+${alienAlvo.pontos} pts)`);

console.log('\n[6] Colisão com Disco Voador (UFO)');
const ufo = J._teste.criarUfo();
ufo.x = 24;
ufo.vel = 0; // Fixa temporariamente para teste de impacto
p.x = ufo.x + (ufo.w - p.w) / 2;
p.cooldown = 0;
// Limpa tiros
J._teste.tirosPlayer().length = 0;
const ptsAntesUfo = J.dados().pontos;
J.entrada.disparar(true);
J.entrada.disparar(false);
for (let i = 0; i < 80; i++) J._teste.passo(1 / 60);
testar(J._teste.ufo() === null, 'UFO destruído pelo tiro');
testar(J.dados().pontos >= ptsAntesUfo + 50, 'pontuação bônus do UFO creditada');

console.log('\n[7] Pausa e Som');
J.acao('pausa');
testar(J.dados().pausado === true, 'jogo pausado');
J.acao('pausa');
testar(J.dados().pausado === false, 'jogo despausado');

const somAntes = J.dados().som;
J.acao('som');
testar(J.dados().som !== somAntes, 'alternância de áudio funcionando');

console.log('\n[8] Vidas e Fim de Jogo');
J._teste.definirVidas(1);
// Simula projétil alien atingindo o jogador
p.invulneravel = 0;
p.morrendo = 0;
J._teste.tirosAlien().push({
  x: p.x + 5,
  y: p.y - 4,
  w: 3,
  h: 8,
  vy: 200
});
J._teste.passo(1 / 60); // colide
testar(p.morrendo > 0, 'jogador entra em animação de destruição ao ser atingido');
for (let i = 0; i < 90; i++) J._teste.passo(1 / 60);
testar(J.dados().estado === 'gameover', 'fim de jogo após esgotar as vidas');

console.log('\n=========================================');
if (falhas === 0) {
  console.log('TODOS OS TESTES DO SPACE INVADERS PASSARAM!');
} else {
  console.log(`FALHAS: ${falhas}`);
  process.exit(1);
}
