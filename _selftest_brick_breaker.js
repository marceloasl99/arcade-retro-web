// Testes automatizados do motor Quebra-Tijolos (brick-breaker.js)
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const codigo = fs.readFileSync(path.join(__dirname, 'brick-breaker.js'), 'utf8');
const store = {};

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
  vm.runInContext(codigo, sandbox, { filename: 'brick-breaker.js' });
  const jogo = sandbox.criarBrickBreaker(novoCanvas(), {});
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
const raq = J._teste.raquete();
testar(J.dados().estado === 'title', 'inicia no estado de título');
testar(J.dados().pontos === 0 && J.dados().vidas === 3 && J.dados().fase === 1, 'pontos 0, 3 bolinhas, fase 1');
testar(J._teste.tijolos().length === 48, 'primeira fase com 48 tijolos (8 colunas x 6 fileiras)');

console.log('\n[2] Início de Partida e Raquete');
J.acao('comecar');
testar(J.dados().estado === 'playing', 'estado muda para playing ao começar');
testar(b.presa === true, 'bolinha começa presa na raquete');
const xIni = raq.x;
J.entrada.esquerda(true);
for (let i = 0; i < 20; i++) J._teste.passo(1 / 60);
J.entrada.esquerda(false);
testar(raq.x < xIni, `raquete se move para a esquerda (x: ${xIni} -> ${raq.x.toFixed(1)})`);
J.entrada.direita(true);
for (let i = 0; i < 300; i++) J._teste.passo(1 / 60);
J.entrada.direita(false);
testar(raq.x + raq.w <= 480 - 16 + 1e-9, 'raquete respeita o limite direito da arena');

console.log('\n[3] Lançamento da Bolinha');
J.entrada.disparar(true);
testar(b.presa === false && b.vy < 0, 'bolinha é solta para cima ao disparar');

console.log('\n[4] Colisão com Tijolo');
// Tijolo da última fileira, coluna da esquerda: nada abaixo dele para atrapalhar
const t = J._teste.tijolos()[40];
b.presa = false;
b.x = t.x + t.w / 2;
b.y = t.y + t.h + 10;
b.vx = 0;
b.vy = -300;
const pontosAntes = J.dados().pontos;
const qtdAntes = J._teste.tijolos().length;
for (let i = 0; i < 10; i++) J._teste.passo(1 / 60);
testar(J._teste.tijolos().length === qtdAntes - 1, 'tijolo destruído pela bolinha');
testar(J.dados().pontos === pontosAntes + t.pontos, `pontuação do tijolo creditada (+${t.pontos} pts)`);
testar(b.vy > 0, 'bolinha rebate para baixo depois de bater no tijolo');

console.log('\n[5] Paredes Laterais');
b.x = 18;
b.y = 300;
b.vx = -200;
b.vy = 0;
J._teste.passo(1 / 60);
testar(b.vx > 0, 'parede esquerda rebate a bolinha');

console.log('\n[6] Bolinha Perdida');
const vidasAntes = J.dados().vidas;
b.presa = false;
b.x = 240;
b.y = 650;
b.vx = 0;
b.vy = 300;
J._teste.passo(1 / 60);
testar(J.dados().vidas === vidasAntes - 1, 'bolinha perdida desconta uma vida');
testar(b.presa === true, 'depois de perder a bolinha, ela volta presa na raquete');

console.log('\n[7] Fim de Jogo e Recorde Salvo');
J._teste.definirVidas(1);
b.presa = false;
b.x = 240;
b.y = 650;
b.vx = 0;
b.vy = 300;
J._teste.passo(1 / 60);
testar(J.dados().estado === 'gameover', 'fim de jogo ao perder a última bolinha');
testar(store['brick_breaker_top'] === '20', 'recorde gravado no navegador (20 pts da fileira de baixo)');

console.log('\n[8] Fase Limpa e Próxima Fase');
J.acao('comecar');
const arr = J._teste.tijolos();
const ultimo = arr[40];
arr.length = 0;
arr.push(ultimo);
b.presa = false;
b.x = ultimo.x + ultimo.w / 2;
b.y = ultimo.y + ultimo.h + 10;
b.vx = 0;
b.vy = -300;
for (let i = 0; i < 10; i++) J._teste.passo(1 / 60);
testar(J.dados().estado === 'faselimpa', 'ao limpar a parede, entra no estado de fase limpa');
J._teste.passo(2.0);
testar(J.dados().estado === 'playing' && J.dados().fase === 2, 'depois do intervalo começa a fase 2');
testar(J._teste.tijolos().length === 24, 'fase 2 monta o desenho xadrez com 24 tijolos');

console.log('\n[9] Pausa e Som');
J.acao('pausa');
testar(J.dados().pausado === true, 'jogo pausado');
J.acao('pausa');
testar(J.dados().pausado === false, 'jogo despausado');
const somAntes = J.dados().som;
J.acao('som');
testar(J.dados().som !== somAntes, 'alternância de áudio funcionando');

console.log('\n=========================================');
if (falhas === 0) {
  console.log('TODOS OS TESTES DO QUEBRA-TIJOLOS PASSARAM!');
} else {
  console.log(`FALHAS: ${falhas}`);
  process.exit(1);
}
