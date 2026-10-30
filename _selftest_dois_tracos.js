// Testes automatizados do motor Dois Traços (dois-tracos.js)
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const codigo = fs.readFileSync(path.join(__dirname, 'dois-tracos.js'), 'utf8');
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
  vm.runInContext(codigo, sandbox, { filename: 'dois-tracos.js' });
  const jogo = sandbox.criarDoisTracos(novoCanvas(), {});
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
const T = J._teste.tracos();
const yInicial = T.esq.y;
testar(J.dados().estado === 'title', 'inicia no estado de título');
testar(J.dados().placar[0] === 0 && J.dados().placar[1] === 0, 'placar começa em 0 x 0');
testar(J.dados().modo === 'duplo', 'modo padrão é 2 jogadores');

console.log('\n[2] Início e Saque');
J.acao('comecar');
testar(J.dados().estado === 'playing', 'estado muda para playing ao começar');
J._teste.passo(1.1);
testar(b.vx !== 0, 'depois do tempo de saque a bolinha entra em jogo');

console.log('\n[3] Controle dos Traços');
// Deixa a bolinha parada no centro para os testes de traço não mudarem o placar
b.vx = 0;
b.vy = 0;
b.x = 240;
b.y = 352;
J.entrada.cima('esq', true);
J._teste.passo(0.1);
J.entrada.cima('esq', false);
testar(T.esq.y < yInicial, 'traço esquerdo sobe com o controle W');
J.entrada.cima('esq', true);
J._teste.passo(10);
J.entrada.cima('esq', false);
testar(T.esq.y === 64, 'traço esquerdo respeita o limite de cima da quadra');
J.entrada.baixo('dir', true);
J._teste.passo(0.1);
J.entrada.baixo('dir', false);
testar(T.dir.y > yInicial, 'traço direito desce com a seta para baixo');

console.log('\n[4] Ponto Marcado e Saque do Perdedor');
b.x = -5;
b.y = 300;
b.vx = -200;
b.vy = 0;
J._teste.passo(1 / 60);
testar(J._teste.placar()[1] === 1, 'bolinha que escapa pela esquerda dá ponto ao jogador da direita');
testar(J.dados().estado === 'playing', 'depois de um ponto, a partida continua');
J._teste.passo(1.1);
testar(b.vx < 0, 'saque depois do ponto vai para o lado de quem perdeu');

console.log('\n[5] Rebatida no Traço Esquerdo');
b.x = 24 + 10 + 7 + 2;
b.y = T.esq.y + 48;
b.vx = -200;
b.vy = 0;
J._teste.passo(1 / 60);
testar(b.vx > 0, 'traço esquerdo rebate a bolinha para a direita');
testar(J.dados().rali === 1, 'rali conta uma rebatida');
testar(store['dois_tracos_rali'] === '1', 'maior rali salvo no navegador');

console.log('\n[6] Modo Contra a CPU');
J.acao('cpu');
testar(J.dados().modo === 'cpu', 'modo contra a CPU ativado');
const yDir = T.dir.y;
b.x = 200;
b.y = 100;
b.vx = 200;
b.vy = 0;
J._teste.passo(0.5);
testar(T.dir.y < yDir, 'a CPU move o traço direito em direção à bolinha');
J.acao('duplo');
testar(J.dados().modo === 'duplo', 'volta para 2 jogadores');

console.log('\n[7] Vitória');
J.acao('cpu');
J._teste.definirPlacar(0, 6);
b.x = -5;
b.y = 300;
b.vx = -200;
b.vy = 0;
J._teste.passo(1 / 60);
testar(J.dados().estado === 'gameover', 'partida termina ao chegar a 7 pontos');
testar(J.dados().vencedor === 1, 'vencedor registrado (CPU no modo contra a CPU)');

console.log('\n[8] Pausa e Som');
J.acao('comecar');
testar(J.dados().estado === 'playing', 'partida recomeçada');
J.acao('pausa');
testar(J.dados().pausado === true, 'jogo pausado');
J.acao('pausa');
testar(J.dados().pausado === false, 'jogo despausado');
J.entrada.disparar(true);
testar(J.dados().estado === 'playing', 'disparar durante o jogo não reinicia a partida');
J.acao('pausa');
J.entrada.disparar(true);
testar(J.dados().estado === 'playing' && J.dados().pausado === false, 'disparar com o jogo pausado retoma a partida');
const somAntes = J.dados().som;
J.acao('som');
testar(J.dados().som !== somAntes, 'alternância de áudio funcionando');

console.log('\n=========================================');
if (falhas === 0) {
  console.log('TODOS OS TESTES DO DOIS TRAÇOS PASSARAM!');
} else {
  console.log(`FALHAS: ${falhas}`);
  process.exit(1);
}
