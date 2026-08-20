import { GameAudio } from "./audio";
import { type DinoPose } from "./dino";
import { drawBoat } from "./boat";
import { clamp, rnd } from "./noise";
import { PALETTES, lerpPalette, rgba, type Palette } from "./palettes";
import type { GameStatus, Obstacle, Particle, Stats, CharacterType } from "./types";
import {
  drawBgEnv,
  drawClouds,
  drawFog,
  drawGround,
  drawMountains,
  drawObstacle,
  drawSky,
  drawVegetation,
  onSkyReady,
} from "./world";

const VH = 540; // virtual height; everything is authored against it
const GROUND_Y = 412;
const GRAVITY = 3000;
const JUMP_V = -1080;
const DINO_X = 190;
const BEST_KEY = "primalrun.best.v1";

export class DinoGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private audio: GameAudio;
  private onStats: (s: Stats) => void;

  private raf = 0;
  private lastT = 0;
  private scale = 1;
  private W = 960;
  private H = VH;
  private dpr = 1;

  // Pre-baked static layers so the per-frame cost of the sky (full-screen
  // gradient + glow) and the atmospheric grade (haze + vignette) is a single
  // blit instead of several expensive full-screen gradient fills.
  private backdrop: HTMLCanvasElement | null = null;
  private overlay: HTMLCanvasElement | null = null;

  private character: CharacterType = "boat";

  private status: GameStatus = "ready";
  private time = 0;
  private scroll = 0;
  private speed = 430;
  private score = 0;
  private distance = 0;
  private best = 0;
  private bestDistance = 0;
  private shake = 0;
  private flash = 0;
  private deathT = 0;
  private nextMilestone = 500;

  private biomeIdx = 4;
  private biomeFrom = 4;
  private biomeMix = 1;
  private biomeBanner = 0;

  private dinoY = GROUND_Y;
  private dinoVY = 0;
  private onGround = true;
  private ducking = false;
  private jumpHeld = false;
  private phase = 0;
  private lastStepPhase = 0;

  private obstacles: Obstacle[] = [];
  private particles: Particle[] = [];
  private nextSpawn = 900;

  private fpsAcc = 0;
  private fpsFrames = 0;
  private fps = 60;
  private statAcc = 0;

  constructor(canvas: HTMLCanvasElement, audio: GameAudio, onStats: (s: Stats) => void) {
    this.canvas = canvas;
    this.audio = audio;
    this.onStats = onStats;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D is not available in this browser.");
    this.ctx = ctx;

    for (let i = 0; i < 40; i++)
      this.obstacles.push({
        active: false,
        kind: "spire",
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        seed: 0,
        flap: 0,
        passed: false,
      });
    for (let i = 0; i < 320; i++)
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        max: 1,
        size: 1,
        spin: 0,
        rot: 0,
        kind: "dust",
      });

    try {
      const raw = localStorage.getItem(BEST_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { score?: number; distance?: number };
        this.best = parsed.score ?? 0;
        this.bestDistance = parsed.distance ?? 0;
      }
    } catch {
      /* storage unavailable — play without persistence */
    }

    this.resize();
    onSkyReady(() => {
      // the sky photo decoded after construction — refresh the baked backdrop
      this.bakeBackdrop();
    });
    this.emit();
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ---------- lifecycle ----------

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.max(320, rect.width || 960);
    const cssH = Math.max(240, rect.height || 540);
    // Aggressive internal-resolution caps: phones render at 1x, desktop at 1.5x.
    // This massively cuts the pixels every frame has to repaint (fill-rate is
    // THE bottleneck for canvas-2D games, not asset size). Visual quality stays
    // high because the scene is vector/gradient based, not pixel based.
    const maxDpr = cssW < 640 ? 1 : 1.5;
    this.dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.scale = cssH / VH;
    this.H = VH;
    this.W = cssW / this.scale;
    this.bakeBackdrop();
    this.bakeOverlay();
  }

  /**
   * Render the static sky (gradient + sun/moon glow + stars) once into an
   * offscreen canvas at virtual resolution, then blit it every frame. Saves a
   * full-screen radial gradient + linear gradient + sun arc per frame.
   */
  private bakeBackdrop() {
    const W = Math.max(1, Math.round(this.W));
    const H = Math.max(1, Math.round(this.H + 20));
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    if (!g) return;
    drawSky(g, W, H, PALETTES[4]!, 0);
    this.backdrop = c;
  }

  /**
   * Render the atmospheric grade (haze gradient + vignette) once per resize —
   * both are fully static in screen space — then blit per frame.
   */
  private bakeOverlay() {
    const W = Math.max(1, Math.round(this.W));
    const H = Math.max(1, Math.round(this.H));
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    if (!g) return;
    const p = PALETTES[4]!;
    const haze = g.createLinearGradient(0, 0, 0, H);
    haze.addColorStop(0, rgba(p.fog, 0.05));
    haze.addColorStop(0.7, rgba(p.fog, 0.02));
    haze.addColorStop(1, rgba(p.groundBottom, 0.14));
    g.fillStyle = haze;
    g.fillRect(0, 0, W, H);
    const vig = g.createRadialGradient(W * 0.5, H * 0.5, H * 0.28, W * 0.5, H * 0.52, H * 0.95);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.42)");
    g.fillStyle = vig;
    g.fillRect(0, 0, W, H);
    this.overlay = c;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
  }

  private emit() {
    this.onStats({
      status: this.status,
      score: Math.floor(this.score),
      distance: Math.floor(this.distance),
      speed: this.speed,
      best: Math.floor(this.best),
      bestDistance: Math.floor(this.bestDistance),
      biome: this.palette().name,
      biomeTagline: this.palette().tagline,
      fps: Math.round(this.fps),
      loading: false,
    });
  }

  getStatus() {
    return this.status;
  }

  start() {
    this.reset();
    this.status = "playing";
    this.audio.click();
    this.emit();
  }

  restart() {
    this.start();
  }

  togglePause() {
    if (this.status === "playing") {
      this.status = "paused";
      this.audio.click();
    } else if (this.status === "paused") {
      this.status = "playing";
      this.audio.click();
    }
    this.emit();
  }

  private reset() {
    this.scroll = 0;
    this.speed = 430;
    this.score = 0;
    this.distance = 0;
    this.deathT = 0;
    this.shake = 0;
    this.flash = 0;
    this.nextMilestone = 500;
    this.dinoY = GROUND_Y;
    this.dinoVY = 0;
    this.onGround = true;
    this.ducking = false;
    this.phase = 0;
    this.nextSpawn = 700;
    this.biomeIdx = 4;
    this.biomeFrom = this.biomeIdx;
    this.biomeMix = 1;
    this.biomeBanner = 2.4;
    for (const o of this.obstacles) o.active = false;
    for (const q of this.particles) q.active = false;
  }

  // ---------- input ----------

  pressJump() {
    if (this.status === "ready") {
      this.start();
      return;
    }
    if (this.status === "over") {
      if (this.deathT > 0.6) this.restart();
      return;
    }
    if (this.status !== "playing") return;
    this.jumpHeld = true;
    if (this.onGround) {
      this.dinoVY = JUMP_V;
      this.onGround = false;
      this.ducking = false;
      this.audio.jump("boat");
      this.burst(DINO_X - 6, GROUND_Y, 12, "water", 1);
    }
  }

  releaseJump() {
    this.jumpHeld = false;
    if (this.dinoVY < -360) this.dinoVY = -360; // variable jump height
  }

  setDuck(on: boolean) {
    if (this.status !== "playing") return;
    if (on && !this.ducking) {
      this.audio.duck("boat");
      if (!this.onGround) this.dinoVY += 420; // fast-fall
      this.burst(DINO_X - 20, GROUND_Y, 5, "water", 0.6);
    }
    this.ducking = on;
  }

  // ---------- world helpers ----------

  private palette(): Palette {
    const from = PALETTES[this.biomeFrom % PALETTES.length] ?? PALETTES[0]!;
    const to = PALETTES[this.biomeIdx % PALETTES.length] ?? PALETTES[0]!;
    return this.biomeMix >= 1 ? to : lerpPalette(from, to, this.biomeMix);
  }

  private spawnObstacle() {
    const o = this.obstacles.find((x) => !x.active);
    if (!o) return;
    const seed = Math.floor(this.scroll) + Math.floor(Math.random() * 9999);
    let r = Math.random();
    const difficulty = clamp((this.speed - 430) / 700, 0, 1);
    if (this.distance < 140) r = Math.min(r, 0.77); // no flyers in the opening stretch
    o.active = true;
    o.seed = seed;
    o.passed = false;
    o.flap = Math.random() * 6;
    o.x = this.W + 80;

    if (this.character === "boat") {
      // Boat uses specialized obstacles: buoys (boulder), rocks (spire), and fish
      if (r < 0.4) {
        o.kind = "spire"; // Rock outcroppings
        o.w = 30 + Math.random() * 50;
        o.h = 40 + Math.random() * 50;
        o.y = GROUND_Y - o.h;
      } else if (r < 0.65) {
        o.kind = "boulder"; // Buoys
        o.w = 40 + Math.random() * 30;
        o.h = 30 + Math.random() * 20;
        o.y = GROUND_Y - o.h;
      } else {
        o.kind = "fish"; // Jumping Fish
        o.w = 40;
        o.h = 24;
        // Fish jump out of water towards the player
        o.y = GROUND_Y - 40 - Math.random() * 60;
      }
    }

    const base = this.speed * (0.95 - difficulty * 0.24);
    this.nextSpawn = base + Math.random() * this.speed * 0.6 + o.w;
  }

  private burst(x: number, y: number, n: number, kind: Particle["kind"], power = 1) {
    for (let i = 0; i < n; i++) {
      const q = this.particles.find((z) => !z.active);
      if (!q) return;
      q.active = true;
      q.kind = kind;
      q.x = x + (Math.random() - 0.5) * 16;
      q.y = y + (Math.random() - 0.5) * 6;
      const spread = kind === "debris" ? 320 : 130;
      q.vx = -this.speed * 0.22 - Math.random() * spread * power;
      q.vy = -Math.random() * 150 * power - 20;
      if (kind === "water") {
        q.vy -= 150 * power; // extra upward kick
        q.vx *= 0.5; // less horizontal spread
      }
      q.max = kind === "debris" ? 0.9 + Math.random() * 0.7 : 0.5 + Math.random() * 0.7;
      q.life = q.max;
      q.size = kind === "debris" ? 2 + Math.random() * 4 : 3 + Math.random() * 9;
      q.rot = Math.random() * 6;
      q.spin = (Math.random() - 0.5) * 8;
    }
  }

  private ambientMote() {
    const q = this.particles.find((z) => !z.active);
    if (!q) return;
    q.active = true;
    q.kind = "mote";
    q.x = this.W + 10;
    q.y = 120 + Math.random() * (GROUND_Y - 60);
    q.vx = -this.speed * (0.35 + Math.random() * 0.5);
    q.vy = (Math.random() - 0.5) * 22;
    q.max = 3 + Math.random() * 2.5;
    q.life = q.max;
    q.size = 1 + Math.random() * 2.4;
    q.rot = 0;
    q.spin = 0;
  }

  private dinoBox() {
    if (this.ducking && this.onGround) return { x: DINO_X - 40, y: this.dinoY - 30, w: 80, h: 30 };
    return { x: DINO_X - 40, y: this.dinoY - 42, w: 80, h: 42 };
  }

  private die() {
    this.status = "over";
    this.deathT = 0;
    this.shake = 22;
    this.flash = 0.55;
    this.audio.crash();
    this.burst(DINO_X, this.dinoY - 28, 34, "debris", 1.6);
    if (this.score > this.best) this.best = this.score;
    if (this.distance > this.bestDistance) this.bestDistance = this.distance;
    try {
      localStorage.setItem(
        BEST_KEY,
        JSON.stringify({ score: Math.floor(this.best), distance: Math.floor(this.bestDistance) }),
      );
    } catch {
      /* ignore */
    }
    this.emit();
  }

  // ---------- loop ----------

  private frame = (t: number) => {
    this.raf = requestAnimationFrame(this.frame);
    let dt = (t - this.lastT) / 1000;
    this.lastT = t;
    if (!Number.isFinite(dt)) dt = 0.016;
    dt = Math.min(dt, 1 / 25);

    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc > 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }

    this.update(dt);
    this.render();

    this.statAcc += dt;
    if (this.statAcc > 0.1) {
      this.statAcc = 0;
      this.emit();
    }
  };

  private update(dt: number) {
    this.time += dt;
    const playing = this.status === "playing";
    const attract = this.status === "ready";

    if (this.status === "over") this.deathT = Math.min(1, this.deathT + dt * 2.2);

    // world scroll (attract mode drifts slowly for a living menu backdrop)
    const scrollSpeed = playing ? this.speed : attract ? 150 : 0;
    this.scroll += scrollSpeed * dt;

    if (playing) {
      this.speed = Math.min(1180, this.speed + dt * 8.5);
      this.distance += (this.speed * dt) / 13;
      this.score += (this.speed * dt) / 9;
      this.audio.setWind(clamp((this.speed - 430) / 750, 0, 1));

      if (this.score >= this.nextMilestone) {
        this.nextMilestone += 500;
        this.audio.milestone();
        this.flash = Math.max(this.flash, 0.12);
      }
    }
    if (this.biomeMix < 1) this.biomeMix = Math.min(1, this.biomeMix + dt / 3.4);
    if (this.biomeBanner > 0) this.biomeBanner = Math.max(0, this.biomeBanner - dt);

    // dino physics
    if (playing) {
      const g = this.dinoVY > 0 || !this.jumpHeld ? GRAVITY * 1.18 : GRAVITY;
      if (!this.onGround) {
        this.dinoVY += g * dt;
        this.dinoY += this.dinoVY * dt;
        if (this.dinoY >= GROUND_Y) {
          const impact = this.dinoVY;
          this.dinoY = GROUND_Y;
          this.dinoVY = 0;
          this.onGround = true;
          this.audio.land("boat");
          this.shake = Math.min(9, 2 + impact / 220);
          this.burst(DINO_X - 4, GROUND_Y, 16, "water", 1.3);
        }
      }

      // run cycle + footstep particles/sfx
      if (this.onGround) {
        const rate = (this.speed / 150) * (this.ducking ? 1.25 : 1);
        this.phase += dt * rate * 3.4;
        if (Math.floor(this.phase / Math.PI) !== Math.floor(this.lastStepPhase / Math.PI)) {
          this.audio.footstep(!this.ducking, "boat");
          this.burst(DINO_X - 10, GROUND_Y, 4, "water", 0.7);
          this.shake = Math.max(this.shake, 1.1);
        }
        this.lastStepPhase = this.phase;
      }

      // obstacles
      this.nextSpawn -= this.speed * dt;
      if (this.nextSpawn <= 0) this.spawnObstacle();

      const box = this.dinoBox();
      for (const o of this.obstacles) {
        if (!o.active) continue;
        const drift = o.kind === "flyer" ? this.speed * 0.22 : 0;
        o.x -= (this.speed + drift) * dt;
        if (o.kind === "flyer") o.flap += dt * 11;
        if (o.x + o.w < -120) {
          o.active = false;
          continue;
        }
        const pad = o.kind === "flyer" || o.kind === "fish" ? 10 : 5;
        const ox = o.x + pad;
        const ow = o.w - pad * 2;
        const oy = o.y + pad * 0.4;
        const oh = o.h - pad * 0.6;
        if (box.x < ox + ow && box.x + box.w > ox && box.y < oy + oh && box.y + box.h > oy) {
          this.die();
          break;
        }
        if (!o.passed && o.x + o.w < box.x) {
          o.passed = true;
          this.score += 25;
        }
      }
    } else if (attract) {
      this.phase += dt * 3.6;
    }

    // particles
    if (Math.random() < (playing ? 0.14 : 0.08)) this.ambientMote();
    for (const q of this.particles) {
      if (!q.active) continue;
      q.life -= dt;
      if (q.life <= 0) {
        q.active = false;
        continue;
      }
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.rot += q.spin * dt;
      if (q.kind === "debris") q.vy += 900 * dt;
      else if (q.kind === "dust") {
        q.vy -= 40 * dt;
        q.vx *= 1 - dt * 1.6;
      } else if (q.kind === "water") {
        q.vy += 1200 * dt; // heavy gravity for splashes
        q.vx *= 1 - dt * 1.2;
      }
      if (q.x < -60) q.active = false;
    }

    this.shake = Math.max(0, this.shake - dt * 34);
    this.flash = Math.max(0, this.flash - dt * 1.5);

    // Audio Continuous Updates
    let engineState: "ground" | "air" | "duck" | "dead" = "ground";
    if (this.status === "over") engineState = "dead";
    else if (!this.onGround) engineState = "air";
    else if (this.ducking) engineState = "duck";
    this.audio.updateEngine(this.character, this.speed, engineState);
  }

  private render() {
    const ctx = this.ctx;
    const p = this.palette();
    const W = this.W;
    const H = this.H;

    const isWater = true;

    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, 0, 0);

    // camera: shake + subtle vertical follow while airborne
    const camY = (GROUND_Y - this.dinoY) * 0.09;
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    ctx.save();
    ctx.translate(sx, sy + camY);

    if (this.backdrop) ctx.drawImage(this.backdrop, 0, 0, W, H + 20);
    else drawSky(ctx, W, H + 20, p, this.time);
    drawClouds(ctx, W, H, this.scroll, p);
    drawMountains(ctx, W, GROUND_Y, this.scroll, p);
    drawBgEnv(ctx, W, GROUND_Y);
    drawVegetation(ctx, W, GROUND_Y, this.scroll, p, this.time);
    drawFog(ctx, W, GROUND_Y, p, this.time, this.scroll);
    drawGround(ctx, W, H + 40, GROUND_Y, this.scroll, p, isWater, this.time);

    // background motes behind actors
    for (const q of this.particles) {
      if (!q.active || q.kind !== "mote") continue;
      const a = (q.life / q.max) * 0.3;
      ctx.fillStyle = rgba(p.dust, a);
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.size * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const o of this.obstacles) {
      if (!o.active) continue;
      drawObstacle(ctx, o, p, GROUND_Y, isWater, this.time);
    }

    // dino ground shadow
    const air = clamp((GROUND_Y - this.dinoY) / 190, 0, 1);
    ctx.fillStyle = `rgba(0,0,0,${0.36 * (1 - air * 0.7)})`;
    ctx.beginPath();
    ctx.ellipse(
      DINO_X - 2,
      GROUND_Y + 5,
      40 * (1 - air * 0.35),
      7 * (1 - air * 0.4),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    let pose: DinoPose = "run";
    if (this.status === "over") pose = "dead";
    else if (!this.onGround) pose = this.dinoVY < 0 ? "jump" : "fall";
    else if (this.ducking) pose = "duck";
    else if (this.status === "paused") pose = "idle";

    const drawState = {
      x: DINO_X,
      y: this.dinoY,
      pose,
      phase: this.phase,
      vy: this.dinoVY,
      scale: 1,
      deathT: this.deathT,
    };

    drawBoat(ctx, drawState, p);

    // foreground dust + debris
    for (const q of this.particles) {
      if (!q.active || q.kind === "mote") continue;
      const t = q.life / q.max;
      if (q.kind === "debris") {
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(q.rot);
        ctx.fillStyle = rgba(p.rock, 0.85 * t);
        ctx.fillRect(-q.size / 2, -q.size / 2, q.size, q.size * 0.7);
        ctx.restore();
      } else if (q.kind === "water") {
        ctx.fillStyle = "rgba(230, 250, 255, 0.6)";
        ctx.beginPath();
        // teardrop shape
        ctx.arc(q.x, q.y, q.size * 0.8 * t, 0, Math.PI);
        ctx.lineTo(q.x, q.y - q.size * 1.5 * t);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = rgba(p.dust, 0.2 * t);
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.size * (1.5 - t * 0.5) * 0.85, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();

    // atmospheric grade: warm haze + vignette (pre-baked, static in screen space)
    if (this.overlay) {
      ctx.drawImage(this.overlay, 0, 0, W, H);
    } else {
      const haze = ctx.createLinearGradient(0, 0, 0, H);
      haze.addColorStop(0, rgba(p.fog, 0.05));
      haze.addColorStop(0.7, rgba(p.fog, 0.02));
      haze.addColorStop(1, rgba(p.groundBottom, 0.14));
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, W, H);

      const vig = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.28, W * 0.5, H * 0.52, H * 0.95);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(0,0,0,0.42)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);
    }

    if (this.flash > 0) {
      ctx.fillStyle = rgba(p.rim, this.flash * 0.5);
      ctx.fillRect(0, 0, W, H);
    }

    // biome banner (drawn in-canvas so it sits inside the cinematic frame)
    if (this.biomeBanner > 0 && this.status === "playing") {
      const a = Math.min(1, this.biomeBanner / 0.8) * Math.min(1, (3.2 - this.biomeBanner) / 0.4);
      ctx.save();
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.textAlign = "center";
      ctx.fillStyle = rgba(p.sun, 0.95);
      ctx.font = "600 26px Rajdhani, system-ui, sans-serif";
      ctx.fillText(p.name.toUpperCase(), W / 2, 86);
      ctx.font = "400 14px Inter, system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.fillText(p.tagline, W / 2, 110);
      ctx.restore();
    }

    if (this.status === "paused") {
      ctx.fillStyle = "rgba(6,8,12,0.5)";
      ctx.fillRect(0, 0, W, H);
    }
    void rnd;
  }
}
