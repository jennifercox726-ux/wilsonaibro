// Lightweight audio bus: lets any component subscribe to whether Wilson is
// currently speaking AND the live amplitude of the playing audio (0..1).
// The TTS layer pushes the active <audio> element here; consumers read.

type Listener = () => void;

let activeAudio: HTMLAudioElement | null = null;
let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let dataArray: Uint8Array | null = null;
let rafId: number | null = null;

let speaking = false;
let amplitude = 0; // smoothed RMS, 0..1

const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

function ensureContext() {
  if (audioCtx) return audioCtx;
  const Ctor =
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  audioCtx = new Ctor();
  return audioCtx;
}

function tick() {
  if (!analyser || !dataArray) {
    rafId = null;
    return;
  }
  // Use the existing buffer length to avoid TS DOM lib mismatches between
  // AnalyserNode#getByteTimeDomainData(Uint8Array) and Uint8Array<ArrayBuffer>.
  // Cast to satisfy stricter TS DOM lib typings (Uint8Array<ArrayBuffer>).
  analyser.getByteTimeDomainData(dataArray as unknown as Uint8Array<ArrayBuffer>);
  let sumSq = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const v = (dataArray[i] - 128) / 128;
    sumSq += v * v;
  }
  const rms = Math.sqrt(sumSq / dataArray.length);
  // Smooth + boost so subtle speech still moves the orb visibly
  const target = Math.min(1, rms * 3.2);
  amplitude = amplitude * 0.7 + target * 0.3;
  emit();
  rafId = requestAnimationFrame(tick);
}

function startLoop() {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(tick);
}

function stopLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  amplitude = 0;
  emit();
}

export function attachAudio(audio: HTMLAudioElement): void {
  // Detach previous if it's a different element
  if (activeAudio && activeAudio !== audio) {
    detachAudio(activeAudio);
  }
  activeAudio = audio;

  const ctx = ensureContext();
  if (!ctx) {
    // No WebAudio — still emit speaking state, just no amplitude
    speaking = true;
    emit();
    // Detach when playback actually ends or errors. Do NOT listen for "pause" —
    // browsers fire pause events during normal buffering/seeking and that would
    // silently kill playback.
    const handleEnd = () => detachAudio(audio);
    audio.addEventListener("ended", handleEnd, { once: true });
    audio.addEventListener("error", handleEnd, { once: true });
    return;
  }

  // Resume the AudioContext synchronously-ish. If the context is suspended
  // (iOS/Safari autoplay), routing the <audio> through a MediaElementSource
  // BEFORE resume = silent playback. Kick off resume but don't block: we still
  // want to wire up the graph immediately so analyser data is correct.
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  try {
    // Each <audio> element can only have ONE MediaElementSource for the
    // lifetime of the AudioContext. Re-use if already created.
    const tagged = audio as HTMLAudioElement & { __wilsonSource?: MediaElementAudioSourceNode };
    if (!tagged.__wilsonSource) {
      tagged.__wilsonSource = ctx.createMediaElementSource(audio);
    }
    sourceNode = tagged.__wilsonSource;

    if (!analyser) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      dataArray = new Uint8Array(analyser.fftSize);
    }

    sourceNode.disconnect();
    sourceNode.connect(analyser);
    analyser.connect(ctx.destination);
  } catch (err) {
    console.warn("[audioBus] WebAudio wiring failed:", err);
    // If WebAudio wiring fails, the <audio> element still plays through the
    // default output on its own — don't block speaking state.
  }

  speaking = true;
  emit();
  startLoop();

  // Only detach on real end-of-playback or error. "pause" fires during normal
  // buffering and would prematurely kill audio.
  const handleEnd = () => detachAudio(audio);
  audio.addEventListener("ended", handleEnd, { once: true });
  audio.addEventListener("error", handleEnd, { once: true });
}

export function detachAudio(audio?: HTMLAudioElement): void {
  if (audio && activeAudio !== audio) return;
  activeAudio = null;
  speaking = false;
  stopLoop();
}

export function getSpeaking(): boolean {
  return speaking;
}
export function getAmplitude(): number {
  return amplitude;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
