/**
 * PENALTY KICK RETRO CHAMPIONSHIP
 * Authentic 3D Arcade Penalty Shootout Engine
 * 
 * High-fidelity Sprite Engine & Realistic 3D Ball/Goalkeeper Physics:
 * - Authentic 2:1 Aspect Ratio (1280x640)
 * - Official Web Game Assets from Penalty Kick Online:
 *     * Striker pitch background (bg_game_striker.jpg, 1280x640) with built-in 3D goal (posts at x: 250, 1030; crossbar at y: 32, goal line at y: 302)
 *     * Elimination of duplicate goal: clean, single 3D goal rendering
 *     * Goalkeeper animated postures with true 3D jumping parabolic arc & grounded shadow:
 *       idle (gk_idle.png), dive left (gk_dive_left.png), dive right (gk_dive_right.png), leap up (gk_dive_up.png)
 *     * Realistic rotating 7-frame soccer ball sprite (ball.png) with Magnus curve, loft & dynamic shadow
 *     * Goalkeeper mode pitch (bg_game_gk.jpg), behind-the-net goal overlay (goal_1.png)
 *     * Correct single-pair goalkeeper gloves (gloves.png slices: left, right, and catch)
 *     * Single opponent kicker sprite frame (opponent_0.png, 143x252)
 * - Balanced, skill-based AI: corner shots score, weak central shots get saved!
 * - High-speed drag/swipe trajectory and precision click-to-shoot assist
 * - Full tournament rules (Best-of-5 + Sudden Death) & live bilingual HUD (EN/PT)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PenaltyKick = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  /* ==========================================================================
     AUDIO SYSTEM (REAL MP3 AUDIO WITH PROCEDURAL WEB AUDIO FALLBACK)
     ========================================================================== */
  class PenaltyAudio {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.audioCache = {};

      const soundFiles = {
        kick: 'sounds/kick.mp3',
        goalStriker: 'sounds/goal_striker.mp3',
        goalKeeper: 'sounds/goal_keeper.mp3',
        save: 'sounds/ball_saved.mp3',
        keep: 'sounds/keep_ball.mp3',
        post: 'sounds/pole.mp3',
        bounce: 'sounds/drop_bounce_grass.mp3',
        click: 'sounds/click.mp3',
        win: 'sounds/win.mp3'
      };

      if (typeof Audio !== 'undefined') {
        for (const [key, src] of Object.entries(soundFiles)) {
          try {
            const a = new Audio(src);
            a.preload = 'auto';
            this.audioCache[key] = a;
          } catch (e) {}
        }
      }
    }

    init() {
      if (!this.ctx && typeof AudioContext !== 'undefined') {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    playFile(key, proceduralFallback) {
      if (this.muted) return;
      this.init();

      const a = this.audioCache[key];
      if (a) {
        try {
          const clone = a.cloneNode();
          clone.volume = 0.85;
          const p = clone.play();
          if (p && typeof p.catch === 'function') {
            p.catch(() => {
              if (proceduralFallback) proceduralFallback.call(this);
            });
          }
          return;
        } catch (e) {}
      }
      if (proceduralFallback) proceduralFallback.call(this);
    }

    kick() {
      this.playFile('kick', () => {
        if (!this.ctx) return;
        try {
          const t = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(160, t);
          osc.frequency.exponentialRampToValueAtTime(32, t + 0.12);
          g.gain.setValueAtTime(0.35, t);
          g.gain.linearRampToValueAtTime(0.01, t + 0.12);
          osc.connect(g);
          g.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.13);
        } catch (e) {}
      });
    }

    goal() {
      this.playFile('goalStriker', () => {
        if (!this.ctx) return;
        try {
          const bufferSize = this.ctx.sampleRate * 1.2;
          const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.15;
          }
          const noise = this.ctx.createBufferSource();
          noise.buffer = buffer;
          const filter = this.ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(600, this.ctx.currentTime);
          filter.frequency.linearRampToValueAtTime(1400, this.ctx.currentTime + 0.6);
          const gain = this.ctx.createGain();
          gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 1.2);
          noise.connect(filter);
          filter.connect(gain);
          gain.connect(this.ctx.destination);
          noise.start();
        } catch (e) {}
      });
    }

    goalCpu() {
      this.playFile('goalKeeper', () => this.goal());
    }

    save() {
      this.playFile('save', () => {
        if (!this.ctx) return;
        try {
          const t = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(220, t);
          osc.frequency.exponentialRampToValueAtTime(60, t + 0.15);
          g.gain.setValueAtTime(0.25, t);
          g.gain.linearRampToValueAtTime(0.01, t + 0.15);
          osc.connect(g);
          g.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.16);
        } catch (e) {}
      });
    }

    post() {
      this.playFile('post', () => {
        if (!this.ctx) return;
        try {
          const t = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1400, t);
          osc.frequency.exponentialRampToValueAtTime(300, t + 0.4);
          g.gain.setValueAtTime(0.3, t);
          g.gain.linearRampToValueAtTime(0.01, t + 0.4);
          osc.connect(g);
          g.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.42);
        } catch (e) {}
      });
    }

    win() {
      this.playFile('win', () => this.goal());
    }

    click() {
      this.playFile('click', null);
    }
  }

  /* ==========================================================================
     PENALTY KICK GAME ENGINE (AUTHENTIC GRAPHICS & 3D SIMULATION)
     ========================================================================== */
  class PenaltyKickGame {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.ctx = canvas ? canvas.getContext('2d') : null;
      this.options = options;

      // Authentic resolution (2:1 aspect ratio)
      this.width = 1280;
      this.height = 640;

      if (this.canvas) {
        this.canvas.width = this.width;
        this.canvas.height = this.height;
      }

      this.sound = new PenaltyAudio();

      // Tournament Match State
      this.state = 'start'; // 'start', 'striker_aim', 'striker_flight', 'keeper_ready', 'keeper_flight', 'round_result', 'match_over', 'paused'
      this.role = 'striker'; // 'striker' (You shoot) or 'keeper' (You defend)
      this.round = 1;
      this.maxRounds = 5;

      this.scorePlayer = 0;
      this.scoreCpu = 0;
      this.shootoutHistory = [];

      // 3D Ball Physics & Trajectory
      this.ball = {
        x: 0,
        y: 0.11,
        z: 0,
        targetX: 0,
        targetY: 1.2,
        startX: 0,
        startY: 0.11,
        vx: 0,
        vy: 0,
        vz: 0,
        spin: 0,
        arcHeight: 0.4,
        radius: 0.22,
        flightProgress: 0,
        flightDuration: 0.58,
        inFlight: false,
        result: null // 'goal', 'saved', 'post', 'miss'
      };

      // 3D Goal Geometry (at Z = 10.5)
      this.goal = {
        z: 10.5,
        width: 7.32,  // 7.32m official width (-3.66 to 3.66)
        height: 2.44  // 2.44m official height (0 to 2.44)
      };

      // Goalkeeper AI & Dynamic 3D Jumping Animation
      this.keeper = {
        screenX: 640,
        screenY: 302, // Goal line ground is at y = 302
        targetScreenX: 640,
        diveState: 'idle', // 'idle', 'diving_left', 'diving_right', 'jumping'
        diveDir: 'center',
        diveTime: 0,
        diveDuration: 0.52,
        maxJumpHeight: 0,
        hasStartedDive: false,
        handsX: 640,
        handsY: 210
      };

      // User Gloves position in Keeper Mode (Single pair of hands)
      this.gloves = {
        x: 640,
        y: 350,
        targetX: 640,
        targetY: 350,
        isCatching: false
      };

      // Drag / Swipe tracking for Striker Mode
      this.dragStart = null;
      this.dragCurrent = null;

      // Feedback animation
      this.bannerText = "";
      this.bannerTimer = 0;
      this.bannerColor = "#facc15";

      this.lastTimestamp = 0;

      // Preload authentic sprites
      this.loadSprites();
      this.bindInputs();
    }

    loadSprites() {
      this.sprites = {};
      const assetList = {
        bgStriker: 'sprites/striker/bg_game_striker.jpg',
        goalStriker: 'sprites/striker/goal_0.png',
        gkIdle: 'sprites/striker/gk_idle.png',
        gkDiveLeft: 'sprites/striker/gk_dive_left.png',
        gkDiveRight: 'sprites/striker/gk_dive_right.png',
        gkDiveUp: 'sprites/striker/gk_dive_up.png',
        bgGk: 'sprites/goalkeeper/bg_game_gk.jpg',
        goalGk: 'sprites/goalkeeper/goal_1.png',
        gloves: 'sprites/goalkeeper/gloves.png',
        ball: 'sprites/ball.png',
        ballShadow: 'sprites/ball_shadow.png',
        opponent: 'sprites/goalkeeper/opponent_0.png'
      };

      if (typeof Image !== 'undefined') {
        for (const [key, src] of Object.entries(assetList)) {
          const img = new Image();
          img.src = src;
          this.sprites[key] = img;
        }
      }
    }

    startNewMatch() {
      this.scorePlayer = 0;
      this.scoreCpu = 0;
      this.round = 1;
      this.shootoutHistory = [];
      this.role = 'striker';
      this.resetRound();
      this.state = 'striker_aim';
      const isPt = (typeof window !== 'undefined' && window.obterIdioma && window.obterIdioma() === 'pt');
      this.bannerText = isPt ? "SUA VEZ DE CHUTAR: ARRASTE OU TOQUE NO GOL!" : "YOUR TURN: DRAG OR TAP TO SHOOT!";
      this.bannerColor = "#38bdf8";
      this.bannerTimer = 2.4;
      this.notifyHud();
      this.sound.click();
    }

    resetRound() {
      // Reset Ball to Penalty Spot (640, 560)
      this.ball.x = 0;
      this.ball.y = 0.11;
      this.ball.z = 0;
      this.ball.startX = 0;
      this.ball.startY = 0.11;
      this.ball.targetX = 0;
      this.ball.targetY = 1.2;
      this.ball.vx = 0;
      this.ball.vy = 0;
      this.ball.vz = 0;
      this.ball.spin = 0;
      this.ball.arcHeight = 0.35;
      this.ball.flightProgress = 0;
      this.ball.inFlight = false;
      this.ball.result = null;

      // Reset Goalkeeper on the goal line (y = 302)
      this.keeper.screenX = 640;
      this.keeper.screenY = 302;
      this.keeper.targetScreenX = 640;
      this.keeper.diveState = 'idle';
      this.keeper.diveDir = 'center';
      this.keeper.diveTime = 0;
      this.keeper.maxJumpHeight = 0;
      this.keeper.hasStartedDive = false;
      this.keeper.handsX = 640;
      this.keeper.handsY = 210;

      // Reset Gloves
      this.gloves.x = 640;
      this.gloves.y = 350;
      this.gloves.targetX = 640;
      this.gloves.targetY = 350;
      this.gloves.isCatching = false;

      this.dragStart = null;
      this.dragCurrent = null;
    }

    togglePause() {
      if (this.state === 'paused') {
        this.state = this.role === 'striker' ? 'striker_aim' : 'keeper_ready';
      } else if (this.state === 'striker_aim' || this.state === 'keeper_ready') {
        this.state = 'paused';
      }
      this.notifyHud();
    }

    toggleSound() {
      this.sound.muted = !this.sound.muted;
      this.notifyHud();
      return !this.sound.muted;
    }

    notifyHud() {
      if (typeof this.options.onHudUpdate === 'function') {
        this.options.onHudUpdate({
          round: this.round,
          role: this.role,
          scorePlayer: this.scorePlayer,
          scoreCpu: this.scoreCpu,
          state: this.state,
          sound: !this.sound.muted,
          history: this.shootoutHistory
        });
      }
    }

    /* ==========================================================================
       3D PERSPECTIVE PROJECTION
       Maps 3D world (X: -3.66..3.66, Y: 0..2.44, Z: 0..10.5) to screen coordinates
       - Penalty spot (Z=0): (640, 560), scale = 1.0
       - Goal line (Z=10.5): (640, 302), Left post: x=250, Right post: x=1030, Crossbar: y=32
       ========================================================================== */
    project(x, y, z) {
      const t = Math.max(0, Math.min(1.2, z / 10.5));
      const groundY = 560 - t * (560 - 302); // 560 down to 302
      const pxPerMeterY = (302 - 32) / 2.44;  // 110.65 px/m
      const pxPerMeterX = (1030 - 250) / 7.32; // 106.55 px/m

      const scale = 1.0 - t * 0.65;
      const screenX = 640 + x * pxPerMeterX;
      const screenY = groundY - y * pxPerMeterY;

      return { x: screenX, y: screenY, scale: scale };
    }

    /* ==========================================================================
       STRIKER & GOALKEEPER SHOT TRIGGERS
       ========================================================================== */
    kickPlayerShot(screenDx, screenDy, durationSec) {
      if (this.state !== 'striker_aim' || this.ball.inFlight) return;

      const dur = Math.max(0.12, Math.min(0.55, durationSec || 0.25));
      const speedFactor = 1.0 / dur;

      // Support forward swipe (-screenDy) and slingshot pull (+screenDy)
      let dy = screenDy;
      if (dy > 0 && Math.abs(dy) > Math.abs(screenDx) * 0.8) {
        dy = -dy;
      }

      const targetX = Math.max(-4.0, Math.min(4.0, (screenDx / 160) * 3.66));
      const targetY = Math.max(0.15, Math.min(2.9, (-dy / 210) * 2.44));

      // Realistic flight duration (0.48s rocket to 0.65s placed curve)
      const flightDuration = Math.max(0.48, Math.min(0.65, 0.74 / Math.sqrt(speedFactor)));

      this.ball.startX = 0;
      this.ball.startY = 0.11;
      this.ball.targetX = targetX;
      this.ball.targetY = targetY;
      this.ball.spin = (targetX > 0 ? 1 : -1) * Math.min(0.5, Math.abs(screenDx) / 240);
      this.ball.arcHeight = Math.max(0.15, Math.min(0.55, 0.25 + targetY * 0.1));
      this.ball.flightProgress = 0;
      this.ball.flightDuration = flightDuration;
      this.ball.vz = this.goal.z / flightDuration;
      this.ball.inFlight = true;
      this.ball.result = null;
      this.state = 'striker_flight';

      this.sound.kick();

      // Goalkeeper AI Decision (Human reaction delay + balanced save reach)
      this.keeper.hasStartedDive = false;
      this.keeper.diveTime = 0;

      setTimeout(() => {
        if (this.state !== 'striker_flight') return;
        this.keeper.hasStartedDive = true;

        // Guess accuracy scales with round (50% in round 1 up to 75% in round 5)
        const guessAccuracy = 0.50 + Math.min(0.25, (this.round - 1) * 0.06);
        const guessedRightSide = Math.random() < guessAccuracy;

        let intendedX = targetX;
        if (!guessedRightSide) {
          intendedX = -targetX;
        }

        if (intendedX < -0.6) {
          this.keeper.diveState = 'diving_left';
          this.keeper.diveDir = 'left';
          this.keeper.targetScreenX = Math.max(380, 640 + intendedX * 85);
          this.keeper.maxJumpHeight = Math.min(95, Math.max(30, targetY * 36));
        } else if (intendedX > 0.6) {
          this.keeper.diveState = 'diving_right';
          this.keeper.diveDir = 'right';
          this.keeper.targetScreenX = Math.min(900, 640 + intendedX * 85);
          this.keeper.maxJumpHeight = Math.min(95, Math.max(30, targetY * 36));
        } else if (targetY > 1.6) {
          this.keeper.diveState = 'jumping';
          this.keeper.diveDir = 'up';
          this.keeper.targetScreenX = 640 + (Math.random() - 0.5) * 30;
          this.keeper.maxJumpHeight = 105;
        } else {
          this.keeper.diveState = 'idle';
          this.keeper.diveDir = 'center';
          this.keeper.targetScreenX = 640 + intendedX * 45;
          this.keeper.maxJumpHeight = 20;
        }
      }, 160);
    }

    triggerCpuShot() {
      if (this.state !== 'keeper_ready' || this.ball.inFlight) return;

      const targets = [
        { x: -3.0, y: 2.05 }, // Top left
        { x:  3.0, y: 2.05 }, // Top right
        { x: -2.8, y: 0.40 }, // Bottom left
        { x:  2.8, y: 0.40 }, // Bottom right
        { x:  0.0, y: 1.80 }, // Upper middle
        { x: -1.6, y: 1.30 }, // Mid left
        { x:  1.6, y: 1.30 }  // Mid right
      ];
      const target = targets[Math.floor(Math.random() * targets.length)];
      target.x += (Math.random() - 0.5) * 0.6;
      target.y += (Math.random() - 0.5) * 0.4;

      const flightDuration = 0.95;
      this.ball.startX = 0;
      this.ball.startY = 0.11;
      this.ball.targetX = target.x;
      this.ball.targetY = target.y;
      this.ball.spin = (target.x > 0 ? 1 : -1) * 0.35;
      this.ball.arcHeight = 0.35;
      this.ball.flightProgress = 0;
      this.ball.flightDuration = flightDuration;
      this.ball.vz = this.goal.z / flightDuration;
      this.ball.inFlight = true;
      this.ball.result = null;
      this.state = 'keeper_flight';

      this.sound.kick();
    }

    /* ==========================================================================
       UPDATE & BALL/GOALKEEPER PHYSICS
       ========================================================================== */
    update(dt) {
      if (this.state === 'paused') return;

      if (this.bannerTimer > 0) {
        this.bannerTimer -= dt;
      }

      // Smoothly interpolate user gloves towards target in Keeper mode
      if (this.role === 'keeper') {
        this.gloves.x += (this.gloves.targetX - this.gloves.x) * 0.4;
        this.gloves.y += (this.gloves.targetY - this.gloves.y) * 0.4;
      }

      // Update Goalkeeper dive jump in Striker mode
      if (this.role === 'striker' && this.keeper.hasStartedDive) {
        this.keeper.diveTime += dt;
        const progress = Math.min(1.0, this.keeper.diveTime / this.keeper.diveDuration);

        // Smooth horizontal leap towards targetScreenX
        const ease = Math.sin(progress * Math.PI * 0.5);
        this.keeper.screenX = 640 + (this.keeper.targetScreenX - 640) * ease;

        // Parabolic jumping arc (up and down) grounded on goal line (y = 302)
        const jumpArc = Math.sin(progress * Math.PI) * this.keeper.maxJumpHeight;
        this.keeper.screenY = 302 - jumpArc;

        // Track keeper hands position for collision check
        if (this.keeper.diveDir === 'left') {
          this.keeper.handsX = this.keeper.screenX - 130;
          this.keeper.handsY = this.keeper.screenY - 20;
        } else if (this.keeper.diveDir === 'right') {
          this.keeper.handsX = this.keeper.screenX + 130;
          this.keeper.handsY = this.keeper.screenY - 20;
        } else if (this.keeper.diveDir === 'up') {
          this.keeper.handsX = this.keeper.screenX;
          this.keeper.handsY = this.keeper.screenY - 130;
        } else {
          this.keeper.handsX = this.keeper.screenX;
          this.keeper.handsY = this.keeper.screenY - 70;
        }
      }

      // Update Flying Ball
      if (this.ball.inFlight) {
        this.ball.flightProgress += dt / this.ball.flightDuration;
        const t = Math.min(1.15, this.ball.flightProgress);

        // Advance 3D coordinates
        this.ball.z = t * this.goal.z;

        const curveX = this.ball.spin * Math.sin(t * Math.PI) * 0.45;
        this.ball.x = this.ball.startX + (this.ball.targetX - this.ball.startX) * t + curveX;

        const arcY = Math.sin(t * Math.PI) * this.ball.arcHeight;
        this.ball.y = this.ball.startY + (this.ball.targetY - this.ball.startY) * t + arcY;

        // 1. STRIKER MODE: Check Goalkeeper Save at Goal Line (t >= 0.95)
        if (this.role === 'striker' && t >= 0.95 && !this.ball.result) {
          const ballProj = this.project(this.ball.x, this.ball.y, this.goal.z);
          const handDist = Math.hypot(ballProj.x - this.keeper.handsX, ballProj.y - this.keeper.handsY);

          // Realistic save radius: hands reach ~65px
          if (handDist < 65) {
            this.ball.result = 'saved';
            this.sound.save();
            this.finishRound(false);
          }
        }

        // 2. KEEPER MODE: Check User Gloves Save at Goal Line (t >= 0.95)
        if (this.role === 'keeper' && t >= 0.95 && !this.ball.result) {
          const targetScreenX = 640 + this.ball.targetX * 98;
          const targetScreenY = 424 - this.ball.targetY * 108;
          const gloveDist = Math.hypot(targetScreenX - this.gloves.x, targetScreenY - this.gloves.y);

          if (gloveDist < 85) {
            this.ball.result = 'saved';
            this.gloves.isCatching = true;
            this.sound.save();
            this.finishRound(false);
          }
        }

        // 3. Goal Line Cross & Post Check (at t >= 1.0)
        if (t >= 1.0 && !this.ball.result) {
          const hw = this.goal.width / 2; // 3.66m
          const gh = this.goal.height;    // 2.44m
          const r = this.ball.radius;

          const isInsideWidth = (this.ball.targetX >= -hw && this.ball.targetX <= hw);
          const isInsideHeight = (this.ball.targetY >= 0 && this.ball.targetY <= gh);

          // Post and Crossbar Hit
          const hitLeftPost = Math.abs(this.ball.targetX - (-hw)) < r + 0.10 && this.ball.targetY <= gh + 0.1;
          const hitRightPost = Math.abs(this.ball.targetX - hw) < r + 0.10 && this.ball.targetY <= gh + 0.1;
          const hitCrossbar = Math.abs(this.ball.targetY - gh) < r + 0.10 && Math.abs(this.ball.targetX) <= hw + 0.1;

          if (hitLeftPost || hitRightPost || hitCrossbar) {
            this.ball.result = 'post';
            this.sound.post();
            this.finishRound(false);
          } else if (isInsideWidth && isInsideHeight) {
            this.ball.result = 'goal';
            if (this.role === 'striker') {
              this.sound.goal();
            } else {
              this.sound.goalCpu();
            }
            this.finishRound(true);
          } else {
            this.ball.result = 'miss';
            this.finishRound(false);
          }
        }

        if (t >= 1.15) {
          this.ball.inFlight = false;
        }
      }
    }

    finishRound(isGoal) {
      this.state = 'round_result';
      const isPt = (typeof window !== 'undefined' && window.obterIdioma && window.obterIdioma() === 'pt');

      if (this.role === 'striker') {
        if (isGoal) {
          this.scorePlayer++;
          this.bannerText = isPt ? "GOLAÇO! PONTO SEU!" : "GOAL! YOU SCORED!";
          this.bannerColor = "#4ade80";
        } else {
          this.bannerText = this.ball.result === 'saved'
            ? (isPt ? "DEFESA DO GOLEIRO!" : "SAVED BY KEEPER!")
            : (this.ball.result === 'post' ? (isPt ? "NA TRAVE!" : "HIT THE POST!") : (isPt ? "PRA FORA!" : "MISSED THE GOAL!"));
          this.bannerColor = "#ef4444";
        }
      } else {
        if (isGoal) {
          this.scoreCpu++;
          this.bannerText = isPt ? "GOL DO ADVERSÁRIO!" : "CPU SCORED!";
          this.bannerColor = "#ef4444";
        } else {
          this.bannerText = isPt ? "DEFESAAÇA! VOCÊ SALVOU!" : "GREAT SAVE! YOU BLOCKED IT!";
          this.bannerColor = "#4ade80";
        }
      }

      this.bannerTimer = 2.4;
      this.notifyHud();

      setTimeout(() => {
        if (this.role === 'striker') {
          this.role = 'keeper';
          this.resetRound();
          this.state = 'keeper_ready';
          this.bannerText = isPt ? "SUA VEZ NO GOL: MOVA AS LUVAS PARA DEFENDER!" : "DEFEND! MOVE YOUR GLOVES TO SAVE!";
          this.bannerColor = "#facc15";
          this.bannerTimer = 2.0;
          this.notifyHud();

          setTimeout(() => {
            if (this.state === 'keeper_ready') this.triggerCpuShot();
          }, 1500);
        } else {
          this.shootoutHistory.push({
            round: this.round,
            playerScore: this.scorePlayer,
            cpuScore: this.scoreCpu
          });

          this.round++;

          const isFinished = (this.round > this.maxRounds && this.scorePlayer !== this.scoreCpu);

          if (isFinished) {
            this.state = 'match_over';
            const playerWon = this.scorePlayer > this.scoreCpu;
            if (playerWon) this.sound.win();
            this.bannerText = playerWon
              ? (isPt ? "🏆 CAMPEÃO DO TORNEIO!" : "🏆 TOURNAMENT CHAMPION!")
              : (isPt ? "DERROTA NO PÊNALTI!" : "DEFEAT IN SHOOTOUT!");
            this.bannerColor = playerWon ? "#4ade80" : "#ef4444";
            this.bannerTimer = 8.0;
            this.notifyHud();
          } else {
            this.role = 'striker';
            this.resetRound();
            this.state = 'striker_aim';
            this.bannerText = (isPt ? `RODADA ${this.round}: CHUTE!` : `ROUND ${this.round}: SHOOT!`);
            this.bannerColor = "#38bdf8";
            this.bannerTimer = 2.0;
            this.notifyHud();
          }
        }
      }, 2300);
    }

    /* ==========================================================================
       AUTHENTIC CANVAS RENDERING
       ========================================================================== */
    render() {
      if (!this.ctx) return;
      const ctx = this.ctx;

      // 1. STADIUM BACKGROUND (Contains the official 3D goal in Striker mode!)
      this.drawBackground(ctx);

      // 2. GOALKEEPER (STRIKER MODE) OR OPPONENT KICKER (KEEPER MODE)
      if (this.role === 'striker') {
        this.drawGoalkeeper(ctx);
      } else {
        this.drawOpponent(ctx);
      }

      // 3. 3D SOCCER BALL WITH SPIN & DYNAMIC GROUND SHADOW
      this.drawBall(ctx);

      // 4. GOAL OVERLAY (Only in Goalkeeper mode from behind, or ball in net)
      this.drawGoal(ctx);

      // 5. GOALKEEPER GLOVES (KEEPER MODE - EXACTLY ONE PAIR OF HANDS)
      if (this.role === 'keeper') {
        this.drawGloves(ctx);
      }

      // 6. AIM TRAJECTORY GUIDELINE & RETICLE (STRIKER AIM)
      if (this.state === 'striker_aim') {
        this.drawAimGuidance(ctx);
      }

      // 7. OVERLAYS, BANNERS & SCORE HUD
      this.drawOverlays(ctx);
    }

    drawBackground(ctx) {
      if (this.role === 'striker') {
        const bg = this.sprites.bgStriker;
        if (bg && bg.complete && bg.naturalWidth > 0) {
          // bg_game_striker.jpg already has the 3D goal, crowd, banners, and field!
          ctx.drawImage(bg, 0, 0, this.width, this.height);
          return;
        }
      } else {
        const bg = this.sprites.bgGk;
        if (bg && bg.complete && bg.naturalWidth > 0) {
          ctx.drawImage(bg, 0, 0, this.width, this.height);
          return;
        }
      }

      // Procedural Fallback if images are loading or in test environment
      const gradSky = ctx.createLinearGradient(0, 0, 0, this.height * 0.45);
      gradSky.addColorStop(0, '#020617');
      gradSky.addColorStop(1, '#0f172a');
      ctx.fillStyle = gradSky;
      ctx.fillRect(0, 0, this.width, this.height * 0.45);

      const gradGrass = ctx.createLinearGradient(0, this.height * 0.45, 0, this.height);
      gradGrass.addColorStop(0, '#15803d');
      gradGrass.addColorStop(0.4, '#16a34a');
      gradGrass.addColorStop(1, '#14532d');
      ctx.fillStyle = gradGrass;
      ctx.fillRect(0, this.height * 0.45, this.width, this.height * 0.55);
    }

    drawGoal(ctx) {
      if (this.role === 'striker') {
        // In Striker mode, bg_game_striker.jpg already has the 3D goal!
        // DO NOT redraw goal_0 to prevent duplicated goal posts!
        return;
      }

      // In Goalkeeper mode, draw the behind-the-net perspective goal frame
      const gImg = this.sprites.goalGk;
      if (gImg && gImg.complete && gImg.naturalWidth > 0) {
        ctx.drawImage(gImg, 0, 0, this.width, this.height);
        return;
      }

      // Procedural Fallback Post Wireframe (used in headless test environment)
      const pBL = this.project(-this.goal.width / 2, 0, this.goal.z);
      const pBR = this.project(this.goal.width / 2, 0, this.goal.z);
      const pTL = this.project(-this.goal.width / 2, this.goal.height, this.goal.z);
      const pTR = this.project(this.goal.width / 2, this.goal.height, this.goal.z);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(pBL.x, pBL.y);
      ctx.lineTo(pTL.x, pTL.y);
      ctx.lineTo(pTR.x, pTR.y);
      ctx.lineTo(pBR.x, pBR.y);
      ctx.stroke();
    }

    drawGoalkeeper(ctx) {
      const k = this.keeper;

      // 1. Dynamic Ground Shadow with 3D Depth
      // Shadow stays firmly grounded on the grass line at y=302, directly beneath the keeper
      const jumpHeight = Math.max(0, 302 - k.screenY);
      const shadowScale = Math.max(0.6, 1.0 - (jumpHeight / 100) * 0.4);
      const shadowAlpha = Math.max(0.18, 0.52 - (jumpHeight / 100) * 0.35);

      ctx.save();
      ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
      ctx.beginPath();
      ctx.ellipse(k.screenX, 302, 60 * shadowScale, 12 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 2. Goalkeeper Sprite Selection & Perspective Placement
      let sprite = this.sprites.gkIdle;
      let drawW = 140;
      let drawH = 180;
      let drawX = k.screenX - 70;
      let drawY = k.screenY - 180;

      if (k.diveState === 'diving_left') {
        sprite = this.sprites.gkDiveLeft;
        drawW = 250;
        drawH = 130;
        drawX = k.screenX - 165;
        drawY = k.screenY - 95;
      } else if (k.diveState === 'diving_right') {
        sprite = this.sprites.gkDiveRight;
        drawW = 250;
        drawH = 130;
        drawX = k.screenX - 85;
        drawY = k.screenY - 95;
      } else if (k.diveState === 'jumping') {
        sprite = this.sprites.gkDiveUp;
        drawW = 130;
        drawH = 200;
        drawX = k.screenX - 65;
        drawY = k.screenY - 180;
      }

      if (sprite && sprite.complete && sprite.naturalWidth > 0) {
        ctx.drawImage(sprite, drawX, drawY, drawW, drawH);
      } else {
        // Fallback procedural keeper
        ctx.fillStyle = '#f97316';
        ctx.fillRect(k.screenX - 25, k.screenY - 100, 50, 95);
      }
    }

    drawOpponent(ctx) {
      const opp = this.sprites.opponent;
      const x = 640;
      const y = 320;

      // Draw single sharp frame (frame 0: 143x252) from the opponent sprite sheet
      if (opp && opp.complete && opp.naturalWidth > 0) {
        ctx.drawImage(opp, 0, 0, 143, 252, x - 32, y - 110, 64, 114);
      }
    }

    drawBall(ctx) {
      const b = this.ball;

      if (this.role === 'striker') {
        // STRIKER MODE: Ball travels from penalty spot (640, 560) to goal (Z=10.5, groundY=302)
        const t = Math.min(1.0, b.flightProgress || 0);

        // Ground line beneath ball in perspective
        const groundY = 560 - t * (560 - 302);
        const scale = 1.0 - t * 0.64;
        const diameter = Math.max(26, 84 * scale);
        const radius = diameter / 2;

        let screenX = 640;
        let screenY = 552;

        if (b.inFlight) {
          const curveX = b.spin * Math.sin(t * Math.PI) * 0.45;
          const currX = b.startX + (b.targetX - b.startX) * t + curveX;
          const currY = b.startY + (b.targetY - b.startY) * t + Math.sin(t * Math.PI) * b.arcHeight;

          screenX = 640 + currX * 106.5;
          screenY = groundY - currY * 110.6;
        }

        // 1. Ground Shadow (Tracks below on pitch)
        const shadowImg = this.sprites.ballShadow;
        const sW = diameter * 1.35;
        const sH = diameter * 0.40;

        ctx.save();
        const heightOffGround = Math.max(0, groundY - screenY);
        const shadowAlpha = Math.max(0.14, 0.65 - (heightOffGround / 220) * 0.45);
        ctx.globalAlpha = shadowAlpha;

        if (shadowImg && shadowImg.complete && shadowImg.naturalWidth > 0) {
          ctx.drawImage(shadowImg, screenX - sW / 2, groundY - sH / 2, sW, sH);
        } else {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          ctx.beginPath();
          ctx.ellipse(screenX, groundY, sW / 2, sH / 2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        // 2. Soccer Ball (7 rotating frames)
        const ballImg = this.sprites.ball;
        if (ballImg && ballImg.complete && ballImg.naturalWidth > 0) {
          const frameIndex = b.inFlight ? Math.floor(t * 22) % 7 : 0;
          ctx.drawImage(ballImg, frameIndex * 150, 0, 150, 150, screenX - radius, screenY - radius, diameter, diameter);
        } else {
          ctx.save();
          ctx.translate(screenX, screenY);
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, 0, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(0, 0, radius * 0.35, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      } else {
        // GOALKEEPER MODE: Ball travels from distance penalty spot (640, 320) towards camera
        const t = Math.min(1.0, b.flightProgress || 0);

        const targetScreenX = 640 + b.targetX * 98;
        const targetScreenY = 424 - b.targetY * 108;

        const screenX = 640 + (targetScreenX - 640) * t + b.spin * Math.sin(t * Math.PI) * 40;
        const screenY = 320 + (targetScreenY - 320) * t - Math.sin(t * Math.PI) * 50;

        const diameter = 22 + t * 58;
        const radius = diameter / 2;

        const shadowY = 335 + (424 - 335) * t;
        ctx.save();
        ctx.globalAlpha = Math.max(0.15, 0.6 - (Math.abs(shadowY - screenY) / 180) * 0.4);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.ellipse(screenX, shadowY, diameter * 0.65, diameter * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        const ballImg = this.sprites.ball;
        if (ballImg && ballImg.complete && ballImg.naturalWidth > 0) {
          const frameIndex = b.inFlight ? Math.floor(t * 24) % 7 : 0;
          ctx.drawImage(ballImg, frameIndex * 150, 0, 150, 150, screenX - radius, screenY - radius, diameter, diameter);
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    drawGloves(ctx) {
      const g = this.gloves;
      const gImg = this.sprites.gloves;

      if (gImg && gImg.complete && gImg.naturalWidth > 0) {
        if (g.isCatching) {
          // Catch pair slice: (56, 0, 107, 86)
          ctx.drawImage(gImg, 56, 0, 107, 86, g.x - 53, g.y - 43, 107, 86);
        } else {
          // Exactly ONE pair of hands:
          // Left Glove slice: (0, 0, 54, 86)
          ctx.drawImage(gImg, 0, 0, 54, 86, g.x - 65, g.y - 43, 54, 86);
          // Right Glove slice: (165, 0, 53, 86)
          ctx.drawImage(gImg, 165, 0, 53, 86, g.x + 11, g.y - 43, 53, 86);
        }
      } else {
        // Fallback gloves
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(g.x - 65, g.y - 25, 45, 45);
        ctx.fillRect(g.x + 20, g.y - 25, 45, 45);
      }
    }

    drawAimGuidance(ctx) {
      const pSpot = { x: 640, y: 552 };

      // Pulsing hint on the ball when waiting for player kick
      if (!this.dragStart) {
        const pulse = 1.0 + Math.sin(performance.now() * 0.006) * 0.12;
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(pSpot.x, pSpot.y, 46 * pulse, 0, Math.PI * 2);
        ctx.stroke();
        return;
      }

      // Drag line & Goal Landing Reticle
      if (this.dragStart && this.dragCurrent) {
        const dx = this.dragCurrent.x - this.dragStart.x;
        let dy = this.dragCurrent.y - this.dragStart.y;
        if (dy > 0 && Math.abs(dy) > Math.abs(dx) * 0.8) dy = -dy;

        // Visual trajectory vector
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 4;
        ctx.setLineDash([10, 6]);
        ctx.beginPath();
        ctx.moveTo(pSpot.x, pSpot.y);
        ctx.lineTo(pSpot.x + dx * 1.5, pSpot.y + dy * 1.5);
        ctx.stroke();
        ctx.setLineDash([]);

        // Landing Reticle Target on Goal
        const targetX = Math.max(-4.0, Math.min(4.0, (dx / 160) * 3.66));
        const targetY = Math.max(0.15, Math.min(2.9, (-dy / 210) * 2.44));

        const targetScreenX = 640 + targetX * 106.5;
        const targetScreenY = 302 - targetY * 110.6;

        const isOnTarget = (Math.abs(targetX) <= 3.66 && targetY >= 0 && targetY <= 2.44);
        ctx.strokeStyle = isOnTarget ? '#4ade80' : '#ef4444';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(targetScreenX, targetScreenY, 22, 0, Math.PI * 2);
        ctx.moveTo(targetScreenX - 28, targetScreenY);
        ctx.lineTo(targetScreenX + 28, targetScreenY);
        ctx.moveTo(targetScreenX, targetScreenY - 28);
        ctx.lineTo(targetScreenX, targetScreenY + 28);
        ctx.stroke();
      }
    }

    drawOverlays(ctx) {
      const isPt = (typeof window !== 'undefined' && window.obterIdioma && window.obterIdioma() === 'pt');

      // Top Banner Announcement
      if (this.bannerTimer > 0 && this.bannerText) {
        ctx.save();
        ctx.fillStyle = 'rgba(2, 6, 23, 0.88)';
        ctx.fillRect(this.width / 2 - 320, 65, 640, 56);

        ctx.strokeStyle = this.bannerColor;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(this.width / 2 - 320, 65, 640, 56);

        ctx.fillStyle = this.bannerColor;
        ctx.font = '900 22px monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = this.bannerColor;
        ctx.shadowBlur = 14;
        ctx.fillText(this.bannerText, this.width / 2, 101);
        ctx.restore();
      }

      // Start Screen
      if (this.state === 'start') {
        ctx.fillStyle = 'rgba(2, 6, 23, 0.88)';
        ctx.fillRect(0, 0, this.width, this.height);

        ctx.fillStyle = '#facc15';
        ctx.font = '900 48px monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#facc15';
        ctx.shadowBlur = 20;
        ctx.fillText('PENALTY KICK ONLINE', this.width / 2, this.height / 2 - 50);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 20px monospace';
        ctx.fillText(isPt ? 'CLIQUE OU TOQUE PARA INICIAR O TORNEIO' : 'CLICK OR TAP TO START THE TOURNAMENT', this.width / 2, this.height / 2 + 15);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px monospace';
        ctx.fillText(isPt ? 'Arraste ou toque no gol p/ chutar · Mova as luvas p/ defender' : 'Drag or tap to shoot · Move gloves to defend', this.width / 2, this.height / 2 + 55);
      } else if (this.state === 'match_over') {
        ctx.fillStyle = 'rgba(2, 6, 23, 0.9)';
        ctx.fillRect(0, 0, this.width, this.height);

        const won = this.scorePlayer > this.scoreCpu;
        ctx.fillStyle = won ? '#4ade80' : '#ef4444';
        ctx.font = '900 44px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(won ? (isPt ? '🏆 VOCÊ É O CAMPEÃO!' : '🏆 YOU ARE THE CHAMPION!') : (isPt ? 'DERROTA NO PÊNALTI' : 'SHOOTOUT DEFEAT'), this.width / 2, this.height / 2 - 40);

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 36px monospace';
        ctx.fillText(`${this.scorePlayer} - ${this.scoreCpu}`, this.width / 2, this.height / 2 + 20);

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 16px monospace';
        ctx.fillText(isPt ? 'CLIQUE PARA JOGAR NOVAMENTE' : 'CLICK TO PLAY AGAIN', this.width / 2, this.height / 2 + 75);
      }
    }

    /* ==========================================================================
       USER INPUT HANDLING (MOUSE & TOUCH WITH DUAL SWIPE + DIRECT TAP ASSIST)
       ========================================================================== */
    bindInputs() {
      if (typeof window === 'undefined' || !this.canvas) return;

      const getPos = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
          x: (clientX - rect.left) * (this.width / rect.width),
          y: (clientY - rect.top) * (this.height / rect.height)
        };
      };

      const onPointerDown = (e) => {
        if (this.state === 'start' || this.state === 'match_over') {
          this.startNewMatch();
          return;
        }

        const pos = getPos(e);

        if (this.state === 'striker_aim') {
          // If player taps directly inside the goal frame (x: 240..1040, y: 30..315), treat as precision tap shot!
          if (pos.y < 320 && pos.x > 240 && pos.x < 1040) {
            const targetX = ((pos.x - 640) / 106.5);
            const targetY = ((302 - pos.y) / 110.6);
            const screenDx = (targetX / 3.66) * 160;
            const screenDy = -(targetY / 2.44) * 210;
            this.kickPlayerShot(screenDx, screenDy, 0.26);
            return;
          }

          // Otherwise start drag gesture from lower half / penalty spot
          this.dragStart = { x: pos.x, y: pos.y, time: performance.now() };
          this.dragCurrent = { x: pos.x, y: pos.y };
        } else if (this.role === 'keeper') {
          this.gloves.targetX = Math.max(260, Math.min(1020, pos.x));
          this.gloves.targetY = Math.max(160, Math.min(480, pos.y));
        }
      };

      const onPointerMove = (e) => {
        const pos = getPos(e);

        if (this.state === 'striker_aim' && this.dragStart) {
          this.dragCurrent = { x: pos.x, y: pos.y };
        } else if (this.role === 'keeper') {
          this.gloves.targetX = Math.max(260, Math.min(1020, pos.x));
          this.gloves.targetY = Math.max(160, Math.min(480, pos.y));
        }
      };

      const onPointerUp = (e) => {
        if (this.state === 'striker_aim' && this.dragStart && this.dragCurrent) {
          const dx = this.dragCurrent.x - this.dragStart.x;
          const dy = this.dragCurrent.y - this.dragStart.y;
          const duration = (performance.now() - this.dragStart.time) / 1000;

          if (Math.hypot(dx, dy) >= 15) {
            this.kickPlayerShot(dx, dy, duration);
          }
          this.dragStart = null;
          this.dragCurrent = null;
        }
      };

      this.canvas.addEventListener('mousedown', onPointerDown);
      window.addEventListener('mousemove', onPointerMove);
      window.addEventListener('mouseup', onPointerUp);

      this.canvas.addEventListener('touchstart', onPointerDown, { passive: false });
      window.addEventListener('touchmove', onPointerMove, { passive: false });
      window.addEventListener('touchend', onPointerUp, { passive: false });
    }

    startLoop() {
      const step = (t) => {
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
    PenaltyKickGame
  };
});
