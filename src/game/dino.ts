import type { Palette } from "./palettes";
import { rgba } from "./palettes";

export type DinoPose = "run" | "jump" | "fall" | "duck" | "dead" | "idle";

export type DinoDrawState = {
  x: number;
  y: number; // feet baseline in world/screen coords
  pose: DinoPose;
  phase: number; // run cycle phase in radians
  vy: number;
  scale: number;
  deathT: number; // 0..1
};

const SKIN = { r: 62, g: 58, b: 46 };
const SKIN_DARK = { r: 32, g: 30, b: 24 };
const SKIN_LIGHT = { r: 104, g: 96, b: 72 };
const BELLY = { r: 126, g: 116, b: 88 };

function bodyGradient(ctx: CanvasRenderingContext2D, p: Palette) {
  const g = ctx.createLinearGradient(0, -78, 0, 4);
  g.addColorStop(0, rgba(SKIN_LIGHT, 1));
  g.addColorStop(0.45, rgba(SKIN, 1));
  g.addColorStop(1, rgba(SKIN_DARK, 1));
  void p;
  return g;
}

function drawLeg(
  ctx: CanvasRenderingContext2D,
  hipX: number,
  hipY: number,
  swing: number,
  lift: number,
  back: boolean,
) {
  const thigh = 24;
  const shin = 24;
  const kneeA = -1.2 + swing * 0.75;
  const kx = hipX + Math.cos(kneeA) * thigh;
  const ky = hipY - Math.sin(kneeA) * thigh + lift * 0.3;
  const ankleA = kneeA - 1.5 - swing * 0.5 + lift * 0.8;
  const ax = kx + Math.cos(ankleA) * shin;
  const ay = ky - Math.sin(ankleA) * shin;

  ctx.save();
  ctx.globalAlpha = back ? 0.62 : 1;
  ctx.lineCap = "round";
  ctx.strokeStyle = rgba(back ? SKIN_DARK : SKIN, 1);
  ctx.lineWidth = 13;
  ctx.beginPath();
  ctx.moveTo(hipX, hipY);
  ctx.lineTo(kx, ky);
  ctx.stroke();
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(kx, ky);
  ctx.lineTo(ax, ay);
  ctx.stroke();
  // foot with three toes
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax + 12, ay + 1);
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax + 6, ay + 3);
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax - 8, ay + 2);
  ctx.stroke();
  ctx.restore();
}

function drawArm(ctx: CanvasRenderingContext2D, x: number, y: number, a: number) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = rgba(SKIN_DARK, 1);
  ctx.lineWidth = 7;
  const ex = x + Math.cos(a) * 15;
  const ey = y - Math.sin(a) * 15;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex + 9, ey + 5);
  ctx.stroke();
  ctx.restore();
}

function drawHead(ctx: CanvasRenderingContext2D, p: Palette, jaw: number) {
  ctx.save();
  // skull
  ctx.fillStyle = rgba(SKIN, 1);
  ctx.beginPath();
  ctx.moveTo(-10, -8);
  ctx.quadraticCurveTo(4, -18, 26, -12);
  ctx.quadraticCurveTo(38, -9, 40, -2);
  ctx.quadraticCurveTo(30, 3, 14, 4);
  ctx.quadraticCurveTo(0, 5, -10, -8);
  ctx.closePath();
  ctx.fill();
  // brow ridge highlight
  ctx.strokeStyle = rgba(SKIN_LIGHT, 0.85);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-6, -11);
  ctx.quadraticCurveTo(10, -18, 28, -11);
  ctx.stroke();
  // lower jaw
  ctx.save();
  ctx.translate(-4, 1);
  ctx.rotate(jaw);
  ctx.fillStyle = rgba(SKIN_DARK, 1);
  ctx.beginPath();
  ctx.moveTo(-6, -2);
  ctx.quadraticCurveTo(14, 4, 40, 0);
  ctx.quadraticCurveTo(20, 12, -4, 7);
  ctx.closePath();
  ctx.fill();
  // teeth
  ctx.fillStyle = "rgba(238,232,214,0.92)";
  for (let i = 0; i < 5; i++) {
    const tx = 6 + i * 6.5;
    ctx.beginPath();
    ctx.moveTo(tx, 1);
    ctx.lineTo(tx + 3, 1);
    ctx.lineTo(tx + 1.5, -4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // upper teeth
  ctx.fillStyle = "rgba(240,234,216,0.85)";
  for (let i = 0; i < 4; i++) {
    const tx = 10 + i * 7;
    ctx.beginPath();
    ctx.moveTo(tx, 2);
    ctx.lineTo(tx + 3, 2);
    ctx.lineTo(tx + 1.5, 7);
    ctx.closePath();
    ctx.fill();
  }
  // eye
  ctx.fillStyle = "rgba(14,12,10,1)";
  ctx.beginPath();
  ctx.ellipse(11, -8, 3.6, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba(p.rim, 0.95);
  ctx.beginPath();
  ctx.ellipse(12.2, -9, 1.3, 1.1, 0, 0, Math.PI * 2);
  ctx.fill();
  // nostril
  ctx.fillStyle = "rgba(18,16,14,0.8)";
  ctx.beginPath();
  ctx.ellipse(33, -6, 1.6, 1.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Procedural, fully animated theropod. Origin = feet contact point. */
export function drawDino(ctx: CanvasRenderingContext2D, s: DinoDrawState, p: Palette) {
  const duck = s.pose === "duck";
  const airborne = s.pose === "jump" || s.pose === "fall";
  const dead = s.pose === "dead";

  const cyc = s.phase;
  const bob = airborne || dead ? 0 : Math.sin(cyc * 2) * 2.4;
  const bodyY = duck ? -30 : -46 + bob;
  const lean = duck ? 0.34 : airborne ? (s.vy < 0 ? -0.18 : 0.12) : 0.06 + Math.sin(cyc * 2) * 0.02;

  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.scale(s.scale, s.scale);
  if (dead) {
    ctx.translate(0, -6 * s.deathT);
    ctx.rotate(-0.9 * s.deathT);
  }

  // --- back leg (behind body) ---
  const swingA = Math.sin(cyc);
  const swingB = Math.sin(cyc + Math.PI);
  const hipY = duck ? -22 : -34;
  if (airborne) {
    drawLeg(ctx, -10, hipY, s.vy < 0 ? 0.9 : 0.2, 0.9, true);
  } else if (dead) {
    drawLeg(ctx, -10, hipY, 1.2, 0.6, true);
  } else {
    drawLeg(ctx, -10, hipY, swingB, Math.max(0, -swingB) * 0.7, true);
  }

  // --- tail ---
  ctx.save();
  const tailSway = airborne ? -0.22 : Math.sin(cyc) * 0.14;
  ctx.strokeStyle = rgba(SKIN, 1);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  const t0x = -24;
  const t0y = bodyY + 2;
  ctx.moveTo(t0x, t0y);
  ctx.quadraticCurveTo(-52, t0y - 8 + tailSway * 26, -88, t0y - 16 + tailSway * 40);
  ctx.lineWidth = 16;
  ctx.stroke();
  ctx.strokeStyle = rgba(SKIN_DARK, 1);
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(-64, t0y - 11 + tailSway * 32);
  ctx.quadraticCurveTo(-84, t0y - 14 + tailSway * 38, -102, t0y - 18 + tailSway * 46);
  ctx.stroke();
  ctx.restore();

  // --- torso ---
  ctx.save();
  ctx.translate(-4, bodyY);
  ctx.rotate(lean);
  ctx.fillStyle = bodyGradient(ctx, p);
  ctx.beginPath();
  ctx.ellipse(0, 0, duck ? 34 : 29, duck ? 15 : 19, 0, 0, Math.PI * 2);
  ctx.fill();
  // belly
  ctx.fillStyle = rgba(BELLY, 0.5);
  ctx.beginPath();
  ctx.ellipse(2, 7, duck ? 24 : 20, duck ? 6 : 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // dorsal scutes
  ctx.fillStyle = rgba(SKIN_DARK, 0.9);
  for (let i = -3; i <= 3; i++) {
    const sx = i * 8;
    const sy = -Math.sqrt(Math.max(0, 1 - (sx / 30) ** 2)) * (duck ? 15 : 19);
    ctx.beginPath();
    ctx.moveTo(sx - 3, sy + 2);
    ctx.lineTo(sx + 3, sy + 2);
    ctx.lineTo(sx, sy - 5);
    ctx.closePath();
    ctx.fill();
  }
  // skin striping
  ctx.strokeStyle = rgba(SKIN_DARK, 0.35);
  ctx.lineWidth = 2;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 10, -14);
    ctx.quadraticCurveTo(i * 10 + 3, 0, i * 10, 12);
    ctx.stroke();
  }
  // rim light
  ctx.strokeStyle = rgba(p.rim, 0.5);
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.ellipse(0, 0, duck ? 34 : 29, duck ? 15 : 19, 0, Math.PI * 1.15, Math.PI * 1.95);
  ctx.stroke();
  ctx.restore();

  // --- neck + head ---
  const headX = duck ? 30 : 22;
  const headY = duck ? bodyY - 6 : bodyY - 20 - (airborne ? 2 : 0);
  ctx.save();
  ctx.strokeStyle = rgba(SKIN, 1);
  ctx.lineCap = "round";
  ctx.lineWidth = 15;
  ctx.beginPath();
  ctx.moveTo(6, bodyY + 4);
  ctx.quadraticCurveTo(headX - 6, bodyY - (duck ? 6 : 14), headX, headY);
  ctx.stroke();
  ctx.strokeStyle = rgba(p.rim, 0.32);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(4, bodyY - 6);
  ctx.quadraticCurveTo(headX - 8, bodyY - (duck ? 12 : 22), headX + 2, headY - 5);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(headX, headY);
  ctx.rotate(duck ? 0.16 : dead ? -0.3 : -0.05 + Math.sin(cyc * 2) * 0.03);
  ctx.scale(1.16, 1.16);
  const jaw = dead ? 0.5 : duck ? 0.06 : 0.12 + Math.max(0, Math.sin(cyc)) * 0.16;
  drawHead(ctx, p, jaw);
  ctx.restore();

  // --- arms ---
  drawArm(ctx, 2, bodyY + 2, duck ? -0.3 : 0.4 + Math.sin(cyc + 1) * 0.35);

  // --- front leg ---
  if (airborne) {
    drawLeg(ctx, -4, hipY, s.vy < 0 ? 0.2 : 1.1, 0.7, false);
  } else if (dead) {
    drawLeg(ctx, -4, hipY, 0.3, 0.2, false);
  } else {
    drawLeg(ctx, -4, hipY, swingA, Math.max(0, -swingA) * 0.7, false);
  }

  ctx.restore();
}
