/* ============================================================================
   QUEBRA-TIJOLOS (BRICK BREAKER) — Motor Arcade Clássico de 1976
   ----------------------------------------------------------------------------
   - Parede de 8 colunas x 6 fileiras de tijolos (as fileiras de cima valem mais)
   - 4 fases com desenhos de parede diferentes, que se repetem
   - A raquete controla o ângulo: rebater na borda manda a bolinha de lado
   - A bolinha acelera conforme os tijolos caem
   - 3 bolinhas por partida e recorde salvo no navegador
   - Áudio sintetizado via Web Audio API (sem dependências externas)
   - Interface com suporte completo a teclado, mouse e toque
   ============================================================================ */
(function (raiz) {
  "use strict";

  const LARGURA_BASE = 480;   // tamanho de referência; redimensionar() adapta à área da tela
  const ALTURA_BASE = 640;
  const PAREDE = 16;          // espessura das paredes laterais
  const TETO = 64;            // linha do teto da arena
  const BOLA_R = 4;           // raio da bolinha (desenhada como um quadradinho)
  const VEL_BASE = 260;       // px/s no começo da primeira fase
  const VEL_MAX = 560;

  const COLUNAS = 8;
  const FILEIRAS = 6;
  const TIJ_H = 18;
  const TIJ_ESPACO = 4;
  const TIJ_Y0 = 110;

  const CORES = {
    fundo: '#05070f',
    branco: '#f4f6fc',
    cinza: '#64748b',
    parede: '#334155',
    raquete: '#e2e8f0',
    laranja: '#fb923c',
    amarelo: '#facc15',
    verde: '#55ff55',
    ciano: '#38bdf8',
    rosa: '#f43f5e'
  };

  // Cor e pontos de cada fileira, de cima para baixo
  const CORES_FILEIRA = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#38bdf8', '#a78bfa'];
  const PONTOS_FILEIRA = [70, 60, 50, 40, 30, 20];

  // Desenhos da parede por fase ('1' = tijolo, '0' = vazio). Depois da última, volta à primeira.
  const PADROES_FASE = [
    ['11111111', '11111111', '11111111', '11111111', '11111111', '11111111'],
    ['10101010', '01010101', '10101010', '01010101', '10101010', '01010101'],
    ['00111100', '01111110', '11111111', '11011011', '01111110', '00111100'],
    ['11111111', '10000001', '10111101', '10100101', '10000001', '11111111']
  ];

  /* ---------------------- MOTOR DE ÁUDIO RETRÔ --------------------------- */
  class AudioBrick {
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

    raquete() { this.tom(330, 0.06, 'square', 0.18, 90); }
    tijolo(linha) { this.tom(560 - linha * 45, 0.07, 'square', 0.16, 60); }
    parede() { this.tom(190, 0.035, 'triangle', 0.12); }
    lancar() { this.tom(420, 0.07, 'square', 0.16, 240); }
    perde() { this.tom(260, 0.45, 'sawtooth', 0.22, -190); }

    faseLimpa() {
      [523, 659, 784, 1046].forEach((f, i) => {
        setTimeout(() => this.tom(f, 0.18, 'square', 0.16), i * 110);
      });
    }

    fim() {
      this.tom(220, 0.3, 'triangle', 0.25, -90);
      setTimeout(() => this.tom(140, 0.5, 'triangle', 0.25, -60), 280);
    }
  }

  /* ============================ MOTOR DO JOGO ============================ */
  function criarBrickBreaker(canvas, opcoes) {
    opcoes = opcoes || {};
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = false;

    const audio = new AudioBrick();
    if (opcoes.som === false) audio.mutar(true);

    const aoAtualizar = opcoes.aoAtualizar || function () {};

    /* ----------------------------- ESTADO -------------------------------- */
    let estado = 'title';        // 'title' | 'playing' | 'paused' | 'faselimpa' | 'gameover'
    let pontos = 0;
    let recorde = lerRecorde();
    let novoRecorde = false;
    let vidas = 3;               // bolinhas restantes (inclui a que está em jogo)
    let fase = 1;
    let tijoloNaFase = 0;
    let pausado = false;
    let timerFase = 0;
    let tempoDecorrido = 0;
    let ultimoTempo = 0;

    // Layout: recalculado por redimensionar() conforme o tamanho da área de jogo
    let LARGURA = LARGURA_BASE;
    let ALTURA = ALTURA_BASE;
    let RAQUETE_Y = ALTURA - 42;
    let TIJ_W = 52;
    let TIJ_X0 = PAREDE + 2;

    const raquete = { x: LARGURA / 2 - 42, y: RAQUETE_Y, w: 84, h: 12, vel: 460 };
    const bola = { x: LARGURA / 2, y: RAQUETE_Y - 6, vx: 0, vy: 0, presa: true };
    let tijolos = [];
    let particulas = [];
    let textosFlutuantes = [];
    const teclas = { esq: false, dir: false };

    /* ---------------------- PERSISTÊNCIA DE RECORDE ----------------------- */
    function lerRecorde() {
      try {
        return parseInt(raiz.localStorage.getItem('brick_breaker_top') || '0', 10) || 0;
      } catch (e) {
        return 0;
      }
    }

    function salvarRecorde() {
      if (pontos > recorde) {
        recorde = pontos;
        novoRecorde = true;
        try {
          raiz.localStorage.setItem('brick_breaker_top', String(recorde));
        } catch (e) {}
      }
    }

    /* ------------------------ FASES E BOLINHA ---------------------------- */
    function velocidadeAtual() {
      return Math.min(VEL_MAX, VEL_BASE + (fase - 1) * 20 + tijoloNaFase * 3);
    }

    function montarFase() {
      const padrao = PADROES_FASE[(fase - 1) % PADROES_FASE.length];
      tijolos = [];
      for (let l = 0; l < FILEIRAS; l++) {
        for (let c = 0; c < COLUNAS; c++) {
          if (padrao[l][c] !== '1') continue;
          tijolos.push({
            c: c,
            x: TIJ_X0 + c * (TIJ_W + TIJ_ESPACO),
            y: TIJ_Y0 + l * (TIJ_H + TIJ_ESPACO),
            w: TIJ_W,
            h: TIJ_H,
            linha: l,
            pontos: PONTOS_FILEIRA[l],
            cor: CORES_FILEIRA[l]
          });
        }
      }
      tijoloNaFase = 0;
      prenderBola();
    }

    function redimensionar(w, h) {
      LARGURA = w;
      ALTURA = h;
      RAQUETE_Y = ALTURA - 42;
      TIJ_W = (LARGURA - 2 * PAREDE - 4 - (COLUNAS - 1) * TIJ_ESPACO) / COLUNAS;
      TIJ_X0 = PAREDE + 2;
      raquete.y = RAQUETE_Y;
      raquete.x = Math.max(PAREDE, Math.min(LARGURA - PAREDE - raquete.w, raquete.x));
      for (let i = 0; i < tijolos.length; i++) {
        tijolos[i].x = TIJ_X0 + tijolos[i].c * (TIJ_W + TIJ_ESPACO);
        tijolos[i].w = TIJ_W;
      }
      if (bola.presa) prenderBola();
    }

    function prenderBola() {
      bola.presa = true;
      bola.vx = 0;
      bola.vy = 0;
      bola.x = raquete.x + raquete.w / 2;
      bola.y = raquete.y - BOLA_R - 1;
    }

    function lancarBola() {
      if (!bola.presa) return;
      bola.presa = false;
      const ang = Math.random() * 0.6 - 0.3;          // saída levemente inclinada
      const v = velocidadeAtual();
      bola.vx = v * Math.sin(ang);
      bola.vy = -v * Math.cos(ang);
      audio.lancar();
    }

    function ajustarVelocidade() {
      const m = Math.hypot(bola.vx, bola.vy) || 1;
      const f = velocidadeAtual() / m;
      bola.vx *= f;
      bola.vy *= f;
    }

    function concluirFase() {
      pontos += 200 * fase;
      salvarRecorde();
      estado = 'faselimpa';
      timerFase = 1.6;
      audio.faseLimpa();
    }

    function fimDeJogo() {
      estado = 'gameover';
      pausado = false;
      salvarRecorde();
      audio.fim();
    }

    function adicionarTexto(txt, x, y, cor) {
      textosFlutuantes.push({ texto: txt, x: x, y: y, vida: 0.8, cor: cor });
    }

    function criarExplosao(x, y, cor, qtd) {
      for (let i = 0; i < qtd; i++) {
        const ang = Math.random() * Math.PI * 2;
        const vel = 40 + Math.random() * 120;
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
      for (let i = textosFlutuantes.length - 1; i >= 0; i--) {
        const tf = textosFlutuantes[i];
        tf.y -= 30 * dt;
        tf.vida -= dt;
        if (tf.vida <= 0) textosFlutuantes.splice(i, 1);
      }

      if (estado === 'faselimpa') {
        timerFase -= dt;
        if (timerFase <= 0) {
          fase++;
          montarFase();
          estado = 'playing';
          publicar();
        }
        return;
      }
      if (estado !== 'playing') return;

      if (teclas.esq) raquete.x -= raquete.vel * dt;
      if (teclas.dir) raquete.x += raquete.vel * dt;
      raquete.x = Math.max(PAREDE, Math.min(LARGURA - PAREDE - raquete.w, raquete.x));

      if (bola.presa) {
        bola.x = raquete.x + raquete.w / 2;
        bola.y = raquete.y - BOLA_R - 1;
        return;
      }

      // Anda em passos curtos para a bolinha nunca atravessar um tijolo ou a raquete
      const passos = Math.max(1, Math.ceil(Math.hypot(bola.vx, bola.vy) * dt / 3));
      for (let i = 0; i < passos; i++) {
        if (bola.presa || estado !== 'playing') break;
        moverBola(dt / passos);
      }
    }

    function moverBola(h) {
      bola.x += bola.vx * h;
      bola.y += bola.vy * h;

      // Paredes laterais e teto
      if (bola.x - BOLA_R < PAREDE) {
        bola.x = PAREDE + BOLA_R;
        bola.vx = Math.abs(bola.vx);
        audio.parede();
      } else if (bola.x + BOLA_R > LARGURA - PAREDE) {
        bola.x = LARGURA - PAREDE - BOLA_R;
        bola.vx = -Math.abs(bola.vx);
        audio.parede();
      }
      if (bola.y - BOLA_R < TETO) {
        bola.y = TETO + BOLA_R;
        bola.vy = Math.abs(bola.vy);
        audio.parede();
      }

      // Raquete: só rebate quando a bolinha está descendo
      if (bola.vy > 0 &&
          bola.y + BOLA_R >= raquete.y && bola.y - BOLA_R <= raquete.y + raquete.h &&
          bola.x >= raquete.x - BOLA_R && bola.x <= raquete.x + raquete.w + BOLA_R) {
        const meio = raquete.x + raquete.w / 2;
        const desvio = Math.max(-1, Math.min(1, (bola.x - meio) / (raquete.w / 2)));
        const ang = desvio * 1.0;                      // na borda da raquete sai a quase 60 graus
        const v = Math.hypot(bola.vx, bola.vy);
        bola.vx = v * Math.sin(ang);
        bola.vy = -v * Math.cos(ang);
        bola.y = raquete.y - BOLA_R;
        audio.raquete();
      }

      // Tijolos: um por vez, rebatendo no lado que foi tocado primeiro
      for (let i = 0; i < tijolos.length; i++) {
        const t = tijolos[i];
        const px = Math.max(t.x, Math.min(bola.x, t.x + t.w));
        const py = Math.max(t.y, Math.min(bola.y, t.y + t.h));
        const dx = bola.x - px;
        const dy = bola.y - py;
        if (dx * dx + dy * dy > BOLA_R * BOLA_R) continue;

        if (Math.abs(dx) > Math.abs(dy)) bola.vx = -bola.vx;
        else bola.vy = -bola.vy;

        tijolos.splice(i, 1);
        tijoloNaFase++;
        pontos += t.pontos;
        criarExplosao(t.x + t.w / 2, t.y + t.h / 2, t.cor, 10);
        adicionarTexto('+' + t.pontos, t.x + 12, t.y + t.h + 2, t.cor);
        audio.tijolo(t.linha);
        ajustarVelocidade();
        salvarRecorde();
        if (tijolos.length === 0) concluirFase();
        publicar();
        return;
      }

      // A bolinha passou da raquete
      if (bola.y - BOLA_R > ALTURA) {
        vidas--;
        audio.perde();
        if (vidas <= 0) fimDeJogo();
        else prenderBola();
        publicar();
      }
    }

    function iniciarPartida() {
      pontos = 0;
      vidas = 3;
      fase = 1;
      novoRecorde = false;
      pausado = false;
      particulas = [];
      textosFlutuantes = [];
      montarFase();
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

      // Paredes da arena
      ctx.fillStyle = CORES.parede;
      ctx.fillRect(0, TETO - 6, LARGURA, 6);
      ctx.fillRect(0, TETO, PAREDE, ALTURA - TETO);
      ctx.fillRect(LARGURA - PAREDE, TETO, PAREDE, ALTURA - TETO);

      // HUD superior
      ctx.font = '12px ui-monospace, "Cascadia Mono", monospace';
      ctx.fillStyle = CORES.cinza;
      ctx.fillText(isPt ? 'PONTOS' : 'SCORE', 24, 28);
      ctx.fillText(isPt ? 'RECORDE' : 'HI-SCORE', LARGURA / 2 - 32, 28);
      ctx.fillText(isPt ? 'FASE' : 'LEVEL', LARGURA - 76, 28);

      ctx.font = 'bold 15px ui-monospace, "Cascadia Mono", monospace';
      ctx.fillStyle = CORES.branco;
      ctx.fillText(String(pontos).padStart(6, '0'), 24, 46);
      ctx.fillStyle = novoRecorde ? CORES.amarelo : CORES.ciano;
      ctx.fillText(String(recorde).padStart(6, '0'), LARGURA / 2 - 32, 46);
      ctx.fillStyle = CORES.laranja;
      ctx.fillText(String(fase).padStart(2, '0'), LARGURA - 64, 46);

      // Parede de tijolos
      for (let i = 0; i < tijolos.length; i++) {
        const t = tijolos[i];
        ctx.fillStyle = t.cor;
        ctx.fillRect(t.x, t.y, t.w, t.h);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.fillRect(t.x, t.y, t.w, 3);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(t.x, t.y + t.h - 3, t.w, 3);
      }

      // Raquete e bolinha
      ctx.fillStyle = CORES.raquete;
      ctx.fillRect(raquete.x, raquete.y, raquete.w, raquete.h);
      ctx.fillStyle = CORES.branco;
      ctx.fillRect(bola.x - BOLA_R, bola.y - BOLA_R, BOLA_R * 2, BOLA_R * 2);

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

      // Rodapé: bolinhas restantes e nome do jogo
      ctx.fillStyle = CORES.branco;
      for (let i = 0; i < vidas; i++) {
        ctx.fillRect(24 + i * 14, ALTURA - 22, 8, 8);
      }
      ctx.font = '12px ui-monospace, "Cascadia Mono", monospace';
      ctx.fillStyle = CORES.cinza;
      ctx.textAlign = 'right';
      ctx.fillText(isPt ? 'QUEBRA-TIJOLOS // 1976' : 'BRICK BREAKER // 1976', LARGURA - 24, ALTURA - 14);
      ctx.textAlign = 'left';

      // Telas de título / pausa / fase limpa / fim de jogo
      if (estado === 'title') {
        desenharTelaTitulo(isPt);
      } else if (estado === 'paused') {
        desenharOverlay(isPt ? 'PAUSADO' : 'PAUSED', isPt ? 'PRESSIONE P OU ESC PARA CONTINUAR' : 'PRESS P OR ESC TO RESUME', CORES.ciano);
      } else if (estado === 'faselimpa') {
        desenharOverlay(isPt ? 'PAREDE LIMPA!' : 'WALL CLEARED!', '+' + (200 * fase) + (isPt ? ' DE BÔNUS · PRÓXIMA FASE' : ' BONUS · NEXT WALL'), CORES.verde);
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
      ctx.fillRect(28, 250, LARGURA - 56, 318);
      ctx.strokeStyle = CORES.parede;
      ctx.lineWidth = 1;
      ctx.strokeRect(28, 250, LARGURA - 56, 318);

      ctx.textAlign = 'center';
      ctx.font = 'bold 28px ui-monospace, "Cascadia Mono", monospace';
      ctx.fillStyle = CORES.laranja;
      ctx.fillText(isPt ? 'QUEBRA-TIJOLOS' : 'BRICK BREAKER', LARGURA / 2, 296);

      ctx.font = '11px ui-monospace, "Cascadia Mono", monospace';
      ctx.fillStyle = CORES.cinza;
      ctx.fillText(isPt ? '* QUEBRE A PAREDE DE TIJOLOS *' : '* BREAK THE BRICK WALL *', LARGURA / 2, 320);

      const pisca = Math.sin(tempoDecorrido * 4) > 0;
      ctx.font = 'bold 15px ui-monospace, monospace';
      ctx.fillStyle = pisca ? CORES.amarelo : 'transparent';
      ctx.fillText(isPt ? 'PRESSIONE ENTER OU TOQUE' : 'PRESS ENTER OR TAP TO PLAY', LARGURA / 2, 372);

      ctx.font = '12px ui-monospace, monospace';
      ctx.fillStyle = CORES.cinza;
      ctx.fillText(isPt ? '← → ou A / D movem a raquete' : '← → or A / D move the paddle', LARGURA / 2, 420);
      ctx.fillText(isPt ? 'ESPAÇO solta a bolinha · P pausa · M som' : 'SPACE launches the ball · P pause · M sound', LARGURA / 2, 440);
      ctx.fillText((isPt ? 'RECORDE ATUAL: ' : 'HIGH SCORE: ') + String(recorde).padStart(6, '0'), LARGURA / 2, 480);

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
        ctx.fillStyle = CORES.amarelo;
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
        vidas: vidas,
        fase: fase,
        tijolosRestantes: tijolos.length,
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
        montarFase();
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
          vidas: vidas,
          fase: fase,
          tijolosRestantes: tijolos.length,
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
            lancarBola();
          }
        },
        posicionar: function (x) {
          raquete.x = Math.max(PAREDE, Math.min(LARGURA - PAREDE - raquete.w, x - raquete.w / 2));
        },
        mover: function (dx) {
          raquete.x = Math.max(PAREDE, Math.min(LARGURA - PAREDE - raquete.w, raquete.x + dx));
        }
      },
      _teste: {
        bolinha: function () { return bola; },
        raquete: function () { return raquete; },
        tijolos: function () { return tijolos; },
        definirVidas: function (v) { vidas = v; },
        definirEstado: function (e) { estado = e; },
        passo: function (dt) { atualizar(dt); },
        iniciarPartida: iniciarPartida
      }
    };

    return api;
  }

  raiz.criarBrickBreaker = criarBrickBreaker;
})(typeof window !== 'undefined' ? window : this);
