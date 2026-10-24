type IrBridge = {
  hasIrEmitter?: () => boolean;
  transmit?: (carrierFrequency: number, pattern: number[]) => void;
};

function bridge(): IrBridge | null {
  if (typeof window === "undefined") return null;
  const host = window as Window & { AndroidConsumerIr?: IrBridge };
  return host.AndroidConsumerIr ?? null;
}

/** Mirrors ConsumerIrManager.hasIrEmitter(). Always false in a normal browser. */
export function hasIrEmitter(): boolean {
  try {
    return bridge()?.hasIrEmitter?.() === true;
  } catch {
    return false;
  }
}

/** Mirrors ConsumerIrManager.transmit. Returns false when nothing was emitted. */
export function transmitIr(carrierFrequency: number, pattern: number[]): boolean {
  const ir = bridge();
  if (!ir?.hasIrEmitter?.() || !ir.transmit) return false;
  try {
    ir.transmit(carrierFrequency, pattern);
    return true;
  } catch {
    return false;
  }
}

export function hapticTick(): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(12);
    }
  } catch {
    /* some browsers throw if vibration is blocked */
  }
}
