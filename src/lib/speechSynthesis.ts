// Wilson TTS — 3-tier fallback: ElevenLabs → Google Cloud TTS → Browser voice

const ELEVENLABS_TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`;
const GOOGLE_TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-tts`;

let currentAudio: HTMLAudioElement | null = null;
let currentAudioUrl: string | null = null;
let playbackAudio: HTMLAudioElement | null = null;
let ttsUnlocked = false;
let htmlAudioUnlocked = false;
let playbackSessionId = 0;

const TTS_RETRY_COOLDOWN_MS = 30_000;
const PREMIUM_TTS_MAX_CHARS = 1200;
const BROWSER_FALLBACK_MAX_CHARS = 3000;
const SILENT_AUDIO_DATA_URL = "data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

const providerState = {
  elevenLabsRetryAt: 0,
  googleRetryAt: 0,
};

type CloudTTSResult = "played" | "provider-unavailable" | "playback-failed";

function getPlaybackAudio(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;

  if (!playbackAudio) {
    playbackAudio = new Audio();
    playbackAudio.preload = "auto";
    playbackAudio.setAttribute("playsinline", "true");
  }

  return playbackAudio;
}

function revokeCurrentAudioUrl(): void {
  if (!currentAudioUrl) return;
  URL.revokeObjectURL(currentAudioUrl);
  currentAudioUrl = null;
}

function revokeAudioUrl(audioUrl: string | null): void {
  if (!audioUrl) return;
  URL.revokeObjectURL(audioUrl);
  if (currentAudioUrl === audioUrl) {
    currentAudioUrl = null;
  }
}

function resetAudioElement(audio: HTMLAudioElement | null): void {
  if (!audio) return;
  audio.onended = null;
  audio.onerror = null;
  audio.pause();
  audio.currentTime = 0;
  audio.removeAttribute("src");
  audio.load();
}

function finalizePlayback(audio: HTMLAudioElement | null, audioUrl: string, sessionId: number): void {
  if (audio) {
    audio.onended = null;
    audio.onerror = null;
  }

  if (sessionId === playbackSessionId && currentAudio === audio) {
    currentAudio = null;
  }

  revokeAudioUrl(audioUrl);
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
    .replace(/[\u{200D}]/gu, "")
    .replace(/[\uD800-\uDFFF]/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .trim();
}

function chunkText(text: string, maxLen = 180): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  const sentences = text.match(/[^.!?]+[.!?]+[\s]*/g) || [text];
  let current = "";
  for (const sentence of sentences) {
    if (current.length + sentence.length > maxLen && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  if (chunks.length === 0) chunks.push(text.slice(0, maxLen));
  return chunks;
}

function limitPremiumText(text: string, maxLen = PREMIUM_TTS_MAX_CHARS): string {
  if (text.length <= maxLen) return text;

  const clipped = text.slice(0, maxLen);
  const lastSentenceBreak = Math.max(
    clipped.lastIndexOf("."),
    clipped.lastIndexOf("!"),
    clipped.lastIndexOf("?")
  );

  if (lastSentenceBreak >= Math.floor(maxLen * 0.55)) {
    return clipped.slice(0, lastSentenceBreak + 1).trim();
  }

  const lastSpace = clipped.lastIndexOf(" ");
  if (lastSpace >= Math.floor(maxLen * 0.7)) {
    return `${clipped.slice(0, lastSpace).trim()}...`;
  }

  return `${clipped.trim()}...`;
}

async function playAudioBlob(audioBlob: Blob): Promise<void> {
  const audioUrl = URL.createObjectURL(audioBlob);
  const sessionId = ++playbackSessionId;
  revokeCurrentAudioUrl();
  currentAudioUrl = audioUrl;

  const primaryAudio = getPlaybackAudio();
  const bindPlaybackLifecycle = (audio: HTMLAudioElement) => {
    audio.onended = () => finalizePlayback(audio, audioUrl, sessionId);
    audio.onerror = () => finalizePlayback(audio, audioUrl, sessionId);
  };

  const primaryPlayback = async () => {
    if (!primaryAudio) throw new Error("HTML audio playback is not available");

    resetAudioElement(primaryAudio);
    primaryAudio.src = audioUrl;
    primaryAudio.volume = 1;
    currentAudio = primaryAudio;
    bindPlaybackLifecycle(primaryAudio);

    await primaryAudio.play();
  };

  try {
    await primaryPlayback();
    return;
  } catch (primaryError) {
    if (primaryAudio) {
      primaryAudio.onended = null;
      primaryAudio.onerror = null;
    }
    if (currentAudio === primaryAudio) {
      currentAudio = null;
    }
    console.warn("[Wilson TTS] Persistent audio playback failed, retrying with fresh Audio:", primaryError);
  }

  const fallbackAudio = new Audio(audioUrl);
  fallbackAudio.preload = "auto";
  fallbackAudio.setAttribute("playsinline", "true");
  bindPlaybackLifecycle(fallbackAudio);

  currentAudio = fallbackAudio;
  try {
    await fallbackAudio.play();
  } catch (fallbackError) {
    finalizePlayback(fallbackAudio, audioUrl, sessionId);
    throw fallbackError;
  }
}

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  const preferredNames = [
    "Daniel", "Aaron", "Google UK English Male", "Microsoft Guy Online",
    "Microsoft Ryan Online", "Google US English", "Rishi", "Tom", "Alex",
  ];
  for (const name of preferredNames) {
    const match = voices.find((v) => v.name.includes(name) && v.lang.startsWith("en"));
    if (match) return match;
  }
  return (
    voices.find((v) => v.lang.startsWith("en-") && !v.name.toLowerCase().includes("female")) ||
    voices.find((v) => v.lang.startsWith("en")) ||
    voices[0]
  );
}

function unlockHtmlAudio(): void {
  const audio = getPlaybackAudio();
  if (!audio || htmlAudioUnlocked) return;

  audio.src = SILENT_AUDIO_DATA_URL;
  audio.volume = 0.01;

  const playAttempt = audio.play();

  const resetUnlockedAudio = () => {
    audio.pause();
    audio.currentTime = 0;
    audio.removeAttribute("src");
    audio.load();
    audio.volume = 1;
  };

  if (playAttempt && typeof playAttempt.then === "function") {
    playAttempt
      .then(() => {
        resetUnlockedAudio();
        htmlAudioUnlocked = true;
        console.log("[Wilson TTS] HTML audio unlocked via gesture");
      })
      .catch((error) => {
        htmlAudioUnlocked = false;
        console.warn("[Wilson TTS] HTML audio unlock failed:", error);
      });
    return;
  }

  resetUnlockedAudio();
  htmlAudioUnlocked = true;
}

export function unlockTTS(): void {
  unlockHtmlAudio();
  if (!window.speechSynthesis) return;
  if (ttsUnlocked) return;
  const silent = new SpeechSynthesisUtterance(" ");
  silent.volume = 0.01;
  silent.rate = 10;
  window.speechSynthesis.getVoices();
  window.speechSynthesis.speak(silent);
  ttsUnlocked = true;
  console.log("[Wilson TTS] Speech engine unlocked via gesture");
}

function speakWithBrowser(text: string): void {
  if (!window.speechSynthesis) {
    console.warn("[Wilson TTS] No browser speechSynthesis available");
    return;
  }
  window.speechSynthesis.cancel();
  const voice = pickVoice();
  console.log("[Wilson TTS] Browser voice:", voice?.name || "none");
  const trimmed = text.length > 800 ? text.slice(0, 800).replace(/[^.!?]*$/, "") + "..." : text;
  const chunks = chunkText(trimmed);
  for (let i = 0; i < chunks.length; i++) {
    const utterance = new SpeechSynthesisUtterance(chunks[i]);
    utterance.rate = 0.95;
    utterance.pitch = 0.9;
    utterance.volume = 1.0;
    utterance.lang = "en-GB";
    if (voice) utterance.voice = voice;
    utterance.onerror = (e) => console.error("[Wilson TTS] Chunk", i, "error:", e.error);
    window.speechSynthesis.speak(utterance);
  }
}

/** Try to play audio from a TTS endpoint. Returns true on success. */
async function tryCloudTTS(url: string, text: string, label: string): Promise<CloudTTSResult> {
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.warn(`[Wilson TTS] ${label} request failed:`, err);
    return "provider-unavailable";
  }

  const contentType = response.headers.get("Content-Type") || "";

  if (contentType.includes("application/json")) {
    try {
      const json = await response.json();
      if (json?.fallback) {
        console.warn(`[Wilson TTS] ${label} unavailable, falling back`);
        return "provider-unavailable";
      }
      console.warn(`[Wilson TTS] ${label} returned JSON instead of audio:`, json);
      return "provider-unavailable";
    } catch (err) {
      console.warn(`[Wilson TTS] ${label} returned unreadable JSON:`, err);
      return "provider-unavailable";
    }
  }

  if (!response.ok) {
    console.warn(`[Wilson TTS] ${label} failed: ${response.status}`);
    return "provider-unavailable";
  }

  try {
    const audioBlob = await response.blob();
    if (!audioBlob.type.includes("audio") && audioBlob.size < 100) {
      console.warn(`[Wilson TTS] Invalid audio from ${label}`);
      return "provider-unavailable";
    }

    await playAudioBlob(audioBlob);
    console.log(`[Wilson TTS] Playing via ${label}`);
    return "played";
  } catch (err) {
    console.warn(`[Wilson TTS] ${label} playback failed:`, err);
    return "playback-failed";
  }
}

function shouldTryProvider(retryAt: number): boolean {
  return Date.now() >= retryAt;
}

function markProviderFailure(label: "ElevenLabs" | "Google TTS"): void {
  const retryAt = Date.now() + TTS_RETRY_COOLDOWN_MS;

  if (label === "ElevenLabs") {
    providerState.elevenLabsRetryAt = retryAt;
  } else {
    providerState.googleRetryAt = retryAt;
  }
}

function markProviderSuccess(label: "ElevenLabs" | "Google TTS"): void {
  if (label === "ElevenLabs") {
    providerState.elevenLabsRetryAt = 0;
  } else {
    providerState.googleRetryAt = 0;
  }
}

export async function speakText(text: string): Promise<void> {
  stopSpeaking();
  const clean = stripMarkdown(text);
  if (!clean) return;
  const premiumText = limitPremiumText(clean);
  let playbackFailed = false;

  // Tier 1: ElevenLabs (premium)
  if (shouldTryProvider(providerState.elevenLabsRetryAt)) {
    const result = await tryCloudTTS(ELEVENLABS_TTS_URL, premiumText, "ElevenLabs");
    if (result === "played") {
      markProviderSuccess("ElevenLabs");
      return;
    }

    if (result === "playback-failed") {
      markProviderSuccess("ElevenLabs");
      playbackFailed = true;
    } else {
      markProviderFailure("ElevenLabs");
    }
  }

  // Tier 2: Google Cloud TTS (free tier, natural WaveNet voice)
  if (!playbackFailed && shouldTryProvider(providerState.googleRetryAt)) {
    const result = await tryCloudTTS(GOOGLE_TTS_URL, premiumText, "Google TTS");
    if (result === "played") {
      markProviderSuccess("Google TTS");
      return;
    }

    if (result === "playback-failed") {
      markProviderSuccess("Google TTS");
      playbackFailed = true;
    } else {
      markProviderFailure("Google TTS");
    }
  }

  if (playbackFailed) {
    console.warn("[Wilson TTS] Premium audio was generated but playback failed; skipping robotic browser fallback");
    return;
  }

  // Tier 3: Browser voice (last resort)
  console.log("[Wilson TTS] Using browser voice (last resort)");
  speakWithBrowser(clean.slice(0, BROWSER_FALLBACK_MAX_CHARS));
}

export function stopSpeaking(): void {
  playbackSessionId += 1;
  const activeAudio = currentAudio;
  if (activeAudio && activeAudio !== playbackAudio) {
    resetAudioElement(activeAudio);
  }
  resetAudioElement(getPlaybackAudio());
  currentAudio = null;
  revokeCurrentAudioUrl();
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

export function isSpeaking(): boolean {
  const audio = currentAudio ?? playbackAudio;
  if (audio && !audio.paused && !audio.ended) return true;
  if (window.speechSynthesis?.speaking) return true;
  return false;
}
