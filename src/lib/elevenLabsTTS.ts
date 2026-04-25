import { supabase } from "@/integrations/supabase/client";
import { attachAudio, detachAudio, subscribe, getSpeaking, unlockAudioContext } from "@/lib/audioBus";

export interface ElevenLabsResult {
  audioUrl: string;
  contentType: string;
  requestId: string | null;
}

let currentAudio: HTMLAudioElement | null = null;
let currentRequestId = 0;
let currentAbort: AbortController | null = null;
let playbackUnlockPromise: Promise<void> | null = null;
let unlockedPlaybackAudio: HTMLAudioElement | null = null;

export type SpeakResult = "ok" | "blocked" | "error";

const SILENT_WAV_DATA_URL =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

function configureAudioElement(audio: HTMLAudioElement): HTMLAudioElement {
  audio.crossOrigin = "anonymous";
  audio.preload = "auto";
  (audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
  return audio;
}

/**
 * Always reuse the same <audio> element that was unlocked during the user
 * gesture. iOS Safari ties autoplay permission to the specific element it
 * saw the gesture on — creating a fresh `new Audio()` per chunk reliably
 * throws NotAllowedError on the 2nd+ chunk.
 */
function getPlaybackAudio(url: string): HTMLAudioElement {
  const audio = unlockedPlaybackAudio ?? configureAudioElement(new Audio());
  unlockedPlaybackAudio = audio;
  configureAudioElement(audio);
  audio.muted = false;
  audio.src = url;
  audio.load();
  return audio;
}

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
  context?: { previousText?: string; nextText?: string },
): Promise<ElevenLabsResult> {
  const { data, error } = await supabase.functions.invoke("elevenlabs-tts", {
    body: {
      prompt,
      ...(context?.previousText ? { previousText: context.previousText } : {}),
      ...(context?.nextText ? { nextText: context.nextText } : {}),
    },
  });

  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  // Structured validation error from the edge function
  if (data && typeof data === "object" && "error" in data && !data.audioUrl) {
    const code = (data as { code?: string }).code;
    const errMsg = (data as { error?: string }).error ?? "ElevenLabs error";
    const actions = (data as { nextActions?: string[] }).nextActions;
    const voiceId = (data as { voiceId?: string }).voiceId;

    let friendly = errMsg;
    if (code === "VOICE_NOT_FOUND") {
      friendly = `Voice "${voiceId}" isn't available on the ElevenLabs account tied to your API key.`;
    } else if (code === "INVALID_API_KEY") {
      friendly = "Your ElevenLabs API key is invalid or unauthorized.";
    }
    if (actions?.length) {
      friendly += `\n\nNext steps:\n• ${actions.join("\n• ")}`;
    }

    const e = new Error(friendly);
    (e as Error & { code?: string }).code = code;
    throw e;
  }

  if (error) {
    throw new Error(error.message ?? "Failed to call ElevenLabs function");
  }
  if (!data?.audioUrl) {
    throw new Error("No audio URL returned from ElevenLabs");
  }
  return data as ElevenLabsResult;
}

/**
 * Split long text into TTS-friendly chunks at sentence boundaries.
 * Targets ~600 chars/chunk so the first chunk plays back fast, while still
 * keeping segments large enough for natural prosody.
 */
function chunkTextForTTS(text: string, target = 600, max = 2500): string[] {
  if (text.length <= max) return [text];
  // Split at sentence enders, keep the punctuation.
  const sentences = text.match(/[^.!?…]+[.!?…]+(\s+|$)|[^.!?…]+$/g) ?? [text];
  const chunks: string[] = [];
  let buf = "";
  for (const s of sentences) {
    const sentence = s.trim();
    if (!sentence) continue;
    if (buf.length === 0) {
      buf = sentence;
    } else if (buf.length + 1 + sentence.length <= target) {
      buf += " " + sentence;
    } else {
      chunks.push(buf);
      buf = sentence;
    }
    // Hard cap a single chunk if a sentence itself is huge
    if (buf.length >= max) {
      chunks.push(buf.slice(0, max));
      buf = buf.slice(max);
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
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

export async function unlockElevenLabsPlayback(): Promise<void> {
  if (typeof window === "undefined") return;
  if (playbackUnlockPromise) return playbackUnlockPromise;

  playbackUnlockPromise = (async () => {
    // Resume the WebAudio context during this user gesture so iOS/Safari
    // doesn't drop the first TTS reply into a suspended audio graph.
    await unlockAudioContext();
    try {
      const audio = configureAudioElement(new Audio(SILENT_WAV_DATA_URL));
      audio.muted = true;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
      audio.removeAttribute("src");
      audio.load();
      unlockedPlaybackAudio = audio;
    } catch {
      unlockedPlaybackAudio = configureAudioElement(new Audio());
    }
  })();

  return playbackUnlockPromise;
}

export async function speakWithElevenLabs(text: string): Promise<SpeakResult> {
  const clean = stripForSpeech(text);
  if (!clean) return "error";

  stopElevenLabs();
  const reqId = ++currentRequestId;
  const abort = new AbortController();
  currentAbort = abort;

  // Synchronously prepare the playback element inside the caller's user
  // gesture so iOS keeps the autoplay permission alive across the awaits
  // below. (See SpeechSynthesis/HTMLMediaElement gesture-binding pattern.)
  if (!unlockedPlaybackAudio) {
    unlockedPlaybackAudio = configureAudioElement(new Audio());
  }

  const chunks = chunkTextForTTS(clean);

  const fetchChunk = async (i: number): Promise<string | null> => {
    try {
      const res = await generateElevenLabsAudio(
        chunks[i],
        abort.signal,
        {
          previousText: i > 0 ? chunks[i - 1].slice(-400) : undefined,
          nextText: i < chunks.length - 1 ? chunks[i + 1].slice(0, 400) : undefined,
        },
      );
      return res.audioUrl;
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return null;
      console.warn(`[elevenlabs] chunk ${i} failed:`, err);
      return null;
    }
  };

  let blockedByBrowser = false;

  try {
    const chunkRequests: Promise<string | null>[] = chunks.map((_, i) => fetchChunk(i));

    const firstUrl = await chunkRequests[0];
    if (!firstUrl) return "error";
    if (reqId !== currentRequestId || abort.signal.aborted) return "error";

    // Sequential playback — always reuse the same unlocked element
    for (let i = 0; i < chunks.length; i++) {
      const url = i === 0 ? firstUrl : await chunkRequests[i];
      if (reqId !== currentRequestId || abort.signal.aborted) return "error";
      if (!url) return i > 0 ? "ok" : "error";

      const audio = getPlaybackAudio(url);

      const onAbort = () => {
        try {
          audio.pause();
        } catch {
          /* noop */
        }
        detachAudio(audio);
      };
      abort.signal.addEventListener("abort", onAbort, { once: true });

      currentAudio = audio;
      attachAudio(audio);
      try {
        await audio.play();
      } catch (err) {
        detachAudio(audio);
        const name = (err as { name?: string })?.name;
        if (name === "AbortError") return i > 0 ? "ok" : "error";
        if (name === "NotAllowedError") {
          // Browser blocked autoplay (gesture lost) — caller should silently
          // surface a "tap to play" hint, not a generic error.
          console.info("[elevenlabs] playback blocked by browser autoplay policy");
          blockedByBrowser = true;
          return i > 0 ? "ok" : "blocked";
        }
        console.warn("[elevenlabs] audio.play() rejected:", err);
        return i > 0 ? "ok" : "error";
      }
      if (reqId !== currentRequestId || abort.signal.aborted) {
        onAbort();
        return "error";
      }

      // Wait for this chunk to finish before starting the next
      await new Promise<void>((resolve) => {
        const done = () => {
          audio.removeEventListener("ended", done);
          audio.removeEventListener("error", done);
          resolve();
        };
        audio.addEventListener("ended", done, { once: true });
        audio.addEventListener("error", done, { once: true });
        abort.signal.addEventListener("abort", done, { once: true });
      });
      detachAudio(audio);
      if (reqId !== currentRequestId || abort.signal.aborted) return "error";
    }

    return "ok";
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") return "error";
    console.warn("[elevenlabs] playback failed:", err);
    if (currentRequestId === reqId) currentAudio = null;
    return blockedByBrowser ? "blocked" : "error";
  } finally {
    if (currentAbort === abort) currentAbort = null;
  }
}
