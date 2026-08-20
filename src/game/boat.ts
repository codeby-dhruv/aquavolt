import type { Palette } from "./palettes";
import { rgba } from "./palettes";
import type { DinoDrawState } from "./dino";

let boatImage: HTMLImageElement | null = null;
if (typeof document !== "undefined") {
  boatImage = new Image();
  boatImage.src = "/boat.png";
}

let boatSprite: HTMLCanvasElement | null = null;
function getBoatSprite(): HTMLCanvasElement | null {
  if (boatSprite) return boatSprite;
  if (!boatImage || !(boatImage.complete && boatImage.naturalWidth > 0)) return null;
  const MAX_W = 240;
  const aspect = boatImage.naturalWidth / boatImage.naturalHeight;
  const w = MAX_W;
  const h = Math.max(1, Math.round(MAX_W / aspect));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) return null;
  g.drawImage(boatImage, 0, 0, w, h);
  boatSprite = c;
  return c;
}

export function drawBoat(ctx: CanvasRenderingContext2D, s: DinoDrawState, p: Palette) {
  const duck = s.pose === "duck";
  const airborne = s.pose === "jump" || s.pose === "fall";
  const dead = s.pose === "dead";
  const cyc = s.phase;

  // Physics & Animation
  let pitch = 0;
  // Bobs slightly on the waves (reduced bobbing)
  const bounce = airborne || dead ? 0 : Math.sin(cyc * 3) * 1 + 1;

  if (dead) {
    pitch = 0;
  } else if (airborne) {
    // Pitching up heavily on jump
    pitch = Math.max(-0.4, Math.min(0.2, s.vy / 1800));
  } else if (duck) {
    pitch = -0.05; // Skimming mode
  } else {
    // Normal cruising on waves causes nose to pitch up and down (reduced pitch)
    pitch = -0.05 + Math.sin(cyc * 1.5) * 0.02;
  }

  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.scale(s.scale, s.scale);

  if (dead) {
    // Sink backwards
    ctx.translate(20 * s.deathT, 20 * s.deathT);
    ctx.rotate(Math.PI * 0.5 * s.deathT);
  }

  // --- CHASSIS / HULL ---
  ctx.save();
  ctx.translate(0, bounce - 10);
  ctx.rotate(pitch);

  // Back wake/splash
  if (!airborne && !dead) {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.moveTo(-50, 6);
    ctx.quadraticCurveTo(-70 - Math.random() * 20, -5 + Math.random() * 5, -50, -2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-45, 8);
    ctx.quadraticCurveTo(-90 - Math.random() * 40, Math.random() * 5, -45, 0);
    ctx.fill();
  }

  // Draw Boat Image
  const sprite = getBoatSprite();
  if (sprite) {
    const aspect = sprite.width / sprite.height;
    const drawWidth = 140; // Maintain scale for game feel
    const drawHeight = drawWidth / aspect;
    // Draw centered on X, anchored near bottom on Y
    ctx.drawImage(sprite, -drawWidth / 2, -drawHeight + 10, drawWidth, drawHeight);
  } else {
    // Fallback if image isn't loaded yet
    ctx.fillStyle = "rgba(200,200,200,1)";
    ctx.fillRect(-40, -10, 80, 20);
  }

  // Spray/Splash effect at the bow when ducking/skimming
  if (duck && !airborne && !dead) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.beginPath();
    ctx.moveTo(40, 2);
    ctx.quadraticCurveTo(60 + Math.random() * 20, -10 - Math.random() * 10, 44, 6);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(20, 6);
    ctx.quadraticCurveTo(30 + Math.random() * 30, -5 - Math.random() * 5, 20, 10);
    ctx.fill();
  }

  ctx.restore(); // end hull

  ctx.restore(); // end root
}
