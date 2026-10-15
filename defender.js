/* ============================================================================
   DEFENDER — 1980 WILLIAMS CLASSIC SPACE DEFENSE SHOOTER
   Motor de jogo retro com renderização em HTML5 Canvas e síntese Web Audio API.
   - Rolagem horizontal bidirecional contínua com terreno montanhoso procedural
   - Radar Scanner de longo alcance no topo exibindo todo o planeta (360 graus)
   - Caça estelar com inércia, aceleração, reversão rápida e propulsão de partículas
   - Esquadrão alienígena completo:
       * Landers (sequestram humanos na superfície)
       * Mutantes (hiper-agressivos gerados ao subir com um humanoide)
       * Bombers (lançam minas espaciais estáticas pulsantes)
       * Pods & Swarmers (casulos que se fragmentam em pequenos caças velozes)
       * Baiters (aparecem se o jogador demorar demais)
   - Sistema de resgate: salvar humanos em queda livre e pousá-los em segurança (+1000 pts)
   - Smart Bombs (pulso EMP destruidor de tela) e Hiperespaço (salto de emergência)
   - Suporte bilíngue EN / PT e controle responsivo PC e Touch
   ============================================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Defender = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  "use strict";

  const MUNDO_LARGURA = 4800; // Planeta contínuo wrap-around
  const ALTURA_JOGO = 600;
  const LARGURA_TELA = 800;
  const CHAO_BASE = 530;

  class SomDefender {
    constructor() {
      this.ctx = null;
      this.mutado = false;
    }
    init() {
      if (!this.ctx && typeof AudioContext !== "undefined") {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume();
      }
    }
    laser() {
      if (this.mutado) return;
      this.init();
      if (!this.ctx) return;
      try {
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(1200, t);
        osc.frequency.exponentialRampToValueAtTime(140, t + 0.14);
        g.gain.setValueAtTime(0.12, t);
        g.gain.linearRampToValueAtTime(0.001, t + 0.14);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.15);
      } catch (e) {}
    }
    explosao() {
      if (this.mutado) return;
      this.init();
      if (!this.ctx) return;
      try {
        const t = this.ctx.currentTime;
        const bufferSize = this.ctx.sampleRate * 0.28;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
        }
        const ruído = this.ctx.createBufferSource();
        ruído.buffer = buffer;
        const filtro = this.ctx.createBiquadFilter();
        filtro.type = "lowpass";
        filtro.frequency.setValueAtTime(650, t);
        filtro.frequency.exponentialRampToValueAtTime(60, t + 0.28);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.linearRampToValueAtTime(0.01, t + 0.28);
        ruído.connect(filtro);
        filtro.connect(gain);
        gain.connect(this.ctx.destination);
        ruído.start(t);
      } catch (e) {}
    }
    smartBomb() {
      if (this.mutado) return;
      this.init();
      if (!this.ctx) return;
      try {
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(2200, t);
        osc.frequency.exponentialRampToValueAtTime(50, t + 0.5);
        g.gain.setValueAtTime(0.35, t);
        g.gain.linearRampToValueAtTime(0.001, t + 0.5);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.52);
      } catch (e) {}
    }
    humanoideSalvo() {
      if (this.mutado) return;
      this.init();
      if (!this.ctx) return;
      try {
        const t = this.ctx.currentTime;
        [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = f;
          g.gain.setValueAtTime(0.15, t + idx * 0.08);
          g.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.08 + 0.18);
          osc.connect(g);
          g.connect(this.ctx.destination);
          osc.start(t + idx * 0.08);
          osc.stop(t + idx * 0.08 + 0.2);
        });
      } catch (e) {}
    }
    propulsor() {
      if (this.mutado) return;
      this.init();
      if (!this.ctx) return;
      try {
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(75, t);
        osc.frequency.linearRampToValueAtTime(45, t + 0.08);
        g.gain.setValueAtTime(0.08, t);
        g.gain.linearRampToValueAtTime(0.001, t + 0.08);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.09);
      } catch (e) {}
    }
  }

  class DefenderGame {
    constructor(canvas, opcoes = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.opcoes = opcoes;
      this.isMobile = !!opcoes.isMobile;

      this.largura = LARGURA_TELA;
      this.altura = ALTURA_JOGO;
      this.canvas.width = this.largura;
      this.canvas.height = this.altura;

      this.som = new SomDefender();

      // Estado do jogo
      this.estado = "start"; // 'start', 'playing', 'paused', 'gameover', 'victory'
      this.pontos = 0;
      this.recorde = 25000;
      this.vidas = 3;
      this.bombasInteligentes = 3;
      this.onda = 1;

      // Getters de compatibilidade
      Object.defineProperty(this, "state", {
        get: () => this.estado,
        set: (v) => { this.estado = v; }
      });
      Object.defineProperty(this, "wave", {
        get: () => this.onda,
        set: (v) => { this.onda = v; }
      });
      Object.defineProperty(this, "score", {
        get: () => this.pontos,
        set: (v) => { this.pontos = v; }
      });
      Object.defineProperty(this, "highScore", {
        get: () => this.recorde,
        set: (v) => { this.recorde = v; }
      });
      Object.defineProperty(this, "lives", {
        get: () => this.vidas,
        set: (v) => { this.vidas = v; }
      });
      Object.defineProperty(this, "smartBombs", {
        get: () => this.bombasInteligentes,
        set: (v) => { this.bombasInteligentes = v; }
      });
      Object.defineProperty(this, "sound", {
        get: () => !this.som.mutado
      });
      Object.defineProperty(this, "mundoLargura", {
        get: () => MUNDO_LARGURA
      });
      Object.defineProperty(this, "terreno", {
        get: () => this.pontosTerreno
      });
      Object.defineProperty(this, "humanos", {
        get: () => this.humanoides
      });
      Object.defineProperty(this, "aliens", {
        get: () => this.inimigos
      });
      Object.defineProperty(this, "lasers", {
        get: () => this.projeteis
      });

      // Entradas
      this.teclas = {
        cima: false,
        baixo: false,
        esquerda: false,
        direita: false,
        thrust: false,
        reverter: false,
        disparo: false,
        smartBomb: false,
        hiperespaco: false
      };

      // Câmera no mundo horizontal contínuo
      this.cameraX = 0;

      // Terreno procedural (vetores de altura da montanha do planeta)
      this.pontosTerreno = this.gerarTerreno();

      // Entidades
      this.jogador = this.criarJogador();
      this.projeteis = [];
      this.projeteisInimigos = [];
      this.inimigos = [];
      this.humanoides = [];
      this.particulas = [];
      this.estrelas = this.gerarEstrelas(120);

      this.ultimoTempo = 0;
      this.tempoOnda = 0;
      this.flashTela = 0;
      this.tempoBaiter = 0;

      this.configurarEventos();
      this.iniciarOnda(1);
    }

    gerarTerreno() {
      const pontos = [];
      const passo = 40;
      const qtd = Math.ceil(MUNDO_LARGURA / passo) + 2;
      for (let i = 0; i <= qtd; i++) {
        const x = i * passo;
        // Senoides combinadas para relevo acidentado estilo Williams Defender
        const h = CHAO_BASE - Math.sin(i * 0.2) * 55 - Math.cos(i * 0.45) * 40 - Math.sin(i * 0.08) * 70;
        pontos.push({ x, y: Math.min(CHAO_BASE + 20, Math.max(340, h)) });
      }
      return pontos;
    }

    gerarEstrelas(qtd) {
      const estrelas = [];
      for (let i = 0; i < qtd; i++) {
        estrelas.push({
          x: Math.random() * MUNDO_LARGURA,
          y: Math.random() * (CHAO_BASE - 100) + 40,
          tamanho: Math.random() > 0.8 ? 2 : 1,
          cor: ["#ffffff", "#38bdf8", "#f472b6", "#facc15"][Math.floor(Math.random() * 4)],
          pisca: Math.random() * Math.PI * 2
        });
      }
      return estrelas;
    }

    criarJogador() {
      return {
        x: 400,
        y: 250,
        vx: 0,
        vy: 0,
        direcao: 1, // 1: direita, -1: esquerda
        largura: 28,
        altura: 12,
        cooldownTiro: 0,
        inercia: 0.94,
        aceleracao: 580,
        velMaxX: 420,
        velMaxY: 280,
        invulneravel: 0
      };
    }

    iniciarOnda(onda) {
      this.onda = onda;
      this.tempoOnda = 0;
      this.tempoBaiter = 0;
      this.projeteis = [];
      this.projeteisInimigos = [];
      this.inimigos = [];

      // População de humanoides na superfície (10 por onda)
      if (this.humanoides.length === 0 || onda === 1) {
        this.humanoides = [];
        for (let i = 0; i < 10; i++) {
          const x = 200 + i * (MUNDO_LARGURA / 10) + (Math.random() * 100 - 50);
          const y = this.obterAlturaTerreno(x) - 10;
          this.humanoides.push({
            id: i,
            x: x,
            y: y,
            estado: "chao", // 'chao', 'sequestrado', 'caindo', 'salvo'
            sequestrador: null,
            velQueda: 0
          });
        }
      }

      // População Alienígena proporcional à onda
      const qtdLanders = Math.min(16, 5 + onda * 2);
      for (let i = 0; i < qtdLanders; i++) {
        this.criarLander();
      }

      const qtdBombers = Math.min(8, 1 + Math.floor(onda / 2));
      for (let i = 0; i < qtdBombers; i++) {
        this.criarBomber();
      }

      const qtdPods = Math.min(5, Math.floor(onda / 2));
      for (let i = 0; i < qtdPods; i++) {
        this.criarPod();
      }

      if (this.opcoes.onHudUpdate) this.notificarHud();
    }

    obterAlturaTerreno(x) {
      const xMod = ((x % MUNDO_LARGURA) + MUNDO_LARGURA) % MUNDO_LARGURA;
      const idx = Math.floor(xMod / 40);
      const frac = (xMod % 40) / 40;
      const p1 = this.pontosTerreno[idx] || { y: CHAO_BASE };
      const p2 = this.pontosTerreno[idx + 1] || p1;
      return p1.y + (p2.y - p1.y) * frac;
    }

    criarLander() {
      const x = (this.jogador.x + 400 + Math.random() * (MUNDO_LARGURA - 800)) % MUNDO_LARGURA;
      this.inimigos.push({
        tipo: "lander",
        x: x,
        y: Math.random() * 150 + 60,
        vx: (Math.random() - 0.5) * 80,
        vy: 30,
        alvoHumano: null,
        largura: 22,
        altura: 18,
        pontos: 150,
        vida: 1,
        cooldownTiro: Math.random() * 3 + 2
      });
    }

    criarMutante(x, y) {
      this.inimigos.push({
        tipo: "mutante",
        x: x,
        y: y,
        vx: 0,
        vy: 0,
        largura: 22,
        altura: 18,
        pontos: 150,
        vida: 1,
        cooldownTiro: Math.random() * 2 + 1
      });
    }

    criarBomber() {
      const x = (this.jogador.x + 600 + Math.random() * (MUNDO_LARGURA - 1200)) % MUNDO_LARGURA;
      this.inimigos.push({
        tipo: "bomber",
        x: x,
        y: Math.random() * 180 + 80,
        vx: (Math.random() > 0.5 ? 1 : -1) * 70,
        vy: 0,
        largura: 20,
        altura: 20,
        pontos: 250,
        vida: 1,
        tempoMina: Math.random() * 3 + 2
      });
    }

    criarPod() {
      const x = (this.jogador.x + 800 + Math.random() * (MUNDO_LARGURA - 1600)) % MUNDO_LARGURA;
      this.inimigos.push({
        tipo: "pod",
        x: x,
        y: Math.random() * 160 + 90,
        vx: (Math.random() - 0.5) * 60,
        vy: (Math.random() - 0.5) * 40,
        largura: 22,
        altura: 22,
        pontos: 1000,
        vida: 1
      });
    }

    criarSwarmer(x, y) {
      this.inimigos.push({
        tipo: "swarmer",
        x: x + (Math.random() * 20 - 10),
        y: y + (Math.random() * 20 - 10),
        vx: (Math.random() - 0.5) * 160,
        vy: (Math.random() - 0.5) * 160,
        largura: 10,
        altura: 10,
        pontos: 150,
        vida: 1,
        cooldownTiro: Math.random() * 2 + 1.5
      });
    }

    criarBaiter() {
      const x = this.jogador.direcao > 0 ? (this.jogador.x - 450) : (this.jogador.x + 450);
      this.inimigos.push({
        tipo: "baiter",
        x: ((x % MUNDO_LARGURA) + MUNDO_LARGURA) % MUNDO_LARGURA,
        y: this.jogador.y,
        vx: 0,
        vy: 0,
        largura: 26,
        altura: 12,
        pontos: 200,
        vida: 1,
        cooldownTiro: 0.8
      });
    }

    dispararLaser() {
      if (this.jogador.cooldownTiro > 0) return;
      this.jogador.cooldownTiro = 0.14; // cadência arcade rápida

      const dir = this.jogador.direcao;
      const lx = this.jogador.x + (dir > 0 ? this.jogador.largura : 0);
      const ly = this.jogador.y + this.jogador.altura / 2;

      // Raio laser veloz contínuo de 80px de extensão
      this.projeteis.push({
        x: lx,
        y: ly,
        vx: dir * 900,
        largura: 55,
        vida: 0.45
      });

      this.som.laser();
    }

    dispararSmartBomb() {
      if (this.bombasInteligentes <= 0 || this.estado !== "playing") return;
      this.bombasInteligentes--;
      this.flashTela = 0.35;
      this.som.smartBomb();

      // Elimina todos os inimigos visíveis no quadrante da câmera
      const camMin = this.cameraX - 100;
      const camMax = this.cameraX + this.largura + 100;

      for (let i = this.inimigos.length - 1; i >= 0; i--) {
        const en = this.inimigos[i];
        let relX = en.x - this.cameraX;
        while (relX < -MUNDO_LARGURA / 2) relX += MUNDO_LARGURA;
        while (relX > MUNDO_LARGURA / 2) relX -= MUNDO_LARGURA;
        const telaX = relX;

        if (telaX >= -50 && telaX <= this.largura + 50) {
          this.pontos += en.pontos;
          this.criarExplosao(en.x, en.y, "#facc15", 18);
          // Se for pod, solta swarmers
          if (en.tipo === "pod") {
            for (let s = 0; s < 4; s++) this.criarSwarmer(en.x, en.y);
          }
          this.inimigos.splice(i, 1);
        }
      }

      this.projeteisInimigos = [];
      this.notificarHud();
    }

    ativarHiperespaco() {
      if (this.estado !== "playing") return;
      this.jogador.x = Math.random() * MUNDO_LARGURA;
      this.jogador.y = Math.random() * (CHAO_BASE - 140) + 60;
      this.jogador.vx = 0;
      this.jogador.vy = 0;
      this.jogador.invulneravel = 1.5;
      this.flashTela = 0.2;
      this.som.smartBomb();
    }

    criarExplosao(x, y, cor = "#ff3b30", qtd = 14) {
      this.som.explosao();
      for (let i = 0; i < qtd; i++) {
        const ang = Math.random() * Math.PI * 2;
        const vel = Math.random() * 180 + 40;
        this.particulas.push({
          x: x,
          y: y,
          vx: Math.cos(ang) * vel,
          vy: Math.sin(ang) * vel,
          cor: cor,
          vida: Math.random() * 0.45 + 0.25,
          tamanho: Math.random() * 3 + 1.5
        });
      }
    }

    iniciarPartida() {
      this.pontos = 0;
      this.vidas = 3;
      this.bombasInteligentes = 3;
      this.onda = 1;
      this.estado = "playing";
      this.jogador = this.criarJogador();
      this.cameraX = this.jogador.x - this.largura / 2;
      this.iniciarOnda(1);
    }

    startNewGame() {
      this.iniciarPartida();
    }

    pausarOuDespausar() {
      if (this.estado === "playing") this.estado = "paused";
      else if (this.estado === "paused") this.estado = "playing";
      this.notificarHud();
    }

    togglePause() {
      this.pausarOuDespausar();
    }

    alternarSom() {
      this.som.mutado = !this.som.mutado;
      this.notificarHud();
    }

    toggleSound() {
      this.alternarSom();
    }

    notificarHud() {
      if (this.opcoes.onHudUpdate) {
        this.opcoes.onHudUpdate({
          pontos: this.pontos,
          recorde: this.recorde,
          vidas: this.vidas,
          bombas: this.bombasInteligentes,
          onda: this.onda,
          inimigos: this.inimigos.length,
          humanosVivos: this.humanoides.filter(h => h.estado !== "morto").length,
          estado: this.estado,
          som: !this.som.mutado,
          // Compatibilidade English keys
          score: this.pontos,
          highScore: this.recorde,
          lives: this.vidas,
          smartBombs: this.bombasInteligentes,
          wave: this.onda,
          humanoids: this.humanoides.filter(h => h.estado !== "morto").length,
          state: this.estado,
          sound: !this.som.mutado
        });
      }
    }

    /* ----------------------------- FÍSICA & ATUALIZAÇÃO ----------------------------- */
    atualizar(dt) {
      if (this.estado !== "playing") return;

      if (this.flashTela > 0) this.flashTela -= dt;
      this.tempoOnda += dt;
      this.tempoBaiter += dt;

      // Gera Baiter após 45s de onda para acelerar o ritmo
      if (this.tempoBaiter > 45 && Math.random() < 0.015 && !this.inimigos.some(e => e.tipo === "baiter")) {
        this.criarBaiter();
      }

      // 1. Atualização do Jogador
      const p = this.jogador;
      if (p.cooldownTiro > 0) p.cooldownTiro -= dt;
      if (p.invulneravel > 0) p.invulneravel -= dt;

      // Direção e propulsão
      if (this.teclas.reverter || this.teclas.reverso) {
        p.direcao = -p.direcao;
        this.teclas.reverter = false;
        this.teclas.reverso = false;
      }

      if (this.teclas.thrust) {
        p.vx += p.direcao * p.aceleracao * dt;
        this.som.propulsor();

        // Partículas de exaustão do propulsor
        if (Math.random() > 0.3) {
          const exX = p.direcao > 0 ? p.x - 6 : p.x + p.largura + 6;
          this.particulas.push({
            x: exX,
            y: p.y + p.altura / 2 + (Math.random() * 6 - 3),
            vx: -p.direcao * (Math.random() * 120 + 80),
            vy: (Math.random() - 0.5) * 40,
            cor: ["#38bdf8", "#facc15", "#ef4444"][Math.floor(Math.random() * 3)],
            vida: 0.22,
            tamanho: 2.5
          });
        }
      }

      if (this.teclas.cima) p.vy -= p.aceleracao * dt;
      if (this.teclas.baixo) p.vy += p.aceleracao * dt;

      // Disparo contínuo
      if (this.teclas.disparo) this.dispararLaser();
      if (this.teclas.smartBomb) {
        this.dispararSmartBomb();
        this.teclas.smartBomb = false;
      }
      if (this.teclas.hiperespaco) {
        this.ativarHiperespaco();
        this.teclas.hiperespaco = false;
      }

      // Aplica atrito e limites de velocidade
      p.vx *= p.inercia;
      p.vy *= p.inercia;
      p.vx = Math.max(-p.velMaxX, Math.min(p.velMaxX, p.vx));
      p.vy = Math.max(-p.velMaxY, Math.min(p.velMaxY, p.vy));

      p.x = ((p.x + p.vx * dt) % MUNDO_LARGURA + MUNDO_LARGURA) % MUNDO_LARGURA;
      p.y += p.vy * dt;

      // Limites verticais
      const altTerreno = this.obterAlturaTerreno(p.x);
      if (p.y < 35) {
        p.y = 35;
        p.vy = 0;
      }
      if (p.y + p.altura > altTerreno) {
        p.y = altTerreno - p.altura;
        p.vy = 0;
      }

      // Câmera segue o jogador suavemente (centraliza o navio)
      this.cameraX = p.x - this.largura / 2;

      // 2. Projéteis do Jogador
      for (let i = this.projeteis.length - 1; i >= 0; i--) {
        const pr = this.projeteis[i];
        pr.x += pr.vx * dt;
        pr.vida -= dt;
        if (pr.vida <= 0) {
          this.projeteis.splice(i, 1);
          continue;
        }

        // Colisão com inimigos
        for (let j = this.inimigos.length - 1; j >= 0; j--) {
          const en = this.inimigos[j];
          let dist = Math.abs(pr.x - en.x);
          if (dist > MUNDO_LARGURA / 2) dist = MUNDO_LARGURA - dist;

          if (dist < en.largura && Math.abs(pr.y - (en.y + en.altura / 2)) < en.altura) {
            // Inimigo atingido!
            this.pontos += en.pontos;
            if (this.pontos > this.recorde) this.recorde = this.pontos;
            this.criarExplosao(en.x, en.y, en.tipo === "pod" ? "#a855f7" : "#f59e0b", 16);

            // Se lander carregava humanoide, solta em queda livre
            if (en.alvoHumano && en.alvoHumano.estado === "sequestrado") {
              en.alvoHumano.estado = "caindo";
              en.alvoHumano.sequestrador = null;
              en.alvoHumano.velQueda = 20;
            }

            // Pod se divide em swarmers
            if (en.tipo === "pod") {
              for (let s = 0; s < 5; s++) this.criarSwarmer(en.x, en.y);
            }

            this.inimigos.splice(j, 1);
            this.projeteis.splice(i, 1);
            this.notificarHud();
            break;
          }
        }
      }

      // 3. Projéteis Inimigos
      for (let i = this.projeteisInimigos.length - 1; i >= 0; i--) {
        const pe = this.projeteisInimigos[i];
        pe.x += pe.vx * dt;
        pe.y += pe.vy * dt;
        pe.vida -= dt;
        if (pe.vida <= 0) {
          this.projeteisInimigos.splice(i, 1);
          continue;
        }

        // Colisão com jogador
        if (p.invulneravel <= 0) {
          let dist = Math.abs(pe.x - (p.x + p.largura / 2));
          if (dist > MUNDO_LARGURA / 2) dist = MUNDO_LARGURA - dist;
          if (dist < 14 && Math.abs(pe.y - (p.y + p.altura / 2)) < 12) {
            this.matarJogador();
            this.projeteisInimigos.splice(i, 1);
            break;
          }
        }
      }

      // 4. Inimigos IA
      for (let i = this.inimigos.length - 1; i >= 0; i--) {
        const en = this.inimigos[i];
        en.x = ((en.x + en.vx * dt) % MUNDO_LARGURA + MUNDO_LARGURA) % MUNDO_LARGURA;
        en.y += en.vy * dt;

        // IA Lander
        if (en.tipo === "lander") {
          if (!en.alvoHumano) {
            // Procura humanoide no chão próximo
            const humLivre = this.humanoides.find(h => h.estado === "chao");
            if (humLivre) {
              en.alvoHumano = humLivre;
              humLivre.sequestrador = en;
            }
          } else if (en.alvoHumano.estado === "chao") {
            // Desce até o humanoide
            let dx = en.alvoHumano.x - en.x;
            if (dx > MUNDO_LARGURA / 2) dx -= MUNDO_LARGURA;
            if (dx < -MUNDO_LARGURA / 2) dx += MUNDO_LARGURA;
            en.vx = Math.sign(dx) * 60;

            if (Math.abs(dx) < 15) {
              en.vy = 45;
              if (en.y + en.altura >= en.alvoHumano.y) {
                en.alvoHumano.estado = "sequestrado";
              }
            }
          } else if (en.alvoHumano.estado === "sequestrado") {
            // Sobe com o humanoide para o espaço
            en.vy = -38;
            en.alvoHumano.x = en.x;
            en.alvoHumano.y = en.y + en.altura;

            // Se atingir o topo, vira Mutante assassino!
            if (en.y <= 40) {
              en.alvoHumano.estado = "morto";
              this.criarMutante(en.x, en.y);
              this.inimigos.splice(i, 1);
              continue;
            }
          }

          // Disparo esporádico do Lander
          en.cooldownTiro -= dt;
          if (en.cooldownTiro <= 0) {
            en.cooldownTiro = Math.random() * 3 + 2;
            this.dispararInimigo(en.x, en.y, p.x, p.y);
          }
        }

        // IA Mutante (persegue o jogador implacavelmente)
        else if (en.tipo === "mutante" || en.tipo === "baiter") {
          let dx = p.x - en.x;
          if (dx > MUNDO_LARGURA / 2) dx -= MUNDO_LARGURA;
          if (dx < -MUNDO_LARGURA / 2) dx += MUNDO_LARGURA;
          const dy = p.y - en.y;
          const dist = Math.hypot(dx, dy) || 1;
          const vel = en.tipo === "baiter" ? 220 : 160;

          en.vx = (dx / dist) * vel;
          en.vy = (dy / dist) * vel;

          en.cooldownTiro -= dt;
          if (en.cooldownTiro <= 0) {
            en.cooldownTiro = en.tipo === "baiter" ? 0.7 : 1.5;
            this.dispararInimigo(en.x, en.y, p.x, p.y, 220);
          }
        }

        // IA Bomber (deixa minas estacionárias)
        else if (en.tipo === "bomber") {
          if (en.y < 80) en.vy = 20;
          else if (en.y > 320) en.vy = -20;
          en.tempoMina -= dt;
          if (en.tempoMina <= 0) {
            en.tempoMina = Math.random() * 4 + 3;
            this.projeteisInimigos.push({
              x: en.x,
              y: en.y,
              vx: 0,
              vy: 0,
              vida: 6.0,
              tipo: "mina"
            });
          }
        }

        // IA Swarmer
        else if (en.tipo === "swarmer") {
          let dx = p.x - en.x;
          if (dx > MUNDO_LARGURA / 2) dx -= MUNDO_LARGURA;
          if (dx < -MUNDO_LARGURA / 2) dx += MUNDO_LARGURA;
          en.vx += Math.sign(dx) * 220 * dt;
          en.vy += (Math.random() - 0.5) * 200 * dt;
          en.vx = Math.max(-180, Math.min(180, en.vx));
          en.vy = Math.max(-120, Math.min(120, en.vy));
        }

        // Colisão direta inimigo vs jogador
        if (p.invulneravel <= 0) {
          let dist = Math.abs(en.x - (p.x + p.largura / 2));
          if (dist > MUNDO_LARGURA / 2) dist = MUNDO_LARGURA - dist;
          if (dist < (en.largura + p.largura) / 2 && Math.abs(en.y - (p.y + p.altura / 2)) < (en.altura + p.altura) / 2) {
            this.matarJogador();
            break;
          }
        }
      }

      // 5. Atualização dos Humanoides & Resgate
      for (const hum of this.humanoides) {
        if (hum.estado === "caindo") {
          hum.velQueda += 180 * dt;
          hum.y += hum.velQueda * dt;
          const altChao = this.obterAlturaTerreno(hum.x);

          // Jogador captura o humano em pleno ar (Catch rescue!)
          let dist = Math.abs(hum.x - (p.x + p.largura / 2));
          if (dist > MUNDO_LARGURA / 2) dist = MUNDO_LARGURA - dist;
          if (dist < 26 && Math.abs(hum.y - (p.y + p.altura / 2)) < 26) {
            hum.estado = "salvo";
            this.pontos += 500;
            this.som.humanoideSalvo();
            this.notificarHud();
          } else if (hum.y >= altChao - 10) {
            // Se cair com velocidade alta demais, esmaga no chão!
            if (hum.velQueda > 140) {
              hum.estado = "morto";
              this.criarExplosao(hum.x, altChao, "#ef4444", 8);
            } else {
              hum.estado = "chao";
              hum.y = altChao - 10;
              hum.velQueda = 0;
            }
          }
        } else if (hum.estado === "salvo") {
          // Acompanha a nave e pousa suavemente na terra
          hum.x = p.x;
          hum.y = p.y + p.altura + 4;
          const altChao = this.obterAlturaTerreno(hum.x);
          if (p.y + p.altura >= altChao - 24) {
            hum.estado = "chao";
            hum.y = altChao - 10;
            this.pontos += 1000; // Bônus de resgate completo!
            this.som.humanoideSalvo();
            this.notificarHud();
          }
        }
      }

      // 6. Partículas
      for (let i = this.particulas.length - 1; i >= 0; i--) {
        const pt = this.particulas[i];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vida -= dt;
        if (pt.vida <= 0) this.particulas.splice(i, 1);
      }

      // 7. Vitória da Onda
      if (this.inimigos.length === 0) {
        this.pontos += 1000 * this.onda;
        this.iniciarOnda(this.onda + 1);
      }
    }

    dispararInimigo(x, y, alvoX, alvoY, vel = 180) {
      let dx = alvoX - x;
      if (dx > MUNDO_LARGURA / 2) dx -= MUNDO_LARGURA;
      if (dx < -MUNDO_LARGURA / 2) dx += MUNDO_LARGURA;
      const dy = alvoY - y;
      const dist = Math.hypot(dx, dy) || 1;
      this.projeteisInimigos.push({
        x: x,
        y: y,
        vx: (dx / dist) * vel,
        vy: (dy / dist) * vel,
        vida: 3.5,
        tipo: "laser"
      });
    }

    matarJogador() {
      this.criarExplosao(this.jogador.x, this.jogador.y, "#38bdf8", 32);
      this.vidas--;
      this.notificarHud();

      if (this.vidas <= 0) {
        this.estado = "gameover";
      } else {
        // Renasce em segurança
        this.jogador.x = Math.max(100, this.jogador.x - 300);
        this.jogador.y = 220;
        this.jogador.vx = 0;
        this.jogador.vy = 0;
        this.jogador.invulneravel = 2.5;
        this.flashTela = 0.2;
      }
    }

    /* ----------------------------- RENDERIZAÇÃO ----------------------------- */
    desenhar() {
      const ctx = this.ctx;
      ctx.fillStyle = "#030712";
      ctx.fillRect(0, 0, this.largura, this.altura);

      // Flash da Smart Bomb
      if (this.flashTela > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${this.flashTela * 2})`;
        ctx.fillRect(0, 0, this.largura, this.altura);
      }

      // 1. Estrelas de Fundo (Parallax suave)
      for (const est of this.estrelas) {
        let relX = est.x - this.cameraX * 0.4;
        relX = ((relX % MUNDO_LARGURA) + MUNDO_LARGURA) % MUNDO_LARGURA;
        if (relX <= this.largura) {
          ctx.fillStyle = est.cor;
          ctx.fillRect(relX, est.y, est.tamanho, est.tamanho);
        }
      }

      // 2. Montanhas / Terreno Escarpado Vector Neon
      ctx.save();
      ctx.beginPath();
      let primeiro = true;
      for (const p of this.pontosTerreno) {
        let relX = p.x - this.cameraX;
        while (relX < -MUNDO_LARGURA / 2) relX += MUNDO_LARGURA;
        while (relX > MUNDO_LARGURA / 2) relX -= MUNDO_LARGURA;
        const telaX = relX;

        if (primeiro) {
          ctx.moveTo(telaX, p.y);
          primeiro = false;
        } else {
          ctx.lineTo(telaX, p.y);
        }
      }
      ctx.strokeStyle = "#b91c1c";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "#ef4444";
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.restore();

      // 3. Humanoides na Superfície
      for (const h of this.humanoides) {
        if (h.estado === "morto") continue;
        let relX = h.x - this.cameraX;
        while (relX < -MUNDO_LARGURA / 2) relX += MUNDO_LARGURA;
        while (relX > MUNDO_LARGURA / 2) relX -= MUNDO_LARGURA;
        if (relX >= -20 && relX <= this.largura + 20) {
          ctx.fillStyle = "#facc15";
          // Corpo humanoide pixelado
          ctx.fillRect(relX - 2, h.y, 4, 10);
          ctx.fillStyle = "#38bdf8";
          ctx.fillRect(relX - 3, h.y + 4, 6, 2); // braços
        }
      }

      // 4. Projéteis
      for (const pr of this.projeteis) {
        let relX = pr.x - this.cameraX;
        while (relX < -MUNDO_LARGURA / 2) relX += MUNDO_LARGURA;
        while (relX > MUNDO_LARGURA / 2) relX -= MUNDO_LARGURA;
        ctx.fillStyle = "#38bdf8";
        ctx.shadowColor = "#7dd3fc";
        ctx.shadowBlur = 10;
        ctx.fillRect(relX, pr.y - 1.5, pr.largura * Math.sign(pr.vx), 3);
        ctx.shadowBlur = 0;
      }

      for (const pe of this.projeteisInimigos) {
        let relX = pe.x - this.cameraX;
        while (relX < -MUNDO_LARGURA / 2) relX += MUNDO_LARGURA;
        while (relX > MUNDO_LARGURA / 2) relX -= MUNDO_LARGURA;
        ctx.fillStyle = pe.tipo === "mina" ? "#f43f5e" : "#fbbf24";
        ctx.fillRect(relX - 2, pe.y - 2, 4, 4);
      }

      // 5. Inimigos
      for (const en of this.inimigos) {
        let relX = en.x - this.cameraX;
        while (relX < -MUNDO_LARGURA / 2) relX += MUNDO_LARGURA;
        while (relX > MUNDO_LARGURA / 2) relX -= MUNDO_LARGURA;

        if (relX >= -40 && relX <= this.largura + 40) {
          this.desenharInimigo(ctx, en, relX, en.y);
        }
      }

      // 6. Jogador (Caça Espacial Defender)
      if (this.jogador.invulneravel <= 0 || Math.floor(Date.now() / 80) % 2 === 0) {
        const p = this.jogador;
        const px = this.largura / 2 - p.largura / 2;
        const py = p.y;
        const d = p.direcao;

        ctx.save();
        ctx.translate(px + p.largura / 2, py + p.altura / 2);
        if (d < 0) ctx.scale(-1, 1);

        // Corpo aerodinâmico vetorizado Williams 1980
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2;
        ctx.fillStyle = "#0284c7";
        ctx.beginPath();
        ctx.moveTo(14, 0); // Nariz
        ctx.lineTo(-8, -6); // Asa superior
        ctx.lineTo(-12, -4);
        ctx.lineTo(-8, 0); // Fuselagem
        ctx.lineTo(-12, 4);
        ctx.lineTo(-8, 6); // Asa inferior
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Cabine de pilotagem
        ctx.fillStyle = "#facc15";
        ctx.fillRect(0, -2, 6, 4);
        ctx.restore();
      }

      // 7. Partículas
      for (const pt of this.particulas) {
        let relX = pt.x - this.cameraX;
        while (relX < -MUNDO_LARGURA / 2) relX += MUNDO_LARGURA;
        while (relX > MUNDO_LARGURA / 2) relX -= MUNDO_LARGURA;
        ctx.fillStyle = pt.cor;
        ctx.fillRect(relX, pt.y, pt.tamanho, pt.tamanho);
      }

      // 8. O Clássico Radar Scanner de Longo Alcance no Topo
      this.desenharScanner(ctx);

      // Overlays
      if (this.estado === "start") this.desenharTelaApresentacao(ctx);
      else if (this.estado === "paused") this.desenharTelaPausa(ctx);
      else if (this.estado === "gameover") this.desenharTelaGameOver(ctx);
    }

    desenharInimigo(ctx, en, x, y) {
      ctx.save();
      ctx.translate(x, y);

      if (en.tipo === "lander") {
        ctx.fillStyle = "#10b981"; // Verde esmeralda
        ctx.fillRect(-10, -8, 20, 10);
        ctx.fillStyle = "#34d399";
        ctx.fillRect(-6, -12, 12, 5);
        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-8, 2, 4, 6); // garras
        ctx.strokeRect(4, 2, 4, 6);
      } else if (en.tipo === "mutante") {
        ctx.fillStyle = "#ef4444"; // Vermelho frenético
        ctx.fillRect(-10, -8, 20, 16);
        ctx.fillStyle = "#facc15";
        ctx.fillRect(-4, -4, 8, 8); // olho central
      } else if (en.tipo === "bomber") {
        ctx.fillStyle = "#0284c7";
        ctx.fillRect(-9, -9, 18, 18);
        ctx.strokeStyle = "#38bdf8";
        ctx.strokeRect(-11, -11, 22, 22);
      } else if (en.tipo === "pod") {
        ctx.fillStyle = "#a855f7";
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#e879f9";
        ctx.stroke();
      } else if (en.tipo === "swarmer") {
        ctx.fillStyle = "#f43f5e";
        ctx.fillRect(-4, -4, 8, 8);
      } else if (en.tipo === "baiter") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(-13, -4, 26, 8);
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(-6, -2, 12, 4);
      }
      ctx.restore();
    }

    desenharScanner(ctx) {
      const sw = 360;
      const sh = 36;
      const sx = (this.largura - sw) / 2;
      const sy = 12;

      ctx.save();
      ctx.fillStyle = "rgba(10, 15, 30, 0.85)";
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeStyle = "rgba(56, 189, 248, 0.6)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx, sy, sw, sh);

      // Caixa da visão da câmera
      const camEscala = sw / MUNDO_LARGURA;
      const camXScanner = sx + (((this.cameraX % MUNDO_LARGURA) + MUNDO_LARGURA) % MUNDO_LARGURA) * camEscala;
      const camWScanner = this.largura * camEscala;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
      ctx.strokeRect(camXScanner, sy + 1, camWScanner, sh - 2);

      // Blips de Terreno e Humanoides no Scanner
      for (const h of this.humanoides) {
        if (h.estado === "morto") continue;
        const hx = sx + (((h.x % MUNDO_LARGURA) + MUNDO_LARGURA) % MUNDO_LARGURA) * camEscala;
        ctx.fillStyle = "#facc15";
        ctx.fillRect(hx, sy + sh - 4, 2, 3);
      }

      // Blips dos Inimigos
      for (const en of this.inimigos) {
        const ex = sx + (((en.x % MUNDO_LARGURA) + MUNDO_LARGURA) % MUNDO_LARGURA) * camEscala;
        const ey = sy + (en.y / ALTURA_JOGO) * sh;
        ctx.fillStyle = en.tipo === "mutante" ? "#ef4444" : "#10b981";
        ctx.fillRect(ex, ey, 2.5, 2.5);
      }

      // Blip do Jogador
      const px = sx + (((this.jogador.x % MUNDO_LARGURA) + MUNDO_LARGURA) % MUNDO_LARGURA) * camEscala;
      const py = sy + (this.jogador.y / ALTURA_JOGO) * sh;
      ctx.fillStyle = "#38bdf8";
      ctx.fillRect(px - 1.5, py - 1.5, 3.5, 3.5);

      ctx.restore();
    }

    desenharTelaApresentacao(ctx) {
      const isPt = (typeof window !== "undefined" && window.obterIdioma && window.obterIdioma() === "pt");
      ctx.fillStyle = "rgba(3, 7, 18, 0.88)";
      ctx.fillRect(0, 0, this.largura, this.altura);

      ctx.textAlign = "center";
      ctx.font = "900 36px ui-monospace, Consolas, monospace";
      ctx.fillStyle = "#38bdf8";
      ctx.fillText("DEFENDER", this.largura / 2, this.altura / 2 - 60);

      ctx.font = "700 13px ui-monospace, Consolas, monospace";
      ctx.fillStyle = "#facc15";
      ctx.fillText("WILLIAMS ELECTRONICS 1980", this.largura / 2, this.altura / 2 - 25);

      const pisca = Math.floor(Date.now() / 400) % 2 === 0;
      ctx.font = "800 15px ui-monospace, Consolas, monospace";
      ctx.fillStyle = pisca ? "#ffffff" : "#94a3b8";
      const msg = this.isMobile
        ? (isPt ? "TOQUE NA TELA OU NO TIRO PARA INICIAR" : "TAP SCREEN OR FIRE BUTTON TO PLAY")
        : (isPt ? "PRESSIONE ESPAÇO OU ENTER PARA INICIAR" : "PRESS SPACE OR ENTER TO START");
      ctx.fillText(msg, this.largura / 2, this.altura / 2 + 30);

      ctx.font = "12px ui-monospace, Consolas, monospace";
      ctx.fillStyle = "#64748b";
      const sub = isPt
        ? "Resgate os humanoides antes que os Landers os transformem em Mutantes!"
        : "Rescue humanoids before Landers abduct and turn them into Mutants!";
      ctx.fillText(sub, this.largura / 2, this.altura / 2 + 75);
    }

    desenharTelaPausa(ctx) {
      const isPt = (typeof window !== "undefined" && window.obterIdioma && window.obterIdioma() === "pt");
      ctx.fillStyle = "rgba(3, 7, 18, 0.75)";
      ctx.fillRect(0, 0, this.largura, this.altura);

      ctx.textAlign = "center";
      ctx.font = "900 32px ui-monospace, Consolas, monospace";
      ctx.fillStyle = "#facc15";
      ctx.fillText(isPt ? "JOGO PAUSADO" : "GAME PAUSED", this.largura / 2, this.altura / 2);

      ctx.font = "13px ui-monospace, Consolas, monospace";
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(isPt ? "Pressione P para continuar" : "Press P to resume", this.largura / 2, this.altura / 2 + 35);
    }

    desenharTelaGameOver(ctx) {
      const isPt = (typeof window !== "undefined" && window.obterIdioma && window.obterIdioma() === "pt");
      ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
      ctx.fillRect(0, 0, this.largura, this.altura);

      ctx.textAlign = "center";
      ctx.font = "900 36px ui-monospace, Consolas, monospace";
      ctx.fillStyle = "#ef4444";
      ctx.fillText("GAME OVER", this.largura / 2, this.altura / 2 - 40);

      ctx.font = "800 18px ui-monospace, Consolas, monospace";
      ctx.fillStyle = "#facc15";
      ctx.fillText((isPt ? "PONTUAÇÃO FINAL: " : "FINAL SCORE: ") + this.pontos, this.largura / 2, this.altura / 2 + 5);

      const pisca = Math.floor(Date.now() / 400) % 2 === 0;
      ctx.font = "800 14px ui-monospace, Consolas, monospace";
      ctx.fillStyle = pisca ? "#ffffff" : "#64748b";
      const retMsg = this.isMobile
        ? (isPt ? "TOQUE PARA JOGAR NOVAMENTE" : "TAP SCREEN TO PLAY AGAIN")
        : (isPt ? "PRESSIONE ESPAÇO PARA JOGAR NOVAMENTE" : "PRESS SPACE TO PLAY AGAIN");
      ctx.fillText(retMsg, this.largura / 2, this.altura / 2 + 65);
    }

    configurarEventos() {
      if (typeof window === "undefined") return;
      window.addEventListener("keydown", (e) => {
        if (e.code === "KeyP") {
          this.pausarOuDespausar();
          return;
        }
        if (e.code === "KeyM") {
          this.alternarSom();
          return;
        }

        if (this.estado === "start" || this.estado === "gameover") {
          if (e.code === "Space" || e.code === "Enter") {
            this.iniciarPartida();
            return;
          }
        }

        switch (e.code) {
          case "ArrowUp":
          case "KeyW":
            this.teclas.cima = true;
            break;
          case "ArrowDown":
          case "KeyS":
            this.teclas.baixo = true;
            break;
          case "ArrowRight":
          case "KeyD":
            this.teclas.thrust = true;
            this.jogador.direcao = 1;
            break;
          case "ArrowLeft":
          case "KeyA":
            this.teclas.thrust = true;
            this.jogador.direcao = -1;
            break;
          case "ShiftLeft":
          case "ShiftRight":
          case "KeyR":
            this.teclas.reverter = true;
            break;
          case "Space":
          case "KeyX":
            this.teclas.disparo = true;
            break;
          case "KeyB":
          case "KeyE":
            this.teclas.smartBomb = true;
            break;
          case "KeyH":
          case "KeyQ":
            this.teclas.hiperespaco = true;
            break;
        }
      });

      window.addEventListener("keyup", (e) => {
        switch (e.code) {
          case "ArrowUp":
          case "KeyW":
            this.teclas.cima = false;
            break;
          case "ArrowDown":
          case "KeyS":
            this.teclas.baixo = false;
            break;
          case "ArrowRight":
          case "KeyD":
          case "ArrowLeft":
          case "KeyA":
            this.teclas.thrust = false;
            break;
          case "Space":
          case "KeyX":
            this.teclas.disparo = false;
            break;
        }
      });
    }

    reverterDirecao() {
      if (this.jogador) {
        this.jogador.direcao = -this.jogador.direcao;
      }
    }

    startLoop() {
      const passo = (t) => {
        if (!this.ultimoTempo) this.ultimoTempo = t;
        const dt = Math.min(0.06, (t - this.ultimoTempo) / 1000);
        this.ultimoTempo = t;

        this.atualizar(dt);
        this.desenhar();

        requestAnimationFrame(passo);
      };
      requestAnimationFrame(passo);
    }
  }

  return {
    DefenderGame: DefenderGame
  };
});
