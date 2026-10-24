/** NEC timings used by ConsumerIrManager.transmit, in microseconds. */
export const CARRIER_HZ = 38_000;
export const REPEAT_INTERVAL_MS = 110;

const HDR_MARK = 9000;
const HDR_SPACE = 4500;
const BIT_MARK = 560;
const ONE_SPACE = 1690;
const ZERO_SPACE = 560;

export const COMMANDS = {
  power: { label: "Power / Standby", code: 0x10ef58a7 },
  volumeUp: { label: "Volume Up", code: 0x10ef708f },
  volumeDown: { label: "Volume Down", code: 0x10efb04f },
  mute: { label: "Mute", code: 0x10ef30cf },
  input: { label: "Input Cycle", code: 0x10ef20df },
  effect: { label: "Effect Cycle", code: 0x10ef609f },
  level: { label: "Level Cycle", code: 0x10efa05f },
} as const;

export type CommandId = keyof typeof COMMANDS;

/**
 * Build the alternating mark/space array for a 32-bit NEC frame.
 * The hex is stored as addr, ~addr, cmd, ~cmd. Each byte goes out LSB first.
 * The array starts on a mark and ends on the stop mark — the shape
 * `transmit(38000, pattern)` expects.
 */
export function necFrame(code: number): number[] {
  const pattern: number[] = [HDR_MARK, HDR_SPACE];
  for (const shift of [24, 16, 8, 0]) {
    let byte = (code >>> shift) & 0xff;
    for (let bit = 0; bit < 8; bit += 1) {
      pattern.push(BIT_MARK);
      pattern.push((byte & 1) === 1 ? ONE_SPACE : ZERO_SPACE);
      byte >>>= 1;
    }
  }
  pattern.push(BIT_MARK);
  return pattern;
}

export function formatHex(code: number): string {
  return `0x${(code >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
}

export function durationUs(pattern: readonly number[]): number {
  return pattern.reduce((sum, pulse) => sum + pulse, 0);
}

/** True when command and address bytes are the NEC complements. */
export function isValidNec(code: number): boolean {
  const addr = (code >>> 24) & 0xff;
  const addrInv = (code >>> 16) & 0xff;
  const cmd = (code >>> 8) & 0xff;
  const cmdInv = code & 0xff;
  return (addr ^ addrInv) === 0xff && (cmd ^ cmdInv) === 0xff;
}
