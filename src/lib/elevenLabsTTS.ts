import { supabase } from "@/integrations/supabase/client";
import { attachAudio, detachAudio, subscribe, getSpeaking } from "@/lib/audioBus";

export interface ElevenLabsResult {
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

export async function generateElevenLabsAudio(
  prompt: string,
  signal?: AbortSignal,
): Promise<ElevenLabsResult> {
  const { data, error } = await supabase.functions.invoke("elevenlabs-tts", {
    body: { prompt },
  });

  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  if (error) {
    throw new Error(error.message ?? "Failed to call ElevenLabs function");
  }
  if (!data?.audioUrl) {
    throw new Error("No audio URL returned from ElevenLabs");
  }
  return data as ElevenLabsResult;
}

export function stopElevenLabs(): void {
  currentRequestId++;

  if (currentAbort) {
    try {
      currentAbort.abort();
    } catch {
      /* noop */
    }
    currentAbort = null;
  }

  if (currentAudio) {
    const audio = currentAudio;
    currentAudio = null;
    try {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    } catch {
      /* noop */
    }
    detachAudio(audio);
  }
}

export function isElevenLabsSpeaking(): boolean {
  return getSpeaking();
}

export function subscribeToElevenLabs(listener: () => void): () => void {
  return subscribe(listener);
}

export async function speakWithElevenLabs(text: string): Promise<boolean> {
  const clean = stripForSpeech(text);
  if (!clean) return false;

  stopElevenLabs();
  const reqId = ++currentRequestId;
  const abort = new AbortController();
  currentAbort = abort;

  try {
    const { audioUrl } = await generateElevenLabsAudio(
      clean.slice(0, 600),
      abort.signal,
    );

    if (reqId !== currentRequestId || abort.signal.aborted) {
      return false;
    }

    const audio = new Audio(audioUrl);
    audio.crossOrigin = "anonymous";
    audio.preload = "auto";

    const onAbort = () => {
      try {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      } catch {
        /* noop */
      }
      detachAudio(audio);
    };
    abort.signal.addEventListener("abort", onAbort, { once: true });

    currentAudio = audio;
    await audio.play();

    if (reqId !== currentRequestId || abort.signal.aborted) {
      onAbort();
      return false;
    }

    attachAudio(audio);
    return true;
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") return false;
    console.warn("[elevenlabs] playback failed:", err);
    if (currentRequestId === reqId) currentAudio = null;
    return false;
  } finally {
    if (currentAbort === abort) currentAbort = null;
  }
}
