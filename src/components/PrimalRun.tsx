import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { GameAudio } from "@/game/audio";
import { DinoGame } from "@/game/engine";
import type { Stats } from "@/game/types";

const BOOT_ASSETS = [
  "/AQUAVOLT.png",
  "/boat.png",
  "/sky.jpg",
  "/bgenv.png",
  "/tree.png",
  "/tree1.png",
  "/tree2.png",
  "/tree3.png",
];

const INITIAL: Stats = {
  status: "ready",
  score: 0,
  distance: 0,
  speed: 430,
  best: 0,
  bestDistance: 0,
  biome: "Ocean Tropics",
  biomeTagline: "High speed on the azure sea",
  fps: 60,
  loading: true,
};

function Stat({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`px-4 py-2 ${wide ? "min-w-[9.5rem]" : "min-w-[6.5rem]"}`}>
      <div className="font-hud text-[0.62rem] tracking-[0.24em] text-hud-label uppercase">
        {label}
      </div>
      <div className="font-hud text-2xl leading-none tabular-nums text-hud-value">{value}</div>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-border/70 bg-glass px-2 py-1 font-hud text-[0.7rem] tracking-widest text-hud-value">
      {children}
    </kbd>
  );
}

export default function PrimalRun() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<DinoGame | null>(null);
  const audioRef = useRef<GameAudio | null>(null);
  const [stats, setStats] = useState<Stats>(INITIAL);
  const [muted, setMuted] = useState(false);
  const [music, setMusic] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newBest, setNewBest] = useState(false);
  const [booting, setBooting] = useState(true);
  const [bootProgress, setBootProgress] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const audio = new GameAudio();
    audioRef.current = audio;
    let game: DinoGame | null = null;
    try {
      game = new DinoGame(canvas, audio, (s) => setStats(s));
    } catch (e) {
      setError(e instanceof Error ? e.message : "This browser cannot run the game renderer.");
      return;
    }
    gameRef.current = game;

    const onResize = () => game?.resize();
    window.addEventListener("resize", onResize);

    const unlock = () => void audio.unlock();

    const onKeyDown = (e: KeyboardEvent) => {
      unlock();
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
        e.preventDefault();
        if (!e.repeat) game?.pressJump();
      } else if (e.code === "ArrowDown" || e.code === "KeyS") {
        e.preventDefault();
        game?.setDuck(true);
      } else if (e.code === "KeyP" || e.code === "Escape") {
        e.preventDefault();
        game?.togglePause();
      } else if (e.code === "KeyR") {
        e.preventDefault();
        game?.restart();
      } else if (e.code === "KeyM") {
        e.preventDefault();
        setMuted((m) => !m);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") game?.releaseJump();
      else if (e.code === "ArrowDown" || e.code === "KeyS") game?.setDuck(false);
    };
    const onPointerDown = () => {
      unlock();
      game?.pressJump();
    };
    const onPointerUp = () => game?.releaseJump();
    const onBlur = () => {
      if (game?.getStatus() === "playing") game.togglePause();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("blur", onBlur);
      game?.destroy();
      audio.dispose();
      gameRef.current = null;
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    let loaded = 0;
    const finish = () => {
      if (!alive) return;
      window.setTimeout(() => {
        if (!alive) return;
        setBooting(false);
        void audioRef.current?.unlock();
      }, 350);
    };
    BOOT_ASSETS.forEach((src) => {
      const img = new Image();
      img.onload = img.onerror = () => {
        if (!alive) return;
        loaded++;
        setBootProgress(loaded / BOOT_ASSETS.length);
        if (loaded >= BOOT_ASSETS.length) finish();
      };
      img.src = src;
    });
    // safety: never block the game on a slow/failed asset
    const t = window.setTimeout(finish, 8000);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    audioRef.current?.setMuted(muted);
  }, [muted]);
  useEffect(() => {
    audioRef.current?.setMusicEnabled(music);
  }, [music]);

  useEffect(() => {
    if (stats.status === "over") setNewBest(stats.score >= stats.best && stats.score > 0);
  }, [stats.status, stats.score, stats.best]);

  const begin = useCallback(() => {
    void audioRef.current?.unlock();
    gameRef.current?.start();
  }, []);

  const fullscreen = useCallback(() => {
    audioRef.current?.click();
    const el = document.getElementById("primal-stage");
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }, []);

  const status = stats.status;

  return (
    <div
      id="primal-stage"
      className="relative h-screen w-full overflow-hidden bg-background select-none"
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {error ? (
        <div className="absolute inset-0 flex items-center justify-center p-8 text-center">
          <div className="glass max-w-md rounded-2xl p-8">
            <h2 className="font-display text-2xl text-hud-value">Renderer unavailable</h2>
            <p className="mt-3 text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      ) : null}

      {/* ---------- HUD ---------- */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-5 transition-all duration-500 ${
          status === "playing" || status === "paused"
            ? "translate-y-0 opacity-100"
            : "-translate-y-3 opacity-0"
        }`}
      >
        <div className="glass flex divide-x divide-border/60 rounded-xl">
          <Stat label="Score" value={stats.score.toLocaleString()} wide />
          <Stat label="Best" value={stats.best.toLocaleString()} />
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="glass flex divide-x divide-border/60 rounded-xl">
            <Stat label="Distance" value={`${stats.distance.toLocaleString()} m`} />
            <Stat label="Speed" value={`${Math.round(stats.speed / 10)} km/h`} />
          </div>
          <div className="glass rounded-lg px-3 py-1 font-hud text-[0.62rem] tracking-[0.2em] text-hud-label uppercase">
            {stats.biome} · {stats.fps} fps
          </div>
        </div>
      </div>

      {/* ---------- bottom bar ---------- */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 p-5">
        <div className="flex gap-2">
          <button className="btn-glass" onClick={fullscreen}>
            Fullscreen
          </button>
          <button
            className="btn-glass"
            onClick={() => {
              audioRef.current?.click();
              setMusic((m) => !m);
            }}
          >
            Music: {music ? "On" : "Off"}
          </button>
        </div>
        <div className="flex gap-2">
          {status === "playing" || status === "paused" ? (
            <button className="btn-glass" onClick={() => gameRef.current?.togglePause()}>
              {status === "paused" ? "Resume" : "Pause"} <span className="opacity-50">P</span>
            </button>
          ) : null}
          <button className="btn-glass" onClick={() => setMuted((m) => !m)}>
            Sound: {muted ? "Off" : "On"}
          </button>
        </div>
      </div>

      {/* ---------- start screen / minimal menu ---------- */}
      <AnimatePresence>
        {status === "ready" && !error && !booting ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none absolute inset-0 flex flex-col justify-between"
          >
            <motion.div
              initial={{ y: -12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.05, duration: 0.6 }}
              className="flex flex-col items-center pt-14 text-center"
            >
              <div className="font-hud text-[0.62rem] tracking-[0.45em] text-hud-label uppercase">
                Ocean speedboat run
              </div>
              <h1 className="mt-2 font-display text-4xl leading-none tracking-[0.08em] text-hud-value uppercase md:text-6xl">
                Primal <span className="text-accent-warm">Run</span>
              </h1>
            </motion.div>

            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.6 }}
              className="flex flex-col items-center gap-6 pb-10"
            >
              <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 px-6 text-xs text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Key>Space</Key>
                  <Key>↑</Key> Jump
                </span>
                <span className="flex items-center gap-2">
                  <Key>↓</Key> Duck
                </span>
                <span className="flex items-center gap-2">
                  <Key>P</Key> Pause
                </span>
                <span className="flex items-center gap-2">
                  <Key>R</Key> Restart
                </span>
                <span className="flex items-center gap-2">
                  <Key>M</Key> Sound
                </span>
                <span className="flex items-center gap-2">Tap to jump</span>
              </div>
              <button
                onClick={begin}
                className="pointer-events-auto group relative overflow-hidden rounded-full bg-accent-warm px-14 py-4 font-hud text-xl tracking-[0.2em] text-background uppercase transition-transform hover:scale-105 hover:bg-white active:scale-95"
              >
                <span className="relative z-10">Start</span>
                <div className="absolute inset-0 z-0 bg-white opacity-0 transition-opacity group-hover:opacity-20" />
              </button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ---------- pause ---------- */}
      {status === "paused" ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="glass animate-rise rounded-2xl px-12 py-10 text-center">
            <div className="font-hud text-[0.65rem] tracking-[0.4em] text-hud-label uppercase">
              Run suspended
            </div>
            <h2 className="mt-2 font-display text-5xl tracking-wide text-hud-value uppercase">
              Paused
            </h2>
            <div className="mt-6 flex justify-center gap-3">
              <button className="btn-primary" onClick={() => gameRef.current?.togglePause()}>
                Resume
              </button>
              <button className="btn-glass" onClick={() => gameRef.current?.restart()}>
                Restart
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ---------- game over ---------- */}
      {status === "over" ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="scrim-flat absolute inset-0" />
          <div className="glass animate-rise relative w-[min(30rem,90vw)] overflow-hidden rounded-2xl text-center">
            <div className="h-1 w-full bg-gradient-to-r from-transparent via-accent-warm to-transparent" />
            <div className="p-9">
              <div className="font-hud text-[0.62rem] tracking-[0.35em] text-destructive uppercase">
                Shipwrecked
              </div>
              <h2 className="mt-1.5 font-display text-4xl tracking-wide text-hud-value uppercase">
                Run over
              </h2>
              {newBest ? (
                <div className="mt-3 inline-block rounded-full border border-accent-warm/40 bg-accent-warm/10 px-4 py-1 font-hud text-[0.6rem] tracking-[0.28em] text-accent-warm uppercase">
                  New personal best
                </div>
              ) : null}

              <div className="mt-6">
                <div className="font-hud text-[0.6rem] tracking-[0.3em] text-hud-label uppercase">
                  Final score
                </div>
                <div className="mt-1 font-display text-6xl leading-none tabular-nums text-hud-value">
                  {stats.score.toLocaleString()}
                </div>
              </div>

              <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/40">
                {[
                  ["Distance", `${stats.distance.toLocaleString()} m`],
                  ["Best score", stats.best.toLocaleString()],
                  ["Best distance", `${stats.bestDistance.toLocaleString()} m`],
                  ["Top speed", `${Math.round(stats.speed / 10)} km/h`],
                ].map(([label, value]) => (
                  <div key={label} className="bg-glass px-4 py-4">
                    <div className="font-hud text-[0.56rem] tracking-[0.24em] text-hud-label uppercase">
                      {label}
                    </div>
                    <div className="mt-1 font-hud text-xl tabular-nums text-hud-value">{value}</div>
                  </div>
                ))}
              </div>

              <div className="mt-7 flex justify-center gap-3">
                <button className="btn-primary" onClick={() => gameRef.current?.restart()}>
                  Run again
                </button>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Press <Key>R</Key> or <Key>Space</Key> to sprint again
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* ---------- boot / loading screen ---------- */}
      <AnimatePresence>
        {booting && !error ? (
          <motion.div
            key="boot"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-black"
          >
            <img src="/AQUAVOLT.png" alt="AQUAVOLT" className="w-[min(80vw,720px)] select-none" />
            <div className="relative mt-8 h-[3px] w-48 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-white/90"
                style={{
                  width: `${Math.round(bootProgress * 100)}%`,
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
