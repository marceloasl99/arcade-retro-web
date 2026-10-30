// Testes automatizados do motor The Wall (the-wall.js)
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const codigo = fs.readFileSync(path.join(__dirname, 'the-wall.js'), 'utf8');
const store = {};
const VALORES_ESCANINHO = [1000, 500, 250, 100, 50];

function novoCanvas() {
  const ctx = {
    fillRect() {}, strokeRect() {}, fillText() {}, beginPath() {}, moveTo() {}, lineTo() {},
    closePath() {}, fill() {}, stroke() {}, arc() {}, save() {}, restore() {}, translate() {}
  };
  return { width: 480, height: 640, getContext: () => ctx };
}

function novoJogo() {
  Object.keys(store).forEach(k => delete store[k]);
  let quadros = 0;
  const sandbox = {
    console, Math, Date, String, Number, Array, Object, JSON, parseInt, isNaN,
    Uint8Array, Uint16Array, Float32Array, Proxy, setTimeout: () => 0,
    // Deixa o laço de desenho rodar algumas vezes para exercitar o render
    requestAnimationFrame: cb => { if (quadros++ < 3) cb(0); },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(codigo, sandbox, { filename: 'the-wall.js' });
  const jogo = sandbox.criarTheWall(novoCanvas(), {});
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
const b = J._teste.bolinha();
testar(J.dados().estado === 'title', 'inicia no estado de título');
testar(J.dados().pontos === 0, 'pontuação inicial zerada');
testar(J.dados().bolasRestantes === 10, 'cada partida tem 10 bolinhas');
testar(J._teste.pinos().length > 90, `tabuleiro com grade de pinos (${J._teste.pinos().length} pinos e divisórias)`);

console.log('\n[2] Início de Partida e Marcador');
J.acao('comecar');
testar(J.dados().estado === 'playing', 'estado muda para playing ao começar');
const marcadorIni = J._teste.marcador();
J.entrada.direita(true);
for (let i = 0; i < 60; i++) J._teste.passo(1 / 60);
J.entrada.direita(false);
testar(J._teste.marcador() > marcadorIni, 'marcador de queda se move para a direita');
testar(J._teste.marcador() <= 444 + 1e-9, 'marcador respeita o limite da direita');

console.log('\n[3] Soltar a Bolinha');
J.entrada.disparar(true);
testar(b.ativa === true, 'bolinha é solta do topo ao disparar');
testar(J.dados().bolasRestantes === 9, 'soltar uma bolinha desconta uma das 10');
J.entrada.disparar(true);
testar(J.dados().bolasRestantes === 9, 'enquanto uma bolinha cai, não solta outra');

console.log('\n[4] Queda até um Escaninho');
let passos = 0;
while (b.ativa && passos < 60 * 30) {
  J._teste.passo(1 / 60);
  passos++;
}
testar(b.ativa === false, `bolinha pousa em algum escaninho (${(passos / 60).toFixed(1)} s)`);
testar(VALORES_ESCANINHO.indexOf(J.dados().pontos) >= 0, `pontuação é o valor de um escaninho (${J.dados().pontos} pts)`);
testar(J.dados().bolasRestantes === 9, 'depois de pousar, a próxima bolinha continua disponível');

console.log('\n[5] Ricochete em um Pino');
const pino = J._teste.pinos()[0];
b.ativa = true;
b.x = pino.x;
b.y = pino.y - 9;
b.vx = 0;
b.vy = 200;
J._teste.passo(1 / 600);
const distancia = Math.hypot(b.x - pino.x, b.y - pino.y);
testar(distancia >= 10 - 1e-6, 'bolinha é empurrada para fora do pino');
testar(b.vy < 0, 'bolinha quica para cima depois de bater no pino');

console.log('\n[6] Fim de Jogo e Recorde Salvo');
b.ativa = false;
J._teste.definirBolas(1);
J.entrada.disparar(true);
testar(J.dados().bolasRestantes === 0, 'última bolinha foi solta');
passos = 0;
while (b.ativa && passos < 60 * 30) {
  J._teste.passo(1 / 60);
  passos++;
}
testar(J.dados().estado === 'gameover', 'fim de jogo quando a última bolinha pousa');
testar(Number(store['the_wall_top']) === J.dados().recorde && J.dados().recorde > 0, 'recorde gravado no navegador');

console.log('\n[7] Pausa e Som');
J.acao('pausa');
testar(J.dados().pausado === false, 'pausa não tem efeito na tela de fim de jogo');
J.acao('reiniciar');
J.acao('pausa');
testar(J.dados().pausado === true, 'jogo pausado');
J.acao('pausa');
testar(J.dados().pausado === false, 'jogo despausado');
const somAntes = J.dados().som;
J.acao('som');
testar(J.dados().som !== somAntes, 'alternância de áudio funcionando');

console.log('\n=========================================');
if (falhas === 0) {
  console.log('TODOS OS TESTES DO THE WALL PASSARAM!');
} else {
  console.log(`FALHAS: ${falhas}`);
  process.exit(1);
}
