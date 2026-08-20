import type { Palette } from "./palettes";
import { rgba, mixCol } from "./palettes";
import { fbm, rnd, noise1 } from "./noise";
import type { Obstacle } from "./types";

const TREE_SOURCES = ["/tree.png", "/tree1.png", "/tree2.png", "/tree3.png"];
let treeImages: (HTMLImageElement | null)[] = [];
if (typeof document !== "undefined") {
  treeImages = TREE_SOURCES.map((src) => {
    const img = new Image();
    img.src = src;
    return img;
  });
}

/**
 * Downscale the huge tree photos once into small sprites so the render loop
 * never pays the cost of scaling a multi-megabyte image every frame.
 */
const treeSprites: (HTMLCanvasElement | null)[] = [];
function treeSprite(i: number): HTMLCanvasElement | null {
  if (treeSprites[i]) return treeSprites[i];
  const img = treeImages[i];
  if (!img || !(img.complete && img.naturalWidth > 0)) return null;
  const MAX = 200;
  const aspect = img.naturalWidth / img.naturalHeight;
  let w = MAX;
  let h = MAX;
  if (aspect > 1) h = MAX / aspect;
  else w = MAX * aspect;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const g = c.getContext("2d");
  if (!g) return null;
  g.drawImage(img, 0, 0, c.width, c.height);
  treeSprites[i] = c;
  return c;
}

// Static realistic environment backdrop (bgenv.png) sitting just behind the trees.
let bgImage: HTMLImageElement | null = null;
if (typeof document !== "undefined") {
  bgImage = new Image();
  bgImage.src = "/bgenv.png";
}

let bgSprite: HTMLCanvasElement | null = null;
function bgEnvSprite(): HTMLCanvasElement | null {
  if (bgSprite) return bgSprite;
  if (!bgImage || !(bgImage.complete && bgImage.naturalWidth > 0)) return null;
  const BGW = 1280;
  const aspect = bgImage.naturalWidth / bgImage.naturalHeight;
  const H = Math.max(1, Math.round(BGW / aspect));
  const c = document.createElement("canvas");
  c.width = BGW;
  c.height = H;
  const g = c.getContext("2d");
  if (!g) return null;
  g.drawImage(bgImage, 0, 0, BGW, H);
  bgSprite = c;
  return c;
}

/** Draws the static realistic backdrop just behind the tree line. It never scrolls. */
export function drawBgEnv(ctx: CanvasRenderingContext2D, W: number, groundY: number) {
  const sprite = bgEnvSprite();
  if (!sprite) return;
  const aspect = sprite.width / sprite.height;
  const dw = W;
  const dh = dw / aspect;
  // anchor the horizon of the backdrop at the waterline (below gets covered by water)
  const dy = groundY - dh + 90;
  ctx.drawImage(sprite, 0, dy, dw, dh);
}

// Realistic sky photo used as the background. The game's procedural sun is
// drawn on top of it inside drawSky, so the photo replaces only the gradient.
let skyImage: HTMLImageElement | null = null;
if (typeof document !== "undefined") {
  skyImage = new Image();
  skyImage.src = "/sky.jpg";
}

let skySpriteC: HTMLCanvasElement | null = null;
function skySprite(): HTMLCanvasElement | null {
  if (skySpriteC) return skySpriteC;
  if (!skyImage || !(skyImage.complete && skyImage.naturalWidth > 0)) return null;
  const SW = 1440;
  const SH = Math.max(1, Math.round((SW / skyImage.naturalWidth) * skyImage.naturalHeight));
  const c = document.createElement("canvas");
  c.width = SW;
  c.height = SH;
  const g = c.getContext("2d");
  if (!g) return null;
  g.drawImage(skyImage, 0, 0, SW, SH);
  skySpriteC = c;
  return c;
}

/**
 * Fires once the sky photo has decoded so baked background layers can refresh
 * (the backdrop is pre-rendered at construction, possibly before the image).
 */
export function onSkyReady(cb: () => void) {
  if (!skyImage) return;
  const done = () => cb();
  skyImage.onload = done;
  if (skyImage.complete && skyImage.naturalWidth > 0) done();
}

export function drawSky(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  p: Palette,
  time: number,
) {
  const sprite = skySprite();
  if (sprite) {
    // cover-fill the sky photo to the whole skybox, cropping the overflow
    const imgAspect = sprite.width / sprite.height;
    const screenAspect = W / H;
    let dw: number;
    let dh: number;
    let dx = 0;
    let dy = 0;
    if (imgAspect > screenAspect) {
      dh = H;
      dw = dh * imgAspect;
      dx = (W - dw) / 2;
    } else {
      dw = W;
      dh = dw / imgAspect;
      dy = (H - dh) / 2;
    }
    ctx.drawImage(sprite, dx, dy, dw, dh);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgba(p.skyTop));
    g.addColorStop(0.52, rgba(p.skyMid));
    g.addColorStop(1, rgba(p.skyBottom));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // stars
  if (p.starAlpha > 0.02) {
    for (let i = 0; i < 90; i++) {
      const x = rnd(i, 1) * W;
      const y = rnd(i, 2) * H * 0.55;
      const tw = 0.45 + 0.55 * Math.abs(Math.sin(time * (0.6 + rnd(i, 3)) + i));
      ctx.fillStyle = `rgba(255,255,255,${p.starAlpha * tw * (0.35 + rnd(i, 4) * 0.65)})`;
      const s = 0.7 + rnd(i, 5) * 1.3;
      ctx.fillRect(x, y, s, s);
    }
  }

  // sun / moon with layered glow
  const sx = p.sunX * W;
  const sy = p.sunY * H * 0.72;
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, H * 0.62);
  glow.addColorStop(0, rgba(p.sunGlow, 0.55));
  glow.addColorStop(0.35, rgba(p.sunGlow, 0.18));
  glow.addColorStop(1, rgba(p.sunGlow, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = rgba(p.sun, 0.92);
  ctx.beginPath();
  ctx.arc(sx, sy, H * 0.045, 0, Math.PI * 2);
  ctx.fill();
}

export function drawClouds(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  scroll: number,
  p: Palette,
) {
  const par = 0.06;
  const span = 620;
  const count = Math.ceil(W / span) + 3;
  const off = (scroll * par) % span;
  for (let i = -1; i < count; i++) {
    const slot = Math.floor((scroll * par) / span) + i;
    const x = i * span - off + rnd(slot, 7) * 220;
    const y = H * (0.08 + rnd(slot, 8) * 0.34);
    const s = 0.7 + rnd(slot, 9) * 1.5;
    const a = 0.12 + rnd(slot, 10) * 0.22;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s * 0.62);
    const gr = ctx.createLinearGradient(0, -60, 0, 50);
    gr.addColorStop(0, rgba(p.fog, a * 1.4));
    gr.addColorStop(1, rgba(p.fog, a * 0.25));
    ctx.fillStyle = gr;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const cx = (k - 2.5) * 52;
      const cy = Math.sin(k * 1.7 + slot) * 18;
      ctx.ellipse(
        cx,
        cy,
        64 + rnd(slot, 11 + k) * 40,
        34 + rnd(slot, 20 + k) * 22,
        0,
        0,
        Math.PI * 2,
      );
    }
    ctx.fill();
    ctx.restore();
  }
}

/** Infinite procedural ridge line. */
function ridge(
  ctx: CanvasRenderingContext2D,
  W: number,
  baseY: number,
  scroll: number,
  par: number,
  amp: number,
  wavelength: number,
  color: string,
  step = 8,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-2, baseY + 400);
  for (let x = -2; x <= W + step; x += step) {
    const wx = (scroll * par + x) / wavelength;
    const h = (fbm(wx, 4) - 0.35) * amp;
    ctx.lineTo(x, baseY - h);
  }
  ctx.lineTo(W + step, baseY + 400);
  ctx.closePath();
  ctx.fill();
}

export function drawMountains(
  ctx: CanvasRenderingContext2D,
  W: number,
  groundY: number,
  scroll: number,
  p: Palette,
) {
  // far range with snow/light rim
  ridge(ctx, W, groundY - 56, scroll, 0.055, 300, 210, rgba(p.far, 0.72), 10);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ridge(ctx, W, groundY - 62, scroll, 0.055, 300, 210, rgba(p.rim, 0.05), 10);
  ctx.restore();
  // mid range
  ridge(ctx, W, groundY - 28, scroll, 0.13, 190, 150, rgba(p.mid, 0.9), 8);
  // near dark range
  ridge(ctx, W, groundY - 6, scroll, 0.26, 96, 96, rgba(p.near, 0.95), 6);
}

/** Vegetation band behind the play line, drawn with the real tree sprites. */
export function drawVegetation(
  ctx: CanvasRenderingContext2D,
  W: number,
  groundY: number,
  scroll: number,
  p: Palette,
  time: number,
) {
  const par = 0.42;
  const span = 210;
  const off = (scroll * par) % span;
  const count = Math.ceil(W / span) + 2;
  for (let i = -1; i < count; i++) {
    const slot = Math.floor((scroll * par) / span) + i;
    const x = i * span - off + rnd(slot, 41) * 160;
    const depth = rnd(slot, 42); // 0..1 — closer = bigger, more contrast
    const h = 46 + depth * 180; // big and small trees
    const sway = Math.sin(time * 0.9 + slot) * 0.03;
    const lift = (1 - depth) * 8; // distant trees sit slightly higher

    ctx.save();
    ctx.translate(x, groundY - 2 - lift);
    ctx.rotate(sway);

    const sprite = treeSprite(Math.floor(rnd(slot, 43) * TREE_SOURCES.length));
    if (sprite) {
      // Atmospheric depth: distant trees fade so they melt into the scene instead of floating on top
      ctx.globalAlpha = 0.7 + depth * 0.3;
      const aspect = sprite.width / sprite.height;
      const w = h * aspect;
      ctx.drawImage(sprite, -w / 2, -h, w, h);
      ctx.globalAlpha = 1;
    } else {
      // fallback silhouette until the sprites are ready
      ctx.fillStyle = rgba(p.veg, 0.85);
      ctx.beginPath();
      ctx.moveTo(-h * 0.12, 0);
      ctx.lineTo(-h * 0.06, -h);
      ctx.lineTo(h * 0.08, -h * 0.86);
      ctx.lineTo(h * 0.14, 0);
      ctx.closePath();
      ctx.fill();
    }

    // soft grounding shadow on near trees so they sit on the shore instead of floating
    if (depth > 0.55) {
      ctx.fillStyle = "rgba(0,40,60,0.25)";
      ctx.beginPath();
      ctx.ellipse(0, 4, h * 0.22, h * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

export function drawGround(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  groundY: number,
  scroll: number,
  p: Palette,
  isWater: boolean = false,
  time: number = 0,
) {
  if (isWater) {
    // Draw multiple parallax wave layers that fill the screen below groundY
    const waveLayers = 3;
    for (let l = 0; l < waveLayers; l++) {
      const factor = l / (waveLayers - 1); // 0.0 -> 1.0
      const waveSpeed = scroll * (0.4 + factor * 0.8);
      const yBase = groundY - 6 + factor * (H - groundY + 10);
      const waveHeight = 4 + factor * 8;

      ctx.beginPath();
      ctx.moveTo(0, H + 10);
      for (let x = -20; x <= W + 20; x += 28) {
        const y =
          yBase +
          Math.sin(x * 0.015 + time * 3 + l * 2 - waveSpeed * 0.02) * waveHeight +
          Math.cos(x * 0.03 - time * 2 + waveSpeed * 0.01) * waveHeight * 0.4;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W + 20, H + 10);
      ctx.closePath();

      // Gradient blending from top to bottom
      const waveGrad = ctx.createLinearGradient(
        0,
        yBase - waveHeight * 2,
        0,
        yBase + (H - yBase) * 0.8,
      );
      const topCol = mixCol(p.groundTop, p.groundBottom, factor * 0.4);
      const botCol = mixCol(p.groundTop, p.groundBottom, factor * 0.7 + 0.3);

      waveGrad.addColorStop(0, rgba(topCol, 0.9));
      waveGrad.addColorStop(1, rgba(botCol, 1));
      ctx.fillStyle = waveGrad;
      ctx.fill();

      // Edge foam for each wave layer
      ctx.strokeStyle = rgba(p.rim, 0.2 + factor * 0.4);
      ctx.lineWidth = 1.5 + factor * 2;
      ctx.stroke();
    }
    return;
  }

  const g = ctx.createLinearGradient(0, groundY - 10, 0, H);
  g.addColorStop(0, rgba(p.groundTop));
  g.addColorStop(0.35, rgba(p.groundTop, 0.92));
  g.addColorStop(1, rgba(p.groundBottom));
  ctx.fillStyle = g;
  ctx.fillRect(0, groundY - 4, W, H - groundY + 8);

  // lit crest line
  ctx.strokeStyle = rgba(p.rim, 0.4);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 6) {
    const y = groundY - 3 + noise1((scroll + x) / 34) * 3;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // scattered pebbles / cracks (parallax 1.0)
  const span = 46;
  const off = scroll % span;
  const count = Math.ceil(W / span) + 2;
  for (let i = -1; i < count; i++) {
    const slot = Math.floor(scroll / span) + i;
    const x = i * span - off + rnd(slot, 51) * 40;
    const y = groundY + 8 + rnd(slot, 52) * (H - groundY - 14);
    const s = 1.5 + rnd(slot, 53) * 4.5;
    ctx.fillStyle = rgba(p.rock, 0.5 + rnd(slot, 54) * 0.4);
    ctx.beginPath();
    ctx.ellipse(x, y, s, s * 0.62, rnd(slot, 55) * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(p.rim, 0.16);
    ctx.beginPath();
    ctx.ellipse(x - s * 0.3, y - s * 0.3, s * 0.5, s * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // fast foreground grass tufts
  const fspan = 120;
  const foff = (scroll * 1.28) % fspan;
  const fcount = Math.ceil(W / fspan) + 2;
  for (let i = -1; i < fcount; i++) {
    const slot = Math.floor((scroll * 1.28) / fspan) + i;
    const x = i * fspan - foff + rnd(slot, 61) * 90;
    const h = 10 + rnd(slot, 62) * 22;
    ctx.strokeStyle = rgba(p.veg, 0.75);
    ctx.lineWidth = 2;
    for (let b = 0; b < 5; b++) {
      const a = -Math.PI / 2 + (b - 2) * 0.22;
      ctx.beginPath();
      ctx.moveTo(x + b, groundY + 12);
      ctx.lineTo(x + b + Math.cos(a) * h * 0.5, groundY + 12 + Math.sin(a) * h);
      ctx.stroke();
    }
  }
}

export function drawFog(
  ctx: CanvasRenderingContext2D,
  W: number,
  groundY: number,
  p: Palette,
  time: number,
  scroll: number,
) {
  for (let layer = 0; layer < 2; layer++) {
    const yy = groundY - 34 + layer * 16;
    const a = (0.1 + layer * 0.045) * p.fogStrength;
    const grad = ctx.createLinearGradient(0, yy - 40, 0, yy + 30);
    grad.addColorStop(0, rgba(p.fog, 0));
    grad.addColorStop(0.6, rgba(p.fog, a));
    grad.addColorStop(1, rgba(p.fog, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, yy + 34);
    for (let x = 0; x <= W; x += 22) {
      const wob =
        Math.sin((x + scroll * (0.08 + layer * 0.05)) / 130 + time * (0.3 + layer * 0.2)) *
        (7 + layer * 4);
      ctx.lineTo(x, yy + wob);
    }
    ctx.lineTo(W, yy + 34);
    ctx.closePath();
    ctx.fill();
  }
}

export function drawObstacle(
  ctx: CanvasRenderingContext2D,
  o: Obstacle,
  p: Palette,
  groundY: number,
  isWater: boolean = false,
  time: number = 0,
) {
  ctx.save();

  if (isWater && o.kind !== "flyer" && o.kind !== "fish") {
    // Bob obstacles in water
    ctx.translate(0, Math.sin(o.x * 0.02 + time * 4) * 5 + 3);
  }

  // contact shadow
  if (!isWater && o.kind !== "flyer" && o.kind !== "fish") {
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath();
    ctx.ellipse(o.x + o.w / 2, groundY + 4, o.w * 0.72, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (o.kind === "spire") {
    const spikes = 1 + Math.floor(rnd(o.seed, 71) * 3);
    for (let i = 0; i < spikes; i++) {
      const sw = o.w / spikes;
      const bx = o.x + i * sw + sw / 2;
      const hh = o.h * (0.62 + rnd(o.seed, 72 + i) * 0.38);
      const grad = ctx.createLinearGradient(bx - sw / 2, 0, bx + sw / 2, 0);
      grad.addColorStop(0, rgba(p.rock, 1));
      grad.addColorStop(0.55, rgba(p.near, 1));
      grad.addColorStop(1, "rgba(12,10,10,1)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(bx - sw * 0.42, groundY + 2);
      ctx.lineTo(bx - sw * 0.2, groundY - hh);
      ctx.lineTo(bx + sw * 0.1, groundY - hh * 0.92);
      ctx.lineTo(bx + sw * 0.4, groundY + 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba(p.rim, 0.5);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(bx - sw * 0.42, groundY + 2);
      ctx.lineTo(bx - sw * 0.2, groundY - hh);
      ctx.stroke();
    }
  } else if (o.kind === "boulder") {
    const grad = ctx.createLinearGradient(o.x, o.y, o.x + o.w, o.y + o.h);
    grad.addColorStop(0, rgba(p.rock, 1));
    grad.addColorStop(1, "rgba(16,14,14,1)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h;
    ctx.moveTo(o.x, cy + 2);
    const pts = 6;
    for (let i = 0; i <= pts; i++) {
      const t = i / pts;
      const px = o.x + t * o.w;
      const py = cy - Math.sin(t * Math.PI) * o.h * (0.75 + rnd(o.seed, 80 + i) * 0.4);
      ctx.lineTo(px, py);
    }
    ctx.lineTo(o.x + o.w, cy + 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba(p.rim, 0.42);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(o.x + o.w * 0.1, cy - o.h * 0.3);
    ctx.quadraticCurveTo(cx - o.w * 0.1, o.y - 2, o.x + o.w * 0.6, cy - o.h * 0.5);
    ctx.stroke();
  } else if (o.kind === "log") {
    const grad = ctx.createLinearGradient(0, o.y, 0, o.y + o.h);
    grad.addColorStop(0, rgba(p.rock, 1));
    grad.addColorStop(1, "rgba(20,16,14,1)");
    ctx.fillStyle = grad;
    const r = o.h / 2;
    ctx.beginPath();
    ctx.moveTo(o.x + r, o.y);
    ctx.lineTo(o.x + o.w - r, o.y);
    ctx.arc(o.x + o.w - r, o.y + r, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(o.x + r, o.y + o.h);
    ctx.arc(o.x + r, o.y + r, r, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba(p.rim, 0.35);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(o.x + r, o.y + 1.5);
    ctx.lineTo(o.x + o.w - r, o.y + 1.5);
    ctx.stroke();
    // broken branch stubs
    ctx.strokeStyle = rgba(p.near, 1);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(o.x + o.w * 0.35, o.y + r);
    ctx.lineTo(o.x + o.w * 0.28, o.y - 9);
    ctx.stroke();
  } else if (o.kind === "flyer") {
    // flyer: pterosaur silhouette
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    const flap = Math.sin(o.flap) * 0.9;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = rgba(p.near, 1);
    ctx.strokeStyle = rgba(p.near, 1);
    ctx.lineCap = "round";
    // body
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 6, 0.05, 0, Math.PI * 2);
    ctx.fill();
    // head + crest + beak
    ctx.beginPath();
    ctx.moveTo(10, -3);
    ctx.lineTo(30, -1);
    ctx.lineTo(10, 3);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(8, -4);
    ctx.lineTo(2, -14);
    ctx.lineTo(14, -6);
    ctx.closePath();
    ctx.fill();
    // wings
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-2, -1);
      ctx.quadraticCurveTo(-20, dir * (10 + flap * 16), -44, dir * (4 + flap * 26));
      ctx.quadraticCurveTo(-22, dir * (2 + flap * 8), -4, 3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = rgba(p.rim, 0.45);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-2, -2);
    ctx.quadraticCurveTo(-22, -10 - flap * 16, -44, -4 - flap * 26);
    ctx.stroke();
    ctx.restore();
  } else if (o.kind === "fish") {
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    const flap = Math.sin(o.flap) * 0.5; // used for tail wiggle
    ctx.save();
    ctx.translate(cx, cy);

    // Determine jump arc angle for rotation
    // As fish flies leftward and arcs, angle adjusts based on height vs ground
    const arcHeight = groundY - cy;
    const angle = (o.h / (arcHeight + 10)) * 0.5;
    ctx.rotate(-angle + flap * 0.2);

    ctx.fillStyle = rgba(p.skyMid, 1); // Blue/Cyan body
    ctx.strokeStyle = rgba(p.skyTop, 1);
    ctx.lineCap = "round";

    // Body (torpedo shape)
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tail
    ctx.fillStyle = rgba(p.sunGlow, 1);
    ctx.beginPath();
    ctx.moveTo(-15, 0);
    ctx.lineTo(-26, -10 + flap * 4);
    ctx.lineTo(-24, 0);
    ctx.lineTo(-26, 10 + flap * 4);
    ctx.closePath();
    ctx.fill();

    // Fin
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(-8, -16);
    ctx.lineTo(-10, -8);
    ctx.closePath();
    ctx.fill();

    // Eye
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(10, -3, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.arc(11, -3, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
  ctx.restore();
}
