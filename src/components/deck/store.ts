import { create } from "zustand";
import {
  CARRIER_HZ,
  COMMANDS,
  REPEAT_INTERVAL_MS,
  durationUs,
  formatHex,
  necFrame,
  type CommandId,
} from "@/lib/nec";
import { transmitIr } from "@/lib/ir-hardware";

export const INPUTS = ["optical", "coax", "direct", "aux"] as const;
export type InputId = (typeof INPUTS)[number];

export const EFFECTS = ["stereo", "stereo2", "movie", "music"] as const;
export type EffectId = (typeof EFFECTS)[number];

export const LEVELS = ["sub", "center", "surround"] as const;
export type LevelId = (typeof LEVELS)[number];

const LEVEL_CYCLE = ["master", "sub", "center", "surround"] as const;
type LevelSlot = (typeof LEVEL_CYCLE)[number];

export const VOLUME_MAX = 40;
export const TRIM_LIMIT = 6;

export const INPUT_META: Record<InputId, { label: string; hint: string }> = {
  optical: { label: "Optical", hint: "Digital" },
  coax: { label: "Coax", hint: "Digital" },
  direct: { label: "6-Ch Direct", hint: "Analog" },
  aux: { label: "Aux", hint: "Stereo" },
};

export const EFFECT_META: Record<EffectId, { label: string; hint: string; aria: string }> = {
  stereo: { label: "Stereo", hint: "Fronts", aria: "Stereo" },
  stereo2: { label: "Stereo ×2", hint: "All channels", aria: "Stereo times two" },
  movie: { label: "PLII Movie", hint: "Dolby", aria: "Dolby Pro Logic II Movie" },
  music: { label: "PLII Music", hint: "Dolby", aria: "Dolby Pro Logic II Music" },
};

export const LEVEL_META: Record<LevelId, { label: string; short: string }> = {
  sub: { label: "Subwoofer", short: "SUB" },
  center: { label: "Center", short: "CTR" },
  surround: { label: "Surround", short: "SUR" },
};

export type Blast = {
  id: number;
  command: CommandId;
  label: string;
  hex: string;
  code: number;
  pattern: number[];
  carrierHz: number;
  durationUs: number;
  delivered: boolean;
  ignored: boolean;
};

type VolumeFrame = { kind: "volume"; dir: 1 | -1; live: boolean };
type SimpleFrame = { kind: "power" | "mute" | "input" | "effect" | "level"; live: boolean };
type Frame = VolumeFrame | SimpleFrame;

type Persisted = {
  power: boolean;
  muted: boolean;
  volume: number;
  trims: Record<LevelId, number>;
  input: InputId;
  effect: EffectId;
};

const STORAGE_KEY = "z5500-deck";

export type DeckState = {
  power: boolean;
  muted: boolean;
  volume: number;
  trims: Record<LevelId, number>;
  input: InputId;
  effect: EffectId;
  level: LevelId | null;
  standbyFlash: boolean;
  lastBlast: Blast | null;
  history: Blast[];
  hydrate: () => void;
  pressPower: () => void;
  pressMute: () => void;
  volumeNudge: (dir: 1 | -1) => void;
  selectInput: (id: InputId) => void;
  selectEffect: (id: EffectId) => void;
  selectLevel: (id: LevelId) => void;
  nudgeLevel: (id: LevelId, dir: 1 | -1) => void;
};

let seq = 1;
let pumping = false;
const queue: Frame[] = [];
let pendingInput: InputId = "optical";
let pendingEffect: EffectId = "movie";
let pendingLevel: LevelSlot = "master";
let levelTimer: number | null = null;
let flashTimer: number | null = null;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function steps<T>(order: readonly T[], from: T, to: T): number {
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  if (a < 0 || b < 0) return 0;
  return (b - a + order.length) % order.length;
}

function isInput(value: string): value is InputId {
  return (INPUTS as readonly string[]).includes(value);
}

function isEffect(value: string): value is EffectId {
  return (EFFECTS as readonly string[]).includes(value);
}

function slotOf(level: LevelId | null): LevelSlot {
  return level ?? "master";
}

function snapshot(s: DeckState): Persisted {
  return {
    power: s.power,
    muted: s.muted,
    volume: s.volume,
    trims: s.trims,
    input: s.input,
    effect: s.effect,
  };
}

function persist(s: DeckState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot(s)));
  } catch {
    /* storage unavailable */
  }
}

function syncPending(s: DeckState) {
  pendingInput = s.input;
  pendingEffect = s.effect;
  pendingLevel = slotOf(s.level);
}

function clearLevelTimer() {
  if (levelTimer !== null) {
    window.clearTimeout(levelTimer);
    levelTimer = null;
  }
}

function clearQueue() {
  queue.length = 0;
  clearLevelTimer();
  syncPending(useDeck.getState());
}

function commandOf(frame: Frame): CommandId {
  if (frame.kind === "volume") return frame.dir > 0 ? "volumeUp" : "volumeDown";
  return frame.kind;
}

function armLevelTimeout() {
  clearLevelTimer();
  levelTimer = window.setTimeout(() => {
    levelTimer = null;
    if (queue.some((frame) => frame.kind === "level")) return;
    pendingLevel = "master";
    useDeck.setState({ level: null });
  }, 5000);
}

function noteIgnored() {
  if (flashTimer !== null) window.clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => {
    flashTimer = null;
    useDeck.setState({ standbyFlash: false });
  }, 1200);
}

function apply(frame: Frame) {
  const spec = COMMANDS[commandOf(frame)];
  const pattern = necFrame(spec.code);
  const delivered = transmitIr(CARRIER_HZ, pattern);
  const ignored = frame.kind !== "power" && !frame.live;

  useDeck.setState((current) => {
    const patch: Partial<DeckState> = {};
    if (!ignored && frame.kind === "power") {
      patch.power = !current.power;
      if (!patch.power) patch.level = null;
    } else if (!ignored && frame.kind === "mute") {
      patch.muted = !current.muted;
    } else if (!ignored && frame.kind === "volume") {
      patch.muted = false;
      if (current.level) {
        const key = current.level;
        patch.trims = {
          ...current.trims,
          [key]: clamp(current.trims[key] + frame.dir, -TRIM_LIMIT, TRIM_LIMIT),
        };
      } else {
        patch.volume = clamp(current.volume + frame.dir, 0, VOLUME_MAX);
      }
    } else if (!ignored && frame.kind === "input") {
      patch.input = INPUTS[(INPUTS.indexOf(current.input) + 1) % INPUTS.length];
    } else if (!ignored && frame.kind === "effect") {
      patch.effect = EFFECTS[(EFFECTS.indexOf(current.effect) + 1) % EFFECTS.length];
    } else if (!ignored && frame.kind === "level") {
      const order: Array<LevelId | null> = [null, "sub", "center", "surround"];
      const index = Math.max(0, order.indexOf(current.level));
      patch.level = order[(index + 1) % order.length];
    }

    const event: Blast = {
      id: seq,
      command: commandOf(frame),
      label: spec.label,
      hex: formatHex(spec.code),
      code: spec.code,
      pattern,
      carrierHz: CARRIER_HZ,
      durationUs: durationUs(pattern),
      delivered,
      ignored,
    };
    seq += 1;

    const next: DeckState = {
      ...current,
      ...patch,
      lastBlast: event,
      history: [event, ...current.history].slice(0, 8),
      standbyFlash: ignored,
    };
    if (!ignored) persist(next);
    return next;
  });

  if (ignored) noteIgnored();
  if (!ignored && frame.kind === "level") {
    const level = useDeck.getState().level;
    if (level && !queue.some((item) => item.kind === "level")) armLevelTimeout();
    if (!level) clearLevelTimer();
  }
  if (!ignored && frame.kind === "power" && !useDeck.getState().power) {
    pendingLevel = "master";
    clearLevelTimer();
  }
}

function pump() {
  if (pumping) return;
  const frame = queue.shift();
  if (!frame) return;
  pumping = true;
  apply(frame);
  window.setTimeout(() => {
    pumping = false;
    pump();
  }, REPEAT_INTERVAL_MS);
}

function enqueue(frame: Frame) {
  queue.push(frame);
  pump();
}

function enqueueSteps(kind: "input" | "effect" | "level", count: number, live: boolean) {
  for (let i = 0; i < count; i += 1) enqueue({ kind, live });
}

export const useDeck = create<DeckState>((set, get) => ({
  power: true,
  muted: false,
  volume: 18,
  trims: { sub: 0, center: 0, surround: 0 },
  input: "optical",
  effect: "movie",
  level: null,
  standbyFlash: false,
  lastBlast: null,
  history: [],

  hydrate() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Partial<Persisted>;
      const input = typeof data.input === "string" && isInput(data.input) ? data.input : "optical";
      const effect = typeof data.effect === "string" && isEffect(data.effect) ? data.effect : "movie";
      const volume = clamp(Number(data.volume) || 0, 0, VOLUME_MAX);
      const trims = {
        sub: clamp(Number(data.trims?.sub) || 0, -TRIM_LIMIT, TRIM_LIMIT),
        center: clamp(Number(data.trims?.center) || 0, -TRIM_LIMIT, TRIM_LIMIT),
        surround: clamp(Number(data.trims?.surround) || 0, -TRIM_LIMIT, TRIM_LIMIT),
      };
      clearQueue();
      set({
        power: data.power !== false,
        muted: data.muted === true,
        volume,
        trims,
        input,
        effect,
        level: null,
      });
      pendingInput = input;
      pendingEffect = effect;
      pendingLevel = "master";
    } catch {
      /* ignore corrupt storage */
    }
  },

  pressPower() {
    clearQueue();
    enqueue({ kind: "power", live: true });
  },

  pressMute() {
    enqueue({ kind: "mute", live: get().power });
  },

  volumeNudge(dir) {
    enqueue({ kind: "volume", dir, live: get().power });
  },

  selectInput(id) {
    if (!get().power) {
      enqueue({ kind: "input", live: false });
      return;
    }
    const count = steps(INPUTS, pendingInput, id);
    if (count === 0) return;
    pendingInput = id;
    enqueueSteps("input", count, true);
  },

  selectEffect(id) {
    if (!get().power) {
      enqueue({ kind: "effect", live: false });
      return;
    }
    const count = steps(EFFECTS, pendingEffect, id);
    if (count === 0) return;
    pendingEffect = id;
    enqueueSteps("effect", count, true);
  },

  selectLevel(id) {
    if (!get().power) {
      enqueue({ kind: "level", live: false });
      return;
    }
    clearLevelTimer();
    const target: LevelSlot = pendingLevel === id ? "master" : id;
    const count = steps(LEVEL_CYCLE, pendingLevel, target);
    if (count === 0) return;
    pendingLevel = target;
    enqueueSteps("level", count, true);
  },

  nudgeLevel(id, dir) {
    if (!get().power) {
      enqueue({ kind: "volume", dir, live: false });
      return;
    }
    if (pendingLevel !== id) {
      clearLevelTimer();
      const count = steps(LEVEL_CYCLE, pendingLevel, id);
      pendingLevel = id;
      enqueueSteps("level", count, true);
    } else {
      armLevelTimeout();
    }
    enqueue({ kind: "volume", dir, live: true });
  },
}));
