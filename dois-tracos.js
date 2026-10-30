/* ============================================================================
   DOIS TRAÇOS (TWO PADDLES) — Motor de Pong
   ----------------------------------------------------------------------------
   - Um traço na esquerda e outro na direita; uma bolinha quica entre eles
   - Quem deixar a bolinha passar perde o ponto; quem chegar a 7 pontos vence
   - Modo 2 jogadores (W/S e ↑/↓ no mesmo teclado) ou 1 jogador contra a CPU
   - O ângulo da rebatida depende do ponto do traço em que a bolinha bateu
   - A bolinha acelera a cada rebatida; o maior rali fica salvo no navegador
   - Áudio sintetizado via Web Audio API (sem dependências externas)
   - Interface com suporte completo a teclado, mouse e toque
   ============================================================================ */
(function (raiz) {
  "use strict";

  const LARGURA_BASE = 480;     // tamanho de referência; redimensionar() adapta à área da tela
  const ALTURA_BASE = 640;
  const TETO = 64;              // topo da quadra (logo abaixo do placar)
  const BOLA_R = 7;
  const TRACO_W = 10;
  const TRACO_H = 96;
  const TRACO_X_ESQ = 24;
  const VEL_TRACO = 440;        // px/s, controle do jogador
  const VEL_CPU = 330;          // px/s, limite da CPU (por isso ela perde as bolinhas mais rápidas)
  const VEL_INICIAL = 300;
  const VEL_MAX = 620;
  const ACELERACAO = 14;        // px/s a mais a cada rebatida
  const PONTOS_VITORIA = 7;
  const TEMPO_SAQUE = 1.0;      // segundos parado antes de cada saque

  const CORES = {
    fundo: '#05070f',
    branco: '#f4f6fc',
    cinza: '#64748b',
    cinzaEscuro: '#1e293b',
    parede: '#334155',
    verde: '#55ff55',
    ciano: '#38bdf8',
    amarelo: '#facc15',
    rosa: '#f43f5e'
  };

  /* ---------------------- MOTOR DE ÁUDIO RETRÔ --------------------------- */
  class AudioPong {
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

    rebate(sentido) { this.tom(sentido > 0 ? 440 : 330, 0.07, 'square', 0.2); }
    parede() { this.tom(200, 0.04, 'triangle', 0.15); }
    ponto() { this.tom(180, 0.4, 'square', 0.25, -120); }

    fim() {
      this.tom(220, 0.3, 'triangle', 0.25, -90);
      setTimeout(() => this.tom(140, 0.5, 'triangle', 0.25, -60), 280);
    }
  }

  /* ============================ MOTOR DO JOGO ============================ */
  function criarDoisTracos(canvas, opcoes) {
    opcoes = opcoes || {};
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = false;

    const audio = new AudioPong();
    if (opcoes.som === false) audio.mutar(true);

    const aoAtualizar = opcoes.aoAtualizar || function () {};

    // Layout: recalculado por redimensionar() conforme o tamanho da área de jogo
    let LARGURA = LARGURA_BASE;
    let ALTURA = ALTURA_BASE;
    let TRACO_X_DIR = LARGURA - 24 - TRACO_W;

    /* ----------------------------- ESTADO -------------------------------- */
    let estado = 'title';         // 'title' | 'playing' | 'paused' | 'gameover'
    let modo = 'duplo';           // 'duplo' (2 jogadores) | 'cpu' (1 jogador contra a CPU)
    let placar = [0, 0];          // [esquerda, direita]
    let vencedor = -1;           // 0 = esquerda, 1 = direita
    let rali = 0;
    let recordeRali = lerRecorde();
    let novoRecorde = false;
    let pausado = false;
    let timerSaque = 0;
    let direcaoSaque = 1;         // -1 = a bolinha vai para a esquerda, 1 = para a direita
    let tempoDecorrido = 0;
    let ultimoTempo = 0;
    let particulas = [];

    const tracos = {
      esq: { x: TRACO_X_ESQ, y: ALTURA / 2 - TRACO_H / 2 },
      dir: { x: TRACO_X_DIR, y: ALTURA / 2 - TRACO_H / 2 }
    };
    const bola = { x: LARGURA / 2, y: (TETO + ALTURA) / 2, vx: 0, vy: 0 };
    const teclas = { esqCima: false, esqBaixo: false, dirCima: false, dirBaixo: false };
    const ia = { erro: 0, timer: 0 };

    /* ---------------------- PERSISTÊNCIA DE RECORDE ----------------------- */
    function lerRecorde() {
      try {
        return parseInt(raiz.localStorage.getItem('dois_tracos_rali') || '0', 10) || 0;
      } catch (e) {
        return 0;
      }
    }

    function salvarRecorde() {
      try {
        raiz.localStorage.setItem('dois_tracos_rali', String(recordeRali));
      } catch (e) {}
    }

    function criarExplosao(x, y, cor, qtd) {
      for (let i = 0; i < qtd; i++) {
        const ang = Math.random() * Math.PI * 2;
        const vel = 30 + Math.random() * 100;
        particulas.push({
          x: x,
          y: y,
          vx: Math.cos(ang) * vel,
          vy: Math.sin(ang) * vel,
          vida: 0.25 + Math.random() * 0.25,
          vidaMax: 0.5,
          cor: cor
        });
      }
    }

    /* ------------------------ SAQUE E PONTUAÇÃO -------------------------- */
    function redimensionar(w, h) {
      LARGURA = w;
      ALTURA = h;
      TRACO_X_DIR = LARGURA - 24 - TRACO_W;
      tracos.dir.x = TRACO_X_DIR;
      tracos.esq.y = limitar(tracos.esq.y);
      tracos.dir.y = limitar(tracos.dir.y);
    }

    function prepararSaque(direcao) {
      bola.x = LARGURA / 2;
      bola.y = (TETO + ALTURA) / 2;
      bola.vx = 0;
      bola.vy = 0;
      direcaoSaque = direcao;
      timerSaque = TEMPO_SAQUE;
      rali = 0;
    }

    function lancarSaque() {
      const ang = (Math.random() * 2 - 1) * 0.5;      // até uns 29 graus para cima ou para baixo
      bola.vx = direcaoSaque * VEL_INICIAL * Math.cos(ang);
      bola.vy = VEL_INICIAL * Math.sin(ang);
    }

    function pontuar(quem) {               // 0 = esquerda, 1 = direita
      placar[quem]++;
      audio.ponto();
      // A bolinha saiu pelo lado do adversário, então a explosão aparece ali
      criarExplosao(quem === 0 ? LARGURA - 8 : 8, bola.y, quem === 0 ? CORES.verde : CORES.ciano, 20);
      if (placar[quem] >= PONTOS_VITORIA) {
        vencedor = quem;
        estado = 'gameover';
        pausado = false;
        bola.vx = 0;
        bola.vy = 0;
        audio.fim();
        publicar();
        return;
      }
      // Quem tomou o ponto é quem saca
      prepararSaque(quem === 1 ? -1 : 1);
      publicar();
    }

    /* ------------------------- FÍSICA DOS TRAÇOS ------------------------- */
    function limitar(y) {
      return Math.max(TETO, Math.min(ALTURA - TRACO_H, y));
    }

    function controlarCpu(dt) {
      ia.timer -= dt;
      if (ia.timer <= 0) {
        ia.timer = 0.25;
        ia.erro = (Math.random() * 2 - 1) * 26;     // a mira erra um pouco e muda a cada 0,25 s
      }
      // A CPU só corre atrás da bolinha quando ela vem na direção dela
      const alvo = bola.vx > 0 ? bola.y + ia.erro : (TETO + ALTURA) / 2;
      const centro = tracos.dir.y + TRACO_H / 2;
      const passo = VEL_CPU * dt;
      tracos.dir.y = limitar(tracos.dir.y + Math.max(-passo, Math.min(passo, alvo - centro)));
    }

    function rebater(traco, sentido) {
      const v = Math.min(VEL_MAX, Math.hypot(bola.vx, bola.vy) + ACELERACAO);
      const centro = traco.y + TRACO_H / 2;
      const desvio = Math.max(-1, Math.min(1, (bola.y - centro) / (TRACO_H / 2)));
      const ang = desvio * 1.0;                      // na ponta do traço a bolinha sai a quase 60 graus
      bola.vx = sentido * v * Math.cos(ang);
      bola.vy = v * Math.sin(ang);
      bola.x = sentido > 0 ? TRACO_X_ESQ + TRACO_W + BOLA_R : TRACO_X_DIR - BOLA_R;

      rali++;
      if (rali > recordeRali) {
        recordeRali = rali;
        novoRecorde = true;
        salvarRecorde();
      }
      criarExplosao(bola.x, bola.y, CORES.branco, 6);
      audio.rebate(sentido);
    }

    function moverBola(h) {
      bola.x += bola.vx * h;
      bola.y += bola.vy * h;

      // Paredes de cima e de baixo da quadra
      if (bola.y - BOLA_R < TETO) {
        bola.y = TETO + BOLA_R;
        bola.vy = Math.abs(bola.vy);
        audio.parede();
      } else if (bola.y + BOLA_R > ALTURA) {
        bola.y = ALTURA - BOLA_R;
        bola.vy = -Math.abs(bola.vy);
        audio.parede();
      }

      // Traços: só rebatem a bolinha que vem na direção deles
      const esq = tracos.esq;
      const dir = tracos.dir;
      if (bola.vx < 0 &&
          bola.x - BOLA_R <= TRACO_X_ESQ + TRACO_W && bola.x + BOLA_R >= TRACO_X_ESQ &&
          bola.y + BOLA_R >= esq.y && bola.y - BOLA_R <= esq.y + TRACO_H) {
        rebater(esq, 1);
      } else if (bola.vx > 0 &&
          bola.x + BOLA_R >= TRACO_X_DIR && bola.x - BOLA_R <= TRACO_X_DIR + TRACO_W &&
          bola.y + BOLA_R >= dir.y && bola.y - BOLA_R <= dir.y + TRACO_H) {
        rebater(dir, -1);
      }

      // A bolinha saiu pelo lado: o outro jogador marca
      if (bola.x < -BOLA_R) pontuar(1);
      else if (bola.x > LARGURA + BOLA_R) pontuar(0);
    }

    /* ------------------- ATUALIZAÇÃO DA FÍSICA (UPDATE) ------------------- */
    function atualizar(dt) {
      tempoDecorrido += dt;

      for (let i = particulas.length - 1; i >= 0; i--) {
        const p = particulas[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vida -= dt;
        if (p.vida <= 0) particulas.splice(i, 1);
      }

      if (estado !== 'playing') return;

      // Traço da esquerda: sempre do jogador (W / S)
      const dirEsq = (teclas.esqBaixo ? 1 : 0) - (teclas.esqCima ? 1 : 0);
      tracos.esq.y = limitar(tracos.esq.y + dirEsq * VEL_TRACO * dt);

      // Traço da direita: do segundo jogador (↑ / ↓) ou da CPU
      if (modo === 'cpu') {
        controlarCpu(dt);
      } else {
        const dirDir = (teclas.dirBaixo ? 1 : 0) - (teclas.dirCima ? 1 : 0);
        tracos.dir.y = limitar(tracos.dir.y + dirDir * VEL_TRACO * dt);
      }

      if (timerSaque > 0) {
        timerSaque -= dt;
        if (timerSaque <= 0) lancarSaque();
        return;
      }

      // Passos curtos para a bolinha nunca atravessar um traço
      const passos = Math.max(1, Math.ceil(Math.hypot(bola.vx, bola.vy) * dt / 3));
      for (let i = 0; i < passos; i++) {
        if (estado !== 'playing' || timerSaque > 0) break;
        moverBola(dt / passos);
      }
    }

    function iniciarPartida() {
      placar = [0, 0];
      vencedor = -1;
      novoRecorde = false;
      pausado = false;
      particulas = [];
      tracos.esq.y = ALTURA / 2 - TRACO_H / 2;
      tracos.dir.y = ALTURA / 2 - TRACO_H / 2;
      prepararSaque(Math.random() < 0.5 ? -1 : 1);
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

      // Linha central tracejada
      ctx.fillStyle = CORES.cinzaEscuro;
      for (let y = TETO + 8; y < ALTURA; y += 28) {
        ctx.fillRect(LARGURA / 2 - 2, y, 4, 16);
      }

      // Paredes de cima e de baixo
      ctx.fillStyle = CORES.parede;
      ctx.fillRect(0, TETO - 4, LARGURA, 4);
      ctx.fillRect(0, ALTURA - 4, LARGURA, 4);

      // Rótulos e placar
      const cpu = modo === 'cpu';
      ctx.textAlign = 'center';
      ctx.font = '11px ui-monospace, "Cascadia Mono", monospace';
      ctx.fillStyle = CORES.verde;
      ctx.fillText(cpu ? (isPt ? 'VOCÊ' : 'YOU') : (isPt ? 'JOGADOR 1' : 'PLAYER 1'), LARGURA * 0.25, 22);
      ctx.fillStyle = CORES.ciano;
      ctx.fillText(cpu ? 'CPU' : (isPt ? 'JOGADOR 2' : 'PLAYER 2'), LARGURA * 0.75, 22);
      ctx.fillStyle = CORES.cinza;
      ctx.fillText((isPt ? 'RALI ' : 'RALLY ') + rali + '  ·  ' + (isPt ? 'MELHOR ' : 'BEST ') + recordeRali, LARGURA / 2, 22);

      ctx.font = 'bold 30px ui-monospace, "Cascadia Mono", monospace';
      ctx.fillStyle = CORES.verde;
      ctx.fillText(String(placar[0]), LARGURA * 0.25, 52);
      ctx.fillStyle = CORES.ciano;
      ctx.fillText(String(placar[1]), LARGURA * 0.75, 52);
      ctx.textAlign = 'left';

      // Traços
      ctx.fillStyle = CORES.verde;
      ctx.fillRect(TRACO_X_ESQ, tracos.esq.y, TRACO_W, TRACO_H);
      ctx.fillStyle = CORES.ciano;
      ctx.fillRect(TRACO_X_DIR, tracos.dir.y, TRACO_W, TRACO_H);

      // Bolinha
      ctx.fillStyle = CORES.branco;
      ctx.fillRect(bola.x - BOLA_R, bola.y - BOLA_R, BOLA_R * 2, BOLA_R * 2);

      // Faíscas
      for (let i = 0; i < particulas.length; i++) {
        const p = particulas[i];
        ctx.fillStyle = p.cor;
        ctx.globalAlpha = Math.max(0, p.vida / p.vidaMax);
        ctx.fillRect(p.x, p.y, 3, 3);
      }
      ctx.globalAlpha = 1;

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
      ctx.fillRect(28, 210, LARGURA - 56, 262);
      ctx.strokeStyle = CORES.parede;
      ctx.lineWidth = 1;
      ctx.strokeRect(28, 210, LARGURA - 56, 262);

      ctx.textAlign = 'center';
      ctx.font = 'bold 28px ui-monospace, "Cascadia Mono", monospace';
      ctx.fillStyle = CORES.verde;
      ctx.fillText(isPt ? 'DOIS TRAÇOS' : 'TWO PADDLES', LARGURA / 2, 256);

      ctx.font = '11px ui-monospace, "Cascadia Mono", monospace';
      ctx.fillStyle = CORES.cinza;
      ctx.fillText(isPt ? '* DEFENDA SEU LADO DA BOLINHA *' : '* DEFEND YOUR SIDE OF THE BALL *', LARGURA / 2, 280);

      const pisca = Math.sin(tempoDecorrido * 4) > 0;
      ctx.font = 'bold 15px ui-monospace, monospace';
      ctx.fillStyle = pisca ? CORES.amarelo : 'transparent';
      ctx.fillText(isPt ? 'PRESSIONE ENTER OU TOQUE' : 'PRESS ENTER OR TAP TO PLAY', LARGURA / 2, 322);

      ctx.font = '12px ui-monospace, monospace';
      ctx.fillStyle = CORES.cinza;
      ctx.fillText(isPt ? 'W / S = traço esquerdo · ↑ / ↓ = traço direito' : 'W / S = left paddle · ↑ / ↓ = right paddle', LARGURA / 2, 366);
      ctx.fillText(isPt ? '1 = contra a CPU · 2 = dois jogadores' : '1 = vs CPU · 2 = two players', LARGURA / 2, 386);
      ctx.fillText(isPt ? 'ENTER começa · P pausa · M som' : 'ENTER starts · P pause · M sound', LARGURA / 2, 406);
      ctx.fillText((isPt ? 'MAIOR RALI: ' : 'LONGEST RALLY: ') + recordeRali, LARGURA / 2, 440);

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

    function textoVencedor(isPt) {
      if (modo === 'cpu') {
        if (vencedor === 0) return isPt ? 'VOCÊ VENCEU!' : 'YOU WIN!';
        return isPt ? 'A CPU VENCEU!' : 'CPU WINS!';
      }
      if (vencedor === 0) return isPt ? 'JOGADOR 1 VENCEU!' : 'PLAYER 1 WINS!';
      return isPt ? 'JOGADOR 2 VENCEU!' : 'PLAYER 2 WINS!';
    }

    function desenharTelaFim(isPt) {
      ctx.fillStyle = 'rgba(5, 7, 15, 0.92)';
      ctx.fillRect(40, 240, LARGURA - 80, 220);
      ctx.strokeStyle = CORES.rosa;
      ctx.lineWidth = 2;
      ctx.strokeRect(40, 240, LARGURA - 80, 220);

      ctx.textAlign = 'center';
      ctx.font = 'bold 26px ui-monospace, "Cascadia Mono", monospace';
      ctx.fillStyle = CORES.rosa;
      ctx.fillText(isPt ? 'FIM DE JOGO' : 'GAME OVER', LARGURA / 2, 282);

      ctx.font = 'bold 16px ui-monospace, monospace';
      ctx.fillStyle = vencedor === 0 ? CORES.verde : CORES.ciano;
      ctx.fillText(textoVencedor(isPt), LARGURA / 2, 318);

      ctx.font = '14px ui-monospace, monospace';
      ctx.fillStyle = CORES.branco;
      ctx.fillText(placar[0] + ' x ' + placar[1], LARGURA / 2, 350);

      if (novoRecorde) {
        ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.fillStyle = CORES.amarelo;
        ctx.fillText(isPt ? '★ NOVO RECORDE DE RALI! ★' : '★ NEW LONGEST RALLY! ★', LARGURA / 2, 376);
      } else {
        ctx.font = '12px ui-monospace, monospace';
        ctx.fillStyle = CORES.cinza;
        ctx.fillText((isPt ? 'MAIOR RALI: ' : 'LONGEST RALLY: ') + recordeRali, LARGURA / 2, 376);
      }

      const pisca = Math.sin(tempoDecorrido * 4) > 0;
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.fillStyle = pisca ? CORES.verde : 'transparent';
      ctx.fillText(isPt ? 'PRESSIONE ENTER PARA JOGAR DE NOVO' : 'PRESS ENTER TO PLAY AGAIN', LARGURA / 2, 420);

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
        modo: modo,
        placar: placar.slice(),
        rali: rali,
        recordeRali: recordeRali,
        vencedor: vencedor,
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
        } else if (nome === 'cpu' || nome === 'duplo') {
          modo = nome;
          publicar();
        }
      },
      dados: function () {
        return {
          estado: estado,
          modo: modo,
          placar: placar.slice(),
          rali: rali,
          recordeRali: recordeRali,
          vencedor: vencedor,
          novoRecorde: novoRecorde,
          som: !audio.mutado,
          pausado: pausado
        };
      },
      entrada: {
        cima: function (lado, ativo) {
          if (lado === 'esq') teclas.esqCima = !!ativo;
          else teclas.dirCima = !!ativo;
        },
        baixo: function (lado, ativo) {
          if (lado === 'esq') teclas.esqBaixo = !!ativo;
          else teclas.dirBaixo = !!ativo;
        },
        disparar: function (ativo) {
          if (!ativo) return;
          audio.iniciar();
          if (estado === 'title' || estado === 'gameover') {
            iniciarPartida();
          } else if (estado === 'paused') {
            alternarPausa();
          }
        }
      },
      _teste: {
        bolinha: function () { return bola; },
        tracos: function () { return tracos; },
        placar: function () { return placar; },
        definirPlacar: function (a, b) { placar = [a, b]; },
        definirModo: function (m) { modo = m; },
        definirEstado: function (e) { estado = e; },
        passo: function (dt) { atualizar(dt); },
        iniciarPartida: iniciarPartida
      }
    };

    return api;
  }

  raiz.criarDoisTracos = criarDoisTracos;
})(typeof window !== 'undefined' ? window : this);
