/**
 * clickSound — generates a tiny mechanical click via Web Audio API.
 * No external files needed. Works on mobile (requires user gesture context).
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx || ctx.state === "closed") {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Play a short mechanical click sound.
 * volume: 0–1 (default 0.18 — subtle, not intrusive)
 */
export function playClick(volume = 0.18): void {
  try {
    const ac = getCtx();
    if (!ac) return;

    const now = ac.currentTime;

    // Short filtered noise burst — gives a clean "tick" feel
    const buf = ac.createBuffer(1, ac.sampleRate * 0.03, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.004));
    }

    const src = ac.createBufferSource();
    src.buffer = buf;

    // High-pass filter: remove low rumble, keep the crisp click frequency
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2200;
    hp.Q.value = 0.8;

    const gain = ac.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);

    src.connect(hp);
    hp.connect(gain);
    gain.connect(ac.destination);
    src.start(now);
    src.stop(now + 0.03);
  } catch {
    // Silently ignore — sound is non-critical
  }
}

/**
 * Attach a global click listener to all button presses.
 * Call once on app mount.
 */
export function initGlobalClickSound(): void {
  if (typeof window === "undefined") return;
  document.addEventListener("pointerdown", (e) => {
    const el = e.target as HTMLElement;
    if (el.closest("button") || el.tagName === "BUTTON") {
      playClick();
    }
  }, { passive: true });
}
