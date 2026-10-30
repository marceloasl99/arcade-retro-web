/* ============================================================================
   THE WALL — Tabuleiro de pinos (estilo programa de auditório)
   ----------------------------------------------------------------------------
   - A bolinha é solta do topo e desce batendo em uma grade de pinos
   - Você escolhe onde soltar (setas / A-D, mouse ou toque); o resto é sorte
   - 9 escaninhos no fundo, com valores de 50 a 1000 pontos
   - Os escaninhos do meio pagam pouco, os das pontas pagam muito
   - 10 bolinhas por partida e recorde salvo no navegador
   - Áudio sintetizado via Web Audio API (sem dependências externas)
   - Interface com suporte completo a teclado, mouse e toque
   ============================================================================ */
(function (raiz) {
  "use strict";

  const LARGURA_BASE = 480;       // tamanho de referência; redimensionar() adapta à área da tela
  const ALTURA_BASE = 640;
  const PAREDE = 16;              // paredes laterais do tabuleiro
  const TOPO_TAB = 96;            // topo da área do tabuleiro (onde fica o marcador)
  const CHAO = 612;               // fundo dos escaninhos (onde a bolinha para)
  const LINHA_PINOS_Y = 130;      // altura da primeira fileira de pinos
  const ESPACO_PINO_X = 44;
  const ESPACO_PINO_Y = 36;
  const PINOS_FILEIRAS = 11;
  const PINO_R = 4;
  const BOLA_R = 6;
  const GRAVIDADE = 1000;         // px/s²
  const QUIQUE = 0.5;             // fração da velocidade que sobra depois de cada batida
  const ACASO = 90;               // desvio lateral aleatório a cada batida (px/s)
  const ESCANINHOS = 9;
  const ESC_Y = 548;              // topo dos escaninhos (divisórias)
  const VALORES = [1000, 500, 250, 100, 50, 100, 250, 500, 1000];
  const CORES_ESCANINHO = ['#f97316', '#ef4444', '#a855f7', '#3b82f6', '#22c55e', '#3b82f6', '#a855f7', '#ef4444', '#f97316'];
  const BOLAS_POR_PARTIDA = 10;
  const VEL_MARCADOR = 280;       // px/s
  const MARGEM_MARCADOR = 36;
  const BOLA_Y0 = 100;            // altura de onde a bolinha é solta

  const CORES = {
    fundo: '#05070f',
    branco: '#f4f6fc',
    cinza: '#64748b',
    parede: '#334155',
    ouro: '#fbbf24',
    pino: '#fde047',
    rosa: '#f43f5e',
    verde: '#55ff55',
    ciano: '#38bdf8'
  };


  /* ---------------------- MOTOR DE ÁUDIO RETRÔ --------------------------- */
  class AudioWall {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.mutado = false;
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
        this.master.gain.value = 0.2;
        this.master.connect(this.ctx.destination);
      } catch (e) {
        this.ctx = null;
      }
    }

    mutar(v) {
      this.mutado = v !== undefined ? !!v : !this.mutado;
      if (this.master) this.master.gain.value = this.mutado ? 0 : 0.2;
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

    solta() { this.tom(660, 0.08, 'triangle', 0.2, -200); }
    pino(forca) { this.tom(1200 + Math.random() * 400, 0.03, 'square', Math.min(0.08, 0.02 + forca * 0.0003)); }

    pagamento(valor) {
      const alto = valor >= 500;
      this.tom(alto ? 660 : 440, 0.12, 'square', 0.18, 220);
      setTimeout(() => this.tom(alto ? 880 : 660, 0.16, 'square', 0.16), 110);
    }

    fim() {
      this.tom(220, 0.3, 'triangle', 0.25, -90);
      setTimeout(() => this.tom(140, 0.5, 'triangle', 0.25, -60), 280);
    }
  }

  /* ============================ MOTOR DO JOGO ============================ */
  function criarTheWall(canvas, opcoes) {
    opcoes = opcoes || {};
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = false;

    const audio = new AudioWall();
    if (opcoes.som === false) audio.mutar(true);

    const aoAtualizar = opcoes.aoAtualizar || function () {};

    // Layout: recalculado por redimensionar() conforme o tamanho da área de jogo
    let LARGURA = LARGURA_BASE;
    let ALTURA = ALTURA_BASE;
    let CHAO = ALTURA - 28;
    let ESC_Y = CHAO - 64;
    let ESC_W = (LARGURA - 2 * PAREDE) / ESCANINHOS;
    let PINOS = [];

    /* ----------------------------- ESTADO -------------------------------- */
    let estado = 'title';           // 'title' | 'playing' | 'paused' | 'gameover'
    let pontos = 0;
    let recorde = lerRecorde();
    let novoRecorde = false;
    let bolasRestantes = BOLAS_POR_PARTIDA;
    let pausado = false;
    let tempoDecorrido = 0;
    let ultimoTempo = 0;
    let marcadorX = LARGURA / 2;
    let escaninhoAceso = -1;
    let timerBrilho = 0;
    const teclas = { esq: false, dir: false };
    const bola = { x: LARGURA / 2, y: BOLA_Y0, vx: 0, vy: 0, ativa: false };
    let particulas = [];
    let textosFlutuantes = [];

    /* ---------------------- PERSISTÊNCIA DE RECORDE ----------------------- */
    function lerRecorde() {
      try {
        return parseInt(raiz.localStorage.getItem('the_wall_top') || '0', 10) || 0;
      } catch (e) {
        return 0;
      }
    }

    function salvarRecorde() {
      if (pontos > recorde) {
        recorde = pontos;
        novoRecorde = true;
        try {
          raiz.localStorage.setItem('the_wall_top', String(recorde));
        } catch (e) {}
      }
    }

    function adicionarTexto(txt, x, y, cor) {
      textosFlutuantes.push({ texto: txt, x: x, y: y, vida: 0.8, cor: cor });
    }

    function criarExplosao(x, y, cor, qtd) {
      for (let i = 0; i < qtd; i++) {
        const ang = Math.random() * Math.PI * 2;
        const vel = 30 + Math.random() * 90;
        particulas.push({
          x: x,
          y: y,
          vx: Math.cos(ang) * vel,
          vy: Math.sin(ang) * vel,
          vida: 0.3 + Math.random() * 0.3,
          vidaMax: 0.6,
          cor: cor
        });
      }
    }

    /* ------------------------ BOLINHA E ESCANINHOS ----------------------- */
    // Grade de pinos em zigue-zague. A distância entre pinos vizinhos fica em torno de 36 px:
    // assim não sobra nenhuma coluna vertical livre (a bolinha não consegue cair reta, nem
    // mesmo pelas laterais), e a primeira e a última fileira ficam perto das paredes.
    function gerarPinos() {
      const k = Math.max(1, Math.round((LARGURA - 48) / 72));   // meia-quantidade de pinos por fileira
      const espaco = (LARGURA - 48) / (2 * k);
      PINOS = [];
      for (let l = 0; l < PINOS_FILEIRAS; l++) {
        const n = l % 2 === 0 ? 2 * k + 1 : 2 * k;
        for (let i = 0; i < n; i++) {
          PINOS.push({
            x: LARGURA / 2 + (i - (n - 1) / 2) * espaco,
            y: LINHA_PINOS_Y + l * ESPACO_PINO_Y
          });
        }
      }
      for (let j = 1; j < ESCANINHOS; j++) {
        PINOS.push({ x: PAREDE + j * ESC_W, y: ESC_Y });
      }
    }

    function redimensionar(w, h) {
      LARGURA = w;
      ALTURA = h;
      CHAO = ALTURA - 28;
      ESC_Y = CHAO - 64;
      ESC_W = (LARGURA - 2 * PAREDE) / ESCANINHOS;
      gerarPinos();
      marcadorX = Math.max(MARGEM_MARCADOR, Math.min(LARGURA - MARGEM_MARCADOR, marcadorX));
    }

    function soltarBola() {
      if (bola.ativa || bolasRestantes <= 0) return;
      bolasRestantes--;
      bola.ativa = true;
      bola.x = marcadorX;
      bola.y = BOLA_Y0;
      bola.vx = 0;
      bola.vy = 0;
      audio.solta();
      publicar();
    }

    function pousar() {
      bola.ativa = false;
      const idx = Math.max(0, Math.min(ESCANINHOS - 1, Math.floor((bola.x - PAREDE) / ESC_W)));
      const valor = VALORES[idx];
      const xCentro = PAREDE + idx * ESC_W + ESC_W / 2;
      pontos += valor;
      escaninhoAceso = idx;
      timerBrilho = 1.2;
      adicionarTexto('+' + valor, xCentro - 16, CHAO - 26, CORES_ESCANINHO[idx]);
      criarExplosao(xCentro, CHAO - 8, CORES_ESCANINHO[idx], 16);
      audio.pagamento(valor);
      salvarRecorde();
      if (bolasRestantes <= 0) fimDeJogo();
      publicar();
    }

    function fimDeJogo() {
      estado = 'gameover';
      pausado = false;
      salvarRecorde();
      audio.fim();
    }

    /* ------------------- ATUALIZAÇÃO DA FÍSICA (UPDATE) ------------------- */
    function atualizar(dt) {
      tempoDecorrido += dt;

      for (let i = particulas.length - 1; i >= 0; i--) {
        const p = particulas[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 200 * dt;
        p.vida -= dt;
        if (p.vida <= 0) particulas.splice(i, 1);
      }
      for (let i = textosFlutuantes.length - 1; i >= 0; i--) {
        const tf = textosFlutuantes[i];
        tf.y -= 30 * dt;
        tf.vida -= dt;
        if (tf.vida <= 0) textosFlutuantes.splice(i, 1);
      }
      if (timerBrilho > 0) timerBrilho -= dt;

      if (estado !== 'playing') return;

      if (teclas.esq) marcadorX -= VEL_MARCADOR * dt;
      if (teclas.dir) marcadorX += VEL_MARCADOR * dt;
      marcadorX = Math.max(MARGEM_MARCADOR, Math.min(LARGURA - MARGEM_MARCADOR, marcadorX));

      if (!bola.ativa) return;

      // Passos curtos para a bolinha nunca atravessar um pino
      const passos = Math.max(1, Math.ceil(Math.hypot(bola.vx, bola.vy) * dt / 3));
      for (let i = 0; i < passos; i++) {
        if (!bola.ativa || estado !== 'playing') break;
        moverBola(dt / passos);
      }
    }

    function moverBola(h) {
      bola.vy += GRAVIDADE * h;
      bola.x += bola.vx * h;
      bola.y += bola.vy * h;

      // Paredes laterais do tabuleiro
      if (bola.x - BOLA_R < PAREDE) {
        bola.x = PAREDE + BOLA_R;
        bola.vx = Math.abs(bola.vx) * QUIQUE;
      } else if (bola.x + BOLA_R > LARGURA - PAREDE) {
        bola.x = LARGURA - PAREDE - BOLA_R;
        bola.vx = -Math.abs(bola.vx) * QUIQUE;
      }

      // Pinos: ricocheteiam a bolinha, com um pouco de acaso a cada batida
      const soma = BOLA_R + PINO_R;
      for (let i = 0; i < PINOS.length; i++) {
        const p = PINOS[i];
        const dx = bola.x - p.x;
        const dy = bola.y - p.y;
        const distQ = dx * dx + dy * dy;
        if (distQ >= soma * soma || distQ === 0) continue;

        const dist = Math.sqrt(distQ);
        const nx = dx / dist;
        const ny = dy / dist;
        // empurra a bolinha para fora do pino
        bola.x = p.x + nx * soma;
        bola.y = p.y + ny * soma;

        const vn = bola.vx * nx + bola.vy * ny;
        if (vn < 0) {
          bola.vx -= (1 + QUIQUE) * vn * nx;
          bola.vy -= (1 + QUIQUE) * vn * ny;
          bola.vx += (Math.random() - 0.5) * ACASO;
          audio.pino(-vn);
        }
      }

      // Divisórias verticais dos escaninhos: a bolinha não passa de um para o outro
      for (let k = 1; k < ESCANINHOS; k++) {
        const xd = PAREDE + k * ESC_W;
        if (bola.y > ESC_Y && Math.abs(bola.x - xd) < BOLA_R + 1) {
          const aEsquerda = bola.x < xd;
          bola.x = aEsquerda ? xd - BOLA_R - 1 : xd + BOLA_R + 1;
          bola.vx = aEsquerda ? -Math.abs(bola.vx) * QUIQUE : Math.abs(bola.vx) * QUIQUE;
        }
      }

      // Chegou ao fundo: cai no escaninho que está embaixo dela
      if (bola.y + BOLA_R >= CHAO) {
        bola.y = CHAO - BOLA_R;
        pousar();
      }
    }

    function iniciarPartida() {
      pontos = 0;
      novoRecorde = false;
      bolasRestantes = BOLAS_POR_PARTIDA;
      bola.ativa = false;
      pausado = false;
      particulas = [];
      textosFlutuantes = [];
      estado = 'playing';
      audio.iniciar();
      publicar();
    }

    function alternarPausa() {
      if (estado === 'playing') {
        estado = 'paused';
        pausado = true;
      } else if (estado === 'paused') {
        estado = 'playing';
        pausado = false;
      }
      publicar();
    }

    /* -------------------------- DESENHO (RENDER) -------------------------- */
    function desenhar() {
      const isPt = (typeof window !== 'undefined' && window.obterIdioma && window.obterIdioma() === 'pt');
      ctx.save();
      ctx.fillStyle = CORES.fundo;
      ctx.fillRect(0, 0, LARGURA, ALTURA);

      // HUD superior
      ctx.font = '12px ui-monospace, "Cascadia Mono", monospace';
      ctx.fillStyle = CORES.cinza;
      ctx.fillText(isPt ? 'PONTOS' : 'SCORE', 24, 28);
      ctx.fillText(isPt ? 'RECORDE' : 'HI-SCORE', LARGURA / 2 - 32, 28);
      ctx.fillText(isPt ? 'BOLINHAS' : 'BALLS', LARGURA - 92, 28);

      ctx.font = 'bold 15px ui-monospace, "Cascadia Mono", monospace';
      ctx.fillStyle = CORES.branco;
      ctx.fillText(String(pontos).padStart(6, '0'), 24, 46);
      ctx.fillStyle = novoRecorde ? CORES.ouro : CORES.ciano;
      ctx.fillText(String(recorde).padStart(6, '0'), LARGURA / 2 - 32, 46);
      ctx.fillStyle = CORES.verde;
      ctx.fillText(String(bolasRestantes).padStart(2, '0'), LARGURA - 92, 46);

      // Paredes do tabuleiro
      ctx.fillStyle = CORES.parede;
      ctx.fillRect(0, TOPO_TAB, PAREDE, CHAO - TOPO_TAB + 4);
      ctx.fillRect(LARGURA - PAREDE, TOPO_TAB, PAREDE, CHAO - TOPO_TAB + 4);

      // Escaninhos, com o valor de cada um (o que acabou de pagar fica aceso)
      ctx.font = 'bold 11px ui-monospace, "Cascadia Mono", monospace';
      ctx.textAlign = 'center';
      for (let k = 0; k < ESCANINHOS; k++) {
        const x0 = PAREDE + k * ESC_W;
        ctx.globalAlpha = (timerBrilho > 0 && k === escaninhoAceso) ? 0.6 : 0.22;
        ctx.fillStyle = CORES_ESCANINHO[k];
        ctx.fillRect(x0 + 2, ESC_Y, ESC_W - 4, CHAO - ESC_Y);
        ctx.globalAlpha = 1;
        ctx.fillStyle = CORES_ESCANINHO[k];
        ctx.fillText(String(VALORES[k]), x0 + ESC_W / 2, CHAO - 10);
      }
      ctx.textAlign = 'left';

      // Pinos
      ctx.fillStyle = CORES.pino;
      for (let i = 0; i < PINOS.length; i++) {
        const p = PINOS[i];
        ctx.beginPath();
        ctx.arc(p.x, p.y, PINO_R, 0, Math.PI * 2);
        ctx.fill();
      }

      // Marcador de onde a bolinha será solta
      if (estado !== 'gameover' && !bola.ativa) {
        ctx.fillStyle = CORES.ouro;
        ctx.beginPath();
        ctx.moveTo(marcadorX, 94);
        ctx.lineTo(marcadorX - 9, 80);
        ctx.lineTo(marcadorX + 9, 80);
        ctx.closePath();
        ctx.fill();
      }

      // Bolinha em queda
      if (bola.ativa) {
        ctx.fillStyle = CORES.branco;
        ctx.beginPath();
        ctx.arc(bola.x, bola.y, BOLA_R, 0, Math.PI * 2);
        ctx.fill();
      }

      // Partículas
      for (let i = 0; i < particulas.length; i++) {
        const p = particulas[i];
        ctx.fillStyle = p.cor;
        ctx.globalAlpha = Math.max(0, p.vida / p.vidaMax);
        ctx.fillRect(p.x, p.y, 3, 3);
      }
      ctx.globalAlpha = 1;

      // Textos de pontos que sobem
      ctx.font = 'bold 11px ui-monospace, "Cascadia Mono", monospace';
      for (let i = 0; i < textosFlutuantes.length; i++) {
        const tf = textosFlutuantes[i];
        ctx.fillStyle = tf.cor;
        ctx.globalAlpha = Math.max(0, tf.vida / 0.8);
        ctx.fillText(tf.texto, tf.x, tf.y);
      }
      ctx.globalAlpha = 1;

      // Rodapé: bolinhas que ainda podem ser soltas e nome do jogo
      ctx.fillStyle = CORES.verde;
      for (let i = 0; i < bolasRestantes; i++) {
        ctx.beginPath();
        ctx.arc(28 + i * 14, 624, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = '12px ui-monospace, "Cascadia Mono", monospace';
      ctx.fillStyle = CORES.cinza;
      ctx.textAlign = 'right';
      ctx.fillText(isPt ? 'THE WALL // PROGRAMA DE TV' : 'THE WALL // GAME SHOW', LARGURA - 24, 628);
      ctx.textAlign = 'left';

      // Telas de título / pausa / fim de jogo
      if (estado === 'title') {
        desenharTelaTitulo(isPt);
      } else if (estado === 'paused') {
        desenharOverlay(isPt ? 'PAUSADO' : 'PAUSED', isPt ? 'PRESSIONE P OU ESC PARA CONTINUAR' : 'PRESS P OR ESC TO RESUME', CORES.ciano);
      } else if (estado === 'gameover') {
        desenharTelaFim(isPt);
      }

      // Scanlines CRT bem sutis
      ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
      for (let y = 0; y < ALTURA; y += 4) {
        ctx.fillRect(0, y, LARGURA, 1);
      }

      ctx.restore();
    }

    function desenharTelaTitulo(isPt) {
      ctx.fillStyle = 'rgba(5, 7, 15, 0.9)';
      ctx.fillRect(28, 150, LARGURA - 56, 230);
      ctx.strokeStyle = CORES.parede;
      ctx.lineWidth = 1;
      ctx.strokeRect(28, 150, LARGURA - 56, 230);

      ctx.textAlign = 'center';
      ctx.font = 'bold 30px ui-monospace, "Cascadia Mono", monospace';
      ctx.fillStyle = CORES.ouro;
      ctx.fillText('THE WALL', LARGURA / 2, 192);

      ctx.font = '11px ui-monospace, "Cascadia Mono", monospace';
      ctx.fillStyle = CORES.cinza;
      ctx.fillText(isPt ? '* SOLTE A BOLINHA E ACOMPANHE A QUEDA *' : '* DROP THE BALL AND WATCH IT FALL *', LARGURA / 2, 216);

      const pisca = Math.sin(tempoDecorrido * 4) > 0;
      ctx.font = 'bold 15px ui-monospace, monospace';
      ctx.fillStyle = pisca ? CORES.pino : 'transparent';
      ctx.fillText(isPt ? 'PRESSIONE ENTER OU TOQUE' : 'PRESS ENTER OR TAP TO PLAY', LARGURA / 2, 262);

      ctx.font = '12px ui-monospace, monospace';
      ctx.fillStyle = CORES.cinza;
      ctx.fillText(isPt ? '← → ou A / D escolhem onde soltar' : '← → or A / D pick where to drop', LARGURA / 2, 306);
      ctx.fillText(isPt ? 'ESPAÇO solta a bolinha · P pausa · M som' : 'SPACE drops the ball · P pause · M sound', LARGURA / 2, 324);
      ctx.fillText((isPt ? 'RECORDE ATUAL: ' : 'HIGH SCORE: ') + String(recorde).padStart(6, '0'), LARGURA / 2, 358);

      ctx.textAlign = 'left';
    }

    function desenharOverlay(titulo, subtitulo, cor) {
      ctx.fillStyle = 'rgba(5, 7, 15, 0.88)';
      ctx.fillRect(40, 280, LARGURA - 80, 120);
      ctx.strokeStyle = cor;
      ctx.lineWidth = 2;
      ctx.strokeRect(40, 280, LARGURA - 80, 120);

      ctx.textAlign = 'center';
      ctx.font = 'bold 24px ui-monospace, "Cascadia Mono", monospace';
      ctx.fillStyle = cor;
      ctx.fillText(titulo, LARGURA / 2, 330);

      ctx.font = '11px ui-monospace, "Cascadia Mono", monospace';
      ctx.fillStyle = CORES.branco;
      ctx.fillText(subtitulo, LARGURA / 2, 366);
      ctx.textAlign = 'left';
    }

    function desenharTelaFim(isPt) {
      ctx.fillStyle = 'rgba(5, 7, 15, 0.92)';
      ctx.fillRect(40, 240, LARGURA - 80, 220);
      ctx.strokeStyle = CORES.rosa;
      ctx.lineWidth = 2;
      ctx.strokeRect(40, 240, LARGURA - 80, 220);

      ctx.textAlign = 'center';
      ctx.font = 'bold 28px ui-monospace, "Cascadia Mono", monospace';
      ctx.fillStyle = CORES.rosa;
      ctx.fillText(isPt ? 'FIM DE JOGO' : 'GAME OVER', LARGURA / 2, 285);

      ctx.font = '14px ui-monospace, monospace';
      ctx.fillStyle = CORES.branco;
      ctx.fillText((isPt ? 'PONTUAÇÃO FINAL: ' : 'FINAL SCORE: ') + String(pontos).padStart(6, '0'), LARGURA / 2, 325);

      if (novoRecorde) {
        ctx.font = 'bold 13px ui-monospace, monospace';
        ctx.fillStyle = CORES.ouro;
        ctx.fillText(isPt ? '★ NOVO RECORDE ALCANÇADO! ★' : '★ NEW HIGH SCORE! ★', LARGURA / 2, 353);
      } else {
        ctx.font = '12px ui-monospace, monospace';
        ctx.fillStyle = CORES.cinza;
        ctx.fillText((isPt ? 'RECORDE: ' : 'RECORD: ') + String(recorde).padStart(6, '0'), LARGURA / 2, 353);
      }

      const pisca = Math.sin(tempoDecorrido * 4) > 0;
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.fillStyle = pisca ? CORES.verde : 'transparent';
      ctx.fillText(isPt ? 'PRESSIONE ENTER PARA JOGAR DE NOVO' : 'PRESS ENTER TO PLAY AGAIN', LARGURA / 2, 410);

      ctx.textAlign = 'left';
    }

    /* ------------------------ LAÇO PRINCIPAL ------------------------------ */
    function quadro(t) {
      if (!ultimoTempo) ultimoTempo = t;
      const dt = Math.min(0.04, Math.max(0, (t - ultimoTempo) / 1000));
      ultimoTempo = t;

      if (!pausado) atualizar(dt);
      desenhar();
      raiz.requestAnimationFrame(quadro);
    }

    /* ------------------------ COMUNICAÇÃO EXTERNA ------------------------- */
    function publicar() {
      aoAtualizar({
        estado: estado,
        pontos: pontos,
        recorde: recorde,
        bolasRestantes: bolasRestantes,
        novoRecorde: novoRecorde,
        som: !audio.mutado,
        pausado: pausado
      });
    }

    /* --------------------------- API PÚBLICA ------------------------------ */
    redimensionar(LARGURA_BASE, ALTURA_BASE);

    const api = {
      redimensionar: function (w, h) { redimensionar(w, h); },
      iniciar: function () {
        publicar();
        raiz.requestAnimationFrame(quadro);
      },
      acao: function (nome) {
        if (nome === 'comecar' || nome === 'reiniciar') {
          iniciarPartida();
        } else if (nome === 'pausa') {
          alternarPausa();
        } else if (nome === 'som') {
          audio.mutar();
          publicar();
        }
      },
      dados: function () {
        return {
          estado: estado,
          pontos: pontos,
          recorde: recorde,
          bolasRestantes: bolasRestantes,
          novoRecorde: novoRecorde,
          som: !audio.mutado,
          pausado: pausado
        };
      },
      entrada: {
        esquerda: function (ativo) { teclas.esq = !!ativo; },
        direita: function (ativo) { teclas.dir = !!ativo; },
        disparar: function (ativo) {
          if (!ativo) return;
          audio.iniciar();
          if (estado === 'title' || estado === 'gameover') {
            iniciarPartida();
          } else if (estado === 'paused') {
            alternarPausa();
          } else if (estado === 'playing') {
            soltarBola();
          }
        },
        posicionar: function (x) {
          marcadorX = Math.max(MARGEM_MARCADOR, Math.min(LARGURA - MARGEM_MARCADOR, x));
        },
        mover: function (dx) {
          marcadorX = Math.max(MARGEM_MARCADOR, Math.min(LARGURA - MARGEM_MARCADOR, marcadorX + dx));
        }
      },
      _teste: {
        bolinha: function () { return bola; },
        marcador: function () { return marcadorX; },
        pinos: function () { return PINOS; },
        definirBolas: function (n) { bolasRestantes = n; },
        definirEstado: function (e) { estado = e; },
        passo: function (dt) { atualizar(dt); },
        iniciarPartida: iniciarPartida
      }
    };

    return api;
  }

  raiz.criarTheWall = criarTheWall;
})(typeof window !== 'undefined' ? window : this);
