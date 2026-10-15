/**
 * PAC-MAN RETRO ARCADE (Namco 1980 / Enhanced Arcade Edition)
 * Pure vanilla JavaScript canvas implementation with procedural Web Audio synthesis.
 * 
 * Key Features:
 * - Authentic 28x36 arcade grid with wrap-around side tunnels.
 * - 4 distinct ghost AI personalities:
 *     * Blinky (Red - Shadow): Directly chases Pac-Man's tile.
 *     * Pinky (Pink - Speedy): Targets 4 tiles ahead of Pac-Man.
 *     * Inky (Cyan - Bashful): Complex vector targeting based on Blinky & Pac-Man.
 *     * Clyde (Orange - Pokey): Chases when far (>8 tiles), retreats to scatter corner when close.
 * - Scatter, Chase, Frightened (flashing blue/white), and Eaten (eyes returning to ghost house) modes.
 * - Progressive Energizer timers and ghost eat score multiplier (200, 400, 800, 1600).
 * - Cherry & Fruit bonus pickups spawning under ghost house.
 * - Chiptune sound synthesis via Web Audio API (Waka-waka, Siren, Ghost eat, Fruit eat, Death jingle).
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

  // Tile dimensions and types
  const COLS = 28;
  const ROWS = 36;
  const TILE = 16; // Base resolution: 448 x 576 (scaled to 560 x 720 canvas)

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

  // Classic 28x36 maze layout definition (0: empty, 1: wall, 2: dot, 3: energizer, 4: ghost house gate)
  const MAZE_STR = [
    "1111111111111111111111111111",
    "1000000000000000000000000001",
    "1000000000000000000000000001",
    "1222222222222112222222222221",
    "1211112111112112111112111121",
    "1311112111112112111112111131",
    "1211112111112112111112111121",
    "1222222222222222222222222221",
    "1211112112111111112112111121",
    "1211112112111111112112111121",
    "1222222112222112222112222221",
    "1111112111110110111112111111",
    "0000012111110110111112100000",
    "0000012110000000000112100000",
    "0000012110111441110112100000",
    "1111112110100000010112111111",
    "0000002000100000010002000000", // Side tunnel
    "1111112110100000010112111111",
    "0000012110111111110112100000",
    "0000012110000000000112100000",
    "0000012110111111110112100000",
    "1111112110111111110112111111",
    "1222222222222112222222222221",
    "1211112111112112111112111121",
    "1322112222222002222222112231",
    "1112112112111111112112112111",
    "1112112112111111112112112111",
    "1222222112222112222112222221",
    "1211111111112112111111111121",
    "1211111111112112111111111121",
    "1222222222222222222222222221",
    "1111111111111111111111111111",
    "1000000000000000000000000001",
    "1000000000000000000000000001",
    "1000000000000000000000000001",
    "1111111111111111111111111111"
  ];

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

        g.gain.setValueAtTime(0.12, t);
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
        osc.frequency.setValueAtTime(400, t);
        osc.frequency.linearRampToValueAtTime(900, t + 0.18);

        g.gain.setValueAtTime(0.18, t);
        g.gain.linearRampToValueAtTime(0.01, t + 0.18);

        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.19);
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
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.linearRampToValueAtTime(1200, t + 0.25);

        g.gain.setValueAtTime(0.2, t);
        g.gain.linearRampToValueAtTime(0.01, t + 0.25);

        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.26);
      } catch (e) {}
    }

    eatFruit() {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;
      try {
        const t = this.ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((f, idx) => {
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(f, t + idx * 0.06);
          g.gain.setValueAtTime(0.12, t + idx * 0.06);
          g.gain.linearRampToValueAtTime(0.01, t + (idx + 1) * 0.06);
          osc.connect(g);
          g.connect(this.ctx.destination);
          osc.start(t + idx * 0.06);
          osc.stop(t + (idx + 1) * 0.06);
        });
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

      this.width = 560; // 28 * 20
      this.height = 720; // 36 * 20
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
      this.dotsRemaining = 0;
      this.totalDots = 0;

      // Mode Timers
      this.globalTimer = 0;
      this.frightenedTimer = 0;
      this.frightenedDuration = 7;
      this.ghostsEatenCombo = 0;
      this.ghostPauseTimer = 0;
      this.dyingTimer = 0;

      // Bonus fruit
      this.fruit = null; // { x, y, symbol, points, timer }
      this.fruitScoreDisplay = null; // { x, y, score, timer }

      // Pac-Man entity
      this.pacman = {
        x: 13.5,
        y: 24,
        dir: DIR_LEFT,
        nextDir: DIR_LEFT,
        speed: 5.2, // tiles per second
        mouthAngle: 0.2,
        mouthDir: 1,
        isEating: false
      };

      // 4 Ghosts entities
      this.ghosts = [];

      // Grid matrix
      this.grid = [];
      this.initGrid();

      this.lastTimestamp = 0;
      this.bindInputs();
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
      this.initGrid();
      this.frightenedDuration = Math.max(2, 7 - (level - 1) * 0.8);
      this.resetRound();
      this.state = 'playing';
      this.notifyHud();
    }

    resetRound() {
      this.globalTimer = 0;
      this.frightenedTimer = 0;
      this.ghostsEatenCombo = 0;
      this.fruit = null;

      // Reset Pac-Man
      this.pacman.x = 13.5;
      this.pacman.y = 24;
      this.pacman.dir = DIR_LEFT;
      this.pacman.nextDir = DIR_LEFT;
      this.pacman.mouthAngle = 0.2;

      // Reset Ghosts: Blinky, Pinky, Inky, Clyde
      this.ghosts = [
        {
          id: 'blinky',
          name: 'Blinky',
          color: '#ef4444',
          x: 13.5,
          y: 12,
          dir: DIR_LEFT,
          mode: 'chase', // 'chase', 'scatter', 'frightened', 'eaten'
          speed: 4.8,
          homeX: 25,
          homeY: 0,
          house: false
        },
        {
          id: 'pinky',
          name: 'Pinky',
          color: '#f472b6',
          x: 13.5,
          y: 15,
          dir: DIR_UP,
          mode: 'scatter',
          speed: 4.6,
          homeX: 2,
          homeY: 0,
          house: true,
          exitTimer: 1.5
        },
        {
          id: 'inky',
          name: 'Inky',
          color: '#38bdf8',
          x: 11.5,
          y: 15,
          dir: DIR_UP,
          mode: 'scatter',
          speed: 4.4,
          homeX: 27,
          homeY: 34,
          house: true,
          exitTimer: 4.0
        },
        {
          id: 'clyde',
          name: 'Clyde',
          color: '#fb923c',
          x: 15.5,
          y: 15,
          dir: DIR_UP,
          mode: 'scatter',
          speed: 4.2,
          homeX: 0,
          homeY: 34,
          house: true,
          exitTimer: 7.0
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
        this.options.onHudUpdate({
          score: this.score,
          highScore: this.highScore,
          lives: this.lives,
          level: this.level,
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
      if (!this.fruit && (dotsEaten === 70 || dotsEaten === 170)) {
        this.fruit = { x: 13.5, y: 18, symbol: '🍒', points: 100 * this.level, timer: 10 };
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
      if (c < 0 || c >= COLS) return false; // Side tunnel wrap
      const tile = this.grid[r][c];
      if (tile === T_WALL) return true;
      if (tile === T_GATE && !canCrossGate) return true;
      return false;
    }

    canMoveInDirection(x, y, dir, canCrossGate = false) {
      if (dir === DIR_NONE) return true;
      const targetC = Math.floor(x + dir.x * 0.55);
      const targetR = Math.floor(y + dir.y * 0.55);
      return !this.isWall(targetC, targetR, canCrossGate);
    }

    updatePacman(dt) {
      const p = this.pacman;

      // Animate mouth
      p.mouthAngle += p.mouthDir * dt * 5.5;
      if (p.mouthAngle >= 0.45) { p.mouthAngle = 0.45; p.mouthDir = -1; }
      else if (p.mouthAngle <= 0.05) { p.mouthAngle = 0.05; p.mouthDir = 1; }

      // Try turning into next direction if aligned with tile center
      const curC = Math.round(p.x);
      const curR = Math.round(p.y);
      const distFromCenter = Math.hypot(p.x - curC, p.y - curR);

      if (p.nextDir !== p.dir && distFromCenter < 0.28) {
        const nextC = curC + p.nextDir.x;
        const nextR = curR + p.nextDir.y;
        if (!this.isWall(nextC, nextR, false)) {
          p.x = curC;
          p.y = curR;
          p.dir = p.nextDir;
        }
      }

      // Move in current direction
      if (p.dir !== DIR_NONE) {
        const nextX = p.x + p.dir.x * p.speed * dt;
        const nextY = p.y + p.dir.y * p.speed * dt;

        // Wrap around side tunnel row 16
        if (Math.round(p.y) === 16) {
          if (nextX < -0.5) p.x = COLS - 0.5;
          else if (nextX > COLS - 0.5) p.x = -0.5;
          else p.x = nextX;
        } else {
          // Check collision ahead
          const checkC = Math.floor(p.x + p.dir.x * 0.5);
          const checkR = Math.floor(p.y + p.dir.y * 0.5);
          if (this.isWall(checkC, checkR, false)) {
            p.x = Math.round(p.x);
            p.y = Math.round(p.y);
          } else {
            p.x = nextX;
            p.y = nextY;
          }
        }
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
          // Reverse direction upon entering frightened mode
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
      this.ghosts.forEach(g => {
        // Handle exiting ghost house
        if (g.house) {
          if (g.exitTimer > 0) {
            g.exitTimer -= dt;
            // Bob up and down inside house
            g.y += Math.sin(this.globalTimer * 4) * 0.02;
          } else {
            // Move toward center of house door (13.5, 12)
            if (Math.abs(g.x - 13.5) > 0.1) g.x += (g.x < 13.5 ? 1 : -1) * 3 * dt;
            else if (g.y > 12) g.y -= 3 * dt;
            else {
              g.y = 12;
              g.house = false;
              g.dir = DIR_LEFT;
            }
          }
          return;
        }

        // Determine ghost target tile based on AI personality and current mode
        const target = this.getGhostTarget(g);

        // Move speed depends on state
        let speed = g.speed;
        if (g.mode === 'frightened') speed = 2.8;
        else if (g.mode === 'eaten') speed = 9.0;

        // Wrap around side tunnel
        if (Math.round(g.y) === 16) {
          if (g.x < -0.5) g.x = COLS - 0.5;
          else if (g.x > COLS - 0.5) g.x = -0.5;
        }

        // Check if ghost reached ghost house door while eaten
        if (g.mode === 'eaten' && Math.hypot(g.x - 13.5, g.y - 12) < 0.4) {
          g.mode = 'chase';
          g.dir = DIR_UP;
        }

        // Choose next turn when close to tile center
        const curC = Math.round(g.x);
        const curR = Math.round(g.y);
        const distFromCenter = Math.hypot(g.x - curC, g.y - curR);

        if (distFromCenter < 0.18) {
          g.x = curC;
          g.y = curR;
          g.dir = this.chooseBestDirection(g, target);
        }

        g.x += g.dir.x * speed * dt;
        g.y += g.dir.y * speed * dt;
      });
    }

    getGhostTarget(g) {
      if (g.mode === 'eaten') {
        return { x: 13.5, y: 12 }; // Door of ghost house
      }

      if (g.mode === 'frightened') {
        // Random wander target
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
          // Cyan: Uses Blinky's position and 2 tiles ahead of Pac-Man to create double vector
          const blinky = this.ghosts.find(gh => gh.id === 'blinky') || { x: 13.5, y: 12 };
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

      if (valid.length === 0) return g.dir;

      // Pick direction with shortest Euclidean distance to target
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
       CANVAS RENDERING
       ========================================================================== */
    render() {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const s = this.scale;

      // Dark retro background
      ctx.fillStyle = '#050811';
      ctx.fillRect(0, 0, this.width, this.height);

      // 1. Draw Maze Walls & Dots
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const tile = this.grid[r][c];
          const px = c * s;
          const py = r * s;

          if (tile === T_WALL) {
            ctx.fillStyle = '#1e3a8a';
            ctx.fillRect(px, py, s, s);

            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 2;
            ctx.strokeRect(px + 1, py + 1, s - 2, s - 2);
          } else if (tile === T_GATE) {
            ctx.fillStyle = '#f472b6';
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
        ctx.font = '18px monospace';
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
      this.drawOverlays(ctx);
    }

    drawPacman(ctx, s) {
      const p = this.pacman;
      const cx = p.x * s + s / 2;
      const cy = p.y * s + s / 2;
      const r = s * 0.65;

      ctx.save();
      ctx.translate(cx, cy);

      if (this.state === 'dying') {
        // Spin and shrink death animation
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

      // Rotate mouth towards current direction
      let baseAngle = 0;
      if (p.dir === DIR_RIGHT) baseAngle = 0;
      else if (p.dir === DIR_DOWN) baseAngle = Math.PI * 0.5;
      else if (p.dir === DIR_LEFT) baseAngle = Math.PI;
      else if (p.dir === DIR_UP) baseAngle = Math.PI * 1.5;

      ctx.rotate(baseAngle);

      // Yellow glowing Pac-Man body
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
          // Just eyes returning to base
          this.drawGhostEyes(ctx, g, r);
          ctx.restore();
          return;
        }

        // Color based on frightened state or normal personality
        let bodyColor = g.color;
        if (g.mode === 'frightened') {
          // Flash white near expiry
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

        // 3 tentacles
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
          // Frightened squiggly eyes & mouth
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
      // White sclera
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-4, -3, 3.5, 0, Math.PI * 2);
      ctx.arc(4, -3, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Blue pupil looking in ghost direction
      const dx = g.dir.x * 1.8;
      const dy = g.dir.y * 1.8;
      ctx.fillStyle = '#1e3a8a';
      ctx.beginPath();
      ctx.arc(-4 + dx, -3 + dy, 1.8, 0, Math.PI * 2);
      ctx.arc(4 + dx, -3 + dy, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    drawOverlays(ctx) {
      const isPt = (typeof window !== 'undefined' && window.obterIdioma && window.obterIdioma() === 'pt');

      if (this.state === 'start') {
        ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
        ctx.fillRect(0, 0, this.width, this.height);

        ctx.fillStyle = '#facc15';
        ctx.font = '900 36px monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#facc15';
        ctx.shadowBlur = 18;
        ctx.fillText('PAC-MAN', this.width / 2, this.height / 2 - 40);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 14px monospace';
        ctx.fillText(isPt ? 'CLIQUE OU PRESSIONE UMA TECLA' : 'CLICK OR PRESS ANY KEY TO START', this.width / 2, this.height / 2 + 15);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px monospace';
        ctx.fillText(isPt ? 'Coma todos os pontos & desvie dos 4 fantasmas' : 'Eat all dots & avoid the 4 ghosts', this.width / 2, this.height / 2 + 45);
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
        ctx.fillText('GAME OVER', this.width / 2, this.height / 2 - 20);

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 14px monospace';
        ctx.fillText(isPt ? 'CLIQUE PARA JOGAR NOVAMENTE' : 'CLICK TO PLAY AGAIN', this.width / 2, this.height / 2 + 30);
      } else if (this.state === 'victory') {
        ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
        ctx.fillRect(0, 0, this.width, this.height);

        ctx.fillStyle = '#4ade80';
        ctx.font = '900 32px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(isPt ? 'FASE CONCLUÍDA!' : 'STAGE CLEAR!', this.width / 2, this.height / 2 - 20);

        ctx.fillStyle = '#facc15';
        ctx.font = 'bold 14px monospace';
        ctx.fillText(isPt ? 'PREPARANDO PRÓXIMA FASE...' : 'PREPARING NEXT LEVEL...', this.width / 2, this.height / 2 + 25);
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
    PacmanGame
  };
});
