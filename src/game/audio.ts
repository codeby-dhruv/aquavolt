/**
 * Fully synthesized game audio (Web Audio API) — no external asset downloads,
 * so there is nothing to preload and nothing that can 404.
 */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private ambienceBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private windGain: GainNode | null = null;
  private started = false;
  private musicTimer: number | null = null;
  private birdTimer: number | null = null;
  private musicStep = 0;

  private engineOsc: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  muted = false;
  musicEnabled = true;

  /** Must be called from a user gesture. Safe to call repeatedly. */
  async unlock() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.85;
      this.sfxBus.connect(this.master);

      this.ambienceBus = this.ctx.createGain();
      this.ambienceBus.gain.value = 0.5;
      this.ambienceBus.connect(this.master);

      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.musicEnabled ? 0.28 : 0;
      this.musicBus.connect(this.master);

      // 2s of pink-ish noise, reused for wind / dust / impacts.
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.2 + white * 0.35;
      }
      this.noiseBuffer = buf;
    }
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
    this.startAmbience();
  }

  private now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.now());
      this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.now(), 0.05);
    }
  }

  setMusicEnabled(on: boolean) {
    this.musicEnabled = on;
    if (this.musicBus && this.ctx) {
      this.musicBus.gain.setTargetAtTime(on ? 0.28 : 0, this.now(), 0.2);
    }
  }

  private startAmbience() {
    if (!this.ctx || !this.noiseBuffer || !this.ambienceBus || this.started) return;
    this.started = true;
    const ctx = this.ctx;
    const noiseBuffer = this.noiseBuffer;
    const ambienceBus = this.ambienceBus;

    // Wind: filtered noise with a slow LFO on the filter + gain.
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 420;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0.22;
    this.windGain = gain;
    src.connect(filter).connect(gain).connect(ambienceBus);
    src.start();

    // Engine Drone (for vehicles)
    const engOsc = ctx.createOscillator();
    engOsc.type = "sawtooth";
    const engFilter = ctx.createBiquadFilter();
    engFilter.type = "lowpass";
    const engGain = ctx.createGain();
    engGain.gain.value = 0;
    engOsc
      .connect(engFilter)
      .connect(engGain)
      .connect(this.sfxBus ?? ambienceBus);
    engOsc.start();
    this.engineOsc = engOsc;
    this.engineFilter = engFilter;
    this.engineGain = engGain;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 210;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();

    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.14;
    const lfo2Gain = ctx.createGain();
    lfo2Gain.gain.value = 0.1;
    lfo2.connect(lfo2Gain).connect(gain.gain);
    lfo2.start();

    // Distant bird / pterosaur calls.
    const scheduleBird = () => {
      this.bird();
      this.birdTimer = window.setTimeout(scheduleBird, 5000 + Math.random() * 9000);
    };
    this.birdTimer = window.setTimeout(scheduleBird, 3500);

    this.startMusic();
  }

  /** Wind intensity follows game speed. */
  setWind(intensity: number) {
    if (!this.windGain || !this.ctx) return;
    this.windGain.gain.setTargetAtTime(0.14 + intensity * 0.3, this.now(), 0.4);
  }

  updateEngine(character: string, speed: number, state: "ground" | "air" | "duck" | "dead") {
    if (!this.engineOsc || !this.ctx || !this.engineGain || !this.engineFilter) return;
    const t = this.now();
    if (character === "dino" || character === "human" || state === "dead") {
      this.engineGain.gain.setTargetAtTime(0, t, 0.1);
      return;
    }

    const isBike = character === "bike";
    const isBoat = character === "boat";

    let freq = isBoat ? 140 : isBike ? 90 : 50;

    if (state === "air") {
      freq = isBoat ? 420 : isBike ? 280 : 160;
    } else if (state === "duck") {
      freq = isBoat ? 500 : isBike ? 340 : 200;
    } else {
      freq += (speed - 400) * (isBoat ? 0.35 : isBike ? 0.2 : 0.1);
    }

    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.15);
    this.engineFilter.frequency.setTargetAtTime(freq * 3, t, 0.15);
    this.engineGain.gain.setTargetAtTime(isBoat ? 0.05 : isBike ? 0.08 : 0.12, t, 0.15);
  }

  private startMusic() {
    if (!this.ctx || this.musicTimer !== null) return;
    const roots = [55, 55, 73.42, 65.41];
    const stepMs = 500;
    const tick = () => {
      if (this.ctx && this.musicEnabled && !this.muted) {
        const root = roots[Math.floor(this.musicStep / 8) % roots.length] ?? 55;
        const pattern = [1, 1.5, 2, 3, 2, 1.5, 2, 1.2];
        const mult = pattern[this.musicStep % pattern.length] ?? 1;
        this.tone({
          freq: root * mult * 2,
          type: "triangle",
          dur: 1.1,
          gain: 0.16,
          bus: this.musicBus,
          attack: 0.08,
        });
        if (this.musicStep % 8 === 0) {
          this.tone({
            freq: root,
            type: "sine",
            dur: 3.2,
            gain: 0.3,
            bus: this.musicBus,
            attack: 0.5,
          });
        }
      }
      this.musicStep++;
      this.musicTimer = window.setTimeout(tick, stepMs);
    };
    tick();
  }

  private tone(opts: {
    freq: number;
    type?: OscillatorType;
    dur?: number;
    gain?: number;
    bus?: GainNode | null;
    attack?: number;
    endFreq?: number;
  }) {
    if (!this.ctx) return;
    const t = this.now();
    const dur = opts.dur ?? 0.2;
    const osc = this.ctx.createOscillator();
    osc.type = opts.type ?? "sine";
    osc.frequency.setValueAtTime(opts.freq, t);
    if (opts.endFreq)
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.endFreq), t + dur);
    const g = this.ctx.createGain();
    const peak = opts.gain ?? 0.2;
    const atk = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(opts.bus ?? this.sfxBus ?? this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noise(opts: {
    dur?: number;
    gain?: number;
    freq?: number;
    q?: number;
    type?: BiquadFilterType;
    sweepTo?: number;
  }) {
    if (!this.ctx || !this.noiseBuffer) return;
    const t = this.now();
    const dur = opts.dur ?? 0.15;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;
    const f = this.ctx.createBiquadFilter();
    f.type = opts.type ?? "bandpass";
    f.frequency.setValueAtTime(opts.freq ?? 900, t);
    if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + dur);
    f.Q.value = opts.q ?? 1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(opts.gain ?? 0.2, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src
      .connect(f)
      .connect(g)
      .connect(this.sfxBus ?? this.ctx.destination);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  footstep(heavy = false, character = "dino") {
    if (character === "truck" || character === "bike") return; // vehicles hum instead
    if (character === "boat") {
      this.noise({ dur: 0.2, gain: 0.1, freq: 800, sweepTo: 200, q: 0.5 }); // water slap
      return;
    }
    this.noise({
      dur: heavy ? 0.16 : 0.1,
      gain: heavy ? 0.3 : 0.18,
      freq: 220,
      q: 0.9,
      sweepTo: 90,
    });
    this.tone({ freq: heavy ? 78 : 96, endFreq: 44, type: "sine", dur: 0.12, gain: 0.22 });
  }

  jump(character = "dino") {
    if (character === "boat") {
      this.noise({ dur: 0.6, gain: 0.2, freq: 400, sweepTo: 800, q: 1.0 }); // water swoosh
      this.tone({ freq: 200, endFreq: 400, type: "sawtooth", dur: 0.2, gain: 0.05 });
      return;
    }
    if (character === "truck" || character === "bike") {
      this.noise({ dur: 0.4, gain: 0.2, freq: 800, sweepTo: 200, q: 0.5 });
      this.tone({ freq: 120, endFreq: 300, type: "sawtooth", dur: 0.3, gain: 0.15 });
      return;
    }
    this.tone({ freq: 210, endFreq: 520, type: "triangle", dur: 0.24, gain: 0.2 });
    this.noise({ dur: 0.18, gain: 0.14, freq: 1400, sweepTo: 500 });
  }

  land(character = "dino") {
    if (character === "boat") {
      this.noise({ dur: 0.5, gain: 0.3, freq: 300, sweepTo: 100, q: 0.7 }); // huge splash
      return;
    }
    if (character === "truck" || character === "bike") {
      this.tone({ freq: 60, endFreq: 30, type: "square", dur: 0.3, gain: 0.25 });
      this.noise({ dur: 0.3, gain: 0.3, freq: 200, sweepTo: 80, q: 0.8 });
      return;
    }
    this.tone({ freq: 130, endFreq: 48, type: "sine", dur: 0.22, gain: 0.3 });
    this.noise({ dur: 0.26, gain: 0.26, freq: 340, sweepTo: 110, q: 0.7 });
  }

  duck(character = "dino") {
    if (character === "boat") {
      this.noise({ dur: 0.4, gain: 0.2, freq: 1400, sweepTo: 300, type: "bandpass" }); // splash
      return;
    }
    if (character === "truck" || character === "bike") {
      this.noise({ dur: 0.3, gain: 0.25, freq: 1200, sweepTo: 400, type: "bandpass" });
      this.tone({ freq: 400, endFreq: 150, type: "sawtooth", dur: 0.3, gain: 0.1 });
      return;
    }
    this.noise({ dur: 0.2, gain: 0.16, freq: 620, sweepTo: 200 });
  }

  swoosh() {
    this.noise({ dur: 0.3, gain: 0.1, freq: 500, sweepTo: 1600, q: 0.6 });
  }

  crash() {
    this.tone({ freq: 160, endFreq: 34, type: "sawtooth", dur: 0.8, gain: 0.32 });
    this.noise({ dur: 0.9, gain: 0.34, freq: 500, sweepTo: 70, q: 0.4 });
    this.tone({ freq: 92, endFreq: 40, type: "square", dur: 0.5, gain: 0.16 });
  }

  milestone() {
    this.tone({ freq: 660, type: "triangle", dur: 0.18, gain: 0.16 });
    window.setTimeout(() => this.tone({ freq: 990, type: "triangle", dur: 0.26, gain: 0.14 }), 110);
  }

  biome() {
    this.tone({ freq: 220, endFreq: 440, type: "sine", dur: 1.4, gain: 0.14, attack: 0.3 });
    this.noise({ dur: 1.2, gain: 0.1, freq: 300, sweepTo: 1800, q: 0.5 });
  }

  bird() {
    if (this.muted) return;
    const base = 1500 + Math.random() * 1300;
    this.tone({ freq: base, endFreq: base * 1.7, type: "sine", dur: 0.1, gain: 0.05 });
    window.setTimeout(
      () =>
        this.tone({ freq: base * 1.2, endFreq: base * 0.7, type: "sine", dur: 0.14, gain: 0.045 }),
      140,
    );
  }

  click() {
    this.tone({ freq: 880, endFreq: 1320, type: "triangle", dur: 0.07, gain: 0.12 });
  }

  dispose() {
    if (this.musicTimer !== null) window.clearTimeout(this.musicTimer);
    if (this.birdTimer !== null) window.clearTimeout(this.birdTimer);
    this.musicTimer = null;
    this.birdTimer = null;
    this.started = false;
    void this.ctx?.close();
    this.ctx = null;
  }
}
