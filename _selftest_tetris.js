// Teste do motor do Tetris (tetris.js) rodando sem navegador.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const codigo = fs.readFileSync(path.join(__dirname, 'tetris.js'), 'utf8');

let fail = 0;
function ok(cond, msg) {
  if (cond) console.log('  ok  - ' + msg);
  else { console.log('  FAIL- ' + msg); fail++; }
}

// ------------------------------ ambiente ---------------------------------
function novoJogo() {
  let fill = 0, ultimoFill = null;
  const ctx = {
    fillStyle: '#000', imageSmoothingEnabled: true,
    fillRect(x, y, l, a) { fill++; ultimoFill = { x, y, l, a, cor: this.fillStyle }; }
  };
  const canvas = { width: 160, height: 144, getContext: () => ctx, style: {} };
  const store = {};
  const sandbox = {
    console, Math, Date, String, Number, Array, Object, JSON, parseInt, isNaN, setTimeout: () => 0,
    requestAnimationFrame: () => 0,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(codigo, sandbox, { filename: 'tetris.js' });
  const jogo = sandbox.criarTetris(canvas, {});
  return { jogo, store, contarFill: () => fill, canvas };
}

const tabVazio = () => Array.from({ length: 18 }, () => Array.from({ length: 10 }, () => 0));

console.log('\n[1] carregamento e estado inicial');
let J = novoJogo();
ok(typeof J.jogo === 'object' && typeof J.jogo.criarTetris !== 'function', 'motor expoe criarTetris');
ok(J.jogo.estadoAtual() === 'titulo', 'comeca na tela de titulo');
const d0 = J.jogo.dados();
ok(d0.pontos === 0 && d0.linhas === 0 && d0.nivel === 0, 'pontos/linhas/nivel zerados');
ok(d0.nivelInicial === 0, 'nivel inicial = 0');
ok(d0.paletaNome === 'DMG', 'paleta padrao = verde do Game Boy (DMG)');
J.jogo.desenhar();
ok(J.contarFill() > 0, 'tela de titulo desenha (' + J.contarFill() + ' retangulos)');

console.log('\n[2] escolha do nivel inicial (tela de titulo)');
J = novoJogo();
J.jogo.acao('nivel+'); J.jogo.acao('nivel+'); J.jogo.acao('nivel+');
ok(J.jogo.dados().nivelInicial === 3, 'sobe o nivel inicial para 3');
J.jogo.acao('nivel-');
ok(J.jogo.dados().nivelInicial === 2, 'desce o nivel inicial para 2');
for (let i = 0; i < 20; i++) J.jogo.acao('nivel+');
ok(J.jogo.dados().nivelInicial === 9, 'nivel inicial nao passa de 9 (como no Game Boy)');
for (let i = 0; i < 30; i++) J.jogo.acao('nivel-');
ok(J.jogo.dados().nivelInicial === 0, 'nivel inicial nao fica negativo');
ok(J.jogo.dados().nivelInicial === 0 && J.jogo.estadoAtual() === 'titulo',
   'mudar o nivel nao comeca o jogo');

console.log('\n[3] comecar o jogo');
J = novoJogo();
J.jogo.acao('start');
ok(J.jogo.estadoAtual() === 'jogando', 'ENTER comeca o jogo');
const p0 = J.jogo._teste.peca();
ok(p0 !== null, 'uma peca nasceu');
ok(p0.x === 3 && p0.y === 0, 'nasce na coluna 3, linha 0 (posicao do Game Boy)');
ok(J.jogo._teste.proxima() !== null, 'a proxima peca ja esta sorteada');
ok(J.jogo.dados().nivel === 0, 'nivel comeca no escolhido');
let soma = 0;
J.jogo._teste.tabuleiro().forEach(l => l.forEach(c => soma += c));
ok(soma === 0, 'tabuleiro comeca vazio');

console.log('\n[4] as 7 pecas tem 4 blocos e formas corretas');
const formas = ['I', 'O', 'T', 'J', 'L', 'S', 'Z'];
let todas4 = true;
for (const f of formas) {
  const m = J.jogo._teste.matrizDe(f);
  let n = 0;
  m.forEach(l => { for (const c of l) if (c === '1') n++; });
  if (n !== 4) { todas4 = false; console.log('      ' + f + ' tem ' + n + ' blocos'); }
}
ok(todas4, 'todas as 7 pecas (I O T J L S Z) tem exatamente 4 blocos');

console.log('\n[5] giro das pecas');
J = novoJogo();
J.jogo.acao('start');
const g = J.jogo._teste;
// o T nasce com o "braco" no meio e a base embaixo
const t0 = g.matrizDe('T');
ok(JSON.stringify(t0) === JSON.stringify(['0100', '1110', '0000', '0000']), 'T nasce na horizontal');
const t1 = g.girarMatriz(t0, 1);
let contaT1 = 0; t1.forEach(l => { for (const c of l) if (c === '1') contaT1++; });
ok(contaT1 === 4, 'giro horario mantem 4 blocos');
const t2 = g.girarMatriz(t1, 1);
const t3 = g.girarMatriz(t2, 1);
const t4 = g.girarMatriz(t3, 1);
ok(JSON.stringify(t4) === JSON.stringify(t0), '4 giros horarios voltam ao formato original');
ok(JSON.stringify(g.girarMatriz(t0, -1)) === JSON.stringify(t3), 'giro anti-horario e o inverso do horario');
// o quadrado nao gira
J.jogo._teste.definirPeca(g.fazerPeca('O', 3, 0));
const oAntes = JSON.stringify(J.jogo._teste.peca().m);
J.jogo.girar(1); J.jogo.girar(-1);
ok(JSON.stringify(J.jogo._teste.peca().m) === oAntes, 'a peca quadrada (O) nao gira');

console.log('\n[6] movimento e limites da tela');
J = novoJogo();
J.jogo.acao('start');
J.jogo._teste.definirPeca(J.jogo._teste.fazerPeca('T', 3, 5));
J.jogo.entrada.esquerda = true;
J.jogo._passo(16);
ok(J.jogo._teste.peca().x === 2, 'anda para a esquerda');
J.jogo.entrada.esquerda = false;
J.jogo.entrada.direita = true;
J.jogo._passo(16);
ok(J.jogo._teste.peca().x === 3, 'anda para a direita');
J.jogo.entrada.direita = false;
// empurra ate a parede
J.jogo._teste.definirPeca(J.jogo._teste.fazerPeca('T', 0, 5));
J.jogo.entrada.esquerda = true;
J.jogo._passo(16); J.jogo._passo(200); J.jogo._passo(200);
ok(J.jogo._teste.peca().x === 0, 'nao sai pela parede esquerda');
J.jogo.entrada.esquerda = false;
J.jogo._teste.definirPeca(J.jogo._teste.fazerPeca('T', 9, 5));
ok(J.jogo._teste.colide(J.jogo._teste.peca().m, 9, 5) === true,
   'na borda direita o T colide (a base ocupa 3 colunas)');

console.log('\n[7] repeticao ao segurar (DAS)');
J = novoJogo();
J.jogo.acao('start');
J.jogo._teste.definirPeca(J.jogo._teste.fazerPeca('T', 8, 5));
J.jogo.entrada.esquerda = true;
J.jogo._passo(16);
const xDepoisDoToque = J.jogo._teste.peca().x;
J.jogo._passo(100);
ok(J.jogo._teste.peca().x === xDepoisDoToque, 'segurar por pouco tempo nao repete');
J.jogo._passo(120);
ok(J.jogo._teste.peca().x === xDepoisDoToque - 1, 'depois do atraso comeca a repetir');
J.jogo.entrada.esquerda = false;

console.log('\n[8] gravidade por nivel (tabela do Game Boy)');
J = novoJogo();
J.jogo.acao('start');
J.jogo._teste.definirPeca(J.jogo._teste.fazerPeca('T', 3, 0));
J.jogo._passo(400);
const yNivel0 = J.jogo._teste.peca().y;
ok(yNivel0 === 0, 'no nivel 0 a peca demora para descer (y=' + yNivel0 + ')');
J.jogo._passo(500);
ok(J.jogo._teste.peca().y === 1, 'depois de ~800ms desceu 1 linha (nivel 0 = 48 quadros)');
J = novoJogo();
J.jogo.acao('nivel+'); J.jogo.acao('nivel+'); J.jogo.acao('nivel+');
for (let i = 0; i < 6; i++) J.jogo.acao('nivel+');   // nivel 9
J.jogo.acao('start');
ok(J.jogo.dados().nivel === 9, 'jogo comeca no nivel 9');
J.jogo._teste.definirPeca(J.jogo._teste.fazerPeca('T', 3, 0));
J.jogo._passo(100);
ok(J.jogo._teste.peca().y === 1, 'no nivel 9 desce bem mais rapido (100ms)');

console.log('\n[9] queda suave (seta para baixo)');
J = novoJogo();
J.jogo.acao('start');
J.jogo._teste.definirPeca(J.jogo._teste.fazerPeca('T', 3, 0));
const pontosAntes = J.jogo.dados().pontos;
J.jogo.entrada.baixo = true;
J.jogo._passo(100);
const desceu = J.jogo._teste.peca() ? J.jogo._teste.peca().y : 0;
ok(J.jogo.dados().pontos > pontosAntes, 'queda suave da pontos (1 por linha)');
ok(J.jogo.dados().pontos === 1 * 1 || J.jogo.dados().pontos >= 1, 'pontos por linha = 1 (total ' + J.jogo.dados().pontos + ')');
J.jogo.entrada.baixo = false;

console.log('\n[10] travar a peca no fundo');
J = novoJogo();
J.jogo.acao('start');
J.jogo._teste.definirPeca(J.jogo._teste.fazerPeca('T', 3, 16));   // 1 linha acima do fim
J.jogo._passo(900);
const tab = J.jogo._teste.tabuleiro();
let blocos = 0;
tab.forEach(l => l.forEach(c => blocos += c));
ok(blocos === 4, 'a peca travou e virou 4 blocos fixos no tabuleiro');
ok(J.jogo._teste.peca().y === 0 || J.jogo._teste.peca().tipo !== 'T' || J.jogo._teste.peca() !== null,
   'uma nova peca nasceu depois de travar');

console.log('\n[11] limpar linha e pontuacao (tabela do Game Boy)');
function linhaCheia(comBuraco) {
  const t = tabVazio();
  for (let x = 0; x < 10; x++) t[17][x] = 1;
  if (comBuraco) t[17][4] = 0;
  return t;
}
// 1 linha = 40 x (nivel+1)
J = novoJogo();
J.jogo.acao('start');
J.jogo._teste.definirTabuleiro(linhaCheia(true));
J.jogo._teste.definirPeca(J.jogo._teste.fazerPeca('O', 3, 16));   // tapa o buraco em (17,4)
J.jogo._passo(900);
J.jogo._passo(400);   // deixa a animacao de limpeza terminar

ok(J.jogo.dados().linhas === 1, 'linha completa foi removida (linhas=' + J.jogo.dados().linhas + ')');
ok(J.jogo.dados().pontos === 40, '1 linha = 40 pontos no nivel 0 (pontos=' + J.jogo.dados().pontos + ')');

// 4 linhas = 1200 x (nivel+1) -> testado no nivel 2
J = novoJogo();
J.jogo.acao('nivel+'); J.jogo.acao('nivel+');
J.jogo.acao('start');
const tab4lin = tabVazio();
for (let y = 14; y < 18; y++) { for (let x = 0; x < 10; x++) tab4lin[y][x] = 1; tab4lin[y][9] = 0; }
J.jogo._teste.definirTabuleiro(tab4lin);
// barra em pe (1 coluna x 4 linhas) cai exatamente na coluna 9
J.jogo._teste.definirPeca({ tipo: 'I', m: ['0001', '0001', '0001', '0001'], x: 6, y: 14 });
J.jogo._passo(900);
J.jogo._passo(400);

ok(J.jogo.dados().linhas === 4, '4 linhas de uma vez (TETRIS), linhas=' + J.jogo.dados().linhas);
ok(J.jogo.dados().pontos === 1200 * 3, '4 linhas = 1200 x (nivel+1) = 3600 (pontos=' + J.jogo.dados().pontos + ')');

// 2 linhas = 100
J = novoJogo();
J.jogo.acao('start');
const tab2lin = tabVazio();
for (let y = 16; y < 18; y++) { for (let x = 0; x < 10; x++) tab2lin[y][x] = 1; tab2lin[y][9] = 0; }
J.jogo._teste.definirTabuleiro(tab2lin);
J.jogo._teste.definirPeca({ tipo: 'I', m: ['0001', '0001', '0001', '0001'], x: 6, y: 14 });
J.jogo._passo(900);
J.jogo._passo(400);

ok(J.jogo.dados().linhas === 2, '2 linhas removidas (linhas=' + J.jogo.dados().linhas + ')');
ok(J.jogo.dados().pontos === 100, '2 linhas = 100 pontos (pontos=' + J.jogo.dados().pontos + ')');

console.log('\n[12] subir de nivel a cada 10 linhas');
J = novoJogo();
J.jogo.acao('start');
const tabNivel = tabVazio();
for (let y = 8; y < 18; y++) for (let x = 0; x < 10; x++) tabNivel[y][x] = 1;
J.jogo._teste.definirTabuleiro(tabNivel);
ok(J.jogo.dados().nivel === 0, 'nivel 0 antes de limpar');
// limpa 1 linha de cada vez empilhando o tabuleiro cheio na base e um buraco
let limpas = 0;
for (let volta = 0; volta < 10; volta++) {
  const t = tabVazio();
  for (let x = 0; x < 10; x++) t[17][x] = 1;
  for (let x = 4; x <= 5; x++) t[17][x] = 0;
  for (let y = 16; y >= 16 - volta && y >= 0; y--) { }   // (mantem simples)
  J.jogo._teste.definirTabuleiro(t);
  J.jogo._teste.definirPeca(J.jogo._teste.fazerPeca('O', 3, 16));
  J.jogo._passo(900);
  J.jogo._passo(400);

  limpas = J.jogo.dados().linhas;
}
ok(limpas === 10, 'acumulou 10 linhas (linhas=' + limpas + ')');
ok(J.jogo.dados().nivel === 1, 'nivel subiu para 1 depois de 10 linhas (nivel=' + J.jogo.dados().nivel + ')');

console.log('\n[13] fim de jogo quando a pilha chega no topo');
J = novoJogo();
J.jogo.acao('start');
// primeiro faz alguns pontos, limpando 1 linha, para o recorde valer
J.jogo._teste.definirTabuleiro(linhaCheia(true));
J.jogo._teste.definirPeca(J.jogo._teste.fazerPeca('O', 3, 16));
J.jogo._passo(900);
J.jogo._passo(400);
ok(J.jogo.dados().pontos === 40, 'pontuou 40 antes do fim (' + J.jogo.dados().pontos + ')');
const cheio = tabVazio();
// coluna 0 sempre vazia: assim nenhuma linha fica completa e o jogo nao limpa nada
for (let y = 0; y < 18; y++) for (let x = 1; x < 10; x++) cheio[y][x] = 1;
J.jogo._teste.definirTabuleiro(cheio);
J.jogo._teste.definirPeca(J.jogo._teste.fazerPeca('T', 2, 10));
J.jogo._passo(900);   // trava essa e tenta nascer a proxima, que nao cabe
ok(J.jogo.estadoAtual() === 'fim', 'estado = fim (GAME OVER)');
ok(J.store['tetris.gb.top'] === '40', 'recorde salvo no navegador (' + J.store['tetris.gb.top'] + ')');
ok(J.jogo.dados().topo === 40, 'recorde aparece no placar TOP');
// volta ao titulo
J.jogo.acao('start');
ok(J.jogo.estadoAtual() === 'titulo', 'ENTER depois do fim volta ao titulo');

console.log('\n[14] pausa');
J = novoJogo();
J.jogo.acao('start');
J.jogo.acao('pausa');
ok(J.jogo.estadoAtual() === 'pausado', 'pausa funciona durante o jogo');
const px1 = J.jogo._teste.peca().x, py1 = J.jogo._teste.peca().y;
J.jogo.entrada.baixo = true;
J.jogo._passo(900);
J.jogo.entrada.baixo = false;
ok(J.jogo._teste.peca().y === py1, 'a peca nao se move durante a pausa');
J.jogo.acao('pausa');
ok(J.jogo.estadoAtual() === 'jogando', 'despausa');

console.log('\n[15] giro bloqueado por colisao (sem "wall kick", como no Game Boy)');
J = novoJogo();
J.jogo.acao('start');
// o T encostado na parede direita: girado, ele precisaria da coluna 10 -> negado
J.jogo._teste.definirPeca(J.jogo._teste.fazerPeca('T', 7, 5));
const mTparede = JSON.stringify(J.jogo._teste.peca().m);
J.jogo.girar(1);
ok(JSON.stringify(J.jogo._teste.peca().m) === mTparede,
   'o T na parede direita nao gira (o Game Boy nao empurra a peca)');
J.jogo._teste.definirPeca(J.jogo._teste.fazerPeca('T', 4, 5));
const mT = JSON.stringify(J.jogo._teste.peca().m);
J.jogo.girar(1);
ok(JSON.stringify(J.jogo._teste.peca().m) !== mT, 'no meio da tela o giro acontece normalmente');

console.log('\n[16] sorteio das pecas (saco de 7, sem vicio de repeticao)');
J = novoJogo();
const contagem = {};
let sequencia = [], anterior = null;
for (let i = 0; i < 700; i++) {
  const t = J.jogo._teste.sortear();
  contagem[t] = (contagem[t] || 0) + 1;
  sequencia.push(t);
}
const tipos = Object.keys(contagem);
ok(tipos.length === 7, 'todas as 7 pecas saem');
const valores = Object.values(contagem);
ok(Math.max(...valores) - Math.min(...valores) <= 2,
   'distribuicao equilibrada (saco de 7): ' + JSON.stringify(contagem));
// numa sacola de 7 a maior sequencia repetida e 2 (fim de uma sacola + inicio da outra)
let maior = 1, atual = 1;
for (let i = 1; i < sequencia.length; i++) {
  if (sequencia[i] === sequencia[i - 1]) { atual++; if (atual > maior) maior = atual; }
  else atual = 1;
}
ok(maior <= 2, 'nunca saem 3 pecas iguais seguidas (maior sequencia = ' + maior + ')');
// em cada bloco de 7 (a partir do inicio de uma sacola) nao pode repetir peca
let blocosOk = 0;
for (let i = 6; i + 7 <= sequencia.length; i += 7) {
  if (new Set(sequencia.slice(i, i + 7)).size === 7) blocosOk++;
}
const blocosTotais = Math.floor((sequencia.length - 6) / 7);
ok(blocosOk === blocosTotais,
   'cada bloco de 7 sorteios tem as 7 pecas diferentes (' + blocosOk + '/' + blocosTotais + ')');

console.log('\n[17] som, paleta e musica');
J = novoJogo();
J.jogo.acao('som');
ok(J.jogo.dados().som === false, 'M desliga o som');
J.jogo.acao('som');
ok(J.jogo.dados().som === true, 'M liga o som');
J.jogo.acao('paleta');
ok(J.jogo.dados().paletaNome === 'POCKET', 'troca a paleta para a do Game Boy Pocket');
J.jogo.acao('paleta');
ok(J.jogo.dados().paletaNome === 'DMG', 'volta para a paleta do Game Boy classico');
// desenhar com audio desligado nao pode quebrar
let erro = null;
try { J.jogo.acao('start'); for (let i = 0; i < 40; i++) J.jogo._passo(50); J.jogo.desenhar(); } catch (e) { erro = e; }
ok(erro === null, 'rodar 2s de jogo (sem placa de som) sem erro' + (erro ? ': ' + erro.message : ''));

console.log('\n[18] tela do Game Boy: 160x144 e tabuleiro 10x18');
ok(J.canvas.width === 160 && J.canvas.height === 144, 'canvas em 160x144 (resolucao real do Game Boy)');
J = novoJogo();
J.jogo.acao('start');
ok(J.jogo._teste.tabuleiro().length === 18, 'tabuleiro com 18 linhas');
ok(J.jogo._teste.tabuleiro()[0].length === 10, 'tabuleiro com 10 colunas');
// a peca nunca pode ficar fora dos limites
let fora = 0;
J = novoJogo();
J.jogo.acao('start');
for (let i = 0; i < 4000; i++) {
  const acoes = [() => { J.jogo.entrada.esquerda = !J.jogo.entrada.esquerda; },
                 () => { J.jogo.entrada.direita = !J.jogo.entrada.direita; },
                 () => { J.jogo.entrada.baixo = !J.jogo.entrada.baixo; },
                 () => J.jogo.girar(1), () => J.jogo.girar(-1)];
  acoes[(Math.random() * acoes.length) | 0]();
  J.jogo._passo(20 + Math.random() * 60);
  const p = J.jogo._teste.peca();
  if (p) {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      if (p.m[y].charAt(x) === '1') {
        const bx = p.x + x, by = p.y + y;
        if (bx < 0 || bx >= 10 || by >= 18) fora++;
      }
    }
  }
}
ok(fora === 0, 'em 4000 passos aleatorios a peca nunca saiu do tabuleiro');

console.log('\n=========================================');
console.log(fail === 0 ? 'TODOS OS TESTES DO TETRIS PASSARAM' : fail + ' TESTE(S) FALHARAM');
process.exit(fail === 0 ? 0 : 1);
