// Testes do motor de pinball: fisica, regras, 5 mesas (sem precisar de video).
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const codigo = fs.readFileSync(path.join(__dirname, 'pinball.js'), 'utf8');

let fail = 0;
function ok(cond, msg) {
  if (cond) console.log('  ok  - ' + msg);
  else { console.log('  FAIL- ' + msg); fail++; }
}

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
  vm.runInContext(codigo, sandbox, { filename: 'pinball.js' });
  // canvas sem WebGL: o motor cai no contexto simulado
  const canvas = { width: 960, height: 540, clientWidth: 960, clientHeight: 540, style: {}, getContext: () => null };
  const jogo = sandbox.criarPinball(canvas, {});
  jogo.iniciar();
  return { jogo, store, sandbox };
}

function rodar(jogo, segundos, dt) {
  dt = dt || 1 / 60;
  var n = Math.round(segundos / dt);
  for (var i = 0; i < n; i++) jogo._teste.passo(dt);
}

console.log('\n[1] carregamento e mesas');
let J = novoJogo();
const mesas = J.jogo.mesas();
ok(mesas.length === 5, '5 mesas disponiveis (' + mesas.length + ')');
ok(mesas.map(m => m.nome).join(',') === 'ESPACO,FLIPERAMA,SELVA,PIRATA,NEON',
   'nomes das mesas: ' + mesas.map(m => m.nome).join(', '));
ok(J.jogo.dados().estado === 'mesa', 'comeca mostrando a mesa');
ok(J.jogo.avisos().length === 0, 'nenhum aviso do motor' + JSON.stringify(J.jogo.avisos()));

// todas as mesas tem o necessario
for (let i = 0; i < 5; i++) {
  J.jogo.escolherMesa(i);
  const f = J.jogo._teste.fisica();
  const m = J.jogo._teste.mesa();
  ok(f.segs.length > 20 && f.circs.length >= 3 && f.alvos.length >= 3 && f.flippers.length >= 2,
     m.nome + ': ' + f.segs.length + ' segmentos, ' + f.circs.length + ' circulos, ' +
     f.alvos.length + ' alvos, ' + f.flippers.length + ' flippers');
}

console.log('\n[2] comecar, carregar e lancar a bola');
J = novoJogo();
J.jogo.acao('comecar');
ok(J.jogo.dados().estado === 'lancando', 'estado = lancando');
ok(J.jogo.dados().bolas === 3, '3 bolas');
const b0 = J.jogo._teste.bola();
ok(b0 !== null && b0.y < 5 && b0.x > 17, 'bola parada no canal do lancador (' + b0.x.toFixed(1) + ',' + b0.y.toFixed(1) + ')');
J.jogo.entrada.lancador(true);
rodar(J.jogo, 0.8);
const forca = J.jogo._teste.lancadorForca();
ok(forca > 0.3, 'segurando, o lancador carrega (forca=' + forca.toFixed(2) + ')');
J.jogo.entrada.lancador(false);
ok(J.jogo.dados().estado === 'jogando', 'soltar dispara (estado = jogando)');
ok(J.jogo._teste.bola().vy > 100, 'a bola sai com velocidade (' + J.jogo._teste.bola().vy.toFixed(0) + ' pol/s)');

console.log('\n[3] a bola sobe o canal e entra na mesa');
const yInicial = J.jogo._teste.bola().y;
rodar(J.jogo, 0.08);
const b1 = J.jogo._teste.bola();
ok(b1 && b1.y > yInicial + 5, 'a bola subiu o canal (y=' + (b1 ? b1.y.toFixed(1) : 'perdida') + ')');
rodar(J.jogo, 0.35);
const b2 = J.jogo._teste.bola();
ok(b2 === null || b2.x < 17.5, 'a bola saiu do canal para o campo (x=' + (b2 ? b2.x.toFixed(1) : 'perdida') + ')');

// teste de intensidade ajustavel: toque rapido lanca fraco e a bola retorna ao lancador
const JFraco = novoJogo();
JFraco.jogo.acao('comecar');
JFraco.jogo.entrada.lancador(true);
rodar(JFraco.jogo, 0.03);
JFraco.jogo.entrada.lancador(false);
const vyFraco = JFraco.jogo._teste.bola().vy;
ok(vyFraco < 60, 'toque rapido dispara com intensidade fraca (vy=' + vyFraco.toFixed(0) + ' pol/s)');
rodar(JFraco.jogo, 0.8);
ok(JFraco.jogo.dados().estado === 'lancando', 'disparo fraco nao perde vida e retorna pronto para novo lancamento');
ok(JFraco.jogo._teste.bola().y <= 2.5 && JFraco.jogo._teste.bola().x > 17, 'a bola repousa novamente no lancador');

console.log('\n[4] gravidade e paredes');
J = novoJogo();
J.jogo.acao('comecar');
J.jogo._teste.definirEstado('jogando');
J.jogo._teste.zerarSalva();
J.jogo._teste.definirBola(10, 16, 0, 0);
const yAntes = J.jogo._teste.bola().y;
rodar(J.jogo, 0.4);
ok(J.jogo._teste.bola().y < yAntes, 'a gravidade puxa a bola para baixo');
J.jogo._teste.definirBola(10, 20, -600, 0);
rodar(J.jogo, 0.4);
const bEsq = J.jogo._teste.bola();
ok(!bEsq || bEsq.x > 0.4, 'a bola nao atravessa a parede esquerda (x=' + (bEsq ? bEsq.x.toFixed(2) : 'perdida') + ')');
J.jogo._teste.definirBola(10, 20, 600, 0);
rodar(J.jogo, 0.4);
const bDir = J.jogo._teste.bola();
ok(!bDir || bDir.x < 19.6, 'a bola nao atravessa a parede direita (x=' + (bDir ? bDir.x.toFixed(2) : 'perdida') + ')');

console.log('\n[5] bumper pontua e empurra');
J = novoJogo();
J.jogo.acao('comecar');
J.jogo._teste.definirEstado('jogando');
J.jogo._teste.zerarSalva();
const mesaTeste = J.jogo._teste.mesa();
const bump = mesaTeste.bumpers[0];
const pontosAntes = J.jogo.dados().pontos;
// joga a bola em cima do bumper, descendo contra ele
J.jogo._teste.definirBola(bump.x, bump.y + 3, 0, -260);
rodar(J.jogo, 0.6);
ok(J.jogo.dados().pontos > pontosAntes, 'bater no bumper pontua (' + J.jogo.dados().pontos + ' pontos)');
const bPos = J.jogo._teste.bola();
ok(!bPos || bPos.y > bump.y - 1.0, 'o bumper empurra a bola de volta');

console.log('\n[6] alvos e multiplicador');
J = novoJogo();
J.jogo.acao('comecar');
J.jogo._teste.definirEstado('jogando');
J.jogo._teste.zerarSalva();
const f6 = J.jogo._teste.fisica();
const alvo0 = f6.alvos[0];
ok(alvo0.ativo === true, 'alvos comecam levantados');
J.jogo._teste.definirBola(alvo0.dados.x, alvo0.dados.y - 1.5, 0, 200);
rodar(J.jogo, 0.25);
ok(f6.alvos[0].ativo === false, 'bater no alvo derruba ele');
// derruba o resto
for (let i = 1; i < f6.alvos.length; i++) {
  J.jogo._teste.definirBola(f6.alvos[i].dados.x, f6.alvos[i].dados.y - 1.5, 0, 200);
  rodar(J.jogo, 0.25);
}
ok(J.jogo.dados().mult > 1, 'derrubar todos os alvos sobe o multiplicador (x' + J.jogo.dados().mult + ')');
ok(f6.alvos.every(a => a.ativo), 'os alvos voltam a levantar depois do bonus');

console.log('\n[7] flippers');
J = novoJogo();
J.jogo.acao('comecar');
J.jogo._teste.definirEstado('jogando');
J.jogo._teste.zerarSalva();
const f7 = J.jogo._teste.fisica();
const fl = f7.flippers[0];
const angRepouso = fl.ang;
J.jogo.entrada.fliper('esq', true);
rodar(J.jogo, 0.15);
ok(Math.abs(fl.ang - angRepouso) > 0.5, 'o flipper se move ao apertar');
ok(fl.ang > angRepouso, 'o flipper esquerdo sobe');
J.jogo.entrada.fliper('esq', false);
rodar(J.jogo, 0.15);
ok(Math.abs(fl.ang - angRepouso) < 0.05, 'ao soltar, o flipper volta ao repouso');
// bola parada sobre o flipper e arremessada
J.jogo._teste.definirBola(fl.x + 2.2, fl.y + 0.2, 0, -20);
rodar(J.jogo, 0.05);
J.jogo.entrada.fliper('esq', true);
rodar(J.jogo, 0.1);
const bFlipper = J.jogo._teste.bola();
ok(bFlipper && bFlipper.vy > 30, 'o flipper arremessa a bola para cima (vy=' + (bFlipper ? bFlipper.vy.toFixed(0) : 'perdida') + ')');

console.log('\n[8] perder a bola e fim de jogo');
J = novoJogo();
J.jogo.acao('comecar');
J.jogo._teste.definirEstado('jogando');
ok(J.jogo.dados().bolas === 3, '3 bolas no comeco');
for (let n = 0; n < 3; n++) {
  J.jogo._teste.zerarSalva();                                   // sem bola salva
  J.jogo._teste.definirBola(9, 0.5, 0, -50);                    // cai no dreno
  rodar(J.jogo, 0.3);
  if (n < 2) ok(J.jogo.dados().bolas === 3 - (n + 1), 'perdeu a bola ' + (n + 1) + ' (restam ' + J.jogo.dados().bolas + ')');
}
ok(J.jogo.dados().estado === 'fim', 'depois de 3 bolas o jogo acaba');

console.log('\n[9] bola salva nos primeiros segundos');
J = novoJogo();
J.jogo.acao('comecar');
J.jogo.entrada.lancador(true); rodar(J.jogo, 0.4); J.jogo.entrada.lancador(false);
rodar(J.jogo, 0.2);
ok(J.jogo._teste.tempoSalva() > 0, 'logo apos o lancamento existe tempo de bola salva');
J.jogo._teste.definirBola(9, 0.5, 0, -50);
rodar(J.jogo, 0.3);
ok(J.jogo.dados().bolas === 3, 'a bola salva nao consome bola extra');
ok(J.jogo.dados().estado === 'lancando', 'a bola volta para o lancador');

console.log('\n[10] placar e recorde salvo');
J = novoJogo();
J.jogo.acao('comecar');
J.jogo._teste.definirPontos(4242);
J.jogo._teste.definirEstado('jogando');
for (let n = 0; n < 3; n++) {
  J.jogo._teste.zerarSalva();
  J.jogo._teste.definirBola(9, 0.5, 0, -50);
  rodar(J.jogo, 0.3);
}
ok(J.jogo.dados().estado === 'fim', 'jogo terminou');
const idMesa = J.jogo.dados().id;
ok(J.store['pinball.top.' + idMesa] === '4242', 'recorde gravado no navegador (' + J.store['pinball.top.' + idMesa] + ')');

console.log('\n[11] trocar de mesa reinicia a partida');
J = novoJogo();
J.jogo.acao('comecar');
J.jogo._teste.definirPontos(999);
J.jogo.acao('mesa+');
const d11 = J.jogo.dados();
ok(d11.id === 'fliperama', 'foi para a mesa 2 (' + d11.nome + ')');
ok(d11.pontos === 0 && d11.bolas === 3, 'a partida recomeca zerada na mesa nova');
J.jogo.acao('mesa-');
ok(J.jogo.dados().id === 'espaco', 'volta para a mesa 1');

console.log('\n[12] som, pausa e camera');
J = novoJogo();
J.jogo.acao('comecar');
J.jogo._teste.definirEstado('jogando');
J.jogo.acao('som');
ok(J.jogo.dados().som === false, 'M desliga o som');
J.jogo.acao('pausa');
ok(J.jogo.dados().pausado === true, 'pausa funciona');
const yPausa = J.jogo._teste.bola().y;
J.jogo._teste.definirBola(10, 20, 0, 0);
rodar(J.jogo, 1.0);
ok(J.jogo._teste.bola().y === 20, 'durante a pausa a fisica nao roda');
J.jogo.acao('pausa');
ok(J.jogo.dados().pausado === false, 'despausa');
let erroCam = null;
try { J.jogo.acao('camera'); } catch (e) { erroCam = e; }
ok(erroCam === null, 'trocar de camera nao quebra');

console.log('\n[13] fuzz: 3 minutos de jogo em todas as mesas, a bola nunca escapa');
let fora = 0, erros = 0, amostras = 0;
for (let m = 0; m < 5; m++) {
  J = novoJogo();
  J.jogo.escolherMesa(m);
  J.jogo.acao('comecar');
  J.jogo._teste.definirEstado('jogando');
  try {
    for (let i = 0; i < 3600; i++) {
      const r = Math.random();
      if (r < 0.05) J.jogo.entrada.fliper('esq', true);
      else if (r < 0.10) J.jogo.entrada.fliper('esq', false);
      else if (r < 0.15) J.jogo.entrada.fliper('dir', true);
      else if (r < 0.20) J.jogo.entrada.fliper('dir', false);
      else if (r < 0.21) { J.jogo.entrada.lancador(true); }
      else if (r < 0.22) { J.jogo.entrada.lancador(false); }
      J.jogo._teste.passo(1 / 60);
      const b = J.jogo._teste.bola();
      if (b) {
        amostras++;
        if (b.x < -1.5 || b.x > 21.5 || b.y < -1.5 || b.y > 44) fora++;
        if (!isFinite(b.x) || !isFinite(b.y) || !isFinite(b.vx) || !isFinite(b.vy)) fora++;
      }
      if (J.jogo.dados().estado === 'fim') { J.jogo.acao('comecar'); }
    }
  } catch (e) { erros++; console.log('      erro na mesa ' + (m + 1) + ': ' + e.message); }
}
ok(erros === 0, 'nenhuma excecao em 5 mesas x 3600 quadros');
ok(fora === 0, 'a bola nunca saiu da mesa em ' + amostras + ' quadros medidos');

console.log('\n[14] a fisica e estavel (sem "explosao" de velocidade)');
J = novoJogo();
J.jogo.acao('comecar');
let vMax = 0;
for (let i = 0; i < 1800; i++) {
  if (Math.random() < 0.1) J.jogo.entrada.fliper(Math.random() < 0.5 ? 'esq' : 'dir', true);
  if (Math.random() < 0.1) J.jogo.entrada.fliper(Math.random() < 0.5 ? 'esq' : 'dir', false);
  J.jogo._teste.passo(1 / 60);
  const b = J.jogo._teste.bola();
  if (b) vMax = Math.max(vMax, Math.sqrt(b.vx * b.vx + b.vy * b.vy));
  if (J.jogo.dados().estado === 'fim') J.jogo.acao('comecar');
}
ok(vMax <= 901, 'velocidade sempre limitada (' + vMax.toFixed(0) + ' pol/s)');

console.log('\n[15] pocos e scoops subterraneos (captura, retencao e ejecao)');
J = novoJogo();
J.jogo.acao('comecar');
J.jogo._teste.definirEstado('jogando');
J.jogo._teste.zerarSalva();
const pocos = J.jogo._teste.pocos();
ok(pocos.length > 0, 'a mesa possui pocos configurados (' + pocos.length + ')');
const poco0 = pocos[0];
const ptsAntesPoco = J.jogo.dados().pontos;
// posiciona bola diretamente no poco
J.jogo._teste.definirBola(poco0.x, poco0.y, 0, 0);
rodar(J.jogo, 0.05);
const bPresa = J.jogo._teste.bola();
ok(bPresa && bPresa.presaTempo > 0, 'a bola foi capturada e retida no poco (presaTempo=' + (bPresa ? bPresa.presaTempo.toFixed(2) : 0) + 's)');
ok(J.jogo.dados().pontos > ptsAntesPoco, 'captura no poco pontua bonus (' + J.jogo.dados().pontos + ' pts)');
// aguarda o momento exato da ejecao
while (J.jogo._teste.bola() && J.jogo._teste.bola().presaTempo > 0) J.jogo._teste.passo(1 / 60);
const bEjetada = J.jogo._teste.bola();
ok(bEjetada && bEjetada.presaTempo === 0, 'a bola foi ejetada do poco');
ok(bEjetada && Math.abs(bEjetada.x - poco0.ejectX) < 2.0, 'a bola reaparece no ponto de ejecao (x=' + (bEjetada ? bEjetada.x.toFixed(1) : 0) + ')');

console.log('\n[16] mezanino e flipper superior (segundo andar)');
J = novoJogo();
J.jogo.escolherMesa(1); // Mesa FLIPERAMA (possui flipper superior direito)
J.jogo.acao('comecar');
J.jogo._teste.definirEstado('jogando');
const flippersMesa2 = J.jogo._teste.fisica().flippers;
ok(flippersMesa2.length === 3, 'mesa FLIPERAMA possui 3 flippers (incluindo mezanino)');
const flSuperior = flippersMesa2[2];
const angRepousoSup = flSuperior.ang;
J.jogo.entrada.fliper('dir', true);
rodar(J.jogo, 0.15);
ok(Math.abs(flSuperior.ang - angRepousoSup) > 0.4, 'flipper superior se move ao apertar fliper direito');
J.jogo.entrada.fliper('dir', false);
rodar(J.jogo, 0.15);
ok(Math.abs(flSuperior.ang - angRepousoSup) < 0.05, 'flipper superior retorna ao repouso');

console.log('\n[17] travamento de bolas e modo multiball');
J = novoJogo();
J.jogo.acao('comecar');
J.jogo._teste.definirEstado('jogando');
J.jogo._teste.zerarSalva();
ok(J.jogo.dados().bolasAtivas === 1, 'inicia com 1 bola ativa');
J.jogo._teste.travarBola();
ok(J.jogo.dados().bolasTravadas === 1, 'primeira bola travada (1/3)');
J.jogo._teste.travarBola();
ok(J.jogo.dados().bolasTravadas === 2, 'segunda bola travada (2/3)');
J.jogo._teste.travarBola();
ok(J.jogo.dados().bolasAtivas >= 2, 'terceira trava dispara MULTIBALL (' + J.jogo.dados().bolasAtivas + ' bolas na mesa)');
const totalBolasAntes = J.jogo.dados().bolas;
// drena uma das bolas durante o multiball
const todasBolas = J.jogo._teste.bolas();
todasBolas[0].x = 9; todasBolas[0].y = 0.5; todasBolas[0].vy = -50;
rodar(J.jogo, 0.3);
ok(J.jogo.dados().bolas === totalBolasAntes, 'drenar 1 bola em multiball nao perde vida');
ok(J.jogo.dados().estado === 'jogando', 'o jogo continua normalmente com as outras bolas');

console.log('\n[18] portao destrutivel reativo (com HP)');
J = novoJogo();
J.jogo.acao('comecar');
J.jogo._teste.definirEstado('jogando');
J.jogo._teste.zerarSalva();
const portoes = J.jogo._teste.portoes();
ok(portoes.length > 0, 'a mesa possui portao destrutivel');
const portao0 = portoes[0];
const hpInicial = portao0.hp;
ok(hpInicial >= 3, 'portao comeca com HP cheio (' + hpInicial + ' HP)');
const ptsAntesPortao = J.jogo.dados().pontos;
// lanca bola contra o portao
J.jogo._teste.definirBola(portao0.dados.x, portao0.dados.y - 1.2, 0, 220);
rodar(J.jogo, 0.2);
ok(portao0.hp < hpInicial, 'colidir com o portao reduz HP (HP restante=' + portao0.hp + ')');
ok(J.jogo.dados().pontos > ptsAntesPortao, 'atingir o portao pontua');
// esgota o HP restante do portao
portao0.hp = 1;
J.jogo._teste.definirBola(portao0.dados.x, portao0.dados.y - 1.2, 0, 220);
rodar(J.jogo, 0.2);
ok(portao0.ativo === false, 'ao zerar o HP o portao e destruido e abre a passagem');
ok(portao0.segs.every(s => s.ativo === false), 'segmentos de colisao do portao sao desativados');

console.log('\n[19] tremer a mesa (nudge e mecanica de tilt)');
J = novoJogo();
J.jogo.acao('comecar');
J.jogo._teste.definirEstado('jogando');
J.jogo._teste.zerarSalva();
J.jogo._teste.definirBola(10, 20, 0, 0);
const bAntes = J.jogo._teste.bola();
const vxAntes = bAntes.vx, vyAntes = bAntes.vy;
// primeiro empurrao
J.jogo.entrada.tremer('esq');
const bDepois = J.jogo._teste.bola();
ok(bDepois.vx < vxAntes, 'tremer para esquerda empurra a bola (vx=' + bDepois.vx.toFixed(1) + ')');
ok(bDepois.vy > vyAntes, 'tremer empurra a bola para cima');
ok(J.jogo._teste.nudgeAvisos() === 1, 'primeiro tremor gera aviso de tilt (1/3)');
ok(J.jogo._teste.tilt() === false, 'ainda nao esta em tilt');

// segundo empurrao
J.jogo.entrada.tremer('dir');
ok(J.jogo._teste.nudgeAvisos() === 2, 'segundo tremor gera aviso de tilt (2/3)');
ok(J.jogo._teste.tilt() === false, 'ainda nao esta em tilt no segundo aviso');

// terceiro empurrao -> DISPARA TILT!
J.jogo.entrada.tremer();
ok(J.jogo._teste.tilt() === true, 'terceiro tremor consecutivo aciona TILT');
ok(J.jogo.dados().tilt === true, 'estado de tilt exposto nos dados da API');

// flippers ficam desativados durante o tilt
const flEsq = J.jogo._teste.fisica().flippers[0];
const repousoTilt = flEsq.repouso;
J.jogo.entrada.fliper('esq', true);
rodar(J.jogo, 0.1);
ok(Math.abs(flEsq.ang - repousoTilt) < 0.05, 'durante tilt os flippers nao sobem (permanecem em repouso)');

// ao passar o tempo de tilt, a mesa volta a responder
rodar(J.jogo, 4.2);
ok(J.jogo._teste.tilt() === false, 'apos o tempo de penalidade o tilt expira');
J.jogo.entrada.fliper('esq', true);
rodar(J.jogo, 0.1);
ok(flEsq.ang > repousoTilt + 0.3, 'flippers voltam a funcionar normalmente');

console.log('\n[20] solenoide kickback na outlane esquerda (defesa consagrada)');
J = novoJogo();
J.jogo.acao('comecar');
J.jogo._teste.definirEstado('jogando');
J.jogo._teste.zerarSalva();
ok(J.jogo.dados().kickback === true, 'kickback inicia armado na nova bola');

// posiciona a bola descendo na outlane esquerda
J.jogo._teste.definirBola(1.8, 4.0, 0, -10);
J.jogo._teste.passo(1 / 60);
const bKick = J.jogo._teste.bola();
ok(bKick && bKick.vy > 80, 'kickback dispara solenoide e arremessa a bola para cima (vy=' + (bKick ? bKick.vy.toFixed(0) : 0) + ' pol/s)');
ok(J.jogo.dados().kickback === false, 'kickback e consumido');

// aguarda a bola subir a mesa
rodar(J.jogo, 0.25);
const bSubiu = J.jogo._teste.bola();
ok(bSubiu && bSubiu.y > 16.0, 'a bola alcancou a metade superior da mesa em seguranca (y=' + (bSubiu ? bSubiu.y.toFixed(1) : 0) + ')');

// testar rearmar kickback entrando no poco
const poco = J.jogo._teste.pocos()[0];
J.jogo._teste.definirBola(poco.x, poco.y, 0, 0);
rodar(J.jogo, 0.05);
ok(J.jogo.dados().kickback === true, 'entrar no poco rearma o kickback');

console.log('\n=========================================');
console.log(fail === 0 ? 'TODOS OS TESTES DO PINBALL PASSARAM' : fail + ' TESTE(S) FALHARAM');
process.exit(fail === 0 ? 0 : 1);

