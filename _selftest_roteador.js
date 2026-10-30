// Teste da estrutura do projeto: roteador, arquivos do cardapio e ligacoes.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const raiz = __dirname;
const ler = p => fs.readFileSync(path.join(raiz, p), 'utf8');
const existe = p => fs.existsSync(path.join(raiz, p));

let fail = 0;
function ok(cond, msg) {
  if (cond) console.log('  ok  - ' + msg);
  else { console.log('  FAIL- ' + msg); fail++; }
}

const roteador = ler('roteador.js');
const menuHtml = ler('index.html');
const JOGOS_PC = ['minhoquinha-desktop.html', 'tetris-desktop.html', 'pinball-desktop.html', 'space-invaders-desktop.html', 'space-cadet-desktop.html', 'bomberman-desktop.html', 'defender-desktop.html', 'pacman-desktop.html', 'penalty-kick-desktop.html', 'brick-breaker-desktop.html', 'the-wall-desktop.html', 'dois-tracos-desktop.html'];
const JOGOS_CEL = ['minhoquinha-mobile.html', 'tetris-mobile.html', 'pinball-mobile.html', 'space-invaders-mobile.html', 'space-cadet-mobile.html', 'bomberman-mobile.html', 'defender-mobile.html', 'pacman-mobile.html', 'penalty-kick-mobile.html', 'brick-breaker-mobile.html', 'the-wall-mobile.html', 'dois-tracos-mobile.html'];
// Aceita o parâmetro de versão do cache (ex.: roteador.js?v=2.2)
const usaArquivo = (html, arq) => new RegExp('src="' + arq.replace(/\./g, '\\.') + '(\\?v=[^"]*)?"').test(html);
const temRoteador = t => usaArquivo(t, 'roteador.js');

/* ------------------------- ambiente para o roteador ---------------------- */
function carregarRoteador(opts) {
  var destino = null;
  var window = {
    location: { pathname: opts.pagina || '/', search: opts.busca || '', replace(u) { destino = u; } },
    matchMedia: opts.semMatchMedia ? undefined
      : function (q) { return { matches: q === '(pointer: coarse)' ? !!opts.grosso : false }; },
    screen: { width: opts.largura || 1920, height: opts.altura || 1080 }
  };
  if (opts.toque) window.ontouchstart = null;
  const sandbox = {
    console, Math, String, Number, Array, Object, JSON, RegExp, parseInt, isNaN, window,
    navigator: { userAgent: opts.ua, maxTouchPoints: opts.toque || 0, msMaxTouchPoints: opts.toque || 0 }
  };
  sandbox.globalThis = sandbox;
  window.window = window;
  vm.createContext(sandbox);
  vm.runInContext(roteador, sandbox, { filename: 'roteador.js' });
  return { destino, window, sandbox };
}

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  androidTab: 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  ipad13: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
};

console.log('\n[1] deteccao do aparelho');
ok(carregarRoteador({ pagina: '/index.html', ua: UA.iphone, toque: 5, grosso: true, largura: 390, altura: 844 }).window.detectarMobile() === true, 'iPhone = celular');
ok(carregarRoteador({ pagina: '/index.html', ua: UA.android, toque: 5, grosso: true, largura: 412, altura: 915 }).window.detectarMobile() === true, 'Android = celular');
ok(carregarRoteador({ pagina: '/index.html', ua: UA.androidTab, toque: 5, grosso: true, largura: 800, altura: 1280 }).window.detectarMobile() === true, 'tablet Android = celular');
ok(carregarRoteador({ pagina: '/index.html', ua: UA.ipad13, toque: 5, grosso: true, largura: 1024, altura: 768 }).window.detectarMobile() === true, 'iPad (disfarcado de Macintosh) = celular');
ok(carregarRoteador({ pagina: '/index.html', ua: UA.win, largura: 1920, altura: 1080 }).window.detectarMobile() === false, 'Windows = computador');
ok(carregarRoteador({ pagina: '/index.html', ua: UA.mac, largura: 2560, altura: 1440 }).window.detectarMobile() === false, 'Mac = computador');
ok(carregarRoteador({ pagina: '/index.html', ua: UA.win, toque: 10, grosso: false, largura: 1920, altura: 1080 }).window.detectarMobile() === false, 'notebook com tela sensivel + mouse = computador');
ok(carregarRoteador({ pagina: '/index.html', ua: 'Mozilla/5.0 (Linux; Android 4.4) AppleWebKit/537.36 Mobile Safari/537.36', largura: 360, altura: 640 }).window.detectarMobile() === true, 'Android antigo sem matchMedia = celular (pelo user-agent)');

console.log('\n[2] escape manual pela barra de enderecos');
ok(carregarRoteador({ pagina: '/index.html', ua: UA.iphone, toque: 5, grosso: true, largura: 390, altura: 844, busca: '?desktop=1' }).window.detectarMobile() === false, '?desktop=1 no celular = computador');
ok(carregarRoteador({ pagina: '/index.html', ua: UA.win, busca: '?mobile=1' }).window.detectarMobile() === true, '?mobile=1 no PC = celular');
ok(carregarRoteador({ pagina: '/index.html', ua: UA.win, busca: '?x=1&desktop=1' }).window.detectarMobile() === false, '?desktop=1 junto de outros parametros');
ok(carregarRoteador({ pagina: '/index.html', ua: UA.win, busca: '?desktop=10' }).window.detectarMobile() === false, '?desktop=10 nao vale como =1');

console.log('\n[3] redirecionamento automatico de cada pagina de jogo');
// com o parametro forcando o MESMO lado da pagina, ela nao pode redirecionar
const forcadoNoLugar = [
  ['minhoquinha-desktop.html', UA.iphone, 5, true, '?desktop=1'],
  ['minhoquinha-mobile.html', UA.win, 0, false, '?mobile=1'],
  ['tetris-desktop.html', UA.android, 5, true, '?desktop=1'],
  ['tetris-mobile.html', UA.win, 0, false, '?mobile=1'],
  ['pinball-desktop.html', UA.iphone, 5, true, '?desktop=1'],
  ['pinball-mobile.html', UA.win, 0, false, '?mobile=1'],
  ['space-invaders-desktop.html', UA.iphone, 5, true, '?desktop=1'],
  ['space-invaders-mobile.html', UA.win, 0, false, '?mobile=1'],
  ['space-cadet-desktop.html', UA.iphone, 5, true, '?desktop=1'],
  ['space-cadet-mobile.html', UA.win, 0, false, '?mobile=1'],
  ['bomberman-desktop.html', UA.iphone, 5, true, '?desktop=1'],
  ['bomberman-mobile.html', UA.win, 0, false, '?mobile=1'],
  ['defender-desktop.html', UA.iphone, 5, true, '?desktop=1'],
  ['defender-mobile.html', UA.win, 0, false, '?mobile=1'],
  ['pacman-desktop.html', UA.iphone, 5, true, '?desktop=1'],
  ['pacman-mobile.html', UA.win, 0, false, '?mobile=1'],
  ['penalty-kick-desktop.html', UA.iphone, 5, true, '?desktop=1'],
  ['penalty-kick-mobile.html', UA.win, 0, false, '?mobile=1'],
  ['brick-breaker-desktop.html', UA.iphone, 5, true, '?desktop=1'],
  ['brick-breaker-mobile.html', UA.win, 0, false, '?mobile=1'],
  ['the-wall-desktop.html', UA.iphone, 5, true, '?desktop=1'],
  ['the-wall-mobile.html', UA.win, 0, false, '?mobile=1'],
  ['dois-tracos-desktop.html', UA.iphone, 5, true, '?desktop=1'],
  ['dois-tracos-mobile.html', UA.win, 0, false, '?mobile=1']
];
forcadoNoLugar.forEach(function (c) {
  const sub = carregarRoteador({
    pagina: '/' + c[0], ua: c[1], toque: c[2], grosso: c[3],
    largura: c[3] ? 400 : 1920, altura: c[3] ? 900 : 1080, busca: c[4]
  });
  ok(sub.destino === null, c[0] + ' com ' + c[4] + ': fica na propria pagina');
});
// e o parametro do outro lado leva para a outra versao
ok((carregarRoteador({ pagina: '/tetris-desktop.html', ua: UA.iphone, toque: 5, grosso: true, largura: 390, altura: 844, busca: '?mobile=1' }).destino || '').indexOf('tetris-mobile.html') === 0,
   '?mobile=1 na pagina de computador leva para a de celular (levando o parametro junto)');
// sem parametro, precisa trocar de versao
ok(carregarRoteador({ pagina: '/minhoquinha-desktop.html', ua: UA.iphone, toque: 5, grosso: true, largura: 390, altura: 844 }).destino === 'minhoquinha-mobile.html',
   'abrir a versao de computador no celular manda para a de celular');
ok(carregarRoteador({ pagina: '/tetris-mobile.html', ua: UA.win, largura: 1920, altura: 1080 }).destino === 'tetris-desktop.html',
   'abrir a versao de celular no computador manda para a de computador');
ok(carregarRoteador({ pagina: '/space-cadet-mobile.html', ua: UA.win, largura: 1920, altura: 1080 }).destino === 'space-cadet-desktop.html',
   'abrir Space Cadet de celular no computador manda para a de computador');
ok(carregarRoteador({ pagina: '/space-cadet-desktop.html', ua: UA.iphone, toque: 5, grosso: true, largura: 390, altura: 844 }).destino === 'space-cadet-mobile.html',
   'abrir Space Cadet de computador no celular manda para a de celular');
ok(carregarRoteador({ pagina: '/bomberman-mobile.html', ua: UA.win, largura: 1920, altura: 1080 }).destino === 'bomberman-desktop.html',
   'abrir Bomberman de celular no computador manda para a de computador');
ok(carregarRoteador({ pagina: '/bomberman-desktop.html', ua: UA.iphone, toque: 5, grosso: true, largura: 390, altura: 844 }).destino === 'bomberman-mobile.html',
   'abrir Bomberman de computador no celular manda para a de celular');
ok(carregarRoteador({ pagina: '/defender-mobile.html', ua: UA.win, largura: 1920, altura: 1080 }).destino === 'defender-desktop.html',
   'abrir Defender de celular no computador manda para a de computador');
ok(carregarRoteador({ pagina: '/pacman-mobile.html', ua: UA.win, largura: 1920, altura: 1080 }).destino === 'pacman-desktop.html',
   'abrir Pacman de celular no computador manda para a de computador');
ok(carregarRoteador({ pagina: '/penalty-kick-mobile.html', ua: UA.win, largura: 1920, altura: 1080 }).destino === 'penalty-kick-desktop.html',
   'abrir Penalty Kick de celular no computador manda para a de computador');
ok(carregarRoteador({ pagina: '/tetris-desktop.html', ua: UA.win, largura: 1920, altura: 1080 }).destino === null,
   'no aparelho certo, nao redireciona');
ok(carregarRoteador({ pagina: '/index.html', ua: UA.win, largura: 1920, altura: 1080 }).destino === null,
   'o cardapio (index.html) nunca redireciona');
ok(carregarRoteador({ pagina: '/minhoquinha-mobile.html', ua: UA.iphone, toque: 5, grosso: true, largura: 390, altura: 844 }).destino === null,
   'sem laco: celular na versao de celular fica parado');
// o parametro precisa ser levado adiante para nao voltar
ok(carregarRoteador({ pagina: '/tetris-desktop.html', ua: UA.iphone, toque: 5, grosso: true, largura: 390, altura: 844, busca: '?desktop=1' }).destino === null,
   '?desktop=1 sobrevive ao redirecionamento (nao volta)');

console.log('\n[4] todos os arquivos apontados pelo cardapio existem');
const caminhos = [...menuHtml.matchAll(/'(minhoquinha|tetris|pinball|space-invaders|space-cadet|bomberman|defender|pacman|penalty-kick|brick-breaker|the-wall|dois-tracos)[^']*\.html'/g)].map(m => m[0].slice(1, -1));
const unicos = [...new Set(caminhos)];
unicos.forEach(f => ok(existe(f), 'existe: ' + f));
ok(unicos.length >= 24, 'o cardapio lista os 24 arquivos de jogo (' + unicos.length + ')');
JOGOS_PC.concat(JOGOS_CEL).forEach(f => ok(existe(f), 'arquivo do projeto presente: ' + f));

console.log('\n[5] cada pagina de jogo usa o roteador compartilhado');
JOGOS_PC.concat(JOGOS_CEL).forEach(function (f) {
  const t = ler(f);
  ok(temRoteador(t), f + ' inclui roteador.js');
  ok(t.includes('href="index.html"'), f + ' tem link de volta para o cardapio');
  ok(!t.includes('PORTA DE ENTRADA'), f + ' nao tem mais roteador embutido (sem duplicacao)');
});

console.log('\n[6] motores');
ok(existe('tetris.js'), 'motor do Tetris em arquivo proprio (tetris.js)');
ok(usaArquivo(ler('tetris-desktop.html'), 'tetris.js') && usaArquivo(ler('tetris-mobile.html'), 'tetris.js'),
   'as duas versoes do Tetris usam o MESMO motor (nao ha copia para divergir)');
ok(!/function\s+girarMatriz/.test(ler('tetris-desktop.html')) && !/function\s+girarMatriz/.test(ler('tetris-mobile.html')),
   'nenhuma das paginas do Tetris repete o motor dentro do HTML');
ok(ler('minhoquinha-desktop.html').includes('drawSnake') && ler('minhoquinha-mobile.html').includes('drawSnake'),
   'as duas versoes da minhoquinha tem o motor proprio embutido');
ok(ler('minhoquinha-mobile.html').includes('b-up') && ler('minhoquinha-mobile.html').includes('b-pause'),
   'a versao de celular da minhoquinha mantem o D-pad de 4 setas');
ok(!ler('minhoquinha-desktop.html').includes('b-up'), 'a versao de computador da minhoquinha nao tem D-pad');
ok(existe('pinball.js'), 'motor do Pinball em arquivo proprio (pinball.js)');
ok(usaArquivo(ler('pinball-desktop.html'), 'pinball.js') && usaArquivo(ler('pinball-mobile.html'), 'pinball.js'),
   'as duas versoes do Pinball usam o MESMO motor (pinball.js)');
ok(existe('space-invaders.js'), 'motor do Space Invaders em arquivo proprio (space-invaders.js)');
ok(usaArquivo(ler('space-invaders-desktop.html'), 'space-invaders.js') && usaArquivo(ler('space-invaders-mobile.html'), 'space-invaders.js'),
   'as duas versoes do Space Invaders usam o MESMO motor (space-invaders.js)');
ok(existe('3DPinballSpaceCadet.js'), 'motor do Space Cadet em arquivo proprio (3DPinballSpaceCadet.js)');
ok(ler('space-cadet-desktop.html').includes('3DPinballSpaceCadet.js') && ler('space-cadet-mobile.html').includes('3DPinballSpaceCadet.js'),
   'as duas versoes do Space Cadet usam o motor nativo WebAssembly');
ok(existe('bomberman.js'), 'motor do Bomberman em arquivo proprio (bomberman.js)');
ok(usaArquivo(ler('bomberman-desktop.html'), 'bomberman.js') && usaArquivo(ler('bomberman-mobile.html'), 'bomberman.js'),
   'as duas versoes do Bomberman usam o MESMO motor (bomberman.js)');
ok(existe('defender.js'), 'motor do Defender em arquivo proprio (defender.js)');
ok(usaArquivo(ler('defender-desktop.html'), 'defender.js') && usaArquivo(ler('defender-mobile.html'), 'defender.js'),
   'as duas versoes do Defender usam o MESMO motor (defender.js)');
ok(existe('pacman.js'), 'motor do Pacman em arquivo proprio (pacman.js)');
ok(usaArquivo(ler('pacman-desktop.html'), 'pacman.js') && usaArquivo(ler('pacman-mobile.html'), 'pacman.js'),
   'as duas versoes do Pacman usam o MESMO motor (pacman.js)');
ok(existe('penalty-kick.js'), 'motor do Penalty Kick em arquivo proprio (penalty-kick.js)');
ok(usaArquivo(ler('penalty-kick-desktop.html'), 'penalty-kick.js') && usaArquivo(ler('penalty-kick-mobile.html'), 'penalty-kick.js'),
   'as duas versoes do Penalty Kick usam o MESMO motor (penalty-kick.js)');

ok(existe('brick-breaker.js'), 'motor do Quebra-Tijolos em arquivo proprio (brick-breaker.js)');
ok(usaArquivo(ler('brick-breaker-desktop.html'), 'brick-breaker.js') && usaArquivo(ler('brick-breaker-mobile.html'), 'brick-breaker.js'),
   'as duas versoes do Quebra-Tijolos usam o MESMO motor (brick-breaker.js)');
ok(existe('the-wall.js'), 'motor do The Wall em arquivo proprio (the-wall.js)');
ok(usaArquivo(ler('the-wall-desktop.html'), 'the-wall.js') && usaArquivo(ler('the-wall-mobile.html'), 'the-wall.js'),
   'as duas versoes do The Wall usam o MESMO motor (the-wall.js)');
ok(existe('dois-tracos.js'), 'motor do Dois Traços em arquivo proprio (dois-tracos.js)');
ok(usaArquivo(ler('dois-tracos-desktop.html'), 'dois-tracos.js') && usaArquivo(ler('dois-tracos-mobile.html'), 'dois-tracos.js'),
   'as duas versoes do Dois Traços usam o MESMO motor (dois-tracos.js)');

console.log('\n[7] cardapio: lista de jogos editavel');
ok(/var JOGOS = \[/.test(menuHtml), 'o cardapio tem a lista JOGOS para acrescentar jogos');
const nomes = [...menuHtml.matchAll(/nome: '([^']+)'/g)].map(m => m[1]);
ok(nomes.length === 12 && nomes[0] === 'MINHOQUINHA' && nomes[1] === 'TETRIS' && nomes[2] === 'PINBALL 3D' && nomes[3] === 'SPACE INVADERS' && nomes[4] === 'SPACE CADET' && nomes[5] === 'BOMBERMAN' && nomes[6] === 'DEFENDER' && nomes[7] === 'PACMAN' && nomes[8] === 'PENALTY KICK' && nomes[9] === 'BRICK BREAKER' && nomes[10] === 'THE WALL' && nomes[11] === 'DOIS TRACOS',
   'lista com os nove jogos na ordem: ' + nomes.join(', '));
ok(/pintarIcone/.test(menuHtml), 'cada jogo tem icone desenhado em canvas');
ok(/roteador\.js/.test(menuHtml), 'o cardapio tambem usa o roteador para saber o aparelho');
ok(/pintarIcone/.test(menuHtml), 'cada jogo tem icone desenhado em canvas');
ok(/roteador\.js/.test(menuHtml), 'o cardapio tambem usa o roteador para saber o aparelho');

console.log('\n=========================================');
console.log(fail === 0 ? 'TODOS OS TESTES DE ESTRUTURA PASSARAM' : fail + ' TESTE(S) FALHARAM');
process.exit(fail === 0 ? 0 : 1);
