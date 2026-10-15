/* ============================================================================
   SPACE INVADERS — Motor Arcade Clássico de 1978
   ----------------------------------------------------------------------------
   - 55 invasores divididos em 5 fileiras (Squids, Crabs e Octopuses)
   - Animação de 2 quadros por alienígena em sincronia com a marcha
   - Marcha sonora de 4 tons descendentes que acelera conforme os invasores caem
   - Disco Voador Misterioso (UFO) com sirene sci-fi e pontuação surpresa (50-300)
   - 4 Barreiras de proteção (bunkers) destrutíveis bloco a bloco
   - Canhão laser do jogador com animação de destruição e tiros com recuo
   - Áudio sintetizado via Web Audio API (sem dependências externas)
   - Interface com suporte completo a teclado e toque responsivo
   ============================================================================ */
(function (raiz) {
  "use strict";

  const LARGURA = 480;
  const ALTURA = 640;

  /* ------------------------------- CORES ---------------------------------- */
  const CORES = {
    fundo: '#05070f',
    branco: '#f4f6fc',
    verde: '#55ff55',
    verdeEscuro: '#1e7a1e',
    ciano: '#38bdf8',
    rosa: '#f43f5e',
    amarelo: '#facc15',
    vermelho: '#ef4444',
    roxo: '#c084fc',
    cinza: '#64748b',
    cinzaEscuro: '#1e293b',
    borda: '#20293d'
  };

  /* ---------------------- SPRITES CLÁSSICOS (MATRIZES) ------------------- */
  // 1 = pixel aceso, 0 = transparente
  const SPRITES = {
    // Squid (Fileira superior, 30 pontos) — 8x8, 2 quadros
    squid1: [
      '00011000',
      '00111100',
      '01111110',
      '11011011',
      '11111111',
      '00100100',
      '01011010',
      '10100101'
    ],
    squid2: [
      '00011000',
      '00111100',
      '01111110',
      '11011011',
      '11111111',
      '01011010',
      '10000001',
      '01000010'
    ],
    // Crab (Fileiras do meio, 20 pontos) — 11x8, 2 quadros
    crab1: [
      '00100000100',
      '00010001000',
      '00111111100',
      '01101110110',
      '11111111111',
      '10111111101',
      '10100000101',
      '00011011000'
    ],
    crab2: [
      '00100000100',
      '10010001001',
      '10111111101',
      '11101110111',
      '11111111111',
      '01111111110',
      '00100000100',
      '01000000010'
    ],
    // Octopus (Fileiras de baixo, 10 pontos) — 12x8, 2 quadros
    octo1: [
      '000011110000',
      '011111111110',
      '111111111111',
      '111001100111',
      '111111111111',
      '000110011000',
      '001101101100',
      '110000000011'
    ],
    octo2: [
      '000011110000',
      '011111111110',
      '111111111111',
      '111001100111',
      '111111111111',
      '001100001100',
      '011011110110',
      '000100001000'
    ],
    // Canhão laser do jogador — 13x8
    canhao: [
      '0000001000000',
      '0000011100000',
      '0000011100000',
      '0111111111110',
      '1111111111111',
      '1111111111111',
      '1111111111111',
      '1111111111111'
    ],
    // Disco Voador Misterioso (UFO Saucer) — 16x7
    ufo: [
      '0000011111100000',
      '0001111111111000',
      '0011111111111100',
      '0110110110110110',
      '1111111111111111',
      '0011100110011100',
      '0001000000001000'
    ],
    // Explosão do alien — 8x8
    explosaoAlien: [
      '10000001',
      '01000010',
      '00100100',
      '00011000',
      '00011000',
      '00100100',
      '01000010',
      '10000001'
    ],
    // Explosão do jogador (quadro A e B)
    explosaoPlayerA: [
      '0010000001000',
      '0001000010000',
      '1000100100001',
      '0100011000010',
      '0011111111100',
      '0000111100000',
      '0101000010100',
      '1000000000010'
    ],
    explosaoPlayerB: [
      '0000100100000',
      '1000011000001',
      '0100111100010',
      '0011000011000',
      '0110000001100',
      '1000111100001',
      '0001000010000',
      '0010000001000'
    ]
  };

  /* ---------------------- MOTOR DE ÁUDIO RETRÔ --------------------------- */
  class AudioSpace {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.mutado = false;
      this.tonsMarcha = [58, 54, 50, 46]; // frequências graves da marcha
      this.ufoOsc = null;
      this.ufoGain = null;
    }

    iniciar() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      try {
        const AC = raiz.AudioContext || raiz.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.22;
        this.master.connect(this.ctx.destination);
      } catch (e) {
        this.ctx = null;
      }
    }

    mutar(v) {
      this.mutado = v !== undefined ? !!v : !this.mutado;
      if (this.master) this.master.gain.value = this.mutado ? 0 : 0.22;
      return this.mutado;
    }

    tom(freq, dur, tipo = 'square', vol = 0.2, deslize = 0) {
      if (this.mutado) return;
      this.iniciar();
      if (!this.ctx || !this.master) return;
      const c = this.ctx;
      const t = c.currentTime;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = tipo;
      o.frequency.setValueAtTime(Math.max(20, freq), t);
      if (deslize !== 0) {
        o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + deslize), t + dur);
      }
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.02);
    }

    ruido(dur = 0.15, vol = 0.25) {
      if (this.mutado) return;
      this.iniciar();
      if (!this.ctx || !this.master) return;
      const c = this.ctx;
      const len = Math.floor(c.sampleRate * dur);
      const b = c.createBuffer(1, len, c.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      }
      const s = c.createBufferSource();
      const g = c.createGain();
      s.buffer = b;
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      s.connect(g);
      g.connect(this.master);
      s.start(c.currentTime);
    }

    marcha(indice) {
      const f = this.tonsMarcha[indice % 4];
      this.tom(f, 0.08, 'square', 0.24, -4);
    }

    tiro() {
      // Tom agudo caindo com brilho característico do canhão laser
      this.tom(980, 0.12, 'square', 0.20, -560);
    }

    tiroAlien() {
      this.tom(340, 0.14, 'sawtooth', 0.15, -160);
    }

    explosaoAlien() {
      this.ruido(0.12, 0.28);
      this.tom(130, 0.14, 'triangle', 0.22, -60);
    }

    explosaoPlayer() {
      this.ruido(0.40, 0.40);
      this.tom(120, 0.35, 'sawtooth', 0.30, -80);
    }

    ufoInicia() {
      if (this.mutado || this.ufoOsc) return;
      this.iniciar();
      if (!this.ctx || !this.master) return;
      try {
        const c = this.ctx;
        this.ufoOsc = c.createOscillator();
        this.ufoGain = c.createGain();
        this.ufoOsc.type = 'sawtooth';
        this.ufoOsc.frequency.setValueAtTime(320, c.currentTime);
        this.ufoGain.gain.setValueAtTime(0.08, c.currentTime);
        // Oscilação LFO rápida para a sirene
        const lfo = c.createOscillator();
        const lfoGain = c.createGain();
        lfo.frequency.value = 6;
        lfoGain.gain.value = 120;
        lfo.connect(this.ufoOsc.frequency);
        lfo.start();
        this.ufoOsc.connect(this.ufoGain);
        this.ufoGain.connect(this.master);
        this.ufoOsc.start();
        this._lfo = lfo;
      } catch (e) {}
    }

    ufoPara() {
      if (this.ufoOsc) {
        try {
          this.ufoOsc.stop();
          this.ufoOsc.disconnect();
          if (this._lfo) this._lfo.stop();
        } catch (e) {}
        this.ufoOsc = null;
        this.ufoGain = null;
        this._lfo = null;
      }
    }

    bonus() {
      this.tom(520, 0.09, 'square', 0.22, 280);
      setTimeout(() => this.tom(780, 0.14, 'square', 0.22, 140), 90);
    }

    vitoria() {
      [440, 554, 659, 880].forEach((f, i) => {
        setTimeout(() => this.tom(f, 0.2, 'square', 0.18, 0), i * 130);
      });
    }

    fim() {
      this.tom(220, 0.3, 'triangle', 0.25, -90);
      setTimeout(() => this.tom(140, 0.5, 'triangle', 0.25, -60), 280);
    }
  }

  /* ============================ MOTOR DO JOGO ============================ */
  function criarSpaceInvaders(canvas, opcoes) {
    opcoes = opcoes || {};
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = false;

    const audio = new AudioSpace();
    if (opcoes.som === false) audio.mutar(true);

    const aoAtualizar = opcoes.aoAtualizar || function () {};

    /* ----------------------------- ESTADO -------------------------------- */
    let estado = 'title'; // 'title' | 'playing' | 'paused' | 'waveclear' | 'gameover' | 'victory'
    let pontos = 0;
    let recorde = lerRecorde();
    let vidas = 3;
    let onda = 1;
    let novoRecorde = false;
    let pausado = false;

    let tempoDecorrido = 0;
    let quadroNum = 0;
    let ultimoTempo = 0;
    let shake = 0;

    // Jogador (Canhão Laser)
    let player = {
      x: LARGURA / 2 - 14,
      y: 574,
      w: 28,
      h: 18,
      vel: 240,
      cooldown: 0,
      invulneravel: 0,
      morrendo: 0
    };

    // Invasores Alienígenas
    let aliens = [];
    let direcaoAlien = 1;      // 1 = direita, -1 = esquerda
    let alienPassoX = 8;
    let alienPassoY = 16;
    let timerMarcha = 0;
    let indiceMarcha = 0;
    let animQuadro = 0;        // 0 ou 1
    let explosaoTimer = 0;
    let explosaoAlien = null;  // { x, y, tempo }

    // Tiros
    let tirosPlayer = [];
    let tirosAlien = [];
    let maxTirosPlayer = 1;    // Regra clássica de 1 tiro por vez

    // Disco Voador (UFO)
    let ufo = null;
    let timerUfo = 20;

    // Barreiras de Proteção (Bunkers)
    let bunkers = [];

    // Partículas e Textos Flutuantes
    let particulas = [];
    let textosFlutuantes = [];

    // Estrelas de fundo
    const estrelas = [];
    for (let i = 0; i < 90; i++) {
      estrelas.push({
        x: Math.random() * LARGURA,
        y: Math.random() * ALTURA,
        tam: Math.random() < 0.75 ? 1 : 2,
        vel: 8 + Math.random() * 22,
        brilho: 0.2 + Math.random() * 0.7,
        fase: Math.random() * Math.PI * 2
      });
    }

    // Entradas do Jogador
    const teclas = { esq: false, dir: false, tiro: false };

    /* ---------------------- PERSISTÊNCIA DE RECORDE ----------------------- */
    function lerRecorde() {
      try {
        return parseInt(raiz.localStorage.getItem('space_invaders_top') || '0', 10) || 0;
      } catch (e) {
        return 0;
      }
    }

    function salvarRecorde() {
      if (pontos > recorde) {
        recorde = pontos;
        novoRecorde = true;
        try {
          raiz.localStorage.setItem('space_invaders_top', String(recorde));
        } catch (e) {}
      }
    }

    /* ---------------------- MONTAGEM DAS BARREIRAS ------------------------ */
    function montarBunkers() {
      bunkers = [];
      const moldeBunker = [
        '..########..',
        '.##########.',
        '############',
        '############',
        '############',
        '###......###',
        '##........##'
      ];
      const tamBloco = 4;
      const numBunkers = 4;
      const larguraBunker = moldeBunker[0].length * tamBloco; // 12 * 4 = 48px
      const espacamento = (LARGURA - numBunkers * larguraBunker) / (numBunkers + 1); // ~51px

      for (let b = 0; b < numBunkers; b++) {
        const bx = espacamento + b * (larguraBunker + espacamento);
        const by = 472;
        for (let r = 0; r < moldeBunker.length; r++) {
          for (let c = 0; c < moldeBunker[r].length; c++) {
            if (moldeBunker[r][c] === '#') {
              bunkers.push({
                x: bx + c * tamBloco,
                y: by + r * tamBloco,
                w: tamBloco,
                h: tamBloco,
                hp: 3 // 3 níveis de dano visual
              });
            }
          }
        }
      }
    }

    /* ------------------- MONTAGEM DA ONDA DE INVASORES -------------------- */
    function montarOnda() {
      aliens = [];
      direcaoAlien = 1;
      animQuadro = 0;
      indiceMarcha = 0;
      timerMarcha = 0;
      tirosPlayer = [];
      tirosAlien = [];
      particulas = [];
      textosFlutuantes = [];
      ufo = null;
      audio.ufoPara();
      timerUfo = 16 + Math.random() * 12;

      // 5 fileiras x 11 colunas = 55 invasores
      const cols = 11;
      const rows = 5;
      const espacoX = 34;
      const espacoY = 28;
      const larguraFrota = (cols - 1) * espacoX + 26;
      const inicioX = (LARGURA - larguraFrota) / 2;
      const inicioY = Math.min(100 + (onda - 1) * 16, 210); // Desce a cada onda

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let tipo = 0; // 0 = octopus (10 pts), 1 = crab (20 pts), 2 = squid (30 pts)
          let pontosAlien = 10;
          let w = 24, h = 16;
          let cor = CORES.verde;

          if (r === 0) {
            tipo = 2; // Squid
            pontosAlien = 30;
            w = 18; h = 18;
            cor = CORES.rosa;
          } else if (r <= 2) {
            tipo = 1; // Crab
            pontosAlien = 20;
            w = 22; h = 16;
            cor = CORES.ciano;
          } else {
            tipo = 0; // Octopus
            pontosAlien = 10;
            w = 24; h = 16;
            cor = CORES.verde;
          }

          aliens.push({
            x: inicioX + c * espacoX + (24 - w) / 2,
            y: inicioY + r * espacoY,
            w: w,
            h: h,
            row: r,
            col: c,
            tipo: tipo,
            pontos: pontosAlien,
            cor: cor,
            vivo: true
          });
        }
      }

      player.x = LARGURA / 2 - player.w / 2;
      player.cooldown = 0;
      player.invulneravel = 1.4;
      player.morrendo = 0;
    }

    function iniciarPartida() {
      pontos = 0;
      vidas = 3;
      onda = 1;
      novoRecorde = false;
      pausado = false;
      montarBunkers();
      montarOnda();
      estado = 'playing';
      audio.iniciar();
      audio.tom(440, 0.15, 'square', 0.2, 220);
      publicar();
    }

    function avancarOnda() {
      onda++;
      montarBunkers();
      montarOnda();
      estado = 'playing';
      audio.vitoria();
      publicar();
    }

    /* ------------------- EXPLOSÕES E PARTICULAS --------------------------- */
    function criarExplosao(x, y, cor, qtd = 12) {
      for (let i = 0; i < qtd; i++) {
        const ang = Math.random() * Math.PI * 2;
        const vel = 30 + Math.random() * 110;
        particulas.push({
          x: x,
          y: y,
          vx: Math.cos(ang) * vel,
          vy: Math.sin(ang) * vel,
          vida: 0.25 + Math.random() * 0.35,
          vidaMax: 0.6,
          tam: Math.floor(1 + Math.random() * 3),
          cor: cor
        });
      }
    }

    function adicionarTextoFlutuante(txt, x, y, cor) {
      textosFlutuantes.push({
        texto: txt,
        x: x,
        y: y,
        vy: -35,
        vida: 0.8,
        cor: cor
      });
    }

    /* ------------------- ATUALIZAÇÃO DA FÍSICA (UPDATE) ------------------- */
    function atualizar(dt) {
      quadroNum++;
      tempoDecorrido += dt;
      if (shake > 0) shake -= dt;

      // Estrelas sempre rolam no fundo
      for (let i = 0; i < estrelas.length; i++) {
        const s = estrelas[i];
        s.y += s.vel * dt;
        if (s.y > ALTURA) s.y = 0;
      }

      // Atualiza partículas
      for (let i = particulas.length - 1; i >= 0; i--) {
        const p = particulas[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 45 * dt; // gravidade sutil
        p.vida -= dt;
        if (p.vida <= 0) particulas.splice(i, 1);
      }

      // Textos flutuantes (+30, +100...)
      for (let i = textosFlutuantes.length - 1; i >= 0; i--) {
        const tf = textosFlutuantes[i];
        tf.y += tf.vy * dt;
        tf.vida -= dt;
        if (tf.vida <= 0) textosFlutuantes.splice(i, 1);
      }

      if (explosaoTimer > 0) {
        explosaoTimer -= dt;
        if (explosaoTimer <= 0) explosaoAlien = null;
      }

      if (estado !== 'playing') return;

      // Movimentação do jogador
      if (player.morrendo <= 0) {
        if (teclas.esq) player.x -= player.vel * dt;
        if (teclas.dir) player.x += player.vel * dt;
        player.x = Math.max(16, Math.min(LARGURA - player.w - 16, player.x));

        if (teclas.tiro) dispararPlayer();
      } else {
        player.morrendo -= dt;
        if (player.morrendo <= 0) {
          if (vidas <= 0) {
            estado = 'gameover';
            salvarRecorde();
            audio.fim();
            publicar();
            return;
          } else {
            player.x = LARGURA / 2 - player.w / 2;
            player.invulneravel = 2.0;
          }
        }
      }

      if (player.cooldown > 0) player.cooldown -= dt;
      if (player.invulneravel > 0) player.invulneravel -= dt;

      // Tiros do jogador
      for (let i = tirosPlayer.length - 1; i >= 0; i--) {
        const t = tirosPlayer[i];
        t.y += t.vy * dt;
        if (t.y < 50) {
          tirosPlayer.splice(i, 1);
        }
      }

      // Tiros dos alienígenas
      for (let i = tirosAlien.length - 1; i >= 0; i--) {
        const t = tirosAlien[i];
        t.y += t.vy * dt;
        if (t.y > ALTURA) {
          tirosAlien.splice(i, 1);
        }
      }

      // Contagem de alienígenas vivos
      const vivos = aliens.filter(a => a.vivo);
      if (vivos.length === 0) {
        audio.ufoPara();
        estado = 'waveclear';
        audio.vitoria();
        setTimeout(() => {
          if (estado === 'waveclear') avancarOnda();
        }, 1600);
        publicar();
        return;
      }

      // Ritmo da marcha (diminui o intervalo conforme os aliens morrem)
      // Com 55 aliens: ~0.80s por passo. Com 1 alien: ~0.045s (ritmo frenético!)
      const proporcaoVivos = vivos.length / 55;
      const intervaloMarcha = Math.max(0.045, 0.78 * Math.pow(proporcaoVivos, 1.15) - Math.min(0.08, (onda - 1) * 0.01));

      timerMarcha += dt;
      if (timerMarcha >= intervaloMarcha) {
        timerMarcha = 0;
        animQuadro = animQuadro === 0 ? 1 : 0;
        audio.marcha(indiceMarcha);
        indiceMarcha++;

        // Checa se algum alien atingiu a borda lateral
        let bateuBorda = false;
        let alienMaisBaixoY = 0;

        for (let i = 0; i < vivos.length; i++) {
          const a = vivos[i];
          if ((direcaoAlien > 0 && a.x + a.w >= LARGURA - 18) ||
              (direcaoAlien < 0 && a.x <= 18)) {
            bateuBorda = true;
          }
          if (a.y + a.h > alienMaisBaixoY) alienMaisBaixoY = a.y + a.h;
        }

        if (bateuBorda) {
          direcaoAlien = -direcaoAlien;
          for (let i = 0; i < vivos.length; i++) {
            vivos[i].y += alienPassoY;
          }
          // Se os alienígenas invadirem a linha dos canhões: Game Over instantâneo!
          if (alienMaisBaixoY + alienPassoY >= player.y) {
            vidas = 0;
            player.morrendo = 1.0;
            audio.explosaoPlayer();
            estado = 'gameover';
            salvarRecorde();
            audio.fim();
            publicar();
            return;
          }
        } else {
          for (let i = 0; i < vivos.length; i++) {
            vivos[i].x += direcaoAlien * alienPassoX;
          }
        }
      }

      // Disparo aleatório dos alienígenas (apenas os da frente da coluna podem atirar)
      const taxaTiroAlien = Math.max(0.4, 1.25 - (onda - 1) * 0.08);
      if (Math.random() < dt / taxaTiroAlien && vivos.length > 0) {
        // Encontra o alien mais baixo em colunas aleatórias
        const colunas = {};
        for (let i = 0; i < vivos.length; i++) {
          const a = vivos[i];
          if (!colunas[a.col] || a.y > colunas[a.col].y) {
            colunas[a.col] = a;
          }
        }
        const atiradores = Object.values(colunas);
        const escolhido = atiradores[Math.floor(Math.random() * atiradores.length)];
        if (escolhido) {
          tirosAlien.push({
            x: escolhido.x + escolhido.w / 2 - 1.5,
            y: escolhido.y + escolhido.h,
            w: 3,
            h: 9,
            vy: 165 + onda * 12,
            fase: Math.random() * Math.PI * 2
          });
          audio.tiroAlien();
        }
      }

      // Gerenciamento do Disco Voador (UFO)
      if (!ufo) {
        timerUfo -= dt;
        if (timerUfo <= 0) {
          const vemDaEsquerda = Math.random() < 0.5;
          ufo = {
            x: vemDaEsquerda ? -36 : LARGURA + 6,
            y: 68,
            w: 32,
            h: 14,
            vel: (vemDaEsquerda ? 1 : -1) * (85 + onda * 6)
          };
          audio.ufoInicia();
        }
      } else {
        ufo.x += ufo.vel * dt;
        if ((ufo.vel > 0 && ufo.x > LARGURA + 40) || (ufo.vel < 0 && ufo.x < -45)) {
          ufo = null;
          audio.ufoPara();
          timerUfo = 20 + Math.random() * 15;
        }
      }

      /* ------------------------- COLISÕES -------------------------------- */
      // Colisão: Tiros do Jogador vs Aliens / Bunkers / UFO
      for (let i = tirosPlayer.length - 1; i >= 0; i--) {
        const tp = tirosPlayer[i];
        let tiroDestruido = false;

        // Contra Bunkers (de baixo para cima)
        for (let b = 0; b < bunkers.length; b++) {
          const bk = bunkers[b];
          if (bk.hp > 0 && retangulosColidem(tp, bk)) {
            bk.hp--;
            criarExplosao(bk.x + 2, bk.y + 2, CORES.verde, 4);
            tirosPlayer.splice(i, 1);
            tiroDestruido = true;
            break;
          }
        }
        if (tiroDestruido) continue;

        // Contra Aliens
        for (let a = 0; a < vivos.length; a++) {
          const al = vivos[a];
          if (al.vivo && retangulosColidem(tp, al)) {
            al.vivo = false;
            pontos += al.pontos;
            salvarRecorde();
            criarExplosao(al.x + al.w / 2, al.y + al.h / 2, al.cor, 14);
            explosaoAlien = { x: al.x, y: al.y, w: al.w, h: al.h, cor: al.cor };
            explosaoTimer = 0.16;
            adicionarTextoFlutuante('+' + al.pontos, al.x, al.y - 4, al.cor);
            audio.explosaoAlien();
            tirosPlayer.splice(i, 1);
            tiroDestruido = true;
            publicar();
            break;
          }
        }
        if (tiroDestruido) continue;

        // Contra o Disco Voador (UFO)
        if (ufo && retangulosColidem(tp, ufo)) {
          const valoresUfo = [50, 100, 150, 200, 300];
          const pontosUfo = valoresUfo[Math.floor(Math.random() * valoresUfo.length)];
          pontos += pontosUfo;
          salvarRecorde();
          criarExplosao(ufo.x + ufo.w / 2, ufo.y + ufo.h / 2, CORES.vermelho, 24);
          adicionarTextoFlutuante('+' + pontosUfo, ufo.x, ufo.y - 6, CORES.amarelo);
          audio.ufoPara();
          audio.bonus();
          ufo = null;
          timerUfo = 22 + Math.random() * 15;
          tirosPlayer.splice(i, 1);
          tiroDestruido = true;
          publicar();
        }
      }

      // Colisão: Tiros dos Aliens vs Bunkers / Jogador
      for (let i = tirosAlien.length - 1; i >= 0; i--) {
        const ta = tirosAlien[i];
        let tiroDestruido = false;

        // Contra Bunkers (de cima para baixo)
        for (let b = 0; b < bunkers.length; b++) {
          const bk = bunkers[b];
          if (bk.hp > 0 && retangulosColidem(ta, bk)) {
            bk.hp--;
            criarExplosao(bk.x + 2, bk.y + 2, CORES.verde, 4);
            tirosAlien.splice(i, 1);
            tiroDestruido = true;
            break;
          }
        }
        if (tiroDestruido) continue;

        // Contra o Jogador
        if (player.morrendo <= 0 && player.invulneravel <= 0 && retangulosColidem(ta, player)) {
          tirosAlien.splice(i, 1);
          vidas--;
          player.morrendo = 1.0;
          shake = 0.3;
          criarExplosao(player.x + player.w / 2, player.y + player.h / 2, CORES.ciano, 24);
          audio.explosaoPlayer();
          publicar();
          break;
        }
      }

      // Limpeza de blocos de bunker com hp <= 0
      bunkers = bunkers.filter(b => b.hp > 0);
    }

    function retangulosColidem(a, b) {
      return a.x < b.x + b.w &&
             a.x + a.w > b.x &&
             a.y < b.y + b.h &&
             a.y + a.h > b.y;
    }

    function dispararPlayer() {
      if (player.morrendo > 0 || player.cooldown > 0) return;
      if (tirosPlayer.length >= maxTirosPlayer) return;
      tirosPlayer.push({
        x: player.x + player.w / 2 - 1.5,
        y: player.y - 8,
        w: 3,
        h: 11,
        vy: -420
      });
      player.cooldown = 0.28;
      audio.tiro();
    }

    /* -------------------------- DESENHO (RENDER) -------------------------- */
    function desenharMatriz(matriz, px, py, escala, cor) {
      ctx.fillStyle = cor;
      for (let r = 0; r < matriz.length; r++) {
        const linha = matriz[r];
        for (let c = 0; c < linha.length; c++) {
          if (linha[c] === '1') {
            ctx.fillRect(
              Math.round(px + c * escala),
              Math.round(py + r * escala),
              Math.ceil(escala),
              Math.ceil(escala)
            );
          }
        }
      }
    }

    function desenhar() {
      ctx.save();
      // Fundo espacial profundo
      ctx.fillStyle = CORES.fundo;
      ctx.fillRect(0, 0, LARGURA, ALTURA);

      if (shake > 0) {
        ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 5);
      }

      // Estrelas piscantes
      for (let i = 0; i < estrelas.length; i++) {
        const s = estrelas[i];
        const alfa = s.brilho * (0.6 + 0.4 * Math.sin(tempoDecorrido * 3 + s.fase));
        ctx.fillStyle = s.tam === 2 ? CORES.ciano : '#ffffff';
        ctx.globalAlpha = Math.max(0.1, Math.min(1, alfa));
        ctx.fillRect(Math.floor(s.x), Math.floor(s.y), s.tam, s.tam);
      }
      ctx.globalAlpha = 1.0;

      // Linha superior de status / moldura
      ctx.strokeStyle = CORES.borda;
      ctx.lineWidth = 1;
      ctx.strokeRect(8, 8, LARGURA - 16, ALTURA - 16);

      // HUD Superior: SCORE <1>, HI-SCORE, ONDA, VIDAS
      ctx.font = '12px ui-monospace, "Cascadia Mono", monospace';
      ctx.fillStyle = CORES.cinza;
      ctx.fillText('SCORE <1>', 24, 28);
      ctx.fillText('HI-SCORE', LARGURA / 2 - 32, 28);
      ctx.fillText('ONDA', LARGURA - 76, 28);

      ctx.font = 'bold 15px ui-monospace, "Cascadia Mono", monospace';
      ctx.fillStyle = CORES.branco;
      ctx.fillText(String(pontos).padStart(6, '0'), 24, 46);
      ctx.fillStyle = novoRecorde ? CORES.amarelo : CORES.ciano;
      ctx.fillText(String(recorde).padStart(6, '0'), LARGURA / 2 - 32, 46);
      ctx.fillStyle = CORES.rosa;
      ctx.fillText(String(onda).padStart(2, '0'), LARGURA - 64, 46);

      // Linha divisória da arena
      ctx.strokeStyle = CORES.cinzaEscuro;
      ctx.beginPath();
      ctx.moveTo(16, 56);
      ctx.lineTo(LARGURA - 16, 56);
      ctx.stroke();

      // Bunkers (Barreiras de Proteção)
      for (let i = 0; i < bunkers.length; i++) {
        const b = bunkers[i];
        // Cor muda sutilmente conforme o dano
        ctx.fillStyle = b.hp === 3 ? CORES.verde : (b.hp === 2 ? '#44c844' : '#2d842d');
        ctx.fillRect(b.x, b.y, b.w, b.h);
      }

      // Disco Voador (UFO)
      if (ufo) {
        desenharMatriz(SPRITES.ufo, ufo.x, ufo.y, 2.0, CORES.vermelho);
        // Luzes piscantes na base do UFO
        ctx.fillStyle = Math.floor(tempoDecorrido * 12) % 2 === 0 ? CORES.amarelo : CORES.branco;
        ctx.fillRect(ufo.x + 8, ufo.y + 11, 4, 2);
        ctx.fillRect(ufo.x + ufo.w - 12, ufo.y + 11, 4, 2);
      }

      // Invasores Alienígenas
      for (let i = 0; i < aliens.length; i++) {
        const a = aliens[i];
        if (!a.vivo) continue;
        let spriteMatriz;
        if (a.tipo === 2) {
          spriteMatriz = animQuadro === 0 ? SPRITES.squid1 : SPRITES.squid2;
        } else if (a.tipo === 1) {
          spriteMatriz = animQuadro === 0 ? SPRITES.crab1 : SPRITES.crab2;
        } else {
          spriteMatriz = animQuadro === 0 ? SPRITES.octo1 : SPRITES.octo2;
        }
        desenharMatriz(spriteMatriz, a.x, a.y, 2.0, a.cor);
      }

      // Explosão temporária do alienígena abatido
      if (explosaoAlien && explosaoTimer > 0) {
        desenharMatriz(SPRITES.explosaoAlien, explosaoAlien.x, explosaoAlien.y, 2.2, explosaoAlien.cor);
      }

      // Jogador (Canhão Laser)
      if (player.morrendo > 0) {
        const spr = Math.floor(tempoDecorrido * 14) % 2 === 0 ? SPRITES.explosaoPlayerA : SPRITES.explosaoPlayerB;
        desenharMatriz(spr, player.x, player.y, 2.15, CORES.rosa);
      } else {
        const pisca = player.invulneravel > 0 && Math.floor(tempoDecorrido * 14) % 2 === 0;
        if (!pisca) {
          desenharMatriz(SPRITES.canhao, player.x, player.y, 2.15, CORES.verde);
        }
      }

      // Tiros do Jogador
      for (let i = 0; i < tirosPlayer.length; i++) {
        const t = tirosPlayer[i];
        ctx.fillStyle = CORES.amarelo;
        ctx.fillRect(t.x, t.y, t.w, t.h);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(t.x + 1, t.y + 2, 1, t.h - 4);
      }

      // Tiros dos Aliens (feixes zigue-zague ou retos)
      for (let i = 0; i < tirosAlien.length; i++) {
        const t = tirosAlien[i];
        ctx.fillStyle = CORES.rosa;
        ctx.fillRect(t.x, t.y, t.w, t.h);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(t.x + 0.5, t.y + 1, 2, t.h - 2);
      }

      // Partículas
      for (let i = 0; i < particulas.length; i++) {
        const p = particulas[i];
        ctx.fillStyle = p.cor;
        ctx.globalAlpha = Math.max(0, p.vida / p.vidaMax);
        ctx.fillRect(p.x, p.y, p.tam, p.tam);
      }
      ctx.globalAlpha = 1.0;

      // Textos Flutuantes de Pontos (+30, +100...)
      ctx.font = 'bold 12px ui-monospace, "Cascadia Mono", monospace';
      for (let i = 0; i < textosFlutuantes.length; i++) {
        const tf = textosFlutuantes[i];
        ctx.fillStyle = tf.cor;
        ctx.globalAlpha = Math.max(0, tf.vida / 0.8);
        ctx.fillText(tf.texto, tf.x, tf.y);
      }
      ctx.globalAlpha = 1.0;

      // Rodapé: Linha de base verde e ícones de vidas restantes
      ctx.strokeStyle = CORES.verde;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(16, 608);
      ctx.lineTo(LARGURA - 16, 608);
      ctx.stroke();

      ctx.font = 'bold 12px ui-monospace, "Cascadia Mono", monospace';
      ctx.fillStyle = CORES.verde;
      ctx.fillText(String(Math.max(0, vidas)), 24, 626);

      // Ícones dos canhões para as vidas restantes
      for (let i = 0; i < Math.max(0, vidas - 1); i++) {
        desenharMatriz(SPRITES.canhao, 44 + i * 28, 614, 1.4, CORES.verde);
      }

      ctx.fillStyle = CORES.cinza;
      ctx.fillText('SPACE INVADERS // 1978', LARGURA - 180, 626);

      // Telas de Título / Pausa / Fim de Jogo
      if (estado === 'title') {
        desenharTelaTitulo();
      } else if (estado === 'paused') {
        desenharOverlay('PAUSADO', 'PRESSIONE P OU TOQUE PARA CONTINUAR', CORES.ciano);
      } else if (estado === 'waveclear') {
        desenharOverlay('SETOR LIMPO!', 'PREPARANDO PRÓXIMA ONDA...', CORES.verde);
      } else if (estado === 'gameover') {
        desenharTelaFim();
      }

      // Efeito Scanlines CRT muito sutil
      ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
      for (let y = 0; y < ALTURA; y += 4) {
        ctx.fillRect(0, y, LARGURA, 1);
      }

      ctx.restore();
    }

    /* ----------------------- TELAS E OVERLAYS ----------------------------- */
    function desenharTelaTitulo() {
      ctx.fillStyle = 'rgba(5, 7, 15, 0.90)';
      ctx.fillRect(28, 70, LARGURA - 56, ALTURA - 140);
      ctx.strokeStyle = CORES.borda;
      ctx.strokeRect(28, 70, LARGURA - 56, ALTURA - 140);

      ctx.font = 'bold 26px ui-monospace, "Cascadia Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = CORES.verde;
      ctx.fillText('SPACE INVADERS', LARGURA / 2, 130);

      ctx.font = '11px ui-monospace, "Cascadia Mono", monospace';
      ctx.fillStyle = CORES.cinza;
      ctx.fillText('* TABELA DE PONTUAÇÃO *', LARGURA / 2, 172);

      // Tabela de pontuação clássica
      desenharMatriz(SPRITES.ufo, LARGURA / 2 - 80, 204, 1.8, CORES.vermelho);
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.fillStyle = CORES.vermelho;
      ctx.textAlign = 'left';
      ctx.fillText('= ? MISTÉRIO (50 - 300)', LARGURA / 2 - 40, 218);

      desenharMatriz(SPRITES.squid1, LARGURA / 2 - 76, 246, 2.0, CORES.rosa);
      ctx.fillStyle = CORES.rosa;
      ctx.fillText('= 30 PONTOS', LARGURA / 2 - 40, 260);

      desenharMatriz(SPRITES.crab1, LARGURA / 2 - 78, 288, 2.0, CORES.ciano);
      ctx.fillStyle = CORES.ciano;
      ctx.fillText('= 20 PONTOS', LARGURA / 2 - 40, 302);

      desenharMatriz(SPRITES.octo1, LARGURA / 2 - 80, 330, 2.0, CORES.verde);
      ctx.fillStyle = CORES.verde;
      ctx.fillText('= 10 PONTOS', LARGURA / 2 - 40, 344);

      // Canhão do jogador
      desenharMatriz(SPRITES.canhao, LARGURA / 2 - 14, 390, 2.15, CORES.verde);

      // Instrução para começar
      ctx.textAlign = 'center';
      const pisca = Math.sin(tempoDecorrido * 4) > 0;
      ctx.font = 'bold 15px ui-monospace, monospace';
      ctx.fillStyle = pisca ? CORES.amarelo : 'transparent';
      ctx.fillText('PRESSIONE ENTER OU TOQUE', LARGURA / 2, 452);

      ctx.font = '12px ui-monospace, monospace';
      ctx.fillStyle = CORES.cinza;
      ctx.fillText('← → ou A / D movem o canhão', LARGURA / 2, 490);
      ctx.fillText('ESPAÇO dispara · P pausa · M som', LARGURA / 2, 510);
      ctx.fillText('RECORDE ATUAL: ' + String(recorde).padStart(6, '0'), LARGURA / 2, 545);

      ctx.textAlign = 'left';
    }

    function desenharOverlay(titulo, subtitulo, cor) {
      ctx.fillStyle = 'rgba(5, 7, 15, 0.88)';
      ctx.fillRect(40, 240, LARGURA - 80, 140);
      ctx.strokeStyle = cor;
      ctx.lineWidth = 2;
      ctx.strokeRect(40, 240, LARGURA - 80, 140);

      ctx.textAlign = 'center';
      ctx.font = 'bold 24px ui-monospace, "Cascadia Mono", monospace';
      ctx.fillStyle = cor;
      ctx.fillText(titulo, LARGURA / 2, 295);

      ctx.font = '11px ui-monospace, "Cascadia Mono", monospace';
      ctx.fillStyle = CORES.branco;
      ctx.fillText(subtitulo, LARGURA / 2, 335);
      ctx.textAlign = 'left';
    }

    function desenharTelaFim() {
      ctx.fillStyle = 'rgba(5, 7, 15, 0.92)';
      ctx.fillRect(40, 210, LARGURA - 80, 220);
      ctx.strokeStyle = CORES.rosa;
      ctx.lineWidth = 2;
      ctx.strokeRect(40, 210, LARGURA - 80, 220);

      ctx.textAlign = 'center';
      ctx.font = 'bold 28px ui-monospace, "Cascadia Mono", monospace';
      ctx.fillStyle = CORES.rosa;
      ctx.fillText('GAME OVER', LARGURA / 2, 265);

      ctx.font = '14px ui-monospace, monospace';
      ctx.fillStyle = CORES.branco;
      ctx.fillText('PONTUAÇÃO FINAL: ' + String(pontos).padStart(6, '0'), LARGURA / 2, 305);

      if (novoRecorde) {
        ctx.font = 'bold 13px ui-monospace, monospace';
        ctx.fillStyle = CORES.amarelo;
        ctx.fillText('★ NOVO RECORDE ALCANÇADO! ★', LARGURA / 2, 335);
      } else {
        ctx.font = '12px ui-monospace, monospace';
        ctx.fillStyle = CORES.cinza;
        ctx.fillText('RECORDE: ' + String(recorde).padStart(6, '0'), LARGURA / 2, 335);
      }

      ctx.font = 'bold 14px ui-monospace, monospace';
      const pisca = Math.sin(tempoDecorrido * 4) > 0;
      ctx.fillStyle = pisca ? CORES.verde : 'transparent';
      ctx.fillText('PRESSIONE ENTER PARA JOGAR', LARGURA / 2, 385);

      ctx.textAlign = 'left';
    }

    /* ------------------------ LAÇO PRINCIPAL ------------------------------ */
    function quadro(t) {
      if (!ultimoTempo) ultimoTempo = t;
      const dt = Math.min(0.04, Math.max(0, (t - ultimoTempo) / 1000));
      ultimoTempo = t;

      if (!pausado) {
        atualizar(dt);
      }
      desenhar();
      raiz.requestAnimationFrame(quadro);
    }

    /* ------------------------ COMUNICAÇÃO EXTERNA ------------------------- */
    function publicar() {
      aoAtualizar({
        estado: estado,
        pontos: pontos,
        recorde: recorde,
        vidas: vidas,
        onda: onda,
        novoRecorde: novoRecorde,
        som: !audio.mutado,
        pausado: pausado
      });
    }

    function alternarPausa() {
      if (estado === 'playing') {
        pausado = true;
        estado = 'paused';
      } else if (estado === 'paused') {
        pausado = false;
        estado = 'playing';
      }
      publicar();
    }

    /* --------------------------- API PÚBLICA ------------------------------ */
    const api = {
      iniciar: function () {
        montarBunkers();
        montarOnda();
        publicar();
        raiz.requestAnimationFrame(quadro);
      },
      acao: function (nome) {
        if (nome === 'comecar' || nome === 'reiniciar') {
          iniciarPartida();
        } else if (nome === 'pausa') {
          alternarPausa();
        } else if (nome === 'som') {
          const m = audio.mutar();
          publicar();
          return !m;
        }
      },
      dados: function () {
        const vivos = aliens.filter(a => a.vivo).length;
        return {
          estado: estado,
          pontos: pontos,
          recorde: recorde,
          vidas: vidas,
          onda: onda,
          aliensVivos: vivos,
          totalAliens: aliens.length,
          novoRecorde: novoRecorde,
          som: !audio.mutado,
          pausado: pausado
        };
      },
      entrada: {
        esquerda: function (ativo) { teclas.esq = !!ativo; },
        direita: function (ativo) { teclas.dir = !!ativo; },
        disparar: function (ativo) {
          teclas.tiro = !!ativo;
          if (ativo) {
            audio.iniciar();
            if (estado === 'title' || estado === 'gameover') {
              iniciarPartida();
            } else if (estado === 'paused') {
              alternarPausa();
            } else if (estado === 'playing') {
              dispararPlayer();
            }
          }
        },
        mover: function (dx) {
          player.x = Math.max(16, Math.min(LARGURA - player.w - 16, player.x + dx));
        }
      },
      _teste: {
        definirEstado: function (e) { estado = e; },
        definirPontos: function (p) { pontos = p; salvarRecorde(); },
        definirVidas: function (v) { vidas = v; },
        player: function () { return player; },
        aliens: function () { return aliens; },
        bunkers: function () { return bunkers; },
        tirosPlayer: function () { return tirosPlayer; },
        tirosAlien: function () { return tirosAlien; },
        ufo: function () { return ufo; },
        criarUfo: function () {
          ufo = { x: 100, y: 68, w: 32, h: 14, vel: 80 };
          return ufo;
        },
        passo: function (dt) { atualizar(dt); },
        iniciarPartida: iniciarPartida
      }
    };

    return api;
  }

  raiz.criarSpaceInvaders = criarSpaceInvaders;
})(typeof window !== 'undefined' ? window : this);
