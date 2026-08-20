export type Col = { r: number; g: number; b: number };

export const col = (r: number, g: number, b: number): Col => ({ r, g, b });

export const rgba = (c: Col, a = 1) =>
  `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${a})`;

export const mixCol = (a: Col, b: Col, t: number): Col => ({
  r: a.r + (b.r - a.r) * t,
  g: a.g + (b.g - a.g) * t,
  b: a.b + (b.b - a.b) * t,
});

export type VegKind = "spire" | "fern" | "conifer" | "bare" | "palm";

export type Palette = {
  name: string;
  tagline: string;
  skyTop: Col;
  skyMid: Col;
  skyBottom: Col;
  sun: Col;
  sunGlow: Col;
  far: Col;
  mid: Col;
  near: Col;
  groundTop: Col;
  groundBottom: Col;
  rock: Col;
  veg: Col;
  fog: Col;
  dust: Col;
  rim: Col;
  sunX: number;
  sunY: number;
  starAlpha: number;
  vegKind: VegKind;
  fogStrength: number;
};

export const PALETTES: Palette[] = [
  {
    name: "Amber Badlands",
    tagline: "Sunrise over the fossil flats",
    skyTop: col(46, 58, 92),
    skyMid: col(168, 122, 96),
    skyBottom: col(246, 196, 128),
    sun: col(255, 236, 197),
    sunGlow: col(255, 168, 92),
    far: col(96, 90, 110),
    mid: col(112, 84, 78),
    near: col(74, 54, 48),
    groundTop: col(126, 92, 62),
    groundBottom: col(52, 38, 30),
    rock: col(92, 72, 58),
    veg: col(58, 60, 44),
    fog: col(226, 178, 130),
    dust: col(216, 182, 138),
    rim: col(255, 198, 130),
    sunX: 0.74,
    sunY: 0.5,
    starAlpha: 0.1,
    vegKind: "spire",
    fogStrength: 0.5,
  },
  {
    name: "Ash Caldera",
    tagline: "The mountains are awake",
    skyTop: col(28, 20, 26),
    skyMid: col(96, 40, 38),
    skyBottom: col(196, 92, 52),
    sun: col(255, 190, 130),
    sunGlow: col(228, 84, 42),
    far: col(66, 50, 56),
    mid: col(74, 44, 42),
    near: col(44, 28, 28),
    groundTop: col(84, 60, 54),
    groundBottom: col(30, 22, 22),
    rock: col(66, 52, 50),
    veg: col(44, 32, 30),
    fog: col(196, 108, 70),
    dust: col(188, 150, 132),
    rim: col(255, 126, 66),
    sunX: 0.2,
    sunY: 0.56,
    starAlpha: 0.16,
    vegKind: "bare",
    fogStrength: 0.7,
  },
  {
    name: "Fern Basin",
    tagline: "Humid green, thick with life",
    skyTop: col(30, 62, 74),
    skyMid: col(96, 148, 132),
    skyBottom: col(206, 224, 186),
    sun: col(240, 255, 226),
    sunGlow: col(158, 214, 150),
    far: col(78, 106, 106),
    mid: col(54, 90, 74),
    near: col(30, 58, 48),
    groundTop: col(74, 96, 62),
    groundBottom: col(28, 42, 32),
    rock: col(72, 84, 70),
    veg: col(30, 62, 46),
    fog: col(190, 220, 192),
    dust: col(178, 196, 158),
    rim: col(196, 240, 176),
    sunX: 0.62,
    sunY: 0.42,
    starAlpha: 0.06,
    vegKind: "fern",
    fogStrength: 0.62,
  },
  {
    name: "Glacial Night",
    tagline: "Cold stars, colder wind",
    skyTop: col(8, 12, 30),
    skyMid: col(24, 40, 76),
    skyBottom: col(78, 108, 148),
    sun: col(226, 240, 255),
    sunGlow: col(112, 152, 210),
    far: col(48, 62, 96),
    mid: col(38, 52, 82),
    near: col(22, 32, 54),
    groundTop: col(70, 86, 118),
    groundBottom: col(16, 22, 40),
    rock: col(58, 72, 100),
    veg: col(26, 38, 58),
    fog: col(140, 172, 214),
    dust: col(196, 214, 240),
    rim: col(168, 208, 255),
    sunX: 0.28,
    sunY: 0.28,
    starAlpha: 0.95,
    vegKind: "conifer",
    fogStrength: 0.55,
  },
  {
    name: "Ocean Tropics",
    tagline: "High speed on the azure sea",
    skyTop: col(20, 140, 240),
    skyMid: col(80, 200, 240),
    skyBottom: col(180, 240, 255),
    sun: col(255, 250, 220),
    sunGlow: col(255, 220, 100),
    far: col(60, 120, 160),
    mid: col(40, 100, 140),
    near: col(20, 80, 120),
    groundTop: col(20, 160, 220),
    groundBottom: col(0, 60, 100),
    rock: col(180, 160, 120),
    veg: col(30, 100, 50),
    fog: col(160, 220, 250),
    dust: col(220, 240, 255),
    rim: col(255, 255, 255),
    sunX: 0.65,
    sunY: 0.45,
    starAlpha: 0.05,
    vegKind: "palm",
    fogStrength: 0.3,
  },
];

export function lerpPalette(a: Palette, b: Palette, t: number): Palette {
  return {
    name: t < 0.5 ? a.name : b.name,
    tagline: t < 0.5 ? a.tagline : b.tagline,
    skyTop: mixCol(a.skyTop, b.skyTop, t),
    skyMid: mixCol(a.skyMid, b.skyMid, t),
    skyBottom: mixCol(a.skyBottom, b.skyBottom, t),
    sun: mixCol(a.sun, b.sun, t),
    sunGlow: mixCol(a.sunGlow, b.sunGlow, t),
    far: mixCol(a.far, b.far, t),
    mid: mixCol(a.mid, b.mid, t),
    near: mixCol(a.near, b.near, t),
    groundTop: mixCol(a.groundTop, b.groundTop, t),
    groundBottom: mixCol(a.groundBottom, b.groundBottom, t),
    rock: mixCol(a.rock, b.rock, t),
    veg: mixCol(a.veg, b.veg, t),
    fog: mixCol(a.fog, b.fog, t),
    dust: mixCol(a.dust, b.dust, t),
    rim: mixCol(a.rim, b.rim, t),
    sunX: a.sunX + (b.sunX - a.sunX) * t,
    sunY: a.sunY + (b.sunY - a.sunY) * t,
    starAlpha: a.starAlpha + (b.starAlpha - a.starAlpha) * t,
    vegKind: t < 0.5 ? a.vegKind : b.vegKind,
    fogStrength: a.fogStrength + (b.fogStrength - a.fogStrength) * t,
  };
}
