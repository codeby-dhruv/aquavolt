export type ObstacleKind = "spire" | "boulder" | "log" | "flyer" | "fish";

export type Obstacle = {
  active: boolean;
  kind: ObstacleKind;
  x: number;
  y: number; // top
  w: number;
  h: number;
  seed: number;
  flap: number;
  passed: boolean;
};

export type Particle = {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  spin: number;
  rot: number;
  kind: "dust" | "mote" | "debris" | "spark" | "water";
};

export type CharacterType = "dino" | "human" | "truck" | "bike" | "boat";

export type GameStatus = "ready" | "playing" | "paused" | "over";

export type Stats = {
  status: GameStatus;
  score: number;
  distance: number;
  speed: number;
  best: number;
  bestDistance: number;
  biome: string;
  biomeTagline: string;
  fps: number;
  loading: boolean;
};
