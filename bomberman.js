/**
 * BOMBERMAN RETRÔ (Super Nintendo SNES 1993 Style)
 * Motor de jogo em JavaScript puro, sem dependências externas.
 * Renderização em Canvas 2D de alta fidelidade e áudio sintetizado via Web Audio API.
 * 
 * Compatível com Desktop (teclado) e Mobile (D-Pad / Touch).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Bomberman = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // Constantes de Grid e Elementos
  const COLS = 15;
  const ROWS = 13;
  const TILE_SIZE = 40; // 15 * 40 = 600 largura, 13 * 40 = 520 altura base

  const TILE_EMPTY = 0;
  const TILE_WALL  = 1; // Pilar indestrutível ou borda
  const TILE_BLOCK = 2; // Bloco quebrável (tijolo)

  const POWERUP_BOMB  = 'bomb';   // +1 bomba simultânea
  const POWERUP_FIRE  = 'fire';   // +1 raio de explosão
  const POWERUP_SPEED = 'speed';  // +velocidade de passo
  const POWERUP_HEART = 'heart';  // +1 vida / escudo

  // Tipos de Inimigos
  const ENEMY_TYPES = {
    ballom: { name: 'Ballom', speed: 1.6, points: 100, color: '#f97316', eyeColor: '#ffffff', smart: 0 },
    onil:   { name: 'Onil',   speed: 2.1, points: 200, color: '#0ea5e9', eyeColor: '#ffffff', smart: 1 },
    dahl:   { name: 'Dahl',   speed: 2.5, points: 400, color: '#ef4444', eyeColor: '#facc15', smart: 1 },
    minvo:  { name: 'Minvo',  speed: 2.9, points: 800, color: '#a855f7', eyeColor: '#38bdf8', smart: 2 }
  };

  /* ==========================================================================
     SINTETIZADOR DE ÁUDIO (Web Audio API)
     ========================================================================== */
  class BombermanAudio {
    constructor() {
      this.ctx = null;
      this.enabled = true;
      this.bgmPlaying = false;
      this.bgmTimer = null;
      this.bgmStep = 0;
    }

    init() {
      if (!this.ctx && typeof window !== 'undefined') {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    }

    playTone(freq, type, duration, startVol = 0.25, endVol = 0.001, delay = 0) {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      const t = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(startVol, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, endVol), t + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + duration);
    }

    playNoise(duration, filterFreq = 1000, startVol = 0.3) {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      const bufferSize = this.ctx.sampleRate * duration;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterFreq, this.ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + duration);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(startVol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noise.start();
    }

    bombDrop() {
      if (!this.enabled) return;
      this.playTone(340, 'triangle', 0.08, 0.3, 0.01);
      this.playTone(180, 'sine', 0.14, 0.4, 0.01, 0.04);
    }

    explosion() {
      if (!this.enabled) return;
      this.playNoise(0.45, 1200, 0.55);
      this.playTone(85, 'sawtooth', 0.35, 0.45, 0.01);
      this.playTone(55, 'sine', 0.45, 0.6, 0.01);
    }

    powerup() {
      if (!this.enabled) return;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((f, i) => {
        this.playTone(f, 'square', 0.12, 0.18, 0.01, i * 0.07);
      });
    }

    blockDestroy() {
      if (!this.enabled) return;
      this.playNoise(0.18, 800, 0.28);
      this.playTone(130, 'triangle', 0.16, 0.2, 0.01);
    }

    enemyDefeated() {
      if (!this.enabled) return;
      this.playTone(440, 'square', 0.08, 0.22, 0.01);
      this.playTone(660, 'square', 0.08, 0.22, 0.01, 0.06);
      this.playTone(880, 'square', 0.15, 0.25, 0.01, 0.12);
    }

    playerHurt() {
      if (!this.enabled) return;
      const notes = [493.88, 440.00, 392.00, 329.63, 261.63];
      notes.forEach((f, i) => {
        this.playTone(f, 'sawtooth', 0.16, 0.25, 0.01, i * 0.1);
      });
    }

    stageClear() {
      if (!this.enabled) return;
      const melody = [
        { f: 523.25, d: 0.12 }, { f: 659.25, d: 0.12 }, { f: 783.99, d: 0.12 },
        { f: 1046.50, d: 0.25 }, { f: 880.00, d: 0.12 }, { f: 1046.50, d: 0.40 }
      ];
      let t = 0;
      melody.forEach(m => {
        this.playTone(m.f, 'triangle', m.d, 0.28, 0.01, t);
        t += m.d + 0.04;
      });
    }

    startBgm() {
      if (this.bgmPlaying || !this.enabled) return;
      this.bgmPlaying = true;
      this.bgmStep = 0;

      // Bassline alegre estilo Super Bomberman
      const bassLine = [
        261.63, 261.63, 329.63, 392.00, 440.00, 392.00, 349.23, 293.66,
        261.63, 261.63, 329.63, 392.00, 523.25, 493.88, 440.00, 392.00
      ];

      const tick = () => {
        if (!this.bgmPlaying || !this.enabled) return;
        const note = bassLine[this.bgmStep % bassLine.length];
        this.playTone(note / 2, 'triangle', 0.11, 0.08, 0.005);
        if (this.bgmStep % 4 === 2) {
          this.playTone(note, 'square', 0.07, 0.04, 0.005);
        }
        this.bgmStep++;
        this.bgmTimer = setTimeout(tick, 150);
      };
      tick();
    }

    stopBgm() {
      this.bgmPlaying = false;
      if (this.bgmTimer) {
        clearTimeout(this.bgmTimer);
        this.bgmTimer = null;
      }
    }

    toggle() {
      this.enabled = !this.enabled;
      if (!this.enabled) {
        this.stopBgm();
      } else {
        this.init();
        this.startBgm();
      }
      return this.enabled;
    }
  }

  /* ==========================================================================
     MOTOR PRINCIPAL DO JOGO
     ========================================================================== */
  class BombermanGame {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.ctx = canvas ? canvas.getContext('2d') : null;
      this.options = options;

      this.audio = new BombermanAudio();

      // Callback de HUD
      this.onHudUpdate = options.onHudUpdate || function () {};
      this.onGameOver = options.onGameOver || function () {};
      this.onStageClear = options.onStageClear || function () {};

      // Dimensões do mundo
      this.cols = COLS;
      this.rows = ROWS;
      this.tileSize = TILE_SIZE;
      this.width = this.cols * this.tileSize;   // 600
      this.height = this.rows * this.tileSize; // 520

      // Estado do jogo
      this.state = 'start'; // 'start', 'playing', 'paused', 'stageclear', 'gameover'
      this.score = 0;
      this.highScore = 0;
      this.stage = 1;
      this.lives = 3;
      this.timeRemaining = 200; // segundos
      this.timeTimer = 0;

      // Tabuleiro e entidades
      this.grid = [];
      this.bombs = [];
      this.explosions = [];
      this.destroyingBlocks = [];
      this.powerups = [];
      this.enemies = [];
      this.floatTexts = [];
      this.particles = [];

      this.door = { x: 0, y: 0, open: false, revealed: false };

      // Jogador (Super Bomberman White)
      this.player = {
        x: 1, // em coordenadas de grid (fracionárias para movimento suave)
        y: 1,
        dir: 'down', // 'up', 'down', 'left', 'right'
        moving: false,
        animFrame: 0,
        animTimer: 0,
        speed: 2.6, // pixels por frame a 60fps (convertido na movimentação)
        maxBombs: 1,
        fireRange: 1,
        hasHeart: false,
        invulnerable: 0,
        isDying: false,
        dieTimer: 0
      };

      // Controles
      this.keys = {
        up: false,
        down: false,
        left: false,
        right: false,
        bomb: false
      };
      this.bombKeyReleased = true;

      // Loop
      this.lastTime = 0;
      this.accumTime = 0;
      this.animId = null;

      // Inicia High Score do localStorage
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          const s = localStorage.getItem('arcade_bomberman_highscore');
          if (s) this.highScore = parseInt(s, 10) || 0;
        } catch (e) {}
      }

      this.generateStage(1);
      this.state = 'start';

      this.initEvents();
    }

    initEvents() {
      if (typeof window === 'undefined') return;

      this._keydownHandler = (e) => {
        // Ativa áudio na primeira interação
        this.audio.init();

        const code = e.code || '';
        const key = e.key ? e.key.toLowerCase() : '';

        if (code === 'KeyP' || key === 'p') {
          this.togglePause();
          e.preventDefault();
          return;
        }
        if (code === 'KeyM' || key === 'm') {
          this.toggleSound();
          e.preventDefault();
          return;
        }

        if (code === 'ArrowUp' || code === 'KeyW') { this.keys.up = true; e.preventDefault(); }
        if (code === 'ArrowDown' || code === 'KeyS') { this.keys.down = true; e.preventDefault(); }
        if (code === 'ArrowLeft' || code === 'KeyA') { this.keys.left = true; e.preventDefault(); }
        if (code === 'ArrowRight' || code === 'KeyD') { this.keys.right = true; e.preventDefault(); }

        if (code === 'Space' || code === 'Enter' || code === 'KeyX' || code === 'KeyJ') {
          if (this.state === 'start' || this.state === 'gameover') {
            this.startNewGame();
          } else if (this.state === 'stageclear') {
            this.nextStage();
          } else if (this.bombKeyReleased) {
            this.dropBomb();
            this.bombKeyReleased = false;
          }
          e.preventDefault();
        }
      };

      this._keyupHandler = (e) => {
        const code = e.code || '';
        if (code === 'ArrowUp' || code === 'KeyW') this.keys.up = false;
        if (code === 'ArrowDown' || code === 'KeyS') this.keys.down = false;
        if (code === 'ArrowLeft' || code === 'KeyA') this.keys.left = false;
        if (code === 'ArrowRight' || code === 'KeyD') this.keys.right = false;
        if (code === 'Space' || code === 'Enter' || code === 'KeyX' || code === 'KeyJ') {
          this.bombKeyReleased = true;
        }
      };

      window.addEventListener('keydown', this._keydownHandler);
      window.addEventListener('keyup', this._keyupHandler);
    }

    destroy() {
      if (this.animId) {
        cancelAnimationFrame(this.animId);
        this.animId = null;
      }
      this.audio.stopBgm();
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', this._keydownHandler);
        window.removeEventListener('keyup', this._keyupHandler);
      }
    }

    /* ==========================================================================
       GERAÇÃO DE ARENA & ESTÁGIO
       ========================================================================== */
    generateStage(stageNum) {
      this.stage = stageNum;
      this.grid = [];
      this.bombs = [];
      this.explosions = [];
      this.destroyingBlocks = [];
      this.powerups = [];
      this.enemies = [];
      this.floatTexts = [];
      this.particles = [];
      this.timeRemaining = Math.max(120, 210 - (stageNum * 10));

      // Reset do jogador para a posição inicial (1, 1)
      this.player.x = 1.0;
      this.player.y = 1.0;
      this.player.dir = 'down';
      this.player.moving = false;
      this.player.isDying = false;
      this.player.dieTimer = 0;
      this.player.invulnerable = 90; // 1.5s invulnerável

      // 1. Constrói grid com bordas e pilares indestrutíveis estilo SNES
      const potentialBlockSpots = [];
      for (let r = 0; r < this.rows; r++) {
        this.grid[r] = [];
        for (let c = 0; c < this.cols; c++) {
          if (r === 0 || r === this.rows - 1 || c === 0 || c === this.cols - 1) {
            this.grid[r][c] = TILE_WALL; // Parede de contorno
          } else if (r % 2 === 0 && c % 2 === 0) {
            this.grid[r][c] = TILE_WALL; // Pilar fixo de pedra
          } else {
            this.grid[r][c] = TILE_EMPTY;
            // Zonas seguras do jogador no canto superior esquerdo
            const isSafeZone = (r === 1 && c === 1) || (r === 1 && c === 2) || (r === 2 && c === 1);
            if (!isSafeZone) {
              potentialBlockSpots.push({ r, c });
            }
          }
        }
      }

      // Embaralha as posições potenciais para blocos quebráveis
      for (let i = potentialBlockSpots.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = potentialBlockSpots[i];
        potentialBlockSpots[i] = potentialBlockSpots[j];
        potentialBlockSpots[j] = temp;
      }

      // Preenche ~60-70% com blocos destrutíveis
      const numBlocks = Math.floor(potentialBlockSpots.length * 0.65);
      const chosenBlockSpots = potentialBlockSpots.slice(0, numBlocks);
      const remainingFreeSpots = potentialBlockSpots.slice(numBlocks);

      chosenBlockSpots.forEach(s => {
        this.grid[s.r][s.c] = TILE_BLOCK;
      });

      // 2. Esconde o Portal de Saída (Door) sob um dos blocos quebráveis
      const doorSpot = chosenBlockSpots[0] || { r: 5, c: 5 };
      this.door = {
        x: doorSpot.c,
        y: doorSpot.r,
        open: false,
        revealed: false
      };

      // 3. Esconde Power-ups sob outros blocos quebráveis
      const powerupTypes = [
        POWERUP_BOMB,
        POWERUP_FIRE,
        POWERUP_FIRE,
        POWERUP_BOMB,
        POWERUP_SPEED
      ];
      if (Math.random() > 0.4) powerupTypes.push(POWERUP_HEART);

      for (let i = 1; i < chosenBlockSpots.length && i <= powerupTypes.length; i++) {
        const pSpot = chosenBlockSpots[i];
        this.powerups.push({
          x: pSpot.c,
          y: pSpot.r,
          type: powerupTypes[i - 1],
          revealed: false
        });
      }

      // 4. Cria Inimigos patrulhando áreas livres
      // Tipos baseados na fase
      const count = Math.min(10, 3 + stageNum);
      const enemyPool = ['ballom'];
      if (stageNum >= 2) enemyPool.push('onil');
      if (stageNum >= 3) enemyPool.push('dahl');
      if (stageNum >= 4) enemyPool.push('minvo');

      // Pega posições livres longe do jogador
      const enemySpots = remainingFreeSpots.filter(s => (s.r + s.c > 4));
      for (let i = 0; i < count; i++) {
        let spot = enemySpots[i % enemySpots.length];
        if (!spot) spot = { r: this.rows - 2, c: this.cols - 2 };
        const typeKey = enemyPool[Math.floor(Math.random() * enemyPool.length)];
        const info = ENEMY_TYPES[typeKey];

        this.enemies.push({
          x: spot.c,
          y: spot.r,
          type: typeKey,
          name: info.name,
          speed: info.speed,
          points: info.points,
          color: info.color,
          smart: info.smart,
          dir: ['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)],
          animTimer: Math.random() * 10,
          animFrame: 0,
          changeDirTimer: 30 + Math.floor(Math.random() * 60)
        });
      }

      this.updateHud();
    }

    startNewGame() {
      this.score = 0;
      this.lives = 3;
      this.player.maxBombs = 1;
      this.player.fireRange = 1;
      this.player.speed = 2.6;
      this.player.hasHeart = false;
      this.state = 'playing';
      this.generateStage(1);
      this.audio.init();
      this.audio.startBgm();
      this.updateHud();
    }

    nextStage() {
      this.audio.stageClear();
      this.score += 1000 + (this.timeRemaining * 10);
      if (this.score > this.highScore) {
        this.highScore = this.score;
        this.saveHighScore();
      }
      this.state = 'playing';
      this.generateStage(this.stage + 1);
    }

    saveHighScore() {
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          localStorage.setItem('arcade_bomberman_highscore', String(this.highScore));
        } catch (e) {}
      }
    }

    togglePause() {
      if (this.state === 'playing') {
        this.state = 'paused';
        this.audio.stopBgm();
      } else if (this.state === 'paused') {
        this.state = 'playing';
        this.audio.startBgm();
      }
      this.updateHud();
    }

    toggleSound() {
      const active = this.audio.toggle();
      this.updateHud();
      return active;
    }

    updateHud() {
      const activeBombs = this.bombs.filter(b => b.owner === 'player').length;
      this.onHudUpdate({
        score: this.score,
        highScore: this.highScore,
        stage: this.stage,
        lives: this.lives,
        bombs: activeBombs,
        maxBombs: this.player.maxBombs,
        fireRange: this.player.fireRange,
        speed: Math.round((this.player.speed / 2.6) * 100) + '%',
        timeRemaining: this.timeRemaining,
        enemiesLeft: this.enemies.length,
        hasHeart: this.player.hasHeart,
        sound: this.audio.enabled,
        state: this.state
      });
    }

    /* ==========================================================================
       LÓGICA DE MOVIMENTAÇÃO & CORNER ASSIST (SLIDING)
       ========================================================================== */
    canMoveTo(tileX, tileY) {
      if (tileX < 0 || tileX >= this.cols || tileY < 0 || tileY >= this.rows) return false;
      if (this.grid[tileY][tileX] !== TILE_EMPTY) return false;

      // Verifica se há bomba sólida naquele tile
      const bomb = this.bombs.find(b => b.x === tileX && b.y === tileY);
      if (bomb) {
        // Se o jogador acabou de plantar e ainda não saiu do tile, ele pode sair
        const pTileX = Math.round(this.player.x);
        const pTileY = Math.round(this.player.y);
        if (pTileX === tileX && pTileY === tileY) {
          return true;
        }
        return false;
      }
      return true;
    }

    movePlayer(dx, dy) {
      if (this.player.isDying || this.state !== 'playing') return;

      const step = (this.player.speed / this.tileSize);
      const r = 0.35; // Raio da hitbox do jogador

      // Assistente de curva (Corner Assist / Sliding) estilo SNES
      const alignSpeed = step * 0.75;

      if (dx !== 0) {
        // Alinhamento vertical ao corredor horizontal
        const targetRow = Math.round(this.player.y);
        const diffY = targetRow - this.player.y;
        if (Math.abs(diffY) > 0.01 && Math.abs(diffY) < 0.45) {
          this.player.y += Math.sign(diffY) * Math.min(Math.abs(diffY), alignSpeed);
        }

        const targetX = this.player.x + (dx * step);
        const pY = this.player.y + 0.5;
        const targetPX = targetX + 0.5;

        const checkTileX = dx > 0 ? Math.floor(targetPX + r) : Math.floor(targetPX - r);
        const topTileY = Math.floor(pY - r + 0.05);
        const btmTileY = Math.floor(pY + r - 0.05);

        if (this.canMoveTo(checkTileX, topTileY) && this.canMoveTo(checkTileX, btmTileY)) {
          this.player.x = targetX;
        } else {
          // Encosta rente à borda do obstáculo
          if (dx > 0) this.player.x = checkTileX - 0.5 - r;
          else this.player.x = checkTileX + 0.5 + r;
        }
        this.player.dir = dx > 0 ? 'right' : 'left';
      }

      if (dy !== 0) {
        // Alinhamento horizontal ao corredor vertical
        const targetCol = Math.round(this.player.x);
        const diffX = targetCol - this.player.x;
        if (Math.abs(diffX) > 0.01 && Math.abs(diffX) < 0.45) {
          this.player.x += Math.sign(diffX) * Math.min(Math.abs(diffX), alignSpeed);
        }

        const targetY = this.player.y + (dy * step);
        const pX = this.player.x + 0.5;
        const targetPY = targetY + 0.5;

        const checkTileY = dy > 0 ? Math.floor(targetPY + r) : Math.floor(targetPY - r);
        const leftTileX = Math.floor(pX - r + 0.05);
        const rightTileX = Math.floor(pX + r - 0.05);

        if (this.canMoveTo(leftTileX, checkTileY) && this.canMoveTo(rightTileX, checkTileY)) {
          this.player.y = targetY;
        } else {
          if (dy > 0) this.player.y = checkTileY - 0.5 - r;
          else this.player.y = checkTileY + 0.5 + r;
        }
        this.player.dir = dy > 0 ? 'down' : 'up';
      }

      this.player.moving = (dx !== 0 || dy !== 0);

      // Coleta de Power-ups
      const pTileX = Math.round(this.player.x);
      const pTileY = Math.round(this.player.y);

      for (let i = this.powerups.length - 1; i >= 0; i--) {
        const pu = this.powerups[i];
        if (pu.revealed && pu.x === pTileX && pu.y === pTileY) {
          this.collectPowerup(pu);
          this.powerups.splice(i, 1);
        }
      }

      // Checa entrada no Portal de Saída (Door)
      if (this.door.revealed && this.door.open && this.door.x === pTileX && this.door.y === pTileY) {
        this.state = 'stageclear';
        this.audio.stageClear();
        this.onStageClear({ stage: this.stage, score: this.score });
        this.updateHud();
      }
    }

    collectPowerup(pu) {
      this.audio.powerup();
      let label = '';
      if (pu.type === POWERUP_BOMB) {
        this.player.maxBombs = Math.min(8, this.player.maxBombs + 1);
        label = '+1 BOMBA!';
      } else if (pu.type === POWERUP_FIRE) {
        this.player.fireRange = Math.min(8, this.player.fireRange + 1);
        label = '+1 FOGO!';
      } else if (pu.type === POWERUP_SPEED) {
        this.player.speed = Math.min(4.4, this.player.speed + 0.4);
        label = 'VELOCIDADE!';
      } else if (pu.type === POWERUP_HEART) {
        this.player.hasHeart = true;
        label = 'ESCUDO ❤️!';
      }

      this.score += 200;
      this.addFloatText(pu.x, pu.y, label, '#facc15');
      this.updateHud();
    }

    addFloatText(tileX, tileY, text, color = '#ffffff') {
      this.floatTexts.push({
        x: (tileX + 0.5) * this.tileSize,
        y: (tileY + 0.5) * this.tileSize,
        text,
        color,
        life: 45
      });
    }

    /* ==========================================================================
       BOMBAS & DETONAÇÕES
       ========================================================================== */
    dropBomb() {
      if (this.state !== 'playing' || this.player.isDying) return;

      const tileX = Math.round(this.player.x);
      const tileY = Math.round(this.player.y);

      // Não planta se já tiver bomba no mesmo tile
      if (this.bombs.some(b => b.x === tileX && b.y === tileY)) return;

      // Checa contagem máxima de bombas do jogador
      const activeBombs = this.bombs.filter(b => b.owner === 'player').length;
      if (activeBombs >= this.player.maxBombs) return;

      this.audio.bombDrop();
      this.bombs.push({
        x: tileX,
        y: tileY,
        range: this.player.fireRange,
        timer: 170, // ~2.8 segundos a 60fps
        owner: 'player',
        pulse: 0
      });
      this.updateHud();
    }

    detonateBomb(bombIndex) {
      if (bombIndex < 0 || bombIndex >= this.bombs.length) return;
      const bomb = this.bombs.splice(bombIndex, 1)[0];

      this.audio.explosion();

      // Centro da explosão
      this.createExplosionTile(bomb.x, bomb.y, 'center');

      // Propagação nas 4 direções cardeais
      const dirs = [
        { dx: 0, dy: -1, type: 'up' },
        { dx: 0, dy: 1,  type: 'down' },
        { dx: -1, dy: 0, type: 'left' },
        { dx: 1, dy: 0,  type: 'right' }
      ];

      dirs.forEach(d => {
        for (let step = 1; step <= bomb.range; step++) {
          const tx = bomb.x + (d.dx * step);
          const ty = bomb.y + (d.dy * step);

          // Fora do grid
          if (tx < 0 || tx >= this.cols || ty < 0 || ty >= this.rows) break;

          // Se for pilar ou borda sólida: a explosão é bloqueada completamente
          if (this.grid[ty][tx] === TILE_WALL) {
            break;
          }

          // Se for bloco quebrável: destrói o bloco e interrompe o fogo nessa direção
          if (this.grid[ty][tx] === TILE_BLOCK) {
            this.destroyBlock(tx, ty);
            this.createExplosionTile(tx, ty, d.type + '_end');
            break;
          }

          // Se atingir outra bomba: detonação em cadeia imediata!
          const otherBombIdx = this.bombs.findIndex(b => b.x === tx && b.y === ty);
          if (otherBombIdx !== -1) {
            this.detonateBomb(otherBombIdx);
            break;
          }

          // Tile vazio: cria chama normal ou ponta
          const isEnd = (step === bomb.range);
          this.createExplosionTile(tx, ty, isEnd ? (d.type + '_end') : d.type);
        }
      });

      this.updateHud();
    }

    createExplosionTile(x, y, type) {
      this.explosions.push({
        x,
        y,
        type,
        timer: 26 // duração da chama em frames (~0.4s)
      });

      // Se atingir power-ups revelados: vaporiza o item (regra clássica SNES)
      for (let i = this.powerups.length - 1; i >= 0; i--) {
        const pu = this.powerups[i];
        if (pu.revealed && pu.x === x && pu.y === y) {
          this.powerups.splice(i, 1);
          this.addFloatText(x, y, 'QUEIMOU!', '#f87171');
        }
      }
    }

    destroyBlock(x, y) {
      this.grid[y][x] = TILE_EMPTY;
      this.audio.blockDestroy();
      this.destroyingBlocks.push({ x, y, timer: 18 });

      // Revela o Portal se estiver aqui
      if (this.door.x === x && this.door.y === y) {
        this.door.revealed = true;
      }

      // Revela Power-up se estiver aqui
      const pu = this.powerups.find(p => p.x === x && p.y === y);
      if (pu) {
        pu.revealed = true;
      }

      this.score += 10;
    }

    /* ==========================================================================
       IA DOS INIMIGOS
       ========================================================================== */
    updateEnemies() {
      const pTileX = Math.round(this.player.x);
      const pTileY = Math.round(this.player.y);

      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        const step = (e.speed / this.tileSize);

        // Movimento
        let dx = 0, dy = 0;
        if (e.dir === 'up') dy = -1;
        else if (e.dir === 'down') dy = 1;
        else if (e.dir === 'left') dx = -1;
        else if (e.dir === 'right') dx = 1;

        let nx = e.x + (dx * step);
        let ny = e.y + (dy * step);

        // Checagem de colisão do inimigo
        const r = 0.35;
        const checkX = dx > 0 ? Math.floor(nx + r) : Math.floor(nx - r);
        const checkY = dy > 0 ? Math.floor(ny + r) : Math.floor(ny - r);

        let blocked = false;
        if (dx !== 0) {
          const ty1 = Math.floor(e.y - r + 0.05);
          const ty2 = Math.floor(e.y + r - 0.05);
          if (!this.isTileWalkableForEnemy(checkX, ty1) || !this.isTileWalkableForEnemy(checkX, ty2)) {
            blocked = true;
          }
        }
        if (dy !== 0) {
          const tx1 = Math.floor(e.x - r + 0.05);
          const tx2 = Math.floor(e.x + r - 0.05);
          if (!this.isTileWalkableForEnemy(tx1, checkY) || !this.isTileWalkableForEnemy(tx2, checkY)) {
            blocked = true;
          }
        }

        e.changeDirTimer--;

        // IA esperta: se tiver visão do jogador na mesma linha ou coluna
        if (e.smart > 0 && Math.random() < 0.08) {
          const exRound = Math.round(e.x);
          const eyRound = Math.round(e.y);
          if (exRound === pTileX) {
            e.dir = pTileY > eyRound ? 'down' : 'up';
          } else if (eyRound === pTileY) {
            e.dir = pTileX > exRound ? 'right' : 'left';
          }
        }

        if (blocked || e.changeDirTimer <= 0) {
          e.changeDirTimer = 30 + Math.floor(Math.random() * 60);
          // Escolhe nova direção válida
          const possibleDirs = ['up', 'down', 'left', 'right'].filter(d => d !== e.dir);
          e.dir = possibleDirs[Math.floor(Math.random() * possibleDirs.length)];
        } else {
          e.x = nx;
          e.y = ny;
        }

        // Animação de caminhada/pulso
        e.animTimer += 0.15;
        e.animFrame = Math.floor(e.animTimer) % 2;

        // Colisão do inimigo com explosão de bomba
        const exTile = Math.round(e.x);
        const eyTile = Math.round(e.y);
        const hitByFire = this.explosions.some(exp => exp.x === exTile && exp.y === eyTile);

        if (hitByFire) {
          this.audio.enemyDefeated();
          this.score += e.points;
          this.addFloatText(exTile, eyTile, `+${e.points}`, '#38bdf8');
          this.enemies.splice(i, 1);

          // Se eliminou todos os inimigos, o portal se abre!
          if (this.enemies.length === 0) {
            this.door.open = true;
            this.addFloatText(this.door.x, this.door.y, 'PORTAL ABERTO! 🚪', '#4ade80');
          }
          this.updateHud();
          continue;
        }

        // Colisão com o jogador
        if (!this.player.isDying && this.player.invulnerable <= 0) {
          const dist = Math.hypot(this.player.x - e.x, this.player.y - e.y);
          if (dist < 0.65) {
            this.hitPlayer();
          }
        }
      }
    }

    isTileWalkableForEnemy(tx, ty) {
      if (tx < 0 || tx >= this.cols || ty < 0 || ty >= this.rows) return false;
      if (this.grid[ty][tx] !== TILE_EMPTY) return false;
      // Inimigos não passam por bombas
      if (this.bombs.some(b => b.x === tx && b.y === ty)) return false;
      return true;
    }

    /* ==========================================================================
       DANO & MORTE DO JOGADOR
       ========================================================================== */
    hitPlayer() {
      if (this.player.isDying || this.player.invulnerable > 0) return;

      if (this.player.hasHeart) {
        // Escudo absorve 1 dano
        this.player.hasHeart = false;
        this.player.invulnerable = 120; // 2 segundos invulnerável
        this.audio.playerHurt();
        this.addFloatText(Math.round(this.player.x), Math.round(this.player.y), 'ESCUDO PERDIDO!', '#fb7185');
        this.updateHud();
        return;
      }

      this.player.isDying = true;
      this.player.dieTimer = 60;
      this.audio.playerHurt();
      this.updateHud();
    }

    handlePlayerDeath() {
      this.lives--;
      this.updateHud();

      if (this.lives <= 0) {
        this.state = 'gameover';
        if (this.score > this.highScore) {
          this.highScore = this.score;
          this.saveHighScore();
        }
        this.audio.stopBgm();
        this.onGameOver({ score: this.score, stage: this.stage });
      } else {
        // Respawn na fase atual
        this.player.x = 1.0;
        this.player.y = 1.0;
        this.player.dir = 'down';
        this.player.moving = false;
        this.player.isDying = false;
        this.player.invulnerable = 120;
      }
      this.updateHud();
    }

    /* ==========================================================================
       LOOP PRINCIPAL DE ATUALIZAÇÃO (TICK)
       ========================================================================== */
    update() {
      if (this.state !== 'playing' && this.state !== 'stageclear') return;

      // 1. Contador regressivo de tempo
      this.timeTimer++;
      if (this.timeTimer >= 60) {
        this.timeTimer = 0;
        if (this.timeRemaining > 0) {
          this.timeRemaining--;
          if (this.timeRemaining === 30) {
            this.addFloatText(7, 6, 'APRESSE-SE! ⚠️', '#ef4444');
          }
          if (this.timeRemaining === 0) {
            this.hitPlayer(); // Tempo esgotado
          }
          this.updateHud();
        }
      }

      // 2. Invulnerabilidade do jogador
      if (this.player.invulnerable > 0) {
        this.player.invulnerable--;
      }

      // 3. Morte do jogador
      if (this.player.isDying) {
        this.player.dieTimer--;
        if (this.player.dieTimer <= 0) {
          this.handlePlayerDeath();
        }
        return;
      }

      // 4. Movimento do jogador baseado nas teclas
      let dx = 0, dy = 0;
      if (this.keys.up) dy -= 1;
      if (this.keys.down) dy += 1;
      if (this.keys.left) dx -= 1;
      if (this.keys.right) dx += 1;

      if (dx !== 0 || dy !== 0) {
        this.movePlayer(dx, dy);
        this.player.animTimer += 0.2;
        this.player.animFrame = Math.floor(this.player.animTimer) % 4;
      } else {
        this.player.moving = false;
        this.player.animFrame = 0;
      }

      // 5. Atualização das bombas
      for (let i = this.bombs.length - 1; i >= 0; i--) {
        const b = this.bombs[i];
        b.timer--;
        b.pulse += 0.08;
        if (b.timer <= 0) {
          this.detonateBomb(i);
        }
      }

      // 6. Atualização das chamas / explosões
      for (let i = this.explosions.length - 1; i >= 0; i--) {
        const exp = this.explosions[i];
        exp.timer--;
        if (exp.timer <= 0) {
          this.explosions.splice(i, 1);
        }
      }

      // Checa se o fogo atinge o jogador
      if (!this.player.isDying && this.player.invulnerable <= 0) {
        const pTileX = Math.round(this.player.x);
        const pTileY = Math.round(this.player.y);
        const inFire = this.explosions.some(exp => exp.x === pTileX && exp.y === pTileY);
        if (inFire) {
          this.hitPlayer();
        }
      }

      // 7. Atualização de blocos quebrando
      for (let i = this.destroyingBlocks.length - 1; i >= 0; i--) {
        const db = this.destroyingBlocks[i];
        db.timer--;
        if (db.timer <= 0) {
          this.destroyingBlocks.splice(i, 1);
        }
      }

      // 8. Atualização de textos flutuantes
      for (let i = this.floatTexts.length - 1; i >= 0; i--) {
        const ft = this.floatTexts[i];
        ft.y -= 0.6;
        ft.life--;
        if (ft.life <= 0) {
          this.floatTexts.splice(i, 1);
        }
      }

      // 9. Atualização dos inimigos
      this.updateEnemies();
    }

    /* ==========================================================================
       RENDERIZAÇÃO VISUAL (CANVAS 2D RETRÔ SNES)
       ========================================================================== */
    draw() {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const ts = this.tileSize;

      ctx.save();
      // Limpeza do canvas
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, this.width, this.height);

      // 1. Gramado / Piso da Arena (Estilo Super Bomberman SNES)
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const x = c * ts;
          const y = r * ts;

          // Padrão xadrez suave de grama verde vibrante
          const isDarker = (r + c) % 2 === 0;
          ctx.fillStyle = isDarker ? '#34782b' : '#3d8832';
          ctx.fillRect(x, y, ts, ts);

          // Detalhes de textura da relva
          ctx.fillStyle = isDarker ? '#296022' : '#479d3b';
          ctx.fillRect(x + 4, y + 6, 2, 2);
          ctx.fillRect(x + 24, y + 28, 3, 2);
          ctx.fillRect(x + 32, y + 10, 2, 3);
        }
      }

      // 2. Portal de Saída (Door) se revelado
      if (this.door.revealed) {
        this.drawDoor(ctx, this.door.x * ts, this.door.y * ts, this.door.open);
      }

      // 3. Power-ups no chão (revelados)
      this.powerups.forEach(pu => {
        if (pu.revealed) {
          this.drawPowerup(ctx, pu.x * ts, pu.y * ts, pu.type);
        }
      });

      // 4. Blocos em desintegração
      this.destroyingBlocks.forEach(db => {
        this.drawDestroyingBlock(ctx, db.x * ts, db.y * ts, db.timer);
      });

      // 5. Paredes e Blocos Quebráveis
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const val = this.grid[r][c];
          const x = c * ts;
          const y = r * ts;

          if (val === TILE_WALL) {
            // Pilar de Pedra 3D com chanfro e sombras
            this.drawSolidWall(ctx, x, y, (r === 0 || r === this.rows - 1 || c === 0 || c === this.cols - 1));
          } else if (val === TILE_BLOCK) {
            // Bloco de tijolo marrom/vermelho SNES
            this.drawBrickBlock(ctx, x, y);
          }
        }
      }

      // 6. Bombas
      this.bombs.forEach(b => {
        this.drawBomb(ctx, b.x * ts, b.y * ts, b.pulse);
      });

      // 7. Explosões / Fogo Cross
      this.explosions.forEach(exp => {
        this.drawExplosion(ctx, exp.x * ts, exp.y * ts, exp.type, exp.timer);
      });

      // 8. Inimigos
      this.enemies.forEach(e => {
        this.drawEnemy(ctx, e);
      });

      // 9. Jogador (Super Bomberman)
      if (this.player.invulnerable % 6 < 3) {
        this.drawPlayer(ctx);
      }

      // 10. Textos flutuantes
      this.floatTexts.forEach(ft => {
        ctx.font = 'bold 12px ui-monospace, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000000';
        ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, ft.x, ft.y);
      });

      // 11. Overlays de Telas (Pausa, Game Over, Stage Clear)
      if (this.state === 'start') {
        this.drawStartScreen(ctx);
      } else if (this.state === 'paused') {
        this.drawPausedOverlay(ctx);
      } else if (this.state === 'gameover') {
        this.drawGameOverScreen(ctx);
      } else if (this.state === 'stageclear') {
        this.drawStageClearScreen(ctx);
      }

      ctx.restore();
    }

    drawSolidWall(ctx, x, y, isBorder) {
      const ts = this.tileSize;

      // Base do pilar cinza-ardósia
      ctx.fillStyle = '#475569';
      ctx.fillRect(x, y, ts, ts);

      // Topo iluminado
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(x + 2, y + 2, ts - 4, 6);
      ctx.fillRect(x + 2, y + 2, 6, ts - 4);

      // Sombra inferior chanfrada
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x + 2, y + ts - 6, ts - 4, 4);
      ctx.fillRect(x + ts - 6, y + 2, 4, ts - 4);

      // Centro em relevo
      ctx.fillStyle = '#64748b';
      ctx.fillRect(x + 6, y + 6, ts - 12, ts - 12);

      // Revestimento de pedra SNES
      ctx.fillStyle = '#334155';
      ctx.fillRect(x + 10, y + 10, 3, 3);
      ctx.fillRect(x + ts - 14, y + 14, 2, 4);
    }

    drawBrickBlock(ctx, x, y) {
      const ts = this.tileSize;

      // Tijolo marrom avermelhado clássico
      ctx.fillStyle = '#9a3412';
      ctx.fillRect(x, y, ts, ts);

      // Linhas de argamassa cinza escura
      ctx.fillStyle = '#451a03';
      ctx.fillRect(x, y + 13, ts, 2);
      ctx.fillRect(x, y + 26, ts, 2);

      // Juntas verticais
      ctx.fillRect(x + 19, y, 2, 13);
      ctx.fillRect(x + 9, y + 13, 2, 13);
      ctx.fillRect(x + 29, y + 13, 2, 13);
      ctx.fillRect(x + 19, y + 26, 2, 14);

      // Brilho no topo dos tijolos
      ctx.fillStyle = '#ea580c';
      ctx.fillRect(x + 1, y + 1, 18, 2);
      ctx.fillRect(x + 21, y + 1, 18, 2);
      ctx.fillRect(x + 1, y + 15, 8, 2);
      ctx.fillRect(x + 11, y + 15, 18, 2);
      ctx.fillRect(x + 1, y + 28, 18, 2);
    }

    drawDestroyingBlock(ctx, x, y, timer) {
      const ts = this.tileSize;
      const progress = 1 - (timer / 18);
      ctx.fillStyle = '#ea580c';
      const spread = progress * 14;

      // Estilhaços pixelados
      ctx.fillRect(x + 6 - spread, y + 6 - spread, 8, 8);
      ctx.fillRect(x + 24 + spread, y + 8 - spread, 8, 8);
      ctx.fillRect(x + 8 - spread, y + 24 + spread, 7, 7);
      ctx.fillRect(x + 22 + spread, y + 22 + spread, 9, 9);
    }

    drawDoor(ctx, x, y, isOpen) {
      const ts = this.tileSize;
      // Moldura da porta
      ctx.fillStyle = '#334155';
      ctx.fillRect(x + 4, y + 4, ts - 8, ts - 8);

      if (isOpen) {
        // Portal de luz radiante azul/ciano
        const pulse = Math.sin(Date.now() * 0.008) * 0.3 + 0.7;
        ctx.fillStyle = `rgba(56, 189, 248, ${pulse})`;
        ctx.fillRect(x + 8, y + 8, ts - 16, ts - 16);

        // Vórtice central
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 16, y + 16, 8, 8);
      } else {
        // Fechada com cadeado dourado
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(x + 8, y + 8, ts - 16, ts - 16);

        // Cadeado
        ctx.fillStyle = '#facc15';
        ctx.fillRect(x + 16, y + 18, 8, 8);
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 18, y + 14, 4, 5);
      }
    }

    drawPowerup(ctx, x, y, type) {
      const ts = this.tileSize;
      // Caixa do item flutuante
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(x + 6, y + 6, ts - 12, ts - 12);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(x + 8, y + 8, ts - 16, ts - 16);

      // Ícone interno
      const cx = x + (ts / 2);
      const cy = y + (ts / 2);

      if (type === POWERUP_BOMB) {
        // Mini bomba preta
        ctx.fillStyle = '#111827';
        ctx.beginPath();
        ctx.arc(cx, cy + 1, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(cx - 1, cy - 8, 3, 3);
      } else if (type === POWERUP_FIRE) {
        // Chama amarela/laranja
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(cx, cy - 7);
        ctx.lineTo(cx + 6, cy + 6);
        ctx.lineTo(cx - 6, cy + 6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.moveTo(cx, cy - 2);
        ctx.lineTo(cx + 3, cy + 5);
        ctx.lineTo(cx - 3, cy + 5);
        ctx.closePath();
        ctx.fill();
      } else if (type === POWERUP_SPEED) {
        // Patim / Sapato veloz
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(cx - 6, cy - 2, 12, 6);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx - 3, cy + 6, 2, 0, Math.PI * 2);
        ctx.arc(cx + 3, cy + 6, 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (type === POWERUP_HEART) {
        // Coração vermelho
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.arc(cx - 3, cy - 2, 4, 0, Math.PI * 2);
        ctx.arc(cx + 3, cy - 2, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx - 7, cy);
        ctx.lineTo(cx, cy + 7);
        ctx.lineTo(cx + 7, cy);
        ctx.fill();
      }
    }

    drawBomb(ctx, x, y, pulse) {
      const ts = this.tileSize;
      const cx = x + (ts / 2);
      const cy = y + (ts / 2) + 2;

      // Pulso dinâmico antes de estourar
      const scale = 1 + Math.sin(pulse * 3) * 0.08;
      const radius = 12 * scale;

      // Sombra no chão
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(cx, y + ts - 4, 14, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Corpo esférico preto
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      // Brilho especular 3D
      ctx.fillStyle = '#6b7280';
      ctx.beginPath();
      ctx.arc(cx - (radius * 0.35), cy - (radius * 0.35), radius * 0.35, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - (radius * 0.45), cy - (radius * 0.45), radius * 0.15, 0, Math.PI * 2);
      ctx.fill();

      // Bocal branco da bomba
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(cx - 3, cy - radius - 2, 6, 3);

      // Pavio e faísca amarela cintilante
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(cx - 1, cy - radius - 6, 2, 4);

      const sparkColor = Math.random() > 0.5 ? '#facc15' : '#ef4444';
      ctx.fillStyle = sparkColor;
      ctx.fillRect(cx - 2 + (Math.random() * 4 - 2), cy - radius - 8, 4, 4);
    }

    drawExplosion(ctx, x, y, type, timer) {
      const ts = this.tileSize;
      const alpha = Math.min(1, timer / 12);
      ctx.save();
      ctx.globalAlpha = alpha;

      const cx = x + (ts / 2);
      const cy = y + (ts / 2);

      // Camada externa vermelha
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(x + 2, y + 2, ts - 4, ts - 4);

      // Camada média laranja vibrante
      ctx.fillStyle = '#f97316';
      ctx.fillRect(x + 6, y + 6, ts - 12, ts - 12);

      // Núcleo superaquecido amarelo/branco
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(x + 12, y + 12, ts - 24, ts - 24);

      // Faíscas crepitantes
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 2, cy - 2, 4, 4);

      ctx.restore();
    }

    drawEnemy(ctx, e) {
      const ts = this.tileSize;
      const cx = (e.x + 0.5) * ts;
      const cy = (e.y + 0.5) * ts;
      const bounce = Math.sin(e.animTimer * 2) * 2;

      ctx.save();
      // Sombra
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 14, 11, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Corpo principal do monstro
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(cx, cy + bounce, 12, 0, Math.PI * 2);
      ctx.fill();

      // Olhos expressivos
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - 4, cy - 2 + bounce, 3.5, 0, Math.PI * 2);
      ctx.arc(cx + 4, cy - 2 + bounce, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Pupilas na direção do movimento
      let lookX = 0, lookY = 0;
      if (e.dir === 'left') lookX = -1.5;
      if (e.dir === 'right') lookX = 1.5;
      if (e.dir === 'up') lookY = -1.5;
      if (e.dir === 'down') lookY = 1.5;

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(cx - 4 + lookX, cy - 2 + lookY + bounce, 1.8, 0, Math.PI * 2);
      ctx.arc(cx + 4 + lookX, cy - 2 + lookY + bounce, 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Boca
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy + 4 + bounce, 3, 0, Math.PI);
      ctx.stroke();

      ctx.restore();
    }

    drawPlayer(ctx) {
      const ts = this.tileSize;
      const cx = (this.player.x + 0.5) * ts;
      const cy = (this.player.y + 0.5) * ts;
      const dir = this.player.dir;
      const legOffset = this.player.moving ? (this.player.animFrame % 2 === 0 ? 3 : -3) : 0;

      ctx.save();

      // Sombra do jogador
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 15, 12, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      if (this.player.isDying) {
        // Animação de rotação e achatamento na morte
        const rot = (60 - this.player.dieTimer) * 0.2;
        ctx.translate(cx, cy);
        ctx.rotate(rot);
        ctx.scale(Math.max(0.2, this.player.dieTimer / 60), Math.max(0.2, this.player.dieTimer / 60));
        ctx.translate(-cx, -cy);
      }

      // 1. Pernas / Botas marrons
      ctx.fillStyle = '#78350f';
      ctx.fillRect(cx - 7, cy + 8 + legOffset, 5, 7);
      ctx.fillRect(cx + 2, cy + 8 - legOffset, 5, 7);

      // 2. Tronco (Túnica azul do Bomberman clássico)
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(cx - 6, cy + 2, 12, 8);

      // Cinto rosa com fivela
      ctx.fillStyle = '#ec4899';
      ctx.fillRect(cx - 6, cy + 6, 12, 3);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(cx - 2, cy + 6, 4, 3);

      // 3. Braços / Mãos brancas
      ctx.fillStyle = '#ffffff';
      if (dir === 'left') {
        ctx.fillRect(cx - 9, cy + 4, 4, 4);
      } else if (dir === 'right') {
        ctx.fillRect(cx + 5, cy + 4, 4, 4);
      } else {
        ctx.fillRect(cx - 9, cy + 3 - legOffset, 4, 5);
        ctx.fillRect(cx + 5, cy + 3 + legOffset, 4, 5);
      }

      // 4. Cabeça / Capacete esférico branco do Bomberman
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(cx, cy - 5, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Antena no topo com pompom rosa
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(cx - 1, cy - 18, 2, 3);
      ctx.fillStyle = '#ec4899';
      ctx.beginPath();
      ctx.arc(cx, cy - 19, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // 5. Visor / Olhos
      if (dir === 'up') {
        // De costas, só vemos a parte de trás do capacete
      } else {
        // Visor azul escuro
        ctx.fillStyle = '#0284c7';
        if (dir === 'down') {
          ctx.fillRect(cx - 6, cy - 7, 12, 7);
          // Olhos brancos / pretos
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(cx - 4, cy - 6, 2, 5);
          ctx.fillRect(cx + 2, cy - 6, 2, 5);
        } else if (dir === 'left') {
          ctx.fillRect(cx - 8, cy - 7, 9, 7);
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(cx - 7, cy - 6, 2, 5);
        } else if (dir === 'right') {
          ctx.fillRect(cx - 1, cy - 7, 9, 7);
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(cx + 5, cy - 6, 2, 5);
        }
      }

      // Escudo ativo (aura brilhante)
      if (this.player.hasHeart) {
        const auraPulse = Math.sin(Date.now() * 0.01) * 0.2 + 0.8;
        ctx.strokeStyle = `rgba(244, 63, 94, ${auraPulse})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy + 1, 16, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }

    drawStartScreen(ctx) {
      ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
      ctx.fillRect(0, 0, this.width, this.height);

      const isPt = (typeof window !== 'undefined' && window.obterIdioma && window.obterIdioma() === 'pt');
      ctx.textAlign = 'center';

      // Logo retro
      ctx.font = '900 32px ui-monospace, Consolas, monospace';
      ctx.fillStyle = '#facc15';
      ctx.fillText('SUPER BOMBERMAN', this.width / 2, this.height / 2 - 50);

      ctx.font = '700 13px ui-monospace, Consolas, monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(isPt ? 'SUPER NINTENDO RETRÔ 1993' : 'SUPER NINTENDO RETRO 1993', this.width / 2, this.height / 2 - 20);

      ctx.font = '800 15px ui-monospace, Consolas, monospace';
      const blink = Math.floor(Date.now() / 450) % 2 === 0;
      ctx.fillStyle = blink ? '#ffffff' : '#94a3b8';
      const startMsg = this.options.isMobile
        ? (isPt ? 'TOQUE NA TELA OU NA BOMBA PARA JOGAR' : 'TAP SCREEN OR BOMB BUTTON TO PLAY')
        : (isPt ? 'PRESSIONE ESPAÇO OU ENTER PARA INICIAR' : 'PRESS SPACE OR ENTER TO START');
      ctx.fillText(startMsg, this.width / 2, this.height / 2 + 35);

      ctx.font = '11px ui-monospace, Consolas, monospace';
      ctx.fillStyle = '#64748b';
      const subMsg = isPt
        ? 'Derrote todos os inimigos para abrir o portal da próxima fase!'
        : 'Defeat all enemies to unlock the portal to the next stage!';
      ctx.fillText(subMsg, this.width / 2, this.height / 2 + 75);
    }

    drawPausedOverlay(ctx) {
      const isPt = (typeof window !== 'undefined' && window.obterIdioma && window.obterIdioma() === 'pt');
      ctx.fillStyle = 'rgba(2, 6, 23, 0.7)';
      ctx.fillRect(0, 0, this.width, this.height);

      ctx.textAlign = 'center';
      ctx.font = '900 28px ui-monospace, Consolas, monospace';
      ctx.fillStyle = '#facc15';
      ctx.fillText(isPt ? 'JOGO PAUSADO' : 'GAME PAUSED', this.width / 2, this.height / 2);

      ctx.font = '13px ui-monospace, Consolas, monospace';
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(isPt ? 'Pressione P para continuar' : 'Press P to resume', this.width / 2, this.height / 2 + 30);
    }

    drawGameOverScreen(ctx) {
      const isPt = (typeof window !== 'undefined' && window.obterIdioma && window.obterIdioma() === 'pt');
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.fillRect(0, 0, this.width, this.height);

      ctx.textAlign = 'center';
      ctx.font = '900 34px ui-monospace, Consolas, monospace';
      ctx.fillStyle = '#ef4444';
      ctx.fillText('GAME OVER', this.width / 2, this.height / 2 - 40);

      ctx.font = '800 18px ui-monospace, Consolas, monospace';
      ctx.fillStyle = '#facc15';
      ctx.fillText(isPt ? `PONTUAÇÃO FINAL: ${this.score}` : `FINAL SCORE: ${this.score}`, this.width / 2, this.height / 2 + 5);

      ctx.font = '13px ui-monospace, Consolas, monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(isPt ? `Fase alcançada: ${this.stage}` : `Stage reached: ${this.stage}`, this.width / 2, this.height / 2 + 35);

      ctx.font = '800 14px ui-monospace, Consolas, monospace';
      const blink = Math.floor(Date.now() / 450) % 2 === 0;
      ctx.fillStyle = blink ? '#ffffff' : '#64748b';
      const retryMsg = this.options.isMobile
        ? (isPt ? 'TOQUE NA TELA PARA JOGAR NOVAMENTE' : 'TAP SCREEN TO PLAY AGAIN')
        : (isPt ? 'PRESSIONE ESPAÇO PARA JOGAR NOVAMENTE' : 'PRESS SPACE TO PLAY AGAIN');
      ctx.fillText(retryMsg, this.width / 2, this.height / 2 + 80);
    }

    drawStageClearScreen(ctx) {
      const isPt = (typeof window !== 'undefined' && window.obterIdioma && window.obterIdioma() === 'pt');
      ctx.fillStyle = 'rgba(6, 78, 59, 0.85)';
      ctx.fillRect(0, 0, this.width, this.height);

      ctx.textAlign = 'center';
      ctx.font = '900 32px ui-monospace, Consolas, monospace';
      ctx.fillStyle = '#4ade80';
      ctx.fillText('STAGE CLEAR!', this.width / 2, this.height / 2 - 40);

      ctx.font = '800 16px ui-monospace, Consolas, monospace';
      ctx.fillStyle = '#facc15';
      ctx.fillText(isPt ? `FASE ${this.stage} CONCLUÍDA!` : `STAGE ${this.stage} COMPLETED!`, this.width / 2, this.height / 2);

      ctx.font = '13px ui-monospace, Consolas, monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(isPt ? `Bônus de Tempo: +${this.timeRemaining * 10} pts` : `Time Bonus: +${this.timeRemaining * 10} pts`, this.width / 2, this.height / 2 + 30);

      ctx.font = '800 14px ui-monospace, Consolas, monospace';
      const blink = Math.floor(Date.now() / 450) % 2 === 0;
      ctx.fillStyle = blink ? '#ffffff' : '#a7f3d0';
      const nextMsg = this.options.isMobile
        ? (isPt ? 'TOQUE NA TELA PARA A PRÓXIMA FASE ➔' : 'TAP SCREEN FOR NEXT STAGE ➔')
        : (isPt ? 'PRESSIONE ESPAÇO PARA A PRÓXIMA FASE ➔' : 'PRESS SPACE FOR NEXT STAGE ➔');
      ctx.fillText(nextMsg, this.width / 2, this.height / 2 + 75);
    }

    /* ==========================================================================
       LOOP PRINCIPAL (RAF)
       ========================================================================== */
    startLoop() {
      const stepLoop = (timestamp) => {
        if (!this.lastTime) this.lastTime = timestamp;
        const elapsed = timestamp - this.lastTime;
        this.lastTime = timestamp;

        // Limita lag spike
        this.accumTime += Math.min(elapsed, 100);

        // 60 ticks fixos por segundo (16.6ms)
        const frameTime = 1000 / 60;
        while (this.accumTime >= frameTime) {
          this.update();
          this.accumTime -= frameTime;
        }

        this.draw();
        this.animId = requestAnimationFrame(stepLoop);
      };

      this.animId = requestAnimationFrame(stepLoop);
    }

    /* ==========================================================================
       MÉTODOS PÚBLICOS PARA CONTROLE MOBILE & DESKTOP
       ========================================================================== */
    setDirection(dir, active) {
      this.audio.init();
      if (dir === 'up') this.keys.up = active;
      if (dir === 'down') this.keys.down = active;
      if (dir === 'left') this.keys.left = active;
      if (dir === 'right') this.keys.right = active;
    }

    triggerBomb() {
      this.audio.init();
      if (this.state === 'start' || this.state === 'gameover') {
        this.startNewGame();
      } else if (this.state === 'stageclear') {
        this.nextStage();
      } else {
        this.dropBomb();
      }
    }
  }

  return {
    COLS,
    ROWS,
    TILE_SIZE,
    TILE_EMPTY,
    TILE_WALL,
    TILE_BLOCK,
    POWERUP_BOMB,
    POWERUP_FIRE,
    POWERUP_SPEED,
    POWERUP_HEART,
    ENEMY_TYPES,
    BombermanAudio,
    BombermanGame
  };
});
