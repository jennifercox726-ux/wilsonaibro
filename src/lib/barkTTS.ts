import { supabase } from "@/integrations/supabase/client";
import { attachAudio, detachAudio, subscribe, getSpeaking } from "@/lib/audioBus";

export interface BarkResult {
  audioUrl: string;
  contentType: string;
  requestId: string | null;
}

let currentAudio: HTMLAudioElement | null = null;
let currentRequestId = 0;
let currentAbort: AbortController | null = null;

function stripForSpeech(text: string): string {
  return text
    .replace(/\[VIBE:\s*\w+\]/gi, "")
    .replace(/\[DREAM_UPDATE:\s*[^\]]+\]/gi, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .trim();
}

export async function generateBarkAudio(
  prompt: string,
  signal?: AbortSignal,
): Promise<BarkResult> {
  const { data, error } = await supabase.functions.invoke("bark-tts", {
    body: { prompt },
  });

  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  if (error) {
    throw new Error(error.message ?? "Failed to call Bark function");
  }
  if (!data?.audioUrl) {
    throw new Error("No audio URL returned from Bark");
  }
  return data as BarkResult;
}

/**
 * Hard-stop: aborts any in-flight fal.ai request AND tears down playback
 * synchronously so the UI feels instant.
 */
export function stopBark(): void {
  currentRequestId++;

  if (currentAbort) {
    try { currentAbort.abort(); } catch { /* noop */ }
    currentAbort = null;
  }

  if (currentAudio) {
    const audio = currentAudio;
    currentAudio = null;
    try {
      audio.pause();
      audio.removeAttribute("src");
      audio.load(); // forces the media element to release the network/decoder
    } catch {
      /* noop */
    }
    detachAudio(audio);
  }
}

export function isBarkSpeaking(): boolean {
  return getSpeaking();
}

export function subscribeToBark(listener: () => void): () => void {
  return subscribe(listener);
}

/**
 * Generate speech with Bark and play it through the audio bus.
 * Cancels any prior in-flight generation/playback.
 */
export async function speakWithBark(text: string): Promise<boolean> {
  const clean = stripForSpeech(text);
  if (!clean) return false;

  stopBark();
  const reqId = ++currentRequestId;
  const abort = new AbortController();
  currentAbort = abort;

  try {
    const { audioUrl } = await generateBarkAudio(
      clean.slice(0, 600),
      abort.signal,
    );

    // If a newer call superseded us OR caller aborted, bail out before playback.
    if (reqId !== currentRequestId || abort.signal.aborted) {
      return false;
    }

    const audio = new Audio(audioUrl);
    audio.crossOrigin = "anonymous";
    audio.preload = "auto";

    // Wire abort to instantly tear down even mid-play
    const onAbort = () => {
      try {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      } catch { /* noop */ }
      detachAudio(audio);
    };
    abort.signal.addEventListener("abort", onAbort, { once: true });

    currentAudio = audio;
    await audio.play();

    // Final guard: state may have changed during the await
    if (reqId !== currentRequestId || abort.signal.aborted) {
      onAbort();
      return false;
    }

    attachAudio(audio);
    return true;
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") return false;
    console.warn("[bark] playback failed:", err);
    if (currentRequestId === reqId) currentAudio = null;
    return false;
  } finally {
    if (currentAbort === abort) currentAbort = null;
  }
}
