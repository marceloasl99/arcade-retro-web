/**
 * PAC-MAN RETRO ARCADE (Namco 1980 / Enhanced Multi-Stage Arcade Edition)
 * Pure vanilla JavaScript canvas implementation with procedural Web Audio synthesis.
 * 
 * Key Features:
 * - Authentic 28x30 arcade grid with zero dead space, perfectly fitting the arena frame.
 * - Wrap-around side tunnels at row 14.
 * - 4 distinct ghost AI personalities:
 *     * Blinky (Red - Shadow): Directly chases Pac-Man. Features Namco "Cruise Elroy" speed-ups.
 *     * Pinky (Pink - Speedy): Ambusher targeting 4 tiles ahead of Pac-Man.
 *     * Inky (Cyan - Bashful): Vector targeting based on Blinky & Pac-Man.
 *     * Clyde (Orange - Pokey): Chases when far (>8 tiles), retreats to scatter corner when close.
 * - Multi-Stage Level Progression System ("Revisar todas as fases"):
 *     * 10 distinct level stages with unique neon color themes (Neon Blue, Emerald, Cyber Violet, Ruby, Amber, Indigo, Cyan, Galaxian, Bell, Master Key).
 *     * Authentic fruit bonuses per level: Cherry (100), Strawberry (300), Peach/Orange (500), Apple (700), Melon (1000), Galaxian (2000), Bell (3000), Key (5000).
 *     * Progressive speed scaling & decreased frightened duration per stage.
 * - Procedural Chiptune sound synthesis via Web Audio API.
 * - Dual responsive architecture: Desktop (keyboard) and Mobile (ergonomic D-Pad / swipe).
 * - Full bilingual support (EN/PT) with dynamic HUD update.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Pacman = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // Authentic Arcade Grid: 28 cols x 30 rows (Canvas 560 x 600, 20px tiles)
  const COLS = 28;
  const ROWS = 30;
  const TILE = 20;

  const T_EMPTY = 0;
  const T_WALL  = 1;
  const T_DOT   = 2;
  const T_POWER = 3;
  const T_GATE  = 4;

  // Directions
  const DIR_NONE  = { x:  0, y:  0, name: 'none' };
  const DIR_UP    = { x:  0, y: -1, name: 'up' };
  const DIR_DOWN  = { x:  0, y:  1, name: 'down' };
  const DIR_LEFT  = { x: -1, y:  0, name: 'left' };
  const DIR_RIGHT = { x:  1, y:  0, name: 'right' };

  // Authentic 28x30 arcade maze layout (0: empty corridor, 1: wall, 2: dot, 3: power energizer, 4: ghost house door)
  // Perfectly enclosed with outer walls on rows 0 and 29. Zero empty/dead space.
  const MAZE_STR = [
    "1111111111111111111111111111", // 0: Top outer wall
    "1222222222222112222222222221", // 1: Upper dot corridor
    "1211112111112112111112111121", // 2
    "1311112111112112111112111131", // 3: Top energizers
    "1211112111112112111112111121", // 4
    "1222222222222222222222222221", // 5: Cross corridor
    "1211112112111111112112111121", // 6
    "1211112112111111112112111121", // 7
    "1222222112222112222112222221", // 8
    "1111112111110110111112111111", // 9: Outer wings
    "0000012111110110111112100000", // 10
    "0000012110000000000112100000", // 11: Corridor above ghost house
    "0000012110111441110112100000", // 12: Ghost house gate (door)
    "1111112110100000010112111111", // 13: Inside ghost house (upper)
    "0000002000100000010002000000", // 14: Side wrap-around tunnel row
    "1111112110100000010112111111", // 15: Inside ghost house (lower)
    "0000012110111111110112100000", // 16: Ghost house floor
    "0000012110000000000112100000", // 17: Fruit spawn corridor
    "0000012110111111110112100000", // 18: Lower central wall divider
    "1111112110111111110112111111", // 19
    "1222222222222112222222222221", // 20: Middle dot corridor
    "1211112111112112111112111121", // 21
    "1322112222222002222222112231", // 22: Pac-Man spawn (x=13.5) & lower energizers
    "1112112112111111112112112111", // 23
    "1112112112111111112112112111", // 24
    "1222222112222112222112222221", // 25
    "1211111111112112111111111121", // 26
    "1211111111112112111111111121", // 27
    "1222222222222222222222222221", // 28: Bottom dot corridor
    "1111111111111111111111111111"  // 29: Bottom outer wall
  ];

  /* ==========================================================================
     MULTI-STAGE LEVEL CONFIGURATIONS ("Revisar todas as fases")
     ========================================================================== */
  const LEVEL_CONFIGS = [
    {
      level: 1,
      name: 'STAGE 1',
      themeName: 'CLASSIC NEON BLUE',
      themePt: 'AZUL NEON CLÁSSICO',
      wallFill: '#1e3a8a',
      wallStroke: '#3b82f6',
      gateColor: '#f472b6',
      fruit: { symbol: '🍒', name: 'Cherry', namePt: 'Cereja', points: 100 },
      frightenedTime: 7.0,
      pacmanSpeed: 5.2,
      ghostSpeed: 4.6,
      frightenedSpeed: 2.8,
      elroy1Speed: 5.0, // Blinky when dots < 20
      elroy2Speed: 5.4  // Blinky when dots < 10
    },
    {
      level: 2,
      name: 'STAGE 2',
      themeName: 'EMERALD GREEN',
      themePt: 'VERDE ESMERALDA',
      wallFill: '#064e3b',
      wallStroke: '#10b981',
      gateColor: '#f472b6',
      fruit: { symbol: '🍓', name: 'Strawberry', namePt: 'Morango', points: 300 },
      frightenedTime: 6.0,
      pacmanSpeed: 5.4,
      ghostSpeed: 4.8,
      frightenedSpeed: 2.9,
      elroy1Speed: 5.2,
      elroy2Speed: 5.6
    },
    {
      level: 3,
      name: 'STAGE 3',
      themeName: 'CYBER VIOLET',
      themePt: 'VIOLETA CYBER',
      wallFill: '#581c87',
      wallStroke: '#a855f7',
      gateColor: '#f472b6',
      fruit: { symbol: '🍊', name: 'Orange', namePt: 'Laranja', points: 500 },
      frightenedTime: 5.0,
      pacmanSpeed: 5.6,
      ghostSpeed: 5.0,
      frightenedSpeed: 3.0,
      elroy1Speed: 5.4,
      elroy2Speed: 5.8
    },
    {
      level: 4,
      name: 'STAGE 4',
      themeName: 'CRIMSON RUBY',
      themePt: 'RUBI CARMESIM',
      wallFill: '#881337',
      wallStroke: '#f43f5e',
      gateColor: '#f472b6',
      fruit: { symbol: '🍊', name: 'Orange', namePt: 'Laranja', points: 500 },
      frightenedTime: 4.5,
      pacmanSpeed: 5.6,
      ghostSpeed: 5.1,
      frightenedSpeed: 3.0,
      elroy1Speed: 5.5,
      elroy2Speed: 6.0
    },
    {
      level: 5,
      name: 'STAGE 5',
      themeName: 'GOLDEN AMBER',
      themePt: 'ÂMBAR DOURADO',
      wallFill: '#78350f',
      wallStroke: '#f59e0b',
      gateColor: '#f472b6',
      fruit: { symbol: '🍎', name: 'Apple', namePt: 'Maçã', points: 700 },
      frightenedTime: 4.0,
      pacmanSpeed: 5.8,
      ghostSpeed: 5.2,
      frightenedSpeed: 3.1,
      elroy1Speed: 5.7,
      elroy2Speed: 6.2
    },
    {
      level: 6,
      name: 'STAGE 6',
      themeName: 'DEEP INDIGO',
      themePt: 'ÍNDIGO PROFUNDO',
      wallFill: '#312e81',
      wallStroke: '#6366f1',
      gateColor: '#f472b6',
      fruit: { symbol: '🍎', name: 'Apple', namePt: 'Maçã', points: 700 },
      frightenedTime: 3.5,
      pacmanSpeed: 5.8,
      ghostSpeed: 5.3,
      frightenedSpeed: 3.1,
      elroy1Speed: 5.8,
      elroy2Speed: 6.3
    },
    {
      level: 7,
      name: 'STAGE 7',
      themeName: 'ELECTRIC CYAN',
      themePt: 'CIANO ELÉTRICO',
      wallFill: '#164e63',
      wallStroke: '#06b6d4',
      gateColor: '#f472b6',
      fruit: { symbol: '🍈', name: 'Melon', namePt: 'Melão', points: 1000 },
      frightenedTime: 3.0,
      pacmanSpeed: 6.0,
      ghostSpeed: 5.5,
      frightenedSpeed: 3.2,
      elroy1Speed: 6.0,
      elroy2Speed: 6.5
    },
    {
      level: 8,
      name: 'STAGE 8',
      themeName: 'GALAXIAN VOID',
      themePt: 'VÁCUO GALAXIAN',
      wallFill: '#18181b',
      wallStroke: '#38bdf8',
      gateColor: '#f472b6',
      fruit: { symbol: '🚀', name: 'Galaxian', namePt: 'Nave Galaxian', points: 2000 },
      frightenedTime: 2.5,
      pacmanSpeed: 6.0,
      ghostSpeed: 5.6,
      frightenedSpeed: 3.2,
      elroy1Speed: 6.1,
      elroy2Speed: 6.6
    },
    {
      level: 9,
      name: 'STAGE 9',
      themeName: 'BELL COPPER',
      themePt: 'SINO DE COBRE',
      wallFill: '#701a75',
      wallStroke: '#d946ef',
      gateColor: '#f472b6',
      fruit: { symbol: '🔔', name: 'Bell', namePt: 'Sino', points: 3000 },
      frightenedTime: 2.0,
      pacmanSpeed: 6.0,
      ghostSpeed: 5.7,
      frightenedSpeed: 3.2,
      elroy1Speed: 6.2,
      elroy2Speed: 6.7
    },
    {
      level: 10,
      name: 'STAGE 10+',
      themeName: 'MASTER KEY',
      themePt: 'CHAVE MESTRA',
      wallFill: '#1c1917',
      wallStroke: '#fbbf24',
      gateColor: '#f472b6',
      fruit: { symbol: '🗝️', name: 'Key', namePt: 'Chave Mestra', points: 5000 },
      frightenedTime: 1.5,
      pacmanSpeed: 6.2,
      ghostSpeed: 5.9,
      frightenedSpeed: 3.3,
      elroy1Speed: 6.4,
      elroy2Speed: 7.0
    }
  ];

  function getLevelConfig(lvl) {
    const idx = Math.min(lvl, LEVEL_CONFIGS.length) - 1;
    return LEVEL_CONFIGS[idx];
  }

  /* ==========================================================================
     PROCEDURAL CHIPTUNE SOUND SYNTHESIZER
     ========================================================================== */
  class SoundSynth {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.wakaAlt = false;
      this.sirenOsc = null;
      this.sirenGain = null;
    }

    init() {
      if (!this.ctx && typeof AudioContext !== 'undefined') {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    waka() {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;
      try {
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'triangle';
        const fStart = this.wakaAlt ? 340 : 490;
        const fEnd = this.wakaAlt ? 490 : 340;
        this.wakaAlt = !this.wakaAlt;

        osc.frequency.setValueAtTime(fStart, t);
        osc.frequency.exponentialRampToValueAtTime(fEnd, t + 0.08);

        g.gain.setValueAtTime(0.08, t);
        g.gain.linearRampToValueAtTime(0.01, t + 0.08);

        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.09);
      } catch (e) {}
    }

    powerDot() {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;
      try {
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.linearRampToValueAtTime(800, t + 0.2);

        g.gain.setValueAtTime(0.15, t);
        g.gain.linearRampToValueAtTime(0.01, t + 0.22);

        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.23);
      } catch (e) {}
    }

    eatGhost() {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;
      try {
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(400, t);
        osc.frequency.linearRampToValueAtTime(1200, t + 0.35);

        g.gain.setValueAtTime(0.2, t);
        g.gain.linearRampToValueAtTime(0.01, t + 0.38);

        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.39);
      } catch (e) {}
    }

    eatFruit() {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;
      try {
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, t);
        osc.frequency.setValueAtTime(650, t + 0.1);
        osc.frequency.setValueAtTime(780, t + 0.2);
        osc.frequency.setValueAtTime(1040, t + 0.3);

        g.gain.setValueAtTime(0.18, t);
        g.gain.linearRampToValueAtTime(0.01, t + 0.42);

        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.43);
      } catch (e) {}
    }

    death() {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;
      try {
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, t);
        osc.frequency.exponentialRampToValueAtTime(80, t + 0.7);

        g.gain.setValueAtTime(0.22, t);
        g.gain.linearRampToValueAtTime(0.01, t + 0.75);

        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.76);
      } catch (e) {}
    }
  }

  /* ==========================================================================
     PAC-MAN GAME ENGINE
     ========================================================================== */
  class PacmanGame {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.ctx = canvas ? canvas.getContext('2d') : null;
      this.options = options;

      // Canvas dimensions match 28x30 grid: 560 x 600
      this.width = 560;
      this.height = 600;
      this.scale = 20;

      if (this.canvas) {
        this.canvas.width = this.width;
        this.canvas.height = this.height;
      }

      this.sound = new SoundSynth();

      // Game state
      this.state = 'start'; // 'start', 'playing', 'paused', 'ghostpause', 'dying', 'gameover', 'victory'
      this.score = 0;
      this.highScore = 10000;
      this.lives = 3;
      this.level = 1;
      this.currentConfig = getLevelConfig(1);
      this.dotsRemaining = 0;
      this.totalDots = 0;

      // Timers & Combos
      this.globalTimer = 0;
      this.frightenedTimer = 0;
      this.frightenedDuration = 7;
      this.ghostsEatenCombo = 0;
      this.ghostPauseTimer = 0;
      this.dyingTimer = 0;

      // Bonus fruit
      this.fruit = null; // { x, y, symbol, name, points, timer }
      this.fruitScoreDisplay = null; // { x, y, score, timer }
      this.fruit1Spawned = false;
      this.fruit2Spawned = false;

      // Pac-Man entity
      this.pacman = {
        x: 13.5,
        y: 22, // Open corridor in row 22
        dir: DIR_LEFT,
        nextDir: DIR_LEFT,
        speed: 5.2, // tiles per second
        mouthAngle: 0.2,
        mouthDir: 1,
        isMoving: false
      };

      // 4 Ghosts entities
      this.ghosts = [];

      // Grid matrix
      this.grid = [];
      this.initGrid();

      this.lastTimestamp = 0;
      this.bindInputs();
    }

    getLevelConfig(lvl) {
      return getLevelConfig(lvl);
    }

    initGrid() {
      this.grid = [];
      this.dotsRemaining = 0;
      for (let r = 0; r < ROWS; r++) {
        const row = [];
        const strRow = MAZE_STR[r] || "";
        for (let c = 0; c < COLS; c++) {
          const char = strRow[c] || "1";
          let val = T_WALL;
          if (char === "0") val = T_EMPTY;
          else if (char === "1") val = T_WALL;
          else if (char === "2") { val = T_DOT; this.dotsRemaining++; }
          else if (char === "3") { val = T_POWER; this.dotsRemaining++; }
          else if (char === "4") val = T_GATE;
          row.push(val);
        }
        this.grid.push(row);
      }
      this.totalDots = this.dotsRemaining;
    }

    startNewGame() {
      this.score = 0;
      this.lives = 3;
      this.level = 1;
      this.initLevel(1);
    }

    initLevel(level) {
      this.level = level;
      this.currentConfig = getLevelConfig(level);
      this.frightenedDuration = this.currentConfig.frightenedTime;
      this.fruit1Spawned = false;
      this.fruit2Spawned = false;
      this.fruit = null;
      this.fruitScoreDisplay = null;

      this.initGrid();
      this.resetRound();
      this.state = 'playing';
      this.notifyHud();
    }

    resetRound() {
      this.globalTimer = 0;
      this.frightenedTimer = 0;
      this.ghostsEatenCombo = 0;
      this.fruit = null;

      const cfg = this.currentConfig;

      // Reset Pac-Man
      this.pacman.x = 13.5;
      this.pacman.y = 22;
      this.pacman.dir = DIR_LEFT;
      this.pacman.nextDir = DIR_LEFT;
      this.pacman.speed = cfg.pacmanSpeed;
      this.pacman.mouthAngle = 0.2;
      this.pacman.isMoving = false;

      // Reset Ghosts: Blinky (outside house), Pinky (center), Inky (left), Clyde (right)
      const baseGhostSpeed = cfg.ghostSpeed;
      this.ghosts = [
        {
          id: 'blinky',
          name: 'Blinky',
          color: '#ef4444',
          x: 13.5,
          y: 11, // Open corridor above door
          dir: DIR_LEFT,
          mode: 'chase',
          speed: baseGhostSpeed,
          baseSpeed: baseGhostSpeed,
          homeX: 25,
          homeY: 0,
          house: false,
          lastTileC: -1,
          lastTileR: -1
        },
        {
          id: 'pinky',
          name: 'Pinky',
          color: '#f472b6',
          x: 13.5,
          y: 14,
          dir: DIR_UP,
          mode: 'scatter',
          speed: baseGhostSpeed * 0.96,
          baseSpeed: baseGhostSpeed * 0.96,
          homeX: 2,
          homeY: 0,
          house: true,
          exitTimer: 1.2,
          lastTileC: -1,
          lastTileR: -1
        },
        {
          id: 'inky',
          name: 'Inky',
          color: '#38bdf8',
          x: 11.5,
          y: 14,
          dir: DIR_UP,
          mode: 'scatter',
          speed: baseGhostSpeed * 0.92,
          baseSpeed: baseGhostSpeed * 0.92,
          homeX: 27,
          homeY: 29,
          house: true,
          exitTimer: 3.5,
          lastTileC: -1,
          lastTileR: -1
        },
        {
          id: 'clyde',
          name: 'Clyde',
          color: '#fb923c',
          x: 15.5,
          y: 14,
          dir: DIR_UP,
          mode: 'scatter',
          speed: baseGhostSpeed * 0.88,
          baseSpeed: baseGhostSpeed * 0.88,
          homeX: 0,
          homeY: 29,
          house: true,
          exitTimer: 6.0,
          lastTileC: -1,
          lastTileR: -1
        }
      ];
    }

    togglePause() {
      if (this.state === 'playing') this.state = 'paused';
      else if (this.state === 'paused') this.state = 'playing';
      this.notifyHud();
    }

    toggleSound() {
      this.sound.muted = !this.sound.muted;
      this.notifyHud();
    }

    setNextDirection(dir) {
      this.pacman.nextDir = dir;
      if (this.state === 'start' || this.state === 'gameover') {
        this.startNewGame();
      }
    }

    notifyHud() {
      if (this.options.onHudUpdate) {
        const cfg = this.currentConfig || getLevelConfig(this.level);
        const isPt = (typeof window !== 'undefined' && window.obterIdioma && window.obterIdioma() === 'pt');
        this.options.onHudUpdate({
          score: this.score,
          highScore: this.highScore,
          lives: this.lives,
          level: this.level,
          stageName: cfg.name,
          stageTheme: isPt ? cfg.themePt : cfg.themeName,
          fruitSymbol: cfg.fruit.symbol,
          fruitName: isPt ? cfg.fruit.namePt : cfg.fruit.name,
          fruitPoints: cfg.fruit.points,
          dotsRemaining: this.dotsRemaining,
          totalDots: this.totalDots,
          state: this.state,
          sound: !this.sound.muted
        });
      }
    }

    /* ==========================================================================
       UPDATE & PHYSICS
       ========================================================================== */
    update(dt) {
      if (this.state !== 'playing' && this.state !== 'ghostpause' && this.state !== 'dying') return;

      if (this.state === 'ghostpause') {
        this.ghostPauseTimer -= dt;
        if (this.ghostPauseTimer <= 0) {
          this.state = 'playing';
        }
        return;
      }

      if (this.state === 'dying') {
        this.dyingTimer += dt;
        if (this.dyingTimer >= 1.4) {
          this.lives--;
          if (this.lives <= 0) {
            this.state = 'gameover';
          } else {
            this.resetRound();
            this.state = 'playing';
          }
          this.notifyHud();
        }
        return;
      }

      this.globalTimer += dt;

      // Frightened timer countdown
      if (this.frightenedTimer > 0) {
        this.frightenedTimer -= dt;
        if (this.frightenedTimer <= 0) {
          this.ghosts.forEach(g => {
            if (g.mode === 'frightened') g.mode = 'chase';
          });
        }
      }

      // Bonus fruit spawn at 70 and 170 dots eaten
      const dotsEaten = this.totalDots - this.dotsRemaining;
      const cfg = this.currentConfig;
      if (!this.fruit1Spawned && dotsEaten >= 70) {
        this.fruit1Spawned = true;
        this.fruit = { x: 13.5, y: 17, symbol: cfg.fruit.symbol, name: cfg.fruit.name, points: cfg.fruit.points, timer: 10 };
      }
      if (!this.fruit2Spawned && dotsEaten >= 170) {
        this.fruit2Spawned = true;
        this.fruit = { x: 13.5, y: 17, symbol: cfg.fruit.symbol, name: cfg.fruit.name, points: cfg.fruit.points, timer: 10 };
      }

      if (this.fruit) {
        this.fruit.timer -= dt;
        if (this.fruit.timer <= 0) this.fruit = null;
      }
      if (this.fruitScoreDisplay) {
        this.fruitScoreDisplay.timer -= dt;
        if (this.fruitScoreDisplay.timer <= 0) this.fruitScoreDisplay = null;
      }

      // 1. Move Pac-Man
      this.updatePacman(dt);

      // 2. Move Ghosts
      this.updateGhosts(dt);

      // 3. Check Collisions
      this.checkCollisions();
    }

    isWall(c, r, canCrossGate = false) {
      if (r < 0 || r >= ROWS) return true;
      // Allow wrap-around tunnel at row 14
      if (r === 14 && (c < 0 || c >= COLS)) return false;
      if (c < 0 || c >= COLS) return false;
      const tile = this.grid[r][c];
      if (tile === T_WALL) return true;
      if (tile === T_GATE && !canCrossGate) return true;
      return false;
    }

    updatePacman(dt) {
      const p = this.pacman;

      // 1. Instant 180-degree turn
      if (p.nextDir.x === -p.dir.x && p.nextDir.y === -p.dir.y && p.dir !== DIR_NONE) {
        p.dir = p.nextDir;
      }

      // 2. Cornering / 90-degree turn when approaching tile center
      const curC = Math.round(p.x);
      const curR = Math.round(p.y);
      const distFromCenter = Math.hypot(p.x - curC, p.y - curR);

      if (p.nextDir !== p.dir && distFromCenter < 0.35) {
        const nextC = curC + p.nextDir.x;
        const nextR = curR + p.nextDir.y;
        if (!this.isWall(nextC, nextR, false)) {
          p.x = curC;
          p.y = curR;
          p.dir = p.nextDir;
        }
      }

      // 3. Movement
      let moved = false;
      if (p.dir !== DIR_NONE) {
        const nextX = p.x + p.dir.x * p.speed * dt;
        const nextY = p.y + p.dir.y * p.speed * dt;

        // Side tunnel wrap-around (row 14)
        if (curR === 14) {
          if (nextX < -0.5) {
            p.x = COLS - 0.5;
            moved = true;
          } else if (nextX > COLS - 0.5) {
            p.x = -0.5;
            moved = true;
          }
        }

        if (!moved) {
          // Check collision ahead
          let blocked = false;
          if (p.dir.x !== 0) {
            const checkC = p.dir.x > 0 ? Math.floor(nextX + 0.5) : Math.ceil(nextX - 0.5);
            if (this.isWall(checkC, curR, false) && (curR !== 14 || (checkC >= 0 && checkC < COLS))) {
              blocked = true;
              p.x = curC;
            }
          }
          if (p.dir.y !== 0) {
            const checkR = p.dir.y > 0 ? Math.floor(nextY + 0.5) : Math.ceil(nextY - 0.5);
            if (this.isWall(curC, checkR, false)) {
              blocked = true;
              p.y = curR;
            }
          }

          if (!blocked) {
            p.x = nextX;
            p.y = nextY;
            moved = true;
          }
        }
      }

      p.isMoving = moved;

      // Animate mouth only while moving
      if (p.isMoving) {
        p.mouthAngle += p.mouthDir * dt * 7.5;
        if (p.mouthAngle >= 0.45) { p.mouthAngle = 0.45; p.mouthDir = -1; }
        else if (p.mouthAngle <= 0.05) { p.mouthAngle = 0.05; p.mouthDir = 1; }
      } else {
        p.mouthAngle = 0.2;
      }

      // Eat dots
      const tileC = Math.round(p.x);
      const tileR = Math.round(p.y);
      if (tileC >= 0 && tileC < COLS && tileR >= 0 && tileR < ROWS) {
        const item = this.grid[tileR][tileC];
        if (item === T_DOT) {
          this.grid[tileR][tileC] = T_EMPTY;
          this.score += 10;
          this.dotsRemaining--;
          this.sound.waka();
          if (this.score > this.highScore) this.highScore = this.score;
          this.notifyHud();
          this.checkVictory();
        } else if (item === T_POWER) {
          this.grid[tileR][tileC] = T_EMPTY;
          this.score += 50;
          this.dotsRemaining--;
          this.sound.powerDot();
          this.triggerFrightenedMode();
          if (this.score > this.highScore) this.highScore = this.score;
          this.notifyHud();
          this.checkVictory();
        }
      }

      // Eat fruit
      if (this.fruit && Math.hypot(p.x - this.fruit.x, p.y - this.fruit.y) < 0.8) {
        this.score += this.fruit.points;
        this.sound.eatFruit();
        this.fruitScoreDisplay = { x: this.fruit.x, y: this.fruit.y, score: this.fruit.points, timer: 1.5 };
        this.fruit = null;
        if (this.score > this.highScore) this.highScore = this.score;
        this.notifyHud();
      }
    }

    triggerFrightenedMode() {
      this.frightenedTimer = this.frightenedDuration;
      this.ghostsEatenCombo = 0;
      this.ghosts.forEach(g => {
        if (g.mode !== 'eaten') {
          g.mode = 'frightened';
          g.dir = { x: -g.dir.x, y: -g.dir.y };
        }
      });
    }

    checkVictory() {
      if (this.dotsRemaining <= 0) {
        this.state = 'victory';
        this.sound.eatFruit();
        setTimeout(() => {
          this.initLevel(this.level + 1);
        }, 1800);
      }
    }

    /* ==========================================================================
       GHOST AI & PATHFINDING
       ========================================================================== */
    updateGhosts(dt) {
      const cfg = this.currentConfig;

      this.ghosts.forEach(g => {
        // Handle exiting ghost house
        if (g.house) {
          if (g.exitTimer > 0) {
            g.exitTimer -= dt;
            const bobOffset = (g.id === 'clyde' ? 1.5 : g.id === 'inky' ? 3.0 : 0);
            g.y = 14 + Math.sin(this.globalTimer * 4 + bobOffset) * 0.35;
          } else {
            // First align horizontally with center door column (x = 13.5)
            if (Math.abs(g.x - 13.5) > 0.1) {
              g.x += (g.x < 13.5 ? 1 : -1) * 3.2 * dt;
            } else {
              g.x = 13.5;
              // Move UP out of the house into row 11 corridor
              if (g.y > 11) {
                g.y -= 3.2 * dt;
              } else {
                g.y = 11;
                g.house = false;
                g.dir = DIR_LEFT;
                g.lastTileC = -1;
                g.lastTileR = -1;
              }
            }
          }
          return;
        }

        // Determine ghost target tile based on AI personality and current mode
        const target = this.getGhostTarget(g);

        // Move speed depends on state & Cruise Elroy
        let speed = g.baseSpeed;
        if (g.mode === 'frightened') {
          speed = cfg.frightenedSpeed;
        } else if (g.mode === 'eaten') {
          speed = 8.5;
        } else if (g.id === 'blinky' && (g.mode === 'chase' || g.mode === 'scatter')) {
          // Namco Cruise Elroy speed boost
          if (this.dotsRemaining <= 10) speed = cfg.elroy2Speed;
          else if (this.dotsRemaining <= 20) speed = cfg.elroy1Speed;
        }
        g.speed = speed;

        // Wrap around side tunnel (row 14)
        if (Math.round(g.y) === 14) {
          if (g.x < -0.5) g.x = COLS - 0.5;
          else if (g.x > COLS - 0.5) g.x = -0.5;
        }

        // Check if ghost reached ghost house door while eaten
        if (g.mode === 'eaten' && Math.hypot(g.x - 13.5, g.y - 11) < 0.6) {
          g.x = 13.5;
          g.y = 14;
          g.mode = 'chase';
          g.house = true;
          g.exitTimer = 0.8;
          g.dir = DIR_UP;
          g.lastTileC = -1;
          g.lastTileR = -1;
          return;
        }

        // Choose next turn upon crossing into a new tile center
        const tileC = Math.floor(g.x + 0.5);
        const tileR = Math.floor(g.y + 0.5);

        if (tileC !== g.lastTileC || tileR !== g.lastTileR) {
          g.lastTileC = tileC;
          g.lastTileR = tileR;
          // Align perpendicular axis
          if (g.dir.x !== 0) g.y = tileR;
          if (g.dir.y !== 0) g.x = tileC;
          g.dir = this.chooseBestDirection(g, target);
        }

        g.x += g.dir.x * speed * dt;
        g.y += g.dir.y * speed * dt;
      });
    }

    getGhostTarget(g) {
      if (g.mode === 'eaten') {
        return { x: 13.5, y: 11 }; // Outside door of ghost house
      }

      if (g.mode === 'frightened') {
        return { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
      }

      // Mode cycle (7s scatter, 20s chase)
      const cycle = this.globalTimer % 27;
      const isScatter = cycle < 7;

      if (isScatter || g.mode === 'scatter') {
        return { x: g.homeX, y: g.homeY };
      }

      // Chase modes according to Namco AI rules:
      const p = this.pacman;

      switch (g.id) {
        case 'blinky':
          // Red: Directly targets Pac-Man's tile
          return { x: p.x, y: p.y };

        case 'pinky':
          // Pink: Targets 4 tiles ahead of Pac-Man
          return { x: p.x + p.dir.x * 4, y: p.y + p.dir.y * 4 };

        case 'inky': {
          // Cyan: Double vector from Blinky to 2 tiles ahead of Pac-Man
          const blinky = this.ghosts.find(gh => gh.id === 'blinky') || { x: 13.5, y: 11 };
          const pivotX = p.x + p.dir.x * 2;
          const pivotY = p.y + p.dir.y * 2;
          return {
            x: pivotX + (pivotX - blinky.x),
            y: pivotY + (pivotY - blinky.y)
          };
        }

        case 'clyde': {
          // Orange: If far (>8 tiles), targets Pac-Man. If close (<=8 tiles), retreats to home corner
          const dist = Math.hypot(g.x - p.x, g.y - p.y);
          if (dist > 8) return { x: p.x, y: p.y };
          return { x: g.homeX, y: g.homeY };
        }

        default:
          return { x: p.x, y: p.y };
      }
    }

    chooseBestDirection(g, target) {
      const candidates = [DIR_UP, DIR_LEFT, DIR_DOWN, DIR_RIGHT];
      const valid = [];

      for (let i = 0; i < candidates.length; i++) {
        const d = candidates[i];
        // Cannot turn 180 degrees directly back
        if (d.x === -g.dir.x && d.y === -g.dir.y && g.dir !== DIR_NONE) continue;

        const nextC = Math.round(g.x) + d.x;
        const nextR = Math.round(g.y) + d.y;

        const canCrossGate = (g.mode === 'eaten');
        if (!this.isWall(nextC, nextR, canCrossGate)) {
          const dist = Math.hypot(nextC - target.x, nextR - target.y);
          valid.push({ dir: d, dist: dist });
        }
      }

      if (valid.length === 0) {
        const revC = Math.round(g.x) - g.dir.x;
        const revR = Math.round(g.y) - g.dir.y;
        if (!this.isWall(revC, revR, g.mode === 'eaten')) {
          return { x: -g.dir.x, y: -g.dir.y, name: 'rev' };
        }
        return g.dir;
      }

      valid.sort((a, b) => a.dist - b.dist);
      return valid[0].dir;
    }

    /* ==========================================================================
       COLLISION LOGIC
       ========================================================================== */
    checkCollisions() {
      const p = this.pacman;

      for (let i = 0; i < this.ghosts.length; i++) {
        const g = this.ghosts[i];
        const dist = Math.hypot(p.x - g.x, p.y - g.y);

        if (dist < 0.75) {
          if (g.mode === 'frightened') {
            // Pac-Man eats ghost
            g.mode = 'eaten';
            this.ghostsEatenCombo++;
            const points = Math.pow(2, this.ghostsEatenCombo) * 100; // 200, 400, 800, 1600
            this.score += points;
            this.sound.eatGhost();
            this.state = 'ghostpause';
            this.ghostPauseTimer = 0.5;
            if (this.score > this.highScore) this.highScore = this.score;
            this.notifyHud();
            return;
          } else if (g.mode === 'chase' || g.mode === 'scatter') {
            // Ghost kills Pac-Man
            this.state = 'dying';
            this.dyingTimer = 0;
            this.sound.death();
            return;
          }
        }
      }
    }

    /* ==========================================================================
       CANVAS RENDERING (WITH DYNAMIC LEVEL THEMES)
       ========================================================================== */
    render() {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const s = this.scale;
      const cfg = this.currentConfig || getLevelConfig(this.level);

      // Dark retro arcade canvas background
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, this.width, this.height);

      // 1. Draw Maze Walls, Gates & Dots with Level Color Theme
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const tile = this.grid[r][c];
          const px = c * s;
          const py = r * s;

          if (tile === T_WALL) {
            ctx.fillStyle = cfg.wallFill;
            ctx.fillRect(px, py, s, s);

            ctx.strokeStyle = cfg.wallStroke;
            ctx.lineWidth = 2;
            ctx.strokeRect(px + 1, py + 1, s - 2, s - 2);
          } else if (tile === T_GATE) {
            ctx.fillStyle = cfg.gateColor;
            ctx.fillRect(px, py + s * 0.35, s, s * 0.3);
          } else if (tile === T_DOT) {
            ctx.fillStyle = '#fef08a';
            ctx.beginPath();
            ctx.arc(px + s / 2, py + s / 2, 2.5, 0, Math.PI * 2);
            ctx.fill();
          } else if (tile === T_POWER) {
            // Energizer pulsating glow
            const pulse = (Math.sin(this.globalTimer * 8) + 1) * 0.5;
            ctx.fillStyle = '#facc15';
            ctx.shadowColor = '#facc15';
            ctx.shadowBlur = 8 * pulse;
            ctx.beginPath();
            ctx.arc(px + s / 2, py + s / 2, 5 + pulse * 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }
      }

      // 2. Draw Fruit
      if (this.fruit) {
        const fx = this.fruit.x * s;
        const fy = this.fruit.y * s;
        ctx.font = '20px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.fruit.symbol, fx + s / 2, fy + s / 2);
      }

      // Fruit score popup
      if (this.fruitScoreDisplay) {
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('+' + this.fruitScoreDisplay.score, this.fruitScoreDisplay.x * s + s / 2, this.fruitScoreDisplay.y * s + s / 2);
      }

      // 3. Draw Pac-Man
      this.drawPacman(ctx, s);

      // 4. Draw Ghosts
      this.drawGhosts(ctx, s);

      // 5. Draw Overlays (Start, Paused, Game Over, Victory)
      this.drawOverlays(ctx, cfg);
    }

    drawPacman(ctx, s) {
      const p = this.pacman;
      const cx = p.x * s + s / 2;
      const cy = p.y * s + s / 2;
      const r = s * 0.65;

      ctx.save();
      ctx.translate(cx, cy);

      if (this.state === 'dying') {
        const prog = Math.min(1, this.dyingTimer / 1.2);
        const curR = Math.max(0, r * (1 - prog));
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        const startAng = prog * Math.PI;
        const endAng = Math.PI * 2 - prog * Math.PI;
        ctx.arc(0, 0, curR, startAng, endAng);
        ctx.lineTo(0, 0);
        ctx.fill();
        ctx.restore();
        return;
      }

      let baseAngle = 0;
      if (p.dir === DIR_RIGHT) baseAngle = 0;
      else if (p.dir === DIR_DOWN) baseAngle = Math.PI * 0.5;
      else if (p.dir === DIR_LEFT) baseAngle = Math.PI;
      else if (p.dir === DIR_UP) baseAngle = Math.PI * 1.5;

      ctx.rotate(baseAngle);

      ctx.fillStyle = '#facc15';
      ctx.shadowColor = '#eab308';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, 0, r, p.mouthAngle, Math.PI * 2 - p.mouthAngle);
      ctx.lineTo(0, 0);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.restore();
    }

    drawGhosts(ctx, s) {
      this.ghosts.forEach(g => {
        const cx = g.x * s + s / 2;
        const cy = g.y * s + s / 2;
        const r = s * 0.65;

        ctx.save();
        ctx.translate(cx, cy);

        if (g.mode === 'eaten') {
          this.drawGhostEyes(ctx, g, r);
          ctx.restore();
          return;
        }

        let bodyColor = g.color;
        if (g.mode === 'frightened') {
          if (this.frightenedTimer < 2.0 && Math.floor(this.globalTimer * 6) % 2 === 0) {
            bodyColor = '#ffffff';
          } else {
            bodyColor = '#2563eb';
          }
        }

        // Ghost body with arched top and wavy tentacles
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.arc(0, -2, r, Math.PI, 0, false);
        ctx.lineTo(r, r);

        const tentW = (r * 2) / 3;
        const wave = Math.sin(this.globalTimer * 10) * 2;
        ctx.lineTo(r - tentW * 0.5, r - 3 + wave);
        ctx.lineTo(r - tentW, r);
        ctx.lineTo(r - tentW * 1.5, r - 3 - wave);
        ctx.lineTo(r - tentW * 2, r);
        ctx.lineTo(r - tentW * 2.5, r - 3 + wave);
        ctx.lineTo(-r, r);
        ctx.closePath();
        ctx.fill();

        // Eyes
        if (g.mode === 'frightened') {
          ctx.fillStyle = '#f87171';
          ctx.fillRect(-4, -4, 3, 3);
          ctx.fillRect(2, -4, 3, 3);
          ctx.strokeStyle = '#f87171';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(-6, 3, 12, 2);
        } else {
          this.drawGhostEyes(ctx, g, r);
        }

        ctx.restore();
      });
    }

    drawGhostEyes(ctx, g, r) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-4, -3, 3.5, 0, Math.PI * 2);
      ctx.arc(4, -3, 3.5, 0, Math.PI * 2);
      ctx.fill();

      const dx = g.dir.x * 1.8;
      const dy = g.dir.y * 1.8;
      ctx.fillStyle = '#1e3a8a';
      ctx.beginPath();
      ctx.arc(-4 + dx, -3 + dy, 1.8, 0, Math.PI * 2);
      ctx.arc(4 + dx, -3 + dy, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    drawOverlays(ctx, cfg) {
      const isPt = (typeof window !== 'undefined' && window.obterIdioma && window.obterIdioma() === 'pt');

      if (this.state === 'start') {
        ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
        ctx.fillRect(0, 0, this.width, this.height);

        ctx.fillStyle = '#facc15';
        ctx.font = '900 36px monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#facc15';
        ctx.shadowBlur = 18;
        ctx.fillText('PAC-MAN', this.width / 2, this.height / 2 - 50);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 13px monospace';
        ctx.fillText(isPt ? 'CLIQUE OU PRESSIONE UMA TECLA' : 'CLICK OR PRESS ANY KEY TO START', this.width / 2, this.height / 2 + 5);

        ctx.fillStyle = '#a855f7';
        ctx.font = 'bold 12px monospace';
        const fruitLabel = (cfg.fruit.symbol + ' ' + (isPt ? cfg.fruit.namePt : cfg.fruit.name) + ' (' + cfg.fruit.points + ' PTS)');
        ctx.fillText(isPt ? ('FASE 1: ' + fruitLabel) : ('STAGE 1: ' + fruitLabel), this.width / 2, this.height / 2 + 35);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px monospace';
        ctx.fillText(isPt ? 'Coma todos os pontos & desvie dos 4 fantasmas' : 'Eat all dots & avoid the 4 ghosts', this.width / 2, this.height / 2 + 65);
      } else if (this.state === 'paused') {
        ctx.fillStyle = 'rgba(2, 6, 23, 0.75)';
        ctx.fillRect(0, 0, this.width, this.height);

        ctx.fillStyle = '#facc15';
        ctx.font = '900 32px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(isPt ? 'JOGO PAUSADO' : 'GAME PAUSED', this.width / 2, this.height / 2);
      } else if (this.state === 'gameover') {
        ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
        ctx.fillRect(0, 0, this.width, this.height);

        ctx.fillStyle = '#ef4444';
        ctx.font = '900 34px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', this.width / 2, this.height / 2 - 25);

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 13px monospace';
        ctx.fillText(isPt ? 'CLIQUE PARA JOGAR NOVAMENTE' : 'CLICK TO PLAY AGAIN', this.width / 2, this.height / 2 + 25);
      } else if (this.state === 'victory') {
        ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
        ctx.fillRect(0, 0, this.width, this.height);

        ctx.fillStyle = '#4ade80';
        ctx.font = '900 32px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(isPt ? 'FASE CONCLUÍDA!' : 'STAGE CLEAR!', this.width / 2, this.height / 2 - 30);

        const nextCfg = getLevelConfig(this.level + 1);
        ctx.fillStyle = '#facc15';
        ctx.font = 'bold 14px monospace';
        ctx.fillText(isPt ? `PRÓXIMO: ${nextCfg.fruit.symbol} ${nextCfg.fruit.namePt}` : `NEXT: ${nextCfg.fruit.symbol} ${nextCfg.fruit.name}`, this.width / 2, this.height / 2 + 15);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px monospace';
        ctx.fillText(isPt ? 'CARREGANDO LABIRINTO...' : 'PREPARING NEXT MAZE...', this.width / 2, this.height / 2 + 45);
      }
    }

    bindInputs() {
      if (typeof window === 'undefined') return;

      window.addEventListener('keydown', e => {
        if (e.code === 'KeyP') {
          this.togglePause();
          return;
        }
        if (e.code === 'KeyM') {
          this.toggleSound();
          return;
        }

        switch (e.code) {
          case 'ArrowUp':
          case 'KeyW':
            this.setNextDirection(DIR_UP);
            break;
          case 'ArrowDown':
          case 'KeyS':
            this.setNextDirection(DIR_DOWN);
            break;
          case 'ArrowLeft':
          case 'KeyA':
            this.setNextDirection(DIR_LEFT);
            break;
          case 'ArrowRight':
          case 'KeyD':
            this.setNextDirection(DIR_RIGHT);
            break;
        }
      });
    }

    startLoop() {
      const step = t => {
        if (!this.lastTimestamp) this.lastTimestamp = t;
        const dt = Math.min(0.06, (t - this.lastTimestamp) / 1000);
        this.lastTimestamp = t;

        this.update(dt);
        this.render();

        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }

  return {
    COLS,
    ROWS,
    TILE,
    DIR_UP,
    DIR_DOWN,
    DIR_LEFT,
    DIR_RIGHT,
    LEVEL_CONFIGS,
    getLevelConfig,
    PacmanGame
  };
});
