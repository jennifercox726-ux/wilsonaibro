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

export async function speakWithElevenLabs(text: string): Promise<boolean> {
  const clean = stripForSpeech(text);
  if (!clean) return false;

  stopElevenLabs();
  const reqId = ++currentRequestId;
  const abort = new AbortController();
  currentAbort = abort;

  const chunks = chunkTextForTTS(clean);
  // Pre-fetch the first chunk so playback starts ASAP, then stream the rest.
  const audioUrls: (string | null)[] = new Array(chunks.length).fill(null);

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

  try {
    audioUrls[0] = await fetchChunk(0);
    if (!audioUrls[0]) return false;
    if (reqId !== currentRequestId || abort.signal.aborted) return false;

    // Kick off remaining chunks in parallel (but cap concurrency to 2)
    (async () => {
      for (let i = 1; i < chunks.length; i++) {
        if (reqId !== currentRequestId || abort.signal.aborted) break;
        audioUrls[i] = await fetchChunk(i);
      }
    })();

    // Sequential playback
    for (let i = 0; i < chunks.length; i++) {
      // Wait for this chunk's URL to be ready
      while (audioUrls[i] === null) {
        if (reqId !== currentRequestId || abort.signal.aborted) return false;
        await new Promise((r) => setTimeout(r, 80));
      }
      const url = audioUrls[i];
      if (!url) return i > 0; // partial success if anything played

      const audio = new Audio(url);
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
      try {
        await audio.play();
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return i > 0;
        throw err;
      }
      if (reqId !== currentRequestId || abort.signal.aborted) {
        onAbort();
        return false;
      }
      attachAudio(audio);

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
      if (reqId !== currentRequestId || abort.signal.aborted) return false;
    }

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
