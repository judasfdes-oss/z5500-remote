import { useEffect, useRef, useState, type ReactNode } from "react";
import { Minus, Plus, Power, Volume2, VolumeX } from "lucide-react";
import { COMMANDS, REPEAT_INTERVAL_MS, formatHex } from "@/lib/nec";
import { hapticTick, hasIrEmitter } from "@/lib/ir-hardware";
import {
  EFFECTS,
  EFFECT_META,
  INPUTS,
  INPUT_META,
  LEVELS,
  LEVEL_META,
  TRIM_LIMIT,
  VOLUME_MAX,
  useDeck,
  type EffectId,
  type LevelId,
} from "@/components/deck/store";

const ALERT_KEY = "z5500-ir-ack";

export function ControlDeck() {
  const power = useDeck((s) => s.power);
  const hydrate = useDeck((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <main className="stage">
      <article className={`deck${power ? "" : " is-standby"}`}>
        <span className="screw screw-a" aria-hidden="true" />
        <span className="screw screw-b" aria-hidden="true" />
        <span className="screw screw-c" aria-hidden="true" />
        <span className="screw screw-d" aria-hidden="true" />
        <header className="topbar">
          <div>
            <p className="brand-kicker">Digital speaker system</p>
            <h1 className="brand-title">Z-5500</h1>
          </div>
          <CarrierChip />
        </header>
        <IrAlert />
        <SpeakerRig />
        <div className="deck-grid">
          <div className="zone-span">
            <PowerRow />
          </div>
          <div className={power ? undefined : "audio-dim"}>
            <LevelRow />
            <VolumeDial />
          </div>
          <div className={power ? undefined : "audio-dim"}>
            <InputGrid />
            <EffectGrid />
            <SignalPane />
          </div>
        </div>
        <p className="footer-note">
          NEC 32-bit frames at 38 kHz. Address 0x10. Hold volume and the same code repeats every {REPEAT_INTERVAL_MS} ms.
          Discrete inputs, effects, and levels step the original cycle commands.
        </p>
      </article>
    </main>
  );
}

function IrAlert() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (hasIrEmitter()) return;
    try {
      if (sessionStorage.getItem(ALERT_KEY) === "1") return;
    } catch {
      /* session storage blocked */
    }
    setOpen(true);
  }, []);

  if (!open) return null;

  return (
    <div className="alert-card" role="alert">
        <p className="brand-kicker">ConsumerIrManager</p>
        <h2 id="ir-alert-title">IR Hardware not detected or blocked</h2>
        <p>
          This device has no infrared emitter, so nothing can leave the blaster. The deck still runs as the
          Z-5500 control center and builds every NEC frame exactly as transmit(38000, pattern) would send it
          from a phone that has a blaster, such as the Honor Magic 8 Pro.
        </p>
        <button
          type="button"
          className="alert-go"
          onClick={() => {
            hapticTick();
            try {
              sessionStorage.setItem(ALERT_KEY, "1");
            } catch {
              /* ignore */
            }
            setOpen(false);
          }}
        >
          Dismiss
        </button>
      </div>
  );
}

function CarrierChip() {
  const id = useDeck((s) => s.lastBlast?.id ?? 0);
  const delivered = useDeck((s) => s.lastBlast?.delivered ?? false);
  const [hot, setHot] = useState(false);
  const [emitter, setEmitter] = useState<boolean | null>(null);

  useEffect(() => {
    setEmitter(hasIrEmitter());
  }, []);

  useEffect(() => {
    if (!id) return;
    setHot(true);
    const timer = window.setTimeout(() => setHot(false), 160);
    return () => window.clearTimeout(timer);
  }, [id]);

  const label = emitter ? "Emitter live" : "No IR emitter";
  return (
    <p className="ir-chip">
      <span className={hot ? "carrier hot" : "carrier"} aria-hidden="true" />
      <span>
        {label}
        {delivered ? " · sent" : ""}
        <br />
        38 kHz NEC
      </span>
    </p>
  );
}

function SpeakerRig() {
  const power = useDeck((s) => s.power);
  const muted = useDeck((s) => s.muted);
  const input = useDeck((s) => s.input);
  const effect = useDeck((s) => s.effect);
  const volume = useDeck((s) => s.volume);
  const trims = useDeck((s) => s.trims);
  const wide = power && !muted && (input === "direct" || effect !== "stereo");
  const fronts = power && !muted;
  const glow = power && !muted ? Math.max(0.35, volume / VOLUME_MAX) : 0;
  const subGlow = fronts ? Math.min(1, glow + trims.sub * 0.04) : 0;
  const centerGlow = wide ? Math.min(1, glow + trims.center * 0.04) : 0;
  const surroundGlow = wide ? Math.min(1, glow + trims.surround * 0.04) : 0;

  return (
    <div className="rig" aria-hidden="true">
      <Sat hot={fronts} glow={glow} />
      <Sat hot={wide} glow={centerGlow} wide />
      <Sat hot={fronts} glow={glow} />
      <Sat hot={wide} glow={surroundGlow} />
      <div className="subbox">
        <span className={subGlow > 0 ? "led on" : "led"} style={{ ["--glow" as string]: String(subGlow) }} />
      </div>
      <Sat hot={wide} glow={surroundGlow} />
    </div>
  );
}

function Sat({ hot, glow, wide }: { hot: boolean; glow: number; wide?: boolean }) {
  return (
    <div className={wide ? "sat sat-center" : "sat"}>
      <span className={hot ? "led on" : "led"} style={{ ["--glow" as string]: String(hot ? glow : 0) }} />
    </div>
  );
}

function PowerRow() {
  const power = useDeck((s) => s.power);
  const muted = useDeck((s) => s.muted);
  const input = useDeck((s) => s.input);
  const effect = useDeck((s) => s.effect);
  const level = useDeck((s) => s.level);
  const volume = useDeck((s) => s.volume);
  const trims = useDeck((s) => s.trims);
  const flash = useDeck((s) => s.standbyFlash);

  const headline = !power
    ? "Standby"
    : level
      ? `${LEVEL_META[level].short} ${formatTrim(trims[level])}`
      : INPUT_META[input].label;
  const sub = !power
    ? flash
      ? "Ignored in standby"
      : "Power is off"
    : muted
      ? "Muted"
      : level
        ? "Level trim"
        : EFFECT_META[effect].aria;

  return (
    <div className="power-row">
      <button
        type="button"
        className={power ? "metal-btn live" : "metal-btn"}
        aria-pressed={power}
        aria-label={power ? "Power off, enter standby" : "Power on"}
        data-testid="power"
        onClick={() => {
          hapticTick();
          useDeck.getState().pressPower();
        }}
      >
        <Power size={18} />
        <span>{power ? "On" : "Stby"}</span>
      </button>
      <div className={power ? "status-plate" : "status-plate asleep"} aria-live="polite">
        <strong>{headline}</strong>
        <em>{sub}</em>
        <span className="status-note">{power ? `Master ${volume}` : "Z-5500"}</span>
      </div>
      <button
        type="button"
        className={muted && power ? "metal-btn muted" : "metal-btn"}
        aria-pressed={muted}
        aria-label="Mute"
        data-testid="mute"
        onClick={() => {
          hapticTick();
          useDeck.getState().pressMute();
        }}
      >
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        <span>Mute</span>
      </button>
    </div>
  );
}

function LevelRow() {
  return (
    <section className="zone" aria-label="Channel levels">
      <h2 className="zone-label">Level</h2>
      <div className="levels">
        {LEVELS.map((id) => (
          <LevelControl key={id} id={id} />
        ))}
      </div>
    </section>
  );
}

function LevelControl({ id }: { id: LevelId }) {
  const armed = useDeck((s) => s.level === id);
  const value = useDeck((s) => s.trims[id]);
  const meta = LEVEL_META[id];
  return (
    <div className={armed ? "level armed" : "level"}>
      <button
        type="button"
        className="level-head"
        aria-pressed={armed}
        data-testid={`level-${id}`}
        onClick={() => {
          hapticTick();
          useDeck.getState().selectLevel(id);
        }}
      >
        <b>{meta.short}</b>
        <small>{meta.label}</small>
      </button>
      <Meter value={value} />
      <div className="step-row">
        <HoldButton
          label={`${meta.label} down`}
          testId={`trim-down-${id}`}
          onFire={() => useDeck.getState().nudgeLevel(id, -1)}
        >
          <Minus size={16} />
        </HoldButton>
        <HoldButton
          label={`${meta.label} up`}
          testId={`trim-up-${id}`}
          onFire={() => useDeck.getState().nudgeLevel(id, 1)}
        >
          <Plus size={16} />
        </HoldButton>
      </div>
    </div>
  );
}

function Meter({ value }: { value: number }) {
  const center = TRIM_LIMIT;
  return (
    <div className="meter" aria-hidden="true">
      {Array.from({ length: TRIM_LIMIT * 2 + 1 }, (_, index) => {
        const delta = index - center;
        const lit = delta === 0 || (value > 0 ? delta > 0 && delta <= value : delta < 0 && delta >= value);
        const cls = lit ? "seg lit" : delta === 0 ? "seg zero" : "seg";
        return <span key={index} className={cls} />;
      })}
    </div>
  );
}

function VolumeDial() {
  const volume = useDeck((s) => s.volume);
  const level = useDeck((s) => s.level);
  const trim = useDeck((s) => (s.level ? s.trims[s.level] : s.volume));
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; acc: number } | null>(null);
  const min = level ? -TRIM_LIMIT : 0;
  const max = level ? TRIM_LIMIT : VOLUME_MAX;
  const shown = level ? trim : volume;
  const portion = (shown - min) / (max - min || 1);
  const angle = -140 + portion * 280;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      useDeck.getState().volumeNudge(event.deltaY < 0 ? 1 : -1);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div className="dial-wrap">
      <div
        ref={ref}
        className="dial-stack"
        role="slider"
        tabIndex={0}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={shown}
        aria-label={level ? `${LEVEL_META[level].label} level` : "Master volume"}
        data-testid="volume-dial"
        onPointerDown={(event) => {
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            /* capture is a nice-to-have when the pointer is real */
          }
          drag.current = { y: event.clientY, acc: 0 };
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          drag.current.acc += drag.current.y - event.clientY;
          drag.current.y = event.clientY;
          while (drag.current.acc >= 12) {
            drag.current.acc -= 12;
            hapticTick();
            useDeck.getState().volumeNudge(1);
          }
          while (drag.current.acc <= -12) {
            drag.current.acc += 12;
            hapticTick();
            useDeck.getState().volumeNudge(-1);
          }
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowRight") {
            event.preventDefault();
            hapticTick();
            useDeck.getState().volumeNudge(1);
          }
          if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
            event.preventDefault();
            hapticTick();
            useDeck.getState().volumeNudge(-1);
          }
        }}
      >
        <div className="arc" style={{ ["--p" as string]: String(portion) }} />
        <div className="knob" style={{ ["--angle" as string]: `${angle}deg` }}>
          <div className="knob-face">
            <span className="notch" />
            <div className="readout">
              <strong>{level ? formatTrim(shown) : shown}</strong>
              <em>{level ? LEVEL_META[level].short : "VOL"}</em>
            </div>
          </div>
        </div>
      </div>
      <div className="rocker">
        <HoldButton label="Volume down" testId="volume-down" onFire={() => useDeck.getState().volumeNudge(-1)}>
          <Minus size={18} />
        </HoldButton>
        <p>VOL</p>
        <HoldButton label="Volume up" testId="volume-up" onFire={() => useDeck.getState().volumeNudge(1)}>
          <Plus size={18} />
        </HoldButton>
      </div>
      <p className="master-note">{level ? `Master stays ${volume}` : "Drag the knob or hold + / −"}</p>
    </div>
  );
}

function InputGrid() {
  const current = useDeck((s) => s.input);
  return (
    <section className="zone" aria-label="Input">
      <h2 className="zone-label">Input</h2>
      <div className="key-grid">
        {INPUTS.map((id) => (
          <Key
            key={id}
            on={current === id}
            title={INPUT_META[id].label}
            hint={INPUT_META[id].hint}
            testId={`input-${id}`}
            onClick={() => useDeck.getState().selectInput(id)}
          />
        ))}
      </div>
    </section>
  );
}

function EffectGrid() {
  const current = useDeck((s) => s.effect);
  const direct = useDeck((s) => s.input === "direct");
  return (
    <section className="zone" aria-label="Audio effects">
      <h2 className="zone-label">Effect</h2>
      {direct ? <p className="bypass">Bypassed on 6-Ch Direct</p> : null}
      <div className="key-grid">
        {EFFECTS.map((id) => (
          <EffectKey key={id} id={id} on={current === id} />
        ))}
      </div>
    </section>
  );
}

function EffectKey({ id, on }: { id: EffectId; on: boolean }) {
  const meta = EFFECT_META[id];
  return (
    <Key
      on={on}
      title={meta.label}
      hint={meta.hint}
      ariaLabel={meta.aria}
      testId={`effect-${id}`}
      onClick={() => useDeck.getState().selectEffect(id)}
    />
  );
}

function Key({
  on,
  title,
  hint,
  testId,
  ariaLabel,
  onClick,
}: {
  on: boolean;
  title: string;
  hint: string;
  testId: string;
  ariaLabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={on ? "key on" : "key"}
      aria-pressed={on}
      aria-label={ariaLabel ?? title}
      data-testid={testId}
      onClick={() => {
        hapticTick();
        onClick();
      }}
    >
      <span>
        <b>{title}</b>
        <small>{hint}</small>
      </span>
      <span className="pip" aria-hidden="true" />
    </button>
  );
}

function SignalPane() {
  const blast = useDeck((s) => s.lastBlast);
  const [copied, setCopied] = useState(false);

  const call = blast
    ? `transmit(${blast.carrierHz}, [${blast.pattern.join(", ")}])`
    : "transmit(38000, pattern)";

  return (
    <section className="zone trace" aria-label="Infrared frame">
      <div className="trace-head">
        <h2 className="zone-label">Infrared</h2>
        <p>
          {blast
            ? `${blast.label}  ${blast.hex}  ·  ${blast.pattern.length} pulses`
            : "Waiting for a key"}
        </p>
      </div>
      <Waveform pattern={blast?.pattern ?? null} />
      <p className="pattern">{call}</p>
      <div className="copy-row">
        <button
          type="button"
          className="copy-btn"
          onClick={() => {
            hapticTick();
            const text = blast ? call : "";
            if (!text || !navigator.clipboard) return;
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            });
          }}
        >
          {copied ? "Copied" : "Copy pattern"}
        </button>
        <a className="download" href="/z5500-control-android.zip">
          Android project
        </a>
      </div>
      <ul className="code-list">
        {(Object.keys(COMMANDS) as Array<keyof typeof COMMANDS>).map((id) => (
          <li key={id}>
            <span>{COMMANDS[id].label}</span>
            <code>{formatHex(COMMANDS[id].code)}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Waveform({ pattern }: { pattern: number[] | null }) {
  const width = 640;
  const high = 12;
  const low = 36;
  let d = `M 0 ${low}`;
  if (!pattern || pattern.length === 0) {
    d += ` L ${width} ${low}`;
  } else {
    const total = pattern.reduce((sum, pulse) => sum + pulse, 0) || 1;
    let x = 0;
    for (let index = 0; index < pattern.length; index += 1) {
      const next = x + (pattern[index] / total) * width;
      const y = index % 2 === 0 ? high : low;
      d += ` L ${x.toFixed(1)} ${y} L ${next.toFixed(1)} ${y}`;
      x = next;
    }
  }
  return (
    <svg className="ir-canvas" viewBox={`0 0 ${width} 48`} preserveAspectRatio="none" aria-hidden="true">
      <path className="ir-trace" d={d} />
    </svg>
  );
}

function HoldButton({
  label,
  testId,
  onFire,
  children,
}: {
  label: string;
  testId: string;
  onFire: () => void;
  children: ReactNode;
}) {
  const timer = useRef<number | null>(null);

  const stop = () => {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  };

  return (
    <button
      type="button"
      className={label.startsWith("Volume") ? "rocker-btn" : "step"}
      aria-label={label}
      data-testid={testId}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* capture is a nice-to-have when the pointer is real */
        }
        hapticTick();
        onFire();
        stop();
        timer.current = window.setInterval(onFire, REPEAT_INTERVAL_MS);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
    >
      {children}
    </button>
  );
}

function formatTrim(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}
