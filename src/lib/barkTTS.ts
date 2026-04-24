import { supabase } from "@/integrations/supabase/client";
import { attachAudio, detachAudio, subscribe, getSpeaking } from "@/lib/audioBus";

export interface BarkResult {
  audioUrl: string;
  contentType: string;
  requestId: string | null;
}

let currentAudio: HTMLAudioElement | null = null;
let currentRequestId = 0;

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

export async function generateBarkAudio(prompt: string): Promise<BarkResult> {
  const { data, error } = await supabase.functions.invoke("bark-tts", {
    body: { prompt },
  });

  if (error) {
    throw new Error(error.message ?? "Failed to call Bark function");
  }
  if (!data?.audioUrl) {
    throw new Error("No audio URL returned from Bark");
  }
  return data as BarkResult;
}

export function stopBark(): void {
  currentRequestId++;
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.src = "";
    } catch {
      /* noop */
    }
    detachAudio(currentAudio);
    currentAudio = null;
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

  try {
    const { audioUrl } = await generateBarkAudio(clean.slice(0, 600));
    if (reqId !== currentRequestId) return false;

    const audio = new Audio(audioUrl);
    audio.crossOrigin = "anonymous";
    audio.preload = "auto";
    currentAudio = audio;

    await audio.play();
    attachAudio(audio);
    return true;
  } catch (err) {
    console.warn("[bark] playback failed:", err);
    currentAudio = null;
    return false;
  }
}
