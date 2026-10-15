/* ============================================================================
   TETRIS — Game Boy (DMG 1989) — MOTOR COMPARTILHADO COM DIVISÓRIAS AUTÊNTICAS
   ----------------------------------------------------------------------------
   Recria fielmente o Tetris clássico do Nintendo Game Boy:
     - Tela real do Game Boy: 160 x 144 pixels, 4 tons (verde DMG)
     - Paredes divisórias de tijolos:
         * Coluna de tijolos na esquerda (x = 0..7, 8px)
         * Coluna de tijolos divisória na direita (x = 88..95, 8px)
     - Tabuleiro autêntico: 10 colunas x 18 linhas de 8x8 pixels (x = 8..87, 80px)
     - Painel HUD à direita (x = 96..159, 64px) com caixas de borda dupla arredondada:
         * Caixa SCORE no topo com compartimento duplo de pontuação
         * Caixa LEVEL no meio com número do nível
         * Caixa LINES abaixo do nível com contagem de linhas
         * Caixa NEXT na parte inferior com preview centralizado da próxima peça
     - Texturas autênticas de blocos:
         * Espiral grego / labyrinth ('T')
         * Janela concêntrica ('I', 'O')
         * Janela com relevo ('L', 'J')
         * Textura pontilhada/stipple ('S', 'Z')
     - 7 peças clássicas, sem "wall kick", giro A (horário) e B (anti-horário)
     - Tabela de velocidade da gravidade original do Game Boy
     - Trilha sonora procedural chiptune (Korobeiniki) em onda quadrada e triângulo
   ============================================================================ */
(function (raiz) {
  "use strict";

  /* --------------------------- dimensões / paleta ------------------------- */
  var TELA_L = 160, TELA_A = 144;   // resolução real da tela do Game Boy
  var OFFSET_X = 8;                 // onde começa o tabuleiro após a parede esquerda
  var LARG = 10, ALT = 18;          // tabuleiro: 10 colunas x 18 linhas
  var TAM = 8;                      // tamanho do bloco em pixels
  var WELL_W = LARG * TAM;          // 80 pixels de largura útil do tabuleiro (8..87)
  var PAREDE_DIR_X = 88;            // parede divisória de tijolos da direita (88..95)
  var PAINEL_X = 96;                // onde começa o painel da direita (96..159, 64px)

  // 4 tons do Game Boy (0 = mais claro/fundo, 3 = mais escuro/tinta)
  var PALETAS = [
    { nome: 'DMG',    tons: ['#9BBC0F', '#8BAC0F', '#306230', '#0F380F'] },
    { nome: 'POCKET', tons: ['#C4CFA1', '#8B956D', '#4D533C', '#1F1F1F'] }
  ];

  /* ------------------------------- fonte 5x7 ------------------------------ */
  var FONTE = {
    'A': ['01110','10001','10001','11111','10001','10001','10001'],
    'B': ['11110','10001','10001','11110','10001','10001','11110'],
    'C': ['01110','10001','10000','10000','10000','10001','01110'],
    'D': ['11110','10001','10001','10001','10001','10001','11110'],
    'E': ['11111','10000','10000','11110','10000','10000','11111'],
    'F': ['11111','10000','10000','11110','10000','10000','10000'],
    'G': ['01110','10001','10000','10111','10001','10001','01111'],
    'H': ['10001','10001','10001','11111','10001','10001','10001'],
    'I': ['11111','00100','00100','00100','00100','00100','11111'],
    'J': ['00111','00010','00010','00010','00010','10010','01100'],
    'K': ['10001','10010','10100','11000','10100','10010','10001'],
    'L': ['10000','10000','10000','10000','10000','10000','11111'],
    'M': ['10001','11011','10101','10101','10001','10001','10001'],
    'N': ['10001','11001','10101','10011','10001','10001','10001'],
    'O': ['01110','10001','10001','10001','10001','10001','01110'],
    'P': ['11110','10001','10001','11110','10000','10000','10000'],
    'Q': ['01110','10001','10001','10001','10101','10010','01101'],
    'R': ['11110','10001','10001','11110','10100','10010','10001'],
    'S': ['01111','10000','10000','01110','00001','00001','11110'],
    'T': ['11111','00100','00100','00100','00100','00100','00100'],
    'U': ['10001','10001','10001','10001','10001','10001','01110'],
    'V': ['10001','10001','10001','10001','10001','01010','00100'],
    'W': ['10001','10001','10001','10101','10101','11011','10001'],
    'X': ['10001','10001','01010','00100','01010','10001','10001'],
    'Y': ['10001','10001','01010','00100','00100','00100','00100'],
    'Z': ['11111','00001','00010','00100','01000','10000','11111'],
    '0': ['01110','10001','10011','10101','11001','10001','01110'],
    '1': ['00100','01100','00100','00100','00100','00100','01110'],
    '2': ['01110','10001','00001','00010','00100','01000','11111'],
    '3': ['11111','00010','00100','00010','00001','10001','01110'],
    '4': ['00010','00110','01010','10010','11111','00010','00010'],
    '5': ['11111','10000','11110','00001','00001','10001','01110'],
    '6': ['00110','01000','10000','11110','10001','10001','01110'],
    '7': ['11111','00001','00010','00100','01000','01000','01000'],
    '8': ['01110','10001','10001','01110','10001','10001','01110'],
    '9': ['01110','10001','10001','01111','00001','00010','01100'],
    ' ': ['00000','00000','00000','00000','00000','00000','00000'],
    '-': ['00000','00000','00000','11111','00000','00000','00000'],
    '.': ['00000','00000','00000','00000','00000','01100','01100'],
    ':': ['00000','01100','01100','00000','01100','01100','00000'],
    '>': ['10000','01000','00100','00010','00100','01000','10000'],
    '<': ['00001','00010','00100','01000','00100','00010','00001']
  };

  /* -------------------------------- peças -------------------------------- */
  // matriz 4x4 (4 linhas de 4 caracteres). Nascem alinhadas à esquerda.
  var FORMAS = {
    I: ['0000','1111','0000','0000'],
    O: ['0110','0110','0000','0000'],
    T: ['0100','1110','0000','0000'],
    J: ['1000','1110','0000','0000'],
    L: ['0010','1110','0000','0000'],
    S: ['0110','1100','0000','0000'],
    Z: ['1100','0110','0000','0000']
  };
  var TIPOS = ['I', 'O', 'T', 'J', 'L', 'S', 'Z'];

  // tabela de gravidade do Game Boy (quadros de 60 Hz por linha descida)
  var GRAVIDADE = [48,43,38,33,28,23,18,13,8,6,5,5,5,4,4,4,3,3,3,2,2];
  var NIVEL_MAX = 20;

  var PONTOS_LINHA = [0, 40, 100, 300, 1200];

  function intervaloQueda(nivel) {
    var q = GRAVIDADE[Math.min(nivel, NIVEL_MAX)];
    return q * 1000 / 60;
  }

  /* ------------------------------- música -------------------------------- */
  var MELODIA = [
    [76,4],[71,2],[72,2],  [74,4],[72,2],[71,2],  [69,4],[69,2],[72,2],  [76,4],[74,2],[72,2],
    [71,6],[72,2],         [74,4],[76,4],         [72,4],[69,4],         [69,4],[0,4],
    [74,6],[77,2],         [81,4],[79,2],[77,2],  [76,6],[72,2],         [76,4],[74,2],[72,2],
    [71,4],[71,2],[72,2],  [74,4],[76,4],         [72,4],[69,4],         [69,4],[0,4]
  ];
  var BAIXO_RAIZES = [45,45,45,45,40,45,45,45,50,50,45,45,40,45,45,45];
  var COLCH = 158;

  /* ============================== o jogo ================================== */
  function criarTetris(canvas, opcoes) {
    opcoes = opcoes || {};
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    var aoMudarEstado = opcoes.aoMudarEstado || function () {};

    /* ------------------------------ estado -------------------------------- */
    var estado = 'titulo';         // titulo | jogando | limpando | pausado | fim
    var tabuleiro = [];
    var tabuleiroPadroes = [];     // armazena o tipo ('T', 'I', 'O', etc.) de cada bloco fixo
    var peca = null, proxima = null;
    var sacoPeca = [];
    var nivel = 0, nivelInicial = 0, linhas = 0, pontos = 0;
    var topo = 0;
    var quedaAcum = 0, quedaIntervalo = 0;
    var dasTempo = 0, dasDir = 0;
    var limpandoTempo = 0, limpandoLinhas = [];
    var fimTempo = 0;
    var piscaTempo = 0;
    var paleta = 0;
    var som = true, musicaLigada = true;
    var tA = 0, iA = 0, tB = 0, iB = 0;
    var DAS_INICIAL = 170, DAS_REPETE = 55, QUEDA_SUAVE = 34;
    var LIMPA_TEMPO = 260;
    var ultimoQuadro = 0;

    var entrada = { esquerda: false, direita: false, baixo: false };

    try { topo = parseInt(localStorage.getItem('tetris.gb.top') || '0', 10) || 0; } catch (e) { topo = 0; }

    /* ------------------------------- áudio -------------------------------- */
    var ac = null, destino = null;
    function garantirAudio() {
      if (ac) return ac;
      try {
        var AC = raiz.AudioContext || raiz.webkitAudioContext;
        if (!AC) return null;
        ac = new AC();
        destino = ac.createGain();
        destino.gain.value = 0.5;
        destino.connect(ac.destination);
      } catch (e) { ac = null; }
      return ac;
    }
    function tocarTom(midi, durMs, vol, tipo) {
      if (!som) return;
      var a = garantirAudio();
      if (!a) return;
      try {
        if (a.state === 'suspended') a.resume();
        var o = a.createOscillator(), g = a.createGain();
        o.type = tipo || 'square';
        o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
        var t = a.currentTime, dur = Math.max(0.03, durMs / 1000);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.006);
        g.gain.setValueAtTime(vol, t + Math.max(0.012, dur - 0.035));
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(destino);
        o.start(t); o.stop(t + dur + 0.02);
      } catch (e) {}
    }
    function somEfeito(nome) {
      switch (nome) {
        case 'mover':   tocarTom(76, 34, 0.16); break;
        case 'girar':   tocarTom(88, 40, 0.18); break;
        case 'travar':  tocarTom(52, 55, 0.20); break;
        case 'linha':   tocarTom(84, 60, 0.20); setTimeout(function () { tocarTom(91, 90, 0.20); }, 60); break;
        case 'tetris':  [72,76,79,84].forEach(function (n, i) { setTimeout(function () { tocarTom(n, 110, 0.22); }, i * 70); }); break;
        case 'nivel':   [79,84,88].forEach(function (n, i) { setTimeout(function () { tocarTom(n, 90, 0.20); }, i * 80); }); break;
        case 'fim':     [71,66,62,57].forEach(function (n, i) { setTimeout(function () { tocarTom(n, 190, 0.22); }, i * 170); }); break;
        case 'inicio':  [72,76,79].forEach(function (n, i) { setTimeout(function () { tocarTom(n, 80, 0.20); }, i * 70); }); break;
      }
    }

    function musicaZerar() {
      iA = 0; iB = 0; tA = 0; tB = 0;
    }
    function musicaBombear(agora) {
      if (!som || !musicaLigada) return;
      if (!tA) { tA = agora; tB = agora; }
      if (agora >= tA) {
        var n = MELODIA[iA]; iA = (iA + 1) % MELODIA.length;
        if (n[0] > 0) tocarTom(n[0], n[1] * COLCH * 0.88, 0.11);
        tA += n[1] * COLCH;
        if (tA < agora - 400) tA = agora + 30;
      }
      if (agora >= tB) {
        var barra = Math.floor(iB / 4) % BAIXO_RAIZES.length;
        tocarTom(BAIXO_RAIZES[barra], COLCH * 1.7, 0.075, 'triangle');
        iB++;
        tB += COLCH * 2;
        if (tB < agora - 400) tB = agora + 30;
      }
    }

    /* ------------------------------ utilidades ---------------------------- */
    function tons() { return PALETAS[paleta].tons; }
    function px(x, y, l, a, tom) {
      ctx.fillStyle = tons()[tom];
      ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(l), Math.floor(a));
    }
    function texto(str, x, y, tom, escala) {
      escala = escala || 1;
      str = String(str).toUpperCase();
      var cx = x;
      for (var i = 0; i < str.length; i++) {
        var g = FONTE[str.charAt(i)] || FONTE[' '];
        for (var ly = 0; ly < 7; ly++) {
          for (var lx = 0; lx < 5; lx++) {
            if (g[ly].charAt(lx) === '1') px(cx + lx * escala, y + ly * escala, escala, escala, tom);
          }
        }
        cx += 6 * escala;
      }
    }
    function larguraTexto(str, escala) { escala = escala || 1; return String(str).length * 6 * escala - escala; }
    function textoCentro(str, y, tom, escala) {
      escala = escala || 1;
      texto(str, Math.round((TELA_L - larguraTexto(str, escala)) / 2), y, tom, escala);
    }
    function textoTabuleiroCentro(str, y, tom, escala) {
      escala = escala || 1;
      var larg = larguraTexto(str, escala);
      var x = Math.round(OFFSET_X + (WELL_W - larg) / 2);
      texto(str, x, y, tom, escala);
    }
    function preencher(num, casas) {
      var s = String(num);
      while (s.length < casas) s = '0' + s;
      return s;
    }

    /* -------------------------------- peças ------------------------------- */
    function sortearPeca() {
      if (sacoPeca.length === 0) {
        sacoPeca = TIPOS.slice();
        for (var i = sacoPeca.length - 1; i > 0; i--) {
          var j = (Math.random() * (i + 1)) | 0;
          var t = sacoPeca[i]; sacoPeca[i] = sacoPeca[j]; sacoPeca[j] = t;
        }
      }
      return sacoPeca.pop();
    }
    function novaPeca(tipo) {
      return { tipo: tipo, m: FORMAS[tipo].slice(), x: 3, y: 0 };
    }
    function marcar(m, x, y) {
      var linha = m[y];
      m[y] = linha.substring(0, x) + '1' + linha.substring(x + 1);
    }
    function girarMatriz(m, sentido) {
      var r = ['0000', '0000', '0000', '0000'];
      for (var y = 0; y < 4; y++) {
        for (var x = 0; x < 4; x++) {
          if (m[y].charAt(x) === '1') {
            if (sentido > 0) marcar(r, 3 - y, x);
            else marcar(r, y, 3 - x);
          }
        }
      }
      return r;
    }
    function colide(m, pxx, py) {
      for (var y = 0; y < 4; y++) {
        for (var x = 0; x < 4; x++) {
          if (m[y].charAt(x) !== '1') continue;
          var bx = pxx + x, by = py + y;
          if (bx < 0 || bx >= LARG || by >= ALT) return true;
          if (by >= 0 && tabuleiro[by][bx]) return true;
        }
      }
      return false;
    }
    function descer() {
      if (colide(peca.m, peca.x, peca.y + 1)) { travar(); return false; }
      peca.y++;
      return true;
    }
    function mover(dx) {
      if (colide(peca.m, peca.x + dx, peca.y)) return false;
      peca.x += dx;
      return true;
    }
    function girar(sentido) {
      if (estado !== 'jogando' || !peca) return;
      if (peca.tipo === 'O') return;
      var m = girarMatriz(peca.m, sentido);
      if (!colide(m, peca.x, peca.y)) {
        peca.m = m;
        somEfeito('girar');
      }
    }

    /* ------------------------------- tabuleiro ---------------------------- */
    function limparTabuleiro() {
      tabuleiro = [];
      tabuleiroPadroes = [];
      for (var y = 0; y < ALT; y++) {
        var linha = [];
        var linhaPadrao = [];
        for (var x = 0; x < LARG; x++) {
          linha.push(0);
          linhaPadrao.push('');
        }
        tabuleiro.push(linha);
        tabuleiroPadroes.push(linhaPadrao);
      }
    }
    function travar() {
      for (var y = 0; y < 4; y++) {
        for (var x = 0; x < 4; x++) {
          if (peca.m[y].charAt(x) !== '1') continue;
          var by = peca.y + y, bx = peca.x + x;
          if (by >= 0 && by < ALT && bx >= 0 && bx < LARG) {
            tabuleiro[by][bx] = 1;
            tabuleiroPadroes[by][bx] = peca.tipo;
          }
        }
      }
      somEfeito('travar');

      limpandoLinhas = [];
      for (var ly = 0; ly < ALT; ly++) {
        var cheia = true;
        for (var lx = 0; lx < LARG; lx++) if (!tabuleiro[ly][lx]) { cheia = false; break; }
        if (cheia) limpandoLinhas.push(ly);
      }

      peca = null;
      if (limpandoLinhas.length > 0) {
        estado = 'limpando';
        limpandoTempo = LIMPA_TEMPO;
        aoMudarEstado(estado);
      } else {
        nascer();
      }
    }
    function concluirLimpeza() {
      var n = limpandoLinhas.length;
      for (var i = 0; i < limpandoLinhas.length; i++) {
        tabuleiro.splice(limpandoLinhas[i], 1);
        tabuleiroPadroes.splice(limpandoLinhas[i], 1);
      }
      for (var k = 0; k < n; k++) {
        var vazia = [];
        var vaziaP = [];
        for (var x = 0; x < LARG; x++) {
          vazia.push(0);
          vaziaP.push('');
        }
        tabuleiro.unshift(vazia);
        tabuleiroPadroes.unshift(vaziaP);
      }
      linhas += n;
      pontos += PONTOS_LINHA[n] * (nivel + 1);
      var novoNivel = Math.min(NIVEL_MAX, nivelInicial + Math.floor(linhas / 10));
      if (novoNivel !== nivel) { nivel = novoNivel; somEfeito('nivel'); }
      else if (n === 4) somEfeito('tetris');
      else somEfeito('linha');
      limpandoLinhas = [];
      estado = 'jogando';
      aoMudarEstado(estado);
      nascer();
    }
    function nascer() {
      peca = novaPeca(proxima.tipo);
      proxima = novaPeca(sortearPeca());
      quedaAcum = 0;
      quedaIntervalo = intervaloQueda(nivel);
      if (colide(peca.m, peca.x, peca.y)) {
        peca = null;
        estado = 'fim';
        fimTempo = 0;
        musicaZerar();
        if (pontos > topo) {
          topo = pontos;
          try { localStorage.setItem('tetris.gb.top', String(topo)); } catch (e) {}
        }
        somEfeito('fim');
        aoMudarEstado(estado);
      }
    }

    /* -------------------------------- ações ------------------------------- */
    function comecar() {
      limparTabuleiro();
      nivel = nivelInicial;
      linhas = 0;
      pontos = 0;
      sacoPeca = [];
      proxima = novaPeca(sortearPeca());
      estado = 'jogando';
      musicaZerar();
      somEfeito('inicio');
      aoMudarEstado(estado);
      nascer();
    }
    function aoTitulo() {
      estado = 'titulo';
      peca = null;
      musicaZerar();
      aoMudarEstado(estado);
    }
    function pausar() {
      if (estado === 'jogando' || estado === 'limpando') {
        estado = 'pausado';
      } else if (estado === 'pausado') {
        estado = 'jogando';
      }
      musicaZerar();
      aoMudarEstado(estado);
    }
    function acao(nome) {
      switch (nome) {
        case 'start':
          if (estado === 'titulo') comecar();
          else if (estado === 'fim') aoTitulo();
          else if (estado === 'pausado') pausar();
          break;
        case 'pausa':
          if (estado === 'titulo') comecar();
          else if (estado === 'fim') aoTitulo();
          else pausar();
          break;
        case 'nivel+':
          if (estado === 'titulo') nivelInicial = Math.min(9, nivelInicial + 1);
          break;
        case 'nivel-':
          if (estado === 'titulo') nivelInicial = Math.max(0, nivelInicial - 1);
          break;
        case 'som':
          som = !som;
          if (!som) { } else { musicaZerar(); }
          aoMudarEstado(estado);
          break;
        case 'paleta':
          paleta = (paleta + 1) % PALETAS.length;
          break;
      }
    }

    /* ------------------------- desenho autêntico GB ----------------------- */

    // Desenha parede de tijolos Game Boy (coluna de 8px de largura)
    function desenharParedesTijolos() {
      [0, PAREDE_DIR_X].forEach(function (ox) {
        for (var y = 0; y < TELA_A; y += 4) {
          var par = (y % 8 === 0);
          px(ox, y, TAM, 4, 1);
          px(ox, y + 3, TAM, 1, 3); // junta horizontal inferior
          px(ox, y, TAM, 1, 0);     // brilho superior

          if (par) {
            px(ox + 7, y, 1, 4, 3); // junta vertical direita
            px(ox + 2, y + 1, 1, 1, 2);
            px(ox + 5, y + 2, 1, 1, 2);
          } else {
            px(ox + 3, y, 1, 4, 3); // junta vertical central
            px(ox + 7, y, 1, 4, 3); // junta vertical direita
            px(ox + 1, y + 2, 1, 1, 2);
            px(ox + 5, y + 1, 1, 1, 2);
          }
        }
      });
    }

    // Desenha caixa com borda dupla e cantos arredondados clássica do Game Boy
    function desenharCaixaGB(x, y, w, h) {
      // Borda externa com cantos chanfrados
      px(x + 2, y, w - 4, 1, 3);
      px(x + 2, y + h - 1, w - 4, 1, 3);
      px(x, y + 2, 1, h - 4, 3);
      px(x + w - 1, y + 2, 1, h - 4, 3);
      px(x + 1, y + 1, 1, 1, 3);
      px(x + w - 2, y + 1, 1, 1, 3);
      px(x + 1, y + h - 2, 1, 1, 3);
      px(x + w - 2, y + h - 2, 1, 1, 3);

      // Borda interna com 1px de folga
      px(x + 4, y + 2, w - 8, 1, 3);
      px(x + 4, y + h - 3, w - 8, 1, 3);
      px(x + 2, y + 4, 1, h - 8, 3);
      px(x + w - 3, y + 4, 1, h - 8, 3);
      px(x + 3, y + 3, 1, 1, 3);
      px(x + w - 4, y + 3, 1, 1, 3);
      px(x + 3, y + h - 4, 1, 1, 3);
      px(x + w - 4, y + h - 4, 1, 1, 3);
    }

    // Renderiza cada bloco de 8x8 pixels com a textura real do Game Boy
    function desenharBlocoPixel(px0, py0, tipo) {
      // Moldura externa escura (tom 3)
      px(px0, py0, TAM, TAM, 3);
      px(px0 + 1, py0 + 1, 6, 6, 0);

      if (tipo === 'T') {
        // Padrão espiral grego / labyrinth (peça T)
        var swirl = [
          '000000',
          '011110',
          '010010',
          '010110',
          '010000',
          '011111'
        ];
        for (var r = 0; r < 6; r++) {
          for (var c = 0; c < 6; c++) {
            if (swirl[r].charAt(c) === '1') px(px0 + 1 + c, py0 + 1 + r, 1, 1, 3);
          }
        }
      } else if (tipo === 'I' || tipo === 'O') {
        // Padrão janela concêntrica (quadrado dentro de quadrado)
        px(px0 + 2, py0 + 2, 4, 4, 3);
        px(px0 + 3, py0 + 3, 2, 2, 0);
      } else if (tipo === 'L' || tipo === 'J') {
        // Padrão janela com núcleo sólido/relevo
        px(px0 + 2, py0 + 2, 4, 4, 2);
        px(px0 + 3, py0 + 3, 2, 2, 3);
      } else {
        // Peças S, Z: Textura pontilhada/stipple autêntica
        for (var r2 = 0; r2 < 6; r2++) {
          for (var c2 = 0; c2 < 6; c2++) {
            if ((r2 + c2) % 2 === 0) px(px0 + 1 + c2, py0 + 1 + r2, 1, 1, 2);
          }
        }
      }
    }

    function desenharBloco(bx, by, tipo) {
      var px0 = OFFSET_X + bx * TAM;
      var py0 = by * TAM;
      desenharBlocoPixel(px0, py0, tipo || 'T');
    }

    function desenharTabuleiro() {
      // Limpa área do tabuleiro (x = 8..87)
      px(OFFSET_X, 0, WELL_W, TELA_A, 0);

      // Desenha blocos fixos com suas respectivas texturas
      for (var y = 0; y < ALT; y++) {
        for (var x = 0; x < LARG; x++) {
          if (tabuleiro[y][x]) {
            desenharBloco(x, y, tabuleiroPadroes[y][x]);
          }
        }
      }

      // Desenha paredes de tijolos na esquerda e na divisória da direita
      desenharParedesTijolos();
    }

    function desenharPeca() {
      if (!peca) return;
      for (var y = 0; y < 4; y++) {
        for (var x = 0; x < 4; x++) {
          if (peca.m[y].charAt(x) === '1') {
            desenharBloco(peca.x + x, peca.y + y, peca.tipo);
          }
        }
      }
    }

    function desenharProxima() {
      if (!proxima) return;
      var m = proxima.m;
      var minX = 9, maxX = -1, minY = 9, maxY = -1;
      for (var y = 0; y < 4; y++) {
        for (var x = 0; x < 4; x++) {
          if (m[y].charAt(x) === '1') {
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
      }
      var largP = (maxX - minX + 1) * TAM, altP = (maxY - minY + 1) * TAM;
      // Centraliza na caixa NEXT (x = 109, y = 99, w = 45, h = 40)
      var ox = 109 + Math.round((45 - largP) / 2);
      var oy = 99 + Math.round((40 - altP) / 2);
      for (var y2 = 0; y2 < 4; y2++) {
        for (var x2 = 0; x2 < 4; x2++) {
          if (m[y2].charAt(x2) === '1') {
            desenharBlocoPixel(ox + (x2 - minX) * TAM, oy + (y2 - minY) * TAM, proxima.tipo);
          }
        }
      }
    }

    function desenharPainel() {
      // Fundo limpo do painel (x = 96..159)
      px(PAINEL_X, 0, TELA_L - PAINEL_X, TELA_A, 0);

      // 1. Caixa SCORE no topo: x = 101, y = 5, w = 53, h = 14
      desenharCaixaGB(101, 5, 53, 14);
      texto('SCORE', 113, 9, 3);
      // Divisórias horizontais do compartimento de pontuação
      px(101, 21, 53, 1, 3);
      px(101, 23, 53, 1, 3);
      px(101, 33, 53, 1, 3);
      px(101, 35, 53, 1, 3);
      var sScore = String(pontos);
      var xScore = 150 - larguraTexto(sScore, 1);
      texto(sScore, xScore, 25, 3);

      // 2. Caixa LEVEL no meio: x = 101, y = 45, w = 53, h = 23
      desenharCaixaGB(101, 45, 53, 23);
      texto('LEVEL', 113, 49, 3);
      var sNivel = String(nivel);
      var xNivel = 148 - larguraTexto(sNivel, 1);
      texto(sNivel, xNivel, 58, 3);

      // 3. Caixa LINES abaixo do level: x = 101, y = 71, w = 53, h = 23
      desenharCaixaGB(101, 71, 53, 23);
      texto('LINES', 113, 75, 3);
      var sLinhas = String(linhas);
      var xLinhas = 148 - larguraTexto(sLinhas, 1);
      texto(sLinhas, xLinhas, 84, 3);

      // 4. Caixa NEXT na parte inferior: x = 109, y = 99, w = 45, h = 40
      desenharCaixaGB(109, 99, 45, 40);
      desenharProxima();
    }

    function desenharBarraTitulo() {
      var blocos = [0x0F, 0x02, 0x0F, 0x06, 0x04, 0x0F, 0x08];
      for (var i = 0; i < blocos.length; i++) {
        px(40 + i * 12, 40, 10, 10, i % 2 ? 3 : 2);
      }
    }

    function desenharTitulo() {
      px(0, 0, TELA_L, TELA_A, 0);
      textoCentro('TETRIS', 14, 3, 2);
      desenharBarraTitulo();
      textoCentro('LEVEL', 64, 3, 1);
      textoCentro(preencher(nivelInicial, 2), 76, 3, 2);
      var piscando = Math.floor(piscaTempo / 350) % 2 === 0;
      if (piscando) {
        px(54, 80, 4, 8, 3); px(58, 78, 2, 12, 3);
        px(102, 80, 4, 8, 3); px(100, 78, 2, 12, 3);
      }
      textoCentro('TOP ' + preencher(topo, 6), 100, 3, 1);
      if (Math.floor(piscaTempo / 500) % 2 === 0) textoCentro('PRESSIONE ENTER', 126, 3, 1);
    }

    function desenharPausa() {
      px(OFFSET_X, 0, WELL_W, TELA_A, 0);
      textoTabuleiroCentro('PAUSE', 62, 3, 2);
    }

    function desenharFim() {
      px(OFFSET_X, 0, WELL_W, TELA_A, 0);
      textoTabuleiroCentro('GAME', 46, 3, 2);
      textoTabuleiroCentro('OVER', 66, 3, 2);
      var e = 'SCORE ' + pontos;
      textoTabuleiroCentro(e, 94, 3, 1);
      if (Math.floor(piscaTempo / 500) % 2 === 0) {
        textoTabuleiroCentro('ENTER', 118, 3, 1);
      }
    }

    function desenhar() {
      var t = tons();
      ctx.fillStyle = t[0];
      ctx.fillRect(0, 0, TELA_L, TELA_A);

      if (estado === 'titulo') {
        desenharTitulo();
        return;
      }
      desenharTabuleiro();
      if (estado === 'limpando') {
        var fasePisca = Math.floor(limpandoTempo / 45) % 2 === 0;
        for (var i = 0; i < limpandoLinhas.length; i++) {
          var ly = limpandoLinhas[i];
          if (fasePisca) px(OFFSET_X, ly * TAM, WELL_W, TAM, 3);
        }
      } else {
        for (var j = 0; j < limpandoLinhas.length; j++) {
          px(OFFSET_X, limpandoLinhas[j] * TAM, WELL_W, TAM, 3);
        }
        desenharPeca();
      }
      desenharPainel();
      if (estado === 'pausado') desenharPausa();
      if (estado === 'fim') desenharFim();
    }

    /* -------------------------------- laço -------------------------------- */
    function atualizar(agora, dt) {
      piscaTempo += dt;

      if (estado === 'jogando') {
        musicaBombear(agora);

        var dir = 0;
        if (entrada.esquerda && !entrada.direita) dir = -1;
        else if (entrada.direita && !entrada.esquerda) dir = 1;
        if (dir !== dasDir) {
          dasDir = dir;
          dasTempo = DAS_INICIAL;
          if (dir !== 0 && mover(dir)) somEfeito('mover');
        } else if (dir !== 0) {
          dasTempo -= dt;
          if (dasTempo <= 0) {
            if (mover(dir)) somEfeito('mover');
            dasTempo = DAS_REPETE;
          }
        } else {
          dasTempo = 0;
        }

        var passo = entrada.baixo ? QUEDA_SUAVE : quedaIntervalo;
        quedaAcum += dt;
        var guarda = 0;
        while (quedaAcum >= passo && guarda < 24) {
          quedaAcum -= passo;
          guarda++;
          if (estado !== 'jogando') break;
          if (entrada.baixo) {
            if (colide(peca.m, peca.x, peca.y + 1)) { travar(); break; }
            peca.y++;
            pontos += 1;
          } else {
            if (!descer()) break;
          }
        }
      } else if (estado === 'limpando') {
        limpandoTempo -= dt;
        if (limpandoTempo <= 0) concluirLimpeza();
      } else if (estado === 'fim') {
        fimTempo += dt;
      }
    }

    function quadro(agora) {
      if (!ultimoQuadro) ultimoQuadro = agora;
      var dt = agora - ultimoQuadro;
      ultimoQuadro = agora;
      if (dt > 250) dt = 250;
      atualizar(agora, dt);
      desenhar();
      raiz.requestAnimationFrame(quadro);
    }

    /* --------------------------------- api -------------------------------- */
    var api = {
      entrada: entrada,
      girar: girar,
      acao: acao,
      comecar: comecar,
      pausar: pausar,
      desenhar: desenhar,
      estadoAtual: function () { return estado; },
      dados: function () {
        return { estado: estado, pontos: pontos, linhas: linhas, nivel: nivel,
                 topo: topo, nivelInicial: nivelInicial, som: som, paleta: paleta,
                 paletaNome: PALETAS[paleta].nome };
      },
      iniciar: function () { raiz.requestAnimationFrame(quadro); },
      _passo: function (ms) { atualizar(ultimoQuadro + ms, ms); ultimoQuadro += ms; },
      _teste: {
        tabuleiro: function () { return tabuleiro; },
        peca: function () { return peca; },
        proxima: function () { return proxima; },
        nivel: function () { return nivel; },
        definirTabuleiro: function (t, padroes) {
          tabuleiro = t;
          tabuleiroPadroes = [];
          for (var y = 0; y < ALT; y++) {
            var lp = [];
            for (var x = 0; x < LARG; x++) {
              var pat = (padroes && padroes[y] && padroes[y][x]) ? padroes[y][x] : (typeof t[y][x] === 'string' ? t[y][x] : (t[y] && t[y][x] ? 'T' : ''));
              lp.push(pat);
            }
            tabuleiroPadroes.push(lp);
          }
        },
        definirPeca: function (p) { peca = p; },
        fazerPeca: function (tipo, x, y) { return { tipo: tipo, m: FORMAS[tipo].slice(), x: x, y: y }; },
        matrizDe: function (tipo) { return FORMAS[tipo].slice(); },
        girarMatriz: girarMatriz,
        colide: colide,
        sortear: sortearPeca,
        definirPontos: function (v) { pontos = v; },
        definirLinhas: function (v) { linhas = v; },
        definirNivel: function (v) { nivel = v; }
      }
    };
    limparTabuleiro();
    proxima = novaPeca(sortearPeca());
    raiz.__tetris = api;
    return api;
  }

  raiz.criarTetris = criarTetris;
})(typeof window !== 'undefined' ? window : this);
